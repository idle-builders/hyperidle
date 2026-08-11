/**
 * @lore AU19 Increment 3b: moved from
 * `packages/server/src/services/__tests__/agent-session-requests.test.ts` —
 * this test only needs `{ db }` (no `{ app }`), so it moves into the owning
 * package's own `src/__tests__/` and switches its fixture import from
 * `packages/server`'s `{ db, app, eventBus }` fixture to
 * `@hyperidle/db/test-fixtures`'s `{ db }`-only fixture, same precedent as
 * `@hyperidle/org`'s `org-edges.integration.test.ts` (Increment 1c). Renamed
 * `.test.ts` → `.integration.test.ts` to match the DB-fixture test-naming
 * convention every other migrated package's DB-touching test follows.
 *
 * `markRequestRunning` now takes a `MarkRequestRunningDeps` param (the
 * `SessionRequestsTriggerHistoryWriter` port, §11/`ports.ts`) — this test
 * supplies a no-op fake (it asserts on `agent_session_requests`'
 * status/session-id transition only, never on `trigger_resolution_history`,
 * which this test never seeds a row for).
 */

import {
	agentLifecycleInbox,
	agentSessionRequests,
	agentWorkIntents,
	bets,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import type { HarnessAdapter, SessionHandle } from "@hyperidle/harness-protocol";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import {
	claimSessionRequest,
	createSessionRequest,
	type DurableAgentQueueDeps,
	drainIntents,
	enqueueWorkIntent,
	findSessionRequest,
	listSessionRequests,
	releaseClaim,
	renewClaim,
	sessionRunRegistry,
	transitionSessionRequest,
} from "../index.js";

async function createAssistantRequest(db: HyperIdleDb, suffix: string, payloadJson?: string) {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: `agent-${suffix}`,
			kind: "ai",
			name: "Agent",
			role: "assistant",
			status: "active",
			createdAt: now,
		},
		{
			id: `user-${suffix}`,
			kind: "human",
			name: "User",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	return createSessionRequest(db, {
		kind: "direct",
		request: {
			sourceKind: "assistant",
			sourceId: `message-${suffix}`,
			streamId: `thread:${suffix}`,
			agentId: `agent-${suffix}`,
			userId: `user-${suffix}`,
			promptMode: "conversation",
			payloadJson,
			idempotencyKey: `assistant:${suffix}`,
			sourceCorrelation: {
				threadId: `thread-${suffix}`,
				messageId: `message-${suffix}`,
				userId: `user-${suffix}`,
				assistantAgentId: `agent-${suffix}`,
			},
		},
	});
}

describe("agent session request repository", () => {
	function claimedToken(row: { readonly claimToken: string | null } | null): string {
		if (!row?.claimToken) throw new Error("Expected an actively claimed request");
		return row.claimToken;
	}

	// @lore AU38: once the per-test truncate goes away, a request left `pending`
	// by one test changes the premise of a later `claimSessionRequest({next:true})`
	// test in this file (it claims the OLDEST pending row). Terminalize the row
	// after the test's own assertions so this file leaves no pending rows behind.
	async function terminalizeRequest(
		db: HyperIdleDb,
		requestId: string,
		sessionId: string,
	): Promise<void> {
		const claimed = await claimSessionRequest(
			db,
			{ id: requestId },
			{ workerId: "teardown", now: new Date(), leaseMs: 30_000 },
		);
		await transitionSessionRequest(db, {
			to: "running",
			requestId,
			sessionId,
			claimToken: claimedToken(claimed),
		});
		await transitionSessionRequest(db, {
			to: "failed",
			precondition: "running",
			requestId,
			sessionId,
			failureCode: "TEST_TEARDOWN",
		});
	}
	test("createRequestForTest is idempotent by source/action key", async ({ db, ids }) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("team-1"), name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: ids("members-1"),
			teamId: ids("team-1"),
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: ids("agent-1"),
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			},
			{
				id: ids("user-1"),
				kind: "human",
				name: "User",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(bets).values({
			id: ids("bet-1"),
			teamId: ids("team-1"),
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: ids("task-1"),
			betId: ids("bet-1"),
			teamId: ids("team-1"),
			title: "Task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});

		const input = {
			sourceKind: "task" as const,
			sourceId: ids("task-1"),
			streamId: `task:${ids("task-1")}`,
			taskId: ids("task-1"),
			teamId: ids("team-1"),
			agentId: ids("agent-1"),
			promptMode: "task" as const,
			idempotencyKey: ids("task:task-1:accepted"),
			sourceCorrelation: { taskId: ids("task-1"), teamId: ids("team-1") },
		};

		const first = await createSessionRequest(db, { kind: "direct", request: input });
		const second = await createSessionRequest(db, { kind: "direct", request: input });

		expect(second.id).toBe(first.id);
		const rows = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, ids("task-1")));
		expect(rows).toHaveLength(1);

		await terminalizeRequest(db, first.id, ids("teardown-session-1"));
	});

	test("createRequestForTest returns the existing row under concurrent duplicate creates", async ({
		db,
		ids,
	}) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("team-2"), name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: ids("members-2"),
			teamId: ids("team-2"),
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values({
			id: ids("agent-2"),
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: ids("bet-2"),
			teamId: ids("team-2"),
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: ids("task-2"),
			betId: ids("bet-2"),
			teamId: ids("team-2"),
			title: "Task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});

		const input = {
			sourceKind: "task" as const,
			sourceId: ids("task-2"),
			streamId: `task:${ids("task-2")}`,
			taskId: ids("task-2"),
			teamId: ids("team-2"),
			agentId: ids("agent-2"),
			promptMode: "task" as const,
			idempotencyKey: ids("task:task-2:accepted"),
			sourceCorrelation: { taskId: ids("task-2"), teamId: ids("team-2") },
		};

		const results = await Promise.all(
			Array.from({ length: 8 }, () => createSessionRequest(db, { kind: "direct", request: input })),
		);

		expect(new Set(results.map((r) => r.id)).size).toBe(1);
		const rows = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, ids("task-2")));
		expect(rows).toHaveLength(1);

		const created = results[0];
		if (!created) throw new Error("Expected the concurrent creates to return the row");
		await terminalizeRequest(db, created.id, ids("teardown-session-2"));
	});

	test("claimNextAgentSessionRequest claims exactly one pending request", async ({ db, ids }) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("team-3"), name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: ids("members-3"),
			teamId: ids("team-3"),
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: ids("agent-3"),
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			},
			{
				id: ids("user-3"),
				kind: "human",
				name: "User",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);

		await createSessionRequest(db, {
			kind: "direct",
			request: {
				sourceKind: "assistant",
				sourceId: ids("msg-3"),
				streamId: `thread:${ids("thread-3")}`,
				agentId: ids("agent-3"),
				userId: ids("user-3"),
				promptMode: "conversation",
				idempotencyKey: ids("assistant:msg-3"),
				sourceCorrelation: {
					threadId: ids("thread-3"),
					messageId: ids("msg-3"),
					userId: ids("user-3"),
					assistantAgentId: ids("agent-3"),
				},
			},
		});

		const [claimed, second] = await Promise.all([
			claimSessionRequest(
				db,
				{ next: true },
				{ workerId: "worker-1", now: new Date("2026-07-08T12:00:00.000Z"), leaseMs: 30_000 },
			),
			claimSessionRequest(
				db,
				{ next: true },
				{ workerId: "worker-2", now: new Date("2026-07-08T12:00:00.000Z"), leaseMs: 30_000 },
			),
		]);

		const winners = [claimed, second].filter((request) => request !== null);
		expect(winners).toHaveLength(1);
		expect(winners[0]?.status).toBe("claimed");
		const winner = winners[0];
		if (!winner) throw new Error("Expected one concurrent claim winner");

		await transitionSessionRequest(
			db,
			{
				to: "running",
				requestId: winner.id,
				sessionId: ids("session-1"),
				claimToken: claimedToken(winner),
			},
			undefined,
			{ now: new Date("2026-07-08T12:00:00.000Z") },
		);
		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, winner.id));
		expect(row?.status).toBe("running");
		expect(row?.sessionId).toBe(ids("session-1"));

		// Leave the claimed row terminal, not pending (see terminalizeRequest lore).
		await transitionSessionRequest(
			db,
			{
				to: "failed",
				precondition: "running",
				requestId: winner.id,
				sessionId: ids("session-1"),
				failureCode: "TEST_TEARDOWN",
			},
			undefined,
			{ now: new Date("2026-07-08T12:00:01.000Z") },
		);
	});

	test("claim custody is token-fenced across concurrent claim, renew, expiry, and reclaim", async ({
		db,
		ids,
	}) => {
		const request = await createAssistantRequest(db, ids("lease"));
		const now = new Date("2026-07-08T12:00:00.000Z");
		const [first, second] = await Promise.all([
			claimSessionRequest(db, { id: request.id }, { workerId: "worker-a", now, leaseMs: 1_000 }),
			claimSessionRequest(db, { id: request.id }, { workerId: "worker-b", now, leaseMs: 1_000 }),
		]);
		const winner = [first, second].find((row) => row !== null);
		if (!winner) throw new Error("Expected one concurrent claim winner");
		const token = claimedToken(winner);
		expect([first, second].filter(Boolean)).toHaveLength(1);
		expect(
			await findSessionRequest(db, {
				by: "claimActive",
				requestId: request.id,
				claimToken: "wrong-token",
				now,
			}),
		).toBe(false);
		expect(
			await renewClaim(db, request.id, "wrong-token", {
				now,
				leaseMs: 5_000,
			}),
		).toBe(false);
		expect(
			await renewClaim(db, request.id, token, {
				now,
				leaseMs: 5_000,
			}),
		).toBe(true);
		expect(
			await findSessionRequest(db, {
				by: "claimActive",
				requestId: request.id,
				claimToken: token,
				now: new Date("2026-07-08T12:00:04.999Z"),
			}),
		).toBe(true);
		expect(
			await findSessionRequest(db, {
				by: "claimActive",
				requestId: request.id,
				claimToken: token,
				now: new Date("2026-07-08T12:00:05.001Z"),
			}),
		).toBe(false);
		const reclaimed = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker-c", now: new Date("2026-07-08T12:00:05.001Z"), leaseMs: 1_000 },
		);
		expect(reclaimed?.claimedBy).toBe("worker-c");
		expect(reclaimed?.claimToken).not.toBe(winner.claimToken);
	});

	test("release ignores a stale token and returns the matching claim to pending", async ({
		db,
		ids,
	}) => {
		const request = await createAssistantRequest(db, ids("release"));
		const claimed = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker-a", now: new Date("2026-07-08T12:00:00.000Z"), leaseMs: 30_000 },
		);
		await releaseClaim(db, request.id, "wrong-token");
		expect((await findSessionRequest(db, { by: "id", requestId: request.id }))?.status).toBe(
			"claimed",
		);
		const token = claimedToken(claimed);
		await releaseClaim(db, request.id, token);
		const released = await findSessionRequest(db, { by: "id", requestId: request.id });
		expect(released?.status).toBe("pending");
		expect(released?.claimExpiresAt).toBeNull();
		const reclaimed = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker-b", now: new Date("2026-07-08T12:00:01.000Z"), leaseMs: 30_000 },
		);
		expect(reclaimed?.claimedBy).toBe("worker-b");
		expect(reclaimed?.claimToken).not.toBe(claimed?.claimToken);
	});

	test("concurrent intent drains process one durable attempt", async ({ db, ids }) => {
		const intent = await enqueueWorkIntent(db, {
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: ids("review-intent-lease"),
			requestedBy: ids("agent-intent-lease"),
			idempotencyKey: ids("reengagement:intent-lease"),
		});
		const deps: DurableAgentQueueDeps = {
			db,
			lifecycleProjection: {
				explicitSessionStarts: { projectTerminalState: async () => {} },
			},
		};
		await Promise.all([
			drainIntents(deps, { maxAttempts: 1 }),
			drainIntents(deps, { maxAttempts: 1 }),
		]);
		const [stored] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, intent.id));
		expect(stored).toMatchObject({ status: "failed", attempts: 1 });
	});

	/**
	 * @lore AU30: re-homed verbatim (assertions unchanged) from the deleted
	 * `layers/core-api/src/services/__tests__/agent-work-intent-worker.routine-selection.integration.test.ts`.
	 * That file's other four cases were routine delegate-selection, whose subject
	 * is gone; this one's subject is `insertIntentInternal`'s dedup early-return
	 * and is very much alive — it is the case AU21 architecture §14 lists as
	 * "Idempotency/dedup — STAY GREEN UNCHANGED". It belongs here because
	 * `enqueueWorkIntent` lives in this package. Only the ARRANGEMENT changed:
	 * the old routine world (teams/users/`user_skills`/routine + a real routine
	 * run) existed to serve the four delegate-selection cases in that file —
	 * `agent_work_intents` carries no foreign key on `source_id` or
	 * `requested_by`, so dedup on (kind, sourceId, idempotencyKey) needs none of
	 * it, and `user_skills` no longer exists to seed.
	 */
	test("enqueueWorkIntent is idempotent on (kind, sourceId, idempotencyKey)", async ({
		db,
		ids,
	}) => {
		const runId = ids("au15-routine-idem-run");
		const ownerAgentId = ids("au15-owner");
		const first = await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: runId,
			requestedBy: ownerAgentId,
			idempotencyKey: `routine:${runId}`,
		});
		const second = await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: runId,
			requestedBy: ownerAgentId,
			idempotencyKey: `routine:${runId}`,
		});
		expect(second.id).toBe(first.id);
		const rows = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, runId));
		expect(rows).toHaveLength(1);
	});

	test("parameterized reads preserve payloads and source/running filters", async ({
		db,
		ids,
	}) => {
		const request = await createAssistantRequest(db, ids("reads"), '{"mode":"deep"}');
		expect((await findSessionRequest(db, { by: "id", requestId: request.id }))?.payloadJson).toBe(
			'{"mode":"deep"}',
		);
		expect(
			(
				await findSessionRequest(db, {
					by: "idempotencyKey",
					sourceKind: "assistant",
					sourceId: `message-${ids("reads")}`,
					idempotencyKey: `assistant:${ids("reads")}`,
				})
			)?.id,
		).toBe(request.id);
		expect(
			await listSessionRequests(db, {
				source: { kind: "assistant", id: `message-${ids("reads")}` },
			}),
		).toHaveLength(1);
		expect(
			await listSessionRequests(db, { source: { kind: "assistant", id: ids("other") } }),
		).toEqual([]);
		const claimed = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker", now: new Date(), leaseMs: 30_000 },
		);
		await transitionSessionRequest(db, {
			to: "running",
			requestId: request.id,
			sessionId: ids("session-reads"),
			claimToken: claimedToken(claimed),
		});
		expect(
			(await findSessionRequest(db, { by: "sessionId", sessionId: ids("session-reads") }))?.id,
		).toBe(request.id);
		expect(
			(await listSessionRequests(db, { status: "running" })).map((row: { id: string }) => row.id),
		).toContain(request.id);
	});

	test("explicit starts are found by id and requester key and transition to admitted", async ({
		db,
		ids,
	}) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("explicit-team"), name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: ids("explicit-members"),
			teamId: ids("explicit-team"),
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: ids("explicit-agent"),
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			},
			{
				id: ids("explicit-user"),
				kind: "human",
				name: "User",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(bets).values({
			id: ids("explicit-bet"),
			teamId: ids("explicit-team"),
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: ids("explicit-task"),
			betId: ids("explicit-bet"),
			teamId: ids("explicit-team"),
			title: "Task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});
		const start = await createSessionRequest(db, {
			kind: "explicitStart",
			start: {
				taskId: ids("explicit-task"),
				requestedAgentId: ids("explicit-agent"),
				requestedBy: ids("explicit-user"),
				idempotencyKey: ids("explicit-key"),
			},
		});
		const request = await createSessionRequest(db, {
			kind: "direct",
			request: {
				sourceKind: "task",
				sourceId: ids("explicit-task"),
				streamId: `task:${ids("explicit-task")}`,
				taskId: ids("explicit-task"),
				teamId: ids("explicit-team"),
				agentId: ids("explicit-agent"),
				promptMode: "task",
				idempotencyKey: ids("explicit-request-key"),
				sourceCorrelation: { taskId: ids("explicit-task"), teamId: ids("explicit-team") },
			},
		});
		await db.insert(sessions).values({
			id: ids("explicit-session"),
			taskId: ids("explicit-task"),
			requestId: request.id,
			sourceKind: "task",
			sourceId: ids("explicit-task"),
			sourceCorrelationJson: JSON.stringify({
				taskId: ids("explicit-task"),
				teamId: ids("explicit-team"),
			}),
			agentId: ids("explicit-agent"),
			modelTier: "fast",
			startedAt: now,
			state: "active",
		});
		expect((await findSessionRequest(db, { by: "explicitStart", startId: start.id }))?.id).toBe(
			start.id,
		);
		expect(
			(
				await findSessionRequest(db, {
					by: "explicitStart",
					requestedBy: ids("explicit-user"),
					idempotencyKey: ids("explicit-key"),
				})
			)?.id,
		).toBe(start.id);
		await transitionSessionRequest(db, {
			target: "explicitStart",
			to: "admitted",
			startId: start.id,
			requestId: request.id,
			sessionId: ids("explicit-session"),
		});
		const admitted = await findSessionRequest(db, { by: "explicitStart", startId: start.id });
		expect(admitted).toMatchObject({
			status: "admitted",
			requestId: request.id,
			sessionId: ids("explicit-session"),
		});
	});

	test("lifecycle transitions are CAS-guarded and emit one terminal inbox fact", async ({
		db,
		ids,
	}) => {
		const request = await createAssistantRequest(db, ids("terminal"));
		const claimed = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker", now: new Date(), leaseMs: 30_000 },
		);
		await expect(
			transitionSessionRequest(db, {
				to: "running",
				requestId: request.id,
				sessionId: ids("session-terminal"),
				claimToken: "stale",
			}),
		).rejects.toThrow("Lost request custody");
		await transitionSessionRequest(db, {
			to: "running",
			requestId: request.id,
			sessionId: ids("session-terminal"),
			claimToken: claimedToken(claimed),
		});
		expect(
			await transitionSessionRequest(db, {
				to: "termination-requested",
				requestId: request.id,
				reason: "user_done",
				requestedBy: "user-terminal",
			}),
		).toBe("accepted");
		expect(
			await transitionSessionRequest(db, {
				to: "termination-requested",
				requestId: request.id,
				reason: "user_done",
			}),
		).toBe("idempotent");
		expect(
			await transitionSessionRequest(db, {
				to: "termination-requested",
				requestId: request.id,
				reason: "shutdown",
			}),
		).toBe("conflict");
		const results = await Promise.all([
			transitionSessionRequest(db, {
				to: "cancelled",
				precondition: "running",
				requestId: request.id,
				sessionId: ids("session-terminal"),
			}),
			transitionSessionRequest(db, {
				to: "failed",
				precondition: "running",
				requestId: request.id,
				sessionId: ids("session-terminal"),
				failureCode: "RACE_LOST",
			}),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		const facts = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, request.id));
		expect(facts).toHaveLength(1);
	});

	test("live run registry replaces, aborts, and deregisters runtime handles", async () => {
		const stopResult = {
			outcome: "completed" as const,
			tokenUsage: { byTier: {} },
		};
		const firstStop = vi.fn(async (_handle: SessionHandle) => stopResult);
		const secondStop = vi.fn(async (_handle: SessionHandle) => stopResult);
		const firstSignal = vi.fn();
		const secondSignal = vi.fn();
		const adapter = (stopSession: typeof firstStop): HarnessAdapter => ({
			startSession: async () => ({ sessionId: "unused" }),
			streamEvents: async function* () {},
			stopSession,
			getCapabilities: () => ({
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: [],
				mcpSupport: false,
				returnEnforcement: "none",
			}),
		});
		const firstHandle: SessionHandle = { sessionId: "first" };
		const secondHandle: SessionHandle = { sessionId: "second" };
		sessionRunRegistry.register("registry-session", {
			signalAbort: firstSignal,
			handle: firstHandle,
			adapter: adapter(firstStop),
		});
		sessionRunRegistry.register("registry-session", {
			signalAbort: secondSignal,
			handle: secondHandle,
			adapter: adapter(secondStop),
		});
		expect(sessionRunRegistry.has("registry-session")).toBe(true);
		expect(await sessionRunRegistry.abort("registry-session")).toBe(true);
		expect(firstSignal).not.toHaveBeenCalled();
		expect(firstStop).not.toHaveBeenCalled();
		expect(secondSignal).toHaveBeenCalledOnce();
		expect(secondStop).toHaveBeenCalledOnce();
		sessionRunRegistry.deregister("registry-session");
		expect(sessionRunRegistry.has("registry-session")).toBe(false);
		expect(await sessionRunRegistry.abort("registry-session")).toBe(false);
	});
});

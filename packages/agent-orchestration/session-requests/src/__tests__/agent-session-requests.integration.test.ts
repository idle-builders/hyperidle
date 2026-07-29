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
import type { HarnessAdapter, SessionHandle } from "@hyperidle/shared";
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
	test("createRequestForTest is idempotent by source/action key", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "members-1",
			teamId: "team-1",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: "agent-1",
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			},
			{
				id: "user-1",
				kind: "human",
				name: "User",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(bets).values({
			id: "bet-1",
			teamId: "team-1",
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-1",
			betId: "bet-1",
			teamId: "team-1",
			title: "Task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});

		const input = {
			sourceKind: "task" as const,
			sourceId: "task-1",
			streamId: "task:task-1",
			taskId: "task-1",
			teamId: "team-1",
			agentId: "agent-1",
			promptMode: "task" as const,
			idempotencyKey: "task:task-1:accepted",
			sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
		};

		const first = await createSessionRequest(db, { kind: "direct", request: input });
		const second = await createSessionRequest(db, { kind: "direct", request: input });

		expect(second.id).toBe(first.id);
		const rows = await db.select().from(agentSessionRequests);
		expect(rows).toHaveLength(1);
	});

	test("createRequestForTest returns the existing row under concurrent duplicate creates", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-2", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "members-2",
			teamId: "team-2",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values({
			id: "agent-2",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: "bet-2",
			teamId: "team-2",
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-2",
			betId: "bet-2",
			teamId: "team-2",
			title: "Task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});

		const input = {
			sourceKind: "task" as const,
			sourceId: "task-2",
			streamId: "task:task-2",
			taskId: "task-2",
			teamId: "team-2",
			agentId: "agent-2",
			promptMode: "task" as const,
			idempotencyKey: "task:task-2:accepted",
			sourceCorrelation: { taskId: "task-2", teamId: "team-2" },
		};

		const results = await Promise.all(
			Array.from({ length: 8 }, () => createSessionRequest(db, { kind: "direct", request: input })),
		);

		expect(new Set(results.map((r) => r.id)).size).toBe(1);
		const rows = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, "task-2"));
		expect(rows).toHaveLength(1);
	});

	test("claimNextAgentSessionRequest claims exactly one pending request", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-3", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "members-3",
			teamId: "team-3",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: "agent-3",
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			},
			{
				id: "user-3",
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
				sourceId: "msg-3",
				streamId: "thread:thread-3",
				agentId: "agent-3",
				userId: "user-3",
				promptMode: "conversation",
				idempotencyKey: "assistant:msg-3",
				sourceCorrelation: {
					threadId: "thread-3",
					messageId: "msg-3",
					userId: "user-3",
					assistantAgentId: "agent-3",
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
				sessionId: "session-1",
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
		expect(row?.sessionId).toBe("session-1");
	});

	test("claim custody is token-fenced across concurrent claim, renew, expiry, and reclaim", async ({
		db,
	}) => {
		const request = await createAssistantRequest(db, "lease");
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
	}) => {
		const request = await createAssistantRequest(db, "release");
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

	test("concurrent intent drains process one durable attempt", async ({ db }) => {
		const intent = await enqueueWorkIntent(db, {
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: "review-intent-lease",
			requestedBy: "agent-intent-lease",
			idempotencyKey: "reengagement:intent-lease",
		});
		const deps: DurableAgentQueueDeps = {
			db,
			lifecycleProjection: {
				work: {
					updateBetDecompositionStatusIfRunning: async () => {},
					updateTaskDispatchAttemptIfActive: async () => {},
				},
				explicitSessionStarts: { projectTerminalState: async () => {} },
			},
			review: { findGrantedProposedCall: async () => undefined },
			routine: {
				getRoutineRunById: async () => undefined,
				getRoutineById: async () => undefined,
			},
			config: { listConfiguration: async () => [] },
			teams: { getTeamMembersByTeamId: async () => undefined },
			users: {
				getUserById: async () => undefined,
				getUserByIdScopedToTeam: async () => undefined,
				listUsersByTeam: async () => [],
			},
			work: {
				getTaskById: async () => undefined,
				getBetById: async () => undefined,
				getTaskDispatchAttemptById: async () => undefined,
				reapTerminalTaskDispatchAttempts: async () => 0,
			},
			conversation: { getMessageById: async () => undefined },
			knowledge: { findById: async () => null },
			agentSelection: {
				isAtCapacity: async () => false,
				selectAgent: async () => ({ agentId: null }),
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

	test("parameterized reads preserve payloads and source/running filters", async ({ db }) => {
		const request = await createAssistantRequest(db, "reads", '{"mode":"deep"}');
		expect((await findSessionRequest(db, { by: "id", requestId: request.id }))?.payloadJson).toBe(
			'{"mode":"deep"}',
		);
		expect(
			(
				await findSessionRequest(db, {
					by: "idempotencyKey",
					sourceKind: "assistant",
					sourceId: "message-reads",
					idempotencyKey: "assistant:reads",
				})
			)?.id,
		).toBe(request.id);
		expect(
			await listSessionRequests(db, { source: { kind: "assistant", id: "message-reads" } }),
		).toHaveLength(1);
		expect(await listSessionRequests(db, { source: { kind: "assistant", id: "other" } })).toEqual(
			[],
		);
		const claimed = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker", now: new Date(), leaseMs: 30_000 },
		);
		await transitionSessionRequest(db, {
			to: "running",
			requestId: request.id,
			sessionId: "session-reads",
			claimToken: claimedToken(claimed),
		});
		expect(
			(await findSessionRequest(db, { by: "sessionId", sessionId: "session-reads" }))?.id,
		).toBe(request.id);
		expect(
			(await listSessionRequests(db, { status: "running" })).map((row: { id: string }) => row.id),
		).toContain(request.id);
	});

	test("explicit starts are found by id and requester key and transition to admitted", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "explicit-team", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "explicit-members",
			teamId: "explicit-team",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: "explicit-agent",
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			},
			{
				id: "explicit-user",
				kind: "human",
				name: "User",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(bets).values({
			id: "explicit-bet",
			teamId: "explicit-team",
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "explicit-task",
			betId: "explicit-bet",
			teamId: "explicit-team",
			title: "Task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});
		const start = await createSessionRequest(db, {
			kind: "explicitStart",
			start: {
				taskId: "explicit-task",
				requestedAgentId: "explicit-agent",
				requestedBy: "explicit-user",
				idempotencyKey: "explicit-key",
			},
		});
		const request = await createSessionRequest(db, {
			kind: "direct",
			request: {
				sourceKind: "task",
				sourceId: "explicit-task",
				streamId: "task:explicit-task",
				taskId: "explicit-task",
				teamId: "explicit-team",
				agentId: "explicit-agent",
				promptMode: "task",
				idempotencyKey: "explicit-request-key",
				sourceCorrelation: { taskId: "explicit-task", teamId: "explicit-team" },
			},
		});
		await db.insert(sessions).values({
			id: "explicit-session",
			taskId: "explicit-task",
			requestId: request.id,
			sourceKind: "task",
			sourceId: "explicit-task",
			sourceCorrelationJson: JSON.stringify({ taskId: "explicit-task", teamId: "explicit-team" }),
			agentId: "explicit-agent",
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
					requestedBy: "explicit-user",
					idempotencyKey: "explicit-key",
				})
			)?.id,
		).toBe(start.id);
		await transitionSessionRequest(db, {
			target: "explicitStart",
			to: "admitted",
			startId: start.id,
			requestId: request.id,
			sessionId: "explicit-session",
		});
		const admitted = await findSessionRequest(db, { by: "explicitStart", startId: start.id });
		expect(admitted).toMatchObject({
			status: "admitted",
			requestId: request.id,
			sessionId: "explicit-session",
		});
	});

	test("lifecycle transitions are CAS-guarded and emit one terminal inbox fact", async ({ db }) => {
		const request = await createAssistantRequest(db, "terminal");
		const claimed = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker", now: new Date(), leaseMs: 30_000 },
		);
		await expect(
			transitionSessionRequest(db, {
				to: "running",
				requestId: request.id,
				sessionId: "session-terminal",
				claimToken: "stale",
			}),
		).rejects.toThrow("Lost request custody");
		await transitionSessionRequest(db, {
			to: "running",
			requestId: request.id,
			sessionId: "session-terminal",
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
				reason: "cost_cap",
			}),
		).toBe("conflict");
		const results = await Promise.all([
			transitionSessionRequest(db, {
				to: "cancelled",
				precondition: "running",
				requestId: request.id,
				sessionId: "session-terminal",
			}),
			transitionSessionRequest(db, {
				to: "failed",
				precondition: "running",
				requestId: request.id,
				sessionId: "session-terminal",
				failureCode: "RACE_LOST",
			}),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(await db.select().from(agentLifecycleInbox)).toHaveLength(1);
	});

	test("live run registry replaces, aborts, and deregisters runtime handles", async () => {
		const stopResult = {
			outcome: "completed" as const,
			cost: { minor: 0, currency: "USD" as const },
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

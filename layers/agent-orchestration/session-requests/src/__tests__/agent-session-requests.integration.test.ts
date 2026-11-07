/**
 * This test only needs `{ db }` (no `{ app }`), so it uses
 * `@hyperidle/db/test-fixtures`'s `{ db }`-only fixture.
 *
 * `markRequestRunning` takes a `MarkRequestRunningDeps` param (the
 * `SessionRequestsTriggerHistoryWriter` port, `ports.ts`) — this test
 * supplies a no-op fake (it asserts on `agent_session_requests`'
 * status/session-id transition only, never on `trigger_resolution_history`,
 * which this test never seeds a row for).
 */

import { type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import type { HarnessAdapter, SessionHandle } from "@hyperidle/harness-protocol";
import { agentSessionRequests, type RunnerDb } from "@hyperidle/runner-db";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import {
	cancelAllPendingForAgent,
	cancelPendingForTasks,
	claimSessionRequest,
	findSessionRequest,
	listSessionRequests,
	releaseClaim,
	renewClaim,
	sessionRunRegistry,
	transitionSessionRequest,
} from "../index.js";

async function createAssistantRequest(
	db: HyperIdleDb,
	runnerDb: RunnerDb,
	suffix: string,
	payloadJson?: string,
) {
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
	const [row] = await runnerDb
		.insert(agentSessionRequests)
		.values({
			id: `request-${suffix}`,
			sourceKind: "assistant",
			sourceId: `message-${suffix}`,
			streamId: `thread:${suffix}`,
			agentId: `agent-${suffix}`,
			userId: `user-${suffix}`,
			promptMode: "conversation",
			payloadJson: payloadJson ?? null,
			idempotencyKey: `assistant:${suffix}`,
			sourceCorrelationJson: JSON.stringify({
				threadId: `thread-${suffix}`,
				messageId: `message-${suffix}`,
				userId: `user-${suffix}`,
				assistantAgentId: `agent-${suffix}`,
			}),
			status: "pending",
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

describe("agent session request repository", () => {
	function claimedToken(row: { readonly claimToken: string | null } | null): string {
		if (!row?.claimToken) throw new Error("Expected an actively claimed request");
		return row.claimToken;
	}
	test("claimNextAgentSessionRequest claims exactly one pending request", async ({
		db,
		runnerDb,
	}) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-3", name: "Team", createdAt: now });
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

		await runnerDb.insert(agentSessionRequests).values({
			id: "request-msg-3",
			sourceKind: "assistant",
			sourceId: "msg-3",
			streamId: "thread:thread-3",
			agentId: "agent-3",
			userId: "user-3",
			promptMode: "conversation",
			idempotencyKey: "assistant:msg-3",
			sourceCorrelationJson: JSON.stringify({
				threadId: "thread-3",
				messageId: "msg-3",
				userId: "user-3",
				assistantAgentId: "agent-3",
			}),
			status: "pending",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		const [claimed, second] = await Promise.all([
			claimSessionRequest(
				runnerDb,
				{ next: true },
				{ workerId: "worker-1", now: new Date("2026-07-08T12:00:00.000Z"), leaseMs: 30_000 },
			),
			claimSessionRequest(
				runnerDb,
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
			runnerDb,
			{
				to: "running",
				requestId: winner.id,
				sessionId: "session-1",
				claimToken: claimedToken(winner),
			},
			{ now: new Date("2026-07-08T12:00:00.000Z") },
		);
		const [row] = await runnerDb
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, winner.id));
		expect(row?.status).toBe("running");
		expect(row?.sessionId).toBe("session-1");
	});

	test("claim custody is token-fenced across concurrent claim, renew, expiry, and reclaim", async ({
		db,
		runnerDb,
	}) => {
		const request = await createAssistantRequest(db, runnerDb, "lease");
		const now = new Date("2026-07-08T12:00:00.000Z");
		const [first, second] = await Promise.all([
			claimSessionRequest(
				runnerDb,
				{ id: request.id },
				{ workerId: "worker-a", now, leaseMs: 1_000 },
			),
			claimSessionRequest(
				runnerDb,
				{ id: request.id },
				{ workerId: "worker-b", now, leaseMs: 1_000 },
			),
		]);
		const winner = [first, second].find((row) => row !== null);
		if (!winner) throw new Error("Expected one concurrent claim winner");
		const token = claimedToken(winner);
		expect([first, second].filter(Boolean)).toHaveLength(1);
		expect(
			await findSessionRequest(runnerDb, {
				by: "claimActive",
				requestId: request.id,
				claimToken: "wrong-token",
				now,
			}),
		).toBe(false);
		expect(
			await renewClaim(runnerDb, request.id, "wrong-token", {
				now,
				leaseMs: 5_000,
			}),
		).toBe(false);
		expect(
			await renewClaim(runnerDb, request.id, token, {
				now,
				leaseMs: 5_000,
			}),
		).toBe(true);
		expect(
			await findSessionRequest(runnerDb, {
				by: "claimActive",
				requestId: request.id,
				claimToken: token,
				now: new Date("2026-07-08T12:00:04.999Z"),
			}),
		).toBe(true);
		expect(
			await findSessionRequest(runnerDb, {
				by: "claimActive",
				requestId: request.id,
				claimToken: token,
				now: new Date("2026-07-08T12:00:05.001Z"),
			}),
		).toBe(false);
		const reclaimed = await claimSessionRequest(
			runnerDb,
			{ id: request.id },
			{ workerId: "worker-c", now: new Date("2026-07-08T12:00:05.001Z"), leaseMs: 1_000 },
		);
		expect(reclaimed?.claimedBy).toBe("worker-c");
		expect(reclaimed?.claimToken).not.toBe(winner.claimToken);
	});

	test("release ignores a stale token and returns the matching claim to pending", async ({
		db,
		runnerDb,
	}) => {
		const request = await createAssistantRequest(db, runnerDb, "release");
		const claimed = await claimSessionRequest(
			runnerDb,
			{ id: request.id },
			{ workerId: "worker-a", now: new Date("2026-07-08T12:00:00.000Z"), leaseMs: 30_000 },
		);
		await releaseClaim(runnerDb, request.id, "wrong-token");
		expect((await findSessionRequest(runnerDb, { by: "id", requestId: request.id }))?.status).toBe(
			"claimed",
		);
		const token = claimedToken(claimed);
		await releaseClaim(runnerDb, request.id, token);
		const released = await findSessionRequest(runnerDb, { by: "id", requestId: request.id });
		expect(released?.status).toBe("pending");
		expect(released?.claimExpiresAt).toBeNull();
		const reclaimed = await claimSessionRequest(
			runnerDb,
			{ id: request.id },
			{ workerId: "worker-b", now: new Date("2026-07-08T12:00:01.000Z"), leaseMs: 30_000 },
		);
		expect(reclaimed?.claimedBy).toBe("worker-b");
		expect(reclaimed?.claimToken).not.toBe(claimed?.claimToken);
	});

	test("parameterized reads preserve payloads and source/running filters", async ({
		db,
		runnerDb,
	}) => {
		const request = await createAssistantRequest(db, runnerDb, "reads", '{"mode":"deep"}');
		expect(
			(await findSessionRequest(runnerDb, { by: "id", requestId: request.id }))?.payloadJson,
		).toBe('{"mode":"deep"}');
		expect(
			await listSessionRequests(runnerDb, { source: { kind: "assistant", id: "message-reads" } }),
		).toHaveLength(1);
		expect(
			await listSessionRequests(runnerDb, { source: { kind: "assistant", id: "other" } }),
		).toEqual([]);
		const claimed = await claimSessionRequest(
			runnerDb,
			{ id: request.id },
			{ workerId: "worker", now: new Date(), leaseMs: 30_000 },
		);
		await transitionSessionRequest(runnerDb, {
			to: "running",
			requestId: request.id,
			sessionId: "session-reads",
			claimToken: claimedToken(claimed),
		});
		expect(
			(await findSessionRequest(runnerDb, { by: "sessionId", sessionId: "session-reads" }))?.id,
		).toBe(request.id);
		expect(
			(await listSessionRequests(runnerDb, { status: "running" })).map(
				(row: { id: string }) => row.id,
			),
		).toContain(request.id);
	});

	test("lifecycle transitions are CAS-guarded", async ({ db, runnerDb }) => {
		const request = await createAssistantRequest(db, runnerDb, "terminal");
		const claimed = await claimSessionRequest(
			runnerDb,
			{ id: request.id },
			{ workerId: "worker", now: new Date(), leaseMs: 30_000 },
		);
		await expect(
			transitionSessionRequest(runnerDb, {
				to: "running",
				requestId: request.id,
				sessionId: "session-terminal",
				claimToken: "stale",
			}),
		).rejects.toThrow("Lost request custody");
		await transitionSessionRequest(runnerDb, {
			to: "running",
			requestId: request.id,
			sessionId: "session-terminal",
			claimToken: claimedToken(claimed),
		});
		expect(
			await transitionSessionRequest(runnerDb, {
				to: "termination-requested",
				requestId: request.id,
				reason: "user_done",
				requestedBy: "user-terminal",
			}),
		).toBe("accepted");
		expect(
			await transitionSessionRequest(runnerDb, {
				to: "termination-requested",
				requestId: request.id,
				reason: "user_done",
			}),
		).toBe("idempotent");
		expect(
			await transitionSessionRequest(runnerDb, {
				to: "termination-requested",
				requestId: request.id,
				reason: "shutdown",
			}),
		).toBe("conflict");
		const results = await Promise.all([
			transitionSessionRequest(runnerDb, {
				to: "cancelled",
				precondition: "running",
				requestId: request.id,
				sessionId: "session-terminal",
			}),
			transitionSessionRequest(runnerDb, {
				to: "failed",
				precondition: "running",
				requestId: request.id,
				sessionId: "session-terminal",
				failureCode: "RACE_LOST",
			}),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	test("stopping a task cancels its runs that have not started, and leaves the others", async ({
		db,
		runnerDb,
	}) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-stop", name: "Stop", createdAt: now });
		await db.insert(threads).values({
			id: "thr-stop",
			hostKind: "team",
			hostId: "team-stop",
			initiatorId: "team-stop",
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-stop",
			threadId: "thr-stop",
			teamId: "team-stop",
			title: "Stop me",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		const waiting = await createAssistantRequest(db, runnerDb, "stop-waiting");
		const elsewhere = await createAssistantRequest(db, runnerDb, "stop-elsewhere");
		await runnerDb
			.update(agentSessionRequests)
			.set({ taskId: "task-stop" })
			.where(eq(agentSessionRequests.id, waiting.id));

		expect(await cancelPendingForTasks(runnerDb, ["task-stop"], now)).toBe(1);

		const rows = await runnerDb.select().from(agentSessionRequests);
		expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
			[waiting.id]: "cancelled",
			[elsewhere.id]: "pending",
		});
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
		expect(await sessionRunRegistry.abort("registry-session", "stop")).toBe(true);
		expect(firstSignal).not.toHaveBeenCalled();
		expect(firstStop).not.toHaveBeenCalled();
		expect(secondSignal).toHaveBeenCalledExactlyOnceWith("stop");
		expect(secondStop).toHaveBeenCalledOnce();
		sessionRunRegistry.deregister("registry-session");
		expect(sessionRunRegistry.has("registry-session")).toBe(false);
		expect(await sessionRunRegistry.abort("registry-session", "stop")).toBe(false);
	});

	test("cancelAllPendingForAgent cancels both pending and claimed rows, leaves others untouched (S7)", async ({
		db,
		runnerDb,
	}) => {
		const now = new Date().toISOString();
		// First request for the agent under test.
		const req1 = await createAssistantRequest(db, runnerDb, "s7a");
		const agentId = req1.agentId;

		// Second request for the same agent — inserted directly to avoid duplicate user rows.
		await runnerDb.insert(agentSessionRequests).values({
			id: "request-s7b",
			sourceKind: "assistant",
			sourceId: "message-s7b",
			streamId: "thread:s7b",
			agentId,
			userId: `user-s7a`,
			promptMode: "conversation",
			idempotencyKey: "assistant:s7b",
			sourceCorrelationJson: JSON.stringify({ threadId: "thread-s7b", messageId: "message-s7b" }),
			status: "pending",
			createdAt: now,
			updatedAt: now,
		});

		// Claim the second request so it transitions to 'claimed'.
		const claimed = await claimSessionRequest(
			runnerDb,
			{ id: "request-s7b" },
			{ workerId: "worker-s7", now: new Date(), leaseMs: 60_000 },
		);

		// A third request for a different agent — must not be touched.
		const otherAgent = await createAssistantRequest(db, runnerDb, "s7-other");

		const n = await cancelAllPendingForAgent(runnerDb, agentId, now);
		expect(n).toBe(2);

		const rows = await runnerDb.select().from(agentSessionRequests);
		const statusById = Object.fromEntries(
			rows.map((r) => [r.id, { status: r.status, claimToken: r.claimToken }]),
		);
		expect(statusById[req1.id]?.status).toBe("cancelled");
		expect(statusById["request-s7b"]?.status).toBe("cancelled");
		// Claim fields nulled out when a claimed row is cancelled.
		expect(statusById["request-s7b"]?.claimToken).toBeNull();
		// Other agent's request not touched.
		expect(statusById[otherAgent.id]?.status).toBe("pending");

		expect(claimed).not.toBeNull();
	});
});

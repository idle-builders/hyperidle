/**
 * AU9 Remediation-2 — R2: this suite drives the real request state machine and
 * public `PATCH /sessions/:id` through the app fixture, plus the sanctioned
 * `startLifecycleProjectionDrain`/`bootAgentLayer` entrypoints. It does
 * NOT import `transitionAgentRunLifecycle`, `recoverRequestedTerminations`, or
 * the `lifecycle projector` map directly — no existence/constant
 * assertion stands in for driving the real transition.
 */

import {
	agentLifecycleInbox,
	agentSessionRequests,
	bets,
	explicitSessionStarts,
	routineRuns,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { SessionEndedEvent } from "@hyperidle/domain-model";
import {
	drainLifecycleProjections,
	sessionRunRegistry,
	startLifecycleProjectionDrain,
} from "@hyperidle/session-requests";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { registerRoutineRunSessionEndReactions } from "../services/routine-run-session-end-reactions.js";
import { startTestRuntime } from "./run-orchestration-test-runtime.js";

const TEST_API_KEY = "test-key-au9-lifecycle";
function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY));
afterEach(() => vi.unstubAllEnvs());

async function waitForProjection(
	db: import("@hyperidle/db").HyperIdleDb,
	requestIds: readonly string[],
): Promise<void> {
	const stop = startLifecycleProjectionDrain(queueDeps(db), { pollIntervalMs: 10 });
	try {
		const deadline = Date.now() + 5_000;
		for (;;) {
			const allRows: Array<{ requestId: string; projectedAt: string | null }> = [];
			for (const rid of requestIds) {
				const r = await db
					.select({
						requestId: agentLifecycleInbox.requestId,
						projectedAt: agentLifecycleInbox.projectedAt,
					})
					.from(agentLifecycleInbox)
					.where(eq(agentLifecycleInbox.requestId, rid));
				allRows.push(...r);
			}
			const pending = allRows.filter((row) => row.projectedAt === null);
			if (pending.length === 0) return;
			if (Date.now() > deadline) throw new Error(`Projection timed out for ${pending.length} rows`);
			await new Promise((resolve) => setTimeout(resolve, 15));
		}
	} finally {
		stop();
	}
}

async function seedTerminalRequest(
	db: import("@hyperidle/db").HyperIdleDb,
	ids: ScopedIds,
	prefix: string,
	sourceKind: string,
	sourceId: string,
	sessionId?: string,
): Promise<string> {
	const now = new Date().toISOString();
	const requestId = ids(prefix);
	await db.insert(users).values({
		id: ids(`${prefix}-agent`),
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(agentSessionRequests).values({
		id: requestId,
		sourceKind: "assistant",
		sourceId: ids(`${prefix}-source`),
		streamId: ids(`${prefix}-stream`),
		agentId: ids(`${prefix}-agent`),
		promptMode: "conversation",
		sourceCorrelationJson: "{}",
		idempotencyKey: requestId,
		status: "completed",
		...(sessionId ? { sessionId } : {}),
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentLifecycleInbox).values({
		requestId,
		sourceKind,
		sourceId,
		state: "completed",
		...(sessionId ? { sessionId } : {}),
		occurredAt: now,
	});
	return requestId;
}

describe("durable lifecycle projection", () => {
	test("lifecycle ledger has durable custody, retry, and terminal fact columns", async ({ db }) => {
		const result = await db.execute(sql`
			select column_name as "columnName" from information_schema.columns
			where table_schema = 'public' and table_name = 'agent_lifecycle_inbox'
		`);
		const columns = new Set(
			(result as { rows: Array<{ columnName: string }> }).rows.map((row) => row.columnName),
		);
		expect(columns).toEqual(
			new Set([
				"request_id",
				"source_kind",
				"source_id",
				"state",
				"session_id",
				"failure_code",
				"occurred_at",
				"projected_at",
				"claim_token",
				"claim_expires_at",
				"attempts",
				"last_error",
			]),
		);
	});

	test("the real drain projects a completed fact into every family's own domain state (or acknowledges the no-op families)", async ({
		db,
		ids,
	}) => {
		const now = new Date().toISOString();

		// @lore AU21 correction (post-Increment-5 verification): `routine` is now
		// one of the no-op families here too — Wave C's core-api-side
		// `routine-run-session-end-reactions.ts` (`finalizeRoutineRun`, reacting
		// to `session_ended`/`agent_run_lifecycle_changed`) is the SOLE mechanism
		// that finalizes a `routineRuns` row. The lifecycle-inbox drain's
		// `routine` projector is `observeOnly` — it acknowledges the fact but
		// performs no `routineRuns` write. See the dedicated test below for the
		// end-to-end proof that Wave C's mechanism alone still finalizes the run.
		const teamId = ids("au9-lc-team");
		const memberId = ids("au9-lc-member");
		const ownerId = ids("au9-lc-owner");
		const routineId = ids("au9-lc-routine");
		const routineRunId = ids("au9-lc-routine-run");
		const routineRequestId = ids("au9-lc-routine-request");
		const betId = ids("au9-lc-bet");
		const taskId = ids("au9-lc-task");
		const humanId = ids("au9-lc-human");
		const explicitRequestId = ids("au9-lc-explicit-request");
		const explicitSessionId = ids("au9-lc-explicit-session");
		const startId = ids("au9-lc-start");
		const assistantRequestId = ids("au9-lc-assistant-request");
		const knowledgeRequestId = ids("au9-lc-knowledge-request");
		const proposedCallRequestId = ids("au9-lc-proposed-call-request");

		await db.insert(teams).values({ id: teamId, name: "AU9", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: memberId,
			teamId: teamId,
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values({
			id: ownerId,
			kind: "ai",
			name: "Owner",
			role: "builder",
			status: "active",
			teamId: memberId,
			createdAt: now,
		});
		await db.insert(routines).values({
			id: routineId,
			teamId: teamId,
			ownerAgentId: ownerId,
			name: "AU9 routine",
			triggerType: "manual",
			active: true,
			state: "active",
			createdAt: now,
		});
		await db.insert(routineRuns).values({
			id: routineRunId,
			routineId: routineId,
			outcome: "running",
			startedAt: now,
		});
		await seedTerminalRequest(db, ids, "au9-lc-routine-request", "routine", routineRunId);

		// explicit_session_start family — real projection
		await db.insert(bets).values({
			id: betId,
			teamId: teamId,
			description: "AU9",
			appetite: "small",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId: betId,
			teamId: teamId,
			title: "AU9",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(users).values({
			id: humanId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		});
		await seedTerminalRequest(
			db,
			ids,
			"au9-lc-explicit-request",
			"explicit_session_start",
			explicitRequestId,
			explicitSessionId,
		);
		await db.insert(sessions).values({
			id: explicitSessionId,
			taskId: taskId,
			agentId: ownerId,
			modelTier: "fast",
			startedAt: now,
			state: "active",
		});
		await db.insert(explicitSessionStarts).values({
			id: startId,
			taskId: taskId,
			requestedAgentId: ownerId,
			requestedModelTier: "workhorse",
			requestedBy: humanId,
			idempotencyKey: startId,
			status: "admitted",
			requestId: explicitRequestId,
			sessionId: explicitSessionId,
			createdAt: now,
			updatedAt: now,
		});

		// no-op families — acknowledged but no domain write expected.
		await seedTerminalRequest(
			db,
			ids,
			"au9-lc-assistant-request",
			"assistant",
			ids("au9-lc-assistant-source"),
		);
		await seedTerminalRequest(
			db,
			ids,
			"au9-lc-knowledge-request",
			"knowledge",
			ids("au9-lc-knowledge-source"),
		);
		await seedTerminalRequest(
			db,
			ids,
			"au9-lc-proposed-call-request",
			"proposed_call",
			ids("au9-lc-proposed-call-source"),
		);

		await waitForProjection(db, [
			routineRequestId,
			explicitRequestId,
			assistantRequestId,
			knowledgeRequestId,
			proposedCallRequestId,
		]);

		// AU21 correction: the drain's `routine` projector is `observeOnly` now —
		// the run stays "running" after the drain alone. It is Wave C's
		// event-driven `finalizeRoutineRun` reaction (proven end-to-end below),
		// NOT this lifecycle-inbox drain, that finalizes `routineRuns`.
		const [routineRun] = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.id, routineRunId));
		expect(routineRun).toMatchObject({ outcome: "running" });

		const [start] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, startId));
		expect(start).toMatchObject({ status: "completed" });

		for (const requestId of [
			routineRequestId,
			explicitRequestId,
			assistantRequestId,
			knowledgeRequestId,
			proposedCallRequestId,
		]) {
			const [inboxRow] = await db
				.select({ projectedAt: agentLifecycleInbox.projectedAt })
				.from(agentLifecycleInbox)
				.where(eq(agentLifecycleInbox.requestId, requestId));
			expect(inboxRow?.projectedAt).toBeTruthy();
		}
	});

	/**
	 * AU21 correction (post-Increment-5 verification) — RED. Proves the THIRD
	 * write path the gap report identified is gone for real: the lifecycle-
	 * inbox drain's `routine` projector no longer performs a direct
	 * `routineRuns` write (it is `observeOnly`, same as `assistant`/
	 * `knowledge`/`proposed_call`), and the run's terminal finalization comes
	 * SOLELY from Wave C's `registerRoutineRunSessionEndReactions` reacting to
	 * `session_ended` — the drain plays no part in it at all.
	 *
	 * Today (RED): `lifecycleProjectors.routine` is still `projectRoutine`,
	 * which calls `deps.routine.updateRoutineRunIfRunning` directly through
	 * the real composition-root binding (`durable-agent-queue.ts`), so the
	 * drain alone finalizes the run to "success" BEFORE the event is ever
	 * emitted — the first assertion below (`outcome` still "running" right
	 * after the drain) fails against that current behavior.
	 */
	test("a routine session's terminal finalization happens via Wave C's event reaction alone — the lifecycle-inbox drain performs no direct routineRuns write", async ({
		db,
		eventBus,
		ids,
	}) => {
		const now = new Date().toISOString();
		const teamId = ids("au21-corr-team");
		const memberId = ids("au21-corr-member");
		const ownerId = ids("au21-corr-owner");
		const routineId = ids("au21-corr-routine");
		const runId = ids("au21-corr-run");
		const sessionId = ids("au21-corr-session");
		const requestId = ids("au21-corr-request");

		await db.insert(teams).values({ id: teamId, name: "AU21", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: memberId,
			teamId: teamId,
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values({
			id: ownerId,
			kind: "ai",
			name: "Owner",
			role: "builder",
			status: "active",
			teamId: memberId,
			createdAt: now,
		});
		await db.insert(routines).values({
			id: routineId,
			teamId: teamId,
			ownerAgentId: ownerId,
			name: "AU21 routine",
			triggerType: "manual",
			active: true,
			state: "active",
			createdAt: now,
		});
		await db.insert(routineRuns).values({
			id: runId,
			routineId: routineId,
			outcome: "running",
			startedAt: now,
		});
		await db.insert(sessions).values({
			id: sessionId,
			agentId: ownerId,
			modelTier: "fast",
			startedAt: now,
			state: "done",
		});
		await seedTerminalRequest(db, ids, "au21-corr-request", "routine", runId, sessionId);

		// Step 1: drain the lifecycle inbox through the REAL, production
		// composition root (`queueDeps(db)` — no fakes). The routine fact must
		// be acknowledged (the inbox row still gets claimed/projected/ack'd —
		// that mechanism itself is untouched), but the run must NOT be
		// finalized by this path — the drain's `routine` projector is
		// `observeOnly`, so nothing writes to `routineRuns` here.
		const projectedCount = await drainLifecycleProjections(queueDeps(db));
		expect(projectedCount).toBe(1);
		const [afterDrain] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
		expect(afterDrain).toMatchObject({ outcome: "running", sessionId: null, endedAt: null });
		const [inboxRow] = await db
			.select({ projectedAt: agentLifecycleInbox.projectedAt })
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, requestId));
		expect(inboxRow?.projectedAt).toBeTruthy();

		// Step 2: Wave C's reaction is the ONLY thing that finalizes the run —
		// register it now and emit the `session_ended` fact it reacts to.
		registerRoutineRunSessionEndReactions(db, eventBus);
		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: sessionId,
			sessionId: sessionId,
			agentId: ownerId,
			taskId: null,
			sourceKind: "routine",
			sourceId: runId,
			timestamp: Date.now(),
			outcome: "completed",
			routineRunOutcome: "success",
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const [finalized] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
			expect(finalized?.outcome).toBe("success");
			expect(finalized?.sessionId).toBe(sessionId);
			expect(finalized?.endedAt).toBeTruthy();
		});
	});
});

describe("PATCH /api/sessions/:id drives request-level custody through the public route", () => {
	async function seedActiveSession(
		db: import("@hyperidle/db").HyperIdleDb,
		ids: ScopedIds,
		prefix: string,
	): Promise<{ sessionId: string; requestId: string }> {
		const now = new Date().toISOString();
		const sessionId = ids(prefix);
		const requestId = ids(`${prefix}-request`);
		await db.insert(users).values({
			id: ids(`${prefix}-agent`),
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(agentSessionRequests).values({
			id: requestId,
			sourceKind: "assistant",
			sourceId: ids(`${prefix}-source`),
			streamId: ids(`${prefix}-stream`),
			agentId: ids(`${prefix}-agent`),
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: sessionId,
			status: "running",
			sessionId: sessionId,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(sessions).values({
			id: sessionId,
			requestId: requestId,
			agentId: ids(`${prefix}-agent`),
			modelTier: "fast",
			startedAt: now,
			state: "active",
		});
		return { sessionId, requestId };
	}

	test("no live registry: PATCH state=done terminalizes the correlated request to cancelled with one inbox fact", async ({
		db,
		app,
		ids,
	}) => {
		const { sessionId, requestId } = await seedActiveSession(db, ids, "au9-patch-done");
		const response = await app.request(`/api/sessions/${sessionId}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		expect(response.status).toBe(200);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, requestId));
		expect(request).toMatchObject({ status: "cancelled" });
		const inbox = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, requestId));
		expect(inbox).toHaveLength(1);
		expect(inbox[0]).toMatchObject({ state: "cancelled" });
	});

	test("no live registry: PATCH state=crashed terminalizes the correlated request to failed", async ({
		db,
		app,
		ids,
	}) => {
		const { sessionId, requestId } = await seedActiveSession(db, ids, "au9-patch-crashed");
		const response = await app.request(`/api/sessions/${sessionId}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "crashed" }),
		});
		expect(response.status).toBe(200);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, requestId));
		expect(request).toMatchObject({ status: "failed" });
	});

	test("already-terminal session rejects the PATCH with 409", async ({ db, app, ids }) => {
		const { sessionId } = await seedActiveSession(db, ids, "au9-patch-terminal");
		await db
			.update(sessions)
			.set({ state: "done", outcome: "completed", endedAt: new Date().toISOString() })
			.where(eq(sessions.id, sessionId));
		const response = await app.request(`/api/sessions/${sessionId}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		expect(response.status).toBe(409);
	});

	test("a competing already-stored termination cause conflicts instead of silently overwriting", async ({
		db,
		app,
		ids,
	}) => {
		const { sessionId, requestId } = await seedActiveSession(db, ids, "au9-patch-competing");
		// Simulate a handoff (or another PATCH) that already stored a different cause.
		await db
			.update(agentSessionRequests)
			.set({ terminationReason: "handoff", terminationRequestedAt: new Date().toISOString() })
			.where(eq(agentSessionRequests.id, requestId));
		const response = await app.request(`/api/sessions/${sessionId}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});
		expect(response.status).toBe(409);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, requestId));
		// The competing cause is untouched — never silently overwritten.
		expect(request).toMatchObject({ terminationReason: "handoff", status: "running" });
	});

	test("a live registry entry stores the cause before the async abort and returns 202", async ({
		db,
		app,
		ids,
	}) => {
		const { sessionId, requestId } = await seedActiveSession(db, ids, "au9-patch-live");
		sessionRunRegistry.register(sessionId, {
			signalAbort: vi.fn(),
			handle: {} as never,
			adapter: { stopSession: vi.fn(async () => {}) } as never,
		});
		try {
			const response = await app.request(`/api/sessions/${sessionId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "done" }),
			});
			expect(response.status).toBe(202);
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, requestId));
			// Reason persisted BEFORE the (mocked) async abort settles; request is
			// still durably "running" — the runtime teardown resolves it, not here.
			expect(request).toMatchObject({ terminationReason: "user_done", status: "running" });
		} finally {
			sessionRunRegistry.deregister(sessionId);
		}
	});
});

describe("crash-after-202 recovery resolves a durably-stored termination cause", () => {
	async function seedRunningWithReason(
		db: import("@hyperidle/db").HyperIdleDb,
		ids: ScopedIds,
		prefix: string,
		reason: "shutdown" | "handoff" | "user_crashed",
	): Promise<{ requestId: string }> {
		const now = new Date().toISOString();
		const requestId = ids(`${prefix}-request`);
		await db.insert(users).values({
			id: ids(`${prefix}-agent`),
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(agentSessionRequests).values({
			id: requestId,
			sourceKind: "assistant",
			sourceId: ids(`${prefix}-source`),
			streamId: ids(`${prefix}-stream`),
			agentId: ids(`${prefix}-agent`),
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: prefix,
			status: "running",
			sessionId: ids(`${prefix}-session`),
			terminationReason: reason,
			terminationRequestedAt: now,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(sessions).values({
			id: ids(`${prefix}-session`),
			requestId: requestId,
			agentId: ids(`${prefix}-agent`),
			modelTier: "fast",
			startedAt: now,
			state: "active",
		});
		return { requestId };
	}

	test("shutdown recovers to failed/RUNTIME_LOST", async ({ db, eventBus, ids }) => {
		const { requestId } = await seedRunningWithReason(db, ids, "au9-recover-shutdown", "shutdown");
		const runtime = await startTestRuntime(db, eventBus, { db, eventBus }, {} as never);
		try {
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, requestId));
			expect(request).toMatchObject({ status: "failed", errorCode: "RUNTIME_LOST" });
		} finally {
			await runtime.dispose();
		}
	});

	// @lore AU21 Increment 14a: "cost_cap recovers to failed/BUDGET_EXHAUSTED"
	// is HARD-DELETED — `cost_cap` is no longer a valid termination reason
	// (the cap gate that produced it is gone) and `BUDGET_EXHAUSTED` no longer
	// exists as a disposition, no replacement.

	test("handoff recovers to completed — never cancelled", async ({ db, eventBus, ids }) => {
		const { requestId } = await seedRunningWithReason(db, ids, "au9-recover-handoff", "handoff");
		const runtime = await startTestRuntime(db, eventBus, { db, eventBus }, {} as never);
		try {
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, requestId));
			expect(request).toMatchObject({ status: "completed" });
		} finally {
			await runtime.dispose();
		}
	});

	test("user_crashed recovers to failed with no stable failure code", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { requestId } = await seedRunningWithReason(
			db,
			ids,
			"au9-recover-usercrash",
			"user_crashed",
		);
		const runtime = await startTestRuntime(db, eventBus, { db, eventBus }, {} as never);
		try {
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, requestId));
			expect(request).toMatchObject({ status: "failed", errorCode: null });
		} finally {
			await runtime.dispose();
		}
	});
});

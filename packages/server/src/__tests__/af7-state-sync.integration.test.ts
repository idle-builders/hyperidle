/**
 * AF7 §4 / AC4 — DB/runtime state-sync contract, no zombie path (RED phase).
 *
 * Acceptance criterion (TRACK-AF.md AF7 AC4):
 *   "A session's recorded state stays consistent with its actual runtime state
 *    across its lifecycle; there is no path that leaves a zombie session."
 * Validation scenario:
 *   "Given a session that crashes, when it ends, then its DB state reflects the
 *    crash..."
 *
 * Root causes being closed (Z8-094 / Z8-095):
 *   - `endSession`/`crashSession` UPDATE the row UNCONDITIONALLY and then ALWAYS
 *     emit `session_ended`. A duplicate teardown (or a teardown for a row a
 *     different writer already finalized) emits a SECOND `session_ended`.
 *   - `PATCH /api/sessions/:id` flips DB state + emits `session_ended` with zero
 *     knowledge of the runtime, and can move an already-terminal session again.
 *
 * Plan §4 contract (HARD INVARIANT §4.3):
 *   - `endSession`/`crashSession` do a CAS UPDATE `WHERE state='active'`, and the
 *     `session_ended` emit fires IFF the CAS affected rowCount > 0.
 *   - `PATCH` on an already-terminal session → 409, no second `session_ended`.
 *
 * RED expectation:
 *   - The CAS-gated-emit test fails: today the second teardown re-emits
 *     `session_ended` (emit is unconditional).
 *   - The PATCH-409 test fails: today PATCH returns 200 and re-emits
 *     `session_ended` on an already-terminal session.
 */

import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { DomainEvent, HarnessAdapter, SessionHandle, SessionResult } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { crashSession, endSession, type SessionContext } from "../services/session-lifecycle.js";
import { sessionRunRegistry } from "../services/session-run-registry.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-af7-statesync";
const NOW = "2026-06-11T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** Minimal SessionContext for endSession/crashSession (watcher is a no-op). */
function makeContext(sessionId: string, agentId: string, taskId: string): SessionContext {
	return {
		sessionId,
		agentId,
		taskId,
		workspacePath: "/tmp/af7-nonexistent",
		watcher: { stop: () => {} } as SessionContext["watcher"],
		traceId: "trace-af7",
	};
}

type FixtureDb = HyperIdleDb;

async function seedTaskGraph(db: FixtureDb, taskId: string, agentId: string): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "af7-ss-team", name: "AF7 SS", phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({ id: "af7-ss-tm", teamId: "af7-ss-team", capacity: 5, activeBets: 0, formedAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(users)
		.values({
			id: agentId,
			name: "AF7 SS Agent",
			role: "builder",
			status: "active",
			teamId: "af7-ss-tm",
			createdAt: NOW,
		})
		.onConflictDoNothing();
	await db
		.insert(bets)
		.values({
			id: "af7-ss-bet",
			teamId: "af7-ss-team",
			description: "AF7 SS",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
	await db
		.insert(tasks)
		.values({
			id: taskId,
			betId: "af7-ss-bet",
			teamId: "af7-ss-team",
			title: "AF7 SS Task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.onConflictDoNothing();
}

async function seedSession(db: FixtureDb, state: string): Promise<{ sessionId: string }> {
	await seedTaskGraph(db, "af7-task-ss", "af7-agent-ss");
	const sessionId = `af7-sess-${state}`;
	await db.insert(sessions).values({
		id: sessionId,
		taskId: "af7-task-ss",
		agentId: "af7-agent-ss",
		modelTier: "workhorse",
		startedAt: NOW,
		state,
		...(state !== "active"
			? { outcome: state === "crashed" ? "crashed" : "completed", endedAt: NOW }
			: {}),
	});
	return { sessionId };
}

describe("AF7 AC4: CAS terminal write — rowcount-gated session_ended emit", () => {
	test("crashSession then endSession on the SAME session emits session_ended exactly once", async ({
		db,
		eventBus,
	}) => {
		const { sessionId } = await seedSession(db, "active");
		const ended: DomainEvent[] = [];
		eventBus.on("session_ended", (e) => ended.push(e));

		const ctx = makeContext(sessionId, "af7-agent-ss", "af7-task-ss");

		// First teardown: legitimately transitions active → crashed, emits once.
		await crashSession(db, eventBus, ctx, 0, 0);
		// Second teardown (duplicate / detached-tail double-fire): the row is
		// already terminal, so the CAS UPDATE affects zero rows and MUST NOT emit.
		await endSession(db, eventBus, ctx, 0, 0);

		expect(ended).toHaveLength(1);

		const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
		// The first write wins; the second is a no-op (state not flipped to done).
		expect(row?.state).toBe("crashed");
		expect(row?.outcome).toBe("crashed");
	});

	test("endSession on an ALREADY-terminal (done) session affects zero rows and emits zero session_ended", async ({
		db,
		eventBus,
	}) => {
		const { sessionId } = await seedSession(db, "done");
		const ended: DomainEvent[] = [];
		eventBus.on("session_ended", (e) => ended.push(e));

		const ctx = makeContext(sessionId, "af7-agent-ss", "af7-task-ss");

		// This is the handoff-ended-session path: the row is already `done`, so
		// the CAS UPDATE returns rowCount=0 and the emit must be suppressed.
		await endSession(db, eventBus, ctx, 0, 0);

		expect(ended).toHaveLength(0);
	});
});

describe("AF7 AC4: PATCH /api/sessions/:id cannot desync an already-terminal session", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("PATCH state=done on an already-terminal session → 409 and no second session_ended", async ({
		db,
		app,
		eventBus,
	}) => {
		// Seed a session that already reached a terminal state (runtime finalized it).
		await seedTaskGraph(db, "af7-task-patch", "af7-agent-patch");
		await db.insert(sessions).values({
			id: "af7-terminal",
			taskId: "af7-task-patch",
			agentId: "af7-agent-patch",
			modelTier: "workhorse",
			startedAt: NOW,
			endedAt: NOW,
			state: "done",
			outcome: "completed",
		});

		const ended: DomainEvent[] = [];
		eventBus.on("session_ended", (e) => ended.push(e));

		const res = await app.request("/api/sessions/af7-terminal", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "crashed" }),
		});

		// Plan §4.2: reject (409) a PATCH that would move an already-terminal session.
		expect(res.status).toBe(409);
		// No spurious session_ended for the already-ended session.
		expect(ended).toHaveLength(0);

		// DB state is unchanged (still done, not desynced to crashed).
		const [row] = await db.select().from(sessions).where(eq(sessions.id, "af7-terminal"));
		expect(row?.state).toBe("done");
	});
});

// ─── M3: live-abort PATCH read-back (response coherence) ────────────────────────

/**
 * M3 — PATCH on a session with a LIVE runtime entry must REQUEST termination and
 * acknowledge it as in-flight (202), NOT read the row back and return a stale
 * `active` body. The runtime is the sole terminal-state writer (§4.3); its
 * teardown runs in the detached `runSession` loop, so at the moment the route
 * returns the row is still `active`. The route must never assert a terminal state
 * it did not write, and must never write terminal state itself.
 *
 * Against the OLD behavior (re-read the row, return `{ status: 200, body: row }`),
 * this test fails on BOTH assertions: the status would be 200 (not 202) and the
 * body would carry `state: "active"` (a stale terminal-ish body) rather than the
 * `aborting` ack.
 */
describe("AF7 M3: live-abort PATCH acknowledges in-flight, never returns stale active body", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		sessionRunRegistry.deregister("af7-live-abort");
	});

	test("PATCH state=done on a live session → 202 aborting, no terminal write by route", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedTaskGraph(db, "af7-task-live", "af7-agent-live");
		await db.insert(sessions).values({
			id: "af7-live-abort",
			taskId: "af7-task-live",
			agentId: "af7-agent-live",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		// Register a LIVE runtime entry whose stopSession resolves WITHOUT writing
		// terminal DB state — exactly the real timing where the detached runSession
		// teardown has not yet converged when the route returns.
		let stopCalled = false;
		const stubAdapter = {
			async stopSession(_handle: SessionHandle): Promise<SessionResult> {
				stopCalled = true;
				return {
					outcome: "completed",
					cost: { minor: 0, currency: "USD" },
					tokenUsage: { byTier: {} },
				};
			},
		} as unknown as HarnessAdapter;
		sessionRunRegistry.register("af7-live-abort", {
			signalAbort: () => {},
			handle: { sessionId: "af7-live-abort" },
			adapter: stubAdapter,
		});

		const ended: DomainEvent[] = [];
		eventBus.on("session_ended", (e) => ended.push(e));

		const res = await app.request("/api/sessions/af7-live-abort", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ state: "done" }),
		});

		// 202 Accepted — the abort is in-flight, not asserted complete.
		expect(res.status).toBe(202);
		const body = (await res.json()) as { state: string; sessionId: string };
		expect(body.state).toBe("aborting");
		expect(body.sessionId).toBe("af7-live-abort");
		// The abort was actually dispatched to the harness.
		expect(stopCalled).toBe(true);

		// The route did NOT write terminal state — the runtime is the sole terminal
		// writer, and here it has not torn down yet, so the row is still active.
		const [row] = await db.select().from(sessions).where(eq(sessions.id, "af7-live-abort"));
		expect(row?.state).toBe("active");
		// The route did NOT emit session_ended — only the runtime teardown may.
		expect(ended).toHaveLength(0);
	});
});

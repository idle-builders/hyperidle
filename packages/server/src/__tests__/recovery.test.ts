/**
 * L7 — Recovery Verbs server routes (red phase).
 *
 * Pins the API contract from `.pipeline-plan.md` §4 + TRACK-L L7:
 *
 *   POST /api/factory/pause       — kill switch (factory-wide)
 *   POST /api/factory/resume      — clear paused state
 *   POST /api/threads/:id/verdict/rollback  — rollback shipped verdict
 *   POST /api/sessions/:id/pause  — mid-session pause
 *   POST /api/sessions/:id/resume — mid-session resume
 *
 * + the factory-paused-guard: mutating routes (verdict commit, session
 *   start, etc.) must respond 423 Locked while paused; the recovery
 *   verbs themselves bypass the guard.
 *
 * These tests MUST fail today: none of the routes exist, neither does
 * the `recovery_audit` / `factory_state` tables they read/write.
 */
import {
	actors,
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	items,
	products,
	sessions,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l7-recovery";
const NOW_ISO = "2026-04-27T10:00:00.000Z";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

function seedActorsAndProduct(db: HyperIdleDb): void {
	db.insert(actors)
		.values([
			{
				id: "actor:ceo",
				role: "CEO",
				domainTags: '["market","growth","portfolio"]',
				createdAt: NOW_ISO,
			},
			{
				id: "actor:cpo",
				role: "CPO",
				domainTags: '["product","design"]',
				createdAt: NOW_ISO,
			},
		])
		.run();
	db.insert(products)
		.values({ id: "prod-1", name: "Demo", phase: "build", createdAt: NOW_ISO })
		.run();
	db.insert(teams)
		.values({
			id: "team-1",
			productId: "prod-1",
			capacity: 3,
			activeBets: 0,
			formedAt: NOW_ISO,
		})
		.run();
	db.insert(agents)
		.values({
			id: "agent-1",
			name: "Builder",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: NOW_ISO,
		})
		.run();
}

function seedRunningSessions(db: HyperIdleDb, count = 3): string[] {
	db.insert(bets)
		.values({
			id: "bet-1",
			productId: "prod-1",
			teamId: "team-1",
			pitch: "Bet pitch",
			appetite: "1w",
			status: "active",
			createdAt: NOW_ISO,
		})
		.run();
	const ids: string[] = [];
	for (let i = 0; i < count; i += 1) {
		const taskId = `task-${i}`;
		db.insert(tasks)
			.values({
				id: taskId,
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: `Task ${i}`,
				state: "in_progress",
				createdAt: NOW_ISO,
				updatedAt: NOW_ISO,
			})
			.run();
		const sessionId = `session-${i}`;
		db.insert(sessions)
			.values({
				id: sessionId,
				taskId,
				agentId: "agent-1",
				modelTier: "sonnet",
				startedAt: NOW_ISO,
				state: "running",
			})
			.run();
		ids.push(sessionId);
	}
	return ids;
}

describe("L7: POST /api/factory/pause", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndProduct(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("401 without X-Actor-Id (and no env fallback)", async () => {
		const res = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "spotted bad output" }),
		});
		expect(res.status).toBe(401);
	});

	it("400 missing reason field", async () => {
		const res = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("400 empty reason field", async () => {
		const res = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "   " }),
		});
		expect(res.status).toBe(400);
	});

	it("400 reason >500 chars", async () => {
		const res = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x".repeat(501) }),
		});
		expect(res.status).toBe(400);
	});

	it("400 if body smuggles an actorId field (.strict() rejects extras)", async () => {
		const res = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "ok", actorId: "actor:cpo" }),
		});
		expect(res.status).toBe(400);
	});

	it("200 success: pauses factory, writes recovery_audit row, sets factory_state.paused_at", async () => {
		const res = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "spotted bad output" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			state: string;
			pausedAt: string;
			auditId: string;
		};
		expect(body.state).toBe("paused");
		expect(body.pausedAt).toBeTruthy();
		expect(body.auditId).toBeTruthy();

		// recovery_audit row written
		const auditRow = db.get<{ verb: string; reason: string; actor_id: string }>(
			sql.raw(`SELECT verb, reason, actor_id FROM "recovery_audit" WHERE id = '${body.auditId}'`),
		);
		expect(auditRow?.verb).toBe("factory_pause");
		expect(auditRow?.reason).toBe("spotted bad output");
		expect(auditRow?.actor_id).toBe("actor:ceo");

		// factory_state singleton row updated
		const fsRow = db.get<{ paused_by: string; paused_reason: string }>(
			sql.raw(`SELECT paused_by, paused_reason FROM "factory_state" WHERE id = 'factory'`),
		);
		expect(fsRow?.paused_by).toBe("actor:ceo");
		expect(fsRow?.paused_reason).toBe("spotted bad output");
	});

	it("409 if already paused (returns existing pausedBy + pausedAt)", async () => {
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "first" }),
		});
		const res = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:cpo" }),
			body: JSON.stringify({ reason: "second" }),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string; pausedBy?: string };
		expect(body.error).toMatch(/already_paused/);
		expect(body.pausedBy).toBe("actor:ceo");
	});
});

describe("L7: POST /api/factory/resume", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndProduct(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("401 without identity", async () => {
		const res = await app.request("/api/factory/resume", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(401);
	});

	it("409 if not currently paused", async () => {
		const res = await app.request("/api/factory/resume", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(409);
	});

	it("200 success: clears paused_at, writes recovery_audit row with verb='factory_resume'", async () => {
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "spotted bad output" }),
		});
		const res = await app.request("/api/factory/resume", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { state: string; auditId: string };
		expect(body.state).toBe("running");
		const auditRow = db.get<{ verb: string }>(
			sql.raw(`SELECT verb FROM "recovery_audit" WHERE id = '${body.auditId}'`),
		);
		expect(auditRow?.verb).toBe("factory_resume");
	});

	it("200 success without reason field (resume reason is OPTIONAL)", async () => {
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		const res = await app.request("/api/factory/resume", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
	});
});

describe("L7: POST /api/threads/:id/verdict/rollback", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	async function commitVerdict(actor: string, decision = "approve"): Promise<string | null> {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": actor }),
			body: JSON.stringify({ itemId: "item-1", decision }),
		});
		const j = (await res.json().catch(() => null)) as { id?: string } | null;
		return j?.id ?? null;
	}

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndProduct(db);
		db.insert(threads).values({ id: "thread-1", kind: "review", createdAt: NOW_ISO }).run();
		db.insert(items)
			.values({ id: "item-1", title: "Approve me", threadId: "thread-1", createdAt: NOW_ISO })
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("401 without identity", async () => {
		const res = await app.request("/api/threads/thread-1/verdict/rollback", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "agent ignored my comments" }),
		});
		expect(res.status).toBe(401);
	});

	it("400 missing reason", async () => {
		await commitVerdict("actor:ceo");
		const res = await app.request("/api/threads/thread-1/verdict/rollback", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("404 if thread/verdict not found", async () => {
		const res = await app.request("/api/threads/no-such-thread/verdict/rollback", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "agent ignored my comments" }),
		});
		expect(res.status).toBe(404);
	});

	it("403 cross-founder rollback blocked (actor != original approver)", async () => {
		await commitVerdict("actor:ceo");
		const res = await app.request("/api/threads/thread-1/verdict/rollback", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:cpo" }),
			body: JSON.stringify({ reason: "wrong founder" }),
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/actor_mismatch/);
	});

	it("200 success: writes recovery_audit row with verb='rollback'", async () => {
		await commitVerdict("actor:ceo");
		const res = await app.request("/api/threads/thread-1/verdict/rollback", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "agent ignored my comments" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { auditId: string; outcome: string };
		expect(["succeeded", "partially", "failed"]).toContain(body.outcome);
		const row = db.get<{ verb: string; target_kind: string; target_id: string }>(
			sql.raw(
				`SELECT verb, target_kind, target_id FROM "recovery_audit" WHERE id = '${body.auditId}'`,
			),
		);
		expect(row?.verb).toBe("rollback");
		expect(row?.target_kind).toBe("thread");
		expect(row?.target_id).toBe("thread-1");
	});

	it("410 if verdict already rolled back (latest audit row is rollback)", async () => {
		await commitVerdict("actor:ceo");
		await app.request("/api/threads/thread-1/verdict/rollback", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "first rollback" }),
		});
		const res = await app.request("/api/threads/thread-1/verdict/rollback", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "second rollback" }),
		});
		expect(res.status).toBe(410);
	});

	it("ALLOWED while factory paused (cleanup verb bypasses guard)", async () => {
		await commitVerdict("actor:ceo");
		// Pause the factory.
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "investigating" }),
		});
		const res = await app.request("/api/threads/thread-1/verdict/rollback", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "cleanup during pause" }),
		});
		expect(res.status).toBe(200);
	});
});

describe("L7: POST /api/sessions/:id/pause", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;
	let sessionIds: string[];

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndProduct(db);
		sessionIds = seedRunningSessions(db, 3);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("401 without identity", async () => {
		const res = await app.request(`/api/sessions/${sessionIds[0]}/pause`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "x" }),
		});
		expect(res.status).toBe(401);
	});

	it("400 missing reason", async () => {
		const res = await app.request(`/api/sessions/${sessionIds[0]}/pause`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("404 unknown session", async () => {
		const res = await app.request("/api/sessions/no-such/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		expect(res.status).toBe(404);
	});

	it("200 success: writes recovery_audit row with verb='session_pause'", async () => {
		const res = await app.request(`/api/sessions/${sessionIds[0]}/pause`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "checking output" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { auditId: string; state: string };
		expect(body.state).toBe("paused");
		const row = db.get<{ verb: string; target_kind: string; target_id: string }>(
			sql.raw(
				`SELECT verb, target_kind, target_id FROM "recovery_audit" WHERE id = '${body.auditId}'`,
			),
		);
		expect(row?.verb).toBe("session_pause");
		expect(row?.target_kind).toBe("session");
		expect(row?.target_id).toBe(sessionIds[0]);
	});

	it("409 if already paused", async () => {
		await app.request(`/api/sessions/${sessionIds[0]}/pause`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		const res = await app.request(`/api/sessions/${sessionIds[0]}/pause`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "y" }),
		});
		expect(res.status).toBe(409);
	});

	it("ALLOWED while factory paused (not 423; behavior is idempotent against factory pause)", async () => {
		// L7 AC2 cascade: factory pause auto-pauses every running
		// session, so the per-session pause endpoint sees an
		// already-paused row. The route must NOT be guarded by 423
		// (recovery verbs bypass `factoryPausedGuard`); instead the
		// service returns 409 `already_paused`. Either 200 (was-running)
		// or 409 (was-cascaded) is acceptable — the only forbidden
		// status here is 423.
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		const res = await app.request(`/api/sessions/${sessionIds[0]}/pause`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		expect(res.status).not.toBe(423);
		expect([200, 409]).toContain(res.status);
	});
});

describe("L7: POST /api/sessions/:id/resume", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;
	let sessionIds: string[];

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndProduct(db);
		sessionIds = seedRunningSessions(db, 1);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("401 without identity", async () => {
		const res = await app.request(`/api/sessions/${sessionIds[0]}/resume`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(401);
	});

	it("404 unknown session", async () => {
		const res = await app.request("/api/sessions/no-such/resume", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(404);
	});

	it("409 if not paused", async () => {
		const res = await app.request(`/api/sessions/${sessionIds[0]}/resume`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(409);
	});

	it("200 happy path with no reason (reason optional on resume)", async () => {
		await app.request(`/api/sessions/${sessionIds[0]}/pause`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		const res = await app.request(`/api/sessions/${sessionIds[0]}/resume`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { state: string };
		expect(body.state).toBe("running");
	});
});

describe("L7: factory-paused-guard middleware (selective)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndProduct(db);
		db.insert(threads).values({ id: "thread-1", kind: "review", createdAt: NOW_ISO }).run();
		db.insert(items)
			.values({ id: "item-1", title: "Approve me", threadId: "thread-1", createdAt: NOW_ISO })
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("verdict commit (mutation) returns 423 Locked while factory paused", async () => {
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1", decision: "approve" }),
		});
		expect(res.status).toBe(423);
	});

	it("POST /api/factory/resume bypasses the guard", async () => {
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		const res = await app.request("/api/factory/resume", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
	});

	it("recovery routes themselves bypass the guard (POST /api/factory/pause is not double-guarded)", async () => {
		// Pausing once succeeds, second-pause returns 409 (already_paused)
		// — NOT 423, proving the guard does not block its own verb.
		const r1 = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		expect(r1.status).toBe(200);
		const r2 = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "y" }),
		});
		expect(r2.status).toBe(409);
		expect(r2.status).not.toBe(423);
	});
});

describe("L7: GET /api/factory/state", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndProduct(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns running by default", async () => {
		const res = await app.request("/api/factory/state", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { paused: boolean };
		expect(body.paused).toBe(false);
	});

	it("returns paused, pausedBy, pausedAt, pausedReason after pause", async () => {
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "spotted bad output" }),
		});
		const res = await app.request("/api/factory/state", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			paused: boolean;
			pausedBy: string | null;
			pausedReason: string | null;
		};
		expect(body.paused).toBe(true);
		expect(body.pausedBy).toBe("actor:ceo");
		expect(body.pausedReason).toBe("spotted bad output");
	});
});

// L7 AC2: Kill pauses every running session and blocks queued tasks;
// factory-resume restores them. Mid-session pauses (no `pausedByKill`
// marker) stay paused — only kill-paused rows auto-restore.
describe("L7 AC2: factory pause cascades to running sessions and queued tasks", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndProduct(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	function seedQueuedTasks(count: number): string[] {
		// Re-use bet-1 from `seedRunningSessions` if it exists; otherwise
		// create our own.
		const betId = "bet-cascade";
		db.insert(bets)
			.values({
				id: betId,
				productId: "prod-1",
				teamId: "team-1",
				pitch: "queued",
				appetite: "1w",
				status: "active",
				createdAt: NOW_ISO,
			})
			.run();
		const ids: string[] = [];
		for (let i = 0; i < count; i += 1) {
			const id = `queued-task-${i}`;
			db.insert(tasks)
				.values({
					id,
					betId,
					productId: "prod-1",
					teamId: "team-1",
					title: `Queued ${i}`,
					state: "accepted",
					createdAt: NOW_ISO,
					updatedAt: NOW_ISO,
				})
				.run();
			ids.push(id);
		}
		return ids;
	}

	it("flips every running session to paused with pausedByKill checkpoint, every accepted task to hold", async () => {
		const sessionIds = seedRunningSessions(db, 3);
		const taskIds = seedQueuedTasks(2);

		const res = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "kill cascade" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			affected: { sessions: number; tasks: number };
		};
		expect(body.affected.sessions).toBe(3);
		expect(body.affected.tasks).toBe(2);

		// Every running session is now paused with a kill-marked checkpoint.
		for (const id of sessionIds) {
			const row = db.get<{ state: string; pause_checkpoint: string }>(
				sql.raw(
					`SELECT state, pause_checkpoint FROM "sessions" WHERE id = '${id}'`,
				),
			);
			expect(row?.state).toBe("paused");
			expect(row?.pause_checkpoint).toBeTruthy();
			const parsed = JSON.parse(row?.pause_checkpoint ?? "{}") as {
				pausedByKill?: boolean;
				priorState?: string;
			};
			expect(parsed.pausedByKill).toBe(true);
			expect(parsed.priorState).toBe("running");
		}

		// Every accepted task is now hold.
		for (const id of taskIds) {
			const row = db.get<{ state: string }>(
				sql.raw(`SELECT state FROM "tasks" WHERE id = '${id}'`),
			);
			expect(row?.state).toBe("hold");
		}
	});

	it("factory resume restores kill-paused sessions to running and hold tasks to accepted; mid-session pauses stay paused", async () => {
		const sessionIds = seedRunningSessions(db, 2);
		const taskIds = seedQueuedTasks(2);
		// Mid-session-pause one session BEFORE the kill so we can verify
		// it does NOT auto-resume.
		await app.request(`/api/sessions/${sessionIds[0]}/pause`, {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "manual pause" }),
		});

		// Now kill the factory — only sessionIds[1] is still running.
		await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "kill" }),
		});

		// Resume the factory.
		const res = await app.request("/api/factory/resume", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);

		// Manually-paused session must STAY paused (no pausedByKill marker).
		const manual = db.get<{ state: string }>(
			sql.raw(`SELECT state FROM "sessions" WHERE id = '${sessionIds[0]}'`),
		);
		expect(manual?.state).toBe("paused");

		// Kill-paused session must be running again.
		const restored = db.get<{ state: string; pause_checkpoint: string | null }>(
			sql.raw(
				`SELECT state, pause_checkpoint FROM "sessions" WHERE id = '${sessionIds[1]}'`,
			),
		);
		expect(restored?.state).toBe("running");
		expect(restored?.pause_checkpoint).toBeNull();

		// Both tasks must be back to accepted.
		for (const id of taskIds) {
			const row = db.get<{ state: string }>(
				sql.raw(`SELECT state FROM "tasks" WHERE id = '${id}'`),
			);
			expect(row?.state).toBe("accepted");
		}
	});

	it("audit meta records affected.sessions and affected.tasks lists for forensic restore", async () => {
		seedRunningSessions(db, 1);
		seedQueuedTasks(1);
		const pauseRes = await app.request("/api/factory/pause", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ reason: "x" }),
		});
		const body = (await pauseRes.json()) as { auditId: string };
		const row = db.get<{ meta: string }>(
			sql.raw(`SELECT meta FROM "recovery_audit" WHERE id = '${body.auditId}'`),
		);
		expect(row?.meta).toBeTruthy();
		const parsed = JSON.parse(row?.meta ?? "{}") as {
			affected?: {
				sessions?: string[];
				tasks?: Array<{ id: string; priorState: string }>;
			};
		};
		expect(parsed.affected?.sessions).toEqual(["session-0"]);
		expect(parsed.affected?.tasks).toEqual([{ id: "queued-task-0", priorState: "accepted" }]);
	});
});

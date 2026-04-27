/**
 * L2 — Founder/Actor Routing Schema (red phase, PATCH /api/threads/:id/route).
 *
 * Pins the contract from `docs/work-packages/TRACK-L.md` L2 and
 * `.plan-L2.md` §3.5 (`PATCH /api/threads/:id/route`).
 *
 *   - 200 happy path updates threads.routed_to_actor_id and writes one
 *     thread_routing_audit row with from_actor_id, to_actor_id, reason, at,
 *     and changed_by = the authenticated actor.
 *   - 400 when reason is empty (mandatory rationale).
 *   - 400 (VALIDATION_ERROR) when to_actor_id is non-null but unknown.
 *   - 404 when the thread does not exist.
 *   - 401 when no actor is identified (header + env both absent).
 *   - to_actor_id = null is valid and means "either" (per AC13).
 *
 * These tests MUST fail today: the route does not exist; the actors and
 * thread_routing_audit tables do not exist.
 */
import { createTestDb, type HyperIdleDb, threads } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l2-route";
const NOW = "2026-04-26T12:00:00.000Z";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

function seedActors(db: HyperIdleDb): void {
	db.run(
		sql.raw(
			`INSERT INTO actors (id, role, domain_tags, created_at) VALUES ('actor:ceo','CEO','["market","growth","portfolio"]','${NOW}')`,
		),
	);
	db.run(
		sql.raw(
			`INSERT INTO actors (id, role, domain_tags, created_at) VALUES ('actor:cpo','CPO','["product","design","tech","content"]','${NOW}')`,
		),
	);
}

interface AuditRow {
	id: string;
	thread_id: string;
	from_actor_id: string | null;
	to_actor_id: string | null;
	reason: string;
	changed_by: string | null;
	at: string;
}

describe("L2: PATCH /api/threads/:id/route", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		seedActors(db);
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		db.insert(threads).values({ id: "t-1", kind: "review", createdAt: NOW }).run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("200 happy path: updates routed_to_actor_id and writes an audit row", async () => {
		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason: "needs design judgment" }),
		});
		expect(res.status).toBe(200);

		// Thread row updated.
		const row = db.get<{ routed: string | null }>(
			sql.raw(`SELECT routed_to_actor_id AS routed FROM threads WHERE id = 't-1'`),
		);
		expect(row?.routed).toBe("actor:cpo");

		// Exactly one audit row inserted.
		const audit = db.all<AuditRow>(
			sql.raw(`SELECT * FROM thread_routing_audit WHERE thread_id = 't-1'`),
		);
		expect(audit).toHaveLength(1);
		const a = audit[0];
		expect(a?.thread_id).toBe("t-1");
		expect(a?.from_actor_id).toBeNull();
		expect(a?.to_actor_id).toBe("actor:cpo");
		expect(a?.reason).toBe("needs design judgment");
		expect(a?.changed_by).toBe("actor:ceo");
		expect(a?.at).toBeTruthy();
	});

	it("200 happy path: to_actor_id = null is valid and means 'either'", async () => {
		// First reassign to CPO so we have a non-null prior state.
		await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason: "first hop" }),
		});

		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: null, reason: "open to either founder" }),
		});
		expect(res.status).toBe(200);

		const row = db.get<{ routed: string | null }>(
			sql.raw(`SELECT routed_to_actor_id AS routed FROM threads WHERE id = 't-1'`),
		);
		expect(row?.routed).toBeNull();

		const audit = db.all<AuditRow>(
			sql.raw(
				`SELECT * FROM thread_routing_audit WHERE thread_id = 't-1' ORDER BY at DESC LIMIT 1`,
			),
		);
		expect(audit[0]?.from_actor_id).toBe("actor:cpo");
		expect(audit[0]?.to_actor_id).toBeNull();
	});

	it("400 when reason is empty", async () => {
		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason: "" }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("VALIDATION_ERROR");

		const audit = db.all<AuditRow>(
			sql.raw(`SELECT * FROM thread_routing_audit WHERE thread_id = 't-1'`),
		);
		expect(audit).toHaveLength(0);
	});

	it("400 when reason is missing entirely", async () => {
		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo" }),
		});
		expect(res.status).toBe(400);
	});

	it("400 or 404 when to_actor_id references an unknown actor", async () => {
		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:ghost", reason: "trying" }),
		});
		// Plan says 400 VALIDATION_ERROR; spec allows either 400 or 404.
		expect([400, 404]).toContain(res.status);

		const audit = db.all<AuditRow>(
			sql.raw(`SELECT * FROM thread_routing_audit WHERE thread_id = 't-1'`),
		);
		expect(audit).toHaveLength(0);
	});

	it("404 when the thread does not exist", async () => {
		const res = await app.request("/api/threads/t-missing/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason: "ghost thread" }),
		});
		expect(res.status).toBe(404);
	});

	it("401 when no actor is identifiable (no X-Actor-Id, no env fallback)", async () => {
		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason: "anonymous" }),
		});
		expect(res.status).toBe(401);
	});

	// L2 review (adversary W4 / fix #5): self-reassign is a 200 no-op.
	// No thread update, no audit row written.
	it("200 no-op when to_actor_id equals current routed_to_actor_id (self-reassign)", async () => {
		// First, route to CPO so we have a known non-null state.
		await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason: "first hop" }),
		});

		// Self-reassign: route CPO → CPO. Should 200, no new audit row.
		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason: "no-op confirm" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { audit: unknown };
		expect(body.audit).toBeNull();

		// Exactly one audit row total — the original first-hop only.
		const audit = db.all<AuditRow>(
			sql.raw("SELECT * FROM thread_routing_audit WHERE thread_id = 't-1'"),
		);
		expect(audit).toHaveLength(1);
		expect(audit[0]?.reason).toBe("first hop");
	});

	// L2 review (W5 / fix #12): reason length cap is 500 chars; 501 is rejected.
	it("400 when reason exceeds 500 characters", async () => {
		const longReason = "x".repeat(501);
		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason: longReason }),
		});
		expect(res.status).toBe(400);
	});

	it("accepts a 500-char reason at the boundary", async () => {
		const reason = "y".repeat(500);
		const res = await app.request("/api/threads/t-1/route", {
			method: "PATCH",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ to_actor_id: "actor:cpo", reason }),
		});
		expect(res.status).toBe(200);
	});
});

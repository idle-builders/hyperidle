/**
 * L2 — Founder/Actor Routing Schema (red phase, founder-conflict 409).
 *
 * Pins AC11/AC7 from `docs/work-packages/TRACK-L.md` L2:
 *
 *   "Conflict semantics: when both founders verdict the same thread, the
 *    second verdict is rejected with a 409 founder_conflict error and a
 *    payload that includes the first verdict."
 *
 * Plus from `.plan-L2.md` §3.5:
 *   - The verdict endpoint is POST /api/conversations/responses.
 *   - approverId is server-derived from the authenticated actor.
 *   - Programmatic actors (e.g. policy_engine) bypass the conflict check.
 *
 * These tests MUST fail today: there is no founder-conflict pre-check, the
 * actors table does not exist, and the existing route trusts body.approverId.
 */
import { createTestDb, type HyperIdleDb, items, products, teams, threads } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l2-conflict";
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

function seedThreadWithItems(db: HyperIdleDb, threadId: string, itemId: string): void {
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: NOW }).run();
	db.insert(teams)
		.values({ id: "team-1", productId: "p1", capacity: 1, activeBets: 0, formedAt: NOW })
		.run();
	db.insert(threads).values({ id: threadId, kind: "review", createdAt: NOW }).run();
	db.insert(items)
		.values({
			id: itemId,
			title: "Item",
			threadId,
			createdAt: NOW,
		})
		.run();
}

describe("L2: founder conflict on POST /api/conversations/responses", () => {
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
		seedThreadWithItems(db, "t-conflict", "item-1");
		// Multi-item thread: a second item used for the same-thread/different-item case.
		db.insert(items)
			.values({ id: "item-2", title: "Other", threadId: "t-conflict", createdAt: NOW })
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("first verdict by CEO succeeds; second verdict on same thread by CPO returns 409 founder_conflict", async () => {
		const first = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1", decision: "approve" }),
		});
		expect(first.status).toBe(201);

		const second = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:cpo" }),
			body: JSON.stringify({ itemId: "item-1", decision: "approve" }),
		});
		expect(second.status).toBe(409);
		const body = (await second.json()) as {
			error: string;
			code?: string;
			details?: Record<string, unknown>;
			existing_verdict?: { actor_id: string; at: string; action: string };
		};
		// Spec: error code FOUNDER_CONFLICT and a payload describing the first verdict.
		const errStr = `${body.error ?? ""} ${body.code ?? ""}`.toLowerCase();
		expect(errStr).toContain("founder_conflict");
		// Existing verdict payload — match either flat or nested-in-details shape.
		const existing =
			body.existing_verdict ??
			(body.details?.["existing_verdict"] as
				| { actor_id?: string; at?: string; action?: string }
				| undefined);
		expect(existing?.actor_id ?? existing?.["actor_id"]).toBe("actor:ceo");
	});

	it("second verdict on the same thread by the same actor (CEO) does NOT trigger 409", async () => {
		const r1 = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1", decision: "approve" }),
		});
		expect(r1.status).toBe(201);

		const r2 = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-2", decision: "approve" }),
		});
		expect(r2.status).toBe(201);
	});

	it("programmatic actor (policy_engine) prior verdict does not block a founder verdict", async () => {
		// Insert a programmatic verdict directly — no authenticated actor.
		const id = "resp-pe-1";
		db.run(
			sql.raw(
				`INSERT INTO responses (id, item_id, decision, approver_id, responded_at) VALUES ('${id}','item-1','comment','policy_engine','${NOW}')`,
			),
		);

		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1", decision: "approve" }),
		});
		// Founder verdict is allowed because the prior verdict's approver isn't a registered actor.
		expect(res.status).toBe(201);
	});

	it("approver_id is server-derived from the authenticated actor (body value is ignored)", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-1",
				decision: "approve",
				approverId: "actor:cpo", // attempt to spoof — must be ignored.
			}),
		});
		expect(res.status).toBe(201);
		const row = db.get<{ approver_id: string | null }>(
			sql.raw(
				"SELECT approver_id FROM responses WHERE item_id = 'item-1' ORDER BY responded_at DESC LIMIT 1",
			),
		);
		expect(row?.approver_id).toBe("actor:ceo");
	});

	it("409 details payload includes the existing verdict's action and timestamp", async () => {
		await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1", decision: "request-changes" }),
		});

		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:cpo" }),
			body: JSON.stringify({ itemId: "item-1", decision: "approve" }),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as {
			details?: Record<string, unknown>;
			existing_verdict?: { actor_id?: string; at?: string; action?: string };
		};
		const existing =
			body.existing_verdict ??
			(body.details?.["existing_verdict"] as
				| { actor_id?: string; at?: string; action?: string }
				| undefined);
		// `action` is the canonical key in the spec's body shape; allow `decision` too
		// to absorb a likely-implementation rename.
		const action =
			(existing as { action?: string; decision?: string } | undefined)?.action ??
			(existing as { action?: string; decision?: string } | undefined)?.decision;
		expect(action).toBe("request-changes");
		const at = existing?.at ?? (existing as { responded_at?: string } | undefined)?.responded_at;
		expect(typeof at).toBe("string");
		expect(at?.length ?? 0).toBeGreaterThan(0);
	});

	// L2 review (security CRIT-2 / adversary C1): an API-key holder must
	// not be able to forge a founder verdict by omitting `X-Actor-Id`
	// and putting an actor id in `body.approverId`. Without this guard
	// the conflict pre-check is silently bypassed.
	it("rejects body.approverId that matches a registered actor id when no X-Actor-Id is sent", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				itemId: "item-1",
				decision: "approve",
				approverId: "actor:ceo",
			}),
		});
		// Either 401 (canonical, recommended) or 403 — both communicate
		// "you cannot claim founder identity without authentication".
		expect([401, 403]).toContain(res.status);

		// No verdict row was inserted.
		const rows = db.all<{ id: string }>(
			sql.raw("SELECT id FROM responses WHERE item_id = 'item-1'"),
		);
		expect(rows).toHaveLength(0);
	});

	// L2 review (adversary C1, CEO + CPO concurrent verdict race): with
	// `behavior: 'immediate'` two parallel founder verdict requests
	// against the same thread serialise — exactly one inserts, the
	// other 409s. Best-effort simulation: fire both POSTs, expect
	// 1×201 + 1×409.
	it("two concurrent founder verdicts on the same thread produce exactly one 201 and one 409", async () => {
		const [r1, r2] = await Promise.all([
			app.request("/api/conversations/responses", {
				method: "POST",
				headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
				body: JSON.stringify({ itemId: "item-1", decision: "approve" }),
			}),
			app.request("/api/conversations/responses", {
				method: "POST",
				headers: authHeaders({ "X-Actor-Id": "actor:cpo" }),
				body: JSON.stringify({ itemId: "item-1", decision: "approve" }),
			}),
		]);
		const codes = [r1.status, r2.status].sort();
		expect(codes).toEqual([201, 409]);
	});
});

/**
 * L4 — Verdict undo endpoint (red phase).
 *
 * Pins the contract from `.plan-L4.md` § 3.2:
 *
 *   POST /api/threads/:threadId/verdict/undo
 *     200  → reverses the verdict; writes a new responses row with
 *             transition='undo', undoesResponseId set, decision = prior_decision.
 *     404  → no recent commit on this item (or thread/item missing).
 *     409  → agent has acted; body contains { error: "agent_already_acted",
 *             audit_row_id } where audit_row_id is the original commit response.id.
 *     410  → undo window expired (now > respondedAt + undo_window_seconds).
 *     403  → actorId of the request does not match approver_id of the verdict.
 *
 *   Audit duality:
 *     - Every commit gets transition='commit', prior_decision (nullable),
 *       undo_window_seconds snapshot.
 *     - Every undo gets transition='undo', prior_decision = the verdict it
 *       reverses, undoes_response_id = original.id, decision = prior_decision.
 *
 * These tests MUST fail today: the route does not exist, and the new
 * `responses` columns (`transition`, `prior_decision`, `undoes_response_id`,
 * `undo_window_seconds`) plus `items.agent_acted_at` have not yet been added.
 */
import { actors, createTestDb, type HyperIdleDb, items, products, threads } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-l4-undo";
const NOW_ISO = "2026-04-26T12:00:00.000Z";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

interface ResponseRow {
	id: string;
	item_id: string;
	decision: string;
	approver_id: string | null;
	responded_at: string;
	transition: string;
	prior_decision: string | null;
	undoes_response_id: string | null;
	undo_window_seconds: number | null;
}

function seedActorsAndItem(db: HyperIdleDb, overrideItemId = "item-1"): void {
	db.insert(actors)
		.values({
			id: "actor:ceo",
			role: "CEO",
			domainTags: '["market","growth","portfolio"]',
			createdAt: NOW_ISO,
		})
		.run();
	db.insert(actors)
		.values({
			id: "actor:cpo",
			role: "CPO",
			domainTags: '["product","design"]',
			createdAt: NOW_ISO,
		})
		.run();
	db.insert(products)
		.values({ id: "prod-1", name: "Demo", phase: "build", createdAt: NOW_ISO })
		.run();
	db.insert(threads).values({ id: "thread-1", kind: "review", createdAt: NOW_ISO }).run();
	db.insert(items)
		.values({
			id: overrideItemId,
			title: "Approve me",
			threadId: "thread-1",
			createdAt: NOW_ISO,
		})
		.run();
}

async function commitVerdict(
	app: Hono,
	body: { itemId: string; decision: string; actor: string },
): Promise<{ status: number; id?: string }> {
	const res = await app.request("/api/conversations/responses", {
		method: "POST",
		headers: authHeaders({ "X-Actor-Id": body.actor }),
		body: JSON.stringify({ itemId: body.itemId, decision: body.decision }),
	});
	const json = (await res.json().catch(() => null)) as { id?: string } | null;
	return { status: res.status, id: json?.id };
}

describe("L4: POST /api/threads/:threadId/verdict/undo", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndItem(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("200 happy path: undo reverses the verdict and writes an undo audit row", async () => {
		const commit = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(commit.status).toBe(201);
		expect(commit.id).toBeTruthy();

		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			undo_response_id: string;
			reverted_response_id: string;
			prior_decision: string | null;
		};
		expect(body.undo_response_id).toBeTruthy();
		expect(body.reverted_response_id).toBe(commit.id);
		expect(body.prior_decision).toBe("approve");

		// Audit log: now 2 rows for this item — commit + undo.
		const rows = db.all<ResponseRow>(
			sql.raw(`SELECT * FROM responses WHERE item_id = 'item-1' ORDER BY responded_at ASC`),
		);
		expect(rows).toHaveLength(2);
		expect(rows[0]?.transition).toBe("commit");
		expect(rows[0]?.decision).toBe("approve");
		expect(rows[0]?.prior_decision).toBeNull();
		expect(rows[0]?.undo_window_seconds).not.toBeNull();
		expect(rows[1]?.transition).toBe("undo");
		expect(rows[1]?.decision).toBeNull(); // undo rows do not carry a verdict
		expect(rows[1]?.prior_decision).toBe("approve");
		expect(rows[1]?.undoes_response_id).toBe(commit.id);
		expect(rows[1]?.approver_id).toBe("actor:ceo");
	});

	it("404 when there is no recent commit on the item", async () => {
		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string; code: string };
		expect(body.error).toBe("no_recent_verdict");
		expect(body.code).toBe("NOT_FOUND");
	});

	it("404 when the thread does not exist", async () => {
		const res = await app.request("/api/threads/thread-missing/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(res.status).toBe(404);
	});

	it("409 with { error: 'agent_already_acted', audit_row_id } when items.agent_acted_at is set after the commit", async () => {
		const commit = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(commit.status).toBe(201);

		// Simulate the agent runtime consuming the verdict. The ack
		// timestamp must be strictly LATER than the commit's responded_at
		// (the predicate is `agent_acted_at > responded_at`). Use a far-
		// future timestamp so it beats whatever the server stamped.
		db.run(
			sql.raw(`UPDATE items SET agent_acted_at = '2099-01-01T00:00:00.000Z' WHERE id = 'item-1'`),
		);

		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as {
			error: string;
			audit_row_id?: string;
			code: string;
		};
		expect(body.error).toBe("agent_already_acted");
		expect(body.audit_row_id).toBe(commit.id);
		expect(body.code).toBe("CONFLICT");
	});

	it("410 when the undo window has passed", async () => {
		const commit = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(commit.status).toBe(201);

		// Move the original commit's `responded_at` far enough back that
		// even a 15-second window is exhausted. Simpler than freezing Date.now.
		db.run(
			sql.raw(
				`UPDATE responses SET responded_at = '2025-01-01T00:00:00.000Z' WHERE id = '${commit.id}'`,
			),
		);

		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(res.status).toBe(410);
		const body = (await res.json()) as { error: string; code: string };
		expect(body.error).toBe("undo_window_expired");
		expect(body.code).toBe("GONE");
	});

	it("403 when actorId does not match the original approver_id (cross-founder undo blocked)", async () => {
		const commit = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(commit.status).toBe(201);

		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:cpo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string; code: string };
		expect(body.error).toBe("actor_mismatch");
		expect(body.code).toBe("FORBIDDEN");
	});

	it("400 when itemId is missing from body", async () => {
		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	// L4 review (security CRIT): identity is server-derived only. A body
	// `actorId` field is rejected by the strict zod schema so an API-key
	// holder cannot forge another actor's undo even if X-Actor-Id is set.
	it("400 when body smuggles an `actorId` field (strict schema rejects forged identity)", async () => {
		const commit = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(commit.status).toBe(201);

		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:cpo" }),
			body: JSON.stringify({ itemId: "item-1", actorId: "actor:ceo" }),
		});
		expect(res.status).toBe(400);

		const rows = db.all<ResponseRow>(sql.raw(`SELECT * FROM responses WHERE item_id = 'item-1'`));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.transition).toBe("commit");
	});

	// L4 review (security CRIT): no X-Actor-Id header → 401.
	it("401 when no X-Actor-Id header is supplied", async () => {
		await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});

		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(res.status).toBe(401);
	});

	// L4 review (security HIGH + adversary C2): the 409 predicate is
	// `agent_acted_at > responded_at` — not bare truthiness. A stale
	// agent_acted_at from a previous cycle must not block undo of a fresh
	// commit.
	it("200 when agent_acted_at is older than the latest commit (stale ack from prior cycle)", async () => {
		const commit = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(commit.status).toBe(201);

		// Stamp agent_acted_at to a time strictly BEFORE responded_at.
		db.run(
			sql.raw(`UPDATE items SET agent_acted_at = '2020-01-01T00:00:00.000Z' WHERE id = 'item-1'`),
		);

		const res = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(res.status).toBe(200);
	});

	// L4 review (adversary C1 / arch W1): commit→undo→commit must record
	// the live prior verdict (the original `approve`) — not the undo
	// row's NULL decision — as `prior_decision` on the second commit.
	it("commit→undo→commit chain: re-commit's prior_decision filters undo rows", async () => {
		const first = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(first.status).toBe(201);

		const undoRes = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(undoRes.status).toBe(200);

		const second = await commitVerdict(app, {
			itemId: "item-1",
			decision: "reject",
			actor: "actor:ceo",
		});
		expect(second.status).toBe(201);

		const rows = db.all<ResponseRow>(
			sql.raw(`SELECT * FROM responses WHERE item_id = 'item-1' ORDER BY responded_at ASC`),
		);
		expect(rows).toHaveLength(3);
		expect(rows[0]?.transition).toBe("commit");
		expect(rows[0]?.decision).toBe("approve");
		expect(rows[1]?.transition).toBe("undo");
		expect(rows[1]?.decision).toBeNull();
		expect(rows[2]?.transition).toBe("commit");
		expect(rows[2]?.decision).toBe("reject");
		// The chain semantics: prior_decision on the re-commit must be
		// the original `approve` (the live verdict before the undo), not
		// the undo row's NULL decision.
		expect(rows[2]?.prior_decision).toBe("approve");
	});

	it("idempotent: a second undo against the same item returns 404 (no live commit to reverse)", async () => {
		const commit = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(commit.status).toBe(201);

		const first = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(first.status).toBe(200);

		const second = await app.request("/api/threads/thread-1/verdict/undo", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({ itemId: "item-1" }),
		});
		expect(second.status).toBe(404);
	});
});

describe("L4: commit-side audit shape", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedActorsAndItem(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("a commit writes transition='commit', prior_decision=null on first commit, undo_window_seconds set", async () => {
		const commit = await commitVerdict(app, {
			itemId: "item-1",
			decision: "approve",
			actor: "actor:ceo",
		});
		expect(commit.status).toBe(201);

		const row = db.get<ResponseRow>(sql.raw(`SELECT * FROM responses WHERE id = '${commit.id}'`));
		expect(row?.transition).toBe("commit");
		expect(row?.prior_decision).toBeNull();
		expect(row?.undoes_response_id).toBeNull();
		expect(row?.undo_window_seconds).not.toBeNull();
		expect(typeof row?.undo_window_seconds).toBe("number");
	});
});

/**
 * Q2 — Knowledge route tests (AC-1, AC-4, AC-6, AC-7, AC-8, AC-9, AC-10).
 *
 * Red phase: none of the Q2 features exist yet. These tests will fail
 * until the implementation phases are complete.
 *
 * Covers:
 * - AC-1: scope_kind + scope_id columns on knowledgeItems table (via DB)
 * - AC-4: scope validation at API boundary (closed enum, scopeId required for non-factory)
 * - AC-6: user-scoped items visible only to their author
 * - AC-7: PATCH /:id/scope changes scope, bumps version, logs changes
 * - AC-8: all 7 scope kinds use the same schema and lifecycle
 * - AC-9: fabric layer assigned on creation (factory→L4, product→L2, etc.)
 * - AC-10: invalid scopeKind → 400; valid ones → 201
 */

import {
	createTestDb,
	type HyperIdleDb,
	knowledgeEditLog,
	knowledgeItems,
	knowledgeStrategyFabric,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-q2-knowledge";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/**
 * Seed a human user row so the auth middleware resolves a consistent userId.
 * @lore P2: After the P2 rename, auth reads from users WHERE kind='human' LIMIT 1
 * instead of factorySettings.founder_id. seedFounder inserts a human user row.
 */
function seedFounder(db: HyperIdleDb, userId: string): void {
	db.insert(users)
		.values({
			id: userId,
			name: "Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		})
		.run();
}

// ---------------------------------------------------------------------------
// AC-1: scope_kind + scope_id columns exist on knowledgeItems table
// ---------------------------------------------------------------------------
describe("Q2 AC-1: scope_kind + scope_id columns on knowledgeItems", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it("knowledgeItems table has a scope_kind column (NOT NULL, default factory)", () => {
		// SQLite PRAGMA returns snake_case column names; use Record<string, unknown>
		// to avoid biome useNamingConvention lint on the PRAGMA output shape.
		const columns = db.all<Record<string, unknown>>(sql`PRAGMA table_info(knowledge_items)`);

		const scopeKindCol = columns.find((c) => c["name"] === "scope_kind");
		expect(scopeKindCol).toBeDefined();
		expect(scopeKindCol?.["notnull"]).toBe(1);
		expect(scopeKindCol?.["dflt_value"]).toBe("'factory'");
	});

	it("knowledgeItems table has a scope_id column (nullable)", () => {
		const columns = db.all<Record<string, unknown>>(sql`PRAGMA table_info(knowledge_items)`);

		const scopeIdCol = columns.find((c) => c["name"] === "scope_id");
		expect(scopeIdCol).toBeDefined();
		expect(scopeIdCol?.["notnull"]).toBe(0);
	});

	it("ki_scope_idx index exists on (scope_kind, scope_id)", () => {
		const indexes = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_items' AND name NOT LIKE 'sqlite_%'`,
			)
			.map((r) => r.name);

		expect(indexes).toContain("ki_scope_idx");
	});

	it("can insert a knowledge item with scopeKind=factory and retrieve it", () => {
		const now = new Date().toISOString();
		db.insert(knowledgeItems)
			.values({
				id: "ki-scope-1",
				scopeKind: "factory",
				scopeId: null,
				title: "Test",
				body: "Body",
				format: "markdown",
				status: "draft",
				version: 1,
				updatedBy: "u-founder",
				createdAt: now,
				updatedAt: now,
			})
			.run();

		const result = db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, "ki-scope-1"))
			.get();

		expect(result?.scopeKind).toBe("factory");
		expect(result?.scopeId).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-4: API creation validation — scopeKind required, scopeId required for non-factory
// ---------------------------------------------------------------------------
describe("Q2 AC-4: POST /api/knowledge scope validation", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedFounder(db, "u-founder");
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("POST without scopeKind returns 400", async () => {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "No scope",
				body: "Body content",
				format: "markdown",
				updatedBy: "u-founder",
			}),
		});
		expect(res.status).toBe(400);
	});

	it("POST with invalid scopeKind returns 400", async () => {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Bad scope",
				body: "Body content",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "invalid_scope",
			}),
		});
		expect(res.status).toBe(400);
	});

	it("POST with scopeKind=product and no scopeId returns 400", async () => {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Product scope no id",
				body: "Body content",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "product",
			}),
		});
		expect(res.status).toBe(400);
	});

	it("POST with scopeKind=factory and no scopeId returns 201 (factory needs no scopeId)", async () => {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Factory item",
				body: "Body content",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "factory",
			}),
		});
		expect(res.status).toBe(201);
	});

	it("POST with scopeKind=user and no scopeId returns 201 (user scope auto-fills userId)", async () => {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "User private note",
				body: "My private thoughts",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "user",
			}),
		});
		expect(res.status).toBe(201);
	});

	it("POST with scopeKind=bet and scopeId=bet-123 returns 201", async () => {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Bet knowledge",
				body: "What we learned from this bet",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "bet",
				scopeId: "bet-123",
			}),
		});
		expect(res.status).toBe(201);
	});

	it("POST returns scopeKind and scopeId in response", async () => {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Bet item",
				body: "Body",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "bet",
				scopeId: "bet-abc",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { scopeKind: string; scopeId: string };
		expect(body.scopeKind).toBe("bet");
		expect(body.scopeId).toBe("bet-abc");
	});
});

// ---------------------------------------------------------------------------
// AC-6: User-scoped items visible only to their author
// ---------------------------------------------------------------------------
describe("Q2 AC-6: user-scoped item visibility", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("user-A's private item appears in list for user-A", async () => {
		seedFounder(db, "user-A");
		app = createTestApp({ db, eventBus: new EventBus() });

		// Create user-scoped item as user-A
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "My private note",
				body: "Only I can see this",
				format: "markdown",
				updatedBy: "user-A",
				scopeKind: "user",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string };

		// List as user-A — should be visible
		const listRes = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(listRes.status).toBe(200);
		const list = (await listRes.json()) as { items: Array<{ id: string }> };
		const ids = list.items.map((i) => i.id);
		expect(ids).toContain(created.id);
	});

	it("user-A's private item NOT visible to user-B (list endpoint)", async () => {
		// Create item as user-A
		seedFounder(db, "user-A");
		const appA = createTestApp({ db, eventBus: new EventBus() });
		const createRes = await appA.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "My private note",
				body: "Only I can see this",
				format: "markdown",
				updatedBy: "user-A",
				scopeKind: "user",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string };

		// Switch to user-B: demote user-A to AI kind, insert user-B as human
		// @lore P2: auth reads users WHERE kind='human' LIMIT 1, not factorySettings
		db.update(users).set({ kind: "ai" }).where(eq(users.id, "user-A")).run();
		db.insert(users)
			.values({
				id: "user-B",
				name: "User B",
				role: "founder",
				status: "active",
				kind: "human",
				createdAt: new Date().toISOString(),
			})
			.run();

		const appB = createTestApp({ db, eventBus: new EventBus() });
		const listRes = await appB.request("/api/knowledge", { headers: authHeaders() });
		expect(listRes.status).toBe(200);
		const list = (await listRes.json()) as { items: Array<{ id: string }> };
		const ids = list.items.map((i) => i.id);
		expect(ids).not.toContain(created.id);
	});

	it("GET /:id returns 404 for user-A's private item when requested as user-B", async () => {
		// Create item as user-A
		seedFounder(db, "user-A");
		const appA = createTestApp({ db, eventBus: new EventBus() });
		const createRes = await appA.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Private item",
				body: "Body",
				format: "markdown",
				updatedBy: "user-A",
				scopeKind: "user",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string };

		// Switch to user-B: demote user-A to AI kind, insert user-B as human
		// @lore P2: auth reads users WHERE kind='human' LIMIT 1, not factorySettings
		db.update(users).set({ kind: "ai" }).where(eq(users.id, "user-A")).run();
		db.insert(users)
			.values({
				id: "user-B",
				name: "User B",
				role: "founder",
				status: "active",
				kind: "human",
				createdAt: new Date().toISOString(),
			})
			.run();

		const appB = createTestApp({ db, eventBus: new EventBus() });
		const getRes = await appB.request(`/api/knowledge/${created.id}`, {
			headers: authHeaders(),
		});
		// 404, not 403 — don't leak existence
		expect(getRes.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// AC-7: PATCH /:id/scope — scope change with version tracking and edit log
// ---------------------------------------------------------------------------
describe("Q2 AC-7: PATCH /:id/scope scope mutation", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedFounder(db, "u-founder");
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function createUserItem(): Promise<{ id: string; version: number }> {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Scope test item",
				body: "Body content",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "user",
			}),
		});
		expect(res.status).toBe(201);
		return res.json() as Promise<{ id: string; version: number }>;
	}

	it("PATCH /:id/scope changes scope_kind and scope_id", async () => {
		const item = await createUserItem();

		const patchRes = await app.request(`/api/knowledge/${item.id}/scope`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-123",
				reason: "Promoted to product knowledge",
				updatedBy: "u-founder",
				version: item.version,
			}),
		});
		expect(patchRes.status).toBe(200);
		const updated = (await patchRes.json()) as {
			scopeKind: string;
			scopeId: string;
			version: number;
		};
		expect(updated.scopeKind).toBe("product");
		expect(updated.scopeId).toBe("prod-123");
	});

	it("PATCH /:id/scope bumps version by 1", async () => {
		const item = await createUserItem();
		const originalVersion = item.version;

		const patchRes = await app.request(`/api/knowledge/${item.id}/scope`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				reason: "Promoting",
				updatedBy: "u-founder",
				version: originalVersion,
			}),
		});
		expect(patchRes.status).toBe(200);
		const updated = (await patchRes.json()) as { version: number };
		expect(updated.version).toBe(originalVersion + 1);
	});

	it("PATCH /:id/scope logs scope_kind change in knowledgeEditLog", async () => {
		const item = await createUserItem();

		await app.request(`/api/knowledge/${item.id}/scope`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-xyz",
				reason: "Promoted because useful to whole product",
				updatedBy: "u-founder",
				version: item.version,
			}),
		});

		const logs = db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id))
			.all();

		const scopeKindLog = logs.find((l) => l.field === "scope_kind");
		expect(scopeKindLog).toBeDefined();
		expect(scopeKindLog?.oldValue).toBe("user");
		expect(scopeKindLog?.newValue).toContain("product");
	});

	it("PATCH /:id/scope reason is captured in edit log", async () => {
		const item = await createUserItem();
		const reason = "Promoted to product level";

		await app.request(`/api/knowledge/${item.id}/scope`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				reason,
				updatedBy: "u-founder",
				version: item.version,
			}),
		});

		const logs = db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id))
			.all();

		// At least one log entry should contain the reason
		const hasReason = logs.some(
			(l) => l.newValue?.includes(reason) || l.oldValue?.includes(reason),
		);
		expect(hasReason).toBe(true);
	});

	it("PATCH /:id/scope with wrong version returns 409", async () => {
		const item = await createUserItem();

		const patchRes = await app.request(`/api/knowledge/${item.id}/scope`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				reason: "Moving",
				updatedBy: "u-founder",
				version: item.version + 99, // wrong version
			}),
		});
		expect(patchRes.status).toBe(409);
	});

	it("PATCH /:id/scope on missing item returns 404", async () => {
		const patchRes = await app.request("/api/knowledge/nonexistent-id/scope", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				reason: "Moving",
				updatedBy: "u-founder",
				version: 1,
			}),
		});
		expect(patchRes.status).toBe(404);
	});

	it("PATCH /:id/scope with invalid scopeKind returns 400", async () => {
		const item = await createUserItem();

		const patchRes = await app.request(`/api/knowledge/${item.id}/scope`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "invalid_kind",
				scopeId: null,
				reason: "Moving",
				updatedBy: "u-founder",
				version: item.version,
			}),
		});
		expect(patchRes.status).toBe(400);
	});

	it("PATCH /:id/scope with missing reason returns 400", async () => {
		const item = await createUserItem();

		const patchRes = await app.request(`/api/knowledge/${item.id}/scope`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				reason: "", // empty reason
				updatedBy: "u-founder",
				version: item.version,
			}),
		});
		expect(patchRes.status).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// AC-8: All 7 scope kinds use the same schema
// ---------------------------------------------------------------------------
describe("Q2 AC-8: all scope kinds use the same schema and lifecycle", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedFounder(db, "u-founder");
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	const SCOPE_TEST_CASES: Array<{
		scopeKind: string;
		scopeId: string | null;
	}> = [
		{ scopeKind: "factory", scopeId: null },
		{ scopeKind: "product", scopeId: "prod-1" },
		{ scopeKind: "practice", scopeId: "fe-practice" },
		{ scopeKind: "team", scopeId: "team-1" },
		{ scopeKind: "bet", scopeId: "bet-1" },
		{ scopeKind: "task", scopeId: "task-1" },
		{ scopeKind: "user", scopeId: null },
	];

	for (const { scopeKind, scopeId } of SCOPE_TEST_CASES) {
		it(`creates a ${scopeKind}-scoped item and reads it back with full field set`, async () => {
			const payload: Record<string, unknown> = {
				title: `${scopeKind} knowledge`,
				body: "Test body",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind,
			};
			if (scopeId !== null) {
				payload.scopeId = scopeId;
			}

			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});
			expect(res.status).toBe(201);

			const created = (await res.json()) as {
				id: string;
				scopeKind: string;
				scopeId: string | null;
				title: string;
				body: string;
				format: string;
				status: string;
				version: number;
				updatedBy: string;
			};

			expect(created.scopeKind).toBe(scopeKind);
			// factory and user have no scopeId, others have the one we sent
			if (scopeId !== null) {
				expect(created.scopeId).toBe(scopeId);
			}
			expect(created.title).toBe(`${scopeKind} knowledge`);
			expect(created.version).toBe(1);
			// All scope kinds get the same fields
			expect(created).toHaveProperty("id");
			expect(created).toHaveProperty("body");
			expect(created).toHaveProperty("format");
			expect(created).toHaveProperty("status");
			expect(created).toHaveProperty("updatedBy");
		});
	}
});

// ---------------------------------------------------------------------------
// AC-9: Fabric layer assigned on creation
// ---------------------------------------------------------------------------
describe("Q2 AC-9: fabric layer assignment on creation", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedFounder(db, "u-founder");
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function createItem(scopeKind: string, scopeId: string | null): Promise<string> {
		const payload: Record<string, unknown> = {
			title: `${scopeKind} item`,
			body: "Test body",
			format: "markdown",
			updatedBy: "u-founder",
			scopeKind,
		};
		if (scopeId !== null) {
			payload.scopeId = scopeId;
		}
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(payload),
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as { id: string };
		return created.id;
	}

	it("factory-scoped item gets fabric row with layer=L4", async () => {
		const id = await createItem("factory", null);
		const fabricRow = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
			.get();
		expect(fabricRow?.layer).toBe("L4");
	});

	it("product-scoped item gets fabric row with layer=L2", async () => {
		const id = await createItem("product", "prod-1");
		const fabricRow = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
			.get();
		expect(fabricRow?.layer).toBe("L2");
	});

	it("practice-scoped item gets fabric row with layer=L3", async () => {
		const id = await createItem("practice", "fe-practice");
		const fabricRow = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
			.get();
		expect(fabricRow?.layer).toBe("L3");
	});

	it("task-scoped item gets fabric row with layer=L1", async () => {
		const id = await createItem("task", "task-1");
		const fabricRow = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
			.get();
		expect(fabricRow?.layer).toBe("L1");
	});

	it("bet-scoped item has no layer (null) in fabric", async () => {
		const id = await createItem("bet", "bet-1");
		const fabricRow = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
			.get();
		// bet has null layer — fabric row may not exist or has null layer
		expect(fabricRow?.layer ?? null).toBeNull();
	});

	it("team-scoped item has no layer (null) in fabric", async () => {
		const id = await createItem("team", "team-1");
		const fabricRow = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
			.get();
		expect(fabricRow?.layer ?? null).toBeNull();
	});

	it("user-scoped item has no layer (null) in fabric", async () => {
		const id = await createItem("user", null);
		const fabricRow = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
			.get();
		expect(fabricRow?.layer ?? null).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-10: Scope validation — closed enum at API boundary
// ---------------------------------------------------------------------------
describe("Q2 AC-10: scope_kind closed enum validation at API boundary", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedFounder(db, "u-founder");
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	const INVALID_SCOPES = ["FACTORY", "Practice", "global", "all", "", "null", "undefined"];

	for (const invalid of INVALID_SCOPES) {
		it(`POST with scopeKind="${invalid}" returns 400`, async () => {
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Test",
					body: "Body",
					format: "markdown",
					updatedBy: "u-founder",
					scopeKind: invalid,
					scopeId: "some-id",
				}),
			});
			expect(res.status).toBe(400);
		});
	}

	const VALID_SCOPES = [
		{ kind: "factory", id: null },
		{ kind: "product", id: "prod-1" },
		{ kind: "practice", id: "fe" },
		{ kind: "team", id: "team-1" },
		{ kind: "bet", id: "bet-1" },
		{ kind: "task", id: "task-1" },
		{ kind: "user", id: null },
	];

	for (const { kind, id } of VALID_SCOPES) {
		it(`POST with valid scopeKind="${kind}" returns 201`, async () => {
			const payload: Record<string, unknown> = {
				title: `${kind} item`,
				body: "Body",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: kind,
			};
			if (id !== null) payload.scopeId = id;

			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});
			expect(res.status).toBe(201);
		});
	}
});

// ---------------------------------------------------------------------------
// AC-9 (continuation): Layer reassignment on scope change
// ---------------------------------------------------------------------------
describe("Q2 AC-9: fabric layer reassignment after scope change", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedFounder(db, "u-founder");
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("fabric layer updated when scope changes from user (null) to product (L2)", async () => {
		// Create as user scope
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Scope change test",
				body: "Body",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "user",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string; version: number };

		// Verify no fabric layer initially (user → null)
		const beforeFabric = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, created.id))
			.get();
		expect(beforeFabric?.layer ?? null).toBeNull();

		// Change scope to product
		const patchRes = await app.request(`/api/knowledge/${created.id}/scope`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				reason: "Promoting to product",
				updatedBy: "u-founder",
				version: created.version,
			}),
		});
		expect(patchRes.status).toBe(200);

		// Verify fabric now has L2
		const afterFabric = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, created.id))
			.get();
		expect(afterFabric?.layer).toBe("L2");
	});
});

// ---------------------------------------------------------------------------
// GET /api/teams — new lightweight endpoint
// ---------------------------------------------------------------------------
describe("Q2 GET /api/teams endpoint", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedFounder(db, "u-founder");
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("GET /api/teams returns 200 with teams array", async () => {
		const res = await app.request("/api/teams", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { teams: unknown[] };
		expect(body).toHaveProperty("teams");
		expect(Array.isArray(body.teams)).toBe(true);
	});
});

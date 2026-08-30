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
 * - AC-7: scope changes through PATCH /:id, bumps version, logs changes
 * - AC-8: all 7 scope kinds use the same schema and lifecycle
 * - AC-9: fabric layer assigned on creation (factory→L4, product→L2, etc.)
 * - AC-10: invalid scopeKind → 400; valid ones → 201
 */

import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-q2-knowledge";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/**
 * Seed a human user row so the auth middleware resolves a consistent userId.
 * @lore P2: After the P2 rename, auth reads from users WHERE kind='human' LIMIT 1
 * instead of factorySettings.founder_id. seedFounder inserts a human user row.
 */
async function seedFounder(db: HyperIdleDb, userId: string): Promise<void> {
	await db.insert(users).values({
		id: userId,
		name: "Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});
}

// ---------------------------------------------------------------------------
// AC-1: scope_kind + scope_id columns exist on knowledgeItems table
// ---------------------------------------------------------------------------
describe("Q2 AC-1: scope_kind + scope_id columns on knowledgeItems", () => {
	test("knowledgeItems table has a scope_kind column (NOT NULL, default factory)", async ({
		db,
	}) => {
		// PGlite uses real PostgreSQL — query information_schema instead of SQLite PRAGMA.
		// Row keys use snake_case from Postgres — access via bracket notation to avoid
		// biome useNamingConvention on local type definitions.
		const result = await db.execute(
			`SELECT column_name, is_nullable, column_default
			 FROM information_schema.columns
			 WHERE table_name = 'knowledge_items'` as Parameters<typeof db.execute>[0],
		);
		const columns = (result as { rows: Array<Record<string, unknown>> }).rows;

		const scopeKindCol = columns.find((c) => c.column_name === "scope_kind");
		expect(scopeKindCol).toBeDefined();
		expect(scopeKindCol?.is_nullable).toBe("NO");
		expect(scopeKindCol?.column_default).toBe("'factory'::text");
	});

	test("knowledgeItems table has a scope_id column (nullable)", async ({ db }) => {
		const result = await db.execute(
			`SELECT column_name, is_nullable
			 FROM information_schema.columns
			 WHERE table_name = 'knowledge_items'` as Parameters<typeof db.execute>[0],
		);
		const columns = (result as { rows: Array<Record<string, unknown>> }).rows;

		const scopeIdCol = columns.find((c) => c.column_name === "scope_id");
		expect(scopeIdCol).toBeDefined();
		expect(scopeIdCol?.is_nullable).toBe("YES");
	});

	test("ki_scope_idx index exists on (scope_kind, scope_id)", async ({ db }) => {
		const result = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = 'knowledge_items'` as Parameters<
				typeof db.execute
			>[0],
		);
		const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname);

		expect(indexes).toContain("ki_scope_idx");
	});

	test("can insert a knowledge item with scopeKind=factory and retrieve it", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(knowledgeItems).values({
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
		});
		// The owner writes the projection row alongside the item.
		await db
			.insert(knowledgeAppProjection)
			.values({ id: "ki-scope-1-projection", knowledgeItemId: "ki-scope-1" });

		const [result] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, "ki-scope-1"));

		expect(result?.scopeKind).toBe("factory");
		expect(result?.scopeId).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-4: API creation validation — scopeKind required, scopeId required for non-factory
// ---------------------------------------------------------------------------
describe("Q2 AC-4: POST /api/knowledge scope validation", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST without scopeKind returns 400", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
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

	test("POST with invalid scopeKind returns 400", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
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

	test("POST with scopeKind=product and no scopeId returns 400", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
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

	test("POST with scopeKind=factory and no scopeId returns 201 (factory needs no scopeId)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-founder");
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

	test("POST with scopeKind=user and no scopeId returns 201 (user scope auto-fills userId)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-founder");
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

	// BB1: scopeKind="bet" removed — use "task" instead for task-scoped knowledge.
	test("POST with scopeKind=task and scopeId=task-123 returns 201", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Task knowledge",
				body: "What we learned from this task",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "task",
				scopeId: "task-123",
			}),
		});
		expect(res.status).toBe(201);
	});

	test("POST returns scopeKind and scopeId in response", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Task item",
				body: "Body",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "task",
				scopeId: "task-abc",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { scopeKind: string; scopeId: string };
		// BB1: "bet" scope removed; "task" is the equivalent work-scoped kind.
		expect(body.scopeKind).toBe("task");
		expect(body.scopeId).toBe("task-abc");
	});
});

// ---------------------------------------------------------------------------
// AC-6: User-scoped items visible only to their author
// ---------------------------------------------------------------------------
describe("Q2 AC-6: user-scoped item visibility", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("user-A's private item appears in list for user-A", async ({ db, eventBus }) => {
		await seedFounder(db, "user-A");
		const app = await createTestApp({ db, eventBus });

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

	test("user-A's private item NOT visible to user-B (list endpoint)", async ({ db }) => {
		// Create item as user-A
		await seedFounder(db, "user-A");
		const appA = await createTestApp({ db, eventBus: new EventBus() });
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
		await db.update(users).set({ kind: "ai" }).where(eq(users.id, "user-A"));
		await db.insert(users).values({
			id: "user-B",
			name: "User B",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

		const appB = await createTestApp({ db, eventBus: new EventBus() });
		const listRes = await appB.request("/api/knowledge", { headers: authHeaders() });
		expect(listRes.status).toBe(200);
		const list = (await listRes.json()) as { items: Array<{ id: string }> };
		const ids = list.items.map((i) => i.id);
		expect(ids).not.toContain(created.id);
	});

	test("GET /:id returns 404 for user-A's private item when requested as user-B", async ({
		db,
	}) => {
		// Create item as user-A
		await seedFounder(db, "user-A");
		const appA = await createTestApp({ db, eventBus: new EventBus() });
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
		await db.update(users).set({ kind: "ai" }).where(eq(users.id, "user-A"));
		await db.insert(users).values({
			id: "user-B",
			name: "User B",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

		const appB = await createTestApp({ db, eventBus: new EventBus() });
		const getRes = await appB.request(`/api/knowledge/${created.id}`, {
			headers: authHeaders(),
		});
		// 404, not 403 — don't leak existence
		expect(getRes.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// AC-7: scope change with version tracking and edit log — through PATCH /:id.
// The separate /:id/scope endpoint and the `reason` it demanded are deleted;
// scope is a field on the document and is edited with the rest of them.
// ---------------------------------------------------------------------------
describe("Q2 AC-7: scope mutation through PATCH /:id", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function createUserItem(
		app: Awaited<ReturnType<typeof createTestApp>>,
	): Promise<{ id: string; version: number }> {
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

	test("PATCH /:id changes scope_kind and scope_id", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const item = await createUserItem(app);

		const patchRes = await app.request(`/api/knowledge/${item.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-123",
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

	test("a scope change bumps version by 1", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const item = await createUserItem(app);
		const originalVersion = item.version;

		const patchRes = await app.request(`/api/knowledge/${item.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				updatedBy: "u-founder",
				version: originalVersion,
			}),
		});
		expect(patchRes.status).toBe(200);
		const updated = (await patchRes.json()) as { version: number };
		expect(updated.version).toBe(originalVersion + 1);
	});

	test("a scope change is written to knowledgeEditLog", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const item = await createUserItem(app);

		await app.request(`/api/knowledge/${item.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-xyz",
				updatedBy: "u-founder",
				version: item.version,
			}),
		});

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));

		const scopeKindLog = logs.find((l) => l.field === "scopeKind");
		expect(scopeKindLog).toBeDefined();
		expect(scopeKindLog?.oldValue).toBe("user");
		expect(scopeKindLog?.newValue).toContain("product");
	});

	test("PATCH /:id/scope with wrong version returns 409", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const item = await createUserItem(app);

		const patchRes = await app.request(`/api/knowledge/${item.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				updatedBy: "u-founder",
				version: item.version + 99, // wrong version
			}),
		});
		expect(patchRes.status).toBe(409);
	});

	test("PATCH /:id/scope on missing item returns 404", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const patchRes = await app.request("/api/knowledge/nonexistent-id/scope", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				updatedBy: "u-founder",
				version: 1,
			}),
		});
		expect(patchRes.status).toBe(404);
	});

	test("PATCH /:id/scope with invalid scopeKind returns 400", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const item = await createUserItem(app);

		const patchRes = await app.request(`/api/knowledge/${item.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "invalid_kind",
				scopeId: null,
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
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
		// BB1: "bet" scopeKind removed — "task" covers work-scoped items.
		{ scopeKind: "task", scopeId: "task-1" },
		{ scopeKind: "user", scopeId: null },
	];

	for (const { scopeKind, scopeId } of SCOPE_TEST_CASES) {
		test(`creates a ${scopeKind}-scoped item and reads it back with full field set`, async ({
			db,
			app,
		}) => {
			await seedFounder(db, "u-founder");
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
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function createItem(
		app: Awaited<ReturnType<typeof createTestApp>>,
		scopeKind: string,
		scopeId: string | null,
	): Promise<string> {
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

	test("factory-scoped item gets fabric row with layer=L4", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const id = await createItem(app, "factory", null);
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(fabricRow?.layer).toBe("L4");
	});

	test("product-scoped item gets fabric row with layer=L2", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const id = await createItem(app, "product", "prod-1");
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(fabricRow?.layer).toBe("L2");
	});

	test("practice-scoped item gets fabric row with layer=L3", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const id = await createItem(app, "practice", "fe-practice");
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(fabricRow?.layer).toBe("L3");
	});

	test("task-scoped item gets fabric row with layer=L1", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const id = await createItem(app, "task", "task-1");
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(fabricRow?.layer).toBe("L1");
	});

	// BB1: "bet" scope removed. All task-scoped items (root or subtask) get layer=L1
	// because scopeKind drives layer assignment, not task depth.
	test("task-scoped item (root task) also gets layer=L1 in fabric", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const id = await createItem(app, "task", "task-root-1");
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(fabricRow?.layer).toBe("L1");
	});

	test("team-scoped item has no layer (null) in fabric", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const id = await createItem(app, "team", "team-1");
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(fabricRow?.layer ?? null).toBeNull();
	});

	test("user-scoped item has no layer (null) in fabric", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const id = await createItem(app, "user", null);
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(fabricRow?.layer ?? null).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-10: Scope validation — closed enum at API boundary
// ---------------------------------------------------------------------------
describe("Q2 AC-10: scope_kind closed enum validation at API boundary", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	const INVALID_SCOPES = ["FACTORY", "Practice", "global", "all", "", "null", "undefined"];

	for (const invalid of INVALID_SCOPES) {
		test(`POST with scopeKind="${invalid}" returns 400`, async ({ db, app }) => {
			await seedFounder(db, "u-founder");
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
		// BB1: "bet" scopeKind removed — tasks are the single work primitive.
		{ kind: "task", id: "task-1" },
		{ kind: "user", id: null },
	];

	for (const { kind, id } of VALID_SCOPES) {
		test(`POST with valid scopeKind="${kind}" returns 201`, async ({ db, app }) => {
			await seedFounder(db, "u-founder");
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
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("fabric layer updated when scope changes from user (null) to product (L2)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-founder");
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
		const [beforeFabric] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, created.id));
		expect(beforeFabric?.layer ?? null).toBeNull();

		// Change scope to product
		const patchRes = await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				scopeKind: "product",
				scopeId: "prod-abc",
				updatedBy: "u-founder",
				version: created.version,
			}),
		});
		expect(patchRes.status).toBe(200);

		// Verify fabric now has L2
		const [afterFabric] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, created.id));
		expect(afterFabric?.layer).toBe("L2");
	});
});

// ---------------------------------------------------------------------------
// GET /api/teams — new lightweight endpoint
// ---------------------------------------------------------------------------
describe("Q2 GET /api/teams endpoint", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/teams returns 200 with teams array", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const res = await app.request("/api/teams", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { teams: unknown[] };
		expect(body).toHaveProperty("teams");
		expect(Array.isArray(body.teams)).toBe(true);
	});
});

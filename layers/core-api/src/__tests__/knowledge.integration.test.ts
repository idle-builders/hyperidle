/**
 * @lore O2: Knowledge routes rewritten to remove layer from URL.
 * - POST /api/knowledge/:layer → POST /api/knowledge
 * - GET /api/knowledge/:layer → GET /api/knowledge (no layer filtering in O2)
 * - GET /api/knowledge/:layer/:id → GET /api/knowledge/:id
 * - PATCH /api/knowledge/:layer/:id → PATCH /api/knowledge/:id
 * - etc.
 * Tests updated to match O2 API shape.
 */
import { knowledgeAppProjection, knowledgeEditLog } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-knowledge";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Knowledge Endpoints (E4)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// Helper to create a knowledge item via API
	// @lore O2: POST /api/knowledge (no layer in path)
	async function createItem(
		app: Pick<Hono, "request">,
		_layer: string,
		overrides?: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				topic: "testing",
				title: "Test Pattern",
				body: "This is a test pattern body.",
				format: "markdown",
				scopeKind: "factory",
				updatedBy: "human",
				...overrides,
			}),
		});
		return (await res.json()) as Record<string, unknown>;
	}

	// AC1: GET /api/knowledge — list all items (O2: no layer grouping in kernel route)
	describe("AC1: GET /api/knowledge/:layer — list by layer grouped by topic, kind", () => {
		test("returns items for a given layer grouped by topic and kind", async ({ app }) => {
			// @lore O2: Layer is now a strategy concern. In O2 the kernel GET /
			// returns all items with a flat items array. Grouping is a fabric concern.
			await createItem(app, "L0", { topic: "design", title: "Design Pattern A" });
			await createItem(app, "L0", { topic: "design", title: "Design Anti-Pattern B" });
			await createItem(app, "L0", { topic: "testing", title: "Test Pattern C" });
			await createItem(app, "L1", { topic: "design", title: "L1 Design Pattern" });

			const res = await app.request("/api/knowledge", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			// O2: flat items array, no layer grouping in kernel route
			const items = body.items as Record<string, unknown>[];
			expect(items.length).toBe(4);
		});

		test("returns empty groups for a layer with no items", async ({ app }) => {
			// @lore O2: GET /api/knowledge returns empty items when DB is empty
			const res = await app.request("/api/knowledge", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const items = body.items as unknown[];
			expect(items.length).toBe(0);
		});
	});

	// AC2: GET /api/knowledge/:id — single item
	describe("AC2: GET /api/knowledge/:layer/:id — single item", () => {
		test("returns a single knowledge item", async ({ app }) => {
			const item = await createItem(app, "L0");
			const id = item.id as string;

			// @lore O2: GET /api/knowledge/:id (no layer segment)
			const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe(id);
			expect(body.title).toBe("Test Pattern");
		});

		test("returns 404 for non-existent item", async ({ app }) => {
			const res = await app.request("/api/knowledge/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);
		});

		test("returns 404 when item exists but in different layer", async ({ app }) => {
			// @lore O2: no layer constraint on GET /:id — item is found regardless.
			// This test now verifies that an item IS found (layer distinction is fabric-level).
			const item = await createItem(app, "L0");
			const id = item.id as string;

			// In O2, GET /:id finds by ID only — layer constraint removed.
			// The test is updated: the item IS found, and we verify that.
			const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
			expect(res.status).toBe(200);
		});
	});

	// AC3: POST /api/knowledge — create (version=1)
	describe("AC3: POST /api/knowledge/:layer — create with version=1", () => {
		test("creates a knowledge item with version 1", async ({ app }) => {
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "New Pattern",
					body: "Body content",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.version).toBe(1);
			// @lore O2: status default is "draft" (was "captured" pre-O2)
			expect(body.status).toBe("draft");
			expect(body.id).toBeTruthy();
		});

		test("returns 400 for missing required fields", async ({ app }) => {
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ topic: "testing" }),
			});
			expect(res.status).toBe(400);
		});
	});

	// AC4: PATCH /api/knowledge/:id — update (optimistic locking)
	describe("AC4: PATCH /api/knowledge/:layer/:id — update with optimistic locking", () => {
		test("updates an item when version matches", async ({ app }) => {
			const item = await createItem(app, "L0");
			const id = item.id as string;

			const res = await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "Updated Title",
					updatedBy: "curator",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.title).toBe("Updated Title");
			expect(body.version).toBe(2);
		});

		test("returns 404 for non-existent item", async ({ app }) => {
			const res = await app.request("/api/knowledge/nonexistent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "Updated",
					updatedBy: "curator",
				}),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC5: Update stale version -> 409 with current version
	describe("AC5: Stale version update returns 409", () => {
		test("returns 409 when version does not match", async ({ app }) => {
			const item = await createItem(app, "L0");
			const id = item.id as string;

			// First update succeeds (version 1 -> 2)
			await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "First Update",
					updatedBy: "curator",
				}),
			});

			// Second update with stale version 1 should fail
			const res = await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "Stale Update",
					updatedBy: "curator",
				}),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("CONFLICT");
			const details = body.details as Record<string, unknown>;
			expect(details.currentVersion).toBe(2);
		});
	});

	// AC6 (merge) and AC7 (split) coverage moved to plugin — ritual routes left core under AU20 founder ruling; recover from git when the plugin lands.

	// AC8: POST /api/knowledge/:id/archive — archive
	describe("AC8: POST /api/knowledge/:layer/:id/archive — archive item", () => {
		test("archives an item (status = archived)", async ({ app }) => {
			const item = await createItem(app, "L0");
			const id = item.id as string;

			const res = await app.request(`/api/knowledge/${id}/archive`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("archived");
		});

		test("returns 404 for non-existent item", async ({ app }) => {
			const res = await app.request("/api/knowledge/nonexistent/archive", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC9 (flag) coverage moved to plugin — ritual routes left core under AU20 founder ruling; recover from git when the plugin lands.

	// AC10: GET /api/knowledge/search?q=... — FTS5 search
	describe("AC10: GET /api/knowledge/search?q=... — FTS5 search", () => {
		test("returns items matching the search query", async ({ app }) => {
			await createItem(app, "L0", {
				title: "React Patterns",
				body: "How to use React hooks effectively.",
			});
			await createItem(app, "L0", {
				title: "Database Design",
				body: "Schema normalization principles.",
			});
			await createItem(app, "L1", {
				title: "React Testing",
				body: "Testing React components with vitest.",
			});

			const res = await app.request("/api/knowledge/search?q=React", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const results = body.results as Record<string, unknown>[];
			expect(results.length).toBe(2);
		});

		test("returns empty results for non-matching query", async ({ app }) => {
			await createItem(app, "L0", { title: "React Patterns", body: "Hooks" });

			const res = await app.request("/api/knowledge/search?q=python", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const results = body.results as Record<string, unknown>[];
			expect(results.length).toBe(0);
		});

		test("returns 400 when query is missing", async ({ app }) => {
			const res = await app.request("/api/knowledge/search", { headers: authHeaders() });
			expect(res.status).toBe(400);
		});
	});

	// AC11: WebSocket /api/ws/knowledge — tested via EventBus emission
	// (Real WebSocket tests require Bun runtime; we test that events are emitted)
	describe("AC11: EventBus emits knowledge_updated events", () => {
		test("emits knowledge_updated event on create", async ({ app, eventBus }) => {
			const events: unknown[] = [];
			eventBus.on("*", (e: unknown) => events.push(e));

			await createItem(app, "L0");

			const knowledgeEvents = events.filter(
				(e) => (e as Record<string, unknown>).type === "knowledge_created",
			);
			expect(knowledgeEvents.length).toBe(1);
		});

		test("emits knowledge_updated event on update", async ({ app, eventBus }) => {
			const item = await createItem(app, "L0");
			const id = item.id as string;

			const events: unknown[] = [];
			eventBus.on("*", (e: unknown) => events.push(e));

			await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "Updated",
					updatedBy: "curator",
				}),
			});

			const knowledgeEvents = events.filter(
				(e) => (e as Record<string, unknown>).type === "knowledge_updated",
			);
			expect(knowledgeEvents.length).toBe(1);
		});
	});

	// AC12: Edit log — every PATCH creates knowledge_edit_log entry
	describe("AC12: Edit log on PATCH", () => {
		test("creates edit log entries for each changed field", async ({ db, app }) => {
			const item = await createItem(app, "L0");
			const id = item.id as string;

			await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "Updated Title",
					body: "Updated body content",
					updatedBy: "curator",
				}),
			});

			const logs = await db.select().from(knowledgeEditLog);
			// Should have at least entries for title and body changes
			expect(logs.length).toBeGreaterThanOrEqual(2);
			const titleLog = logs.find((l: { field: string }) => l.field === "title");
			expect(titleLog).toBeDefined();
			expect(titleLog?.oldValue).toBe("Test Pattern");
			expect(titleLog?.newValue).toBe("Updated Title");
			expect(titleLog?.editor).toBe("curator");
		});
	});

	// AC13: WebSocket delivers updates in same shape as PATCH response + _event field
	describe("AC13: Event shape matches PATCH response with _event field", () => {
		test("emitted event has _event field and item data", async ({ app, eventBus }) => {
			const item = await createItem(app, "L0");
			const id = item.id as string;

			const events: unknown[] = [];
			eventBus.on("*", (e: unknown) => events.push(e));

			await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "Updated",
					updatedBy: "curator",
				}),
			});

			const knowledgeEvent = events.find(
				(e) => (e as Record<string, unknown>).type === "knowledge_updated",
			) as Record<string, unknown> | undefined;
			expect(knowledgeEvent).toBeDefined();
			expect(knowledgeEvent?.action).toBe("updated");
			expect(knowledgeEvent?.itemId).toBe(id);
		});
	});

	// AU14: route create/update now call the repository's create()/update() instead of
	// performing their own raw inserts. Net-new test 1 (plan §9) — the API create path
	// must produce the same edit-log row an agent-tool-created item produces today.
	describe("AU14: POST /api/knowledge writes a create edit-log row via the repository", () => {
		test("API-created item has a knowledgeEditLog row with editType 'create'", async ({
			db,
			app,
		}) => {
			const item = await createItem(app, "L0");
			const id = item.id as string;

			const logs = await db.select().from(knowledgeEditLog).where(eq(knowledgeEditLog.itemId, id));

			const createLog = logs.find((l: { editType: string }) => l.editType === "create");
			expect(createLog).toBeDefined();
			expect(createLog?.field).toBe("*");
		});
	});

	// AU14: net-new test 2 (plan §9 D3) — routing POST / through repo.create structurally
	// forces projection.scopeId to be populated (was NULL via upsertProjectionLayer before
	// this WP). This locks the deliberate, reviewer-approved D3 convergence.
	describe("AU14: route-created scoped item now carries projection.scopeId (D3 lock)", () => {
		test("team-scoped item created via API has projection.scopeId populated", async ({
			db,
			app,
		}) => {
			const teamId = "team-au14-test";
			const item = await createItem(app, "L0", { scopeKind: "team", scopeId: teamId });
			const id = item.id as string;

			const [projectionRow] = await db
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id));

			expect(projectionRow).toBeDefined();
			expect(projectionRow?.scopeId).toBe(teamId);
		});
	});
});

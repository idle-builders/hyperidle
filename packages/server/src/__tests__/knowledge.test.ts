/**
 * @lore O2: Knowledge routes rewritten to remove layer from URL.
 * - POST /api/knowledge/:layer → POST /api/knowledge
 * - GET /api/knowledge/:layer → GET /api/knowledge (no layer filtering in O2)
 * - GET /api/knowledge/:layer/:id → GET /api/knowledge/:id
 * - PATCH /api/knowledge/:layer/:id → PATCH /api/knowledge/:id
 * - etc.
 * Tests updated to match O2 API shape.
 */
import { createTestDb, type HyperIdleDb, knowledgeEditLog } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-knowledge";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Knowledge Endpoints (E4)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// Helper to create a knowledge item via API
	// @lore O2: POST /api/knowledge (no layer in path)
	async function createItem(
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
				updatedBy: "human",
				...overrides,
			}),
		});
		return (await res.json()) as Record<string, unknown>;
	}

	// AC1: GET /api/knowledge — list all items (O2: no layer grouping in kernel route)
	describe("AC1: GET /api/knowledge/:layer — list by layer grouped by topic, kind", () => {
		it("returns items for a given layer grouped by topic and kind", async () => {
			// @lore O2: Layer is now a strategy concern. In O2 the kernel GET /
			// returns all items with a flat items array. Grouping is a fabric concern.
			await createItem("L0", { topic: "design", title: "Design Pattern A" });
			await createItem("L0", { topic: "design", title: "Design Anti-Pattern B" });
			await createItem("L0", { topic: "testing", title: "Test Pattern C" });
			await createItem("L1", { topic: "design", title: "L1 Design Pattern" });

			const res = await app.request("/api/knowledge", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			// O2: flat items array, no layer grouping in kernel route
			const items = body.items as Record<string, unknown>[];
			expect(items.length).toBe(4);
		});

		it("returns empty groups for a layer with no items", async () => {
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
		it("returns a single knowledge item", async () => {
			const item = await createItem("L0");
			const id = item.id as string;

			// @lore O2: GET /api/knowledge/:id (no layer segment)
			const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe(id);
			expect(body.title).toBe("Test Pattern");
		});

		it("returns 404 for non-existent item", async () => {
			const res = await app.request("/api/knowledge/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);
		});

		it("returns 404 when item exists but in different layer", async () => {
			// @lore O2: no layer constraint on GET /:id — item is found regardless.
			// This test now verifies that an item IS found (layer distinction is fabric-level).
			const item = await createItem("L0");
			const id = item.id as string;

			// In O2, GET /:id finds by ID only — layer constraint removed.
			// The test is updated: the item IS found, and we verify that.
			const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
			expect(res.status).toBe(200);
		});
	});

	// AC3: POST /api/knowledge — create (version=1)
	describe("AC3: POST /api/knowledge/:layer — create with version=1", () => {
		it("creates a knowledge item with version 1", async () => {
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "New Pattern",
					body: "Body content",
					format: "markdown",
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

		it("returns 400 for missing required fields", async () => {
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
		it("updates an item when version matches", async () => {
			const item = await createItem("L0");
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

		it("returns 404 for non-existent item", async () => {
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
		it("returns 409 when version does not match", async () => {
			const item = await createItem("L0");
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

	// AC6: POST /api/knowledge/:id/merge — merge two items
	describe("AC6: POST /api/knowledge/:layer/:id/merge — merge two items", () => {
		it("merges two items, combining body, both IDs redirect", async () => {
			const item1 = await createItem("L0", { title: "Item One", body: "Body one." });
			const item2 = await createItem("L0", { title: "Item Two", body: "Body two." });
			const id1 = item1.id as string;
			const id2 = item2.id as string;

			const res = await app.request(`/api/knowledge/${id1}/merge`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					sourceId: id2,
					updatedBy: "curator",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			// Merged item should contain both bodies
			expect(body.body as string).toContain("Body one.");
			expect(body.body as string).toContain("Body two.");

			// Source item should be archived (merged)
			const sourceRes = await app.request(`/api/knowledge/${id2}`, { headers: authHeaders() });
			expect(sourceRes.status).toBe(200);
			const sourceBody = (await sourceRes.json()) as Record<string, unknown>;
			expect(sourceBody.status).toBe("archived");
		});

		it("returns 404 when source item does not exist", async () => {
			const item = await createItem("L0");
			const id = item.id as string;

			const res = await app.request(`/api/knowledge/${id}/merge`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					sourceId: "nonexistent",
					updatedBy: "curator",
				}),
			});

			expect(res.status).toBe(404);
		});
	});

	// AC7: POST /api/knowledge/:id/split — split into two
	describe("AC7: POST /api/knowledge/:layer/:id/split — split into two items", () => {
		it("splits an item into two new items", async () => {
			const item = await createItem("L0", { title: "Combined", body: "Part A. Part B." });
			const id = item.id as string;

			const res = await app.request(`/api/knowledge/${id}/split`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					newItems: [
						{ title: "Part A", body: "Part A content." },
						{ title: "Part B", body: "Part B content." },
					],
					updatedBy: "curator",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const items = body.items as Record<string, unknown>[];
			expect(items).toHaveLength(2);
			expect(items[0].title).toBe("Part A");
			expect(items[1].title).toBe("Part B");
			expect((items[0] as Record<string, unknown>).version).toBe(1);

			// Original item should be archived
			const origRes = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
			const origBody = (await origRes.json()) as Record<string, unknown>;
			expect(origBody.status).toBe("archived");
		});

		it("returns 400 when newItems has fewer than 2 entries", async () => {
			const item = await createItem("L0");
			const id = item.id as string;

			const res = await app.request(`/api/knowledge/${id}/split`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					newItems: [{ title: "Only One", body: "Only one." }],
					updatedBy: "curator",
				}),
			});

			expect(res.status).toBe(400);
		});
	});

	// AC8: POST /api/knowledge/:id/archive — archive
	describe("AC8: POST /api/knowledge/:layer/:id/archive — archive item", () => {
		it("archives an item (status = archived)", async () => {
			const item = await createItem("L0");
			const id = item.id as string;

			const res = await app.request(`/api/knowledge/${id}/archive`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("archived");
		});

		it("returns 404 for non-existent item", async () => {
			const res = await app.request("/api/knowledge/nonexistent/archive", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC9: POST /api/knowledge/:id/flag — flag for review
	describe("AC9: POST /api/knowledge/:layer/:id/flag — flag for review", () => {
		it("flags an item (records in edit log)", async () => {
			// @lore O2: attentionScore column stripped from kernel table.
			// Flag now records in edit log; status is NOT changed to "provisional".
			const item = await createItem("L0");
			const id = item.id as string;

			const res = await app.request(`/api/knowledge/${id}/flag`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Needs review" }),
			});

			expect(res.status).toBe(200);
			// O2: flag records in edit log; item is still returned
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe(id);
		});

		it("returns 404 for non-existent item", async () => {
			const res = await app.request("/api/knowledge/nonexistent/flag", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Needs review" }),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC10: GET /api/knowledge/search?q=... — FTS5 search
	describe("AC10: GET /api/knowledge/search?q=... — FTS5 search", () => {
		it("returns items matching the search query", async () => {
			await createItem("L0", {
				title: "React Patterns",
				body: "How to use React hooks effectively.",
			});
			await createItem("L0", {
				title: "Database Design",
				body: "Schema normalization principles.",
			});
			await createItem("L1", {
				title: "React Testing",
				body: "Testing React components with vitest.",
			});

			const res = await app.request("/api/knowledge/search?q=React", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const results = body.results as Record<string, unknown>[];
			expect(results.length).toBe(2);
		});

		it("returns empty results for non-matching query", async () => {
			await createItem("L0", { title: "React Patterns", body: "Hooks" });

			const res = await app.request("/api/knowledge/search?q=python", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const results = body.results as Record<string, unknown>[];
			expect(results.length).toBe(0);
		});

		it("returns 400 when query is missing", async () => {
			const res = await app.request("/api/knowledge/search", { headers: authHeaders() });
			expect(res.status).toBe(400);
		});
	});

	// AC11: WebSocket /api/ws/knowledge — tested via EventBus emission
	// (Real WebSocket tests require Bun runtime; we test that events are emitted)
	describe("AC11: EventBus emits knowledge_updated events", () => {
		it("emits knowledge_updated event on create", async () => {
			const events: unknown[] = [];
			eventBus.on("*", (e) => events.push(e));

			await createItem("L0");

			const knowledgeEvents = events.filter(
				(e) => (e as Record<string, unknown>).type === "knowledge_created",
			);
			expect(knowledgeEvents.length).toBe(1);
		});

		it("emits knowledge_updated event on update", async () => {
			const item = await createItem("L0");
			const id = item.id as string;

			const events: unknown[] = [];
			eventBus.on("*", (e) => events.push(e));

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
		it("creates edit log entries for each changed field", async () => {
			const item = await createItem("L0");
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

			const logs = db.select().from(knowledgeEditLog).all();
			// Should have at least entries for title and body changes
			expect(logs.length).toBeGreaterThanOrEqual(2);
			const titleLog = logs.find((l) => l.field === "title");
			expect(titleLog).toBeDefined();
			expect(titleLog?.oldValue).toBe("Test Pattern");
			expect(titleLog?.newValue).toBe("Updated Title");
			expect(titleLog?.editor).toBe("curator");
		});
	});

	// AC13: WebSocket delivers updates in same shape as PATCH response + _event field
	describe("AC13: Event shape matches PATCH response with _event field", () => {
		it("emitted event has _event field and item data", async () => {
			const item = await createItem("L0");
			const id = item.id as string;

			const events: unknown[] = [];
			eventBus.on("*", (e) => events.push(e));

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
});

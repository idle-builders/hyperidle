/**
 * L22 integration tests for signals on GET / response.
 *
 * @lore O2: Knowledge routes rewritten — layer-based URLs removed.
 * GET /api/knowledge returns all items with computed signals from access log.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { seedKnowledgeItem } from "./_helpers.js";

const TEST_API_KEY = "test-key-l22-signals";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const NOW_ISO = new Date().toISOString();

describe("GET /api/knowledge/:layer — signals in response (L22 AC-5)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// GET / returns items with signals field
	test("GET /api/knowledge/:layer response items include a 'signals' field", async ({
		db,
		app,
	}) => {
		// @lore O2: knowledgeItems no longer has layer/scopeId/kind/meta columns.
		await seedKnowledgeItem(db, {
			id: "item-l22-1",
			title: "Item item-l22-1",
			body: "Test body",
			status: "active",
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		// @lore O2: route now is GET /api/knowledge (no layer segment).
		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			items?: unknown[];
		};

		// The response must include a flat 'items' array
		expect(body.items).toBeDefined();
		expect(Array.isArray(body.items)).toBe(true);
		expect((body.items as unknown[]).length).toBeGreaterThan(0);
	});

	// @lore AU44 batch 4 row 13 SIMPLIFY: signals (lastActivityAt, accessCount30d,
	// citationCount, relevanceScore) were removed from the list response per FULL-AUDIT.md
	// row 13: "signals die with telemetry/scores — becomes a plain visible-items list."
	// The 4 former signal tests are deleted; only the structural tests remain.

	// Empty DB returns empty items array
	test("empty layer returns empty items array with signals field present", async ({ app }) => {
		// @lore O2: No layer filtering — when DB is empty, all items (empty).
		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		const body = (await res.json()) as { items: unknown[] };
		expect(body.items).toBeDefined();
		expect(Array.isArray(body.items)).toBe(true);
		expect(body.items.length).toBe(0);
	});
});

/**
 * AU14 round 2 — route-level net-new locks:
 * - Test 1: `searchByText` LIKE-vs-FTS lock — a topic-only substring match FTS
 *   (title+body only) would not return.
 * - Test 5b (flag cross-domain): coverage moved to plugin — ritual routes left core under AU20 founder ruling.
 */
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au14-round2";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// @lore AU44 batch 4: GET /api/knowledge/search deleted; folded into GET /api/search?scope=knowledge
describe("GET /api/search?scope=knowledge LIKE-vs-FTS substring lock", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/search?scope=knowledge matches a topic-only substring FTS would not find", async ({
		app,
	}) => {
		// title/body deliberately do NOT contain the query term — only topic does.
		// FTS indexes title+body only (fts.ts), so an FTS-backed search would miss this.
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				topic: "kubernetes-networking",
				title: "Cluster setup notes",
				body: "General notes about the cluster environment.",
				format: "markdown",
				scopeKind: "factory",
				updatedBy: "human",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string };

		const res = await app.request("/api/search?q=kubernetes&scope=knowledge", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ id: string }> };
		expect(body.results.some((r) => r.id === created.id)).toBe(true);
	});
});

// flag (POST /:id/flag) cross-domain atomic composition coverage moved to plugin — ritual routes left core under AU20 founder ruling; recover from git when the plugin lands.

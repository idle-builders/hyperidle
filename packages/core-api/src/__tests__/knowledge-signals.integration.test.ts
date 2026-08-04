/**
 * L22 integration tests for signals on GET / response.
 *
 * @lore O2: Knowledge routes rewritten — layer-based URLs removed.
 * GET /api/knowledge returns all items with computed signals from access log.
 */
import { knowledgeItems } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-l22-signals";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const NOW_ISO = new Date().toISOString();
function daysAgo(n: number): string {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

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
		await db.insert(knowledgeItems).values({
			id: "item-l22-1",
			topic: "testing",
			title: "Item item-l22-1",
			body: "Test body",
			format: "markdown",
			status: "active",
			version: 1,
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

	// Signals contain the expected fields
	test("signals field contains lastActivityAt, accessCount30d, citationCount, relevanceScore", async ({
		db,
		app,
	}) => {
		await db.insert(knowledgeItems).values({
			id: "item-l22-2",
			topic: "testing",
			title: "Item item-l22-2",
			body: "Test body",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		const { knowledgeAccessLog } = await import("@hyperidle/db");
		await db.insert(knowledgeAccessLog).values({
			id: crypto.randomUUID(),
			itemId: "item-l22-2",
			accessorKind: "human",
			accessorId: "user-1",
			accessedAt: daysAgo(1),
		});

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		const body = (await res.json()) as {
			items: Array<{ id: string; signals: Record<string, unknown> }>;
		};

		const item = body.items.find((i) => i.id === "item-l22-2");
		expect(item).toBeDefined();
		if (!item) return;
		expect(item.signals).toBeDefined();

		const { signals } = item;
		// Must have these 4 keys (values may be null)
		expect("lastActivityAt" in signals).toBe(true);
		expect("accessCount30d" in signals).toBe(true);
		expect("citationCount" in signals).toBe(true);
		expect("relevanceScore" in signals).toBe(true);
	});

	// Items with no access data have null signals (not fake zeros)
	test("items with no access data have null signals — never fake zeros (AC-8)", async ({
		db,
		app,
	}) => {
		await db.insert(knowledgeItems).values({
			id: "item-l22-3",
			topic: "testing",
			title: "Item item-l22-3",
			body: "Test body",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});
		// No access log for this item

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		const body = (await res.json()) as {
			items: Array<{ id: string; signals: Record<string, unknown> }>;
		};

		const item = body.items.find((i) => i.id === "item-l22-3");
		expect(item).toBeDefined();
		if (!item) return;
		const { signals } = item;

		expect(signals.accessCount30d).toBeNull();
		expect(signals.lastActivityAt).toBeNull();
		expect(signals.citationCount).toBeNull();
		// relevanceScore is null when no data to compute from
		expect(signals.relevanceScore).toBeNull();
	});

	// citationCount is always null in L22 (staged) — AC-3
	test("citationCount is always null on signals (citation staged — AC-3)", async ({ db, app }) => {
		await db.insert(knowledgeItems).values({
			id: "item-l22-4",
			topic: "testing",
			title: "Item item-l22-4",
			body: "Test body",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		const { knowledgeAccessLog } = await import("@hyperidle/db");
		await db.insert(knowledgeAccessLog).values({
			id: crypto.randomUUID(),
			itemId: "item-l22-4",
			accessorKind: "human",
			accessorId: "user-1",
			accessedAt: daysAgo(1),
		});

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		const body = (await res.json()) as {
			items: Array<{ id: string; signals: Record<string, unknown> }>;
		};

		const item = body.items.find((i) => i.id === "item-l22-4");
		expect(item?.signals.citationCount).toBeNull();
	});

	// Items with access data have non-null accessCount30d
	test("items with access data have non-null accessCount30d", async ({ db, app }) => {
		await db.insert(knowledgeItems).values({
			id: "item-l22-5",
			topic: "testing",
			title: "Item item-l22-5",
			body: "Test body",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		const { knowledgeAccessLog } = await import("@hyperidle/db");
		await db.insert(knowledgeAccessLog).values({
			id: crypto.randomUUID(),
			itemId: "item-l22-5",
			accessorKind: "human",
			accessorId: "user-1",
			accessedAt: daysAgo(1),
		});
		await db.insert(knowledgeAccessLog).values({
			id: crypto.randomUUID(),
			itemId: "item-l22-5",
			accessorKind: "human",
			accessorId: "user-1",
			accessedAt: daysAgo(2),
		});

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		const body = (await res.json()) as {
			items: Array<{ id: string; signals: Record<string, unknown> }>;
		};

		const item = body.items.find((i) => i.id === "item-l22-5");
		expect(item?.signals.accessCount30d).toBe(2);
	});

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

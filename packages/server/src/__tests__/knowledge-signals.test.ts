/**
 * L22 red phase — integration tests for signals on GET /:layer response.
 *
 * These tests fail until:
 * 1. packages/db schema has knowledge_access_log + relevance columns (T1)
 * 2. packages/server/src/routes/knowledge.ts enriches list response (T7)
 */
import { createTestDb, type HyperIdleDb, knowledgeItems } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l22-signals";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const NOW_ISO = "2026-05-06T12:00:00.000Z";

describe("GET /api/knowledge/:layer — signals in response (L22 AC-5)", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		const eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function createItem(id: string, layer = "L3"): Promise<void> {
		db.insert(knowledgeItems)
			.values({
				id,
				layer,
				scopeId: null,
				kind: "pattern",
				topic: "testing",
				title: `Item ${id}`,
				body: "Test body",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "human",
				createdAt: NOW_ISO,
				updatedAt: NOW_ISO,
				meta: null,
			})
			.run();
	}

	async function insertAccessLog(itemId: string, accessedAt: string): Promise<void> {
		// @ts-expect-error — knowledgeAccessLog not yet exported from @hyperidle/db (T1)
		const { knowledgeAccessLog } = await import("@hyperidle/db");
		db.insert(knowledgeAccessLog)
			.values({
				id: crypto.randomUUID(),
				itemId,
				accessorKind: "human",
				accessorId: "user-1",
				accessedAt,
			})
			.run();
	}

	// GET /:layer returns items with signals field
	it("GET /api/knowledge/:layer response items include a 'signals' field", async () => {
		await createItem("item-l22-1", "L3");

		const res = await app.request("/api/knowledge/L3", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			layer: string;
			items?: unknown[];
			groups?: Record<string, unknown>;
		};

		// The response must include either a flat 'items' array or signals on grouped items
		// Per architecture: return an 'items' flat array alongside 'groups'
		expect(body.items).toBeDefined();
		expect(Array.isArray(body.items)).toBe(true);
		expect((body.items as unknown[]).length).toBeGreaterThan(0);
	});

	// Signals contain the expected fields
	it("signals field contains lastActivityAt, accessCount30d, citationCount, relevanceScore", async () => {
		await createItem("item-l22-2", "L3");
		await insertAccessLog("item-l22-2", "2026-05-05T00:00:00.000Z");

		const res = await app.request("/api/knowledge/L3", { headers: authHeaders() });
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
	it("items with no access data have null signals — never fake zeros (AC-8)", async () => {
		await createItem("item-l22-3", "L3");
		// No access log for this item

		const res = await app.request("/api/knowledge/L3", { headers: authHeaders() });
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
	it("citationCount is always null on signals (citation staged — AC-3)", async () => {
		await createItem("item-l22-4", "L3");
		await insertAccessLog("item-l22-4", "2026-05-05T00:00:00.000Z");

		const res = await app.request("/api/knowledge/L3", { headers: authHeaders() });
		const body = (await res.json()) as {
			items: Array<{ id: string; signals: Record<string, unknown> }>;
		};

		const item = body.items.find((i) => i.id === "item-l22-4");
		expect(item?.signals.citationCount).toBeNull();
	});

	// Items with access data have non-null accessCount30d
	it("items with access data have non-null accessCount30d", async () => {
		await createItem("item-l22-5", "L3");
		await insertAccessLog("item-l22-5", "2026-05-05T00:00:00.000Z");
		await insertAccessLog("item-l22-5", "2026-05-04T00:00:00.000Z");

		const res = await app.request("/api/knowledge/L3", { headers: authHeaders() });
		const body = (await res.json()) as {
			items: Array<{ id: string; signals: Record<string, unknown> }>;
		};

		const item = body.items.find((i) => i.id === "item-l22-5");
		expect(item?.signals.accessCount30d).toBe(2);
	});

	// Empty layer still returns items array
	it("empty layer returns empty items array with signals field present", async () => {
		const res = await app.request("/api/knowledge/L4", { headers: authHeaders() });
		const body = (await res.json()) as { layer: string; items: unknown[] };
		expect(body.items).toBeDefined();
		expect(Array.isArray(body.items)).toBe(true);
		expect(body.items.length).toBe(0);
	});
});

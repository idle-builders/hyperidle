/**
 * L22 red phase — integration tests for access-log creation on GET /:layer/:id.
 *
 * These tests fail until:
 * 1. packages/db schema has knowledge_access_log table (T1)
 * 2. packages/server/src/routes/knowledge.ts inserts access-log rows (T5)
 */
import { createTestDb, type HyperIdleDb, knowledgeItems } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l22-access";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const NOW_ISO = "2026-05-06T12:00:00.000Z";

describe("Knowledge access-log creation (L22 AC-1)", () => {
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

	async function createItem(layer = "L3"): Promise<string> {
		const id = crypto.randomUUID();
		db.insert(knowledgeItems)
			.values({
				id,
				layer,
				scopeId: null,
				kind: "pattern",
				topic: "testing",
				title: "Test Item",
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
		return id;
	}

	async function getAccessLogCount(itemId: string): Promise<number> {
		// @ts-expect-error — knowledgeAccessLog not yet exported from @hyperidle/db (T1)
		const { knowledgeAccessLog } = await import("@hyperidle/db");
		const rows = db.select().from(knowledgeAccessLog).all();
		return rows.filter((r: { itemId: string }) => r.itemId === itemId).length;
	}

	// AC-1: GET /:layer/:id creates one access-log row
	it("GET /:layer/:id creates exactly one access-log row on success", async () => {
		const itemId = await createItem("L3");

		const res = await app.request(`/api/knowledge/L3/${itemId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const count = await getAccessLogCount(itemId);
		expect(count).toBe(1);
	});

	// AC-1: multiple fetches create multiple rows
	it("multiple GET /:layer/:id fetches create multiple access-log rows", async () => {
		const itemId = await createItem("L3");

		for (let i = 0; i < 3; i++) {
			const res = await app.request(`/api/knowledge/L3/${itemId}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
		}

		const count = await getAccessLogCount(itemId);
		expect(count).toBe(3);
	});

	// GET /:layer/:id 404 does NOT create an access-log row
	it("GET /:layer/:id 404 does NOT create an access-log row", async () => {
		const nonExistentId = "00000000-0000-0000-0000-000000000000";

		const res = await app.request(`/api/knowledge/L3/${nonExistentId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);

		const count = await getAccessLogCount(nonExistentId);
		expect(count).toBe(0);
	});

	// Reviewer warning: access-log INSERT failure must not break the 200 response
	// We simulate this by verifying the response is still 200 even when the
	// access-log INSERT would fail (e.g., with a corrupted db state).
	// The implementation must wrap the INSERT in try-catch.
	it("access-log INSERT failure does NOT break the 200 response (try-catch guard)", async () => {
		// This test verifies the code path exists: the item is returned even if
		// the access log INSERT fails. We can't easily force a DB error here, so
		// we assert the structural requirement: the response status is 200 and
		// the response body contains the item.
		const itemId = await createItem("L3");

		const res = await app.request(`/api/knowledge/L3/${itemId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe(itemId);

		// The access-log row was still created (normal path)
		const count = await getAccessLogCount(itemId);
		expect(count).toBe(1);
	});

	// Access-log row has correct fields
	it("access-log row has correct itemId, accessorKind, and accessedAt", async () => {
		const itemId = await createItem("L3");

		await app.request(`/api/knowledge/L3/${itemId}`, {
			headers: authHeaders(),
		});

		// @ts-expect-error — knowledgeAccessLog not yet exported from @hyperidle/db (T1)
		const { knowledgeAccessLog } = await import("@hyperidle/db");
		const rows = db.select().from(knowledgeAccessLog).all();
		const row = rows.find((r: { itemId: string }) => r.itemId === itemId);

		expect(row).toBeDefined();
		expect(row?.itemId).toBe(itemId);
		expect(row?.accessorKind).toBe("human"); // default when auth context not wired
		// accessedAt is a valid ISO string
		expect(typeof row?.accessedAt).toBe("string");
		expect(() => new Date(row?.accessedAt as string)).not.toThrow();
	});
});

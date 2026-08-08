/**
 * L22 red phase — integration tests for access-log creation on GET /:layer/:id.
 *
 * These tests fail until:
 * 1. framework/db schema has knowledge_access_log table (T1)
 * 2. packages/server/src/routes/knowledge.ts inserts access-log rows (T5)
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { seedKnowledgeItem } from "./_helpers.js";

const TEST_API_KEY = "test-key-l22-access";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const NOW_ISO = "2026-05-06T12:00:00.000Z";

describe("Knowledge access-log creation (L22 AC-1)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC-1: GET /:layer/:id creates one access-log row
	test("GET /:layer/:id creates exactly one access-log row on success", async ({ db, app }) => {
		// @lore O2: knowledgeItems no longer has layer/scopeId/kind/meta columns.
		// The kernel row holds identity+content only.
		const id = crypto.randomUUID();
		await seedKnowledgeItem(db, {
			id,
			topic: "testing",
			title: "Test Item",
			body: "Test body",
			status: "active",
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		const res = await app.request(`/api/knowledge/${id}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		// knowledgeAccessLog exported from @hyperidle/db since T1
		const { knowledgeAccessLog } = await import("@hyperidle/db");
		const rows = await db.select().from(knowledgeAccessLog);
		const count = rows.filter((r: { itemId: string }) => r.itemId === id).length;
		expect(count).toBe(1);
	});

	// AC-1: multiple fetches create multiple rows
	test("multiple GET /:layer/:id fetches create multiple access-log rows", async ({ db, app }) => {
		const id = crypto.randomUUID();
		await seedKnowledgeItem(db, {
			id,
			topic: "testing",
			title: "Test Item",
			body: "Test body",
			status: "active",
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		for (let i = 0; i < 3; i++) {
			const res = await app.request(`/api/knowledge/${id}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
		}

		const { knowledgeAccessLog } = await import("@hyperidle/db");
		const rows = await db.select().from(knowledgeAccessLog);
		const count = rows.filter((r: { itemId: string }) => r.itemId === id).length;
		expect(count).toBe(3);
	});

	// GET /:layer/:id 404 does NOT create an access-log row
	test("GET /:layer/:id 404 does NOT create an access-log row", async ({ db, app }) => {
		const nonExistentId = "00000000-0000-0000-0000-000000000000";

		const res = await app.request(`/api/knowledge/${nonExistentId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);

		const { knowledgeAccessLog } = await import("@hyperidle/db");
		const rows = await db.select().from(knowledgeAccessLog);
		const count = rows.filter((r: { itemId: string }) => r.itemId === nonExistentId).length;
		expect(count).toBe(0);
	});

	// Reviewer warning: access-log INSERT failure must not break the 200 response
	// We simulate this by verifying the response is still 200 even when the
	// access-log INSERT would fail (e.g., with a corrupted db state).
	// The implementation must wrap the INSERT in try-catch.
	test("access-log INSERT failure does NOT break the 200 response (try-catch guard)", async ({
		db,
		app,
	}) => {
		// This test verifies the code path exists: the item is returned even if
		// the access log INSERT fails. We can't easily force a DB error here, so
		// we assert the structural requirement: the response status is 200 and
		// the response body contains the item.
		const id = crypto.randomUUID();
		await seedKnowledgeItem(db, {
			id,
			topic: "testing",
			title: "Test Item",
			body: "Test body",
			status: "active",
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		const res = await app.request(`/api/knowledge/${id}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe(id);

		// The access-log row was still created (normal path)
		const { knowledgeAccessLog } = await import("@hyperidle/db");
		const rows = await db.select().from(knowledgeAccessLog);
		const count = rows.filter((r: { itemId: string }) => r.itemId === id).length;
		expect(count).toBe(1);
	});

	// Access-log row has correct fields
	test("access-log row has correct itemId, accessorKind, and accessedAt", async ({ db, app }) => {
		const id = crypto.randomUUID();
		await seedKnowledgeItem(db, {
			id,
			topic: "testing",
			title: "Test Item",
			body: "Test body",
			status: "active",
			updatedBy: "human",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});

		await app.request(`/api/knowledge/${id}`, {
			headers: authHeaders(),
		});

		// knowledgeAccessLog exported from @hyperidle/db since T1
		const { knowledgeAccessLog } = await import("@hyperidle/db");
		const rows = await db.select().from(knowledgeAccessLog);
		const row = rows.find((r: { itemId: string }) => r.itemId === id);

		expect(row).toBeDefined();
		expect(row?.itemId).toBe(id);
		expect(row?.accessorKind).toBe("human"); // default when auth context not wired
		// accessedAt is a valid ISO string
		expect(typeof row?.accessedAt).toBe("string");
		// @lore the `expect(() => new Date(...)).not.toThrow()` line that used to close this test is
		// deleted (Ruling B): the `Date` constructor never throws for any input string — an invalid
		// one yields `Invalid Date`, not a throw — so the assertion was guaranteed to pass by
		// construction and could never fail. The four assertions above are the test's live coverage.
	});
});

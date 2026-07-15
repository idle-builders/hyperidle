/**
 * I2 — V3/V4: Knowledge route input validation.
 *
 * V3: `:layer` path param must be one of KNOWLEDGE_LAYERS. Today the route
 *     accepts any string and returns an empty group (silent miss).
 *
 * V4: `/search` must escape LIKE wildcards (`%`, `_`, `\`) before building
 *     the pattern. Today `?q=_` matches every row (any character) and `?q=%`
 *     matches every row (any sequence). Also a query containing the LIKE
 *     escape character `\` must not throw.
 *
 * Red phase: all assertions fail against the current implementation.
 */

import { type HyperIdleDb, knowledgeItems } from "@hyperidle/db";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-knowledge-validation";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedKi(db: HyperIdleDb, id: string, title: string, body = "body"): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id,
		title,
		body,
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "human",
		createdAt: now,
		updatedAt: now,
	});
}

// @lore O2: V3 layer validation tests removed — /:layer URL pattern no longer exists.
// Knowledge routes now use /:id patterns. Old layer URLs return 404 naturally.
describe("I2 V3 — O2: /:layer URL returns 404 (layer routing removed)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/knowledge/L99 returns 404 (not 400 — layer routing removed)", async ({ app }) => {
		const res = await app.request("/api/knowledge/L99", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});

	test("GET /api/knowledge/banana returns 404", async ({ app }) => {
		const res = await app.request("/api/knowledge/banana", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});

	test("GET /api/knowledge/L0 returns 404 (layer is not a valid item ID)", async ({ app }) => {
		const res = await app.request("/api/knowledge/L0", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});
});

describe("I2 V4 — GET /api/knowledge/search escapes LIKE wildcards", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("?q=A_B returns only rows literally containing 'A_B' (not all rows)", async ({
		db,
		app,
	}) => {
		await seedKi(db, "ki-ab", "AB");
		await seedKi(db, "ki-axb", "AxB");
		await seedKi(db, "ki-aub", "A_B");
		await seedKi(db, "ki-pct", "100% off");

		const res = await app.request("/api/knowledge/search?q=A_B", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ id: string; title: string }> };
		const ids = body.results.map((r) => r.id).sort();
		expect(ids).toEqual(["ki-aub"]);
	});

	test("?q=_ does NOT return every row (the underscore must be a literal)", async ({ db, app }) => {
		await seedKi(db, "ki-ab", "AB");
		await seedKi(db, "ki-axb", "AxB");
		await seedKi(db, "ki-aub", "A_B");
		await seedKi(db, "ki-pct", "100% off");

		const res = await app.request("/api/knowledge/search?q=_", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ id: string }> };
		// Only ki-aub literally contains an underscore in its title.
		const ids = body.results.map((r) => r.id).sort();
		expect(ids).toEqual(["ki-aub"]);
	});

	test("?q=% does NOT return every row (the percent must be a literal)", async ({ db, app }) => {
		await seedKi(db, "ki-ab", "AB");
		await seedKi(db, "ki-axb", "AxB");
		await seedKi(db, "ki-aub", "A_B");
		await seedKi(db, "ki-pct", "100% off");

		const res = await app.request("/api/knowledge/search?q=%25", { headers: authHeaders() });
		// %25 decodes to '%'. Only the "100% off" row contains a literal %.
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ id: string }> };
		const ids = body.results.map((r) => r.id).sort();
		expect(ids).toEqual(["ki-pct"]);
	});

	test('?q="unbalanced does not throw (graceful 200 with empty/zero results)', async ({ app }) => {
		// A query containing the LIKE escape char `\` must be handled
		// safely — no SQLite parse error, no 500.
		const res = await app.request(`/api/knowledge/search?q=${encodeURIComponent('"unbalanced')}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
	});

	test("?q=\\ (a backslash) does not 500", async ({ app }) => {
		const res = await app.request(`/api/knowledge/search?q=${encodeURIComponent("\\")}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
	});

	test("review HIGH-5 / M-4: rejects queries longer than 500 chars with 400", async ({ app }) => {
		const huge = "x".repeat(501);
		const res = await app.request(`/api/knowledge/search?q=${encodeURIComponent(huge)}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	test("review HIGH-5 / M-4: a query at the 500-char boundary is accepted", async ({ app }) => {
		const right = "x".repeat(500);
		const res = await app.request(`/api/knowledge/search?q=${encodeURIComponent(right)}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
	});
});

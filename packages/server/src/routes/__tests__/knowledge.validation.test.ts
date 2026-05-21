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

import { createTestDb, type HyperIdleDb, knowledgeItems } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-knowledge-validation";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

function seedKi(db: HyperIdleDb, id: string, title: string, body = "body"): void {
	const now = new Date().toISOString();
	db.insert(knowledgeItems)
		.values({
			id,
			title,
			body,
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "human",
			createdAt: now,
			updatedAt: now,
		})
		.run();
}

// @lore O2: V3 layer validation tests removed — /:layer URL pattern no longer exists.
// Knowledge routes now use /:id patterns. Old layer URLs return 404 naturally.
describe("I2 V3 — O2: /:layer URL returns 404 (layer routing removed)", () => {
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("GET /api/knowledge/L99 returns 404 (not 400 — layer routing removed)", async () => {
		const res = await app.request("/api/knowledge/L99", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});

	it("GET /api/knowledge/banana returns 404", async () => {
		const res = await app.request("/api/knowledge/banana", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});

	it("GET /api/knowledge/L0 returns 404 (layer is not a valid item ID)", async () => {
		const res = await app.request("/api/knowledge/L0", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});
});

describe("I2 V4 — GET /api/knowledge/search escapes LIKE wildcards", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });

		// AB and AxB share the same prefix/suffix. With unescaped LIKE,
		// `?q=A_B` (where `_` matches any single char) hits both. With
		// escaping, `?q=A_B` is a literal substring search and only matches
		// the row that contains "A_B" verbatim.
		seedKi(db, "ki-ab", "AB"); // literal "AB"
		seedKi(db, "ki-axb", "AxB"); // would be matched by unescaped `A_B`
		seedKi(db, "ki-aub", "A_B"); // contains the literal underscore
		seedKi(db, "ki-pct", "100% off"); // contains literal %
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("?q=A_B returns only rows literally containing 'A_B' (not all rows)", async () => {
		const res = await app.request("/api/knowledge/search?q=A_B", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ id: string; title: string }> };
		const ids = body.results.map((r) => r.id).sort();
		expect(ids).toEqual(["ki-aub"]);
	});

	it("?q=_ does NOT return every row (the underscore must be a literal)", async () => {
		const res = await app.request("/api/knowledge/search?q=_", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ id: string }> };
		// Only ki-aub literally contains an underscore in its title.
		const ids = body.results.map((r) => r.id).sort();
		expect(ids).toEqual(["ki-aub"]);
	});

	it("?q=% does NOT return every row (the percent must be a literal)", async () => {
		const res = await app.request("/api/knowledge/search?q=%25", { headers: authHeaders() });
		// %25 decodes to '%'. Only the "100% off" row contains a literal %.
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ id: string }> };
		const ids = body.results.map((r) => r.id).sort();
		expect(ids).toEqual(["ki-pct"]);
	});

	it('?q="unbalanced does not throw (graceful 200 with empty/zero results)', async () => {
		// A query containing the LIKE escape char `\` must be handled
		// safely — no SQLite parse error, no 500.
		const res = await app.request(`/api/knowledge/search?q=${encodeURIComponent('"unbalanced')}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
	});

	it("?q=\\ (a backslash) does not 500", async () => {
		const res = await app.request(`/api/knowledge/search?q=${encodeURIComponent("\\")}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
	});

	it("review HIGH-5 / M-4: rejects queries longer than 500 chars with 400", async () => {
		const huge = "x".repeat(501);
		const res = await app.request(`/api/knowledge/search?q=${encodeURIComponent(huge)}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	it("review HIGH-5 / M-4: a query at the 500-char boundary is accepted", async () => {
		const right = "x".repeat(500);
		const res = await app.request(`/api/knowledge/search?q=${encodeURIComponent(right)}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
	});
});

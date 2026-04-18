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

import { type HyperIdleDb, createTestDb, knowledgeItems } from "@hyperidle/db";
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
			layer: "L1",
			kind: "pattern",
			title,
			body,
			format: "markdown",
			status: "captured",
			version: 1,
			updatedBy: "human",
			createdAt: now,
			updatedAt: now,
		})
		.run();
}

describe("I2 V3 — GET /api/knowledge/:layer rejects invalid layer", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 400 with VALIDATION_ERROR for an unknown layer (L99)", async () => {
		const res = await app.request("/api/knowledge/L99", { headers: authHeaders() });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	it("returns 400 for non-layer values like /knowledge/banana", async () => {
		const res = await app.request("/api/knowledge/banana", { headers: authHeaders() });
		expect(res.status).toBe(400);
	});

	it("accepts each valid layer (L0..L4)", async () => {
		for (const layer of ["L0", "L1", "L2", "L3", "L4"]) {
			const res = await app.request(`/api/knowledge/${layer}`, { headers: authHeaders() });
			expect(res.status, `layer ${layer} should be 200`).toBe(200);
		}
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
});

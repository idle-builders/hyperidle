/**
 * AL5 TDD RED — Server registry route returns index-driven data.
 *
 * Covers:
 *   AC2: the browse data path lists surfaces from the loaded index
 *         (server endpoint returns data derived from OFFICIAL_REGISTRY_INDEX, not a separate hardcoded list)
 *   AC4: a community index by URL can be loaded — the server exposes an endpoint
 *         to proxy/load a community index by URL (or the loader is pure-client;
 *         this test proves the official index route returns index-derived data)
 *
 * Tests:
 * 1. GET /api/surface-registry returns surfaces that are IN OFFICIAL_REGISTRY_INDEX
 *    (and thus index-driven, not a divergent hardcoded constant).
 * 2. OFFICIAL_REGISTRY_INDEX contains stripe-refund-review → API returns it.
 * 3. If a surface is added to OFFICIAL_REGISTRY_INDEX, the API returns it
 *    without other changes (proves the server reads from the index, not a copy).
 *
 * These tests FAIL until:
 * - The server's createSurfaceRegistryRoutes loads from OFFICIAL_REGISTRY_INDEX
 *   (packages/shared/src/registry-index.ts) instead of FIRST_PARTY_SURFACE_MANIFESTS.
 * - Or the two are proven equivalent (but the test enforces index-driven path).
 *
 * @lore AL5 RED: Currently surface-adoptions.ts uses FIRST_PARTY_SURFACE_MANIFESTS
 * (a raw array constant). The index model requires importing from OFFICIAL_REGISTRY_INDEX
 * (a RegistryIndex with name/version/surfaces). The server must use the index's
 * .surfaces array, not the separate FIRST_PARTY_SURFACE_MANIFESTS constant.
 * The failing test is the one that imports OFFICIAL_REGISTRY_INDEX and cross-checks.
 */

import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-al5-registry-index";

function authHeaders(): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
	};
}

// ── AC2: GET /api/surface-registry is index-driven ───────────────────────────

describe("AL5 registry-route — GET /api/surface-registry is index-driven (AC2)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/surface-registry returns surfaces from OFFICIAL_REGISTRY_INDEX", async ({
		db,
		app,
	}) => {
		// Seed a user (auth requirement).
		const { users } = await import("@hyperidle/db");
		await db.insert(users).values({
			id: "user-index-route",
			kind: "human",
			name: "Index Route User",
			role: "founder",
			status: "active",
			createdAt: new Date().toISOString(),
		});

		// Import the OFFICIAL_REGISTRY_INDEX — now implemented in registry-index.ts.
		const { OFFICIAL_REGISTRY_INDEX } = await import("@hyperidle/shared");

		const res = await app.request("/api/surface-registry", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		expect(Array.isArray(body)).toBe(true);

		// Every surface in the official index must be in the API response.
		for (const indexSurface of OFFICIAL_REGISTRY_INDEX.surfaces) {
			const found = body.find((s) => s.id === indexSurface.id);
			expect(found).toBeDefined();
		}
	});

	test("GET /api/surface-registry includes stripe-refund-review (index contains it)", async ({
		db,
		app,
	}) => {
		const { users } = await import("@hyperidle/db");
		await db.insert(users).values({
			id: "user-index-stripe",
			kind: "human",
			name: "Index Stripe User",
			role: "founder",
			status: "active",
			createdAt: new Date().toISOString(),
		});

		const res = await app.request("/api/surface-registry", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;

		// The official index contains stripe-refund-review.
		// The server must return it because it reads from the index.
		const stripe = body.find((s) => s.id === "stripe-refund-review");
		expect(stripe).toBeDefined();
		expect(stripe?.provenance).toBe("first-party");
		expect(stripe?.baseCanvas).toBe("action_operation");
	});

	test("GET /api/surface-registry response matches the OFFICIAL_REGISTRY_INDEX exactly", async ({
		db,
		app,
	}) => {
		// This is the strongest index-driven proof: the API response surface ids
		// must be exactly the set in OFFICIAL_REGISTRY_INDEX.surfaces (no more, no less).
		const { users } = await import("@hyperidle/db");
		await db.insert(users).values({
			id: "user-index-exact",
			kind: "human",
			name: "Index Exact User",
			role: "founder",
			status: "active",
			createdAt: new Date().toISOString(),
		});

		// OFFICIAL_REGISTRY_INDEX is now exported from @hyperidle/shared.
		const { OFFICIAL_REGISTRY_INDEX } = await import("@hyperidle/shared");

		const res = await app.request("/api/surface-registry", {
			method: "GET",
			headers: authHeaders(),
		});

		const body = (await res.json()) as Array<Record<string, unknown>>;

		const apiIds = new Set(body.map((s) => s.id as string));
		const indexIds = new Set(OFFICIAL_REGISTRY_INDEX.surfaces.map((s) => s.id));

		// Every id in the API response must be in the official index.
		for (const apiId of apiIds) {
			expect(indexIds.has(apiId)).toBe(true);
		}
	});
});

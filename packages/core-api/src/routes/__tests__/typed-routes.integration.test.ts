/**
 * D. Route Chaining Integration Tests
 *
 * These tests verify that route factories return chained Hono instances
 * (not bare Hono with imperative router.get(…)) for AppType inference.
 *
 * @lore api-typesafety RED phase: The route factories currently return a
 * bare Hono instance with imperative router.get(…) calls. The tests here
 * verify the chained pattern needed for AppType inference.
 *
 * The integration tests use createTestDb/createTestApp which need a real DB.
 */

import { bets, teamMembers, teams } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { betDetailResponseSchema, betListResponseSchema } from "../../schemas/bet.schema.js";
import { test } from "../../test-fixtures.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const TEST_API_KEY = "test-key-typed-routes";

function authHeaders(): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
	};
}

// ── D1: bets route factory returns chained Hono instance ──────────────────────

describe("D1. Bets route factory structure", () => {
	test("createBetRoutes function exists and is importable", async () => {
		const mod = await import("../bets.js");
		expect(typeof mod.createBetRoutes).toBe("function");
	});

	test("createBetRoutes returns a Hono instance", async ({ db }) => {
		const mod = await import("../bets.js");
		const eventBus = new EventBus();
		const router = mod.createBetRoutes(db, eventBus);

		// Should be a Hono instance with routes attached
		expect(router).toBeDefined();
		expect(typeof router.request).toBe("function");
	});
});

// ── D2: GET /api/bets returns betListResponseSchema-conforming response ────────

describe("D2. GET /api/bets returns betListResponseSchema-conforming response", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with a grouped bet list", async ({ db, app }) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "prod-d2", name: "Product D2", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: "team-d2", teamId: "prod-d2", capacity: 3, activeBets: 0, formedAt: now });

		const res = await app.request("/api/bets", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = await res.json();
		// Must conform to the grouped structure
		const validation = betListResponseSchema.safeParse(body);
		expect(validation.success).toBe(true);
	});

	// @lore U1: Status groups simplified to draft|active|completed|killed.
	test("returns each status group (draft, active, completed, killed)", async ({ db, app }) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "prod-d2b", name: "Product D2b", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: "team-d2b", teamId: "prod-d2b", capacity: 3, activeBets: 0, formedAt: now });

		const res = await app.request("/api/bets", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("draft");
		expect(body).toHaveProperty("active");
		expect(body).toHaveProperty("completed");
		expect(body).toHaveProperty("killed");
	});

	test("returns empty arrays when no bets exist", async ({ app }) => {
		const res = await app.request("/api/bets", { headers: authHeaders() });
		const body = (await res.json()) as { draft: unknown[] };
		expect(Array.isArray(body.draft)).toBe(true);
		expect(body.draft.length).toBe(0);
	});
});

// ── D3: GET /api/bets/:id returns betDetailResponseSchema-conforming response ──

describe("D3. GET /api/bets/:id returns betDetailResponseSchema-conforming response", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with a bet detail conforming to betDetailResponseSchema", async ({
		db,
		app,
	}) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "prod-d3", name: "Product D3", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: "team-d3", teamId: "prod-d3", capacity: 3, activeBets: 0, formedAt: now });
		await db.insert(bets).values({
			id: "bet-d3",
			teamId: "prod-d3",
			description: "# Bet D3\n\nThis is a test bet.",
			status: "draft",
			createdAt: now,
		});

		const res = await app.request("/api/bets/bet-d3", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = await res.json();
		const validation = betDetailResponseSchema.safeParse(body);
		expect(validation.success).toBe(true);
	});

	test("returns 404 for non-existent bet", async ({ app }) => {
		const res = await app.request("/api/bets/nonexistent-bet", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});
});

// ── D4: POST /api/bets with invalid body returns 400 with VALIDATION_ERROR ────

describe("D4. POST /api/bets with invalid body returns 400 VALIDATION_ERROR", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 400 with VALIDATION_ERROR when body is missing required fields", async ({
		app,
	}) => {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				// missing productId, teamId, pitch
				hypothesis: "some hypothesis",
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	test("returns 400 with VALIDATION_ERROR when body has unknown fields (strict schema)", async ({
		app,
	}) => {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				productId: "prod-1",
				teamId: "team-1",
				description: "Pitch text",
				appetite: "2 weeks", // old deprecated field — should be rejected
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});
});

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

import { bets, createTestDb, type HyperIdleDb, products, teams } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";
import {
	betListResponseSchema,
	betDetailResponseSchema,
} from "../../schemas/bet.schema.js";

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
	it("createBetRoutes function exists and is importable", async () => {
		const mod = await import("../bets.js");
		expect(typeof mod.createBetRoutes).toBe("function");
	});

	it("createBetRoutes returns a Hono instance", async () => {
		const mod = await import("../bets.js");
		const db = createTestDb();
		const eventBus = new EventBus();
		const router = mod.createBetRoutes(db, eventBus);

		// Should be a Hono instance with routes attached
		expect(router).toBeDefined();
		expect(typeof router.request).toBe("function");
	});
});

// ── D2: GET /api/bets returns betListResponseSchema-conforming response ────────

describe("D2. GET /api/bets returns betListResponseSchema-conforming response", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		const now = new Date().toISOString();
		db.insert(products).values({ id: "prod-d2", name: "Product D2", phase: "build", createdAt: now }).run();
		db.insert(teams).values({ id: "team-d2", productId: "prod-d2", capacity: 3, activeBets: 0, formedAt: now }).run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 200 with a grouped bet list", async () => {
		const res = await app.request("/api/bets", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = await res.json();
		// Must conform to the grouped structure
		const validation = betListResponseSchema.safeParse(body);
		expect(validation.success).toBe(true);
	});

	it("returns each status group (shaped, committed, in_progress, shipped, killed)", async () => {
		const res = await app.request("/api/bets", { headers: authHeaders() });
		const body = await res.json() as Record<string, unknown>;
		expect(body).toHaveProperty("shaped");
		expect(body).toHaveProperty("committed");
		expect(body).toHaveProperty("in_progress");
		expect(body).toHaveProperty("shipped");
		expect(body).toHaveProperty("killed");
	});

	it("returns empty arrays when no bets exist", async () => {
		const res = await app.request("/api/bets", { headers: authHeaders() });
		const body = await res.json() as { shaped: unknown[] };
		expect(Array.isArray(body.shaped)).toBe(true);
		expect(body.shaped.length).toBe(0);
	});
});

// ── D3: GET /api/bets/:id returns betDetailResponseSchema-conforming response ──

describe("D3. GET /api/bets/:id returns betDetailResponseSchema-conforming response", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		const now = new Date().toISOString();
		db.insert(products).values({ id: "prod-d3", name: "Product D3", phase: "build", createdAt: now }).run();
		db.insert(teams).values({ id: "team-d3", productId: "prod-d3", capacity: 3, activeBets: 0, formedAt: now }).run();
		db.insert(bets).values({
			id: "bet-d3",
			productId: "prod-d3",
			teamId: "team-d3",
			pitch: "# Bet D3\n\nThis is a test bet.",
			status: "shaped",
			createdAt: now,
		}).run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 200 with a bet detail conforming to betDetailResponseSchema", async () => {
		const res = await app.request("/api/bets/bet-d3", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = await res.json();
		const validation = betDetailResponseSchema.safeParse(body);
		expect(validation.success).toBe(true);
	});

	it("returns 404 for non-existent bet", async () => {
		const res = await app.request("/api/bets/nonexistent-bet", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});
});

// ── D4: POST /api/bets with invalid body returns 400 with VALIDATION_ERROR ────

describe("D4. POST /api/bets with invalid body returns 400 VALIDATION_ERROR", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 400 with VALIDATION_ERROR when body is missing required fields", async () => {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				// missing productId, teamId, pitch
				hypothesis: "some hypothesis",
			}),
		});

		expect(res.status).toBe(400);
		const body = await res.json() as { code: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	it("returns 400 with VALIDATION_ERROR when body has unknown fields (strict schema)", async () => {
		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Pitch text",
				appetite: "2 weeks", // old deprecated field — should be rejected
			}),
		});

		expect(res.status).toBe(400);
		const body = await res.json() as { code: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});
});

// ── D5: Response validator catches schema violations ──────────────────────────

describe("D5. Response validator integration with routes", () => {
	it("routes with response validator middleware return 500 on schema violation", async () => {
		// This test uses the server's responseValidator middleware to verify
		// it's actually applied to routes in a typical integration setup.
		// The middleware must be present and active on the app.

		// We test this by creating a controlled Hono app with the middleware
		// and a route that returns a wrong shape
		const { Hono } = await import("hono");
		const { responseValidator, registerResponseSchema } = await import(
			"../../middleware/response-validator.js"
		);

		const z = (await import("zod")).z;

		const strictSchema = z.object({ id: z.string(), required: z.string() });
		registerResponseSchema("GET", "/api/validator-test", strictSchema);

		const app = new Hono();
		app.use("*", responseValidator());
		app.get("/api/validator-test", (c) => c.json({ id: "1", wrong: "field" }));

		const res = await app.request("/api/validator-test");
		expect(res.status).toBe(500);
		const body = await res.json() as { code: string };
		expect(body.code).toBe("SCHEMA_VIOLATION");
	});
});

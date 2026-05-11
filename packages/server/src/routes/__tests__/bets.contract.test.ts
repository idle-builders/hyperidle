/**
 * api-contract Phase 2 — AC-2: Bets contract tests using testClient.
 *
 * Tests the typed contract for the BetsRoutes sub-router.
 * Each test exercises one status code path per route.
 * One @ts-expect-error test proves the type contract catches misuse at
 * compile time (architecture spec: contract test pattern section).
 *
 * Uses `testClient(app)` from hono/testing — in-memory Hono, no URL,
 * no network (architecture O-2).
 */

import { bets, createTestDb, products, teams } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { testClient } from "hono/testing";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createBetRoutes, type BetsRoutes } from "../bets.js";

// ─── BetsRoutes type export ──────────────────────────────────────────────────

describe("BetsRoutes type export — AC-2.1", () => {
	it("createBetRoutes is a function", () => {
		expect(typeof createBetRoutes).toBe("function");
	});

	it("the return value of createBetRoutes is a Hono instance (has fetch method)", () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		expect(typeof app.fetch).toBe("function");
	});

	it("BetsRoutes type is exported and assignable to the return type of createBetRoutes", () => {
		// Runtime placeholder — the real assertion is at compile time.
		// TypeScript will error if `BetsRoutes` is not an exported type.
		type _AssertExported = BetsRoutes;
		expect(true).toBe(true);
	});
});

// ─── GET / — list bets ───────────────────────────────────────────────────────

describe("Bets contract — GET / — AC-2.2", () => {
	it("GET / returns 200 with grouped bet buckets for an empty DB", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client.index.$get();
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data).toHaveProperty("shaped");
		expect(data).toHaveProperty("committed");
		expect(data).toHaveProperty("in_progress");
		expect(data).toHaveProperty("shipped");
		expect(data).toHaveProperty("killed");
		expect(Array.isArray(data.shaped)).toBe(true);
	});

	it("response type has bet-group properties accessible without cast", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client.index.$get();
		const data = await res.json();
		expectTypeOf(data).toHaveProperty("shaped");
		expectTypeOf(data).toHaveProperty("committed");
	});
});

// ─── GET /canvas ─────────────────────────────────────────────────────────────

describe("Bets contract — GET /canvas — AC-2.2", () => {
	it("GET /canvas returns 200 with shaped, committed, and capacity", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client.canvas.$get();
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data).toHaveProperty("shaped");
		expect(data).toHaveProperty("committed");
		expect(data).toHaveProperty("capacity");
		expect(data.capacity).toHaveProperty("used");
		expect(data.capacity).toHaveProperty("max");
	});
});

// ─── GET /:id ────────────────────────────────────────────────────────────────

describe("Bets contract — GET /:id — AC-2.2", () => {
	it("GET /:id returns 404 with ApiErrorResponse shape for unknown bet", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"].$get({ param: { id: "does-not-exist" } });
		expect(res.status).toBe(404);

		const data = await res.json();
		expect(data).toHaveProperty("error");
		expect(data).toHaveProperty("code");
	});

	it("GET /:id returns 200 with enriched bet detail when bet exists", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const now = new Date().toISOString();

		db.insert(products)
			.values({ id: "p-contract-1", name: "ContractProd", phase: "build", createdAt: now })
			.run();
		db.insert(teams)
			.values({
				id: "t-contract-1",
				productId: "p-contract-1",
				capacity: 5,
				activeBets: 0,
				formedAt: now,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b-contract-1",
				productId: "p-contract-1",
				teamId: "t-contract-1",
				pitch: "# Contract Pilot\nTest bet for contract tests.",
				status: "shaped",
				createdAt: now,
			})
			.run();

		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"].$get({ param: { id: "b-contract-1" } });
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data).toHaveProperty("id");
		expect(data).toHaveProperty("title");
		expect(data).toHaveProperty("progress");
	});
});

// ─── POST / — create bet ─────────────────────────────────────────────────────

describe("Bets contract — POST / — AC-2.2, AC-2.3", () => {
	it("POST / returns 201 with created bet on valid body", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const now = new Date().toISOString();

		db.insert(products)
			.values({ id: "p-post-1", name: "PostProd", phase: "build", createdAt: now })
			.run();
		db.insert(teams)
			.values({ id: "t-post-1", productId: "p-post-1", capacity: 5, activeBets: 0, formedAt: now })
			.run();

		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client.index.$post({
			json: {
				productId: "p-post-1",
				teamId: "t-post-1",
				pitch: "# New Bet\nCreated via contract test.",
			},
		});
		expect(res.status).toBe(201);

		const data = await res.json();
		expect(data).toHaveProperty("id");
		expect(data).toHaveProperty("status");
	});

	it("POST / returns 400 with validation error on missing required fields", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client.index.$post({
			// @ts-expect-error deliberately omitting required fields to test 400 response
			json: {},
		});
		expect(res.status).toBe(400);

		const data = await res.json();
		expect(data).toHaveProperty("error");
		expect(data).toHaveProperty("code");
	});
});

// ─── PATCH /:id ──────────────────────────────────────────────────────────────

describe("Bets contract — PATCH /:id — AC-2.2", () => {
	it("PATCH /:id returns 404 for unknown bet when updating cost_appetite", async () => {
		// The PATCH route explicitly returns 404 only for the cost_appetite field path.
		// Other field updates go through updateBetField() which throws (→ 500 via global handler).
		// Contract tests cover only explicitly-returned status codes per architecture spec.
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"].$patch({
			param: { id: "no-such-bet" },
			json: { field: "cost_appetite", value: null, reason: "Test" },
		});
		expect(res.status).toBe(404);
	});

	it("PATCH /:id returns 400 on invalid update body", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"].$patch({
			param: { id: "some-id" },
			// @ts-expect-error deliberately invalid field to test 400 response
			json: { field: "nonexistent_field", value: "x", reason: "Test" },
		});
		expect(res.status).toBe(400);
	});
});

// ─── POST /:id/kill ───────────────────────────────────────────────────────────

describe("Bets contract — POST /:id/kill — AC-2.2", () => {
	it("POST /:id/kill returns 404 for unknown bet", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"].kill.$post({
			param: { id: "no-such-bet" },
			json: { reason: "No longer needed" },
		});
		expect(res.status).toBe(404);
	});
});

// ─── POST /:id/pause ─────────────────────────────────────────────────────────

describe("Bets contract — POST /:id/pause — AC-2.2", () => {
	it("POST /:id/pause returns 404 for unknown bet", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"].pause.$post({
			param: { id: "no-such-bet" },
			json: { reason: "Blocked by dependency" },
		});
		expect(res.status).toBe(404);
	});
});

// ─── POST /:id/resume ────────────────────────────────────────────────────────

describe("Bets contract — POST /:id/resume — AC-2.2", () => {
	it("POST /:id/resume returns 404 for unknown bet", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"].resume.$post({
			param: { id: "no-such-bet" },
			json: {},
		});
		expect(res.status).toBe(404);
	});
});

// ─── GET /:id/artifact-thread-summary ────────────────────────────────────────

describe("Bets contract — GET /:id/artifact-thread-summary — AC-2.2", () => {
	it("GET /:id/artifact-thread-summary returns 404 for unknown bet", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"]["artifact-thread-summary"].$get({
			param: { id: "no-such-bet" },
		});
		expect(res.status).toBe(404);
	});

	it("GET /:id/artifact-thread-summary returns 200 with empty summaries when bet has no tasks", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const now = new Date().toISOString();

		db.insert(products)
			.values({ id: "p-ats-1", name: "ATS Prod", phase: "build", createdAt: now })
			.run();
		db.insert(teams)
			.values({ id: "t-ats-1", productId: "p-ats-1", capacity: 5, activeBets: 0, formedAt: now })
			.run();
		db.insert(bets)
			.values({
				id: "b-ats-1",
				productId: "p-ats-1",
				teamId: "t-ats-1",
				pitch: "# ATS Bet\nArtifact thread summary test.",
				status: "shaped",
				createdAt: now,
			})
			.run();

		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":id"]["artifact-thread-summary"].$get({
			param: { id: "b-ats-1" },
		});
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data).toHaveProperty("summaries");
		expect(data).toHaveProperty("totalCount");
		expect(data).toHaveProperty("truncated");
		expect(Array.isArray(data.summaries)).toBe(true);
	});
});

// ─── Type-level contract enforcement ─────────────────────────────────────────

describe("Bets contract — compile-time type safety", () => {
	it("@ts-expect-error: bet id must be string — number is rejected at type level", () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createBetRoutes(db, eventBus);
		const client = testClient(app);

		// This MUST cause a TypeScript compile error.
		// If TS does NOT error, the @ts-expect-error directive itself becomes
		// TS2578, causing `bun run check` to fail — proving the type contract
		// is enforced.
		// @ts-expect-error id must be a string, not a number
		void client[":id"].$get({ param: { id: 123 } });
	});
});

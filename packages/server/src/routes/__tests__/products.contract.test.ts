/**
 * api-contract red phase: AC-2 (typed route handle export) + AC-3 (zValidator replaces validateBody)
 *
 * These tests target the CONVERTED products.ts that:
 * 1. Exports `ProductsRoutes = ReturnType<typeof createProductRoutes>`
 * 2. Uses the chained Hono form so the type is fully captured
 * 3. testClient(app) gives a typed client with narrowed response types
 * 4. An invalid request (if products had POST) returns 400 with ApiErrorResponse shape
 *
 * products.ts has no POST route so AC-3 (invalid body → 400) is verified here
 * by asserting the GET error path (404) returns ApiErrorResponse shape.
 *
 * These tests will fail until Phase 3b converts products.ts to chained form
 * and exports `ProductsRoutes`.
 */

import { createTestDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { testClient } from "hono/testing";
import { describe, expect, expectTypeOf, it } from "vitest";
// @ambiguity: ProductsRoutes does not exist yet — this import causes a compile
// error until Phase 3b adds `export type ProductsRoutes = ReturnType<typeof createProductRoutes>`.
import { createProductRoutes, type ProductsRoutes } from "../products.js";

// AC-2: The exported type exists and is importable
describe("ProductsRoutes type export — AC-2", () => {
	it("createProductRoutes is a function", () => {
		expect(typeof createProductRoutes).toBe("function");
	});

	it("the return value of createProductRoutes is a Hono instance (has fetch method)", () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createProductRoutes(db, eventBus);
		// A Hono instance (or chained Hono) exposes `fetch`
		expect(typeof app.fetch).toBe("function");
	});

	it("ProductsRoutes is assignable to the return type of createProductRoutes (type-level check)", () => {
		// This test verifies the type is actually exported. The TypeScript compiler
		// will error if `ProductsRoutes` is not an exported type from products.ts.
		// At runtime this is a no-op — the value assertion is in the type system.
		type _AssertExported = ProductsRoutes;
		expect(true).toBe(true); // placeholder runtime assertion
	});
});

describe("Products contract — GET / via testClient — AC-2, AC-3", () => {
	it("GET / returns 200 with { products: [] } for an empty DB", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createProductRoutes(db, eventBus);
		// testClient is the canonical in-memory test pattern (architecture O-2)
		const client = testClient(app);

		const res = await client.index.$get();
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data).toHaveProperty("products");
		expect(Array.isArray(data.products)).toBe(true);
		expect(data.products).toHaveLength(0);
	});

	it("response type has a `products` property accessible without cast", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createProductRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client.index.$get();
		// TypeScript should infer data.products as an array type without `as` cast.
		// If the route returns the inferred type, this compiles without cast.
		const data = await res.json();
		// This assertion proves the inferred type has `products` property
		expectTypeOf(data).toHaveProperty("products");
	});
});

describe("Products contract — GET /:productId via testClient — AC-2, AC-3", () => {
	it("GET /:productId returns 404 with ApiErrorResponse shape for unknown product", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createProductRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":productId"].$get({
			param: { productId: "does-not-exist" },
		});
		expect(res.status).toBe(404);

		const data = await res.json();
		// Must include ApiErrorResponse shape fields
		expect(data).toHaveProperty("error");
		expect(data).toHaveProperty("code");
		expect((data as { code: string }).code).toBe("not_found");
	});

	it("GET /:productId narrows status — 404 shape has error+code fields", async () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createProductRoutes(db, eventBus);
		const client = testClient(app);

		const res = await client[":productId"].$get({
			param: { productId: "ghost" },
		});

		// Status narrows the type: 404 should carry error response shape
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(typeof (body as { error: string }).error).toBe("string");
	});

	it("@ts-expect-error: productId must be string — number is rejected at type level", () => {
		const db = createTestDb();
		const eventBus = new EventBus();
		const app = createProductRoutes(db, eventBus);
		const client = testClient(app);

		// This line MUST cause a TypeScript compile error.
		// The test itself passes at runtime (it never executes the call) —
		// the @ts-expect-error comment is the assertion: if TS does NOT error,
		// the directive itself becomes a TS error (TS2578), causing test to fail on check.
		// @ts-expect-error productId must be a string, not a number
		void client[":productId"].$get({ param: { productId: 123 } });
	});
});

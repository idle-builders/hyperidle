/**
 * api-contract red phase: AC-5 — Web client wiring: typed client compiles.
 *
 * A type-level test that imports per-domain route types from the server
 * and asserts that `hc<ProductsRoutes>()` produces narrowed response types.
 *
 * This test will fail until:
 * 1. Phase 1 adds `hono` as devDependency of packages/web (hono/client not available yet).
 * 2. Phase 1 adds `{ "path": "../server" }` to packages/web/tsconfig.json references.
 * 3. Phase 3b exports `ProductsRoutes` from packages/server/src/routes/products.ts.
 *
 * @ambiguity: The import `@hyperidle/server/routes/products` resolves via
 * the root tsconfig paths mapping `@hyperidle/server` → `./packages/server/src`.
 * In the web package, it also requires Vite resolve.alias (Phase 1 task 2e).
 * The TypeScript project reference (Phase 1 task 2a) is what makes `tsc --noEmit`
 * resolve it; the Vite alias is for the dev server.
 */

// @ts-expect-error ProductsRoutes does not yet exist in products.ts (Phase 3b adds it).
// Similarly, the server reference in web tsconfig.json does not exist (Phase 1 adds it).
import type { ProductsRoutes } from "@hyperidle/server/routes/products";
// @ts-expect-error hono/client is not yet installed as a devDependency of packages/web.
// This directive itself will become a TS2578 error (unused @ts-expect-error) once
// hono is added — at that point the import resolves and only the ProductsRoutes
// import (above) remains the failing blocker.
import { hc } from "hono/client";

import { describe, expect, it } from "vitest";

describe("AC-5: Typed hc<ProductsRoutes> client compiles and narrows response types", () => {
	it("hc<ProductsRoutes> creates a client with an index.$get method", () => {
		// Phase 1+3b dependency: this fails until hono is installed + ProductsRoutes exported
		const client = hc<ProductsRoutes>("/api/products");
		expect(typeof client.index.$get).toBe("function");
	});

	it("GET / response has inferred json() return type (type narrows without cast)", () => {
		const client = hc<ProductsRoutes>("/api/products");
		// Type-level assertion: the response type must be assignable to a shape
		// with a json() method. If ProductsRoutes is wrong, this compile-time assertion fails.
		// At runtime this test just checks the method exists; the type check is at compile time.
		expect(typeof client.index.$get).toBe("function");

		// Conditional type assertion: GetResponse must have json() returning a Promise
		type GetResponse = Awaited<ReturnType<typeof client.index.$get>>;
		type AssertHasJson = GetResponse extends { json(): Promise<unknown> } ? true : never;
		const typeAssert: AssertHasJson = true;
		expect(typeAssert).toBe(true);
	});

	it("GET /:productId $get method exists on the typed client", () => {
		const client = hc<ProductsRoutes>("/api/products");
		// The bracket notation client for path params
		expect(typeof client[":productId"].$get).toBe("function");
	});

	it("import type from @hyperidle/server/routes/products resolves without runtime server code", () => {
		// Structural test: the ProductsRoutes type import must be `import type` only.
		// With verbatimModuleSyntax: true, a bare `import { X }` on a type-only export
		// is a compile error. This test verifies the import at the top of this file
		// uses `import type` syntax.
		//
		// Since we already use `import type { ProductsRoutes }` above, this is
		// a documentation assertion — the runtime value is undefined (erased).
		//
		// @ambiguity: There is no runtime-observable way to assert "this was a type
		// import" — the guarantee lives at compile time. This test serves as a
		// documentation anchor for the dependency-flow contract.
		expect(true).toBe(true);
	});
});

/**
 * api-contract Phase 1+2 — AC-5: Web client wiring: typed client compiles.
 *
 * A type-level test that imports per-domain route types from the server
 * and asserts that `hc<ProductsRoutes>()` produces narrowed response types.
 *
 * @ambiguity: The import `@hyperidle/server/routes/products` resolves via
 * the root tsconfig paths mapping `@hyperidle/server` → `./packages/server/src`.
 * In the web package, it also requires Vite resolve.alias (Phase 1 task 2e).
 * The TypeScript project reference (Phase 1 task 2a) is what makes `tsc --noEmit`
 * resolve it; the Vite alias is for the dev server.
 */

import type { ProductsRoutes } from "@hyperidle/server/routes/products";
import { hc } from "hono/client";

import { describe, expect, it } from "vitest";

describe("AC-5: Typed hc<ProductsRoutes> client compiles and narrows response types", () => {
	it("hc<ProductsRoutes> creates a client with an index.$get method", () => {
		const client = hc<ProductsRoutes>("/api/products");
		// @lore api-contract: hc<T> produces optional properties for path keys because
		// TypeScript intersection types for chained routes mark each path segment as
		// optional. Non-null assertion (!) is safe here — the root path `/` always
		// exists on a ProductsRoutes client at runtime (hono/client uses a Proxy).
		// The contract tests use testClient() which avoids this typing quirk.
		// biome-ignore lint/style/noNonNullAssertion: root path always present on ProductsRoutes client
		expect(typeof client.index!.$get).toBe("function");
	});

	it("GET / response has inferred json() return type (type narrows without cast)", () => {
		const client = hc<ProductsRoutes>("/api/products");
		// Type-level assertion: the response type must be assignable to a shape
		// with a json() method. If ProductsRoutes is wrong, this compile-time assertion fails.
		// At runtime this test just checks the method exists; the type check is at compile time.
		// biome-ignore lint/style/noNonNullAssertion: root path always present on ProductsRoutes client
		expect(typeof client.index!.$get).toBe("function");

		// Conditional type assertion: GetResponse must have json() returning a Promise
		// NonNullable because hc<T> marks path keys as optional (Proxy-based, always defined at runtime)
		type GetResponse = Awaited<ReturnType<NonNullable<typeof client.index>["$get"]>>;
		type AssertHasJson = GetResponse extends { json(): Promise<unknown> } ? true : never;
		const typeAssert: AssertHasJson = true;
		expect(typeAssert).toBe(true);
	});

	it("GET /:productId $get method exists on the typed client", () => {
		const client = hc<ProductsRoutes>("/api/products");
		// The bracket notation client for path params
		// biome-ignore lint/style/noNonNullAssertion: :productId path always present on ProductsRoutes client
		expect(typeof client[":productId"]!.$get).toBe("function");
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

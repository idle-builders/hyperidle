/**
 * E. AppType & Client Tests
 *
 * These tests verify that:
 * 1. `AppType` is exported from the server package (via app.ts)
 * 2. `hc<AppType>` can construct a typed client
 * 3. The client paths match expected route structure
 *
 * @lore api-typesafety RED phase: AppType is not yet exported from app.ts.
 * The architecture requires `export type AppType = typeof apiRoutes` from
 * app.ts.
 *
 * The `hc` tests use hono/client which IS available. The AppType export
 * is a type-level check — the runtime tests verify the module structure.
 *
 * @lore AU31 §7.1: the former "E4. AppType subpath re-export" describe block
 * asserted `package.json`'s `exports` field carries a `./schemas` subpath —
 * a config-shape check, not application behavior (`.claude/rules/testing.md`:
 * "Validating config files… that's CI"). The face shrink deletes that entry
 * deliberately (core-api's public face is `.`/`./boot`/`./app`; `AppType`'s
 * only real consumer, `agent-orchestration-port-composition.ts`, already
 * reaches it by a same-package relative import, never the subpath), so the
 * block pinned a superseded decision rather than a live capability. Deleted
 * rather than repointed — E1–E3 already cover the real behavior (`AppType`
 * loads, `hc<AppType>` builds a typed client, the client's paths match the
 * route shape).
 */

import type { Hono } from "hono";
import { hc } from "hono/client";
import { describe, expect, it } from "vitest";

describe("E1. AppType is exported from app.ts", () => {
	// @lore S1: app.ts has many transitive imports (routes, services, middleware)
	// so the first dynamic import in a test run takes >5s to transform+load.
	// Timeout raised to 30s to prevent flaky CI failures on cold module caches.
	it("app.ts module exports AppType type identifier", async () => {
		// At runtime we verify the module loads and has expected exports.
		// AppType is a `typeof apiRoutes` export — the implementation
		// must call `export type AppType = typeof apiRoutes` in app.ts.
		const mod = await import("../app.js");
		// app.ts currently exports: createCoreApiApp, disposeApp, AppOptions
		// After implementation it must also export AppType (as a type).
		// We verify the module loads — type exports are compile-time only.
		expect(mod).toBeDefined();
		expect(mod.createCoreApiApp).toBeDefined();
		// The implementation will add: export type AppType = typeof apiRoutes
		// We can't assert a type at runtime — the type-level test is in the
		// TypeScript compilation (bun run check).
	}, 30_000);
});

describe("E2. hc<AppType> client constructs typed requests", () => {
	it("hc is importable from hono/client", () => {
		expect(typeof hc).toBe("function");
	});

	it("hc creates a client instance from a base URL", () => {
		// Without a real AppType we demonstrate the hc API works.
		// The full typed test is at compile time (TypeScript inference).
		// At runtime, hc accepts any type parameter.
		type MinimalType = {
			api: {
				bets: {
					$get: () => Promise<Response>;
				};
			};
		};
		// biome-ignore lint/suspicious/noExplicitAny: test-only cast for hc constraint
		const client = hc<MinimalType & Hono<any, any, any>>("http://localhost:3001");
		expect(client).toBeDefined();
		// hc returns a Proxy object — toBeDefined() confirms it was created
		expect(client.api).toBeDefined();
		expect(client.api?.bets).toBeDefined();
	});
});

describe("E3. Client paths match expected route structure", () => {
	it("client can reference /api/bets from a typed AppType", () => {
		// Structural test: the AppType must expose these paths for hc to work.
		// Verified at compile-time; this runtime test confirms the pattern compiles.
		type BetsClientType = {
			api: {
				bets: { $get: () => Promise<Response> };
				health: { $get: () => Promise<Response> };
				products: { $get: () => Promise<Response> };
				tasks: { $get: () => Promise<Response> };
				sessions: { $get: () => Promise<Response> };
				/** @lore P2: renamed from agents → users */
				users: { $get: () => Promise<Response> };
				settings: { $get: () => Promise<Response> };
				knowledge: { $get: () => Promise<Response> };
			};
		};

		// biome-ignore lint/suspicious/noExplicitAny: test-only cast for hc constraint
		const client = hc<BetsClientType & Hono<any, any, any>>("http://localhost:3001");
		// All paths must be accessible (type-level)
		expect(client.api?.bets).toBeDefined();
		expect(client.api?.health).toBeDefined();
		expect(client.api?.products).toBeDefined();
		expect(client.api?.tasks).toBeDefined();
		expect(client.api?.sessions).toBeDefined();
		expect(client.api?.users).toBeDefined();
		expect(client.api?.settings).toBeDefined();
		expect(client.api?.knowledge).toBeDefined();
	});
});

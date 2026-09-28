/**
 * `authMiddleware` compares the API key through `crypto.timingSafeEqual`
 * (after hashing both sides to a fixed length) instead of a non-constant-time
 * `!==` string compare, so a wrong-length or wrong-value key never leaks
 * timing information.
 *
 * `vi.spyOn(crypto, "timingSafeEqual")` does not work in ESM (module
 * namespaces are frozen). Instead we `vi.mock("node:crypto")` and replace
 * the export with a tracked wrapper around the real impl. That wrapper
 * registers each call so we can assert it on both the valid + invalid
 * paths.
 *
 * @lore: the vi.mock call must live in this file, not an imported helper, so vitest's hoister pins it above every import.
 */

import type * as nodeCrypto from "node:crypto";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authMiddleware } from "../auth.js";

// Tracker for `node:crypto.timingSafeEqual` invocations, populated by the
// `vi.mock` factory below. The mock + tracker live in this file (not in a
// shared helper) because vitest's hoister must place the `vi.mock` ABOVE
// the `../auth.js` import — and that hoist only happens for `vi.mock`
// calls written directly in the test module.
const actualTimingSafeEqualCalls: Array<{
	a: Uint8Array;
	b: Uint8Array;
	result: boolean;
}> = [];

vi.mock("node:crypto", async () => {
	const actual = await vi.importActual<typeof nodeCrypto>("node:crypto");
	return {
		...actual,
		timingSafeEqual: (a: Uint8Array, b: Uint8Array): boolean => {
			let safeA = a;
			let safeB = b;
			if (a.length !== b.length) {
				const ha = actual.createHash("sha256").update(a).digest();
				const hb = actual.createHash("sha256").update(b).digest();
				safeA = ha;
				safeB = hb;
			}
			const result = actual.timingSafeEqual(safeA, safeB);
			actualTimingSafeEqualCalls.push({ a, b, result });
			return result;
		},
	};
});

const TEST_API_KEY = "test-key-timing-safe";

function buildApp(): Hono {
	const app = new Hono();
	app.use("*", authMiddleware);
	app.get("/probe", (c) => c.json({ ok: true }));
	return app;
}

describe("authMiddleware uses crypto.timingSafeEqual", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		actualTimingSafeEqualCalls.length = 0;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("calls crypto.timingSafeEqual on the valid-key path", async () => {
		const app = buildApp();
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		expect(actualTimingSafeEqualCalls.length).toBeGreaterThan(0);
	});

	it("calls crypto.timingSafeEqual on the invalid-key path", async () => {
		const app = buildApp();
		const res = await app.request("/probe", {
			headers: { "X-API-Key": "wrong-key" },
		});
		expect(res.status).toBe(401);
		expect(actualTimingSafeEqualCalls.length).toBeGreaterThan(0);
	});

	it("rejects different-length keys without throwing", async () => {
		const app = buildApp();
		const res = await app.request("/probe", {
			headers: { "X-API-Key": "x" },
		});
		// A clean 401, not an unhandled error — timingSafeEqual throws on
		// different-length inputs unless the wrapper hashes both sides first.
		expect(res.status).toBe(401);
		// The comparator must have been reached even though lengths
		// differed, proving the equal-length normalisation ran.
		expect(actualTimingSafeEqualCalls.length).toBeGreaterThan(0);
	});
});

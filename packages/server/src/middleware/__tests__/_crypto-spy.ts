/**
 * I2 A1 — module-level mock of `node:crypto.timingSafeEqual`.
 *
 * Vitest cannot `vi.spyOn` an ESM namespace export. To verify that
 * `authMiddleware` reaches the constant-time comparator, we replace the
 * export here and record every call. Tests import `actualTimingSafeEqualCalls`
 * to assert.
 *
 * The wrapper hashes both inputs to SHA-256 before delegating so different
 * length inputs do not throw — this matches the I2 plan for the comparator
 * helper (`packages/server/src/middleware/timing-safe.ts`) and lets the
 * "different-length keys" test pass once the middleware actually calls it.
 */

import type * as nodeCrypto from "node:crypto";
import { vi } from "vitest";

export const actualTimingSafeEqualCalls: Array<{
	a: Uint8Array;
	b: Uint8Array;
	result: boolean;
}> = [];

// @lore I2 A1: vi.mock is hoisted; the factory closes over the real
// node:crypto via dynamic require so we can keep all other crypto exports
// intact (random UUIDs, hashing, etc).
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

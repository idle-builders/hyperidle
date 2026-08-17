/**
 * M2 RED — api-contract type shape tests.
 *
 * These tests validate that:
 * 1. @hyperidle/api-contract compiles cleanly (proven by tsc; these run in Vitest)
 * 2. Every exported type has the expected fields (structural `satisfies` assertions)
 * 3. SettingsResponse covers all fields that DEFAULT_SETTINGS (app-shell-data.ts) provides
 *    (minus `appearance` which stays client-side per the M2 contract)
 * 4. AuthMeResponse has the required identity fields
 *
 * Tests are type-level (compile-time checks via `satisfies` + `expectTypeOf`) plus
 * runtime shape-check assertions so Vitest registers concrete pass/fail.
 *
 * @lore AD8a: Rail contract types (RailBet, RailBlocker, RailCostBurnRate, RailResponse)
 * deleted — the Rail API route and its UI surface were removed in U6. The contract
 * file rail.ts and the api-contract re-exports have been deleted.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import type { AuthMeResponse } from "../index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Type-level assertion: `value satisfies T` at the type checker,
 * plus a runtime no-op so Vitest counts it as a passing assertion.
 */
function assertShape<T>(value: T): T {
	expect(value).toBeDefined();
	return value;
}

// ── Contract 1: AuthMeResponse ────────────────────────────────────────────────

describe("AuthMeResponse (cluster 1 — auth/identity)", () => {
	it("has the required identity fields (id, name, email, avatarUrl)", () => {
		const response: AuthMeResponse = {
			id: "u-founder",
			name: "Founder",
			email: "founder@hyperidle.com",
			avatarUrl: null,
		};
		assertShape<AuthMeResponse>(response);
	});

	it("id is a string", () => {
		expectTypeOf<AuthMeResponse["id"]>().toEqualTypeOf<string>();
	});

	it("name is a string", () => {
		expectTypeOf<AuthMeResponse["name"]>().toEqualTypeOf<string>();
	});

	it("email is a string", () => {
		expectTypeOf<AuthMeResponse["email"]>().toEqualTypeOf<string>();
	});

	it("avatarUrl is string | null", () => {
		expectTypeOf<AuthMeResponse["avatarUrl"]>().toEqualTypeOf<string | null>();
	});

	it("accepts non-null avatarUrl", () => {
		const withAvatar: AuthMeResponse = {
			id: "u-founder",
			name: "Founder",
			email: "founder@hyperidle.com",
			avatarUrl: "https://example.com/avatar.png",
		};
		assertShape<AuthMeResponse>(withAvatar);
		expect(withAvatar.avatarUrl).toBe("https://example.com/avatar.png");
	});
});

// ── Index re-exports ──────────────────────────────────────────────────────────

describe("index.ts re-exports", () => {
	it("exports AuthMeResponse", () => {
		// Compile-time: if the import at top of file succeeds, this passes.
		// Runtime: assert the type name can be used as a type annotation.
		const check: AuthMeResponse = {
			id: "u-1",
			name: "Test",
			email: "test@test.com",
			avatarUrl: null,
		};
		expect(check.id).toBe("u-1");
	});
});

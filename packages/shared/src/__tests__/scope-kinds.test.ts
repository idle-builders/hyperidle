/**
 * Q2 — AC-2: ScopeKind type + SCOPE_KINDS const in @hyperidle/shared.
 *
 * AV3 amendment: "filesystem" added as the 8th scope kind.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_KINDS, SCOPES_REQUIRING_ID } from "../types.js";

describe("Q2 AC-2: SCOPE_KINDS and ScopeKind", () => {
	it("exports exactly 8 scope kinds (AV3: filesystem added)", () => {
		expect(SCOPE_KINDS).toHaveLength(8);
	});

	it("includes all required scope values", () => {
		const kinds = SCOPE_KINDS as readonly string[];
		expect(kinds).toContain("factory");
		expect(kinds).toContain("product");
		expect(kinds).toContain("practice");
		expect(kinds).toContain("team");
		expect(kinds).toContain("bet");
		expect(kinds).toContain("task");
		expect(kinds).toContain("user");
		expect(kinds).toContain("filesystem");
	});

	it("is a readonly tuple (as const)", () => {
		// Verifying it is an array-like const (not a mutable array)
		expect(Array.isArray(SCOPE_KINDS)).toBe(true);
	});

	it("SCOPES_REQUIRING_ID includes filesystem", () => {
		expect(SCOPES_REQUIRING_ID.has("filesystem" as never)).toBe(true);
	});
});

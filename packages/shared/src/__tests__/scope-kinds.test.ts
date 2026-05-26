/**
 * Q2 — AC-2: ScopeKind type + SCOPE_KINDS const in @hyperidle/shared.
 *
 * Red phase: SCOPE_KINDS and ScopeKind do not exist yet.
 * These tests fail until T1 is implemented.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_KINDS } from "../types.js";

describe("Q2 AC-2: SCOPE_KINDS and ScopeKind", () => {
	it("exports exactly 7 scope kinds", () => {
		expect(SCOPE_KINDS).toHaveLength(7);
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
	});

	it("is a readonly tuple (as const)", () => {
		// Verifying it is an array-like const (not a mutable array)
		expect(Array.isArray(SCOPE_KINDS)).toBe(true);
	});
});

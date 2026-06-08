/**
 * AE1 — Purge False Knowledge & Doc Hygiene: failing tests (red phase).
 *
 * AC3 + AC4: scopeKindToLabel("product") must return "Team" (not "Shared"),
 * and SCOPE_PILL_OPTIONS must place "product" in the Team pill's filterKinds,
 * not the Shared pill's.
 *
 * These tests intentionally fail against the current implementation and will
 * pass once scope-labels.ts is updated in the green phase.
 *
 * Note: AD6-knowledge-simplification.test.tsx line 661 currently asserts
 * scopeKindToLabel("product") === "Shared". That assertion encodes the OLD
 * behavior; it will be updated in the green phase alongside this implementation.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_PILL_OPTIONS, scopeKindToLabel } from "../utils/scope-labels";

// ---------------------------------------------------------------------------
// AC3 + AC4: scopeKindToLabel — "product" maps to "Team"
// ---------------------------------------------------------------------------

describe("AE1 — scopeKindToLabel: product → Team", () => {
	it('scopeKindToLabel("product") returns "Team"', () => {
		// FAILS currently: returns "Shared"
		expect(scopeKindToLabel("product")).toBe("Team");
	});

	it('scopeKindToLabel("team") still returns "Team"', () => {
		// Must not regress
		expect(scopeKindToLabel("team")).toBe("Team");
	});

	it('scopeKindToLabel("user") still returns "Private"', () => {
		expect(scopeKindToLabel("user")).toBe("Private");
	});

	it('scopeKindToLabel("factory") still returns "Shared"', () => {
		expect(scopeKindToLabel("factory")).toBe("Shared");
	});

	it('scopeKindToLabel("practice") still returns "Shared"', () => {
		expect(scopeKindToLabel("practice")).toBe("Shared");
	});
});

// ---------------------------------------------------------------------------
// AC4: SCOPE_PILL_OPTIONS — Team pill includes "product", Shared pill excludes it
// ---------------------------------------------------------------------------

describe("AE1 — SCOPE_PILL_OPTIONS: Team pill includes product", () => {
	it('Team pill filterKinds includes "product"', () => {
		const teamPill = SCOPE_PILL_OPTIONS.find((o) => o.id === "team");
		// FAILS currently: filterKinds is ["team"], missing "product"
		expect(teamPill?.filterKinds).toContain("product");
	});

	it('Team pill filterKinds still includes "team"', () => {
		const teamPill = SCOPE_PILL_OPTIONS.find((o) => o.id === "team");
		expect(teamPill?.filterKinds).toContain("team");
	});

	it('Shared pill filterKinds does NOT include "product"', () => {
		const sharedPill = SCOPE_PILL_OPTIONS.find((o) => o.id === "shared");
		// FAILS currently: filterKinds is ["factory", "product", "practice"] — product present
		expect(sharedPill?.filterKinds).not.toContain("product");
	});

	it('Shared pill filterKinds still includes "factory" and "practice"', () => {
		const sharedPill = SCOPE_PILL_OPTIONS.find((o) => o.id === "shared");
		expect(sharedPill?.filterKinds).toContain("factory");
		expect(sharedPill?.filterKinds).toContain("practice");
	});

	it("All pill filterKinds is null (no filter)", () => {
		const allPill = SCOPE_PILL_OPTIONS.find((o) => o.id === "all");
		expect(allPill?.filterKinds).toBeNull();
	});

	it("Private pill filterKinds is still [user]", () => {
		const privatePill = SCOPE_PILL_OPTIONS.find((o) => o.id === "private");
		expect(privatePill?.filterKinds).toContain("user");
	});
});

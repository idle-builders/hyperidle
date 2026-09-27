/**
 * AE1 — Purge False Knowledge & Doc Hygiene.
 *
 * AC3 + AC4 originally locked "product" → "Team" and SCOPE_PILL_OPTIONS
 * placing "product" in the Team pill. That work retired
 * `product` (and `practice`/`task`/`bet`) as scope values entirely — the
 * 3-value contract these tests now lock is what survived that collapse.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_PILL_OPTIONS, scopeKindToLabel } from "../utils/scope-labels.js";

describe("scopeKindToLabel: the 3-value contract", () => {
	it('scopeKindToLabel("team") returns "Team"', () => {
		expect(scopeKindToLabel("team")).toBe("Team");
	});

	it('scopeKindToLabel("user") returns "Private"', () => {
		expect(scopeKindToLabel("user")).toBe("Private");
	});

	it('scopeKindToLabel("factory") returns "Shared"', () => {
		expect(scopeKindToLabel("factory")).toBe("Shared");
	});

	// @lore "product" is not a special-cased scope value — it falls through to the same unknown-kind fallback as any other string.
	it('scopeKindToLabel("product") falls back to "Shared" (retired scope value)', () => {
		expect(scopeKindToLabel("product")).toBe("Shared");
	});
});

describe("SCOPE_PILL_OPTIONS: the 3 real scope kinds", () => {
	it('Team pill filterKinds is exactly ["team"]', () => {
		const teamPill = SCOPE_PILL_OPTIONS.find((o) => o.id === "team");
		expect(teamPill?.filterKinds).toEqual(["team"]);
	});

	it('Shared pill filterKinds is exactly ["factory"]', () => {
		const sharedPill = SCOPE_PILL_OPTIONS.find((o) => o.id === "shared");
		expect(sharedPill?.filterKinds).toEqual(["factory"]);
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

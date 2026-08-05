/**
 * AI5 E5 — `deriveInitials` shared utility (RED phase).
 *
 * Canonical algorithm: trim → first 2 chars of the trimmed string → uppercase.
 * NOT word-initials. Consolidates 3 distinct inline algorithms across 6 sites
 * (slice+upper, bare slice, word-initials) into one rendering.
 *
 * Covers the AC1 "identical rendering everywhere" contract, including the
 * intentional WorkBet delta where word-initials ("GT") become slice ("GR").
 */

import { describe, expect, it } from "vitest";
import { deriveInitials } from "../initials.js";

describe("deriveInitials", () => {
	it("takes the first two characters and uppercases them", () => {
		expect(deriveInitials("Ada Lovelace")).toBe("AD");
	});

	it("uppercases lowercase input (RecipientPicker case-only delta)", () => {
		// RecipientPicker today renders bare .slice(0,2) ("gr"); now uppercased.
		expect(deriveInitials("growth team")).toBe("GR");
	});

	it("matches the existing slice+upper sites unchanged (WorkTeam/AgentEditDialog/AgentProfile)", () => {
		expect(deriveInitials("Growth Team")).toBe("GR");
	});

	it("changes WorkBet from word-initials to slice (intentional consolidation)", () => {
		// WorkBet used split→w[0] word-initials → "GT". deriveInitials → "GR".
		expect(deriveInitials("Growth Team")).not.toBe("GT");
		expect(deriveInitials("Growth Team")).toBe("GR");
	});

	it("trims surrounding whitespace before slicing", () => {
		expect(deriveInitials("  x ")).toBe("X");
	});

	it("trims and slices a multi-word padded name from the trimmed start", () => {
		expect(deriveInitials("   Nova ")).toBe("NO");
	});

	it("returns '?' for an empty string", () => {
		expect(deriveInitials("")).toBe("?");
	});

	it("returns '?' for whitespace-only input", () => {
		expect(deriveInitials("   ")).toBe("?");
	});

	it("returns a single uppercase char for a one-character name", () => {
		expect(deriveInitials("z")).toBe("Z");
	});
});

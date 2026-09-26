/**
 * deriveInitials — canonical avatar-initials derivation.
 *
 * Founder ruling 2026-08-16: word-initials replaces slice(0,2). slice produced
 * "AC" for every Acme-prefixed agent name, making the roster unreadable.
 */

import { describe, expect, it } from "vitest";
import { deriveInitials } from "../initials.js";

describe("deriveInitials", () => {
	it.each([
		["Ada Lovelace", "AL"],
		["Acme Builder", "AB"],
		["Acme Designer", "AD"],
		["Founder", "F"],
		["  x ", "X"],
		["   Nova Rise ", "NR"],
		["growth team", "GT"],
		["Growth  Team  Extra", "GT"],
	])("deriveInitials(%j) → %j", (input, expected) => {
		expect(deriveInitials(input)).toBe(expected);
	});

	it("returns '?' for an empty or whitespace-only string", () => {
		expect(deriveInitials("")).toBe("?");
		expect(deriveInitials("   ")).toBe("?");
	});
});

/**
 * deriveInitials — canonical avatar-initials derivation.
 *
 * Founder ruling 2026-08-16: word-initials replaces slice(0,2).
 * Reason: slice produced "AC" for all five Acme-prefixed agent names,
 * making the roster unreadable. Word-initials produces distinct initials.
 */

import { describe, expect, it } from "vitest";
import { deriveInitials } from "../initials.js";

describe("deriveInitials", () => {
	it("takes first letter of each of the first two words", () => {
		expect(deriveInitials("Ada Lovelace")).toBe("AL");
	});

	it("produces distinct initials for Acme-prefixed agents (the motivation)", () => {
		expect(deriveInitials("Acme Builder")).toBe("AB");
		expect(deriveInitials("Acme Designer")).toBe("AD");
		expect(deriveInitials("Acme Researcher")).toBe("AR");
	});

	it("common name example", () => {
		expect(deriveInitials("Maya Chen")).toBe("MC");
	});

	it("returns single uppercase char for a one-word name", () => {
		expect(deriveInitials("Founder")).toBe("F");
		expect(deriveInitials("z")).toBe("Z");
	});

	it("trims surrounding whitespace before deriving", () => {
		expect(deriveInitials("  x ")).toBe("X");
	});

	it("trims and uses word-initials for a multi-word padded name", () => {
		expect(deriveInitials("   Nova Rise ")).toBe("NR");
	});

	it("returns '?' for an empty string", () => {
		expect(deriveInitials("")).toBe("?");
	});

	it("returns '?' for whitespace-only input", () => {
		expect(deriveInitials("   ")).toBe("?");
	});

	it("lowercased input still uppercases the result", () => {
		expect(deriveInitials("growth team")).toBe("GT");
	});

	it("ignores extra internal whitespace — uses first two tokens", () => {
		expect(deriveInitials("Growth  Team  Extra")).toBe("GT");
	});
});

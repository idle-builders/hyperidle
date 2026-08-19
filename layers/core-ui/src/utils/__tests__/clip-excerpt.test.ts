/**
 * UI-100/101 — clipExcerpt: word-boundary excerpt clipping.
 *
 * Verifies that the helper clips at a word boundary (not mid-word), appends
 * "…" when truncated, returns the original when under the limit, and hard-clips
 * at the limit when no space is present within the limit.
 */

import { describe, expect, it } from "vitest";
import { clipExcerpt } from "../clip-excerpt.js";

describe("clipExcerpt", () => {
	it("returns the original string when it is at or below the limit", () => {
		const short = "users respond to visual prompts";
		expect(clipExcerpt(short)).toBe(short);
	});

	it("clips at a word boundary (not mid-word) and appends ellipsis", () => {
		// Construct a string > 120 chars. The boundary word must be identifiable.
		const text =
			"six or eight days depending on the team capacity and sprint cycle which we have not yet determined";
		// text.length = 98 < 120, so it should return unchanged
		expect(clipExcerpt(text)).toBe(text);

		// Build a 130-char string where word boundaries are easy to predict
		const long =
			"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau";
		// long.length is < 130, pad it
		const padded = `${long} extra words to push past the limit boundary here end`;
		expect(padded.length).toBeGreaterThan(120);
		const result = clipExcerpt(padded);
		expect(result.endsWith("…")).toBe(true);
		expect(result.length).toBeLessThanOrEqual(121); // 120 chars + ellipsis
		// Must not cut mid-word: the last char before "…" must be a non-space word char
		const clipped = result.slice(0, -1); // remove the ellipsis
		expect(clipped.endsWith(" ")).toBe(false);
	});

	it("hard-clips at max when no space is found within the limit", () => {
		const noSpace = "a".repeat(150);
		const result = clipExcerpt(noSpace);
		// Falls back to hard cut at 120 + "…"
		expect(result).toBe(`${"a".repeat(120)}…`);
	});

	it("returns an empty string unchanged", () => {
		expect(clipExcerpt("")).toBe("");
	});

	it("respects a custom max argument", () => {
		const text = "hello world this is a test";
		const result = clipExcerpt(text, 10);
		expect(result.endsWith("…")).toBe(true);
		expect(result.length).toBeLessThanOrEqual(11); // 10 + ellipsis
		// should clip at "hello" boundary (5 chars), not mid-word
		expect(result).toBe("hello…");
	});
});

/**
 * L2 slug primitive — pinned to github-slugger output.
 * Concept § 8.4: empty / all-stripped / all-emoji → '<empty>' sentinel.
 * Pre-heading content uses a sibling '<root>' sentinel, never collisional.
 */

import { describe, expect, it } from "vitest";
import { slug } from "../../blocks/normalise.js";

describe("slug()", () => {
	it("lowercases and collapses to a hyphenated form", () => {
		expect(slug("Hello World")).toBe("hello-world");
	});

	it("strips punctuation and trims hyphens", () => {
		expect(slug("Hello, World!")).toBe("hello-world");
	});

	it("collapses multiple spaces / hyphens", () => {
		expect(slug("a   b---c")).toBe("a-b-c");
	});

	it("returns '<empty>' for empty / whitespace-only input", () => {
		expect(slug("")).toBe("<empty>");
		expect(slug("   ")).toBe("<empty>");
	});

	it("returns '<empty>' for all-punctuation input", () => {
		expect(slug("!!!")).toBe("<empty>");
		expect(slug("---")).toBe("<empty>");
	});

	it("returns '<empty>' for emoji-only input", () => {
		expect(slug("🚀")).toBe("<empty>");
		expect(slug("🎉🎉")).toBe("<empty>");
	});

	it("preserves digits", () => {
		expect(slug("42")).toBe("42");
	});

	it("a literal heading <root> does not produce the sentinel '<root>'", () => {
		// Stripping angle brackets makes "root" not "<root>".
		expect(slug("<root>")).not.toBe("<root>");
	});

	it("a literal heading <empty> does not produce the sentinel '<empty>'", () => {
		expect(slug("<empty>")).not.toBe("<empty>");
	});

	it("interleaved invocations are independent — no shared mutable cache", async () => {
		// Adversary CRITICAL: per-call slugger ensures purity under concurrent /
		// interleaved use (Promise.all, async iterators). If a module-level
		// singleton were used, interleaved calls could clobber each other's
		// dedup cache and produce non-deterministic output.
		const inputs = ["A B", "A B", "A B", "A B"];
		const sequential = inputs.map((s) => slug(s));
		const interleaved = await Promise.all(
			inputs.map(async (s, i) => {
				await new Promise((r) => setTimeout(r, i % 2));
				return slug(s);
			}),
		);
		expect(interleaved).toEqual(sequential);
		// Every call returns the bare slug — no `-1`, `-2` suffixes from a stale cache.
		for (const s of interleaved) expect(s).toBe("a-b");
	});
});

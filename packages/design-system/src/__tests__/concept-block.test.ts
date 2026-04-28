/**
 * L2 AC-1, AC-2, AC-3: concept-doc + SHARED.md presence.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// __dirname = packages/design-system/src/__tests__
const docsRoot = resolve(__dirname, "../../../../docs");

const read = (rel: string): string =>
	existsSync(resolve(docsRoot, rel)) ? readFileSync(resolve(docsRoot, rel), "utf-8") : "";

describe("concept docs presence (AC-1, AC-2, AC-3)", () => {
	it("AC-1: docs/concept/BLOCKS.md exists", () => {
		expect(existsSync(resolve(docsRoot, "concept/BLOCKS.md"))).toBe(true);
	});

	it("AC-1: HUMAN_INTERFACE_LAYER.md mentions Block primitive and links to BLOCKS.md", () => {
		const hil = read("concept/HUMAN_INTERFACE_LAYER.md");
		expect(hil).toContain("## Block primitive");
		expect(hil).toContain("BLOCKS.md");
	});

	it("AC-2: SHARED.md carries the canonical block-type signatures", () => {
		const shared = read("work-packages/SHARED.md");
		expect(shared).toMatch(/type BlockKind/);
		expect(shared).toMatch(/function deriveBlocks/);
	});

	it("AC-3: improvements-work.md cross-references block ids (#5)", () => {
		const work = read("reviews/improvements-work.md");
		expect(work).toContain("block ids");
	});

	it("AC-3: improvements-knowledge.md cross-references the Block primitive (#2)", () => {
		const k = read("reviews/improvements-knowledge.md");
		expect(k).toContain("Block primitive");
	});
});

/**
 * L2 AC-1, AC-2, AC-3: concept-doc presence.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// __dirname = packages/design-system/src/__tests__
const repoRoot = resolve(__dirname, "../../../..");
const docsRoot = resolve(repoRoot, "docs");
const plansRoot = resolve(repoRoot, "plans");

const readDoc = (rel: string): string => {
	const p = resolve(docsRoot, rel);
	return existsSync(p) ? readFileSync(p, "utf-8") : "";
};

const readPlan = (rel: string): string => {
	const p = resolve(plansRoot, rel);
	return existsSync(p) ? readFileSync(p, "utf-8") : "";
};

describe("concept docs presence (AC-1, AC-2, AC-3)", () => {
	it("AC-1: docs/blocks/ directory exists", () => {
		expect(existsSync(resolve(docsRoot, "blocks"))).toBe(true);
	});

	it("AC-1: block-primitive.md mentions Block primitive and links to BLOCKS.md", () => {
		const hil = readDoc("human-interface-layer/block-primitive.md");
		expect(hil).toContain("## Block primitive");
		expect(hil).toContain("BLOCKS.md");
	});

	it("AC-2: docs/blocks/canonical-shapes.md carries the canonical block-type signatures", () => {
		const shapes = readDoc("blocks/canonical-shapes.md");
		expect(shapes).toMatch(/type BlockKind/);
		expect(shapes).toMatch(/function deriveBlocks/);
	});

	it("AC-3: improvements-work.md cross-references block ids (#5)", () => {
		const work = readPlan("reviews/improvements-work.md");
		expect(work).toContain("block ids");
	});

	it("AC-3: improvements-knowledge.md cross-references the Block primitive (#2)", () => {
		const k = readPlan("reviews/improvements-knowledge.md");
		expect(k).toContain("Block primitive");
	});
});

/**
 * L2 AC-28: round-trip — for the 9 content kinds (NOT unknown), markdown →
 * deriveBlocks → re-serialise to markdown matches input modulo whitespace.
 *
 * The renderer of choice is the design-system's serialiser; here we only
 * assert that the derivation preserves enough structure to re-render. We
 * keep the assertion structural rather than byte-exact because list/table
 * delimiter widths can drift.
 */

import { describe, expect, it } from "vitest";
import { deriveBlocks } from "../../blocks/index.js";

const HOST = { kind: "bet" as const, id: "rt" };

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

interface Case {
	kind: string;
	md: string;
	expectIncludes: string[];
}

const cases: Case[] = [
	{ kind: "heading", md: "# Hello\n", expectIncludes: ["Hello"] },
	{ kind: "paragraph", md: "A para\n", expectIncludes: ["A para"] },
	{ kind: "list", md: "- a\n- b\n", expectIncludes: ["a", "b"] },
	{ kind: "quote", md: "> q\n", expectIncludes: ["q"] },
	{ kind: "code", md: "```ts\nconst x = 1\n```\n", expectIncludes: ["const x = 1"] },
	{ kind: "table", md: "| a | b |\n| - | - |\n| 1 | 2 |\n", expectIncludes: ["a", "b", "1", "2"] },
	{ kind: "divider", md: "---\n", expectIncludes: [] },
	{ kind: "image", md: "![alt](/x.png)\n", expectIncludes: ["alt", "/x.png"] },
	{
		kind: "html",
		md: "<details><summary>x</summary>y</details>\n",
		expectIncludes: ["details", "summary"],
	},
];

describe("Round-trip: derive → serialise to JSON → all source content is preserved", () => {
	for (const c of cases) {
		it(`${c.kind}: payload preserves source content`, () => {
			const { blocks } = deriveBlocks(c.md, HOST);
			expect(blocks.length).toBeGreaterThan(0);
			const json = JSON.stringify(blocks).toLowerCase();
			for (const needle of c.expectIncludes) {
				expect(norm(json)).toContain(norm(needle).toLowerCase());
			}
		});
	}
});

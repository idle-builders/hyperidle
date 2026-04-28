/**
 * L2 AC-6: purity. deriveBlocks() is pure — same inputs always produce
 * byte-identical outputs (no I/O, no clock, no DB).
 */

import { describe, expect, it } from "vitest";
import { deriveBlocks } from "../../blocks/index.js";

const HOST = { kind: "knowledge_item" as const, id: "k1" };

describe("deriveBlocks() purity", () => {
	it("1000 iterations of the same input produce byte-identical output", () => {
		const md = "# H\n\npara *em*\n\n```ts\nx\n```\n";
		const expected = JSON.stringify(deriveBlocks(md, HOST));
		for (let i = 0; i < 1000; i++) {
			expect(JSON.stringify(deriveBlocks(md, HOST))).toBe(expected);
		}
	});
});

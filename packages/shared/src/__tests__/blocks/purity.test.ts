/**
 * L2 AC-6: purity. deriveBlocks() is pure — same inputs always produce
 * byte-identical outputs (no I/O, no clock, no DB).
 */

import { describe, expect, it } from "vitest";
import { deriveBlocks } from "../../blocks/index.js";

const HOST = { kind: "knowledge_item" as const, id: "k1" };

describe("deriveBlocks() purity", () => {
	// @lore R3: 1000 iterations of deriveBlocks() takes ~4-8s because unified/remark
	// transforms are not trivially fast. The default 5s vitest timeout is too short
	// on slower machines or warm-up scenarios. 30s gives ample headroom.
	it("1000 iterations of the same input produce byte-identical output", { timeout: 30_000 }, () => {
		const md = "# H\n\npara *em*\n\n```ts\nx\n```\n";
		const expected = JSON.stringify(deriveBlocks(md, HOST));
		for (let i = 0; i < 1000; i++) {
			expect(JSON.stringify(deriveBlocks(md, HOST))).toBe(expected);
		}
	});
});

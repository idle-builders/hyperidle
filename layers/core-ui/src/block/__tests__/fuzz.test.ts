/**
 * L2 AC-17: derivation never throws on arbitrary input. Every emitted kind
 * is a member of the closed BlockKind set.
 */

import { BLOCK_KINDS } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { deriveBlocks } from "../derive-blocks.js";

const HOST = { kind: "agent" as const, id: "fuzz" };

const randString = (len: number, seed: number): string => {
	let s = "";
	let x = seed;
	for (let i = 0; i < len; i++) {
		x = (x * 1664525 + 1013904223) | 0;
		const code = ((x >>> 0) % 95) + 32;
		s += String.fromCharCode(code);
	}
	return s;
};

describe("Fuzz: deriveBlocks() recovers from arbitrary bytes", () => {
	// @lore R3: 200 random deriveBlocks() calls under vitest worker load takes
	// 10-30s due to remark/unified transform overhead. 60s matches the pattern
	// for other slow shared-package tests.
	it("200 random inputs never throw and emit only closed-set kinds", { timeout: 60_000 }, () => {
		for (let i = 0; i < 200; i++) {
			const body = randString(64 + (i % 256), i + 1);
			let result: ReturnType<typeof deriveBlocks> | undefined;
			expect(() => {
				result = deriveBlocks(body, HOST);
			}).not.toThrow();
			if (!result) throw new Error("no result");
			for (const b of result.blocks) {
				expect(BLOCK_KINDS).toContain(b.kind);
			}
		}
	});
});

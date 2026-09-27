/**
 * AC-4, AC-5: types and runtime constants for the Block primitive.
 *
 * @lore moved-into-core-ui: moved from framework/domain-model/src/__tests__/blocks/types.test.ts when blocks/types.ts dissolved into core-ui.
 *
 * Closed enums: BLOCK_KINDS (10) and BLOCK_HOST_KINDS (6). The exported
 * names match docs/blocks/canonical-shapes.md.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import {
	BLOCK_HOST_KINDS,
	BLOCK_ID_VERSION,
	BLOCK_KINDS,
	type Block,
	type BlockAnchor,
	type BlockDerivationResult,
	type BlockHostKind,
	type BlockId,
	type BlockKind,
	type BlockPayload,
	MAX_BODY_BYTES,
} from "../types.js";

describe("BLOCK_KINDS", () => {
	it("is a closed 10-entry array in canonical order", () => {
		expect(BLOCK_KINDS).toHaveLength(10);
		expect([...BLOCK_KINDS]).toEqual([
			"heading",
			"paragraph",
			"list",
			"quote",
			"code",
			"table",
			"divider",
			"image",
			"html",
			"unknown",
		]);
	});

	it("derives BlockKind union", () => {
		expectTypeOf<BlockKind>().toEqualTypeOf<(typeof BLOCK_KINDS)[number]>();
	});
});

describe("BLOCK_HOST_KINDS", () => {
	// @lore bet-removed: "bet" removed from BLOCK_HOST_KINDS — root tasks replace bets
	it("is a closed 5-entry array (BB1: bet removed)", () => {
		expect(BLOCK_HOST_KINDS).toHaveLength(5);
		expect([...BLOCK_HOST_KINDS]).toEqual(["task", "document", "artifact", "agent", "user"]);
	});

	it("derives BlockHostKind union", () => {
		expectTypeOf<BlockHostKind>().toEqualTypeOf<(typeof BLOCK_HOST_KINDS)[number]>();
	});
});

describe("Type exports", () => {
	it("Block has the canonical shape", () => {
		expectTypeOf<Block>().toMatchTypeOf<{
			id: BlockId;
			kind: BlockKind;
			source: {
				hostKind: BlockHostKind;
				hostId: string;
				bodyDigest: string;
				range: { start: number; end: number };
			};
			payload: BlockPayload;
			anchor: BlockAnchor;
			order: number;
		}>();
	});

	it("BlockAnchor is a closed shape with only blockId", () => {
		expectTypeOf<BlockAnchor>().toEqualTypeOf<{ blockId: BlockId }>();
	});

	it("BlockDerivationResult exposes blocks", () => {
		expectTypeOf<BlockDerivationResult>().toMatchTypeOf<{
			blocks: Block[];
		}>();
	});

	it("BlockPayload is a discriminated union over kind", () => {
		const heading: BlockPayload = {
			kind: "heading",
			level: 2,
			text: "x",
			inline: [{ type: "text", value: "x" }],
		};
		expect(heading.kind).toBe("heading");
	});
});

describe("Constants", () => {
	it("BLOCK_ID_VERSION is the v1 tag", () => {
		expect(BLOCK_ID_VERSION).toBe("blk:v1");
	});

	it("MAX_BODY_BYTES is 256 KB", () => {
		expect(MAX_BODY_BYTES).toBe(256 * 1024);
	});
});

/**
 * L2 AC-19, AC-51 edge cases.
 */

import { describe, expect, it } from "vitest";
import { deriveBlocks, MAX_BODY_BYTES } from "../../blocks/index.js";

const HOST = { kind: "user" as const, id: "u" };

describe("deriveBlocks edge cases", () => {
	it("empty body → { blocks: [] }", () => {
		expect(deriveBlocks("", HOST)).toEqual({ blocks: [] });
	});

	it("whitespace-only body → empty blocks", () => {
		const { blocks } = deriveBlocks("   \n\n  \n", HOST);
		expect(blocks).toEqual([]);
	});

	it("MAX_BODY_BYTES is the exposed constant (256 KB)", () => {
		expect(MAX_BODY_BYTES).toBe(256 * 1024);
	});

	// @lore R3: parsing a 256KB body through remark/unified is slow (~4-8s).
	// The default 5s vitest timeout is too short on slower machines or cold runs.
	it("body exactly at MAX_BODY_BYTES still parses", { timeout: 30_000 }, () => {
		const padding = "x".repeat(MAX_BODY_BYTES - 4);
		const body = `# H\n${padding}`;
		expect(body.length).toBeLessThanOrEqual(MAX_BODY_BYTES);
		const { blocks } = deriveBlocks(body, HOST);
		expect(blocks[0]!.kind).toBe("heading");
	});

	it("body > MAX_BODY_BYTES → single unknown with reason 'body-too-large'", () => {
		const body = "x".repeat(MAX_BODY_BYTES + 100);
		const { blocks } = deriveBlocks(body, HOST);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]!.kind).toBe("unknown");
		const p = blocks[0]!.payload;
		if (p.kind !== "unknown") throw new Error();
		expect(p.reason).toBe("body-too-large");
	});
});

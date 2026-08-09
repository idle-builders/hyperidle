/**
 * L2 blockId() primitive — blake2s with dkLen 16, hex-encoded.
 */

import { describe, expect, it } from "vitest";
import { blockId } from "../../blocks/block-id.js";

describe("blockId()", () => {
	it("produces a 32-char hex string", () => {
		const id = blockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "hello",
		});
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});

	it("is deterministic", () => {
		const args = {
			kind: "heading" as const,
			outlinePath: "h1",
			normalisedPayload: "hello",
		};
		expect(blockId(args)).toBe(blockId(args));
	});

	it("each input field perturbs the output", () => {
		const a = blockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "x",
		});
		const b = blockId({
			kind: "heading",
			outlinePath: "<root>",
			normalisedPayload: "x",
		});
		const c = blockId({
			kind: "paragraph",
			outlinePath: "h",
			normalisedPayload: "x",
		});
		const d = blockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "y",
		});
		expect(new Set([a, b, c, d]).size).toBe(4);
	});
});

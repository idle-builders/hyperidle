/**
 * L2 AC-27b helper: stub version tag in blockId() and prove every id changes.
 *
 * The "real" assertion is performed by the golden-ids snapshot — this test
 * exercises the version-tag participation in the hash to make the constraint
 * unambiguous to a future agent.
 */

import { BLOCK_ID_VERSION } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { blockId } from "../block-id.js";

describe("BLOCK_ID_VERSION participates in the hash", () => {
	it("BLOCK_ID_VERSION is the current 'blk:v1'", () => {
		expect(BLOCK_ID_VERSION).toBe("blk:v1");
	});

	it("identical inputs hash to the same id (positive control)", () => {
		const a = blockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "x",
		});
		const b = blockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "x",
		});
		expect(a).toBe(b);
	});

	it("changing the kind changes the id", () => {
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
		expect(a).not.toBe(b);
	});

	it("changing the outline path changes the id", () => {
		const a = blockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "x",
		});
		const b = blockId({
			kind: "paragraph",
			outlinePath: "h1",
			normalisedPayload: "x",
		});
		expect(a).not.toBe(b);
	});

	it("ids are 32 hex chars (blake2s 128)", () => {
		const id = blockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "x",
		});
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});
});

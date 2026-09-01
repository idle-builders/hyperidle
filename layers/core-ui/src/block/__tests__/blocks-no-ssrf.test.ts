/**
 * L2 AC-50: deriveBlocks() never makes a server-side fetch of an image URL.
 *
 * Stubs global fetch and asserts zero invocations during derivation.
 */

import { describe, expect, it, vi } from "vitest";
import { deriveBlocks } from "../derive-blocks.js";

describe("AC-50 — image kind never triggers server-side fetch", () => {
	it("deriveBlocks does not invoke fetch", () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
			throw new Error("fetch must not be called during derivation");
		});
		try {
			const md = "![one](https://example.com/a.png)\n\n![two](https://example.com/b.jpg)\n";
			const { blocks } = deriveBlocks(md, { kind: "task", id: "b1" });
			expect(blocks.length).toBeGreaterThan(0);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			fetchSpy.mockRestore();
		}
	});
});

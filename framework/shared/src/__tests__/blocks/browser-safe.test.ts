// @vitest-environment jsdom

/**
 * L2 AC-7: browser-safe import. Importing @hyperidle/shared/blocks (or the
 * main barrel after the blocks re-export lands) under jsdom must not pull
 * in any node:* built-in. Memory: project_white_screen_root_cause.
 */

import { describe, expect, it } from "vitest";

describe("@hyperidle/shared/blocks browser safety", () => {
	// @lore R3: remark/unified WASM cold-start under jsdom takes 10-30s.
	// The 5s default vitest timeout is too short. 60s matches the pattern
	// used in framework/db for PGlite WASM tests.
	it("imports without error under jsdom", { timeout: 60_000 }, async () => {
		await expect(import("../../blocks/index.js")).resolves.toBeTruthy();
	});

	it("the main barrel re-exports the blocks API and stays browser-safe", {
		timeout: 60_000,
	}, async () => {
		const mod = (await import("../../index.js")) as Record<string, unknown>;
		expect(mod.deriveBlocks).toBeDefined();
		expect(mod.BLOCK_KINDS).toBeDefined();
		expect(mod.BLOCK_HOST_KINDS).toBeDefined();
		expect(mod.MAX_BODY_BYTES).toBeDefined();
		expect(mod.BLOCK_ID_VERSION).toBeDefined();
		expect(mod.blockId).toBeDefined();
		expect(mod.slug).toBeDefined();
	});
});

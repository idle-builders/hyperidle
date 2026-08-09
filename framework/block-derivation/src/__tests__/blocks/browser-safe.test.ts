// @vitest-environment jsdom

/**
 * L2 AC-7: browser-safe import. Importing the block derivation API under jsdom must not pull in any
 * node:* built-in. Memory: project_white_screen_root_cause.
 *
 * @lore AU34: the second case asserted the same names through the universal barrel. That barrel is
 * what this work package dissolves, and the successor claim — "the package that derives blocks is
 * browser-safe" — is the case above, so it was deleted rather than repointed.
 *
 * @lore AU34: the surviving case imports the PACKAGE, not a sub-barrel. It used to name
 * `blocks/index.js`, which dissolved with every other sub-barrel — and a dynamic import whose result
 * is awaited as a whole (rather than destructured) has no name to resolve a destination from, so the
 * codemod could not repoint it mechanically. `../../index.js` is this package's own entry, which is
 * what "importing the block derivation API" now means.
 */

import { describe, expect, it } from "vitest";

describe("@hyperidle/block-derivation browser safety", () => {
	// @lore R3: remark/unified WASM cold-start under jsdom takes 10-30s.
	// The 5s default vitest timeout is too short. 60s matches the pattern
	// used in framework/db for PGlite WASM tests.
	it("imports without error under jsdom", { timeout: 60_000 }, async () => {
		await expect(import("../../index.js")).resolves.toBeTruthy();
	});
});

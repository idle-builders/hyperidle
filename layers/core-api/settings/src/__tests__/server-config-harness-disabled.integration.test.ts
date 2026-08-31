/**
 * AM4 RED — server_config.harnessDisabled key (Task 1)
 *
 * AC coverage:
 *  - readServerConfig() returns harnessDisabled: [] when table is empty (default)
 *  - updateServerConfig({ harnessDisabled: ["claude-code"] }) round-trips
 *  - harnessDisabled persists through read/write cycle
 *  - safeParse({}) defaults harnessDisabled to []
 *  - successive writes accumulate; removing a type removes it from the list
 *
 * FAILS until:
 *  - harnessDisabled field added to ServerConfigSchema + applyDefaults + DEFAULTS + ServerConfig + ServerConfigPatch
 *
 * @lore AU19 Increment 1f: moved from `packages/server/src/services/
 * __tests__/` — only needs `{ db }`, switched to `@hyperidle/db/test-fixtures`.
 */

import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { readServerConfig, updateServerConfig } from "../index.js";

/**
 * AM4 adds `harnessDisabled?: string[]` to ServerConfigPatch (Task 1).
 * Until the green phase adds it, we extend the type here so the red-phase tests
 * describe the required interface without modifying the implementation.
 */
type AM4ServerConfigPatch = Parameters<typeof updateServerConfig>[1] & {
	readonly harnessDisabled?: readonly string[];
};

describe("server_config.harnessDisabled key", () => {
	describe("readServerConfig defaults", () => {
		test("harnessDisabled is [] on an empty config table", async ({ db }) => {
			const config = await readServerConfig(db);
			// The new harnessDisabled key MUST be present and default to []
			expect(Array.isArray((config as { harnessDisabled?: unknown }).harnessDisabled)).toBe(true);
			expect((config as { harnessDisabled?: unknown[] }).harnessDisabled).toHaveLength(0);
		});
	});

	describe("updateServerConfig — harnessDisabled round-trip", () => {
		test("persists a list of disabled harness types", async ({ db }) => {
			await updateServerConfig(db, { harnessDisabled: ["claude-code"] } as AM4ServerConfigPatch);

			const config = await readServerConfig(db);
			const disabled = (config as { harnessDisabled?: string[] }).harnessDisabled ?? [];
			expect(disabled).toContain("claude-code");
			// @lore A `not.toContain("builtin")` sat here, guarding that the built-in
			// harness could never be disabled. That harness is gone and no harness is
			// exempt now, so the assertion guarded nothing.
			expect(disabled).toHaveLength(1);
		});

		test("round-trips multiple disabled types", async ({ db }) => {
			await updateServerConfig(db, {
				harnessDisabled: ["claude-code", "codex"],
			} as AM4ServerConfigPatch);

			const config = await readServerConfig(db);
			const disabled = (config as { harnessDisabled?: string[] }).harnessDisabled ?? [];
			expect(disabled).toContain("claude-code");
			expect(disabled).toContain("codex");
		});

		test("overwriting harnessDisabled replaces the array (not appends)", async ({ db }) => {
			await updateServerConfig(db, { harnessDisabled: ["claude-code"] } as AM4ServerConfigPatch);
			await updateServerConfig(db, { harnessDisabled: ["codex"] } as AM4ServerConfigPatch);

			const config = await readServerConfig(db);
			const disabled = (config as { harnessDisabled?: string[] }).harnessDisabled ?? [];
			// Second write replaces; claude-code is NOT in the result
			expect(disabled).not.toContain("claude-code");
			expect(disabled).toContain("codex");
		});

		test("can clear disabled list by writing []", async ({ db }) => {
			await updateServerConfig(db, { harnessDisabled: ["claude-code"] } as AM4ServerConfigPatch);
			await updateServerConfig(db, { harnessDisabled: [] } as AM4ServerConfigPatch);

			const config = await readServerConfig(db);
			const disabled = (config as { harnessDisabled?: string[] }).harnessDisabled ?? [];
			expect(disabled).toHaveLength(0);
		});

		test("harnessDisabled update does not clobber notifications", async ({ db }) => {
			// @lore AU44 batch 4: reviewAlerts removed from schema; use mutedTypes instead.
			await updateServerConfig(db, { notifications: { mutedTypes: ["review_request"] } });
			await updateServerConfig(db, { harnessDisabled: ["opencode"] } as AM4ServerConfigPatch);

			const config = await readServerConfig(db);
			// Notifications must survive unrelated harnessDisabled write
			expect(config.notifications.mutedTypes).toContain("review_request");
		});
	});
});

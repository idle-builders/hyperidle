import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "fabric",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		include: ["src/**/*.test.{ts,tsx}"],
		// @lore: Under heavy CI load (10+ parallel worktrees on a 10-core machine),
		// PGLite WASM initialization can take >30s. Increased to 120s to prevent
		// flaky hook timeouts in integration tests that call createTestDb().
		hookTimeout: 120_000,
		testTimeout: 120_000,
	},
});

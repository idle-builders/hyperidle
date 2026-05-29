import { defineConfig } from "vitest/config";
import VitestToonReporter from "./packages/shared/src/reporters/vitest-toon.js";

export default defineConfig({
	test: {
		// @lore R4: hookTimeout + testTimeout bumped from defaults (10s, 5s) to 60s.
		// Under machine contention (parallel worktree agents), createTestDb() /
		// createPgTestDb() cold-starts can exceed the 5s default, causing false-
		// positive timeouts that have nothing to do with test correctness. 60s
		// covers the worst observed case (~30s for PGLite WASM under full CPU load).
		hookTimeout: 60_000,
		testTimeout: 30_000,
		exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.worktrees/**"],
		reporters: [["dot"], new VitestToonReporter()],
		projects: [
			"packages/api-contract",
			"packages/db",
			"packages/desktop",
			"packages/server",
			"packages/fabric",
			"packages/shared",
			"packages/web",
			"packages/design-system",
			"packages/eslint-plugin-design",
			"packages/pipeline",
			"scripts",
		],
	},
});

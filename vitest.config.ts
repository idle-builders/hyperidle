import { defineConfig } from "vitest/config";
import VitestToonReporter from "./packages/shared/src/reporters/vitest-toon.js";

export default defineConfig({
	test: {
		// @lore R4: hookTimeout + testTimeout bumped from defaults (10s, 5s) to 120s.
		// Under machine contention (parallel worktree agents), createTestDb() /
		// createPgTestDb() cold-starts can exceed 60s (observed 41.8s in isolation,
		// which pushes past 60s under full-suite concurrency). 120s gives safe
		// headroom for worst-case parallel load. Note: project-level configs do NOT
		// inherit these root values — each project vitest.config.ts must set its own.
		hookTimeout: 120_000,
		testTimeout: 120_000,
		// @lore: Vitest 4.x defaults to forks pool (child processes). With 5+
		// concurrent worktree agents on a 10-core machine, unlimited workers
		// (default = CPU count) causes 50+ processes fighting for 10 cores.
		// Cap at 4 workers per instance to balance parallelism vs contention.
		maxWorkers: 4,
		minWorkers: 1,
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

import { defineConfig } from "vitest/config";

// @lore AJ1-ship: Docker-on-Mac only has 2 CPUs; maxWorkers=4 causes vitest
// worker forks to timeout under resource contention. Allow VITEST_MAX_WORKERS
// env var so the Linux container can run with reduced parallelism (=2) without
// changing the default (4) for native dev. No gate weakening — all tests run,
// just on fewer workers.
const maxWorkers = process.env["VITEST_MAX_WORKERS"]
	? Number(process.env["VITEST_MAX_WORKERS"])
	: 4;

export default defineConfig({
	test: {
		hookTimeout: 120_000,
		testTimeout: 120_000,
		maxWorkers,
		minWorkers: 1,
		exclude: [
			"**/node_modules/**",
			"**/.git/**",
			"**/dist/**",
			"**/.worktrees/**",
			"**/*.integration.test.{ts,tsx}",
		],
		reporters: ["dot"],
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
			"packages/eslint-plugin-authz",
			"packages/pipeline",
		],
	},
});

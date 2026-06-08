import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		hookTimeout: 120_000,
		testTimeout: 120_000,
		maxWorkers: 4,
		minWorkers: 4,
		include: ["packages/**/*.integration.test.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.worktrees/**"],
		reporters: ["dot"],
		pool: "threads",
		isolate: false,
		setupFiles: ["packages/db/src/vitest-integration-setup.ts"],
	},
});

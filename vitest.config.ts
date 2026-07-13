import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		hookTimeout: 120_000,
		testTimeout: 120_000,
		maxWorkers: 4,
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
			"packages/agent-layer",
			"packages/api-contract",
			"packages/core-app",
			"packages/db",
			"packages/desktop",
			"packages/eval",
			"packages/server",
			"packages/shared",
			"packages/web",
			"packages/design-system",
			"packages/eslint-plugin-design",
			"packages/eslint-plugin-authz",
		],
	},
});

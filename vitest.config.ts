import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.worktrees/**"],
		projects: [
			"packages/db",
			"packages/server",
			"packages/fabric",
			"packages/shared",
			"packages/web",
			"packages/design-system",
		],
	},
});

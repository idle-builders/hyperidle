import { defineConfig } from "vitest/config";
import VitestToonReporter from "./packages/shared/src/reporters/vitest-toon.js";

export default defineConfig({
	test: {
		exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.worktrees/**"],
		reporters: [["dot"], new VitestToonReporter()],
		projects: [
			"packages/api-contract",
			"packages/db",
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

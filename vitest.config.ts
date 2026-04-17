import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			"packages/db",
			"packages/server",
			"packages/fabric",
			"packages/shared",
			"packages/web",
		],
	},
});

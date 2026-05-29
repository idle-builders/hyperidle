import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "desktop",
		environment: "node",
		include: ["__tests__/**/*.test.ts"],
		hookTimeout: 30_000,
	},
});

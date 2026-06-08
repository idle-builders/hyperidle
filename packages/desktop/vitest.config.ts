import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "desktop",
		environment: "node",
		include: ["__tests__/**/*.test.ts"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		hookTimeout: 30_000,
	},
});

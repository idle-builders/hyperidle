import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "eval",
		// Only unit tests (no integration tests in eval package).
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

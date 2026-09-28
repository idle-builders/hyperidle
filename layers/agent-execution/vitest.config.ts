import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "agent-execution",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});

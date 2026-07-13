import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "agent-layer",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		hookTimeout: 120_000,
		testTimeout: 120_000,
	},
});

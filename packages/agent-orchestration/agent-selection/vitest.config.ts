import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "agent-selection",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

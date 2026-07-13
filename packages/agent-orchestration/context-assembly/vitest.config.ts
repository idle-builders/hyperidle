import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "context-assembly",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

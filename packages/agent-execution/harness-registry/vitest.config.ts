import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "harness-registry",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

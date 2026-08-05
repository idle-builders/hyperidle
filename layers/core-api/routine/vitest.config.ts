import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "routine",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

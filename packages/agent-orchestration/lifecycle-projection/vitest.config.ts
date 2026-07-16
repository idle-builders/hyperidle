import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "lifecycle-projection",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "governance",
		include: ["src/**/*.test.ts"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

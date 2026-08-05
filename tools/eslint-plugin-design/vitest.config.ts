import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "eslint-plugin-design",
		include: ["src/**/*.test.ts"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

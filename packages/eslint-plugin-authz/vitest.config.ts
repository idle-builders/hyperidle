import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "eslint-plugin-authz",
		include: ["src/**/*.test.ts"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

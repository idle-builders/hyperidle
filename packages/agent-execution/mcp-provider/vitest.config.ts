import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "mcp-provider",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "remote-worker",
		environment: "node",
		include: ["__tests__/**/*.test.ts"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

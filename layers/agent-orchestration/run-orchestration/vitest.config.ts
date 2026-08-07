import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "run-orchestration",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

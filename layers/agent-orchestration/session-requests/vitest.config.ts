import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "session-requests",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

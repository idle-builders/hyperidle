import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "capture-writeback",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

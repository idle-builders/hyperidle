import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "harness-registry",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		// @lore: vitest timeout — root testTimeout:120_000 doesn't cascade into defineProject (Vitest v4); falls back to 5000ms; explicit timeout required
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});

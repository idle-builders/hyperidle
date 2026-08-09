import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "harness-capability",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

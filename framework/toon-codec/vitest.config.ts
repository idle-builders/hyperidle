import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "toon-codec",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});

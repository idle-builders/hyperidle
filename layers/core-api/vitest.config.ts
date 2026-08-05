import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "core-api",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		include: ["src/**/*.test.{ts,tsx}"],
		// Exclude integration tests (handled by vitest.integration.config.ts).
		exclude: ["**/*.integration.test.{ts,tsx}"],
		setupFiles: ["src/__testing__/vitest-setup.ts"],
		hookTimeout: 120_000,
		testTimeout: 120_000,
	},
});

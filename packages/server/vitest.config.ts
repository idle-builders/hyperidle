import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "server",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		// Vitest project-level `include` replaces the default — keep in sync
		// with the test layout under `src/`.
		include: ["src/**/*.test.{ts,tsx}"],
		// Exclude integration tests (handled by vitest.integration.config.ts).
		// AR1: .real-harness.test.ts suffix eliminated — those files are now .integration.test.ts.
		exclude: ["**/*.integration.test.{ts,tsx}"],
		setupFiles: ["src/vitest-setup.ts"],
		hookTimeout: 120_000,
		testTimeout: 120_000,
	},
});

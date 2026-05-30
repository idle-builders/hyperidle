import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "db",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		// N4: also include __tests__/ for db/migrate unit tests.
		include: ["src/**/*.test.{ts,tsx}", "__tests__/**/*.test.{ts,tsx}"],
		setupFiles: ["src/vitest-setup.ts"],
		hookTimeout: 120_000,
		testTimeout: 120_000,
	},
});

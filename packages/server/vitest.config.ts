import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "server",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		// Vitest project-level `include` replaces the default — keep in sync
		// with the test layout under `src/`.
		include: ["src/**/*.test.{ts,tsx}"],
		hookTimeout: 30_000,
		testTimeout: 30_000,
	},
});

import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "fabric",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		include: ["src/**/*.test.{ts,tsx}"],
		hookTimeout: 30_000,
	},
});

import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "fabric",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		include: ["src/**/*.test.{ts,tsx}"],
		// @lore api-contract: bun:sqlite is a Bun runtime built-in that
		// Vite's module resolver cannot handle. Marking it external lets
		// Bun's native loader resolve it at runtime. See db/vitest.config.ts
		// for the full rationale.
		server: {
			deps: {
				external: [/^bun:/],
			},
		},
	},
});

import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "server",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		// Vitest project-level `include` replaces the default — keep in sync
		// with the test layout under `src/`.
		include: ["src/**/*.test.{ts,tsx}"],
		// @lore api-contract: zod v4 exports `z` as a named export from an
		// `export * from "..."` chain. Vite SSR module interop does not handle
		// this correctly in ESM → CJS bridging, causing `z` to be `undefined`
		// at runtime in tests. Inlining zod forces Vite to process it as ESM
		// (no SSR interop layer), which resolves the named `z` export correctly.
		server: {
			deps: {
				inline: ["zod"],
				// @lore api-contract: bun:sqlite is a Bun runtime built-in that
				// Vite's module resolver cannot handle. Marking it external lets
				// Bun's native loader resolve it at runtime. Without this, CI's
				// vitest workers throw "Cannot find package 'bun:sqlite'" for any
				// server test that transitively imports @hyperidle/db test-utils.
				external: [/^bun:/],
			},
		},
	},
});

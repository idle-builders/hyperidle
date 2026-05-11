import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "db",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		include: ["src/**/*.test.{ts,tsx}"],
		// @lore api-contract: bun:sqlite is a Bun runtime built-in that Vite's
		// module resolver cannot handle (the `bun:` protocol is not a known
		// specifier scheme for esbuild/Rollup). Marking it external skips Vite
		// transformation and lets Bun's native loader resolve it at runtime.
		// Without this, vitest worker processes on Linux CI (GitHub Actions,
		// oven-sh/setup-bun) throw "Cannot find package 'bun:sqlite'" because
		// Vite's transform pipeline rejects the specifier before the runtime
		// ever sees it.
		server: {
			deps: {
				external: [/^bun:/],
			},
		},
	},
});

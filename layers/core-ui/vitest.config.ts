import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	// @lore AU44 batch7: design-system, block-derivation, and conversation-parts were
	// dissolved into layers/core-ui. Their npm workspace packages are gone, so Node's
	// walk-up module resolution would fall through to the primary checkout's node_modules
	// and load the OLD pre-dissolution code — a "duplicate React" split results because
	// two React instances load from different paths. Explicit resolve aliases prevent the
	// walk-up and route imports to the right local sources.
	resolve: {
		alias: {
			"@hyperidle/design-system": resolve(import.meta.dirname, "src/ds"),
			"@hyperidle/block-derivation": resolve(import.meta.dirname, "src/block"),
			"@hyperidle/conversation-parts": resolve(import.meta.dirname, "src/components/parts"),
		},
	},
	test: {
		name: "core-ui",
		environment: "jsdom",
		environmentOptions: {
			jsdom: {
				url: "http://localhost:5173",
			},
		},
		setupFiles: ["./src/__testing__/test-setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
		// @lore: Under heavy CI load (10+ parallel worktrees on a 10-core machine),
		// React module initialization and createBrowserRouter can take >15s.
		// Increased to 60s to handle worst-case load while keeping reasonable bounds.
		testTimeout: 60_000,
	},
});

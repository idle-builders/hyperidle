import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	// @lore: resolve aliases prevent walk-up to primary checkout's node_modules — dissolved packages gone; without alias, old code loads and duplicate React splits
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
		testTimeout: 60_000,
	},
});

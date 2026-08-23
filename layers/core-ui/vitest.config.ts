import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
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

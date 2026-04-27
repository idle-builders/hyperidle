import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		name: "web",
		environment: "jsdom",
		setupFiles: ["./src/test-setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
		// @lore L6: vitest resolves `@hyperidle/shared` to its source, but the
		// transitive `zod` import is hoisted only into peer workspace
		// node_modules. Inline shared so vite traverses + resolves zod from
		// shared's own dependencies.
		server: { deps: { inline: ["@hyperidle/shared"] } },
	},
});

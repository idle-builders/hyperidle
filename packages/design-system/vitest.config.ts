import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
	plugins: [react()],
	test: {
		name: "design-system",
		// Include the default `**/node_modules/**` exclusion alongside the
		// design-system-specific filters so a dependency that ships
		// `*.test.ts` files (e.g. zod) doesn't get picked up by the runner.
		// Vitest project-level `exclude` replaces the root's value rather
		// than extending it.
		exclude: ["**/node_modules/**", "**/visual-regression*", "tests/**"],
		// L15: TaskRequestMenu tests render React + use @testing-library/react
		// + user-event, so the design-system project needs a DOM env.
		environment: "jsdom",
		setupFiles: ["./vitest.setup.ts"],
		// Inline shared so its transitive `zod` import resolves under the
		// project's node resolver.
		server: { deps: { inline: ["@hyperidle/shared"] } },
	},
});

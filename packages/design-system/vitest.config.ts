import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "design-system",
		// L2 review (apply): include the default `**/node_modules/**`
		// exclusion alongside the design-system-specific filters so a
		// dependency that ships `*.test.ts` files (e.g. zod) doesn't
		// get picked up by the runner. Vitest project-level `exclude`
		// replaces the root's value rather than extending it.
		exclude: ["**/node_modules/**", "**/visual-regression*", "tests/**"],
		// @lore L6: see web/vitest.config.ts — inline shared so its transitive
		// `zod` import resolves under the project's node resolver.
		server: { deps: { inline: ["@hyperidle/shared"] } },
	},
});

import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "fabric",
		// @lore L6: see web/vitest.config.ts — inline shared so its transitive
		// `zod` import resolves under the project's node resolver.
		server: { deps: { inline: ["@hyperidle/shared"] } },
	},
});

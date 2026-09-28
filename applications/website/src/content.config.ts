import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

import { docEntryId } from "./lib/docs-loader.js";

// Keep in sync with renderedSections in astro.config.ts (the link rewriter) and DOCS_NAV (the sidebar).
const docs = defineCollection({
	schema: z.object({
		title: z.string().optional(),
	}),
	loader: glob({
		pattern: [
			"docs/product/*.md",
			"docs/guides/user/*.md",
			"docs/guides/developer/*.md",
			"docs/deployment/*.md",
		],
		base: "../../",
		generateId: ({ entry }) => docEntryId(entry),
	}),
});

export const collections = { docs };

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

import { docEntryId } from "./lib/docs-loader.js";

/**
 * The docs seam: markdown lives in the repo's docs/ tree (single source of
 * truth), never copied into this package. The glob loader's `base` points at
 * the repo root (two levels up from this package). Rendered set: the product
 * story, the user guide, the developer guide, and the deployment docs.
 * Keep in sync with renderedSections in astro.config.ts (the link rewriter)
 * and DOCS_NAV (the sidebar).
 */
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

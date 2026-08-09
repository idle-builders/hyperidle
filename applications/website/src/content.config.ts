import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

import { docEntryId } from "./lib/docs-loader.js";

/**
 * The docs seam: markdown lives in the repo's docs/ tree (single source of
 * truth), never copied into this package. The glob loader's `base` points at
 * the repo root (two levels up from this package), so the same loader
 * shape extends to docs/guides/** in the follow-up docs WP by widening the
 * pattern. This WP ingests docs/product/*.md (the product story).
 */
const docs = defineCollection({
	schema: z.object({
		title: z.string().optional(),
	}),
	loader: glob({
		pattern: "docs/product/*.md",
		base: "../../",
		generateId: ({ entry }) => docEntryId(entry),
	}),
});

export const collections = { docs };

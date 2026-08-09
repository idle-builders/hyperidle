import process from "node:process";
import { unified } from "@astrojs/markdown-remark";
import { defineConfig } from "astro/config";

import { normalizeBase } from "./src/lib/base-path.js";
import { remarkDocLinks } from "./src/lib/doc-links.js";

// Hosting-agnostic base path: set HYPERIDLE_SITE_BASE at build time
// (e.g. HYPERIDLE_SITE_BASE=/hyperidle/ npm run build). Default "/".
//
// @lore astro's emitted prerender entry (dist/.prerender/*.mjs) imports
// { parseCookie } from "cookie" (a cookie@2 API). The monorepo hoists
// cookie@0.7.2 (express@5 via the MCP SDK) to the root node_modules, so Node
// resolving from dist/.prerender/ would hit the CJS 0.7.x and crash the build.
// Declaring cookie@^2 in this package nests it at
// applications/website/node_modules, where the upward resolution finds it
// first. dep-manifest-lint credits it via JUSTIFIED_UNUSED (same shape as
// desktop's @electric-sql/pglite).
const base = normalizeBase(process.env.HYPERIDLE_SITE_BASE ?? "/");

export default defineConfig({
	base,
	markdown: {
		// Astro 7's default processor is Satteri; the unified processor from
		// @astrojs/markdown-remark is the supported way to run remark plugins
		// (here: repo-relative .md cross-link rewriting for the docs seam).
		processor: unified({
			remarkPlugins: [[remarkDocLinks, { base, section: "docs/product" }]],
		}),
	},
});

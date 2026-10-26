import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { unified } from "@astrojs/markdown-remark";
import { defineConfig } from "astro/config";

import { normalizeBase } from "./src/lib/base-path.js";
import { remarkDocLinks } from "./src/lib/doc-links.js";
import { rehypeWrapTables } from "./src/lib/wrap-tables.js";

// @lore: astro prerender — imports cookie@2 API; monorepo hoists cookie@0.7.x; must declare cookie@^2 in this package to get nested resolution
const base = normalizeBase(process.env.HYPERIDLE_SITE_BASE ?? "/");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const renderedSections = [
	"docs/product",
	"docs/guides/user",
	"docs/guides/developer",
	"docs/deployment",
];

export default defineConfig({
	base,
	markdown: {
		// Astro 7's default processor is Satteri; the unified processor from
		// @astrojs/markdown-remark is the supported way to run remark plugins
		// (here: repo-relative .md cross-link rewriting for the docs seam).
		processor: unified({
			remarkPlugins: [
				[
					remarkDocLinks,
					{
						base,
						repoRoot,
						renderedSections,
						github: { owner: "idle-builders", repo: "hyperidle", ref: "main" },
					},
				],
			],
			rehypePlugins: [rehypeWrapTables],
		}),
	},
});

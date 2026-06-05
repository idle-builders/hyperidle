import { defineConfig } from "vitepress";

// @lore: force-dark is intentional — HyperIdle is a dark-theme-first product.
// Users never need light mode in the docs. Eliminates the theme toggle.
// outDir points to repo-root dist/docs/ which is already gitignored via dist/.

export default defineConfig({
	title: "HyperIdle",
	description: "Product documentation for HyperIdle",
	appearance: "force-dark",

	outDir: "../../dist/docs",

	themeConfig: {
		sidebar: [
			{
				text: "Product Documentation",
				items: [
					{ text: "What is HyperIdle?", link: "/what-is-hyperidle" },
					{ text: "How Work Flows", link: "/how-work-flows" },
					{ text: "Human + AI Collaboration", link: "/human-ai-collaboration" },
					{ text: "How Knowledge Compounds", link: "/how-knowledge-compounds" },
				],
			},
		],

		search: {
			provider: "local",
		},

		outline: { level: [2, 3] },
	},
});

/**
 * Map a repo-relative markdown href to its site URL.
 *
 * Docs source files cross-link with `./other-page.md` (repo-relative). On
 * the site, each doc renders at `<base><section>/<id>/`, so a sibling link
 * must become `<base><section>/<id>/`. Returns null for hrefs that are not
 * plain relative `.md` references (absolute paths, external URLs, anchors,
 * subdirectory paths) — the caller leaves those untouched. Deliberately a
 * flat-directory mapping at this tier; the follow-up docs WP generalizes it
 * for nested trees.
 */
export function mapDocHref(href: string, base: string, section: string): string | null {
	const match = /^(?:\.\/)?([\w-]+)\.md$/.exec(href);
	if (!match) return null;
	const id = match[1];
	if (!id) return null;
	return `${base}${section}/${id}/`;
}

interface MarkdownLinkNode {
	type: string;
	url?: string;
	children?: MarkdownLinkNode[];
}

/**
 * Remark plugin factory: rewrites relative `.md` link hrefs in rendered docs
 * markdown via mapDocHref. Registered in astro.config.ts markdown.remarkPlugins.
 */
export function remarkDocLinks(options: {
	base: string;
	section: string;
}): (tree: MarkdownLinkNode) => void {
	const visit = (node: MarkdownLinkNode): void => {
		if (node.type === "link" && typeof node.url === "string") {
			const mapped = mapDocHref(node.url, options.base, options.section);
			if (mapped !== null) node.url = mapped;
		}
		for (const child of node.children ?? []) visit(child);
	};
	return (tree: MarkdownLinkNode): void => {
		visit(tree);
	};
}

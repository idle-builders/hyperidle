import path from "node:path";

import { docEntryId } from "./docs-loader.js";

/**
 * Link mapping for the docs seam.
 *
 * Docs source files cross-link with repo-relative markdown hrefs
 * (`./other.md`, `../../deployment/laptop.md`). The site renders a subset of
 * the repo's docs/ tree (the "rendered sections"); every other target must
 * still resolve. Two destinations:
 *
 * 1. hrefs that resolve INSIDE the rendered sections → the site route,
 *    `<base>docs/<id>/` (same contract as docEntryId: index.md collapses
 *    onto its directory URL).
 * 2. hrefs that resolve OUTSIDE them (other docs/ subtrees, repo-root files
 *    like CLAUDE.md, tools/**) → the file's GitHub URL on main, so nothing
 *    404s on the static site.
 *
 * Returns null for hrefs the mapper must leave untouched (external URLs,
 * site-absolute paths, pure anchors, hrefs escaping the repo root).
 */

export interface GitHubTarget {
	owner: string;
	repo: string;
	ref: string;
}

export interface DocLinkOptions {
	base: string;
	/** Repo-relative directory prefixes rendered by the site, e.g. "docs/product". */
	renderedSections: readonly string[];
	github: GitHubTarget;
}

/**
 * Resolve a relative href against the directory of the doc that contains it.
 * Both arguments are repo-root-relative ("docs/guides/user/agents.md").
 * Returns null when the href climbs above the repo root.
 */
export function resolveRepoPath(sourceDoc: string, hrefPath: string): string | null {
	const segments: string[] = [];
	for (const part of [...path.posix.dirname(sourceDoc).split("/"), ...hrefPath.split("/")]) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			if (segments.length === 0) return null;
			segments.pop();
			continue;
		}
		segments.push(part);
	}
	return segments.join("/");
}

/**
 * GitHub URL for a repo-root-relative path: blob for files, tree for
 * directories (trailing slash, or a final segment without an extension).
 */
export function githubDocUrl(github: GitHubTarget, repoPath: string): string {
	const isDirectory =
		repoPath.endsWith("/") || !path.posix.basename(repoPath).includes(".");
	const kind = isDirectory ? "tree" : "blob";
	const cleaned = repoPath.replace(/\/+$/, "");
	return `https://github.com/${github.owner}/${github.repo}/${kind}/${github.ref}/${cleaned}`;
}

function inRenderedSet(repoPath: string, renderedSections: readonly string[]): boolean {
	const dir = repoPath.replace(/\/+$/, "");
	return renderedSections.some((s) => dir === s || dir.startsWith(`${s}/`));
}

export function mapDocHref(
	href: string,
	sourceDoc: string,
	options: DocLinkOptions,
): string | null {
	// External (any scheme, protocol-relative) or site-absolute: untouched.
	if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("/")) {
		return null;
	}
	// Pure in-page anchor: untouched.
	if (href.startsWith("#")) return null;

	const hashIndex = href.indexOf("#");
	const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
	const fragment = hashIndex === -1 ? "" : href.slice(hashIndex);
	if (rawPath === "") return null;

	const resolved = resolveRepoPath(sourceDoc, rawPath);
	if (resolved === null) return null;

	if (!inRenderedSet(resolved, options.renderedSections)) {
		return `${githubDocUrl(options.github, resolved)}${fragment}`;
	}

	const isMarkdown = resolved.endsWith(".md");
	const id = isMarkdown
		? docEntryId(resolved)
		: resolved.replace(/^docs\/?/, "").replace(/\/+$/, "");
	return `${options.base}docs/${id}/${fragment}`;
}

interface MarkdownLinkNode {
	type: string;
	url?: string;
	children?: MarkdownLinkNode[];
}

/**
 * Remark plugin factory: rewrites relative markdown link hrefs in rendered
 * docs via mapDocHref. Registered in astro.config.ts markdown.remarkPlugins.
 *
 * The current file comes from the vfile (astro sets it from the entry's
 * fileURL — see @astrojs/markdown-remark's render()); repoRoot turns it back
 * into the repo-relative path the mapper works in.
 */
export function remarkDocLinks(
	options: DocLinkOptions & { repoRoot: string },
): (tree: MarkdownLinkNode, file: { path?: string }) => void {
	return (tree, file) => {
		if (!file.path) {
			throw new Error("remarkDocLinks: markdown vfile has no path — cannot map doc links");
		}
		const sourceDoc = path.relative(options.repoRoot, file.path);
		const visit = (node: MarkdownLinkNode): void => {
			if (node.type === "link" && typeof node.url === "string") {
				const mapped = mapDocHref(node.url, sourceDoc, options);
				if (mapped !== null) node.url = mapped;
			}
			for (const child of node.children ?? []) visit(child);
		};
		visit(tree);
	};
}

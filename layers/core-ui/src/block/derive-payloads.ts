/**
 * derivePayloads() — markdown text → BlockPayload[] for message rendering.
 *
 * Like deriveBlocks() but without Block identity (no id, source, anchor, order).
 * Used by CommentRow to render message text through the block payload pipeline.
 *
 * Key difference from deriveBlocks:
 *   - Image payloads are downgraded: if alt text is present → paragraph with
 *     alt-text inline node; if alt text is empty → no payload emitted.
 *   - No Block identity fields are produced (pure payload extraction).
 *
 * Image payloads are always downgraded to alt-text paragraphs (or dropped if
 * alt is empty) — defense against tracking pixels and hostile image URLs.
 */

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { BlockPayload, InlineNode, ListItem } from "./types.js";
import { LINK_URL_SAFE_SCHEMES, MAX_BODY_BYTES } from "./types.js";

const enc = new TextEncoder();

interface MdNode {
	type: string;
	value?: string;
	children?: MdNode[];
	depth?: number;
	ordered?: boolean;
	start?: number | null;
	lang?: string | null;
	url?: string;
	title?: string | null;
	alt?: string;
	align?: ("left" | "right" | "center" | null)[];
	position?: { start: { offset?: number }; end: { offset?: number } };
}

interface MdRoot {
	type: "root";
	children: MdNode[];
}

/** Returns true if a URL has an allowed scheme OR is relative/fragment. */
function isUrlInAllowlist(
	url: string,
	allowlist: readonly string[],
	allowFragment = false,
): boolean {
	if (!url) return true; // empty → relative
	if (allowFragment && url.startsWith("#")) return true;
	// Relative URLs (no scheme): allow.
	if (/^\/(?!\/)/.test(url)) return true;
	if (/^\.{0,2}\//.test(url)) return true;
	if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true; // no scheme
	const lower = url.toLowerCase();
	for (const safe of allowlist) {
		if (lower.startsWith(safe)) return true;
	}
	return false;
}

function isLinkScheme(url: string): boolean {
	return isUrlInAllowlist(url, LINK_URL_SAFE_SCHEMES, true);
}

function inlineFromMd(nodes: MdNode[] | undefined): InlineNode[] {
	if (!nodes) return [];
	const out: InlineNode[] = [];
	for (const n of nodes) {
		switch (n.type) {
			case "text":
				out.push({ type: "text", value: n.value ?? "" });
				break;
			case "strong":
				out.push({ type: "strong", children: inlineFromMd(n.children) });
				break;
			case "emphasis":
				out.push({ type: "emphasis", children: inlineFromMd(n.children) });
				break;
			case "inlineCode":
				out.push({ type: "inlineCode", value: n.value ?? "" });
				break;
			case "link": {
				const href = n.url ?? "";
				if (!isLinkScheme(href)) {
					// Hostile scheme — degrade to plain text from children.
					out.push(...inlineFromMd(n.children));
				} else {
					out.push({
						type: "link",
						href,
						children: inlineFromMd(n.children),
					});
				}
				break;
			}
			case "break":
				out.push({ type: "break" });
				break;
			case "delete":
				// Render strikethrough as flat text.
				out.push(...inlineFromMd(n.children));
				break;
			case "linkReference":
			case "imageReference":
			case "image":
				// Images inside paragraphs → alt text fallback.
				out.push({ type: "text", value: n.alt ?? "" });
				break;
			default:
				if (n.children) out.push(...inlineFromMd(n.children));
				else if (n.value) out.push({ type: "text", value: n.value });
		}
	}
	return out;
}

function listItems(node: MdNode): ListItem[] {
	if (!node.children) return [];
	return node.children.map((li) => {
		const childPayloads: BlockPayload[] = [];
		for (const c of li.children ?? []) {
			const p = mdNodeToPayload(c);
			if (p) childPayloads.push(p);
		}
		return { children: childPayloads };
	});
}

function tableFromMd(node: MdNode): {
	header: InlineNode[][];
	rows: InlineNode[][][];
	align: ("left" | "right" | "center" | null)[];
} {
	const rowsAll = node.children ?? [];
	const align = (node.align ?? []).map((a) => a ?? null);
	const headerRow = rowsAll[0];
	const header: InlineNode[][] = (headerRow?.children ?? []).map((cell) =>
		inlineFromMd(cell.children),
	);
	const rows: InlineNode[][][] = rowsAll
		.slice(1)
		.map((row) => (row.children ?? []).map((cell) => inlineFromMd(cell.children)));
	return { header, rows, align };
}

/**
 * Convert a single mdast top-level node to a BlockPayload.
 *
 * Returns null for nodes that should be dropped (e.g. images with empty alt).
 * Returns "image-downgrade" signal as a paragraph for images with alt text.
 */
function mdNodeToPayload(node: MdNode): BlockPayload | null {
	switch (node.type) {
		case "heading": {
			const level = (node.depth ?? 1) as 1 | 2 | 3 | 4 | 5 | 6;
			const inline = inlineFromMd(node.children);
			const text = inlineToText(inline);
			return { kind: "heading", level, text, inline };
		}
		case "paragraph": {
			// Solely an image? Downgrade: if alt text present → paragraph with alt
			// text; if alt text empty → drop (return null).
			const kids = node.children ?? [];
			const firstKid = kids[0];
			if (kids.length === 1 && firstKid !== undefined && firstKid.type === "image") {
				const img = firstKid;
				const alt = img.alt ?? "";
				if (!alt) {
					// Empty alt → drop the payload entirely.
					return null;
				}
				// Alt text present → paragraph with a text inline node.
				return {
					kind: "paragraph",
					inline: [{ type: "text", value: alt }],
				};
			}
			return { kind: "paragraph", inline: inlineFromMd(kids) };
		}
		case "list":
			return {
				kind: "list",
				ordered: Boolean(node.ordered),
				start: typeof node.start === "number" ? node.start : null,
				items: listItems(node),
			};
		case "blockquote": {
			const children: BlockPayload[] = [];
			for (const c of node.children ?? []) {
				const p = mdNodeToPayload(c);
				if (p) children.push(p);
			}
			return { kind: "quote", children };
		}
		case "code":
			return {
				kind: "code",
				lang: (node.lang ?? null) as string | null,
				text: node.value ?? "",
			};
		case "table": {
			const t = tableFromMd(node);
			return { kind: "table", ...t };
		}
		case "thematicBreak":
			return { kind: "divider" };
		case "image": {
			// Top-level image (not wrapped in paragraph): downgrade same as above.
			const alt = node.alt ?? "";
			if (!alt) return null;
			return {
				kind: "paragraph",
				inline: [{ type: "text", value: alt }],
			};
		}
		case "html":
			return { kind: "html", raw: node.value ?? "" };
		default:
			return {
				kind: "unknown",
				raw: node.value ?? `<${node.type}>`,
				reason: "parser-unrecognised",
			};
	}
}

function inlineToText(nodes: InlineNode[]): string {
	let s = "";
	for (const n of nodes) {
		if (n.type === "text") s += n.value;
		else if (n.type === "inlineCode") s += n.value;
		else if (n.type === "strong" || n.type === "emphasis" || n.type === "link")
			s += inlineToText(n.children);
		else if (n.type === "break") s += " ";
	}
	return s;
}

/**
 * Parse markdown text into BlockPayload[].
 *
 * - Returns [] for empty / whitespace-only / oversize inputs.
 * - Image payloads are always downgraded: alt text → paragraph; empty alt → dropped.
 * - No Block identity fields (id, source, anchor, order) are produced.
 */
export function derivePayloads(text: string): BlockPayload[] {
	if (text.length === 0) return [];
	if (text.trim().length === 0) return [];
	if (enc.encode(text).byteLength > MAX_BODY_BYTES) return [];

	const processor = unified().use(remarkParse).use(remarkGfm);

	let tree: MdRoot;
	try {
		tree = processor.parse(text) as MdRoot;
	} catch {
		// Defensive: never throw.
		return [];
	}

	const payloads: BlockPayload[] = [];
	for (const node of tree.children ?? []) {
		const payload = mdNodeToPayload(node);
		if (payload !== null) {
			payloads.push(payload);
		}
	}
	return payloads;
}

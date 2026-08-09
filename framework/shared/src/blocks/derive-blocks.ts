/**
 * deriveBlocks() — pure markdown → Block[] derivation.
 *
 * Concept: docs/blocks/.
 * Plan: plans/L2/architecture.md § 4.2.
 *
 * Pipeline: oversize byte-cap check → unified().use(remarkParse).use(remarkGfm)
 * .parse(body) → walk top-level mdast nodes → map to BlockKind →
 * normalise payload → URL allowlist gates (image + link) →
 * compute outlinePath via running heading-stack → blockId() →
 * assemble Block[].
 *
 * Pure: no I/O, no clock, no DB.
 */

import { blake2s } from "@noble/hashes/blake2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { blockId } from "./block-id.js";
import { normalisedPayload, ROOT_OUTLINE_SENTINEL, slug } from "./normalise.js";
import {
	type Block,
	type BlockDerivationResult,
	type BlockHostKind,
	type BlockId,
	type BlockPayload,
	IMAGE_URL_SAFE_SCHEMES,
	type InlineNode,
	LINK_URL_SAFE_SCHEMES,
	type ListItem,
	MAX_BODY_BYTES,
} from "./types.js";

const enc = new TextEncoder();

/**
 * Hash function for Block.source.bodyDigest. Algorithm: blake2s_256.
 * The field name reflects the algorithm — not "sha".
 */
const bodyDigestHex = (s: string): string => {
	const out = blake2s(enc.encode(s), { dkLen: 32 });
	return bytesToHex(out);
};

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

function nodeRange(n: MdNode, fallbackEnd: number): { start: number; end: number } {
	const start = n.position?.start?.offset ?? 0;
	const end = n.position?.end?.offset ?? fallbackEnd;
	return { start, end };
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

function isImageScheme(url: string): boolean {
	return isUrlInAllowlist(url, IMAGE_URL_SAFE_SCHEMES, false);
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
					// Hostile scheme (javascript:, vbscript:, file:, data: text/html, …)
					// → degrade to plain text rendered from the link's children, dropping
					// the href entirely. This is defense-in-depth against agent-authored
					// markdown that could otherwise render `<a href="javascript:…">`.
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
				// Render strikethrough as flat text — no dedicated mark in our
				// inline shape (closed). Keep child text for round-trip.
				out.push(...inlineFromMd(n.children));
				break;
			case "linkReference":
			case "imageReference":
			case "image":
				// images inside paragraphs become text fallback (alt) for inline;
				// a paragraph that is solely an image is hoisted by the caller.
				out.push({ type: "text", value: n.alt ?? "" });
				break;
			default:
				if (n.children) out.push(...inlineFromMd(n.children));
				else if (n.value) out.push({ type: "text", value: n.value });
		}
	}
	return out;
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

/** Convert a single mdast top-level node to a BlockPayload (no id, no source). */
function mdNodeToPayload(node: MdNode): BlockPayload | null {
	switch (node.type) {
		case "heading": {
			const level = (node.depth ?? 1) as 1 | 2 | 3 | 4 | 5 | 6;
			const inline = inlineFromMd(node.children);
			const text = inlineToText(inline);
			return { kind: "heading", level, text, inline };
		}
		case "paragraph": {
			// Solely an image? hoist to image kind.
			const kids = node.children ?? [];
			const firstKid = kids[0];
			if (kids.length === 1 && firstKid !== undefined && firstKid.type === "image") {
				const img = firstKid;
				if (!isImageScheme(img.url ?? "")) {
					// Will be downgraded to unknown by caller via raw source.
					return {
						kind: "unknown",
						raw: `![${img.alt ?? ""}](${img.url ?? ""})`,
						reason: "parser-unrecognised",
					};
				}
				return {
					kind: "image",
					alt: img.alt ?? "",
					url: img.url ?? "",
					title: img.title ?? null,
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
		case "image":
			if (!isImageScheme(node.url ?? "")) {
				return {
					kind: "unknown",
					raw: `![${node.alt ?? ""}](${node.url ?? ""})`,
					reason: "parser-unrecognised",
				};
			}
			return {
				kind: "image",
				alt: node.alt ?? "",
				url: node.url ?? "",
				title: node.title ?? null,
			};
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

interface HeadingFrame {
	depth: number;
	slug: string;
	intraOrdinal: number;
}

function computeOutlinePath(stack: HeadingFrame[]): string {
	if (stack.length === 0) return ROOT_OUTLINE_SENTINEL;
	return stack.map((h) => `${h.slug}@${h.intraOrdinal}`).join("/");
}

interface MdRoot {
	type: "root";
	children: MdNode[];
}

export function deriveBlocks(
	body: string,
	host: { kind: BlockHostKind; id: string },
): BlockDerivationResult {
	// Oversize gate (AC-51). Use UTF-8 byte length, not UTF-16 code units —
	// adversarial Unicode (CJK, emoji) would bypass a `.length` check.
	if (enc.encode(body).byteLength > MAX_BODY_BYTES) {
		const range = { start: 0, end: body.length };
		const bodyDigest = bodyDigestHex(body.slice(0, 4096));
		const payload: BlockPayload = {
			kind: "unknown",
			raw: body.slice(0, 500),
			reason: "body-too-large",
		};
		const id = blockId({
			kind: "unknown",
			outlinePath: ROOT_OUTLINE_SENTINEL,
			normalisedPayload: normalisedPayload(payload),
		});
		return {
			blocks: [
				{
					id,
					kind: "unknown",
					source: { hostKind: host.kind, hostId: host.id, bodyDigest, range },
					payload,
					anchor: { blockId: id },
					order: 0,
				},
			],
		};
	}

	if (body.length === 0) {
		return { blocks: [] };
	}

	// Whitespace-only fast path.
	if (body.trim().length === 0) {
		return { blocks: [] };
	}

	const processor = unified().use(remarkParse).use(remarkGfm);

	let tree: MdRoot;
	try {
		tree = processor.parse(body) as MdRoot;
	} catch {
		// Defensive: derive should never throw. Emit one unknown block for the body.
		const range = { start: 0, end: body.length };
		const bodyDigest = bodyDigestHex(body);
		const payload: BlockPayload = {
			kind: "unknown",
			raw: body,
			reason: "parser-unrecognised",
		};
		const id = blockId({
			kind: "unknown",
			outlinePath: ROOT_OUTLINE_SENTINEL,
			normalisedPayload: normalisedPayload(payload),
		});
		return {
			blocks: [
				{
					id,
					kind: "unknown",
					source: { hostKind: host.kind, hostId: host.id, bodyDigest, range },
					payload,
					anchor: { blockId: id },
					order: 0,
				},
			],
		};
	}

	const bodyDigest = bodyDigestHex(body);
	const blocks: Block[] = [];

	const headingStack: HeadingFrame[] = [];
	// intra-level counters keyed by parent-depth
	const intraCounters: Map<number, number> = new Map();

	const topLevel = tree.children ?? [];

	for (const node of topLevel) {
		// Compute outline-path BEFORE updating heading stack, since a heading's
		// own ancestors are headings ABOVE it (concept § 8.4: a heading is never
		// in its own ancestor list).
		if (node.type === "heading") {
			const depth = node.depth ?? 1;
			// Pop stack to depth-1 (any heading at >= this depth is no longer an ancestor).
			// headingStack.length > 0 guarantees peek is defined; the `?? 0` satisfies noUncheckedIndexedAccess.
			while (
				headingStack.length > 0 &&
				(headingStack[headingStack.length - 1]?.depth ?? 0) >= depth
			) {
				const popped = headingStack.pop();
				// Reset intra-counters for any deeper level (out of scope)
				if (popped) {
					for (const key of [...intraCounters.keys()]) {
						if (key > popped.depth) intraCounters.delete(key);
					}
				}
			}
		}

		const payload = mdNodeToPayload(node);
		if (!payload) continue;

		const range = nodeRange(node, body.length);
		const outlinePath = computeOutlinePath(headingStack);
		const np = normalisedPayload(payload);
		const id = blockId({ kind: payload.kind, outlinePath, normalisedPayload: np });

		blocks.push({
			id,
			kind: payload.kind,
			source: { hostKind: host.kind, hostId: host.id, bodyDigest, range },
			payload,
			anchor: { blockId: id },
			order: blocks.length,
		});

		// After emitting the heading block, push it on the stack with its
		// intra-level ordinal (1-indexed among same-depth siblings under same parent).
		if (node.type === "heading" && payload.kind === "heading") {
			const depth = payload.level;
			const counter = (intraCounters.get(depth) ?? 0) + 1;
			intraCounters.set(depth, counter);
			headingStack.push({
				depth,
				slug: slug(payload.text),
				intraOrdinal: counter,
			});
		}
	}

	// Dev-mode collision check (AC-52). In production this is suppressed for cost;
	// the deterministic id derivation makes runtime collisions vanishingly rare,
	// and the snapshot test (golden-ids.test.ts) is the canonical guard.
	if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
		assertNoCollisions(blocks, defaultLogger);
	}

	return { blocks };
}

interface CollisionLogger {
	critical: (msg: string) => void;
}

const defaultLogger: CollisionLogger = {
	critical: (_msg: string): void => {
		// Intentionally no-op default — wire a real logger in callers.
	},
};

/**
 * AC-52: collision detector. Wired in dev mode by `deriveBlocks`; exported
 * for direct invocation in tests.
 *
 * @param blocks blocks to check (need only carry an `id` field)
 * @param logger an injection point — caller supplies a `critical` channel
 *   (e.g. observability adapter). Defaults to a no-op so callers may invoke
 *   without configuration.
 */
export function assertNoCollisions(
	blocks: { id: BlockId | string }[],
	logger: CollisionLogger = defaultLogger,
): void {
	const seen = new Map<string, number>();
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		if (block === undefined) continue;
		const id = block.id;
		const prev = seen.get(id);
		if (prev !== undefined) {
			logger.critical(`BlockId collision detected: ids[${prev}] and ids[${i}] both = ${id}`);
		} else {
			seen.set(id, i);
		}
	}
}

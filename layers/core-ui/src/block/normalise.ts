/**
 * Per-kind payload normalisation, and the GFM heading slug it is built on.
 * The output of normalisedPayload(payload) is fed verbatim into the BlockId
 * hash. The sole source of normalisation logic.
 */

import GithubSlugger from "github-slugger";
import type { BlockPayload, InlineNode } from "./types.js";

// ── the GFM heading slug, pinned to github-slugger ───────────────────────────
//
// Returns "<empty>" sentinel for empty / all-stripped / all-emoji input. The angle brackets in the
// sentinel are stripped by the slugger if used as heading text, so a literal "<root>" / "<empty>"
// heading cannot collide with the sentinel value.

export const EMPTY_SLUG_SENTINEL = "<empty>";
export const ROOT_OUTLINE_SENTINEL = "<root>";

/**
 * Strip emoji code points (broad ranges covering common emoji blocks).
 * Emoji slugs would otherwise survive github-slugger as empty input → "".
 */
const EMOJI_RE =
	// biome-ignore lint/suspicious/noMisleadingCharacterClass: emoji ranges include surrogate pairs intentionally.
	/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

// @lore: github-slugger — per-call instance required; module-level singleton unsafe under concurrent calls (Promise.all clobbers internal cache)
export function slug(text: string): string {
	// Strip emoji first so all-emoji headings don't accidentally pass through.
	const stripped = text.replace(EMOJI_RE, "").trim();
	const slugger = new GithubSlugger();
	let out = slugger.slug(stripped);
	// Collapse runs of hyphens (github-slugger preserves `---` verbatim).
	out = out.replace(/-+/g, "-").replace(/^-|-$/g, "");
	if (!out) return EMPTY_SLUG_SENTINEL;
	return out;
}

// ── payload normalisation ────────────────────────────────────────────────────

const NFC = (s: string): string => s.normalize("NFC");
const lf = (s: string): string => s.replace(/\r\n/g, "\n");
const collapseWs = (s: string): string => s.replace(/\s+/g, " ");

/** Inline tree → flat string with mark sentinels so bold-vs-plain edits perturb the hash. */
function flattenInline(nodes: InlineNode[]): string {
	const out: string[] = [];
	for (const n of nodes) {
		switch (n.type) {
			case "text":
				out.push(NFC(n.value));
				break;
			case "strong":
				out.push("STRONG", flattenInline(n.children), "/STRONG");
				break;
			case "emphasis":
				out.push("EM", flattenInline(n.children), "/EM");
				break;
			case "inlineCode":
				out.push("CODE", NFC(n.value), "/CODE");
				break;
			case "link":
				out.push("LINK_HREF", NFC(n.href), "|", flattenInline(n.children), "/LINK");
				break;
			case "break":
				out.push(" ");
				break;
		}
	}
	return out.join("");
}

export function normalisedPayload(payload: BlockPayload): string {
	switch (payload.kind) {
		case "paragraph":
			return collapseWs(flattenInline(payload.inline)).trim();
		case "heading":
			// slug + NFC text: slug stabilises casing/punct edits; raw NFC text
			// disambiguates emoji-only / punct-only headings (both slugged to
			// "<empty>") so they still produce different ids.
			return `${payload.level}${slug(payload.text)}|${NFC(payload.text)}`;
		case "list": {
			const flat = payload.items
				.map((it) => it.children.map((c) => normalisedPayload(c)).join(""))
				.join("");
			return `${payload.ordered ? "ol" : "ul"}${flat}`;
		}
		case "code":
			return `${payload.lang ?? ""}\n${lf(payload.text)}`;
		case "table": {
			const header = payload.header.map((cell) => flattenInline(cell)).join("");
			const rows = payload.rows
				.map((row) => row.map((cell) => flattenInline(cell)).join(""))
				.join("");
			return `${header}${rows}`;
		}
		case "quote":
			return payload.children.map((c) => normalisedPayload(c)).join("");
		case "divider":
			return "";
		case "image":
			return `${NFC(payload.alt)}${payload.url}`;
		case "html":
			// CRLF→LF normalisation for code/unknown/html.
			// We do NOT collapse inter-tag whitespace — that would silently change
			// the hash of meaningfully different HTML (e.g. `<pre>` content where
			// whitespace is significant).
			return lf(payload.raw);
		case "unknown":
			return lf(payload.raw);
	}
}

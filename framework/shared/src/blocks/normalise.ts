/**
 * Per-kind payload normalisation. Concept § 8.4.
 * The output of normalisedPayload(payload) is fed verbatim into the BlockId
 * hash. The sole source of normalisation logic.
 */

import { slug } from "./slug.js";
import type { BlockPayload, InlineNode } from "./types.js";

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
			// Concept § 8.4 mandates CRLF→LF normalisation for code/unknown/html.
			// We do NOT collapse inter-tag whitespace — that would silently change
			// the hash of meaningfully different HTML (e.g. `<pre>` content where
			// whitespace is significant).
			return lf(payload.raw);
		case "unknown":
			return lf(payload.raw);
	}
}

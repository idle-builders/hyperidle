/**
 * T4 — block-excerpt utility.
 *
 * Extracts a short text label from a BlockPayload for use in CoC chips
 * and aria-labels.
 *
 * @lore T4: The excerpt is purely for display — it is never persisted or
 * sent over the wire. The label is capped at 60 characters to keep chips
 * compact in the overlay composer area.
 */

import type { BlockPayload, InlineNode } from "@hyperidle/shared";

const EXCERPT_MAX_LENGTH = 60;

/**
 * Recursively extracts plain text from an array of InlineNodes.
 * Stops early once the accumulated text exceeds EXCERPT_MAX_LENGTH.
 */
function extractText(nodes: InlineNode[], acc: string[]): void {
	for (const node of nodes) {
		if (node.type === "text") {
			acc.push(node.value);
		} else if (node.type === "strong" || node.type === "emphasis") {
			extractText(node.children, acc);
		} else if (node.type === "inlineCode") {
			acc.push(node.value);
		} else if (node.type === "link") {
			extractText(node.children, acc);
		} else if (node.type === "break") {
			acc.push(" ");
		}
		if (acc.join("").length >= EXCERPT_MAX_LENGTH) break;
	}
}

/**
 * Extracts a short text label from a BlockPayload.
 * Returns a string of at most EXCERPT_MAX_LENGTH characters.
 * Falls back to the block kind name if no readable text is found.
 */
export function blockExcerptFromPayload(payload: BlockPayload): string {
	const acc: string[] = [];

	switch (payload.kind) {
		case "heading":
			acc.push(payload.text);
			break;
		case "paragraph":
			extractText(payload.inline, acc);
			break;
		case "code":
			acc.push(payload.text);
			break;
		case "quote":
			for (const child of payload.children) {
				const childExcerpt = blockExcerptFromPayload(child);
				if (childExcerpt) acc.push(childExcerpt);
				if (acc.join("").length >= EXCERPT_MAX_LENGTH) break;
			}
			break;
		case "list":
			for (const item of payload.items) {
				for (const child of item.children) {
					const childExcerpt = blockExcerptFromPayload(child);
					if (childExcerpt) acc.push(childExcerpt);
					if (acc.join("").length >= EXCERPT_MAX_LENGTH) break;
				}
				if (acc.join("").length >= EXCERPT_MAX_LENGTH) break;
			}
			break;
		case "table":
			// Use first header cell text
			if (payload.header.length > 0) {
				extractText(payload.header[0] ?? [], acc);
			}
			break;
		case "image":
			acc.push(payload.alt || payload.title || "image");
			break;
		case "divider":
			acc.push("---");
			break;
		case "html":
		case "unknown":
			// No useful text from html/unknown blocks
			break;
	}

	const raw = acc.join("").trim();
	if (!raw) return payload.kind;
	return raw.slice(0, EXCERPT_MAX_LENGTH);
}

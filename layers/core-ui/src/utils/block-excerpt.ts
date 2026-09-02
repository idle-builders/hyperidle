/**
 * T4 — block-excerpt utility.
 *
 * Extracts a short text label from a BlockPayload for use in chips
 * and aria-labels. Also provides blockTextFromPayload for creating
 * knowledge item bodies from block content.
 *
 * @lore T4: The excerpt is purely for display — it is never persisted or
 * sent over the wire. The label is capped at 60 characters to keep chips
 * compact in the overlay composer area.
 */

import type { BlockPayload, InlineNode } from "../block/types.js";

const EXCERPT_MAX_LENGTH = 60;

/**
 * Recursively extracts plain text from an array of InlineNodes.
 * @param limit - optional max length; stops early when reached.
 */
function extractText(nodes: InlineNode[], acc: string[], limit?: number): void {
	for (const node of nodes) {
		if (node.type === "text") {
			acc.push(node.value);
		} else if (node.type === "strong" || node.type === "emphasis") {
			extractText(node.children, acc, limit);
		} else if (node.type === "inlineCode") {
			acc.push(node.value);
		} else if (node.type === "link") {
			extractText(node.children, acc, limit);
		} else if (node.type === "break") {
			acc.push(" ");
		}
		if (limit !== undefined && acc.join("").length >= limit) break;
	}
}

/**
 * Collect all plain text from a BlockPayload into acc, without truncation.
 */
function collectText(payload: BlockPayload, acc: string[]): void {
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
				collectText(child, acc);
			}
			break;
		case "list":
			for (const item of payload.items) {
				for (const child of item.children) {
					collectText(child, acc);
				}
			}
			break;
		case "table":
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
			break;
	}
}

/**
 * Extracts a short text label from a BlockPayload.
 * Returns a string of at most EXCERPT_MAX_LENGTH characters.
 * Falls back to the block kind name if no readable text is found.
 */
export function blockExcerptFromPayload(payload: BlockPayload): string {
	const acc: string[] = [];
	collectText(payload, acc);
	// enforce limit in excerpt variant
	const raw = acc.join("").trim();
	if (!raw) return payload.kind;
	return raw.slice(0, EXCERPT_MAX_LENGTH);
}

/**
 * Extracts the full plain-text content of a block for use as a knowledge
 * item body. No length cap.
 */
export function blockTextFromPayload(payload: BlockPayload): string {
	const acc: string[] = [];
	collectText(payload, acc);
	return acc.join("").trim();
}

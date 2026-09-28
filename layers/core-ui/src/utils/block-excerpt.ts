// @lore: excerpt display-only — never persisted or sent over the wire; capped at 60 chars for chip compactness

import type { BlockPayload, InlineNode } from "../block/types.js";

const EXCERPT_MAX_LENGTH = 60;

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

export function blockExcerptFromPayload(payload: BlockPayload): string {
	const acc: string[] = [];
	collectText(payload, acc);
	const raw = acc.join("").trim();
	if (!raw) return payload.kind;
	return raw.slice(0, EXCERPT_MAX_LENGTH);
}

export function blockTextFromPayload(payload: BlockPayload): string {
	const acc: string[] = [];
	collectText(payload, acc);
	return acc.join("").trim();
}

import type { KnowledgeItem } from "@hyperidle/db";
import type { KnowledgeItemWithFabric } from "./knowledge-repository.js";

/** Approximate token count via whitespace split. */
export function countTokens(text: string): number {
	if (!text || text.trim().length === 0) {
		return 0;
	}
	return text.split(/\s+/).length;
}

/** Count tokens for a knowledge item (title + body). */
export function countItemTokens(item: KnowledgeItem): number {
	return countTokens(item.title) + countTokens(item.body);
}

export interface ScoredItem {
	item: KnowledgeItemWithFabric;
	score: number;
}

/**
 * Enforce a token budget on scored items using greedy fill.
 * L4 (factory) items are always included first as non-negotiable context.
 * Returns items sorted by score descending, within budget.
 *
 * @lore O2: layer moved to knowledgeAppProjection; items without a fabric row
 * have layer=undefined/null and are treated as non-L4 (not always included).
 */
export function enforceBudget(
	scoredItems: ScoredItem[],
	maxTokens: number,
): KnowledgeItemWithFabric[] {
	// Separate L4 items (non-negotiable) from the rest
	const l4Items: ScoredItem[] = [];
	const otherItems: ScoredItem[] = [];

	for (const si of scoredItems) {
		// @lore O2: layer is optional on KnowledgeItemWithFabric
		if ((si.item as KnowledgeItemWithFabric).layer === "L4") {
			l4Items.push(si);
		} else {
			otherItems.push(si);
		}
	}

	// Sort both groups by score descending
	l4Items.sort((a, b) => b.score - a.score);
	otherItems.sort((a, b) => b.score - a.score);

	const result: KnowledgeItemWithFabric[] = [];
	let usedTokens = 0;

	// Include all L4 items first (non-negotiable)
	for (const si of l4Items) {
		const tokens = countItemTokens(si.item);
		usedTokens += tokens;
		result.push(si.item);
	}

	// Greedily fill remaining budget with highest-scored items
	for (const si of otherItems) {
		const tokens = countItemTokens(si.item);
		if (usedTokens + tokens <= maxTokens) {
			usedTokens += tokens;
			result.push(si.item);
		}
	}

	return result;
}

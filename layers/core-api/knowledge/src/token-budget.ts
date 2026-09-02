import type { KnowledgeItem } from "@hyperidle/db";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";

/** Approximate token count via whitespace split. */
function countTokens(text: string): number {
	if (!text || text.trim().length === 0) {
		return 0;
	}
	return text.split(/\s+/).length;
}

/** Count tokens for a knowledge item (title + body). */
function countItemTokens(item: KnowledgeItem): number {
	return countTokens(item.title) + countTokens(item.body);
}

interface ScoredItem {
	item: KnowledgeItemWithProjection;
	score: number;
}

/**
 * Enforce a token budget on scored items using greedy fill.
 * Factory-scoped items are always included first as non-negotiable context.
 * Returns items sorted by score descending, within budget.
 *
 * @lore nested-knowledge-items D1: `layer==='L4'` (factory-wide, the widest
 * layer) is replaced by `scopeKind==='factory'` — the same "everyone always
 * gets this" rule, now stated directly on the field that carries it.
 */
function enforceBudget(
	scoredItems: ScoredItem[],
	maxTokens: number,
): KnowledgeItemWithProjection[] {
	// Separate factory-scoped items (non-negotiable) from the rest
	const factoryItems: ScoredItem[] = [];
	const otherItems: ScoredItem[] = [];

	for (const si of scoredItems) {
		if (si.item.scopeKind === "factory") {
			factoryItems.push(si);
		} else {
			otherItems.push(si);
		}
	}

	// Sort both groups by score descending
	factoryItems.sort((a, b) => b.score - a.score);
	otherItems.sort((a, b) => b.score - a.score);

	const result: KnowledgeItemWithProjection[] = [];
	let usedTokens = 0;

	// Include all factory-scoped items first (non-negotiable)
	for (const si of factoryItems) {
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

export type { ScoredItem };
export { countTokens, enforceBudget };

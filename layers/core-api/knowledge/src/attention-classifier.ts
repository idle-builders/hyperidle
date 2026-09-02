import type { KnowledgeItem } from "@hyperidle/db";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";

/**
 * Topics that imply human judgment / taste. Hard-coded here as an opinionated
 * default — promoting to `factory_settings` is a future story.
 *
 * @lore G2 classifier: brand/voice/strategy topics always mark an item as
 * taste-sensitive regardless of `kind`. AC2 binding: brand-voice items must
 * score higher than technical details at equal signals.
 */
const TASTE_TOPICS: ReadonlySet<string> = new Set([
	"brand",
	"voice",
	"tone",
	"positioning",
	"aesthetics",
	"copy",
	"customer-taste",
	"strategy",
]);

/**
 * Returns true when a knowledge item is "taste-sensitive" — i.e. it concerns
 * human voice, brand, or aesthetics and should preferentially surface to the
 * founders for review. Pure classifier; no DB access.
 *
 * @lore nested-knowledge-items: `kind` and `topic` are gone (plan.md "the two
 * jobs, separated" — where an item is about is now the tree, not a flat
 * vocabulary). The `kind`-based brief/principle gate has no replacement — a
 * knowledge item's document type is no longer tagged at all. The title-word
 * gate replaces the old exact-match `topic` gate as the closest honest
 * equivalent: a taste-sensitive item's title still tends to name the thing
 * (e.g. "Brand voice guidelines").
 */
function isTasteSensitive(item: KnowledgeItem | KnowledgeItemWithProjection): boolean {
	const scopeId = (item as KnowledgeItemWithProjection).scopeId ?? null;
	const titleWords = new Set(item.title.toLowerCase().split(/\W+/).filter(Boolean));

	// 1. title gate — brand / voice / aesthetics / strategy words.
	for (const word of titleWords) {
		if (TASTE_TOPICS.has(word)) return true;
	}
	// 2. scope gate — explicit brand scope.
	if (scopeId === "brand") {
		return true;
	}
	return false;
}

export { isTasteSensitive };

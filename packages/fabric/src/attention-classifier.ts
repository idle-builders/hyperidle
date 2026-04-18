import type { KnowledgeItem } from "@hyperidle/db";

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
 */
export function isTasteSensitive(item: KnowledgeItem): boolean {
	// 1. kind gate — briefs and principles are always human-authored voice.
	if (item.kind === "brief" || item.kind === "principle") {
		return true;
	}
	// 2. topic gate — brand / voice / aesthetics / strategy buckets.
	if (item.topic && TASTE_TOPICS.has(item.topic.toLowerCase())) {
		return true;
	}
	// 3. scope gate — explicit brand scope.
	if (item.scopeId === "brand") {
		return true;
	}
	return false;
}

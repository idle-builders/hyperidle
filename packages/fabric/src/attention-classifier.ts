import type { KnowledgeItem } from "@hyperidle/db";
import type { KnowledgeItemWithFabric } from "./knowledge-repository.js";

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
 * @lore O2: accepts KnowledgeItemWithFabric since kind and scopeId moved to
 * the strategy extension table. KnowledgeItem is still accepted for backward
 * compat (type intersection).
 */
export function isTasteSensitive(item: KnowledgeItem | KnowledgeItemWithFabric): boolean {
	// @lore O2: kind and scopeId are optional on KnowledgeItemWithFabric (from fabric extension).
	const kind = (item as KnowledgeItemWithFabric).kind ?? null;
	const scopeId = (item as KnowledgeItemWithFabric).scopeId ?? null;

	// 1. kind gate — briefs and principles are always human-authored voice.
	if (kind === "brief" || kind === "principle") {
		return true;
	}
	// 2. topic gate — brand / voice / aesthetics / strategy buckets.
	if (item.topic && TASTE_TOPICS.has(item.topic.toLowerCase())) {
		return true;
	}
	// 3. scope gate — explicit brand scope.
	if (scopeId === "brand") {
		return true;
	}
	return false;
}

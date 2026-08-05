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
 * @lore O2: accepts KnowledgeItemWithProjection since kind and scopeId moved to
 * the app projection table. KnowledgeItem is still accepted for backward
 * compat (type intersection).
 */
function isTasteSensitive(item: KnowledgeItem | KnowledgeItemWithProjection): boolean {
	// @lore O2: kind and scopeId are optional on KnowledgeItemWithProjection (from app projection).
	const kind = (item as KnowledgeItemWithProjection).kind ?? null;
	const scopeId = (item as KnowledgeItemWithProjection).scopeId ?? null;

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

export { isTasteSensitive };

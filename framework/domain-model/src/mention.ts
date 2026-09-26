/**
 * Mention parsing utilities.
 *
 * One pure function: scan text for `@` mentions and resolve each directly
 * against a known pool of names — no separate "extract raw tokens, then look
 * them up" pass. Pure: no DB, no HTTP, no React. Usable by both server and
 * client.
 *
 * @lore Server-side resolution is authoritative (concept hard rule #1).
 * The client sends raw @name text; the server parses and resolves via this
 * function. Resolution scope is team-wide (concept: "users can @mention
 * agents not yet in the thread").
 *
 * @lore MAX_MENTIONS_PER_MESSAGE = 20 caps the resolved-mention count to
 * bound transaction size and prevent abuse. Mentioned in concept
 * §Cardinality: "0..N" with no upper bound, but the arch-critique flags this
 * as a risk for unbounded DB queries.
 *
 * @lore Founder-approved fix: a one-token-after-`@` extraction (the old
 * `MENTION_RE = /(?:^|(?<=\s))@(\S+)/g`) could never match a name with a
 * space or apostrophe ("Founder's Assistant", "My Team Agent"). Matching is
 * now driven by the pool of known names instead of by a token shape: for
 * every `@` that starts a mention, take the LONGEST pool name that matches
 * right after it case-insensitively and is followed by end of text,
 * whitespace, or punctuation. This is what lets "My Team Agent" beat "My
 * Team" when both are in the pool, and lets "Nova's plan" resolve "Nova".
 */

import type { IdentityId } from "./thread.js";

/** Maximum number of resolved mentions returned for a single message. */
export const MAX_MENTIONS_PER_MESSAGE = 20;

/** Matches an "@" that starts a mention: start of string or preceded by whitespace. */
const MENTION_START_RE = /(?:^|(?<=\s))@/g;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedMention {
	identityId: IdentityId;
	displayName: string;
	/** The "@" plus the exact substring as typed, so the UI can locate it in the text. */
	sourceText: string;
}

// MentionSegment moved to layers/core-ui/src/ds/mention-segments.ts.

// ── resolveMentionsInText ───────────────────────────────────────────────────

/**
 * Find and resolve @mentions in `text` against a known pool of names.
 *
 * Rules:
 * - "@" must be at start of string or preceded by whitespace (an "@" inside
 *   a word, e.g. an email address, is never a mention start).
 * - For each mention start, the match is the LONGEST key in `nameMap` that
 *   equals (case-insensitively) the text right after the "@" and is
 *   followed by end of text, whitespace, or punctuation.
 * - nameMap: lowercased display name → { identityId, displayName }.
 * - An "@" with no matching pool name is silently left as plain text
 *   (concept hard rule #4).
 * - Deduplicates by identityId (same identity mentioned twice = one entry).
 * - Capped at MAX_MENTIONS_PER_MESSAGE resolved mentions.
 */
export function resolveMentionsInText(
	text: string,
	nameMap: ReadonlyMap<string, { identityId: string; displayName: string }>,
): ResolvedMention[] {
	if (!text || nameMap.size === 0) return [];

	const names = [...nameMap.keys()];
	const seenIds = new Set<string>();
	const resolved: ResolvedMention[] = [];

	MENTION_START_RE.lastIndex = 0;
	for (
		let match = MENTION_START_RE.exec(text);
		match !== null;
		match = MENTION_START_RE.exec(text)
	) {
		if (resolved.length >= MAX_MENTIONS_PER_MESSAGE) break;

		const atIndex = match.index;
		const afterAt = atIndex + 1;

		let bestName: string | null = null;
		for (const name of names) {
			const end = afterAt + name.length;
			if (text.slice(afterAt, end).toLowerCase() !== name) continue;

			const nextChar = text[end];
			const boundaryOk = nextChar === undefined || /\W/.test(nextChar);
			if (!boundaryOk) continue;

			if (bestName === null || name.length > bestName.length) bestName = name;
		}
		if (bestName === null) continue;

		const entry = nameMap.get(bestName);
		if (!entry || seenIds.has(entry.identityId)) continue;
		seenIds.add(entry.identityId);

		resolved.push({
			identityId: entry.identityId,
			displayName: entry.displayName,
			sourceText: text.slice(atIndex, afterAt + bestName.length),
		});
	}

	return resolved;
}

// segmentMentions moved to layers/core-ui/src/ds/mention-segments.ts.

/**
 * Mention parsing utilities.
 *
 * One pure function: scan text for `@` mentions and resolve each directly
 * against a known pool of names — no separate "extract raw tokens, then look
 * them up" pass. Pure: no DB, no HTTP, no React. Usable by both server and
 * client.
 *
 * @lore: mention resolution — server-side is authoritative; client sends raw text; MAX_MENTIONS_PER_MESSAGE=20 bounds transaction size and DB queries
 * @lore: mention matching — pool-driven longest-match (not token-shape regex); lets "My Team Agent" beat "My Team"; handles names with spaces or apostrophes
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
 * - An "@" with no matching pool name is silently left as plain text.
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

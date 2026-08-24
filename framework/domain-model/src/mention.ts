/**
 * AE5 — Mention parsing utilities.
 *
 * Three-stage pipeline: extract candidates → resolve against name map → segment text.
 * Pure functions: no DB, no HTTP, no React. Usable by both server and client.
 *
 * @lore AE5: Server-side resolution is authoritative (concept hard rule #1).
 * The client sends raw @name text; the server parses and resolves via these functions.
 * Resolution scope is team-wide (concept: "users can @mention agents not yet in the thread").
 *
 * @lore AE5 (WARNING from arch-critique): MAX_MENTIONS_PER_MESSAGE = 20 caps extraction
 * to bound transaction size and prevent abuse. Mentioned in concept §Cardinality: "0..N"
 * with no upper bound, but the arch-critique flags this as a risk for unbounded DB queries.
 */

import type { IdentityId } from "./thread.js";

/** Maximum number of unique @mention candidates extracted from a single message. */
export const MAX_MENTIONS_PER_MESSAGE = 20;

/**
 * Trailing punctuation characters to strip from @name tokens.
 * These characters commonly follow an @mention in natural language.
 */
const TRAILING_PUNCTUATION_RE = /[.,!?;:'")\]]+$/;

/**
 * Regex to find @name tokens. Matches @ preceded by start-of-string or whitespace,
 * followed by one or more non-whitespace characters.
 *
 * @lore AE5: `(?:^|(?<=\s))` uses lookbehind to match @ at start or after whitespace
 * without consuming the preceding character. The `g` flag finds all occurrences.
 */
const MENTION_RE = /(?:^|(?<=\s))@(\S+)/g;

// ── Types ────────────────────────────────────────────────────────────────────

export interface MentionCandidate {
	/** The raw "@name" token including the "@" prefix, with trailing punctuation stripped. */
	sourceText: string;
	/** The extracted name without "@", with trailing punctuation stripped. */
	name: string;
	/** Character offset of the "@" in the source text. */
	offset: number;
}

export interface ResolvedMention {
	identityId: IdentityId;
	displayName: string;
	sourceText: string;
}

// MentionSegment moved to layers/core-ui/src/ds/mention-segments.ts (AU44-b8).

// ── extractMentionCandidates ─────────────────────────────────────────────────

/**
 * Extract @mention candidates from message text.
 *
 * Rules:
 * - "@" must be at start of string or preceded by whitespace.
 * - Name is one or more non-whitespace characters after "@".
 * - Trailing punctuation (.,!?;:'")] ) is stripped from each name.
 * - Deduplicates by lowercased name (case-insensitive matching).
 * - Capped at MAX_MENTIONS_PER_MESSAGE distinct candidates.
 */
export function extractMentionCandidates(text: string): MentionCandidate[] {
	if (!text) return [];

	const seenNames = new Set<string>();
	const candidates: MentionCandidate[] = [];

	MENTION_RE.lastIndex = 0;
	for (let match = MENTION_RE.exec(text); match !== null; match = MENTION_RE.exec(text)) {
		if (candidates.length >= MAX_MENTIONS_PER_MESSAGE) break;

		// Full match (e.g. "@Aria,"), captured group 1 (e.g. "Aria,")
		const rawName = match[1] ?? "";
		// Strip trailing punctuation
		const name = rawName.replace(TRAILING_PUNCTUATION_RE, "");
		if (!name) continue;

		const lowerName = name.toLowerCase();
		if (seenNames.has(lowerName)) continue;
		seenNames.add(lowerName);

		// The offset is the position of "@" in the original text.
		// match.index is the start of the match; if preceded by whitespace,
		// the "@" is at match.index + 1; if at start, it's at match.index.
		const matchStart = match.index ?? 0;
		const atOffset = text[matchStart] === "@" ? matchStart : matchStart + 1;

		candidates.push({
			sourceText: `@${name}`,
			name,
			offset: atOffset,
		});
	}

	return candidates;
}

// ── resolveMentions ──────────────────────────────────────────────────────────

/**
 * Resolve mention candidates against a name lookup map.
 *
 * - nameMap: lowercased display name → { identityId, displayName }.
 * - Unresolved candidates are silently dropped (concept hard rule #4).
 * - Deduplicates by identityId (same person mentioned twice = one MentionRef).
 * - Self-mentions (identityId === senderId) are included in the result;
 *   the server suppresses the participant-addition side effect for self-mentions
 *   but still returns the MentionRef for display purposes (concept §1.4).
 */
export function resolveMentions(
	candidates: MentionCandidate[],
	nameMap: ReadonlyMap<string, { identityId: string; displayName: string }>,
	_senderId: IdentityId,
): ResolvedMention[] {
	const seenIds = new Set<string>();
	const resolved: ResolvedMention[] = [];

	for (const candidate of candidates) {
		const lowerName = candidate.name.toLowerCase();
		const entry = nameMap.get(lowerName);
		if (!entry) continue; // unknown @name → left as plain text

		if (seenIds.has(entry.identityId)) continue; // deduplicate by identityId
		seenIds.add(entry.identityId);

		resolved.push({
			identityId: entry.identityId,
			displayName: entry.displayName,
			sourceText: candidate.sourceText,
		});
	}

	return resolved;
}

// segmentMentions moved to layers/core-ui/src/ds/mention-segments.ts (AU44-b8).

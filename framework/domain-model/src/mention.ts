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

import type { IdentityId, InlineRef, MentionRef } from "./thread.js";

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

export interface MentionSegment {
	type: "text" | "mention";
	content: string;
	/** Only present when type === "mention". */
	mentionRef?: MentionRef;
}

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

// ── segmentMentions ──────────────────────────────────────────────────────────

/**
 * Split message text into segments for rendering.
 *
 * Each @name that matches a MentionRef's sourceText in the refs array becomes
 * a "mention" segment; everything else is "text". The renderer inserts styled
 * spans at mention positions.
 *
 * @lore AE5 (arch-critique §6): accepts ReadonlyArray<InlineRef> (the full refs
 * array) and filters MentionRef entries internally. This avoids requiring every
 * caller to pre-filter, at the cost of a slightly wider signature.
 *
 * @lore AE5: Uses string indexOf (not regex) to locate sourceText occurrences,
 * as specified in the architecture plan. This matches the exact byte sequence the
 * user typed, not a regex interpretation of it.
 */
export function segmentMentions(text: string, refs: ReadonlyArray<InlineRef>): MentionSegment[] {
	// Extract only MentionRef entries from the full refs array.
	const mentionRefs = refs.filter((r): r is MentionRef => r.kind === "mention");

	if (mentionRefs.length === 0 || !text) {
		return text ? [{ type: "text", content: text }] : [];
	}

	// Build a sorted list of (offset, length, mentionRef) for all sourceText occurrences.
	type Span = { start: number; end: number; ref: MentionRef };
	const spans: Span[] = [];

	for (const ref of mentionRefs) {
		let searchStart = 0;
		while (searchStart < text.length) {
			const idx = text.indexOf(ref.sourceText, searchStart);
			if (idx === -1) break;
			spans.push({ start: idx, end: idx + ref.sourceText.length, ref });
			searchStart = idx + ref.sourceText.length;
		}
	}

	if (spans.length === 0) {
		return [{ type: "text", content: text }];
	}

	// Sort by start offset; for overlapping spans (shouldn't happen in practice), first wins.
	spans.sort((a, b) => a.start - b.start);

	// Remove overlapping spans (keep first in sort order).
	const nonOverlapping: Span[] = [];
	let cursor = 0;
	for (const span of spans) {
		if (span.start >= cursor) {
			nonOverlapping.push(span);
			cursor = span.end;
		}
	}

	// Build segment list.
	const segments: MentionSegment[] = [];
	let pos = 0;
	for (const span of nonOverlapping) {
		if (span.start > pos) {
			segments.push({ type: "text", content: text.slice(pos, span.start) });
		}
		segments.push({
			type: "mention",
			content: span.ref.sourceText,
			mentionRef: span.ref,
		});
		pos = span.end;
	}
	if (pos < text.length) {
		segments.push({ type: "text", content: text.slice(pos) });
	}

	return segments;
}

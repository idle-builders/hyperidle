/**
 * @lore AU44-b8: MentionSegment + segmentMentions moved from
 * framework/domain-model/src/mention.ts. Only CommentRow renders mention segments.
 * Audit row 23 & 130: MERGE → design-system (=core-ui).
 *
 * extractMentionCandidates / resolveMentions / MentionCandidate / ResolvedMention stay in
 * @hyperidle/domain-model for now (server-side resolution is authoritative).
 */

import type { InlineRef, MentionRef } from "@hyperidle/domain-model";

export interface MentionSegment {
	type: "text" | "mention";
	content: string;
	/** Only present when type === "mention". */
	mentionRef?: MentionRef;
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

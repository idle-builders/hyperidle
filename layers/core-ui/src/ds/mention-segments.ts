import type { InlineRef, MentionRef } from "@hyperidle/domain-model";

export interface MentionSegment {
	type: "text" | "mention";
	content: string;
	/** Only present when type === "mention". */
	mentionRef?: MentionRef;
}

// ── segmentMentions ──────────────────────────────────────────────────────────

export function segmentMentions(text: string, refs: ReadonlyArray<InlineRef>): MentionSegment[] {
	const mentionRefs = refs.filter((r): r is MentionRef => r.kind === "mention");

	if (mentionRefs.length === 0 || !text) {
		return text ? [{ type: "text", content: text }] : [];
	}

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

	spans.sort((a, b) => a.start - b.start);

	const nonOverlapping: Span[] = [];
	let cursor = 0;
	for (const span of spans) {
		if (span.start >= cursor) {
			nonOverlapping.push(span);
			cursor = span.end;
		}
	}

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

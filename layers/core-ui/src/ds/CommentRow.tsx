/**
 * CommentRow — per-message row in the comment stream.
 *
 * Renders plain text, inline ref, verdict (status chip + decision label),
 * inline-comment (anchor label above body), redacted, grouped vs ungrouped.
 */

import type { InlineRef, Message } from "@hyperidle/domain-model";
import { isRedactedPayload, verdictDecisionLabel } from "@hyperidle/domain-model";
import { derivePayloads } from "../block";
import type { BlockPayload } from "../block/types.js";
import type { MentionSegment } from "./mention-segments.js";
import { segmentMentions } from "./mention-segments.js";
import { plainPayloadOf, reviewPayloadOf, verdictPayloadOf } from "./message-payload.js";
import { verdictDecisionToStatus } from "./status-mapping.js";

function exhaustiveAssert(value: never): never {
	throw new Error(`Unhandled message type: ${String(value)}`);
}

import type { JSX, ReactNode } from "react";
import { useMemo } from "react";
import { clockTime, TIME_PLACEHOLDER } from "../utils/time.js";
import { renderPayload } from "./block/render-payload.js";
import { dsProps } from "./ds-attrs.js";
import { StatusChip } from "./StatusChip.js";

export interface CommentRowSender {
	id: string;
	name: string;
	role?: string;
	avatarUrl?: string;
	/** When true, renders the green-tinted agent avatar variant and "Agent" badge. */
	isAgent?: boolean;
}

export interface CommentRowRichSlots {
	/**
	 * Tag + meta strip + (always-inline) reasoning. Designed to mirror the
	 * promoted RichMessageCard's metadata column. Variant marker
	 * `data-variant="rich-review" | "rich-questionnaire"`.
	 *
	 * Rich slots only render when message.type ∈ {review, questionnaire};
	 * for plain/verdict messages the slots are silently dropped and standard body renders.
	 */
	richHeader?: ReactNode;
	/** ArtifactView mounted inline, no card chrome. */
	richBody?: ReactNode;
	/** Flex-wrap row of buttons — same DaisyUI variants as the card footer. */
	richActions?: ReactNode;
}

export interface CommentRowProps extends CommentRowRichSlots {
	message: Message;
	sender: CommentRowSender;
	showSenderHeader: boolean;
	inlineAnchor?: string;
	/**
	 * Optional HTML sanitizer (e.g. DOMPurify). When provided, raw HTML block
	 * payloads are sanitized and rendered as HTML. When absent, html payloads
	 * degrade to UnknownPayload (shows raw source, no DOM injection).
	 */
	sanitizeHtml?: (raw: string) => string;
	/**
	 * Optional slot rendered after the message body — used for inline ref
	 * embeds (BlockRefEmbed). Assembled by the ThreadShell consumer via
	 * the `renderRefEmbeds` render prop.
	 */
	afterBody?: ReactNode;
}

/**
 * MentionToken — inline highlighted span for @mention rendering.
 *
 * Visual treatment per design spec:
 * - Background: var(--accent-primary) at 8% opacity
 * - Text: var(--accent-primary)
 * - Border-radius: var(--r-pill)
 * - Padding: 1px 3px (sub-grid exempt, internal inline padding)
 *
 * @lore: MentionToken — not interactive; no click-to-navigate, no hover card; click-to-profile deferred until agent profile page covers all identity types
 */
function MentionToken({ displayName }: { displayName: string }): JSX.Element {
	return (
		<span
			className="inline-flex items-center px-[3px] py-[3px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--accent-primary)_8%,transparent)] text-[var(--accent-deep)]"
			data-testid="mention-token"
		>
			@{displayName}
		</span>
	);
}

/**
 * Renders the payloads for a plain message through the block payload pipeline.
 * When the message has MentionRef entries in refs[], the text is first
 * segmented by segmentMentions() so @name tokens render as MentionToken spans.
 *
 * @lore: plain messages — rendered through derivePayloads() → renderPayload() so markdown (bold, code, lists, headings) displays correctly
 *
 * @lore: mention tokens pre-segmented before markdown pipeline — highlights in code blocks are intentional; mention was explicit regardless of formatting
 */
function MessagePayloads({
	text,
	refs,
	sanitizeHtml,
}: {
	text: string;
	refs?: ReadonlyArray<InlineRef>;
	sanitizeHtml?: (raw: string) => string;
}): JSX.Element {
	const hasMentions = useMemo(
		() => Array.isArray(refs) && refs.some((r) => r.kind === "mention"),
		[refs],
	);

	const segments = useMemo(
		() => (hasMentions && Array.isArray(refs) ? segmentMentions(text, refs) : null),
		[hasMentions, text, refs],
	);

	// Always compute payloads (hook called unconditionally — rules of hooks)
	const payloads = useMemo(() => derivePayloads(text), [text]);

	// If we have mention segments, render as mixed text+token content.
	if (segments && segments.length > 0) {
		return (
			<p className="type-copy  text-[var(--text-secondary)]  whitespace-pre-wrap break-words">
				{segments.map((seg: MentionSegment, i: number) =>
					seg.type === "mention" && seg.mentionRef ? (
						// biome-ignore lint/suspicious/noArrayIndexKey: segments are position-stable per render
						<MentionToken key={i} displayName={seg.mentionRef.displayName} />
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: segments are position-stable per render
						<span key={i}>{seg.content}</span>
					),
				)}
			</p>
		);
	}

	if (payloads.length === 0) {
		// Fall back to plain text rendering for empty-after-parse inputs.
		return (
			<p className="type-copy  text-[var(--text-secondary)]  whitespace-pre-wrap break-words">
				{text}
			</p>
		);
	}
	return (
		<div className="type-copy flex flex-col gap-[9px]  text-[var(--text-secondary)] ">
			{payloads.map((payload: BlockPayload, i: number) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: payloads are position-stable within a single message render
				<div key={i}>{renderPayload(payload, sanitizeHtml)}</div>
			))}
		</div>
	);
}

/**
 * Render the per-message body. Type narrowing flows through a `switch` on
 * `message.type` so that adding a 5th `MessageType` to the vocabulary
 * triggers a TS narrowing failure at the `default` arm via
 * `exhaustiveAssert(message.type)`.
 *
 */
// @lore: Message flat shape — payload: unknown, type: MessageType; switch narrows the type field only; exhaustiveAssert moves onto message.type directly
function renderBody(message: Message, sanitizeHtml?: (raw: string) => string): ReactNode {
	if (isRedactedPayload(message.payload)) {
		return (
			<div className="type-small italic text-[var(--text-tertiary)] ">
				Redacted by {message.payload.redactedBy} — {message.payload.reason}
			</div>
		);
	}
	// message.payload is `unknown` on the wire —
	// each case parses it into the shape `type` implies via the shared,
	// audited-cast helpers rather than narrowing the bare field.
	switch (message.type) {
		case "verdict": {
			const payload = verdictPayloadOf(message);
			if (isRedactedPayload(payload)) return null;
			const p = payload;
			return (
				<div className="type-small flex items-center gap-[9px] ">
					<StatusChip status={verdictDecisionToStatus(p.decision)} />
					<span className="text-[var(--text-secondary)]">{verdictDecisionLabel(p.decision)}</span>
					{p.note ? <span className="text-[var(--text-tertiary)]">— {p.note}</span> : null}
				</div>
			);
		}
		case "plain": {
			const payload = plainPayloadOf(message);
			if (isRedactedPayload(payload)) return null;
			const p = payload;
			return <MessagePayloads text={p.text} refs={p.refs} sanitizeHtml={sanitizeHtml} />;
		}
		case "review": {
			// Rich slots carry the review's substance on ThreadShell, but
			// HostThreadSection supplies none (WorkTask.tsx, HostThreadSection.tsx) —
			// without a fallback a review is a blank row there. Text only, no navigation.
			const payload = reviewPayloadOf(message);
			if (isRedactedPayload(payload)) return null;
			const p = payload;
			return (
				<p className="type-copy  text-[var(--text-secondary)]  whitespace-pre-wrap break-words">
					{p.title}
				</p>
			);
		}
		case "questionnaire":
			// questionnaire substance lives in the rich slots; standard body is null.
			return null;
		default:
			return exhaustiveAssert(message.type);
	}
}

export function CommentRow({
	message,
	sender,
	showSenderHeader,
	inlineAnchor,
	richHeader,
	richBody,
	richActions,
	sanitizeHtml,
	afterBody,
}: CommentRowProps): JSX.Element {
	const isRich = message.type === "review" || message.type === "questionnaire";
	const richSupplied = isRich && (richHeader || richBody || richActions);
	const variant = richSupplied
		? message.type === "review"
			? "rich-review"
			: "rich-questionnaire"
		: undefined;
	const isAgent = sender.isAgent ?? false;
	// clockTime always returns a string; TIME_PLACEHOLDER means invalid input.
	// @lore: sender-header time chip — coerced to null (not "—") when TIME_PLACEHOLDER; chip has no reserved cell so absence is the right "no value" state
	const timeRaw = showSenderHeader ? clockTime(message.createdAt) : null;
	const timeString = timeRaw === TIME_PLACEHOLDER ? null : timeRaw;

	const avatarClass = isAgent
		? "inline-flex items-center justify-center w-[36px] h-[36px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-deep)] border-width-strong border-[var(--accent-deep)] shrink-0"
		: "inline-flex items-center justify-center w-[36px] h-[36px] rounded-[var(--r-pill)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-width-strong border-[var(--border-subtle)] shrink-0";

	// @lore: data-sender-kind — "ai"|"human" is the stable Playwright selector for AI vs human; derives from CommentRowSender.isAgent
	return (
		<li
			{...dsProps("CommentRow", "2")}
			data-testid="comment-row"
			{...(variant ? { "data-variant": variant } : {})}
			data-sender-kind={isAgent ? "ai" : "human"}
			className="flex gap-[12px] py-[6px] px-[12px]"
		>
			{showSenderHeader ? (
				<span className={`type-avatar-initial type-avatar-initial--md ${avatarClass}`}>
					{sender.name.charAt(0).toUpperCase()}
				</span>
			) : (
				<span className="w-[36px] shrink-0" aria-hidden="true" />
			)}
			<div className="flex flex-col gap-[3px] min-w-0 flex-1">
				{showSenderHeader ? (
					<div className="flex items-baseline gap-[6px] mb-[3px]">
						<span className="type-small   text-[var(--text-primary)]">{sender.name}</span>
						{isAgent ? (
							<span className="type-label inline-flex items-center px-[6px] py-[3px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-deep)]   ">
								Agent
							</span>
						) : null}
						{timeString ? (
							<span className="type-metadata  text-[var(--text-tertiary)]">{timeString}</span>
						) : null}
					</div>
				) : null}
				{inlineAnchor ? (
					<div className="type-label  text-[var(--text-tertiary)] uppercase ">
						INLINE COMMENT ON <span className="text-[var(--text-secondary)]">{inlineAnchor}</span>
					</div>
				) : null}
				{richSupplied ? (
					<>
						{richHeader ? <div className="flex flex-col gap-[6px]">{richHeader}</div> : null}
						{richBody ? <div className="mt-[3px]">{richBody}</div> : null}
						{richActions ? (
							<div className="flex flex-wrap gap-[9px] mt-[3px]">{richActions}</div>
						) : null}
					</>
				) : (
					renderBody(message, sanitizeHtml)
				)}
				{afterBody ? <div className="mt-[3px]">{afterBody}</div> : null}
			</div>
		</li>
	);
}

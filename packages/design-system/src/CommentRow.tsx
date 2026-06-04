/**
 * L1a — `CommentRow` design-system component.
 *
 * Plan §7.5; approved.md §2.4. Per-message row in the comment stream.
 * Renders plain text, plain text with inline ref, verdict (status chip +
 * decision label), inline-comment (anchor label above body), redacted
 * (greyed body, "Redacted by X — reason"), grouped vs ungrouped variant.
 */

import type { Message } from "@hyperidle/shared";
import {
	derivePayloads,
	exhaustiveAssert,
	isRedactedPayload,
	verdictDecisionLabel,
	verdictDecisionToStatus,
} from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { useMemo } from "react";
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
	 * @lore L11 plan §5.4: rich slots only render when message.type ∈
	 * {review, questionnaire}. For plain/verdict messages the slots are
	 * silently dropped (no warning, no error) and the standard body
	 * renders instead.
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
	 *
	 * @lore R3 C-1 (reviewer): threaded from web consumer → ThreadShell →
	 * CommentRow. Tests verify the prop contract at the CommentRow level.
	 */
	sanitizeHtml?: (raw: string) => string;
	/**
	 * T4: Optional slot rendered after the message body — used for inline ref
	 * embeds (BlockRefEmbed). Assembeld by the ThreadShell consumer via
	 * the `renderRefEmbeds` render prop.
	 */
	afterBody?: ReactNode;
}

/**
 * Renders the payloads for a plain message through the block payload pipeline.
 *
 * @lore R3: plain messages are rendered through derivePayloads() → renderPayload()
 * so that markdown formatting (bold, code, lists, headings) is displayed correctly.
 * Previously plain messages were rendered as a single <p> with whitespace-pre-wrap.
 */
function MessagePayloads({
	text,
	sanitizeHtml,
}: {
	text: string;
	sanitizeHtml?: (raw: string) => string;
}): JSX.Element {
	const payloads = useMemo(() => derivePayloads(text), [text]);
	if (payloads.length === 0) {
		// Fall back to plain text rendering for empty-after-parse inputs.
		return (
			<p className="text-[15px] text-[var(--text-secondary)] leading-[1.7] whitespace-pre-wrap break-words">
				{text}
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-[9px] text-[15px] text-[var(--text-secondary)] leading-[1.7]">
			{payloads.map((payload, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: payloads are position-stable within a single message render
				<div key={i}>{renderPayload(payload, sanitizeHtml)}</div>
			))}
		</div>
	);
}

/**
 * Render the per-message body. Type narrowing flows through a `switch` on
 * `message.type` so that adding a 5th `MessageType` to the discriminated
 * union triggers a TS narrowing failure at the `default` arm via
 * `exhaustiveAssert(message)` (plan §4 + AC-11).
 *
 * @lore L1 step9 (Arch-#2): the previous if/else chain fell through to
 * `null` for unhandled types, so a 5th union variant would compile clean
 * and silently render nothing. The switch + `exhaustiveAssert` pattern
 * surfaces the omission at the type system level.
 */
function renderBody(message: Message, sanitizeHtml?: (raw: string) => string): ReactNode {
	const { payload } = message;
	if (isRedactedPayload(payload)) {
		return (
			<div className="italic text-[var(--text-tertiary)] text-[13px]">
				Redacted by {payload.redactedBy} — {payload.reason}
			</div>
		);
	}
	switch (message.type) {
		case "verdict":
			return (
				<div className="flex items-center gap-[9px] text-[13px]">
					<StatusChip status={verdictDecisionToStatus(payload.decision)} />
					<span className="text-[var(--text-secondary)]">
						{verdictDecisionLabel(payload.decision)}
					</span>
					{payload.note ? (
						<span className="text-[var(--text-tertiary)]">— {payload.note}</span>
					) : null}
				</div>
			);
		case "plain":
			return <MessagePayloads text={payload.text} sanitizeHtml={sanitizeHtml} />;
		case "review":
		case "questionnaire":
			// review/questionnaire substance lives in the rich slots; standard body is null.
			return null;
		default:
			return exhaustiveAssert(message);
	}
}

/**
 * Format an ISO timestamp string to a short time string (e.g. "2:34 PM").
 * Returns null when the timestamp is not parseable.
 */
function formatMessageTime(isoString: string): string | null {
	const ts = Date.parse(isoString);
	if (!Number.isFinite(ts)) return null;
	return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
	const timeString = showSenderHeader ? formatMessageTime(message.createdAt) : null;

	const avatarClass = isAgent
		? "inline-flex items-center justify-center w-[36px] h-[36px] rounded-full bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)] text-[13px] font-[600] border-[1.5px] border-[var(--accent-primary)] shrink-0"
		: "inline-flex items-center justify-center w-[36px] h-[36px] rounded-full bg-[var(--surface-page)] text-[var(--text-secondary)] text-[13px] font-[600] border-[1.5px] border-[var(--border-subtle)] shrink-0";

	return (
		<li
			{...dsProps("CommentRow", "2")}
			data-testid="comment-row"
			{...(variant ? { "data-variant": variant } : {})}
			className="flex gap-[12px] py-[6px] px-[12px]"
		>
			{showSenderHeader ? (
				<span className={avatarClass}>{sender.name.charAt(0).toUpperCase()}</span>
			) : (
				<span className="w-[36px] shrink-0" aria-hidden="true" />
			)}
			<div className="flex flex-col gap-[3px] min-w-0 flex-1">
				{showSenderHeader ? (
					<div className="flex items-baseline gap-[6px] mb-[3px]">
						<span className="text-[13px] font-[600] text-[var(--text-primary)]">{sender.name}</span>
						{isAgent ? (
							<span className="inline-flex items-center px-[6px] py-[3px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)] text-[10px] font-[600] tracking-[0.04em]">
								Agent
							</span>
						) : null}
						{timeString ? (
							<span className="text-[12px] text-[var(--text-tertiary)]">{timeString}</span>
						) : null}
					</div>
				) : null}
				{inlineAnchor ? (
					<div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.05em]">
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

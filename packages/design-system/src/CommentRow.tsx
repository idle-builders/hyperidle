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
			<p className="text-[13px] text-[var(--text-mid)] whitespace-pre-wrap break-words">{text}</p>
		);
	}
	return (
		<div className="flex flex-col gap-[8px] text-[13px] text-[var(--text-mid)]">
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
			<div className="italic text-[var(--text-lo)] text-[13px]">
				Redacted by {payload.redactedBy} — {payload.reason}
			</div>
		);
	}
	switch (message.type) {
		case "verdict":
			return (
				<div className="flex items-center gap-[8px] text-[13px]">
					<StatusChip status={verdictDecisionToStatus(payload.decision)} />
					<span className="text-[var(--text-mid)]">{verdictDecisionLabel(payload.decision)}</span>
					{payload.note ? <span className="text-[var(--text-lo)]">— {payload.note}</span> : null}
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
	return (
		<li
			{...dsProps("CommentRow", "2")}
			data-testid="comment-row"
			{...(variant ? { "data-variant": variant } : {})}
			className="flex gap-[8px] py-[6px] px-[var(--density-pad-x,12px)]"
		>
			{showSenderHeader ? (
				<span className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-full bg-[var(--surface-2)] text-[var(--text-lo)] text-[11px] font-medium border border-[var(--border-subtle)] shrink-0">
					{sender.name.charAt(0).toUpperCase()}
				</span>
			) : (
				<span className="w-[28px] shrink-0" aria-hidden="true" />
			)}
			<div className="flex flex-col gap-[2px] min-w-0 flex-1">
				{showSenderHeader ? (
					<div className="flex items-center gap-[6px] text-[12px]">
						<span className="text-[var(--text-hi)] font-medium">{sender.name}</span>
						{sender.role ? <span className="text-[var(--text-lo)]">· {sender.role}</span> : null}
					</div>
				) : null}
				{inlineAnchor ? (
					<div className="text-[11px] text-[var(--text-lo)] uppercase tracking-[0.05em]">
						INLINE COMMENT ON <span className="text-[var(--text-mid)]">{inlineAnchor}</span>
					</div>
				) : null}
				{richSupplied ? (
					<>
						{richHeader ? <div className="flex flex-col gap-[6px]">{richHeader}</div> : null}
						{richBody ? <div className="mt-[2px]">{richBody}</div> : null}
						{richActions ? (
							<div className="flex flex-wrap gap-[8px] mt-[4px]">{richActions}</div>
						) : null}
					</>
				) : (
					renderBody(message, sanitizeHtml)
				)}
				{afterBody ? <div className="mt-[4px]">{afterBody}</div> : null}
			</div>
		</li>
	);
}

/**
 * L1a — `CommentRow` design-system component.
 *
 * Plan §7.5; approved.md §2.4. Per-message row in the comment stream.
 * Renders plain text, plain text with inline ref, verdict (status chip +
 * decision label), inline-comment (anchor label above body), redacted
 * (greyed body, "Redacted by X — reason"), grouped vs ungrouped variant.
 */

import type { Message, VerdictDecision } from "@hyperidle/shared";
import { isRedactedPayload } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";
import { StatusChip } from "./StatusChip.js";

export interface CommentRowSender {
	id: string;
	name: string;
	role?: string;
	avatarUrl?: string;
}

export interface CommentRowProps {
	message: Message;
	sender: CommentRowSender;
	showSenderHeader: boolean;
	inlineAnchor?: string;
}

function verdictDecisionToStatus(
	decision: VerdictDecision,
): "done" | "blocked" | "behind" | "paused" {
	switch (decision) {
		case "approve":
		case "approve-with-comments":
			return "done";
		case "reject":
			return "blocked";
		case "request-changes":
			return "behind";
		case "edit":
			return "paused";
	}
}

function verdictDecisionLabel(decision: VerdictDecision): string {
	switch (decision) {
		case "approve":
		case "approve-with-comments":
			return "APPROVED";
		case "reject":
			return "REJECTED";
		case "request-changes":
			return "CHANGES REQUESTED";
		case "edit":
			return "EDITED";
	}
}

/**
 * Render the per-message body. Type narrowing flows through `message.type`
 * + `isRedactedPayload(payload)` so each branch sees the typed payload
 * without unsafe `as` casts (L1 step5 SL-C1).
 */
function renderBody(message: Message): ReactNode {
	const { payload } = message;
	if (isRedactedPayload(payload)) {
		return (
			<div className="italic text-[var(--text-lo)] text-[13px]">
				Redacted by {payload.redactedBy} — {payload.reason}
			</div>
		);
	}
	if (message.type === "verdict") {
		return (
			<div className="flex items-center gap-[8px] text-[13px]">
				<StatusChip status={verdictDecisionToStatus(payload.decision)} />
				<span className="text-[var(--text-mid)]">{verdictDecisionLabel(payload.decision)}</span>
				{payload.note ? <span className="text-[var(--text-lo)]">— {payload.note}</span> : null}
			</div>
		);
	}
	if (message.type === "plain") {
		return (
			<p className="text-[13px] text-[var(--text-mid)] whitespace-pre-wrap break-words">
				{payload.text}
			</p>
		);
	}
	// review/questionnaire substance lives in ThreadHead, not here.
	return null;
}

export function CommentRow({
	message,
	sender,
	showSenderHeader,
	inlineAnchor,
}: CommentRowProps): JSX.Element {
	return (
		<li
			{...dsProps("CommentRow", "2")}
			data-testid="comment-row"
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
				{renderBody(message)}
			</div>
		</li>
	);
}

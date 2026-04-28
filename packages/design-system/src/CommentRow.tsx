/**
 * L1a — `CommentRow` design-system component.
 *
 * Plan §7.5; approved.md §2.4. Per-message row in the comment stream.
 * Renders plain text, plain text with inline ref, verdict (status chip +
 * decision label), inline-comment (anchor label above body), redacted
 * (greyed body, "Redacted by X — reason"), grouped vs ungrouped variant.
 */

import type { Message } from "@hyperidle/shared";
import type { JSX } from "react";
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

function isRedactedPayload(
	p: unknown,
): p is { redacted: true; reason: string; redactedBy: string } {
	return typeof p === "object" && p !== null && (p as { redacted?: unknown }).redacted === true;
}

function verdictDecisionToStatus(
	decision: string,
): "done" | "blocked" | "behind" | "paused" | "error" {
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
		default:
			return "error";
	}
}

function verdictDecisionLabel(decision: string): string {
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
		default:
			return decision.toUpperCase();
	}
}

export function CommentRow({
	message,
	sender,
	showSenderHeader,
	inlineAnchor,
}: CommentRowProps): JSX.Element {
	const redacted = isRedactedPayload(message.payload);

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
				{
					redacted ? (
						<div className="italic text-[var(--text-lo)] text-[13px]">
							Redacted by {(message.payload as { redactedBy: string }).redactedBy} —{" "}
							{(message.payload as { reason: string }).reason}
						</div>
					) : message.type === "verdict" ? (
						<div className="flex items-center gap-[8px] text-[13px]">
							<StatusChip
								status={verdictDecisionToStatus((message.payload as { decision: string }).decision)}
							/>
							<span className="text-[var(--text-mid)]">
								{verdictDecisionLabel((message.payload as { decision: string }).decision)}
							</span>
							{(message.payload as { note?: string }).note ? (
								<span className="text-[var(--text-lo)]">
									— {(message.payload as { note?: string }).note}
								</span>
							) : null}
						</div>
					) : message.type === "plain" ? (
						<p className="text-[13px] text-[var(--text-mid)] whitespace-pre-wrap break-words">
							{(message.payload as { text: string }).text}
						</p>
					) : null /* review/questionnaire substance lives in ThreadHead, not here */
				}
			</div>
		</li>
	);
}

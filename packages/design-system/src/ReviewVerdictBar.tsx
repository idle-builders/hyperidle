/**
 * L1a — `ReviewVerdictBar` design-system component.
 *
 * Plan §7.3; approved.md §2.3. Sticky verdict surface above the composer.
 * Surfaces 5 binding verdicts + 3 non-binding replies + 2 sidecar actions.
 * No keyboard verb shortcuts (approved.md §5).
 */

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export type VerdictGrammarAction =
	| "approve"
	| "approve-with-comments"
	| "request-changes"
	| "edit"
	| "reject"
	| "comment"
	| "inline-comment"
	| "reply"
	| "snooze"
	| "escalate";

export interface ReviewVerdictBarProps {
	onAction: (action: VerdictGrammarAction) => void;
	disabled?: boolean;
}

interface ButtonSpec {
	action: VerdictGrammarAction;
	label: string;
	tone: "primary" | "neutral" | "danger" | "link";
}

const BINDING: ReadonlyArray<ButtonSpec> = [
	{ action: "approve", label: "Approve", tone: "primary" },
	{ action: "approve-with-comments", label: "Approve with comments", tone: "primary" },
	{ action: "request-changes", label: "Request changes", tone: "neutral" },
	{ action: "edit", label: "Edit", tone: "neutral" },
	{ action: "reject", label: "Reject", tone: "danger" },
];

const NON_BINDING: ReadonlyArray<ButtonSpec> = [
	{ action: "comment", label: "Comment", tone: "neutral" },
	{ action: "inline-comment", label: "Inline comment", tone: "neutral" },
	{ action: "reply", label: "Reply", tone: "neutral" },
];

const SIDECAR: ReadonlyArray<ButtonSpec> = [
	{ action: "snooze", label: "Snooze", tone: "link" },
	{ action: "escalate", label: "Escalate", tone: "link" },
];

function toneClass(tone: ButtonSpec["tone"]): string {
	switch (tone) {
		case "primary":
			return "bg-[var(--accent)] text-[var(--accent-on)] hover:opacity-90";
		case "danger":
			return "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_22%,transparent)]";
		case "link":
			return "bg-transparent text-[var(--text-lo)] hover:text-[var(--text-hi)]";
		default:
			return "bg-[var(--surface-2)] text-[var(--text-mid)] hover:bg-[var(--surface-ghost)]";
	}
}

export function ReviewVerdictBar({ onAction, disabled }: ReviewVerdictBarProps): JSX.Element {
	return (
		<div
			{...dsProps("ReviewVerdictBar", "2")}
			className="flex flex-wrap items-center gap-[8px] py-[var(--density-pad-y,8px)] px-[var(--density-pad-x,12px)] border-t border-[var(--border-subtle)] bg-[var(--surface-1)] sticky bottom-[var(--density-row-h,40px)]"
		>
			{BINDING.map((b) => (
				<button
					key={b.action}
					type="button"
					disabled={disabled}
					onClick={(): void => onAction(b.action)}
					className={`px-[10px] py-[6px] rounded-[var(--r1)] text-[13px] font-medium ${toneClass(b.tone)} disabled:opacity-50 disabled:cursor-not-allowed`}
				>
					{b.label}
				</button>
			))}
			<span className="w-px h-[20px] bg-[var(--border-subtle)] mx-[4px]" aria-hidden="true" />
			{NON_BINDING.map((b) => (
				<button
					key={b.action}
					type="button"
					disabled={disabled}
					onClick={(): void => onAction(b.action)}
					className={`px-[10px] py-[6px] rounded-[var(--r1)] text-[13px] font-medium ${toneClass(b.tone)} disabled:opacity-50 disabled:cursor-not-allowed`}
				>
					{b.label}
				</button>
			))}
			<span className="ml-auto flex items-center gap-[4px]">
				{SIDECAR.map((b) => (
					<button
						key={b.action}
						type="button"
						disabled={disabled}
						onClick={(): void => onAction(b.action)}
						className={`px-[10px] py-[6px] rounded-[var(--r1)] text-[13px] ${toneClass(b.tone)} disabled:opacity-50 disabled:cursor-not-allowed`}
					>
						{b.label}
					</button>
				))}
			</span>
		</div>
	);
}

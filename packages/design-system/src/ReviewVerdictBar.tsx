/**
 * L1a — `ReviewVerdictBar` design-system component.
 *
 * Plan §7.3; approved.md §2.3. Sticky verdict surface above the composer.
 * Surfaces the 5 binding verdicts (approve, approve-with-comments,
 * request-changes, edit, reject). No keyboard verb shortcuts
 * (approved.md §5).
 *
 * @lore L1 step5 (S-C1): the non-binding replies (comment / inline-comment /
 * reply) and sidecar actions (snooze / escalate) were rendered in step 2
 * without listeners — every click was dropped silently in `ThreadShell`.
 * They land in L1b alongside the inline-comment authoring surface; ship the
 * smaller correct contract here so the bar can never trap a founder.
 */

import { VERDICT_DECISIONS, type VerdictDecision } from "@hyperidle/shared";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export type VerdictGrammarAction = VerdictDecision;

export interface ReviewVerdictBarProps {
	onAction: (action: VerdictGrammarAction) => void;
	disabled?: boolean;
}

interface ButtonSpec {
	action: VerdictGrammarAction;
	label: string;
	tone: "primary" | "neutral" | "danger";
}

const BINDING: ReadonlyArray<ButtonSpec> = [
	{ action: "approve", label: "Approve", tone: "primary" },
	{ action: "approve-with-comments", label: "Approve with comments", tone: "primary" },
	{ action: "request-changes", label: "Request changes", tone: "neutral" },
	{ action: "edit", label: "Edit", tone: "neutral" },
	{ action: "reject", label: "Reject", tone: "danger" },
];

// Defensive guard: BINDING must cover every VerdictDecision exactly once.
// This is a build-time assertion, executed once on import.
const _BINDING_COMPLETENESS_CHECK: ReadonlySet<VerdictDecision> = new Set(
	BINDING.map((b) => b.action),
);
if (_BINDING_COMPLETENESS_CHECK.size !== VERDICT_DECISIONS.length) {
	throw new Error("ReviewVerdictBar BINDING does not match VERDICT_DECISIONS");
}

function toneClass(tone: ButtonSpec["tone"]): string {
	switch (tone) {
		case "primary":
			return "bg-[var(--accent)] text-[var(--accent-on)] hover:opacity-90";
		case "danger":
			return "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_22%,transparent)]";
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
		</div>
	);
}

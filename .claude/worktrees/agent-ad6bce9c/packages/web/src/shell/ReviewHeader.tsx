import { useCallback, useEffect, useRef } from "react";
import type { JSX } from "react";

export type VerdictAction =
	| "approve"
	| "approve-with-comments"
	| "comment"
	| "inline-comment"
	| "request-changes"
	| "edit"
	| "reject"
	| "reply"
	| "snooze"
	| "escalate";

export interface Proposer {
	name: string;
	avatarUrl?: string;
	timestamp: string;
}

export interface ReviewHeaderProps {
	proposer: Proposer;
	onVerdict: (action: VerdictAction) => void;
}

interface VerdictButtonDef {
	action: VerdictAction;
	label: string;
	shortcut: string;
	shortcutKey: string;
	variant: string;
}

/**
 * @lore 10 verdict actions mapped from the spec in TRACK-F.md UI-32.
 * Keyboard shortcuts: A, A+C, C, I, R, E, X, Enter, S, ArrowUp.
 * We only bind single-key shortcuts (A, R, X, S) as global keydown listeners.
 * Combo shortcuts (A+C) and special keys (Enter, ArrowUp) are not bound globally
 * to avoid conflicts — they work via button focus + keyboard interaction.
 */
const VERDICT_BUTTONS: VerdictButtonDef[] = [
	{ action: "approve", label: "Approve", shortcut: "A", shortcutKey: "a", variant: "btn-accent" },
	{
		action: "approve-with-comments",
		label: "Approve with comments",
		shortcut: "A+C",
		shortcutKey: "",
		variant: "btn-ghost",
	},
	{ action: "comment", label: "Comment", shortcut: "C", shortcutKey: "c", variant: "btn-ghost" },
	{
		action: "inline-comment",
		label: "Inline comment",
		shortcut: "I",
		shortcutKey: "i",
		variant: "btn-ghost",
	},
	{
		action: "request-changes",
		label: "Request changes",
		shortcut: "R",
		shortcutKey: "r",
		variant: "btn-secondary",
	},
	{ action: "edit", label: "Edit", shortcut: "E", shortcutKey: "e", variant: "btn-ghost" },
	{ action: "reject", label: "Reject", shortcut: "X", shortcutKey: "x", variant: "btn-error" },
	{ action: "reply", label: "Reply", shortcut: "Enter", shortcutKey: "", variant: "btn-ghost" },
	{ action: "snooze", label: "Snooze", shortcut: "S", shortcutKey: "s", variant: "btn-ghost" },
	{ action: "escalate", label: "Escalate", shortcut: "Up", shortcutKey: "", variant: "btn-ghost" },
];

const KEY_TO_VERDICT: Record<string, VerdictAction> = {};
for (const btn of VERDICT_BUTTONS) {
	if (btn.shortcutKey) {
		KEY_TO_VERDICT[btn.shortcutKey] = btn.action;
	}
}

/** Elements where keyboard shortcuts should not fire */
const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function ReviewHeader({ proposer, onVerdict }: ReviewHeaderProps): JSX.Element {
	const headerRef = useRef<HTMLElement>(null);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			// Only activate when the ReviewHeader or its children have focus
			if (!headerRef.current?.contains(e.target as Node)) {
				return;
			}

			// Do not intercept when user is typing in an input field
			const target = e.target as HTMLElement;
			if (INPUT_TAGS.has(target.tagName) || target.isContentEditable) {
				return;
			}

			const verdict = KEY_TO_VERDICT[e.key.toLowerCase()];
			if (verdict) {
				e.preventDefault();
				onVerdict(verdict);
			}
		},
		[onVerdict],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	return (
		<header
			ref={headerRef}
			className="flex items-center gap-3 py-2 px-3 border-b border-[var(--surface-4)]"
		>
			{/* Proposer info */}
			<div className="flex items-center gap-2 mr-auto">
				{proposer.avatarUrl ? (
					<img
						src={proposer.avatarUrl}
						alt={`${proposer.name} avatar`}
						className="h-6 w-6 rounded-full"
					/>
				) : (
					<div className="avatar placeholder">
						<div className="bg-[var(--surface-4)] text-[var(--text-lo)] rounded-full w-6 h-6">
							<span className="text-xs">{proposer.name.charAt(0).toUpperCase()}</span>
						</div>
					</div>
				)}
				<span className="text-sm font-medium text-[var(--text-hi)]">{proposer.name}</span>
				<span className="text-xs text-[var(--text-lo)]">{proposer.timestamp}</span>
			</div>

			{/* Verdict toolbar */}
			<div
				role="toolbar"
				aria-label="Verdict actions"
				className="flex items-center gap-1 flex-wrap"
			>
				{VERDICT_BUTTONS.map((btn) => (
					<button
						key={btn.action}
						type="button"
						className={`btn btn-xs ${btn.variant}`}
						title={`${btn.label} (${btn.shortcut})`}
						aria-label={btn.label}
						onClick={() => onVerdict(btn.action)}
					>
						{btn.label}
						{btn.shortcut && <kbd className="kbd kbd-xs ml-1 text-[10px]">{btn.shortcut}</kbd>}
					</button>
				))}
			</div>
		</header>
	);
}

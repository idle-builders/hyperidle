import { useCallback, useEffect, useRef, useState } from "react";
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
 * We only bind single-key shortcuts (A, R, X, S, C, I, E) as global keydown
 * listeners. Combo shortcuts (A+C) and special keys (Enter, ArrowUp) are
 * not bound globally to avoid conflicts — they work via button focus +
 * keyboard interaction.
 *
 * @lore I4 P3: shortcuts for secondary verdicts (C, I, E) still fire
 * regardless of whether the overflow dropdown is open. The dropdown is a
 * visual affordance, not a gating control.
 */
const PRIMARY_BUTTONS: VerdictButtonDef[] = [
	{ action: "approve", label: "Approve", shortcut: "A", shortcutKey: "a", variant: "btn-accent" },
	{
		action: "request-changes",
		label: "Request changes",
		shortcut: "R",
		shortcutKey: "r",
		variant: "btn-secondary",
	},
	{ action: "reject", label: "Reject", shortcut: "X", shortcutKey: "x", variant: "btn-error" },
	{ action: "snooze", label: "Snooze", shortcut: "S", shortcutKey: "s", variant: "btn-ghost" },
];

const SECONDARY_BUTTONS: VerdictButtonDef[] = [
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
	{ action: "edit", label: "Edit", shortcut: "E", shortcutKey: "e", variant: "btn-ghost" },
	{ action: "reply", label: "Reply", shortcut: "Enter", shortcutKey: "", variant: "btn-ghost" },
	{ action: "escalate", label: "Escalate", shortcut: "Up", shortcutKey: "", variant: "btn-ghost" },
];

const VERDICT_BUTTONS: VerdictButtonDef[] = [...PRIMARY_BUTTONS, ...SECONDARY_BUTTONS];

const KEY_TO_VERDICT: Record<string, VerdictAction> = {};
for (const btn of VERDICT_BUTTONS) {
	if (btn.shortcutKey) {
		KEY_TO_VERDICT[btn.shortcutKey] = btn.action;
	}
}

/** Elements where keyboard shortcuts should not fire */
const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function VerdictButton({
	def,
	onVerdict,
	role,
	tabIndex,
}: {
	def: VerdictButtonDef;
	onVerdict: (action: VerdictAction) => void;
	role?: string;
	tabIndex?: number;
}): JSX.Element {
	return (
		<button
			type="button"
			className={`btn btn-xs ${def.variant}`}
			title={`${def.label} (${def.shortcut})`}
			aria-label={def.label}
			role={role}
			tabIndex={tabIndex}
			onClick={() => onVerdict(def.action)}
		>
			{def.label}
			{def.shortcut && <kbd className="kbd kbd-xs ml-1 text-[10px]">{def.shortcut}</kbd>}
		</button>
	);
}

const MORE_MENU_ID = "review-header-more-menu";

export function ReviewHeader({ proposer, onVerdict }: ReviewHeaderProps): JSX.Element {
	const headerRef = useRef<HTMLElement>(null);
	const [moreOpen, setMoreOpen] = useState(false);

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

			{/* Verdict toolbar — I4 P3: 4 primary verdicts as direct children. */}
			<div
				role="toolbar"
				aria-label="Verdict actions"
				className="flex items-center gap-1 flex-wrap"
			>
				{PRIMARY_BUTTONS.map((btn) => (
					<VerdictButton key={btn.action} def={btn} onVerdict={onVerdict} />
				))}
			</div>

			{/* I4 P3 + Design H3 / Arch M3: overflow control is a proper ARIA
				menu. The 6 secondary verdicts always live in the DOM (so
				`getByRole` queries find them and global keyboard shortcuts
				continue to work) but when the menu is closed each menuitem
				is removed from the tab order via tabIndex={-1}. The trigger
				carries aria-haspopup/aria-controls/aria-expanded so
				assistive tech associates the disclosure. */}
			<div className="relative">
				<button
					type="button"
					className="btn btn-xs btn-ghost"
					aria-label="More actions"
					aria-haspopup="menu"
					aria-controls={MORE_MENU_ID}
					aria-expanded={moreOpen}
					onClick={() => setMoreOpen((p) => !p)}
				>
					More
				</button>
				<div
					id={MORE_MENU_ID}
					role="menu"
					aria-label="Secondary verdict actions"
					className={`absolute right-0 top-full z-10 mt-1 flex flex-col gap-1 rounded border border-[var(--surface-4)] bg-base-200 p-2 shadow ${moreOpen ? "" : "sr-only"}`}
				>
					{SECONDARY_BUTTONS.map((btn) => (
						<VerdictButton
							key={btn.action}
							def={btn}
							onVerdict={onVerdict}
							role="menuitem"
							tabIndex={moreOpen ? 0 : -1}
						/>
					))}
				</div>
			</div>
		</header>
	);
}

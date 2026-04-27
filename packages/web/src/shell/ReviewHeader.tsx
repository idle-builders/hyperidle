import { dsShellProps } from "@hyperidle/design-system";
import type { VerdictAction } from "@hyperidle/shared";
import type { JSX } from "react";
import { useCallback, useState } from "react";

export type { VerdictAction };

export interface Proposer {
	name: string;
	avatarUrl?: string;
	timestamp: string;
}

export interface ReviewHeaderProps {
	proposer: Proposer;
	/**
	 * L4: split from `onVerdict`. First click on a primary verdict in the
	 * default `verdictDoubleClick=true` state pre-fills (calls onPrefill);
	 * a second click (with `pendingVerdict` already set to the same action)
	 * commits.
	 */
	onPrefill: (action: VerdictAction) => void;
	onCommit: (action: VerdictAction) => void;
	/** L4: the currently pre-filled verdict (lifted state from
	 * `ConversationsReview`). When this matches a primary button, that
	 * button's label swaps to "Confirm Approve" / "Confirm Reject" /…
	 * and aria-pressed flips to true. */
	pendingVerdict: VerdictAction | null;
	/** L4: when false, single click commits directly. Sourced from
	 * Settings → Appearance → verdictDoubleClick. */
	verdictDoubleClick: boolean;
	/**
	 * @lore J4 AC: when the underlying review is blocking agent progress,
	 * expose a Pause button alongside the always-visible Approve / Request
	 * changes / Reject. Omit to hide (backwards compatible with I4 toolbar).
	 */
	blocking?: boolean;
	/**
	 * L4: gates the `↶ undoable` chip on the Approve button. Strict identity
	 * check (`reversibility === true`) — null/undefined/false all hide it.
	 * The L9 work package adds the underlying field to artifacts; until
	 * then the chip stays hidden.
	 */
	reversibility?: boolean | null;
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

/**
 * @lore L4 review (design C3): pre-filled / "armed" verdict buttons need a
 * visible affordance for sighted-mouse users — `aria-pressed` alone gives
 * SR users the state but mouse users see no change. We add a focus ring
 * (`ring-2`) and an outline using the accent token so the button visually
 * inverts/highlights when armed. Tokens only — no raw colors.
 */
function VerdictButton({
	def,
	pending,
	onClick,
	role,
	tabIndex,
	extraSlot,
	menuStyle = false,
}: {
	def: VerdictButtonDef;
	pending: boolean;
	onClick: () => void;
	role?: string;
	tabIndex?: number;
	extraSlot?: JSX.Element | null;
	/**
	 * @lore L6 .plan-L6.md § 3.5: menuitem rows align label-left/kbd-right
	 * via `w-full justify-between` to prevent the kbd badge overlapping the
	 * next row's label inside the popover. Toolbar buttons keep their
	 * intrinsic width.
	 */
	menuStyle?: boolean;
}): JSX.Element {
	const label = pending ? `Confirm ${def.label}` : def.label;
	const armedClasses = pending
		? " ring-2 ring-offset-1 ring-[var(--accent)] outline outline-1 outline-[var(--accent)]"
		: "";
	return (
		<button
			type="button"
			className={`btn btn-xs ${def.variant}${armedClasses}${menuStyle ? " w-full justify-between" : ""}`}
			title={`${def.label} (${def.shortcut})`}
			aria-label={label}
			aria-pressed={pending ? true : undefined}
			data-pending={pending ? "true" : undefined}
			role={role}
			tabIndex={tabIndex}
			onClick={onClick}
		>
			{label}
			{extraSlot}
			{def.shortcut && <kbd className="kbd kbd-xs ml-1 text-[11px]">{def.shortcut}</kbd>}
		</button>
	);
}

const MORE_MENU_ID = "review-header-more-menu";

/**
 * @lore J4 AC: Pause is an extra primary verdict that appears only when the
 * review is blocking agent progress. We keep it out of PRIMARY_BUTTONS so the
 * I4 contract ("4 primary verdicts: Approve/Request changes/Reject/Snooze")
 * holds for every non-blocking review; blocking reviews render 5 primary
 * buttons with Pause appended.
 */
const PAUSE_BUTTON: VerdictButtonDef = {
	action: "pause",
	label: "Pause",
	shortcut: "P",
	shortcutKey: "p",
	variant: "btn-warning",
};

export function ReviewHeader({
	proposer,
	onPrefill,
	onCommit,
	pendingVerdict,
	verdictDoubleClick,
	blocking = false,
	reversibility,
}: ReviewHeaderProps): JSX.Element {
	const [moreOpen, setMoreOpen] = useState(false);

	const handleVerdictClick = useCallback(
		(action: VerdictAction): void => {
			if (!verdictDoubleClick) {
				onCommit(action);
				return;
			}
			if (pendingVerdict === action) {
				onCommit(action);
			} else {
				onPrefill(action);
			}
		},
		[verdictDoubleClick, pendingVerdict, onCommit, onPrefill],
	);

	// @lore L4 review: keyboard shortcuts are owned by the page-level
	// listener in `ConversationsReview` (single source of truth). Header
	// no longer registers its own keydown listener — see PREFILL_KEYS in
	// ConversationsReview.tsx.

	return (
		<header
			{...dsShellProps("ReviewHeader")}
			/*
			 * @lore K11: outer pad → --density-page-gutter, gap →
			 * --density-gap, proposer name → --density-text per
			 * density-audit.md § 3.3.K5. Avatar stays literal 24 px (chrome
			 * — see § 3.3.K5 last paragraph). Verdict buttons stay
			 * `btn-xs` (DaisyUI primitive) — § 5.2 anti-pattern: buttons
			 * growing under comfortable would push secondary verdicts off
			 * the right edge and break keyboard-first muscle memory. The
			 * `design/no-density-tokens` rule's primary-density-locked
			 * canonical example.
			 */
			className="flex items-center gap-[var(--density-gap)] p-[var(--density-page-gutter)] border-b border-[var(--border-subtle)]"
		>
			{/* Proposer info */}
			<div className="flex items-center gap-2 mr-auto">
				{proposer.avatarUrl ? (
					/* @lore K10: ReviewHeader avatar stays literal 24 px (h-6 w-6).
					   Per density-audit.md § 3.3.K5 the avatar is chrome at 24 px to
					   match the verdict buttons' visual weight; growing it would
					   inflate the toolbar and read as a marketing CTA bar. */
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
				<span className="text-[length:var(--density-text)] font-medium text-[var(--text-hi)]">
					{proposer.name}
				</span>
				<span className="text-xs text-[var(--text-lo)]">{proposer.timestamp}</span>
			</div>

			{/* Verdict toolbar — I4 P3: 4 primary verdicts as direct children.
				J4: when `blocking`, append a Pause button.
				L4: Approve gets the optional ↶ undoable chip iff
				reversibility === true (strict identity per .plan-L4.md §3.3.1). */}
			<div
				role="toolbar"
				aria-label="Verdict actions"
				className="flex items-center gap-1 flex-wrap"
			>
				{PRIMARY_BUTTONS.map((btn) => {
					const pending = pendingVerdict === btn.action;
					// @lore L4 review (design W4 + W5/biome a11y): the chip should
					// recede — power users learn the symbol; it must not compete
					// with the verdict label. Use `text-[var(--text-lo)]` with no
					// background. Removed `aria-label` (biome flagged: span has no
					// implicit role that supports it; the visible text "undoable"
					// already conveys the meaning).
					const extra =
						btn.action === "approve" && reversibility === true ? (
							<span key="reversibility-chip" className="ml-1 text-[11px] text-[var(--text-lo)]">
								↶ undoable
							</span>
						) : null;
					return (
						<VerdictButton
							key={btn.action}
							def={btn}
							pending={pending}
							onClick={() => handleVerdictClick(btn.action)}
							extraSlot={extra}
						/>
					);
				})}
				{blocking && (
					<VerdictButton
						def={PAUSE_BUTTON}
						pending={pendingVerdict === PAUSE_BUTTON.action}
						onClick={() => handleVerdictClick(PAUSE_BUTTON.action)}
					/>
				)}
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
				{/*
				 * @lore L6 .plan-L6.md § 3.5: closed state uses `hidden`
				 * (not `sr-only`) so the popover is fully removed from
				 * layout/accessibility tree when shut — `sr-only` left
				 * children measured-but-clipped which manifested as the
				 * A-ADV-01-more-menu.png overlap regression. `min-w-[14rem]`
				 * + `whitespace-nowrap` reserves room so menuitems never
				 * collapse against each other; `justify-between w-full` on
				 * each row aligns label/kbd cleanly.
				 */}
				<div
					id={MORE_MENU_ID}
					role="menu"
					aria-label="Secondary verdict actions"
					className={`absolute right-0 top-full z-10 mt-1 flex flex-col gap-[var(--density-gap)] min-w-[14rem] whitespace-nowrap rounded-[var(--r2)] border border-[var(--border-default)] bg-base-200 p-2 shadow-[var(--float)] ${moreOpen ? "" : "hidden"}`}
				>
					{SECONDARY_BUTTONS.map((btn) => (
						<VerdictButton
							key={btn.action}
							def={btn}
							pending={pendingVerdict === btn.action}
							onClick={() => handleVerdictClick(btn.action)}
							role="menuitem"
							tabIndex={moreOpen ? 0 : -1}
							menuStyle
						/>
					))}
				</div>
			</div>
		</header>
	);
}

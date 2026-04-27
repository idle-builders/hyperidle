/**
 * L4 — UndoToast. Composes DaisyUI `toast` + neutral surface primitives.
 *
 * @lore L4: UndoToast is a composition (not a custom Tier-3 component).
 * Stays under the 19-component budget by leaning on DaisyUI primitives.
 *
 * @lore L4 review (design C1+C2): the toast was originally `alert-info`
 * which resolves to indigo (`#4f46e5` in dark / `#e0e7ff` in light) —
 * unreadable in dark mode and the canonical AI-aesthetic anti-pattern
 * (AQ-102). Replaced with a neutral surface (`--surface-2`) and an
 * accent-coloured left bar so the toast reads as a precision-instrument
 * confirmation, not a marketing notification.
 *
 * @lore L4 review (design W3): enter/exit motion uses `--motion-medium`
 * + `--motion-ease`; only `transform` and `opacity` are animated so
 * `prefers-reduced-motion` collapses to instant via the token override
 * in `tokens.css`.
 *
 * @lore L4 review (adversary W4 / design O1): the `agentActed` prop is
 * the orchestration hook for the "View what shipped" swap. Today the
 * page never flips this to `true` mid-toast (the agent-runtime event
 * stream that drives it ships in D-track / future work); the toast
 * still supports the swap so it lights up when the wiring lands.
 */
import type { VerdictAction } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect } from "react";

export interface UndoToastProps {
	visible: boolean;
	threadId: string;
	/** Seconds remaining in the window — drives the user-visible countdown. */
	windowSeconds: number;
	/** The original window for progress-bar denomination (defaults to `windowSeconds`). */
	totalSeconds?: number;
	agentActed: boolean;
	auditRowId?: string;
	onUndo: () => Promise<void> | void;
	onDismiss: () => void;
}

export type { VerdictAction };

export function UndoToast(props: UndoToastProps): JSX.Element | null {
	const {
		visible,
		threadId,
		windowSeconds,
		totalSeconds,
		agentActed,
		auditRowId,
		onUndo,
		onDismiss,
	} = props;

	const handleEscape = useCallback(
		(e: KeyboardEvent): void => {
			if (!visible) return;
			if (e.key === "Escape") {
				e.preventDefault();
				onDismiss();
			}
		},
		[visible, onDismiss],
	);

	useEffect(() => {
		if (!visible) return;
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [visible, handleEscape]);

	if (!visible) return null;

	const auditHref = auditRowId
		? `/conversations/review?thread=${encodeURIComponent(threadId)}&audit=${encodeURIComponent(auditRowId)}`
		: undefined;

	const denom = Math.max(1, totalSeconds ?? windowSeconds);
	// Clamp to [0, 100] so the bar never overshoots when secondsLeft briefly
	// exceeds the denominator at start (race between two setStates).
	const progressPct = Math.max(0, Math.min(100, (windowSeconds / denom) * 100));

	return (
		<div
			className="toast toast-end toast-bottom"
			role="status"
			aria-live="polite"
			data-testid="undo-toast"
		>
			{/* Neutral surface with an accent left bar — see file-level @lore. */}
			<div
				className={
					"flex items-center gap-2 rounded border-l-2 border-l-[var(--accent)] " +
					"border border-[var(--border-default)] bg-[var(--surface-2)] " +
					"text-[var(--text-hi)] px-3 py-2 shadow-[var(--float)] relative overflow-hidden " +
					"transition-[opacity,transform] duration-[var(--motion-medium)] ease-[var(--motion-ease)]"
				}
				style={{ minWidth: "20rem" }}
			>
				<span
					className="text-[length:var(--density-text)]"
					style={{ fontVariantNumeric: "tabular-nums" }}
				>
					Verdict committed — {windowSeconds}s
				</span>
				{agentActed && auditHref ? (
					<a
						href={auditHref}
						className="btn btn-xs btn-ghost min-h-[44px]"
						aria-label="View what shipped"
					>
						View what shipped
					</a>
				) : (
					<button
						type="button"
						className="btn btn-xs btn-accent min-h-[44px]"
						aria-label="Undo verdict"
						onClick={() => {
							void onUndo();
						}}
					>
						Undo <kbd className="kbd kbd-xs ml-1">U</kbd>
					</button>
				)}
				<button
					type="button"
					className="btn btn-xs btn-ghost btn-square min-h-[44px]"
					aria-label="Dismiss (Esc)"
					title="Dismiss (Esc)"
					onClick={onDismiss}
				>
					<span aria-hidden="true">×</span>
				</button>
				{/* Countdown progress bar — design W2. transform-only animation
				    so prefers-reduced-motion collapses cleanly. */}
				<div
					aria-hidden="true"
					className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)] transition-[transform] duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
					style={{
						width: "100%",
						transformOrigin: "left",
						transform: `scaleX(${progressPct / 100})`,
					}}
				/>
			</div>
		</div>
	);
}

// AM5 — The shared fold / SplitView primitive (the open presentation).
//
// EXTRACTED, not reinvented. This is the ONE net-new container shape AM5 requires
// — the generalization of chat's proportional `flex-row` split (Conversations.tsx)
// into a content-agnostic `origin | seam | destination` with a single draggable
// seam and contextual icon mode-controls floated over the destination half.
//
// The component lives HERE (not inside a story) so every surface composes the SAME
// fold: `SplitView.stories.tsx` exercises it with placeholder boxes;
// `UnifiedSplitView.stories.tsx` fills it with real (Kind,Representation) content
// across conversation / review / knowledge — proving the unification. No fork, no
// duplicated split logic. See SplitView.stories.tsx header for the full extraction
// rationale (chat = canonical base, review = converges onto this).
//
// Founder round-3 fix — TWO FLOATING LAYERS, not a divided surface:
//   The split now reads as two SEPARATE elevated rounded cards floating on the warm
//   page canvas — Hearth's existing layering language. The SplitView root shows
//   `--surface-page` (the warm canvas); origin and destination are each their own
//   `--surface-elevated` card with `--r-default` radius and `--shadow-default`. The
//   GAP between the two cards (`--space-3`) is the seam, and the draggable handle
//   lives IN that gap (same smooth pointer logic, just repositioned). No flush
//   panes, no center divider stripe, no card border — the shadow + gap do the work.
//
// @lore AM5 round-3: the old design was two flush panes split by a 5px divider
// stripe on a single bordered surface. The founder asked for the established
// layering instead — two rounded white cards floating on the canvas, the gap as
// the seam. Drag + icon controls were explicitly KEPT (only the surface treatment
// changed). If you "simplify" back to one bordered surface you've regressed it.
//
// Presentational — props in, drag state is local UI state, callbacks are noops.
// Production wiring (persistence of dividerRatio, where it mounts, reconciling
// chat+review onto it) is the architect's / builder's job.

import { type JSX, useRef, useState } from "react";

export type FoldMode = "fold-back" | "split" | "full";

export interface SplitViewProps {
	origin: JSX.Element;
	destination: JSX.Element;
	mode: FoldMode;
	dividerRatio: number; // 0..1 — origin's share in `split`
	onModeChange?: (mode: FoldMode) => void;
	onRatioChange?: (ratio: number) => void;
	/** @lore AM5 T6: per-surface persistence key — web composes SplitView + useUiPreference(surfaceKey, default) to persist the divider ratio in localStorage. SplitView itself stays presentational; this prop is informational for the stories viewer only. */
	surfaceKey?: string;
	compact?: boolean;
	originLabel?: string;
}

// ── Icons (inline, currentColor) — the icon mode controls ────────────────────
function ExpandIcon(): JSX.Element {
	// expand-to-full: arrows pushing outward
	return (
		<svg
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M15 3h6v6" />
			<path d="M9 21H3v-6" />
			<path d="M21 3l-7 7" />
			<path d="M3 21l7-7" />
		</svg>
	);
}

function CollapseIcon(): JSX.Element {
	// collapse full → split: arrows pulling inward
	return (
		<svg
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M4 14h6v6" />
			<path d="M20 10h-6V4" />
			<path d="M14 10l7-7" />
			<path d="M3 21l7-7" />
		</svg>
	);
}

function CloseIcon(): JSX.Element {
	// fold-back: dismiss the destination half
	return (
		<svg
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}

function ControlButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick?: () => void;
	children: JSX.Element;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[color-mix(in_oklab,var(--surface-page)_80%,transparent)] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:[outline-offset:1px]"
		>
			{children}
		</button>
	);
}

/**
 * The shared fold container. Owns ONLY the split + divider + contextual controls.
 * Layout extracted from chat's proportional `flex-row` split (Conversations.tsx).
 *
 * @lore AM5: the existing DS `Fold.tsx` is an unrelated disclosure ("Show")
 * component — a name collision the architect resolves (SplitView vs Fold, O7).
 */
export function SplitView({
	origin,
	destination,
	mode,
	dividerRatio,
	onModeChange,
	onRatioChange,
	compact = false,
	originLabel = "previous view",
}: SplitViewProps): JSX.Element {
	const rootRef = useRef<HTMLDivElement>(null);
	const [ratio, setRatio] = useState(dividerRatio);
	const [dragging, setDragging] = useState(false);

	function startDrag(e: React.PointerEvent): void {
		e.preventDefault();
		setDragging(true);
		const root = rootRef.current;
		if (!root) return;
		const move = (ev: PointerEvent): void => {
			const rect = root.getBoundingClientRect();
			const next = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
			setRatio(next);
			onRatioChange?.(next);
		};
		const up = (): void => {
			setDragging(false);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}

	function resizeByKeyboard(e: React.KeyboardEvent): void {
		if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
		e.preventDefault();
		const next = Math.min(0.8, Math.max(0.2, ratio + (e.key === "ArrowRight" ? 0.05 : -0.05)));
		setRatio(next);
		onRatioChange?.(next);
	}

	const showOrigin = mode !== "full";
	const showDest = mode !== "fold-back";
	const isSplit = mode === "split";
	const compactDestination = compact && showDest;

	return (
		// Two floating layers on the warm page canvas. The ROOT is the page surface
		// (`--surface-page`) — NOT a single divided pane. `--space-3` padding +
		// `gap-[var(--space-3)]` set the canvas margin and the inter-card seam.
		<div
			ref={rootRef}
			data-ds-component="split-view"
			data-ds-tier="2"
			data-ds-source="design-system"
			className="relative flex h-full w-full flex-row gap-[var(--space-3)] overflow-hidden bg-[var(--surface-page)] p-[var(--space-3)]"
			data-fold-mode={mode}
		>
			{showOrigin ? (
				// Origin = its own elevated rounded card floating on the canvas.
				// `--surface-elevated` + `--r-default` + `--shadow-default` (the warm
				// card shadow) — no border; the shadow gives it tactile lift. Scrolls
				// its own content. In `full` the origin is hidden entirely.
				<div
					hidden={compactDestination}
					className="flex min-w-0 flex-col overflow-auto rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]"
					style={{
						flexGrow: isSplit ? 0 : 1,
						flexBasis: isSplit ? `${ratio * 100}%` : "100%",
					}}
				>
					{origin}
				</div>
			) : null}

			{isSplit && !compact ? (
				// The draggable SEAM — lives IN the gap between the two cards (the gap
				// IS the separator now). Transparent track over the canvas; a centered
				// grip pill marks it. Same smooth pointer logic as before, just
				// repositioned into the inter-card gap. Negative margins let the hit
				// area span the full `--space-3` gap without widening the layout.
				<div
					role="separator"
					tabIndex={0}
					aria-label="Resize panels"
					aria-orientation="vertical"
					aria-valuemin={20}
					aria-valuemax={80}
					aria-valuenow={Math.round(ratio * 100)}
					onPointerDown={startDrag}
					onKeyDown={resizeByKeyboard}
					className={`group relative -mx-[var(--space-3)] flex w-[var(--space-3)] shrink-0 cursor-col-resize items-center justify-center bg-transparent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]`}
				>
					<span
						className={`pointer-events-none h-[36px] w-[3px] rounded-[var(--r-pill)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] ${dragging ? "bg-[var(--accent-primary)]" : "bg-[var(--border-strong)] group-hover:bg-[var(--accent-primary)]"}`}
					/>
				</div>
			) : null}

			{showDest ? (
				// Destination = its own separate elevated rounded card. Same surface +
				// radius + shadow as origin — two distinct layers, not one split pane.
				// Contextual controls float top-right OVER this card. In `full` it
				// fills the canvas (still a rounded elevated card).
				<div
					className="relative flex min-w-0 flex-col overflow-hidden rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]"
					style={{ flexGrow: 1, flexBasis: isSplit ? `${(1 - ratio) * 100}%` : "100%" }}
				>
					{compactDestination ? (
						<div
							data-compact-return
							className="shrink-0 border-b border-[var(--border-subtle)] px-[12px] py-[6px]"
						>
							<button
								type="button"
								className="min-h-[44px] rounded-[var(--r-pill)] px-[12px] text-[13px] font-medium text-[var(--accent-deep)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
								onClick={() => onModeChange?.("fold-back")}
							>
								Back to {originLabel}
							</button>
						</div>
					) : null}
					{/* Contextual mode controls — destination (right) card only.
					    split → [expand-to-full, fold-back];  full → [collapse-to-split].
					    No "fold to split" affordance is shown when already full. */}
					{!compactDestination ? (
						<div className="absolute right-[12px] top-[12px] z-10 flex items-center gap-[6px]">
							{isSplit ? (
								<>
									<ControlButton label="Expand to full" onClick={() => onModeChange?.("full")}>
										<ExpandIcon />
									</ControlButton>
									<ControlButton label="Fold back" onClick={() => onModeChange?.("fold-back")}>
										<CloseIcon />
									</ControlButton>
								</>
							) : (
								<ControlButton label="Collapse to split" onClick={() => onModeChange?.("split")}>
									<CollapseIcon />
								</ControlButton>
							)}
						</div>
					) : null}
					<div className="min-h-0 flex-1 overflow-auto">{destination}</div>
				</div>
			) : null}
		</div>
	);
}

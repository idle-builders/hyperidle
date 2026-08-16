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
// Founder round-3 fix — TWO SURFACES, not a divided surface or nested cards:
//   In split mode, origin and destination are sibling elevated cards. The root is
//   transparent and adds no inset, so the app layout's background shows through
//   their gap. In one-pane modes the wrapper adds no card chrome and inherits the
//   shell's normal single surface. No divider stripe or extra canvas layer.
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
			className="border-width-thin inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-pill)] border-[var(--border-default)] bg-[color-mix(in_oklab,var(--surface-page)_80%,transparent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:[outline-offset:1px]"
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

	function startDrag(e: React.PointerEvent): void {
		e.preventDefault();
		const root = rootRef.current;
		if (!root) return;
		const move = (ev: PointerEvent): void => {
			const rect = root.getBoundingClientRect();
			const next = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
			setRatio(next);
			onRatioChange?.(next);
		};
		const up = (): void => {
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
	const separatePaneSurfaces = isSplit && !compact;
	const paneSurfaceClass = separatePaneSurfaces
		? "rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]"
		: "";

	return (
		// The root only arranges the panes. The app shell owns the available space.
		<div
			ref={rootRef}
			data-ds-component="split-view"
			data-ds-tier="2"
			data-ds-source="design-system"
			className="relative flex h-full w-full flex-row gap-[var(--space-3)] overflow-hidden bg-transparent"
			data-fold-mode={mode}
		>
			{showOrigin ? (
				// @lore UI-122: origin pane uses overflow-hidden on the rounded card wrapper
				// and overflow-auto on the inner scroll container — same as destination.
				// overflow-auto alone does not clip child backgrounds at border-radius in
				// Chromium scroll containers, so row hover/selected backgrounds leaked
				// past the card's rounded corners (white corner notches).
				<div
					hidden={compactDestination}
					className={`flex min-w-0 flex-col overflow-hidden ${paneSurfaceClass}`}
					style={{
						flexGrow: isSplit ? 0 : 1,
						flexBasis: isSplit ? `${ratio * 100}%` : "100%",
					}}
				>
					<div className="min-h-0 flex-1 overflow-auto">{origin}</div>
				</div>
			) : null}

			{isSplit && !compact ? (
				// Invisible resize target in the gap; the gap itself separates surfaces.
				<hr
					tabIndex={0}
					aria-label="Resize panels"
					aria-orientation="vertical"
					aria-valuemin={20}
					aria-valuemax={80}
					aria-valuenow={Math.round(ratio * 100)}
					onPointerDown={startDrag}
					onKeyDown={resizeByKeyboard}
					className="relative -mx-[var(--space-3)] w-[var(--space-3)] shrink-0 cursor-col-resize border-none bg-transparent focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
				/>
			) : null}

			{showDest ? (
				<div
					className={`relative flex min-w-0 flex-col overflow-hidden ${paneSurfaceClass}`}
					style={{ flexGrow: 1, flexBasis: isSplit ? `${(1 - ratio) * 100}%` : "100%" }}
				>
					{compactDestination ? (
						<div
							data-compact-return
							className="border-b-[var(--bw-thin)] shrink-0  border-[var(--border-subtle)] px-[12px] py-[6px]"
						>
							<button
								type="button"
								className="type-control min-h-[44px] rounded-[var(--r-pill)] px-[12px]   text-[var(--accent-deep)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
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

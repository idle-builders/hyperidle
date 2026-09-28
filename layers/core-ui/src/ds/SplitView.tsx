import { type JSX, useRef, useState } from "react";

export type FoldMode = "fold-back" | "split" | "full";

export interface SplitViewProps {
	origin: JSX.Element;
	destination: JSX.Element;
	mode: FoldMode;
	dividerRatio: number; // 0..1 — origin's share in `split`
	onModeChange?: (mode: FoldMode) => void;
	onRatioChange?: (ratio: number) => void;
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
							className="border-width-thin-b shrink-0  border-[var(--border-subtle)] px-[12px] py-[6px]"
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

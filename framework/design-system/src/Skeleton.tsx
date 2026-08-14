/**
 * Skeleton loaders for list and card shapes.
 *
 * @lore J8 AC: loading states should mirror the shape of the eventual
 * content (list skeletons for lists, card skeletons for cards). These
 * primitives use a custom pulse animation matching the HTML reference.
 * Each wrapper carries `role="status"` + `aria-label` so screen readers
 * announce the loading context rather than a pile of anonymous boxes.
 */
import type { JSX } from "react";
import { dsProps } from "./ds-attrs";

export interface SkeletonListProps {
	rows?: number;
	ariaLabel: string;
	dataTestId?: string;
}

const DEFAULT_ROWS = 3;

/**
 * Shared Tailwind classes for skeleton bars matching the HTML `.skeleton` class.
 *
 * @lore Uses px-based values (h-[32px], gap-[8px], etc.) instead of rem-based
 * Tailwind utilities (h-8, gap-2) because the design system sets root font-size
 * to 14px, making 1rem = 14px instead of the browser default 16px. The HTML
 * reference uses hardcoded pixel values, so we must match exactly.
 */
const SKELETON_BAR =
	"bg-[var(--surface-container)] rounded-[var(--r-default)] animate-[skeleton-pulse_1.8s_ease-in-out_infinite]";

export interface SkeletonProps {
	/** Bar width (CSS length or %). Default "100%". */
	width?: string;
	/** Bar height (CSS length). Default "32px". */
	height?: string;
	/** Required so screen readers announce the loading context. */
	ariaLabel: string;
	className?: string;
	dataTestId?: string;
}

/**
 * Single skeleton bar — AI5 E1.
 *
 * @lore AI5: BlockRefEmbed + ArtifactThreadsSummary hand-rolled single
 * `animate-pulse` bars. This export reuses the shared SKELETON_BAR
 * (the `--accent`-free `skeleton-pulse` animation), giving them one
 * loading family per AC3. NOT `animate-pulse` (Tailwind's default).
 */
export function Skeleton({
	width = "100%",
	height = "32px",
	ariaLabel,
	className = "",
	dataTestId,
}: SkeletonProps): JSX.Element {
	return (
		<div
			{...dsProps("Skeleton", "2")}
			role="status"
			aria-label={ariaLabel}
			data-testid={dataTestId ?? "skeleton"}
			/*
			 * @lore AI5 review WARNING-1: dimensions go through inline `style`, not
			 * interpolated `h-[${height}]`/`w-[${width}]` arbitrary Tailwind classes.
			 * Tailwind's JIT only emits CSS for *literal* class strings it can scan;
			 * a runtime-interpolated arbitrary value (e.g. width="50%") would render
			 * a zero-dimension bar. Inline style matches Avatar/SearchField's pattern
			 * for dynamic dims and delivers the arbitrary dims the prop API promises.
			 */
			style={{ width, height }}
			className={`motion-loading ${`${SKELETON_BAR} ${className}`}`}
		/>
	);
}

export function SkeletonList({
	rows = DEFAULT_ROWS,
	ariaLabel,
	dataTestId,
}: SkeletonListProps): JSX.Element {
	return (
		<div
			{...dsProps("SkeletonList", "2")}
			role="status"
			aria-label={ariaLabel}
			data-testid={dataTestId ?? "skeleton-list"}
			/*
			 * @lore K11: row height + gap consume density tokens per
			 * density-audit.md § 3.2.9 (Skeleton-must-mirror-target rule —
			 * Principle 6). Row-h matches the eventual list-row height so
			 * the loading state does not visually pop when content arrives.
			 */
			className="flex flex-col gap-[12px]"
		>
			{Array.from({ length: rows }).map((_, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-count placeholder rows.
					key={i}
					data-testid="skeleton-row"
					className={`motion-loading ${`${SKELETON_BAR} h-[42px] w-full`}`}
				/>
			))}
		</div>
	);
}

export interface SkeletonCardProps {
	ariaLabel: string;
	dataTestId?: string;
}

export function SkeletonCard({ ariaLabel, dataTestId }: SkeletonCardProps): JSX.Element {
	return (
		<div
			{...dsProps("SkeletonCard", "2")}
			role="status"
			aria-label={ariaLabel}
			data-testid={dataTestId ?? "skeleton-card"}
			/*
			 * @lore K11: outer pad → --density-card-pad, inner gap →
			 * --density-card-gap per density-audit.md § 3.2.10 (mirrors
			 * BetCard / TaskCard / PitchCard). Inner bar heights stay
			 * literal — abstract content placeholders not subject to the
			 * type scale.
			 */
			className="flex flex-col gap-[6px] bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[18px]"
		>
			<div className={`motion-loading ${`${SKELETON_BAR} h-[20px] w-[66%]`}`} />
			<div className={`motion-loading ${`${SKELETON_BAR} h-[16px] w-full`}`} />
			<div className={`motion-loading ${`${SKELETON_BAR} h-[16px] w-[83%]`}`} />
			<div className={`motion-loading ${`${SKELETON_BAR} h-[16px] w-[75%]`}`} />
		</div>
	);
}

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
	"bg-[var(--surface-5)] rounded-[var(--r2)] animate-[skeleton-pulse_1.8s_ease-in-out_infinite]";

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
			className="flex flex-col gap-[8px]"
		>
			{Array.from({ length: rows }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed-count placeholder rows.
				<div key={i} data-testid="skeleton-row" className={`${SKELETON_BAR} h-[32px] w-full`} />
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
			className="flex flex-col gap-[8px] bg-[var(--surface-3)] rounded-[var(--r2)] p-[12px]"
		>
			<div className={`${SKELETON_BAR} h-[20px] w-[66%]`} />
			<div className={`${SKELETON_BAR} h-[16px] w-full`} />
			<div className={`${SKELETON_BAR} h-[16px] w-[83%]`} />
			<div className={`${SKELETON_BAR} h-[16px] w-[75%]`} />
		</div>
	);
}

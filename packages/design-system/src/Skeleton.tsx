/**
 * Skeleton loaders for list and card shapes.
 *
 * @lore J8 AC: loading states should mirror the shape of the eventual
 * content (list skeletons for lists, card skeletons for cards). These
 * primitives wrap DaisyUI's `skeleton` utility so the visual language stays
 * consistent with the rest of the theme. Each wrapper carries
 * `role="status"` + `aria-label` so screen readers announce the loading
 * context rather than a pile of anonymous boxes.
 */
import type { JSX } from "react";

export interface SkeletonListProps {
	rows?: number;
	ariaLabel: string;
	dataTestId?: string;
}

const DEFAULT_ROWS = 3;

export function SkeletonList({
	rows = DEFAULT_ROWS,
	ariaLabel,
	dataTestId,
}: SkeletonListProps): JSX.Element {
	return (
		<div
			role="status"
			aria-label={ariaLabel}
			data-testid={dataTestId ?? "skeleton-list"}
			className="flex flex-col gap-2"
		>
			{Array.from({ length: rows }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed-count placeholder rows.
				<div key={i} data-testid="skeleton-row" className="skeleton h-8 w-full" />
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
			role="status"
			aria-label={ariaLabel}
			data-testid={dataTestId ?? "skeleton-card"}
			className="flex flex-col gap-2 bg-base-200 rounded p-3"
		>
			<div className="skeleton h-5 w-2/3" />
			<div className="skeleton h-4 w-full" />
			<div className="skeleton h-4 w-5/6" />
			<div className="skeleton h-4 w-3/4" />
		</div>
	);
}

// @lore: skeleton shape mirrors eventual content (list→list, card→card); custom pulse animation; role=status + aria-label required
import type { JSX } from "react";
import { dsProps } from "./ds-attrs";

export interface SkeletonListProps {
	rows?: number;
	ariaLabel: string;
	dataTestId?: string;
}

const DEFAULT_ROWS = 3;

// @lore: px-based values not rem-based — root font-size 14px makes 1rem=14px; rem utilities compute wrong vs the HTML reference
const SKELETON_BAR = "bg-[var(--surface-container)] rounded-[var(--r-default)]";

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

// @lore: use SKELETON_BAR (skeleton-pulse animation) not animate-pulse (Tailwind default) — skeleton-pulse has no --accent tint
export function Skeleton({
	width = "100%",
	height = "32px",
	ariaLabel,
	className = "",
	dataTestId,
}: SkeletonProps): JSX.Element {
	return (
		<div
			data-az16-profile="loading"
			{...dsProps("Skeleton", "2")}
			role="status"
			aria-label={ariaLabel}
			data-testid={dataTestId ?? "skeleton"}
			/* @lore: inline style not Tailwind — JIT emits CSS only for literal strings; runtime-interpolated value renders zero dimension */
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
			/* @lore: row height matches eventual list-row height — skeleton must mirror target so content arrival has no visual pop */
			className="flex flex-col gap-[12px]"
		>
			{Array.from({ length: rows }).map((_, i) => (
				<div
					data-az16-profile="loading"
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
			/* @lore: outer pad/gap mirrors BetCard/TaskCard; inner bar heights stay literal — abstract placeholders not subject to type scale */
			className="flex flex-col gap-[6px] bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[18px]"
		>
			<div
				data-az16-profile="loading"
				className={`motion-loading ${`${SKELETON_BAR} h-[20px] w-[66%]`}`}
			/>
			<div className={`motion-loading ${`${SKELETON_BAR} h-[16px] w-full`}`} />
			<div className={`motion-loading ${`${SKELETON_BAR} h-[16px] w-[83%]`}`} />
			<div className={`motion-loading ${`${SKELETON_BAR} h-[16px] w-[75%]`}`} />
		</div>
	);
}

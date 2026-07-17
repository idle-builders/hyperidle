/**
 * Avatar — Tier 0 foundation primitive.
 *
 * Displays user or agent initials in a round pill. Three sizes (sm/md/lg).
 * Agent variant uses forest green accent styling.
 *
 * @lore W2: Tier 0 primitive. No DaisyUI — custom CSS matching Avatar.html.
 * AvatarGroup uses React.cloneElement to inject size="sm" into children when
 * small=true, so callers can pass any size and the group overrides it.
 * @lore S3/W2: Button uses forwardRef; Avatar does not (no focus management needed).
 */

import { Children, cloneElement, isValidElement, type JSX, type ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";

export interface AvatarProps {
	initials: string;
	size?: "sm" | "md" | "lg";
	agent?: boolean;
	className?: string;
}

export interface AvatarGroupProps {
	children?: ReactNode;
	small?: boolean;
	className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
	sm: "h-[28px] w-[28px] text-[10px]",
	md: "h-[36px] w-[36px] text-[12px]",
	lg: "h-[48px] w-[48px] text-[13px]",
};

export function Avatar({
	initials,
	size = "md",
	agent = false,
	className = "",
}: AvatarProps): JSX.Element {
	const sizeClass = SIZE_CLASSES[size];
	const colorClass = agent
		? "bg-[var(--accent-primary-dim)] border-[var(--accent-primary)] text-[var(--accent-primary)]"
		: "bg-[var(--surface-page)] border-[var(--border-default)] text-[var(--text-secondary)]";

	return (
		<div
			{...dsProps("Avatar", "0")}
			className={`inline-flex items-center justify-center rounded-full border-[1.5px] font-semibold shrink-0 ${sizeClass} ${colorClass} ${className}`}
		>
			{initials}
		</div>
	);
}

export function AvatarGroup({
	children,
	small = false,
	className = "",
}: AvatarGroupProps): JSX.Element {
	// @lore W2 C2: cloneElement injects size="sm" into Avatar children when small=true.
	// CSS parent-context override is not possible with Tailwind, so we propagate
	// size via React composition instead.
	const items = Children.map(children, (child) => {
		if (!isValidElement(child)) return child;
		return small ? cloneElement(child as React.ReactElement<AvatarProps>, { size: "sm" }) : child;
	});

	const overlapClass = small ? "-ml-[6px]" : "-ml-[8px]";

	return (
		<div {...dsProps("AvatarGroup", "0")} className={`flex flex-row ${className}`}>
			{Children.map(items, (item, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: React.Children API exposes no stable id; avatar group order is stable (static member list)
				<div
					key={i}
					className={`${i > 0 ? overlapClass : ""} ring-[2px] ring-[var(--surface-elevated)] rounded-full`}
				>
					{item}
				</div>
			))}
		</div>
	);
}

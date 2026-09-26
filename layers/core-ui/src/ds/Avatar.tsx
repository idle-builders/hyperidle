/**
 * Avatar — Tier 0 foundation primitive.
 *
 * Displays user or agent initials in a round pill. Three sizes (sm/md/lg).
 * Agent variant uses forest green accent styling.
 *
 * @lore W2: Tier 0 primitive. No DaisyUI — custom CSS matching Avatar.html.
 * @lore S3/W2: Button uses forwardRef; Avatar does not (no focus management needed).
 */

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface AvatarProps {
	initials: string;
	size?: "sm" | "md" | "lg";
	agent?: boolean;
	className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
	sm: "type-avatar-initial--sm h-[28px] w-[28px]",
	md: "type-avatar-initial--md h-[36px] w-[36px]",
	lg: "type-avatar-initial--lg h-[48px] w-[48px]",
};

export function Avatar({
	initials,
	size = "md",
	agent = false,
	className = "",
}: AvatarProps): JSX.Element {
	const sizeClass = SIZE_CLASSES[size];
	const colorClass = agent
		? "bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]"
		: "bg-[var(--surface-page)] border-[var(--border-default)] text-[var(--text-secondary)]";

	return (
		<div
			data-az16-profile="avatar-initial"
			{...dsProps("Avatar", "0")}
			className={`type-avatar-initial ${`inline-flex items-center justify-center rounded-[var(--r-pill)] overflow-hidden  shrink-0 ${sizeClass} ${colorClass} ${className}`}`}
		>
			{initials}
		</div>
	);
}

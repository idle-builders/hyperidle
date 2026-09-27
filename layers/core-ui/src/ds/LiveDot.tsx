import type { JSX } from "react";

export interface LiveDotProps {
	/**
	 * `"primary"` (default) is the original brand-accent pulse. `"secondary"`
	 * is the --accent-secondary (orange) "in progress" pulse several running/
	 * elapsed-time indicators across core-ui need — a color LiveDot didn't
	 * expose before the control/chip migration fix (maintainer decision,
	 * 2026-09-26).
	 */
	tone?: "primary" | "secondary";
}

const TONE_CLASS: Record<NonNullable<LiveDotProps["tone"]>, string> = {
	primary: "bg-[var(--accent-primary)]",
	secondary: "bg-[var(--accent-secondary)]",
};

/**
 * Promoted from WorkTask.tsx and TaskSheet.tsx where identical
 * inline implementations existed. The @lore AF12 comment asked for this promotion.
 *
 * @lore AI4: Two identical LiveDot inline components existed in WorkTask.tsx and
 * TaskSheet.tsx. Both had the exact same body. Promoted to the design system as
 * the single source of truth for the live-activity pulse signal.
 *
 * @lore visual-parity-audit D-30: LiveDot promoted to design system; html/LiveDot.html
 * added as dual-rep reference.
 */
export function LiveDot({ tone = "primary" }: LiveDotProps): JSX.Element {
	return (
		<span
			data-az16-profile="activity"
			aria-hidden="true"
			className={`motion-activity inline-block w-[6px] h-[6px] rounded-[var(--r-pill)] shrink-0 ${TONE_CLASS[tone]}`}
		/>
	);
}

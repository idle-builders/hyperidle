import type { JSX } from "react";

/**
 * AI4 Task 5: Promoted from WorkTask.tsx and TaskSheet.tsx where identical
 * inline implementations existed. The @lore AF12 comment asked for this promotion.
 *
 * @lore AI4: Two identical LiveDot inline components existed in WorkTask.tsx and
 * TaskSheet.tsx. Both had the exact same body. Promoted to the design system as
 * the single source of truth for the live-activity pulse signal.
 *
 * @lore visual-parity-audit D-30: LiveDot promoted to design system; html/LiveDot.html
 * added as dual-rep reference.
 */
export function LiveDot(): JSX.Element {
	return (
		<span
			data-az16-profile="activity"
			aria-hidden="true"
			className="motion-activity inline-block w-[6px] h-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] shrink-0"
		/>
	);
}

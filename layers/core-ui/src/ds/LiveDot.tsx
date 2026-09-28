import type { JSX } from "react";

export interface LiveDotProps {
	/**
	 * `"primary"` (default) is the brand-accent pulse. `"secondary"` is the
	 * --accent-secondary (orange) "in progress" pulse for running/elapsed-time indicators.
	 */
	tone?: "primary" | "secondary";
}

const TONE_CLASS: Record<NonNullable<LiveDotProps["tone"]>, string> = {
	primary: "bg-[var(--accent-primary)]",
	secondary: "bg-[var(--accent-secondary)]",
};

export function LiveDot({ tone = "primary" }: LiveDotProps): JSX.Element {
	return (
		<span
			data-az16-profile="activity"
			aria-hidden="true"
			className={`motion-activity inline-block w-[6px] h-[6px] rounded-[var(--r-pill)] shrink-0 ${TONE_CLASS[tone]}`}
		/>
	);
}

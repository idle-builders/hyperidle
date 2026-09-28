import type { JSX } from "react";

// @lore: RowDot is static + tone-keyed; LiveDot is pulsing accent for live-activity — do NOT copy LiveDot markup or animate-pulse class

export type RowTone = "success" | "warning" | "error" | "info" | "neutral";

export interface RowDotProps {
	tone: RowTone;
	/**
	 * When present → role="img" + aria-label so screen readers convey the status.
	 * When absent → aria-hidden (decorative only, label provided elsewhere).
	 */
	label?: string;
	/**
	 * Optional tooltip text (HTML title attribute) — shows on hover.
	 * Used alongside label when both hover and SR accessibility are needed.
	 */
	title?: string;
}

// @lore: TONE_COLOR exported — consumers needing a tone→color ladder reuse this instead of forking; RowDot is presentation, TONE_COLOR is data
export const TONE_COLOR: Record<RowTone, string> = {
	success: "var(--status-success)",
	warning: "var(--status-warning)",
	error: "var(--status-error)",
	info: "var(--status-info)",
	neutral: "var(--text-tertiary)",
};

export function RowDot({ tone, label, title }: RowDotProps): JSX.Element {
	const color = TONE_COLOR[tone];

	if (label !== undefined) {
		return (
			<span
				role="img"
				aria-label={label}
				title={title}
				className="w-[6px] h-[6px] rounded-[var(--r-pill)] shrink-0 inline-block"
				style={{ background: color }}
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			title={title}
			className="w-[6px] h-[6px] rounded-[var(--r-pill)] shrink-0 inline-block"
			style={{ background: color }}
		/>
	);
}

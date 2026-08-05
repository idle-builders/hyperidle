import type { JSX } from "react";

/**
 * AG6: Static 6px status dot — canonical tone-keyed indicator for list rows.
 *
 * @lore AG6: Justified-distinct from LiveDot (AI4). LiveDot is a pulsing
 * accent dot for live-activity signals. RowDot is a static, tone-keyed dot
 * for status (health, routine state, notification urgency). DO NOT copy
 * LiveDot markup or its animate-pulse class.
 */

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

const TONE_COLOR: Record<RowTone, string> = {
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
				className="w-[6px] h-[6px] rounded-full shrink-0 inline-block"
				style={{ background: color }}
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			title={title}
			className="w-[6px] h-[6px] rounded-full shrink-0 inline-block"
			style={{ background: color }}
		/>
	);
}

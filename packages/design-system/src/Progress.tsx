/**
 * Progress — Tier 0 foundation primitive.
 *
 * Animated progress bar. Green (accent-primary) or amber (accent-secondary).
 * Optional label row with percentage display.
 *
 * @lore W2: No DaisyUI — custom CSS per Progress.html.
 * Width transition uses --motion-slow (450ms) for smooth fill animation.
 */

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ProgressProps {
	value: number;
	label?: string;
	variant?: "green" | "amber";
}

export function Progress({ value, label, variant = "green" }: ProgressProps): JSX.Element {
	const clampedValue = Math.max(0, Math.min(100, value));
	const fillClass =
		variant === "amber" ? "bg-[var(--accent-secondary)]" : "bg-[var(--accent-primary)]";

	return (
		<div {...dsProps("Progress", "0")} className="flex flex-col gap-[6px]">
			{label && (
				<div className="flex items-center justify-between">
					<span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
					<span className="text-[12px] font-mono text-[var(--text-tertiary)]">{clampedValue}%</span>
				</div>
			)}
			<div className="h-[8px] w-full bg-[var(--surface-container)] rounded-full overflow-hidden">
				<div
					className={`h-full rounded-full transition-[width] duration-[var(--motion-slow)] ease-[var(--motion-ease)] ${fillClass}`}
					style={{ width: `${clampedValue}%` }}
					role="progressbar"
					aria-valuenow={clampedValue}
					aria-valuemin={0}
					aria-valuemax={100}
				/>
			</div>
		</div>
	);
}

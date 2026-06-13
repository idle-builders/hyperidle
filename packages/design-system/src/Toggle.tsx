/**
 * Toggle — Tier 0 foundation primitive.
 *
 * Spring-animated toggle with --easing-expressive thumb motion.
 * Label + optional description.
 *
 * @lore W2: No DaisyUI — custom CSS per Toggle.html.
 * The signature spring overshoot uses --easing-expressive: cubic-bezier(0.34, 1.56, 0.64, 1).
 * @lore W2 hearth-internal-padding: internal toggle spacing (2px between label/description)
 * is sub-grid. AQ-001 exemption for sub-element gaps inside toggle label stacks.
 */

// hearth-internal-padding

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ToggleProps {
	on?: boolean;
	label: string;
	description?: string;
	onChange?: (on: boolean) => void;
	disabled?: boolean;
}

export function Toggle({
	on = false,
	label,
	description,
	onChange,
	disabled = false,
}: ToggleProps): JSX.Element {
	return (
		<label
			{...dsProps("Toggle", "0")}
			className={`flex items-start gap-[9px] cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
		>
			{/* Track */}
			<button
				type="button"
				role="switch"
				aria-checked={on}
				aria-label={label}
				disabled={disabled}
				onClick={() => onChange?.(!on)}
				className={[
					"relative inline-flex shrink-0 h-[24px] w-[44px] items-center rounded-full",
					"border-[1.5px] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
					"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]",
					on
						? "bg-[var(--accent-primary)] border-[var(--accent-primary)]"
						: "bg-[var(--border-default)] border-[var(--border-default)]",
				].join(" ")}
			>
				{/* Thumb */}
				<span
					className={[
						"absolute top-[2px] h-[18px] w-[18px] rounded-full",
						"bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]",
						"transition-transform",
						"duration-[var(--motion-fast)]",
						on ? "translate-x-[22px]" : "translate-x-[2px]",
					].join(" ")}
					style={{
						transitionTimingFunction: "var(--easing-expressive)",
					}}
				/>
			</button>
			{/* Text */}
			<div className="flex flex-col" style={{ gap: "2px" }}>
				<span className="text-[13px] font-medium text-[var(--text-primary)] leading-[1.25]">
					{label}
				</span>
				{description && (
					<span className="text-[12px] text-[var(--text-tertiary)] leading-[1.55]">
						{description}
					</span>
				)}
			</div>
		</label>
	);
}

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
	/**
	 * AM4: When true, the label is rendered as sr-only (visually hidden) and no
	 * adjacent text is shown. The `label` prop is still required for a11y — it becomes
	 * the aria-label on the track button. Reusable for any settings row that toggles
	 * without adjacent text (clears the 2+-context bar; founder minor decision AM4).
	 *
	 * @lore AM4: Folded into DS Toggle as a reusable variant rather than hand-rolled
	 * per-component. The label-less track has identical visual + a11y contract (role="switch",
	 * spring thumb, --accent-primary track) as the labeled variant. The sr-only label
	 * satisfies WCAG 2.1 AA (AQ-010). Do NOT ship inline copies — use this prop.
	 */
	labelHidden?: boolean;
	description?: string;
	onChange?: (on: boolean) => void;
	disabled?: boolean;
}

export function Toggle({
	on = false,
	label,
	labelHidden = false,
	description,
	onChange,
	disabled = false,
}: ToggleProps): JSX.Element {
	// Label-hidden variant: inline button + sr-only span for a11y (AM4)
	// @lore AM4: button is inlined (not extracted to a variable) because biome's
	// noLabelWithoutControl rule uses static analysis and can't follow JSX variable refs.
	// Extracting `track` caused the default variant's <label> to fail the lint rule.
	if (labelHidden) {
		return (
			<span
				{...dsProps("Toggle", "0")}
				data-variant="label-hidden"
				className={`inline-flex items-center ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
			>
				<button
					type="button"
					role="switch"
					aria-checked={on}
					aria-label={label}
					disabled={disabled}
					onClick={() => onChange?.(!on)}
					className={[
						"relative inline-flex shrink-0 h-[24px] w-[44px] items-center rounded-[var(--r-pill)]",
						"",
						"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
						on
							? "bg-[var(--accent-primary)] border-[var(--accent-primary)]"
							: "bg-[var(--border-default)] border-[var(--border-default)]",
					].join(" ")}
				>
					{/* Thumb */}
					<span
						className={`motion-spring ${[
							"absolute top-[2px] h-[18px] w-[18px] rounded-[var(--r-pill)]",
							"bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]",
							"",
							"",
							on ? "translate-x-[22px]" : "translate-x-[2px]",
						].join(" ")}`}
					/>
				</button>
				<span className="sr-only">{label}</span>
			</span>
		);
	}

	// Default labeled variant
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
					"relative inline-flex shrink-0 h-[24px] w-[44px] items-center rounded-[var(--r-pill)]",
					"",
					"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
					on
						? "bg-[var(--accent-primary)] border-[var(--accent-primary)]"
						: "bg-[var(--border-default)] border-[var(--border-default)]",
				].join(" ")}
			>
				{/* Thumb */}
				<span
					className={`motion-spring ${[
						"absolute top-[2px] h-[18px] w-[18px] rounded-[var(--r-pill)]",
						"bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]",
						"",
						"",
						on ? "translate-x-[22px]" : "translate-x-[2px]",
					].join(" ")}`}
				/>
			</button>
			{/* Text */}
			<div className="flex flex-col" style={{ gap: "2px" }}>
				<span className="type-small   text-[var(--text-primary)] ">{label}</span>
				{description && (
					<span className="type-metadata  text-[var(--text-tertiary)] ">{description}</span>
				)}
			</div>
		</label>
	);
}

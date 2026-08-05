/**
 * Select — Tier 0 foundation primitive.
 *
 * Custom styled select with CSS arrow. Matches Input border/radius/focus styling.
 *
 * @lore W2: No DaisyUI — custom CSS per Select.html. appearance:none removes native chrome.
 * The arrow is a CSS border-trick triangle absolutely positioned.
 * @lore W2 hearth-internal-padding: select padding (10px vertical) is optically tuned.
 * @lore AG5 C3: className is forwarded to the inner <select>, NOT the wrapper div.
 * This is the ONLY way width overrides work. Tailwind stylesheet order means w-full is emitted
 * AFTER w-[88px] in the stylesheet, so last-wins would make w-full always win regardless of
 * class-attribute order. Solution: conditional w-full — omit it when caller passes a w-* token,
 * so caller's width class is the sole rule. Empirically verified against TW 3.4.19 in this repo.
 */

// hearth-internal-padding

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
	label?: string;
	options: { value: string; label: string; disabled?: boolean }[];
	/** "sm" = dense settings rows (~32px desktop, min-h-[44px] at ≤1024px). "md" = default (current chrome). */
	size?: "sm" | "md";
	/** Prepends a disabled value="" leading <option> when set. */
	placeholder?: string;
}

// hearth-internal-padding
// Select uses py-[10px] (optically tuned form padding) and pr-[40px] (arrow clearance).
// These are AQ-001 form exemptions, extracted here to avoid lint scanning inline JSX.
const SELECT_CLASS_BASE =
	"appearance-none text-[15px] px-[12px] pr-[40px] bg-[var(--surface-elevated)] border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] text-[var(--text-primary)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--motion-ease)] outline-hidden focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

// hearth-internal-padding
// "md": py-[10px] optically tuned form padding.
// "sm": py-[6px] dense row; at ≤1024px the min-h-[44px] floor enforces AQ-015 touch target.
// @lore AG5 fix-1: AQ-015 requires 44px touch target at viewport ≤ 1024px.
// Tailwind's lg: breakpoint is min-width:1024px, which applies AT 1024px.
// Use xl: (1280px+) to reduce height so the 44px floor holds up to and including 1024px.
const SELECT_SIZE: Record<NonNullable<SelectProps["size"]>, string> = {
	md: "py-[10px] min-h-[44px] xl:min-h-0",
	sm: "py-[6px] min-h-[44px] xl:min-h-[32px]",
};

/**
 * True when the caller className contains a Tailwind width utility (w-*).
 *
 * @lore AG5 fix-1: /\bw-/ false-positives on max-w-/min-w- because `-` is a
 * non-word character so \b matches the position between the `-` and the `w`.
 * Use /(?:^|\s)w-/ instead: matches `w-` only at the start of a class token,
 * not inside `max-w-` or `min-w-`.
 */
function hasWidthToken(cls: string): boolean {
	return /(?:^|\s)w-/.test(cls);
}

export function Select({
	label,
	options,
	className = "",
	id,
	size = "md",
	placeholder,
	...rest
}: SelectProps): JSX.Element {
	const selectId = id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

	// @lore AG5 C3: Conditional w-full — see file-level lore above. Do NOT add w-full when caller
	// already supplies a w-* token; the two would fight and stylesheet order determines the winner
	// (w-full wins every time). Let the caller class be sole width authority when present.
	const widthClass = hasWidthToken(className) ? "" : "w-full";
	const selectClass = `${SELECT_CLASS_BASE} ${SELECT_SIZE[size]} ${widthClass} ${className}`.trim();

	return (
		<div {...dsProps("Select", "0")} className="flex flex-col gap-[6px]">
			{label && (
				<label htmlFor={selectId} className="text-[13px] font-medium text-[var(--text-primary)]">
					{label}
				</label>
			)}
			<div className="relative">
				<select id={selectId} className={selectClass} {...rest}>
					{placeholder && (
						<option value="" disabled>
							{placeholder}
						</option>
					)}
					{options.map((opt) => (
						<option key={opt.value} value={opt.value} disabled={opt.disabled}>
							{opt.label}
						</option>
					))}
				</select>
				{/* CSS triangle arrow */}
				<span
					aria-hidden="true"
					className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-[var(--border-strong)]"
				/>
			</div>
		</div>
	);
}

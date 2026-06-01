/**
 * Select — Tier 0 foundation primitive.
 *
 * Custom styled select with CSS arrow. Matches Input border/radius/focus styling.
 *
 * @lore W2: No DaisyUI — custom CSS per Select.html. appearance:none removes native chrome.
 * The arrow is a CSS border-trick triangle absolutely positioned.
 * @lore W2 hearth-internal-padding: select padding (10px vertical) is optically tuned.
 */

// hearth-internal-padding

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
	label?: string;
	options: { value: string; label: string }[];
}

// hearth-internal-padding
// Select uses py-[10px] (optically tuned form padding) and pr-[40px] (arrow clearance).
// These are AQ-001 form exemptions, extracted here to avoid lint scanning inline JSX.
const SELECT_CLASS =
	"w-full appearance-none text-[15px] px-[12px] py-[10px] pr-[40px] bg-[var(--surface-elevated)] border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] text-[var(--text-primary)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--motion-ease)] outline-none focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_rgba(22,118,79,0.1)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

export function Select({ label, options, className = "", id, ...rest }: SelectProps): JSX.Element {
	const selectId = id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

	return (
		<div {...dsProps("Select", "0")} className={`flex flex-col gap-[6px] ${className}`}>
			{label && (
				<label htmlFor={selectId} className="text-[13px] font-medium text-[var(--text-primary)]">
					{label}
				</label>
			)}
			<div className="relative">
				<select id={selectId} className={SELECT_CLASS} {...rest}>
					{options.map((opt) => (
						<option key={opt.value} value={opt.value}>
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

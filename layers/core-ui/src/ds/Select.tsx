// @lore: className forwarded to inner <select> NOT the wrapper — only way width overrides work; conditional w-full so caller's w-* class is sole width authority

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
	"appearance-none px-[12px] pr-[40px] bg-[var(--surface-elevated)] border-width-default border-[var(--border-default)] rounded-[var(--r-default)] text-[var(--text-primary)] outline-hidden focus:border-[var(--accent-deep)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

// hearth-internal-padding
const SELECT_SIZE: Record<NonNullable<SelectProps["size"]>, string> = {
	md: "py-[10px] min-h-[44px] xl:min-h-0",
	sm: "py-[6px] min-h-[44px] xl:min-h-[32px]",
};

// @lore: /(?:^|\s)w-/ not /\bw-/ — \b matches between `-` and `w` in max-w-/min-w-, causing false-positives
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

	// @lore: omit w-full when caller supplies a w-* token — both present means stylesheet order wins (w-full always); caller must be sole width authority
	const widthClass = hasWidthToken(className) ? "" : "w-full";
	const selectClass = `${SELECT_CLASS_BASE} ${SELECT_SIZE[size]} ${widthClass} ${className}`.trim();

	return (
		<div {...dsProps("Select", "0")} className="flex flex-col gap-[6px]">
			{label && (
				<label htmlFor={selectId} className="type-small   text-[var(--text-primary)]">
					{label}
				</label>
			)}
			<div className="relative">
				<select id={selectId} className={`type-input ${selectClass}`} {...rest}>
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
				<svg
					aria-hidden="true"
					viewBox="0 0 12 8"
					className="pointer-events-none absolute right-[12px] top-1/2 h-[8px] w-[12px] -translate-y-1/2"
				>
					<path d="m1 1 5 5 5-5" fill="none" stroke="var(--border-strong)" strokeWidth="1.5" />
				</svg>
			</div>
		</div>
	);
}

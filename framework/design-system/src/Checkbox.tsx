/**
 * Checkbox — Tier 0 foundation primitive.
 *
 * Custom styled checkbox. 20×20px, 6px radius (form control, AQ-011 exempt).
 *
 * @lore W2: No DaisyUI — custom CSS per Checkbox.html.
 * 6px radius on the box is the form control exemption in AQ-011.
 * The CSS checkmark is a rotated border trick (6×10px).
 */

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface CheckboxProps {
	checked?: boolean;
	label: string;
	onChange?: (checked: boolean) => void;
	disabled?: boolean;
}

export function Checkbox({
	checked = false,
	label,
	onChange,
	disabled = false,
}: CheckboxProps): JSX.Element {
	const id = `checkbox-${label.toLowerCase().replace(/\s+/g, "-")}`;

	return (
		<label
			{...dsProps("Checkbox", "0")}
			htmlFor={id}
			className={`flex items-center gap-[9px] cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
		>
			<div className="relative shrink-0">
				<input
					id={id}
					type="checkbox"
					checked={checked}
					disabled={disabled}
					onChange={(e) => onChange?.(e.target.checked)}
					className="sr-only"
				/>
				<div
					aria-hidden="true"
					className={[
						"h-[20px] w-[20px] rounded-[6px] ",
						"",
						"flex items-center justify-center",
						checked
							? "bg-[var(--accent-primary)] border-[var(--accent-primary)]"
							: "bg-[var(--surface-elevated)] border-[var(--border-default)]",
					].join(" ")}
				>
					{checked && (
						<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[12px] w-[12px]">
							<path d="m3 8 3 3 7-7" fill="none" stroke="var(--text-on-accent)" strokeWidth="2" />
						</svg>
					)}
				</div>
			</div>
			<span className="type-small  text-[var(--text-primary)]">{label}</span>
		</label>
	);
}

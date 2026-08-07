/**
 * Input — Tier 0 foundation primitive.
 *
 * Label, hint, error states. textarea mode. Custom CSS matching Input.html.
 *
 * @lore W2: No DaisyUI — custom CSS per Input.html.
 * @lore AQ-005: Mobile inputs need ≥16px font at ≤768px to prevent iOS Safari zoom.
 * Input.html uses 15px; the responsive override adds 16px at mobile.
 * @lore W2 hearth-internal-padding: input padding (10px vertical) is optically
 * tuned, not on the 6px grid. AQ-001 form exemption applies.
 */

// hearth-internal-padding

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

/**
 * InputProps — public surface for the Input component.
 *
 * When `textarea={true}`, the inner element is a `<textarea>` and textarea-specific
 * attributes (rows, cols, onChange with HTMLTextAreaElement target) are accepted.
 * TypeScript can't express a discriminated union on a prop+rest spread cleanly, so
 * InputProps accepts the intersection: HTMLInputElement attrs ∪ HTMLTextAreaElement
 * textarea-specific attrs. Callers using textarea mode may need to cast onChange
 * when targeting HTMLTextAreaElement — the runtime element IS an HTMLTextAreaElement.
 *
 * @lore AH3 D4: `rows` was previously missing from InputProps because InputProps only
 * extended HTMLInputElement attrs. Added textarea-specific fields to the interface so
 * callers can pass `rows` without TypeScript errors. The cast in the implementation
 * is intentional (see Input.tsx line ~56).
 */
export interface InputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "rows"> {
	label?: string;
	hint?: string;
	error?: string;
	textarea?: boolean;
	/** Number of visible text rows — passed through to `<textarea rows={...}>` when textarea=true. */
	rows?: number;
}

// @lore POLISH-060 A3: AQ-015 requires touch targets ≥ 44px at ≤ 1024px.
// min-h-[44px] is the base (mobile-first); lg:min-h-[36px] relaxes on desktop
// (1024px+) so settings forms read at the right density.
const INPUT_BASE =
	"w-full text-[15px] px-[12px] py-[10px] min-h-[44px] lg:min-h-[36px] bg-[var(--surface-elevated)] border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--motion-ease)] outline-hidden focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)] disabled:opacity-50 disabled:cursor-not-allowed";

const INPUT_ERROR =
	"border-[var(--status-error)] focus:border-[var(--status-error)] focus:shadow-[0_0_0_3px_var(--status-error-dim)]";

export function Input({
	label,
	hint,
	error,
	textarea = false,
	className = "",
	id,
	rows,
	...rest
}: InputProps): JSX.Element {
	const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
	const borderClass = error ? INPUT_ERROR : "";

	return (
		<div {...dsProps("Input", "0")} className={`flex flex-col gap-[6px] ${className}`}>
			{label && (
				<label htmlFor={inputId} className="text-[13px] font-medium text-[var(--text-primary)]">
					{label}
				</label>
			)}
			{textarea ? (
				<textarea
					id={inputId}
					className={`${INPUT_BASE} ${borderClass} resize-y min-h-[80px] leading-[1.55]`}
					aria-describedby={hint ? `${inputId}-hint` : error ? `${inputId}-error` : undefined}
					aria-invalid={error ? "true" : undefined}
					rows={rows}
					{...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
				/>
			) : (
				<input
					id={inputId}
					className={`${INPUT_BASE} ${borderClass}`}
					aria-describedby={hint ? `${inputId}-hint` : error ? `${inputId}-error` : undefined}
					aria-invalid={error ? "true" : undefined}
					{...rest}
				/>
			)}
			{hint && !error && (
				<span id={`${inputId}-hint`} className="text-[12px] text-[var(--text-tertiary)]">
					{hint}
				</span>
			)}
			{error && (
				<span
					id={`${inputId}-error`}
					className="text-[12px] font-medium text-[var(--status-error)]"
				>
					{error}
				</span>
			)}
		</div>
	);
}

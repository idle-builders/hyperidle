/**
 * Input — Tier 0 foundation primitive.
 *
 * Label, hint, error states. textarea mode.
 */
// @lore: mobile font — ≥16px at ≤768px prevents iOS Safari zoom; responsive override applies at mobile
// @lore: hearth-internal-padding — input padding (10px vertical) is optically tuned, not on the 6px grid
// @lore: Input forwardRef — typed as HTMLInputElement | HTMLTextAreaElement union; which one a caller gets depends on the textarea prop

// hearth-internal-padding

import { forwardRef, type JSX } from "react";
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
 * Callers using textarea mode may need to cast onChange when targeting HTMLTextAreaElement.
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

// @lore: INPUT_SINGLE_LINE_HEIGHT — split from INPUT_BASE; textarea must not carry 36px min-h; separate const avoids cascade conflict with textarea's 80px min-h
const INPUT_BASE =
	"w-full px-[12px] py-[10px] bg-[var(--surface-elevated)] border-width-default border-[var(--border-default)] rounded-[var(--r-default)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-hidden focus:border-[var(--accent-deep)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)] disabled:opacity-50 disabled:cursor-not-allowed";

const INPUT_SINGLE_LINE_HEIGHT = "min-h-[44px] min-[1025px]:min-h-[36px]";

const INPUT_ERROR =
	"border-[var(--status-error)] focus:border-[var(--status-error)] focus:shadow-[0_0_0_3px_var(--status-error-dim)]";

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(function Input(
	{ label, hint, error, textarea = false, className = "", id, rows, ...rest },
	ref,
): JSX.Element {
	const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
	const borderClass = error ? INPUT_ERROR : "";

	return (
		<div {...dsProps("Input", "0")} className={`flex flex-col gap-[6px] ${className}`}>
			{label && (
				<label htmlFor={inputId} className="type-small   text-[var(--text-primary)]">
					{label}
				</label>
			)}
			{textarea ? (
				<textarea
					data-az16-profile="input default"
					ref={ref as React.Ref<HTMLTextAreaElement>}
					id={inputId}
					className={`type-input ${`${INPUT_BASE} ${borderClass} resize-y min-h-[80px] `}`}
					aria-describedby={hint ? `${inputId}-hint` : error ? `${inputId}-error` : undefined}
					aria-invalid={error ? "true" : undefined}
					rows={rows}
					{...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
				/>
			) : (
				<input
					data-az16-profile="input default"
					ref={ref as React.Ref<HTMLInputElement>}
					id={inputId}
					className={`type-input ${`${INPUT_BASE} ${INPUT_SINGLE_LINE_HEIGHT} ${borderClass}`}`}
					aria-describedby={hint ? `${inputId}-hint` : error ? `${inputId}-error` : undefined}
					aria-invalid={error ? "true" : undefined}
					{...rest}
				/>
			)}
			{hint && !error && (
				<span id={`${inputId}-hint`} className="type-metadata  text-[var(--text-tertiary)]">
					{hint}
				</span>
			)}
			{error && (
				<span id={`${inputId}-error`} className="type-metadata   text-[var(--status-error)]">
					{error}
				</span>
			)}
		</div>
	);
});

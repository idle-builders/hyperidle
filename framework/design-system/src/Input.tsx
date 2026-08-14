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
 * @lore AZ7 B2 (review round 1): forwardRef added — Button's docblock used to
 * say it was the only Tier 0 primitive that needed one ("no other Tier 0
 * primitive currently needs ref forwarding"). HostThreadSection's inline
 * composer needs a ref to the input for the exact reason Button's does
 * (programmatic focus: scrollIntoView + focus() when a block-reply prefill
 * arrives) and was, until this fix, the reason it stayed a hand-rolled
 * `<input>` instead of adopting this component. The ref is typed as the
 * union of both DOM element types the component can render (textarea mode
 * vs input mode) since which one a given caller gets depends on `textarea`.
 */

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
//
// @lore AZ7 review-round-2 NB-2: this height pair used to live INSIDE
// INPUT_BASE, shared by both input and textarea mode. CSS cascade order is
// determined by each utility's position in the generated stylesheet, not by
// where its class token sits in the `className` string — so textarea mode's
// own `min-h-[80px]` (appended after `${INPUT_BASE}` in the template
// literal) never actually won at ≥1024px: `lg:min-h-[36px]` still applied,
// measured on RecipientPicker's message box. Splitting the height utilities
// out of the shared base means the textarea never carries `lg:min-h-[36px]`
// at all, so there is no competing rule for `min-h-[80px]` to lose to.
const INPUT_BASE =
	"w-full px-[12px] py-[10px] bg-[var(--surface-elevated)] border-[var(--bw-default)] border-[var(--border-default)] rounded-[var(--r-default)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-hidden focus:border-[var(--accent-deep)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)] disabled:opacity-50 disabled:cursor-not-allowed";

const INPUT_SINGLE_LINE_HEIGHT = "min-h-[44px] lg:min-h-[36px]";

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

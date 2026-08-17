/**
 * L1a — `Composer` design-system component.
 *
 * Plan §7.6; approved.md §2.5. Always-rendered plain-message input.
 * Cmd/Ctrl+Enter submits. No optimistic UI — disable on submit.
 *
 * UI-062 extensions:
 *   - `leading?: ReactNode` — slot rendered to the left of the textarea
 *     (used by ConversationSurface for its insert "+" button + menu).
 *   - `iconSend?: boolean` — when true the send button renders an SVG
 *     arrow icon instead of the "Send" text label.
 *
 * @lore UI-062: ConversationSurface previously had its own hand-rolled
 * Composer. Extending with `leading` and `iconSend` consolidates to one
 * implementation in the design system without losing any affordance.
 * SessionComposer stays separate — it depends on @hyperidle/harness-capability
 * which cannot be a DS dependency.
 */

import type { InlineRef } from "@hyperidle/domain-model";
import type { JSX, KeyboardEvent, ReactNode } from "react";
import { useCallback, useState } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ComposerSubmitInput {
	text: string;
	clientKey: string;
	refs?: InlineRef[];
}

export interface ComposerProps {
	threadId: string;
	onSubmit: (input: ComposerSubmitInput) => Promise<void>;
	unresolvedReviewLink?: { onClick: () => void };
	/**
	 * Optional slot rendered to the LEFT of the textarea inside the composer row.
	 * Use for contextual controls like an insert-menu toggle button.
	 *
	 * @lore UI-062: ConversationSurface passes its "+" insert button here so
	 * the DS Composer is the single composer implementation across the app.
	 */
	leading?: ReactNode;
	/**
	 * When true the send button renders an SVG arrow icon instead of "Send" text.
	 * Use in full-surface conversations where a compact icon button fits better.
	 *
	 * @lore UI-062: ConversationSurface needs an icon send button (primary pill
	 * with arrow) to match the Hearth conversation design.
	 */
	iconSend?: boolean;
	/**
	 * Textarea placeholder text. Defaults to "Reply to thread…".
	 * Pass a contextual string (e.g. "Message Founder, Aria…") to give users a
	 * recipient hint — the affordance ConversationSurface relied on before UI-062.
	 *
	 * @lore UI-062: ConversationSurface passes participant names here so the
	 * contextual placeholder affordance ("Message X, Y…") is preserved after
	 * migrating from the hand-rolled Composer to DS Composer.
	 */
	placeholder?: string;
}

// Send arrow SVG path — used when iconSend=true.
const SEND_ICON_PATH = "M2 12L22 12M22 12L15 5M22 12L15 19";

function generateClientKey(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function Composer({
	threadId,
	onSubmit,
	unresolvedReviewLink,
	leading,
	iconSend = false,
	placeholder = "Reply to thread…",
}: ComposerProps): JSX.Element {
	const [text, setText] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = useCallback(async (): Promise<void> => {
		if (!text.trim() || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			await onSubmit({ text, clientKey: generateClientKey() });
			setText("");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Failed to send");
		} finally {
			setSubmitting(false);
		}
	}, [text, submitting, onSubmit]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>): void => {
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				e.preventDefault();
				void handleSubmit();
			}
		},
		[handleSubmit],
	);

	return (
		<div
			{...dsProps("Composer", "2")}
			className="flex flex-col gap-[6px] py-[12px] px-[24px] pb-[18px]"
			data-thread-id={threadId}
		>
			{unresolvedReviewLink ? (
				<button
					type="button"
					onClick={unresolvedReviewLink.onClick}
					// L1 step9 (Design-C4): minimum 44px touch target at viewport
					// ≤1024px (AQ-015). The `min-h-[44px]` floor honors the rule
					// without inflating the visual padding.
					className="type-control text-left  text-[var(--accent-deep)] hover:underline min-h-[44px] flex items-center focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
				>
					Unresolved review · acting required ↑
				</button>
			) : null}
			{error ? (
				<div className="type-metadata  text-[var(--status-error)]" role="alert">
					{error}
				</div>
			) : null}
			{/* W3 AC-12: data-composer-row with items-stretch so textarea and button are equal height.
			    FR-4: gap-[3px] when iconSend — compact icon button reads as attached to the input. */}
			<div
				data-composer-row
				className={`flex items-stretch ${iconSend ? "gap-[3px]" : "gap-[9px]"}`}
			>
				{leading !== undefined && leading !== null && (
					<span className="shrink-0 flex items-end">{leading}</span>
				)}
				<textarea
					data-testid="composer-textarea"
					rows={1}
					// @lore AZ7 review-round-2 NB-3: was `bg-[var(--surface-page)]` — the
					// page-canvas token used as a fill, the same Set 3 second-job
					// defect B3 already fixed on SearchField. `--surface-elevated` is
					// the closed Input set's fill (DESIGN.md: "text inputs").
					className="type-input border-width-default flex-1 min-h-[44px] resize-none bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]  border-[var(--border-default)] rounded-[var(--r-default)] px-[12px] py-[9px]  focus:outline-hidden focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus:border-[var(--accent-deep)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]"
					placeholder={placeholder}
					value={text}
					onChange={(e): void => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					disabled={submitting}
				/>
				<button
					type="button"
					aria-label={iconSend ? "Send message" : undefined}
					onClick={(): void => {
						void handleSubmit();
					}}
					disabled={submitting || !text.trim()}
					// L1 step9 (Design-C4): 44px minimum touch target.
					// U8: pill shape (r-pill) per Hearth send button spec; accent-primary background.
					className="type-control px-[12px] min-h-[44px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] self-stretch"
				>
					{iconSend ? (
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							width={15}
							height={15}
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d={SEND_ICON_PATH} />
						</svg>
					) : submitting ? (
						"Sending…"
					) : (
						"Send"
					)}
				</button>
			</div>
		</div>
	);
}

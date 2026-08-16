/**
 * L1a — `Composer` design-system component.
 *
 * Plan §7.6; approved.md §2.5. Always-rendered plain-message input.
 * Cmd/Ctrl+Enter submits. No optimistic UI — disable on submit.
 */

import type { InlineRef } from "@hyperidle/domain-model";
import type { JSX, KeyboardEvent } from "react";
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
}

function generateClientKey(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function Composer({ threadId, onSubmit, unresolvedReviewLink }: ComposerProps): JSX.Element {
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
			{/* W3 AC-12: data-composer-row with items-stretch so textarea and button are equal height */}
			<div data-composer-row className="flex items-stretch gap-[9px]">
				<textarea
					data-testid="composer-textarea"
					rows={1}
					// @lore AZ7 review-round-2 NB-3: was `bg-[var(--surface-page)]` — the
					// page-canvas token used as a fill, the same Set 3 second-job
					// defect B3 already fixed on SearchField. `--surface-elevated` is
					// the closed Input set's fill (DESIGN.md: "text inputs").
					className="type-input border-width-default flex-1 min-h-[44px] resize-none bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]  border-[var(--border-default)] rounded-[var(--r-default)] px-[12px] py-[9px]  focus:outline-hidden focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus:border-[var(--accent-deep)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]"
					placeholder="Reply to thread…"
					value={text}
					onChange={(e): void => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					disabled={submitting}
				/>
				<button
					type="button"
					onClick={(): void => {
						void handleSubmit();
					}}
					disabled={submitting || !text.trim()}
					// L1 step9 (Design-C4): 44px minimum touch target.
					// U8: pill shape (r-pill) per Hearth send button spec; accent-primary background.
					className="type-control px-[12px] min-h-[44px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] self-stretch"
				>
					{submitting ? "Sending…" : "Send"}
				</button>
			</div>
		</div>
	);
}

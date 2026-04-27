/**
 * RequestChangesComposer — L6 verdict-flow composition.
 *
 * @lore L6 (.plan-L6.md § 3.2): a shell-level modal that captures a required
 * `summary` (capped at REQUEST_CHANGES_SUMMARY_MAX) plus optional
 * line-anchored inline comments before a `request-changes` verdict commits.
 * Composer is NOT one of the 19 design-system primitives; it composes
 * DaisyUI `modal` directly.
 *
 * Keyboard contract is intentionally modal-scoped:
 *   - Cmd/Ctrl+Enter on the summary input submits when valid.
 *   - Esc on the dialog cancels.
 * Both handlers stopPropagation so they never bubble to the
 * ConversationsReview global keymap (which J4 uses for single-key pre-fill).
 *
 * @lore L6 review (adv CRIT-4 / O1) snake_case vs camelCase:
 *  - HTTP API uses snake_case (`inline_comments[].line_index`, `body`) to
 *    match the rest of the conversations route surface.
 *  - WebSocket / event-bus payload uses camelCase (`inlineComments[].lineIndex`)
 *    to match the in-process TypeScript type system.
 *  - The composer's outbound payload (`RequestChangesPayload`) is camelCase;
 *    the parent (`ConversationsReview`) maps to snake_case at the network
 *    boundary in `handleSubmit`. Storage in `responses.inline_anchor` is the
 *    snake_case JSON shape (for round-trip determinism with the API request).
 *  - This is the boundary contract; do NOT collapse.
 */
import {
	REQUEST_CHANGES_INLINE_COMMENTS_MAX,
	REQUEST_CHANGES_SUMMARY_MAX,
} from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useId, useRef, useState } from "react";

export interface InlineCommentDraft {
	/** Stable composite key referencing the diff line. `${hunkHeader}:${lineIndex}`. */
	lineKey: string;
	/** Numeric index within the flattened hunk used by the API contract (line_index). */
	lineIndex: number;
	/** Snippet of the diff line (read-only display only — not sent to the server). */
	preview: string;
	/** User-authored body. */
	body: string;
}

export interface RequestChangesPayload {
	summary: string;
	inlineComments: Array<{ lineIndex: number; body: string }>;
}

export interface RequestChangesComposerProps {
	open: boolean;
	drafts: InlineCommentDraft[];
	onChangeDraft: (lineKey: string, body: string) => void;
	onRemoveDraft: (lineKey: string) => void;
	onSubmit: (payload: RequestChangesPayload) => void;
	onCancel: () => void;
	/** Shown briefly under the footer on validation error (parent-owned). */
	errorMessage?: string;
}

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"textarea:not([disabled])",
	"select:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(",");

export function RequestChangesComposer({
	open,
	drafts,
	onChangeDraft,
	onRemoveDraft,
	onSubmit,
	onCancel,
	errorMessage,
}: RequestChangesComposerProps): JSX.Element | null {
	const dialogRef = useRef<HTMLDivElement>(null);
	const summaryRef = useRef<HTMLInputElement>(null);
	const [summary, setSummary] = useState("");
	const headingId = useId();

	// Reset internal state and focus the summary input whenever the composer
	// opens. `open` is the parent-owned visibility flag; closing it elsewhere
	// should not preserve stale text on the next open.
	useEffect(() => {
		if (open) {
			setSummary("");
			summaryRef.current?.focus();
		}
	}, [open]);

	const trimmed = summary.trim();
	const overSummaryCap = summary.length >= REQUEST_CHANGES_SUMMARY_MAX;
	const draftsAtCap = drafts.length >= REQUEST_CHANGES_INLINE_COMMENTS_MAX;
	const canSubmit =
		trimmed.length > 0 &&
		summary.length <= REQUEST_CHANGES_SUMMARY_MAX &&
		drafts.length <= REQUEST_CHANGES_INLINE_COMMENTS_MAX &&
		drafts.every((d) => d.body.trim().length > 0);

	const submit = useCallback((): void => {
		if (!canSubmit) return;
		onSubmit({
			summary: trimmed,
			inlineComments: drafts.map((d) => ({ lineIndex: d.lineIndex, body: d.body })),
		});
	}, [canSubmit, drafts, onSubmit, trimmed]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>): void => {
			// @lore L6 review (design C4): focus trap. We intercept Tab /
			// Shift+Tab and cycle inside the dialog so focus never escapes
			// to the page underneath while the modal is open.
			if (e.key === "Tab" && dialogRef.current) {
				const focusables = Array.from(
					dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
				).filter((el) => !el.hasAttribute("inert"));
				if (focusables.length === 0) {
					e.preventDefault();
					return;
				}
				const first = focusables[0];
				const last = focusables[focusables.length - 1];
				const active = document.activeElement as HTMLElement | null;
				if (e.shiftKey && active === first) {
					e.preventDefault();
					last.focus();
					return;
				}
				if (!e.shiftKey && active === last) {
					e.preventDefault();
					first.focus();
					return;
				}
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onCancel();
				return;
			}
			// Cmd/Ctrl+Enter — submit if valid.
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				e.stopPropagation();
				submit();
			}
		},
		[onCancel, submit],
	);

	if (!open) {
		return null;
	}

	return (
		<div
			ref={dialogRef}
			/*
			 * @lore L6 review (design C3): override DaisyUI's default
			 * `0.2s ease-out modal-pop` so the composer adopts the Lucid
			 * motion tokens. Inline-style is the cleanest path until the
			 * design-system layer overrides the modal keyframe globally
			 * (tracked as a follow-up). Animates only `transform` +
			 * `opacity` so `prefers-reduced-motion` collapses to instant
			 * via the tokens.css token override.
			 *
			 * @lore L6 DoD-fix: DaisyUI's `.modal.modal-open` sets
			 * `pointer-events: auto` on the full-screen wrapper, which
			 * makes the (transparent) overlay area intercept clicks on
			 * the underlying diff. The composer's contract is that the
			 * user can keep adding `+ Comment` anchors WHILE the composer
			 * is open — drafts append into the mounted modal. So we set
			 * `pointer-events: none` on the wrapper and explicitly
			 * re-enable it on the modal-box. The modal-box still owns
			 * focus + keyboard; only stray pointer-events fall through.
			 */
			style={{
				animationDuration: "var(--motion-medium)",
				animationTimingFunction: "var(--motion-ease)",
				pointerEvents: "none",
			}}
			className="modal modal-open z-50"
			role="dialog"
			aria-modal="true"
			aria-labelledby={headingId}
			onKeyDown={handleKeyDown}
		>
			{/*
			 * @lore L6 DoD-fix: anchor the modal-box to the bottom-right of
			 * the viewport instead of dead-center. The composer's contract
			 * is that the user can keep adding `+ Comment` anchors WHILE it
			 * is open. A center-positioned modal-box physically covers the
			 * diff lines underneath even with `pointer-events: none` on the
			 * wrapper, because the box itself still sits over the diff
			 * content. Bottom-right keeps the diff column visible and
			 * clickable. The wrapper still owns the focus trap + keymap;
			 * only the visual placement changed.
			 */}
			<div
				className="modal-box max-w-md p-[var(--density-card-pad)] flex flex-col gap-[var(--density-gap)]"
				style={{
					pointerEvents: "auto",
					position: "fixed",
					right: "1rem",
					bottom: "1rem",
					top: "auto",
					left: "auto",
					margin: 0,
					maxHeight: "calc(100vh - 2rem)",
				}}
			>
				<header className="flex items-center justify-between">
					<h2
						id={headingId}
						className="text-[length:var(--density-text)] font-medium text-[var(--text-hi)]"
					>
						Request changes
					</h2>
					{/*
					 * @lore L6 review (adv W2 / design W7): the counter is the
					 * ONLY visual signal that the user is approaching the cap.
					 * Replace `aria-hidden` with `aria-live="polite"` so SR
					 * users are announced "X/140" as they approach. We keep
					 * the live region quiet by only announcing on count-change
					 * (browsers handle this via the polite queue).
					 */}
					<span
						aria-live="polite"
						aria-atomic="true"
						className="text-xs font-mono text-[var(--text-lo)]"
						data-testid="summary-char-count"
					>
						{summary.length}/{REQUEST_CHANGES_SUMMARY_MAX}
					</span>
				</header>

				<label className="flex flex-col gap-1">
					<span className="text-xs uppercase tracking-wider text-[var(--text-lo)]">Summary</span>
					{/* @lore L6 AQ-005: 16px font on mobile-targeted inputs to suppress
					    iOS Safari auto-zoom. We use `text-base` (1rem = 16px). */}
					<input
						ref={summaryRef}
						type="text"
						className="input input-bordered text-base"
						aria-label="Summary"
						maxLength={REQUEST_CHANGES_SUMMARY_MAX}
						value={summary}
						onChange={(e) => setSummary(e.target.value)}
					/>
					{overSummaryCap && (
						<span role="status" className="text-xs text-error" data-testid="summary-cap-warning">
							You've reached the {REQUEST_CHANGES_SUMMARY_MAX}-character limit.
						</span>
					)}
				</label>

				{drafts.length === 0 ? (
					<p className="text-xs text-[var(--text-lo)]">
						Click + Comment in the diff to add an inline comment.
					</p>
				) : (
					<ul className="flex flex-col gap-[var(--density-gap)]">
						{drafts.map((draft) => (
							<li
								key={draft.lineKey}
								data-testid={`inline-comment-row-${draft.lineKey}`}
								/*
								 * @lore L6 review (design W3): density tokens for component
								 * internals — pad uses --density-card-pad, gap uses
								 * --density-gap, matching the outer modal-box.
								 */
								className="flex flex-col gap-[var(--density-gap)] border border-[var(--border-subtle)] p-[var(--density-card-pad)]"
							>
								<div className="flex items-center justify-between gap-[var(--density-gap)]">
									<code className="text-xs font-mono text-[var(--text-lo)] truncate">
										{`L${draft.lineIndex} · ${draft.preview.slice(0, 60)}`}
									</code>
									<button
										type="button"
										className="btn btn-xs btn-ghost"
										aria-label={`Remove comment on line ${draft.lineIndex}`}
										onClick={() => onRemoveDraft(draft.lineKey)}
									>
										Remove
									</button>
								</div>
								<textarea
									className="textarea textarea-bordered text-base min-h-[44px]"
									aria-label={`Comment on line ${draft.lineIndex}`}
									value={draft.body}
									onChange={(e) => onChangeDraft(draft.lineKey, e.target.value)}
								/>
							</li>
						))}
					</ul>
				)}

				{draftsAtCap && (
					<p
						role="status"
						className="text-xs text-[var(--text-lo)]"
						data-testid="inline-comments-cap-warning"
					>
						Maximum of {REQUEST_CHANGES_INLINE_COMMENTS_MAX} inline comments per verdict.
					</p>
				)}

				{errorMessage && (
					<p role="alert" className="text-sm text-error">
						{errorMessage}
					</p>
				)}

				<footer className="flex justify-end gap-[var(--density-gap)]">
					<button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
						Cancel
					</button>
					{/*
					 * @lore L6 review (design W2): use `btn-secondary` so the
					 * commit button matches the Request-changes verdict
					 * identity carried by the toolbar (ReviewHeader's
					 * Request-changes is `btn-secondary`). `btn-primary`
					 * read like an Approve confirmation and broke the
					 * verdict's visual contract.
					 */}
					<button
						type="button"
						className="btn btn-secondary btn-sm"
						disabled={!canSubmit}
						onClick={submit}
					>
						Submit
					</button>
				</footer>
			</div>
		</div>
	);
}

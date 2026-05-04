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
 */
import { REQUEST_CHANGES_SUMMARY_MAX } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";

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

export function RequestChangesComposer({
	open,
	drafts,
	onChangeDraft,
	onRemoveDraft,
	onSubmit,
	onCancel,
	errorMessage,
}: RequestChangesComposerProps): JSX.Element | null {
	const summaryRef = useRef<HTMLInputElement>(null);
	const [summary, setSummary] = useState("");

	// Reset internal state and focus the summary input whenever the composer
	// opens. `open` is the parent-owned visibility flag; closing it elsewhere
	// should not preserve stale text on the next open.
	useEffect(() => {
		if (open) {
			setSummary("");
			summaryRef.current?.focus();
		}
	}, [open]);

	if (!open) {
		return null;
	}

	const trimmed = summary.trim();
	const canSubmit =
		trimmed.length > 0 &&
		summary.length <= REQUEST_CHANGES_SUMMARY_MAX &&
		drafts.every((d) => d.body.trim().length > 0);

	const submit = (): void => {
		if (!canSubmit) return;
		onSubmit({
			summary: trimmed,
			inlineComments: drafts.map((d) => ({ lineIndex: d.lineIndex, body: d.body })),
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
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
	};

	return (
		<div
			className="modal modal-open z-50"
			role="dialog"
			aria-modal="true"
			aria-label="Request changes"
			onKeyDown={handleKeyDown}
		>
			<div className="modal-box max-w-xl p-[var(--density-card-pad)] flex flex-col gap-[var(--density-gap)]">
				<header className="flex items-center justify-between">
					<h2 className="text-[length:var(--density-text)] font-medium text-[var(--text-hi)]">
						Request changes
					</h2>
					<span
						aria-hidden="true"
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
								className="flex flex-col gap-1 border border-[var(--border-subtle)] p-2"
							>
								<div className="flex items-center justify-between gap-2">
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

				{errorMessage && (
					<p role="alert" className="text-sm text-error">
						{errorMessage}
					</p>
				)}

				<footer className="flex justify-end gap-2">
					<button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-primary btn-sm"
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

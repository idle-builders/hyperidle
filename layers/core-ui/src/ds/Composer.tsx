/**
 * Composer — always-rendered plain-message input.
 *
 * Cmd/Ctrl+Enter submits. No optimistic UI — disable on submit.
 * SessionComposer stays separate: it depends on @hyperidle/harness-capability
 * which cannot be a DS dependency.
 */

import type { InlineRef } from "@hyperidle/domain-model";
import type { JSX, KeyboardEvent, ReactNode } from "react";
import { useCallback, useState } from "react";
import { Button } from "./Button.js";
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
	 */
	leading?: ReactNode;
	/**
	 * When true the send button renders an SVG arrow icon instead of "Send" text.
	 * Use in full-surface conversations where a compact icon button fits better.
	 */
	iconSend?: boolean;
	/**
	 * Textarea placeholder text. Defaults to "Reply to thread…".
	 * Pass a contextual string (e.g. "Message Founder, Aria…") to give users a recipient hint.
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
			{/* data-composer-row: row container carries border+bg+radius for unified pill (iconSend=true); textarea is transparent inside it; standard layout lets textarea own its border */}
			<div
				data-composer-row
				className={
					iconSend
						? "flex items-end border-width-default border-[var(--border-default)] rounded-[var(--r-default)] bg-[var(--surface-elevated)] gap-[6px] px-[6px] pb-[6px] focus-within:border-[var(--accent-deep)]"
						: "flex items-stretch gap-[9px]"
				}
			>
				{leading !== undefined && leading !== null && (
					<span className="shrink-0 flex items-end pb-[3px]">{leading}</span>
				)}
				<textarea
					data-testid="composer-textarea"
					rows={1}
					className={`type-input flex-1 min-h-[44px] resize-none text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-hidden ${
						iconSend
							? "bg-transparent border-none outline-none px-[6px] py-[9px]"
							: "border-width-default bg-[var(--surface-elevated)] border-[var(--border-default)] rounded-[var(--r-default)] px-[12px] py-[9px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus:border-[var(--accent-deep)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]"
					}`}
					placeholder={placeholder}
					value={text}
					onChange={(e): void => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					disabled={submitting}
				/>
				{iconSend ? (
					<Button
						size="icon"
						aria-label="Send message"
						onClick={(): void => {
							void handleSubmit();
						}}
						disabled={submitting || !text.trim()}
						className="shrink-0 self-end"
					>
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
					</Button>
				) : (
					<button
						type="button"
						onClick={(): void => {
							void handleSubmit();
						}}
						disabled={submitting || !text.trim()}
						className="type-control rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] px-[12px] min-h-[44px] self-stretch"
					>
						{submitting ? "Sending…" : "Send"}
					</button>
				)}
			</div>
		</div>
	);
}

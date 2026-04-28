/**
 * L1a — `Composer` design-system component.
 *
 * Plan §7.6; approved.md §2.5. Always-rendered plain-message input.
 * Cmd/Ctrl+Enter submits. No optimistic UI — disable on submit.
 */

import type { InlineRef } from "@hyperidle/shared";
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
			className="flex flex-col gap-[6px] py-[var(--density-pad-y,8px)] px-[var(--density-pad-x,12px)] border-t border-[var(--border-subtle)] bg-[var(--surface-1)]"
			data-thread-id={threadId}
		>
			{unresolvedReviewLink ? (
				<button
					type="button"
					onClick={unresolvedReviewLink.onClick}
					className="text-left text-[12px] text-[var(--accent)] hover:underline"
				>
					Unresolved review · acting required ↑
				</button>
			) : null}
			{error ? (
				<div className="text-[12px] text-[var(--danger)]" role="alert">
					{error}
				</div>
			) : null}
			<textarea
				className="w-full min-h-[44px] resize-y bg-[var(--surface-2)] text-[var(--text-mid)] placeholder:text-[var(--text-lo)] border border-[var(--border-subtle)] rounded-[var(--r1)] px-[10px] py-[8px] text-[13px] focus:outline-none focus:border-[var(--accent)]"
				placeholder="Reply to thread…"
				value={text}
				onChange={(e): void => setText(e.target.value)}
				onKeyDown={handleKeyDown}
				disabled={submitting}
			/>
			<div className="flex items-center justify-end gap-[8px]">
				<span className="text-[11px] text-[var(--text-lo)]">⌘+Enter to send</span>
				<button
					type="button"
					onClick={(): void => {
						void handleSubmit();
					}}
					disabled={submitting || !text.trim()}
					className="px-[12px] py-[6px] rounded-[var(--r1)] text-[13px] font-medium bg-[var(--accent)] text-[var(--accent-on)] disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{submitting ? "Sending…" : "Send"}
				</button>
			</div>
		</div>
	);
}

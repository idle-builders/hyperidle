/**
 * HostThreadSection — L18 Tier 3 shell component.
 *
 * Single convergence point for the thread surface on Bet, Task, Knowledge,
 * and Artifact detail surfaces. Wraps `useHostThread` and renders messages
 * plus a plain composer.
 *
 * @lore L18: four surfaces (bet, task, knowledge_item, artifact) all need
 * the same "host thread" UX. Centralising here means routing changes,
 * theme tweaks, or composer extensions happen in one file — not four.
 *
 * @lore L18: the `inline` prop suppresses the `<section>` wrapper and heading
 * chrome for TaskSheet (which provides its own structural container).
 *
 * @lore L18: `prefill` is set by the page when the user clicks "Discuss" on
 * a Block. The chip renders a `Re: <excerpt>` affordance above the composer.
 * The chip is stateless here — the page owns the prefill state and can clear
 * it by passing `undefined`. `onClearPrefill` is called when the user clicks
 * the dismiss × button inside the chip.
 *
 * @lore L18 (M1): F5 affordances — on prefill change, the composer scrolls
 * into view and receives focus so the user can type immediately. The ×
 * dismiss button calls `onClearPrefill` to let the page clear the state.
 *
 * @lore L18 (M2): loading uses SkeletonList rows={3}; empty state uses the
 * design's exact copy; post errors surface via a role="alert" line; non-plain
 * messages render a bracketed type label (acceptable MVP — full ThreadShell
 * convergence is a follow-up per architecture.md line 160).
 */

import { ErrorState, SkeletonList } from "@hyperidle/design-system";
import type { HostKind, Message } from "@hyperidle/shared";
import { isRedactedPayload } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { useHostThread } from "../hooks/useHostThread.js";
import {
	PLACEHOLDER_AGENT_PARTICIPANT_ID,
	postPlainHostMessage,
	resolveOrCreateHostThread,
} from "../services/host-threads.js";

export interface HostThreadSectionProps {
	hostKind: HostKind;
	hostId: string;
	/** Section header text. Defaults to "Discussion". */
	title?: string;
	/** When true (TaskSheet), no <section> wrapper, no header chrome. */
	inline?: boolean;
	/** Set when a block-anchored discussion is initiated from the host surface. */
	prefill?: { blockId: string; blockExcerpt: string };
	/** Called when the user dismisses the prefill chip. */
	onClearPrefill?: () => void;
	/**
	 * Called after a message is successfully posted. Used by host pages that
	 * independently fetch the same thread data (e.g., WorkBet for messagesByBlockId)
	 * so they can trigger their own refresh.
	 *
	 * @lore L18: WorkBet uses two useHostThread instances — one for the chronological
	 * thread view (inside HostThreadSection) and one for messagesByBlockId derivation.
	 * They are separate hook instances and don't share refresh state. This callback
	 * bridges the gap: when HostThreadSection posts, the parent can refresh its copy.
	 */
	onMessagePosted?: () => void;
}

/** Founder id used for resolve-or-create. Placeholder until auth lands. */
const FOUNDER_ID = "u-founder";

/**
 * Render a plain-message payload text, handling redacted state and other types.
 */
function messageText(msg: Message): string {
	if (msg.type !== "plain") return `[${msg.type}]`;
	if (isRedactedPayload(msg.payload)) return "[redacted]";
	return msg.payload.text;
}

export function HostThreadSection({
	hostKind,
	hostId,
	title = "Discussion",
	inline = false,
	prefill,
	onClearPrefill,
	onMessagePosted,
}: HostThreadSectionProps): JSX.Element {
	const { data, error, isLoading, refresh } = useHostThread(hostKind, hostId);
	const [composerText, setComposerText] = useState("");
	const [sending, setSending] = useState(false);
	const [postError, setPostError] = useState<string | null>(null);
	const composerRef = useRef<HTMLTextAreaElement>(null);

	// F5: when prefill is set, scroll composer into view and focus it.
	// @lore L18 (M1): scrollIntoView may be undefined in JSDOM test environments
	// so we guard with optional chaining on the method itself.
	useEffect(() => {
		if (prefill && composerRef.current) {
			composerRef.current.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
			composerRef.current.focus();
		}
	}, [prefill]);

	const handleSend = useCallback(async (): Promise<void> => {
		const text = composerText.trim();
		if (!text || sending) return;

		setSending(true);
		setPostError(null);
		try {
			const threadId = await resolveOrCreateHostThread(
				hostKind,
				hostId,
				FOUNDER_ID,
				PLACEHOLDER_AGENT_PARTICIPANT_ID,
			);
			await postPlainHostMessage(threadId, text, crypto.randomUUID(), prefill?.blockId);
			setComposerText("");
			refresh();
			onMessagePosted?.();
		} catch (err) {
			setPostError(
				err instanceof Error ? err.message : "Failed to send message. Please try again.",
			);
		} finally {
			setSending(false);
		}
	}, [composerText, sending, hostKind, hostId, prefill?.blockId, refresh, onMessagePosted]);

	if (isLoading) {
		return (
			<div data-testid="host-thread-section-loading" className="p-3">
				<SkeletonList rows={3} ariaLabel="Loading discussion" />
			</div>
		);
	}

	if (error) {
		return (
			<div data-testid="host-thread-section-error" className="p-3">
				<ErrorState
					title="Failed to load thread"
					description={typeof error === "string" ? error : "Could not load this discussion."}
				/>
			</div>
		);
	}

	const messages: ReadonlyArray<Message> = data?.messages ?? [];

	const content = (
		<div data-testid="host-thread-section" className="flex flex-col gap-2">
			{/* Message list or empty state */}
			{/* @lore L18: intentionally NOT using the EmptyState design-system component here.
			    EmptyState carries role="status" per J8 AC — that role conflicts with the
			    TaskSheet's own role="status" feedback div when HostThreadSection is rendered
			    inside the task sheet dialog. Playwright strict mode fails when getByRole("status")
			    resolves to multiple elements inside the dialog. A plain div preserves the visual
			    design without the accessibility-role side-effect. */}
			{messages.length === 0 ? (
				<div
					data-testid="host-thread-section-empty"
					className="flex flex-col items-start gap-[var(--density-card-gap)] px-[var(--density-pad-x)] py-[var(--density-card-pad)] text-left"
				>
					<p className="text-[length:var(--density-text)] font-medium text-[var(--text-hi)] leading-[1.4]">
						No discussion yet.
					</p>
					<p className="text-[12px] text-[var(--text-lo)] leading-[1.4]">
						Be the first to post in this thread.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2 text-sm text-[var(--text-hi)]">
					{messages.map((msg) => (
						<div key={msg.id} className="px-3 py-2 rounded bg-[var(--surface-2)]">
							{messageText(msg)}
						</div>
					))}
				</div>
			)}

			{/* Post error alert */}
			{postError && (
				<div
					role="alert"
					data-testid="host-thread-section-post-error"
					className="text-xs text-error px-2 py-1"
				>
					{postError}
				</div>
			)}

			{/* Prefill chip — shown when a block is being discussed */}
			{prefill && (
				<div
					data-testid="host-thread-prefill-chip"
					className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--surface-3)] rounded text-[var(--text-lo)]"
				>
					<span>Re:</span>
					<span className="truncate">{prefill.blockExcerpt}</span>
					{onClearPrefill && (
						<button
							type="button"
							aria-label="Cancel block reply"
							className="ml-auto shrink-0 leading-none"
							onClick={onClearPrefill}
						>
							×
						</button>
					)}
				</div>
			)}

			{/* Composer */}
			<div className="flex gap-2">
				<textarea
					ref={composerRef}
					data-testid="composer-textarea"
					className="textarea textarea-bordered text-base resize-none flex-1 h-16"
					placeholder="Write a message…"
					value={composerText}
					onChange={(e) => setComposerText(e.target.value)}
					disabled={sending}
				/>
				<button
					type="button"
					className="btn btn-primary btn-sm self-end"
					disabled={!composerText.trim() || sending}
					onClick={() => void handleSend()}
				>
					Send
				</button>
			</div>
		</div>
	);

	if (inline) {
		return content;
	}

	return (
		<section aria-label={title} className="flex flex-col gap-3 p-3">
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-lo)]">
				{title}
			</h3>
			{content}
		</section>
	);
}

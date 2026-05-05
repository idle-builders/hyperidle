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
 * it by passing `undefined`.
 */

import type { HostKind, Message } from "@hyperidle/shared";
import { isRedactedPayload } from "@hyperidle/shared";
import { type JSX, useCallback, useState } from "react";
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
}: HostThreadSectionProps): JSX.Element {
	const { data, error, isLoading, refresh } = useHostThread(hostKind, hostId);
	const [composerText, setComposerText] = useState("");
	const [sending, setSending] = useState(false);

	const handleSend = useCallback(async (): Promise<void> => {
		const text = composerText.trim();
		if (!text || sending) return;

		setSending(true);
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
		} finally {
			setSending(false);
		}
	}, [composerText, sending, hostKind, hostId, prefill?.blockId, refresh]);

	if (isLoading) {
		return (
			<div data-testid="host-thread-section-loading" className="p-3">
				<div className="animate-pulse h-4 bg-[var(--surface-3)] rounded w-1/2" />
			</div>
		);
	}

	if (error) {
		return (
			<div data-testid="host-thread-section-error" className="p-3 text-sm text-error">
				Failed to load thread: {error}
			</div>
		);
	}

	const messages: ReadonlyArray<Message> = data?.messages ?? [];

	const content = (
		<div data-testid="host-thread-section" className="flex flex-col gap-2">
			{/* Message list */}
			{messages.length > 0 && (
				<div className="flex flex-col gap-2 text-sm text-[var(--text-hi)]">
					{messages.map((msg) => (
						<div key={msg.id} className="px-3 py-2 rounded bg-[var(--surface-2)]">
							{messageText(msg)}
						</div>
					))}
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
				</div>
			)}

			{/* Composer */}
			<div className="flex gap-2">
				<textarea
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

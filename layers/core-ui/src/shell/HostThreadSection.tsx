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

import type { CommentRowSender } from "@hyperidle/design-system";
import { Button, CommentRow, ErrorState, Input, SkeletonList } from "@hyperidle/design-system";
import type { HostKind, Message, PlainPayload } from "@hyperidle/domain-model";
import { isRedactedPayload } from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { type HostThreadIdentity, useHostThread } from "../hooks/useHostThread.js";
import { postPlainHostMessage, resolveOrCreateHostThread } from "../services/host-threads.js";

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
	/**
	 * M3 D3: agent participant id for thread creation. Null means "no agent
	 * assigned" — the thread is created founder-only. Defaults to null.
	 *
	 * @lore M3: replaces the placeholder agent participant sentinel.
	 * Callers pass the actual agent id when known (e.g. WorkBet passes the
	 * bet's lead agent), or null when no agent is yet assigned.
	 */
	agentId?: string | null;
	/**
	 * T5: When set, filters the displayed messages to only those anchored to
	 * this blockId. A "Show all messages" toggle allows the user to exit the filter.
	 *
	 * @lore T5: Client-side filter — all messages are already fetched. The server-side
	 * GET ?block_id=X endpoint is available for future use when thread volume grows.
	 */
	filterBlockId?: string;
}

/**
 * Type guard: checks whether a plain message payload carries a blockId.
 *
 * @lore T5: Replaces the unsafe `as PlainPayloadWithBlockId` cast. The
 * PlainPayloadWithBlockId interface has `text: string` and optional `blockId`.
 * We check for the shape rather than casting so TypeScript can narrow safely.
 */
// @lore AF5/G: PlainPayloadWithBlockId is structurally distinct from PlainPayload —
// TS won't narrow PlainPayload|RedactedPayload to PlainPayloadWithBlockId because the
// two interfaces are unrelated in the type hierarchy. Using a local intersection type
// (PlainPayload & { blockId?: string }) makes the guard compose with the existing union
// while preserving the same runtime predicate and adding blockId to the narrowed type.
function isPlainPayloadWithBlockId(
	payload: unknown,
): payload is PlainPayload & { blockId?: string } {
	return (
		typeof payload === "object" &&
		payload !== null &&
		"text" in payload &&
		typeof (payload as { text: unknown }).text === "string"
	);
}

/**
 * Resolve a senderId to a CommentRowSender using the identities map.
 * Falls back to a minimal sender shape when identity data is unavailable.
 *
 * @lore visual-parity-audit: identities come from the server's thread detail
 * response. Tests mock useHostThread without identities, so the fallback path
 * (senderId as display name) must always produce a valid CommentRowSender.
 */
function resolveSender(
	senderId: string,
	identities: Record<string, HostThreadIdentity>,
): CommentRowSender {
	const identity = identities[senderId];
	if (identity) {
		return {
			id: senderId,
			name: identity.name,
			role: identity.role,
			isAgent: identity.role === "agent",
		};
	}
	// Fallback: use senderId prefix as display name (e.g. "agent-1" → "agent-1")
	return {
		id: senderId,
		name: senderId,
		isAgent: senderId.startsWith("agent"),
	};
}

export function HostThreadSection({
	hostKind,
	hostId,
	title = "Discussion",
	inline = false,
	prefill,
	onClearPrefill,
	onMessagePosted,
	agentId = null,
	filterBlockId,
}: HostThreadSectionProps): JSX.Element {
	const { user } = useCurrentUser();
	const { data, error, isLoading, refresh } = useHostThread(hostKind, hostId);
	const [composerText, setComposerText] = useState("");
	const [sending, setSending] = useState(false);
	const [postError, setPostError] = useState<string | null>(null);
	const composerRef = useRef<HTMLInputElement>(null);
	// T5: when filterBlockId is set, user can toggle "show all" to exit the filter.
	const [showAll, setShowAll] = useState(false);

	// T5: reset showAll when the block filter changes so the new block's messages
	// are immediately shown in filtered mode (not the previous block's "show all" state).
	// @lore T5: Without this reset, clicking "Discuss" on a second block after having
	// expanded "show all" on the first block would leave showAll=true, defeating the filter.
	// biome-ignore lint/correctness/useExhaustiveDependencies: filterBlockId is intentionally a dep — it triggers the reset when the selected block changes.
	useEffect(() => {
		setShowAll(false);
	}, [filterBlockId]);

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
			const founderId = user?.id ?? "";
			const threadId = await resolveOrCreateHostThread(
				hostKind,
				hostId,
				founderId,
				agentId ?? null,
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
	}, [
		composerText,
		sending,
		hostKind,
		hostId,
		prefill?.blockId,
		refresh,
		onMessagePosted,
		user,
		agentId,
	]);

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

	const allMessages: ReadonlyArray<Message> = data?.messages ?? [];
	const identities: Record<string, HostThreadIdentity> = data?.identities ?? {};

	// T5: Apply block-scoped filter unless user has toggled "show all".
	const isFiltering = filterBlockId !== undefined && !showAll;
	const messages: ReadonlyArray<Message> = isFiltering
		? allMessages.filter((msg) => {
				if (msg.type !== "plain") return false;
				if (isRedactedPayload(msg.payload)) return false;
				// T5: safe type narrowing — no unsafe `as` cast.
				if (!isPlainPayloadWithBlockId(msg.payload)) return false;
				return msg.payload.blockId === filterBlockId;
			})
		: allMessages;

	const content = (
		<div data-testid="host-thread-section" className="flex flex-col gap-[9px]">
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
					className="flex flex-col items-start gap-[6px] px-[12px] py-[12px] text-left"
				>
					<p className="text-[15px] font-medium text-[var(--text-primary)] leading-[1.4]">
						No discussion yet.
					</p>
					<p className="text-[12px] text-[var(--text-tertiary)] leading-[1.4]">
						Be the first to post in this thread.
					</p>
				</div>
			) : (
				<ul
					className="flex flex-col gap-[18px] list-none m-0 py-[6px]"
					aria-label="Discussion messages"
				>
					{messages.map((msg, index) => {
						const sender = resolveSender(msg.senderId, identities);
						// Show sender header when: first message, or sender differs from previous message
						// Guard: index > 0 proves messages[index - 1] is present (noUncheckedIndexedAccess).
						const prevMsg = index > 0 ? (messages[index - 1] ?? null) : null;
						const showSenderHeader = prevMsg === null || prevMsg.senderId !== msg.senderId;
						return (
							<CommentRow
								key={msg.id}
								message={msg}
								sender={sender}
								showSenderHeader={showSenderHeader}
							/>
						);
					})}
				</ul>
			)}

			{/* T5: "Show all messages" toggle when block-scoped filter is active */}
			{isFiltering && (
				<button
					type="button"
					className="text-xs text-[var(--text-tertiary)] underline self-start"
					onClick={() => setShowAll(true)}
				>
					Show all messages
				</button>
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
					data-spacing-role="compact-pill"
					className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--surface-elevated)] rounded-[var(--r-pill)] text-[var(--text-tertiary)]"
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

			{/* Composer — inline single-line pattern matching knowledge-edit.html .discussion-composer */}
			{/*
			 * @lore AZ7 B2 (review round 1): was a hand-rolled <input> — the design
			 * system's own Composer component doesn't fit (it's multiline, submits
			 * on Cmd/Ctrl+Enter, and owns a heavier ComposerSubmitInput contract
			 * with clientKey/refs this call site doesn't have); migrated to the
			 * plain Input primitive instead, which matches this field's actual
			 * shape (single-line, Enter-to-send, no shift+Enter distinction) with
			 * no behavior change. This also fixes bg-[var(--surface-page)] as an
			 * input fill — Set 3 gives that token exactly one job (the page
			 * canvas); a text input is --surface-elevated's job, which Input
			 * already carries.
			 */}
			<div className="flex gap-[9px] items-stretch">
				<Input
					ref={composerRef}
					type="text"
					data-testid="composer-textarea"
					className="flex-1"
					placeholder="Write a message…"
					value={composerText}
					onChange={(e) => setComposerText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void handleSend();
						}
					}}
					disabled={sending}
				/>
				<Button
					variant="primary"
					size="sm"
					className="shrink-0"
					disabled={!composerText.trim() || sending}
					onClick={() => void handleSend()}
				>
					Send
				</Button>
			</div>
		</div>
	);

	if (inline) {
		return content;
	}

	return (
		<section
			aria-label={title}
			className="flex flex-col gap-[12px] border-t border-[var(--border-subtle)] pt-[18px]"
		>
			<h3 className="text-[13px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)] border-b border-[var(--border-subtle)] pb-[6px]">
				{title}
			</h3>
			{content}
		</section>
	);
}

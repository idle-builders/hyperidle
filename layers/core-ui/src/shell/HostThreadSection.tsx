/**
 * HostThreadSection — L18 Tier 3 shell component.
 *
 * Single convergence point for the thread surface on task and knowledge_item
 * detail surfaces. Wraps `useThread`/`useThreads` and renders messages plus a
 * plain composer.
 *
 * @lore BC3: `hostKind`/`hostId` are gone — `"task"` left the thread
 * `HOST_KINDS` vocabulary (a task's own thread is `team`-hosted;
 * architecture.md §3.9) and a task page already knows its own thread id
 * (`open_task(id).threadId`). Two ways in, never both at once:
 *  - `threadId` — the caller already has the thread (the task page).
 *  - `host` — the caller has only a host to resolve, and creates the thread
 *    on first post when none exists yet (the knowledge page). A
 *    `knowledge_item` host is host-scoped (architecture.md §3.4): any
 *    signed-in visitor may read it and post into it, joining by posting.
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
 * @lore BC3: the block-anchored filter now reads `Message.blockId` — a real
 * top-level column (architecture.md §3.1's `messages_block_id_idx`), not a
 * field buried inside the plain payload. The old `isPlainPayloadWithBlockId`
 * type-guard hack is gone with it.
 *
 * @lore BC3 review: this component is the *only* place that resolves the
 * host's thread — `search_threads({host})` then `open_thread(id)`. A host
 * page that separately needs the same data (KnowledgeDetail's block-anchored
 * inline rendering) does not call those hooks again; it reads `onThreadView`
 * instead. Duplicating the resolve here was the original review finding:
 * two independent fetchers for one thread, four action calls where two do.
 */

import type { HostKind, Message, ThreadView } from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import type { CommentRowSender, ComposerSubmitInput } from "../ds";
import { CommentRow, Composer, ErrorState, SkeletonList } from "../ds";
import { useThread } from "../hooks/useThread.js";
import { useThreads } from "../hooks/useThreads.js";
import { call } from "../services/call.js";

export interface HostThreadSectionProps {
	/** The caller already knows its own thread — the task page. */
	threadId?: string;
	/** The caller has only a host to resolve — the knowledge page. */
	host?: { kind: HostKind; id: string };
	/** Section header text. Defaults to "Discussion". */
	title?: string;
	/** When true (TaskSheet), no <section> wrapper, no header chrome. */
	inline?: boolean;
	/** Set when a block-anchored discussion is initiated from the host surface. */
	prefill?: { blockId: string; blockExcerpt: string };
	/** Called when the user dismisses the prefill chip. */
	onClearPrefill?: () => void;
	/**
	 * BC3 review: reports the thread this section resolved and loaded, on
	 * every load and reload (including the one that follows a first post
	 * creating the thread). This is the single fetch — a host page that also
	 * needs the thread's data (e.g. for its own block-anchored rendering)
	 * reads it from here instead of resolving the same host/thread again
	 * itself.
	 */
	onThreadView?: (view: ThreadView | null) => void;
	/**
	 * T5: When set, filters the displayed messages to only those anchored to
	 * this blockId. A "Show all messages" toggle allows the user to exit the filter.
	 */
	filterBlockId?: string;
}

export interface HostThreadIdentity {
	name: string;
	role: string;
	isAgent: boolean;
}

/**
 * Resolve a senderId to a CommentRowSender using the identities map.
 * Falls back to a minimal sender shape when identity data is unavailable.
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
			isAgent: identity.isAgent,
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
	threadId: knownThreadId,
	host,
	title = "Discussion",
	inline = false,
	prefill,
	onClearPrefill,
	onThreadView,
	filterBlockId,
}: HostThreadSectionProps): JSX.Element {
	// A `host` prop resolves lazily: search for an existing thread on that
	// host, and adopt whichever id `search_threads` finds. `knownThreadId`
	// (the task page) never goes through this search at all.
	const hostFilter = knownThreadId === undefined && host !== undefined ? { host } : undefined;
	const resolved = useThreads(hostFilter);
	const resolvedThreadId = resolved.threads[0]?.id;
	const activeThreadId = knownThreadId ?? resolvedThreadId;

	// @lore re-review: never `useThread(activeThreadId, filterBlockId)` — that
	// asked the server for only that block's messages, so `onThreadView`
	// below reported a block-scoped `data` to whatever else on the page
	// reads it (e.g. KnowledgeDetail's inline anchored comments), making
	// every other block's comments vanish the moment one block's discussion
	// was opened. `filterBlockId` stays a purely client-side slice over the
	// one full `ThreadView` this hook loads — see `messages` below.
	const { status, data, error, refresh } = useThread(activeThreadId);
	const composerWrapperRef = useRef<HTMLDivElement>(null);
	// T5: when filterBlockId is set, user can toggle "show all" to exit the filter.
	const [showAll, setShowAll] = useState(false);

	// BC3 review: report every load — including the reload that follows a
	// first post creating the thread — so a host page that needs the same
	// data (e.g. block-anchored rendering) never resolves it a second time.
	useEffect(() => {
		onThreadView?.(data);
	}, [data, onThreadView]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: filterBlockId is intentionally a dep — it triggers the reset when the selected block changes.
	useEffect(() => {
		setShowAll(false);
	}, [filterBlockId]);

	useEffect(() => {
		if (prefill && composerWrapperRef.current) {
			const ta = composerWrapperRef.current.querySelector<HTMLTextAreaElement>(
				'[data-testid="composer-textarea"]',
			);
			ta?.scrollIntoView?.({ block: "nearest" });
			ta?.focus();
		}
	}, [prefill]);

	const handleComposerSubmit = useCallback(
		async (input: ComposerSubmitInput): Promise<void> => {
			let targetThreadId = activeThreadId;
			if (targetThreadId === undefined) {
				if (host === undefined) {
					throw new Error("No thread to post to");
				}
				const created = await call("adjust_thread", { host });
				if (!created.ok) {
					throw new Error(created.problems[0]?.message ?? "Failed to start thread");
				}
				targetThreadId = created.data.thread.id;
			}
			const sent = await call("send_message", {
				threadId: targetThreadId,
				text: input.text,
				clientKey: input.clientKey,
				...(prefill?.blockId !== undefined ? { blockId: prefill.blockId } : {}),
			});
			if (!sent.ok) {
				throw new Error(sent.problems[0]?.message ?? "Failed to post message");
			}
			refresh();
			if (targetThreadId !== activeThreadId) resolved.retry();
		},
		[activeThreadId, host, prefill?.blockId, refresh, resolved.retry],
	);

	// @lore BC3 review: `useThread(undefined)` is "idle", not "loading" — a
	// host with no thread yet (search_threads → []) must not show the
	// skeleton forever. Only count `status === "loading"` once an id has
	// actually been resolved; while resolving the host itself, `resolved`'s
	// own loading state already covers the skeleton.
	const isLoading =
		resolved.status === "loading" || (activeThreadId !== undefined && status === "loading");

	if (isLoading) {
		return (
			<div data-testid="host-thread-section-loading" className="p-3">
				<SkeletonList rows={3} ariaLabel="Loading discussion" />
			</div>
		);
	}

	if (status === "error" || resolved.status === "error") {
		return (
			<div data-testid="host-thread-section-error" className="p-3">
				<ErrorState
					title="Failed to load thread"
					description={error ?? resolved.error ?? "Could not load this discussion."}
				/>
			</div>
		);
	}

	// @lore UI-003: open_thread returns messages DESC (newest-first). Reverse
	// to ASC so CommentRow renders oldest → newest top-to-bottom.
	const allMessages: ReadonlyArray<Message> = data?.messages ? [...data.messages].reverse() : [];
	const identities: Record<string, HostThreadIdentity> = data
		? Object.fromEntries(
				data.members.map((m) => [m.id, { name: m.name, role: m.role, isAgent: m.isAgent }]),
			)
		: {};

	// T5: Apply block-scoped filter unless user has toggled "show all".
	const isFiltering = filterBlockId !== undefined && !showAll;
	const messages: ReadonlyArray<Message> = isFiltering
		? allMessages.filter((msg) => msg.blockId === filterBlockId)
		: allMessages;

	const content = (
		<div data-testid="host-thread-section" className="flex flex-col gap-[9px]">
			{messages.length === 0 ? (
				<div
					data-testid="host-thread-section-empty"
					className="flex flex-col items-start gap-[6px] px-[12px] py-[12px] text-left"
				>
					<p className="type-copy   text-[var(--text-primary)] ">No discussion yet.</p>
					<p className="type-metadata  text-[var(--text-tertiary)] ">
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

			{isFiltering && (
				<button
					type="button"
					className="type-control  text-[var(--text-tertiary)] underline self-start"
					onClick={() => setShowAll(true)}
				>
					Show all messages
				</button>
			)}

			{prefill && (
				<div
					data-testid="host-thread-prefill-chip"
					data-spacing-role="compact-pill"
					className="type-metadata flex items-center gap-1 px-2 py-1  bg-[var(--surface-elevated)] rounded-[var(--r-pill)] text-[var(--text-tertiary)]"
				>
					<span>Re:</span>
					<span className="truncate">{prefill.blockExcerpt}</span>
					{onClearPrefill && (
						<button
							type="button"
							aria-label="Cancel block reply"
							className="type-control ml-auto shrink-0 "
							onClick={onClearPrefill}
						>
							×
						</button>
					)}
				</div>
			)}

			<div ref={composerWrapperRef}>
				<Composer
					threadId={activeThreadId ?? `${host?.kind ?? "new"}:${host?.id ?? ""}`}
					onSubmit={handleComposerSubmit}
				/>
			</div>
		</div>
	);

	if (inline) {
		return content;
	}

	return (
		<section
			aria-label={title}
			className="border-width-thin-t flex flex-col gap-[12px]  border-[var(--border-subtle)] pt-[18px]"
		>
			<h3 className="border-width-thin-b type-label   uppercase  text-[var(--text-tertiary)]  border-[var(--border-subtle)] pb-[6px]">
				{title}
			</h3>
			{content}
		</section>
	);
}

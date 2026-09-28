import type { HostKind, Message, ThreadView } from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import type { CommentRowSender, ComposerSubmitInput } from "../ds";
import { CommentRow, Composer, ErrorState, ReferenceChip, SkeletonList } from "../ds";
import { useThread } from "../hooks/useThread.js";
import { useThreads } from "../hooks/useThreads.js";
import { call } from "../services/call.js";

export interface HostThreadSectionProps {
	/** The caller already knows its own thread — the task page. */
	threadId?: string;
	/** The caller has only a host to resolve — the document page. */
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
	 * Reports the thread this section resolved and loaded, on
	 * every load and reload (including the one that follows a first post
	 * creating the thread). This is the single fetch — a host page that also
	 * needs the thread's data (e.g. for its own block-anchored rendering)
	 * reads it from here instead of resolving the same host/thread again
	 * itself.
	 */
	onThreadView?: (view: ThreadView | null) => void;
	/**
	 * When set, filters the displayed messages to only those anchored to
	 * this blockId. A "Show all messages" toggle allows the user to exit the filter.
	 */
	filterBlockId?: string;
}

export interface HostThreadIdentity {
	name: string;
	isAgent: boolean;
}

function resolveSender(
	senderId: string,
	identities: Record<string, HostThreadIdentity>,
): CommentRowSender {
	const identity = identities[senderId];
	if (identity) {
		return {
			id: senderId,
			name: identity.name,
			isAgent: identity.isAgent,
		};
	}
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
	// host prop resolves lazily via search_threads; knownThreadId skips the search entirely
	const hostFilter = knownThreadId === undefined && host !== undefined ? { host } : undefined;
	const resolved = useThreads(hostFilter);
	const resolvedThreadId = resolved.threads[0]?.id;
	const activeThreadId = knownThreadId ?? resolvedThreadId;

	// @lore: filterBlockId is client-side only — passing it to useThread would report a block-scoped view via onThreadView, making all other blocks' comments vanish
	const { status, data, error, refresh } = useThread(activeThreadId);
	const composerWrapperRef = useRef<HTMLDivElement>(null);
	// when filterBlockId is set, user can toggle "show all" to exit the filter.
	const [showAll, setShowAll] = useState(false);

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

	// destructure retry to avoid full resolved object as dep (fresh instance each render)
	const { retry: retryResolved } = resolved;
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
			if (targetThreadId !== activeThreadId) retryResolved();
		},
		[activeThreadId, host, prefill?.blockId, refresh, retryResolved],
	);

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

	const allMessages: ReadonlyArray<Message> = data?.messages ? [...data.messages].reverse() : [];
	const identities: Record<string, HostThreadIdentity> = data
		? Object.fromEntries(data.members.map((m) => [m.id, { name: m.name, isAgent: m.isAgent }]))
		: {};

	// block-scoped filter unless user toggled "show all"
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
				<ReferenceChip
					kind="block"
					label={prefill.blockExcerpt}
					mode="draft"
					dataTestId="host-thread-prefill-chip"
					onRemove={onClearPrefill}
					removeAriaLabel="Cancel block reply"
				/>
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

import type { AssistantNotice, InlineRef, Message } from "@hyperidle/domain-model";
import { ASSISTANT_TURN_TIMEOUT_MS, isRedactedPayload } from "@hyperidle/domain-model";
import { type JSX, type RefObject, useCallback, useEffect } from "react";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { Button, Composer, ThreadShell, useDialogBehavior } from "../ds";
import { plainReadPayloadOf } from "../ds/message-payload.js";
import { useAgents } from "../hooks/useAgents.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useThread } from "../hooks/useThread.js";
import { useThreads } from "../hooks/useThreads.js";
import { call } from "../services/call.js";

export interface AssistantOverlayProps {
	open: boolean;
	onClose: () => void;
	anchorRef?: RefObject<HTMLButtonElement | null>;
	contextRefs: ReadonlyArray<AssistantContextRef>;
	onRemoveContextRef: (index: number) => void;
}

function ContextChip({
	ref: contextRef,
	index,
	onRemove,
}: {
	ref: AssistantContextRef;
	index: number;
	onRemove: (i: number) => void;
}): JSX.Element {
	return (
		<span
			data-spacing-role="compact-pill"
			className="type-metadata border-width-thin inline-flex items-center gap-1 rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 py-0.5  text-[var(--text-secondary)]"
		>
			<span className="type-label  text-[var(--text-tertiary)] uppercase ">{contextRef.kind}</span>
			<span className="max-w-[120px] truncate">{contextRef.label}</span>
			<button
				type="button"
				data-spacing-role="compact-pill-control"
				aria-label={`Remove ${contextRef.label}`}
				className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
				onClick={() => onRemove(index)}
			>
				×
			</button>
		</span>
	);
}

interface NoticeConfig {
	title: string;
	description: string;
	colorToken: string;
	/** Absent when the notice has no live action — the message stands alone. */
	affordance?: JSX.Element;
}

function getNoticeConfig(notice: AssistantNotice, onRetry?: () => void): NoticeConfig {
	switch (notice.kind) {
		case "missing_harness":
			return {
				title: "Runtime not configured",
				description:
					"I don't have a runtime selected. Pick a harness for me under Agent settings and I'll be ready.",
				colorToken: "var(--status-warning)",
			};
		case "provider_error":
			return {
				title: "Couldn't reach the model",
				description: "The model provider returned an error. This is usually temporary.",
				colorToken: "var(--status-error)",
				affordance: (
					<Button variant="secondary" size="sm" onClick={onRetry}>
						Retry
					</Button>
				),
			};
	}
}

function AssistantNoticeCard({
	notice,
	onRetry,
}: {
	notice: AssistantNotice;
	onRetry?: () => void;
}): JSX.Element {
	const config = getNoticeConfig(notice, onRetry);

	return (
		<div
			data-az16-profile="enter"
			role="alert"
			style={{
				borderRadius: "var(--r-subtle)",
				border: `var(--bw-default) solid ${config.colorToken}`,
				padding: "12px",
				display: "flex",
				flexDirection: "column",
				gap: "6px",
				background: "var(--surface-overlay)",
			}}
		>
			<div
				style={{
					color: config.colorToken,
				}}
				className="type-small"
			>
				{config.title}
			</div>
			<div
				style={{
					color: "var(--text-secondary)",
				}}
				className="type-small"
			>
				{config.description}
				{notice.kind === "provider_error" && notice.code && (
					<code
						style={{
							background: "var(--surface-elevated)",
							borderRadius: "var(--r-subtle)",
							padding: "1px 4px",
							marginLeft: "6px",
						}}
						className="type-data"
					>
						{notice.code}
					</code>
				)}
			</div>
			{config.affordance ? <div style={{ marginTop: "3px" }}>{config.affordance}</div> : null}
		</div>
	);
}

function ThinkingRow(): JSX.Element {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "9px",
				padding: "9px 12px",
				borderRadius: "var(--r-subtle)",
				background: "var(--accent-primary-dim)",
			}}
		>
			<span className="loading loading-spinner loading-sm text-[var(--text-tertiary)]" />
			<span
				style={{
					color: "var(--text-tertiary)",
				}}
				className="type-small"
			>
				Assistant is thinking…
			</span>
		</div>
	);
}

function StaleRetryCard({ onRetry }: { onRetry?: () => void }): JSX.Element {
	return (
		<div
			role="alert"
			style={{
				display: "flex",
				alignItems: "center",
				gap: "9px",
				padding: "9px 12px",
				borderRadius: "var(--r-subtle)",
				background: "color-mix(in oklab, var(--status-error) 8%, transparent)",
			}}
		>
			<span className="type-small" style={{ color: "var(--status-error)", flex: 1 }}>
				Couldn't reach the model — that didn't finish.
			</span>
			<Button variant="secondary" size="sm" className="shrink-0" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}

function AssistantOverlayInner({
	contextRefs,
	onRemoveContextRef,
}: {
	contextRefs: ReadonlyArray<AssistantContextRef>;
	onRemoveContextRef: (index: number) => void;
}): JSX.Element {
	const { user, status: userStatus } = useCurrentUser();
	const { agents, loading: agentsLoading, refetch: refetchAgents } = useAgents();
	const myAgentId = agents.find((a) => a.ownerUserId === user?.id)?.id ?? null;

	// No create-on-read thread endpoint — first send creates it via send_message({ recipients: [myAgentId] })
	const agentHostFilter = myAgentId
		? { host: { kind: "agent" as const, id: myAgentId } }
		: undefined;
	const threadSearch = useThreads(agentHostFilter);
	const existingThreadId = threadSearch.threads[0]?.id;
	const { status: threadStatus, data, error, refresh } = useThread(existingThreadId);

	const sendToThread = useCallback(
		async (
			targetThreadId: string | undefined,
			input: { type: string; payload: unknown; clientKey: string },
		): Promise<string> => {
			if (!myAgentId) throw new Error("No assistant agent to message");

			// pending_block refs become real documents on send — never wire refs.
			const pendingBlocks = contextRefs.filter(
				(ref): ref is AssistantContextRef & { kind: "pending_block" } =>
					ref.kind === "pending_block",
			);
			const entityRefs = contextRefs.filter(
				(ref): ref is AssistantContextRef & { kind: "document" | "task" | "message" } =>
					ref.kind !== "pending_block",
			);
			const refsToSend: InlineRef[] = entityRefs.map((ref) => ({ kind: ref.kind, id: ref.id }));

			const target = targetThreadId ? { threadId: targetThreadId } : { recipients: [myAgentId] };
			const res = await (input.type === "verdict"
				? call("send_message", {
						...target,
						clientKey: input.clientKey,
						verdict: input.payload as {
							decision: "approve" | "approve-with-comments" | "request-changes" | "edit" | "reject";
							resolvesMessageId: string;
							note?: string;
						},
					})
				: call("send_message", {
						...target,
						clientKey: input.clientKey,
						text: (input.payload as { text: string }).text,
						refs: refsToSend.length > 0 ? refsToSend : undefined,
					}));
			if (!res.ok) {
				throw new Error(res.problems[0]?.message ?? "Failed to send message");
			}

			const teamId = user?.teamId ?? null;
			await Promise.all(
				pendingBlocks.map((ref) =>
					call("edit_document", {
						as: "artifact",
						parent: { kind: "thread", id: res.data.thread.id },
						title: ref.label,
						body: ref.content,
						format: "markdown",
						scopeKind: teamId ? "team" : "factory",
						scopeId: teamId,
					}),
				),
			);

			return res.data.thread.id;
		},
		[contextRefs, myAgentId, user],
	);

	const handleAppendMessage = useCallback(
		async (input: { type: string; payload: unknown; clientKey: string }): Promise<void> => {
			if (!existingThreadId) return;
			await sendToThread(existingThreadId, input);
			refresh();
		},
		[existingThreadId, sendToThread, refresh],
	);

	const handleFirstSend = useCallback(
		async (input: { text: string; clientKey: string }): Promise<void> => {
			await sendToThread(undefined, {
				type: "plain",
				payload: { text: input.text },
				clientKey: input.clientKey,
			});
			threadSearch.retry();
		},
		[sendToThread, threadSearch],
	);

	// open_user({}) still in flight until userStatus != "loading" — without the guard myAgentId reads null and the overlay flashes the no-agent message
	if (
		userStatus === "loading" ||
		agentsLoading ||
		(myAgentId && threadSearch.status === "loading")
	) {
		return (
			<div className="flex flex-1 items-center justify-center p-4">
				<span className="loading loading-spinner loading-sm text-[var(--text-tertiary)]" />
			</div>
		);
	}

	if (!myAgentId || threadSearch.status === "error") {
		// no agent → threadSearch filter undefined, retry is no-op; refetch agents resolves it; threadSearch error → search failed, its own retry
		const onRetry = myAgentId ? threadSearch.retry : refetchAgents;
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-[9px] p-4">
				<p className="type-small  text-[var(--text-secondary)]">
					{threadSearch.error ?? "Couldn't find your assistant agent."}
				</p>
				<Button variant="ghost" size="sm" onClick={onRetry}>
					Retry
				</Button>
			</div>
		);
	}

	if (!existingThreadId) {
		return (
			<div className="flex-1 min-h-0 flex flex-col justify-end overflow-hidden">
				<div className="flex flex-1 items-center justify-center p-4">
					<p className="type-small text-[var(--text-tertiary)]">Say something to start.</p>
				</div>
				<div className="max-w-[720px] mx-auto w-full px-[12px] pb-[12px]">
					<Composer threadId="assistant:new" onSubmit={handleFirstSend} />
				</div>
			</div>
		);
	}

	if (threadStatus === "loading" || !data) {
		return (
			<div className="flex flex-1 items-center justify-center p-4">
				<span className="loading loading-spinner loading-sm text-[var(--text-tertiary)]" />
			</div>
		);
	}

	if (threadStatus === "error" || threadStatus === "not-found") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-[9px] p-4">
				<p className="type-small  text-[var(--text-secondary)]">
					{error ?? "Failed to load assistant thread"}
				</p>
				<Button variant="ghost" size="sm" onClick={refresh}>
					Retry
				</Button>
			</div>
		);
	}

	const { thread, messages } = data;
	const identities: Record<string, { name: string; role?: string; isAgent?: boolean }> =
		Object.fromEntries(
			data.members.map((m) => [m.id, { name: m.name, role: m.role, isAgent: m.isAgent }]),
		);
	const msgsAsc: ReadonlyArray<Message> = [...messages].sort((a, b) =>
		a.createdAt.localeCompare(b.createdAt),
	);

	const lastMessage = msgsAsc[msgsAsc.length - 1];
	const lastMessageIsHuman = lastMessage !== undefined && lastMessage.senderId !== myAgentId;
	const lastMessageIsWithinTimeout =
		lastMessageIsHuman &&
		lastMessage !== undefined &&
		Date.now() - new Date(lastMessage.createdAt).getTime() < ASSISTANT_TURN_TIMEOUT_MS;
	const isThinking = lastMessageIsWithinTimeout;
	const isStale = lastMessageIsHuman && !lastMessageIsWithinTimeout;

	const plainPayloadCache = new Map(
		msgsAsc.filter((m) => m.type === "plain").map((m) => [m.id, plainReadPayloadOf(m)] as const),
	);
	const noticeMessages = msgsAsc.filter((m) => {
		if (m.type !== "plain") return false;
		const p = plainPayloadCache.get(m.id);
		return p !== undefined && !isRedactedPayload(p) && p.notice !== undefined;
	});
	const threadMessages = msgsAsc.filter((m) => {
		if (m.type !== "plain") return true;
		const p = plainPayloadCache.get(m.id);
		return p === undefined || isRedactedPayload(p) || p.notice === undefined;
	});

	// @lore: ThreadShell — needs flex-1 min-h-0 parent to resolve h-full; without it message list clips and composer hidden; notice/thinking cards outside
	return (
		<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
			{/* Context chips area — only renders when refs are attached */}
			{contextRefs.length > 0 && (
				<div
					data-testid="assistant-context-chips"
					className="border-width-thin-b flex flex-wrap gap-[6px] shrink-0  border-[var(--border-subtle)] px-3 py-2"
				>
					{contextRefs.map((contextRef, i) => (
						<ContextChip
							key={
								contextRef.kind === "pending_block"
									? `${contextRef.kind}-${contextRef.label}`
									: `${contextRef.kind}-${contextRef.id}`
							}
							ref={contextRef}
							index={i}
							onRemove={onRemoveContextRef}
						/>
					))}
				</div>
			)}
			{/* notice/thinking/stale cards rendered outside ThreadShell to avoid text-collision with the scroll area */}
			{noticeMessages.map((m) => {
				const p = plainPayloadCache.get(m.id);
				if (p === undefined || isRedactedPayload(p) || p.notice === undefined) return null;
				return (
					<div key={m.id} className="shrink-0 px-[12px] pt-[9px]">
						<AssistantNoticeCard notice={p.notice} onRetry={refresh} />
					</div>
				);
			})}
			{/* thinking indicator */}
			{isThinking && (
				<div className="shrink-0 px-[12px] pt-[9px]">
					<ThinkingRow />
				</div>
			)}
			{/* stale retry card */}
			{isStale && (
				<div className="shrink-0 px-[12px] pt-[9px]">
					<StaleRetryCard onRetry={refresh} />
				</div>
			)}
			{/* flex-1 min-h-0 gives ThreadShell a definite height parent so its internal h-full resolves */}
			<div className="flex-1 min-h-0 overflow-hidden">
				<ThreadShell
					thread={thread}
					messages={threadMessages}
					identities={identities}
					onAppendMessage={handleAppendMessage}
					hostTitle="Assistant"
				/>
			</div>
		</div>
	);
}

export function AssistantOverlay({
	open,
	onClose,
	anchorRef: _anchorRef,
	contextRefs,
	onRemoveContextRef,
}: AssistantOverlayProps): JSX.Element | null {
	const behavior = useDialogBehavior({
		open,
		onClose,
		isDirty: false,
		modal: false,
		layer: "overlay",
	});

	// @lore: Escape — caught at document level; modal=false surfaces have no focus trap so overlay div won't receive keyboard events unless focused
	const { requestDismiss } = behavior;
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				requestDismiss();
			}
		};
		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, [open, requestDismiss]);

	if (!open) return null;

	const overlayProps = behavior.getOverlayProps();

	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is statically typed "dialog" in useDialogBehavior.getOverlayProps — biome can't see through the indirection to know aria-modal/aria-label are valid here.
		// biome-ignore lint/a11y/noStaticElementInteractions: same indirection — role is "dialog", which supports onKeyDown for the focus/escape handling.
		<div
			role={overlayProps.role}
			aria-label="Assistant conversation"
			aria-modal={overlayProps["aria-modal"]}
			data-dialog-layer={overlayProps["data-dialog-layer"]}
			onKeyDown={overlayProps.onKeyDown}
			className={`motion-enter ${[
				"fixed bottom-16 right-4",
				"w-[360px] h-[70vh]",
				"flex flex-col overflow-hidden",
				"rounded-[var(--r-subtle)]  border-[var(--border-default)] bg-[var(--surface-overlay)]",
				"shadow-[var(--shadow-elevated)]",
				"",
			].join(" ")}`}
			style={{ zIndex: overlayProps.style.zIndex }}
		>
			{/* no title — ThreadShell hostBanner already shows agent identity; duplicate h2 causes stacked headers */}
			<div className="border-width-thin-b flex items-center justify-end px-[12px] py-[6px]  border-[var(--border-subtle)] shrink-0">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Close assistant"
					onClick={behavior.requestDismiss}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 14 14"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.75"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<line x1="2" y1="2" x2="12" y2="12" />
						<line x1="12" y1="2" x2="2" y2="12" />
					</svg>
				</Button>
			</div>
			<AssistantOverlayInner contextRefs={contextRefs} onRemoveContextRef={onRemoveContextRef} />
		</div>
	);
}

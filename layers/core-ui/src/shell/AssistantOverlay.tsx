/**
 * AD8b — AssistantOverlay
 *
 * Popover overlay that renders a ThreadShell in assistant configuration.
 * Anchored to the assistant trigger button ref.
 *
 * Positioning: fixed, bottom-16 right-4 (grows upward and to the right).
 * Dimensions: 360px wide, max-height 70vh. z-index 30 (above Main, below Settings).
 *
 * @lore AD8b: Renamed from CocOverlay → AssistantOverlay.
 * Hook: useCocThread → useAssistantThread (fetches /api/threads/assistant).
 * Context: CocContext → AssistantContext.
 * data-testid for context chips: "coc-context-chips" → "assistant-context-chips".
 *
 * @lore L21 (design): overlay does NOT close on clicking outside. The user
 * must be able to interact with Main content (to select context items via the
 * "+" attach affordance) while the overlay remains open. Only Escape and
 * clicking the trigger again close it.
 *
 * @lore L21 (arch): AssistantOverlay is a shell-level composition (like SettingsPanel)
 * not a design-system custom component. It lives in layers/core-ui/src/shell/.
 */

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
import { apiFetch } from "../services/api-fetch.js";
import { call } from "../services/call.js";

export interface AssistantOverlayProps {
	open: boolean;
	onClose: () => void;
	/** @lore L21: anchorRef is reserved for future dynamic positioning relative
	 * to the assistant trigger button. Currently the overlay uses fixed bottom-16 right-4
	 * positioning. The prop is optional — pass a ref when dynamic anchoring lands. */
	anchorRef?: RefObject<HTMLButtonElement | null>;
	contextRefs: ReadonlyArray<AssistantContextRef>;
	onRemoveContextRef: (index: number) => void;
}

/**
 * Context chip rendered above the composer in the overlay.
 */
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

// ---------------------------------------------------------------------------
// AH3: Notice card rendering (missing_key / missing_harness / provider_error)
// ---------------------------------------------------------------------------

interface NoticeConfig {
	title: string;
	description: string;
	colorToken: string;
	/** Absent when the notice has no live action — the message stands alone. */
	affordance?: JSX.Element;
}

function getNoticeConfig(notice: AssistantNotice, onRetry?: () => void): NoticeConfig {
	switch (notice.kind) {
		case "missing_key":
			return {
				title: "No API key yet",
				description:
					"I can't think until an API key is set. Add your Anthropic key under Settings → Credentials to get started.",
				colorToken: "var(--status-warning)",
			};
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
					<button
						type="button"
						className="type-control border-width-thin   px-[9px] py-[6px] rounded-[var(--r-subtle)]  border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						onClick={onRetry}
					>
						Retry
					</button>
				),
			};
	}
}

/**
 * AH3: Render a notice card for assistant error/guidance messages.
 * These replace the normal chat bubble when payload.notice is present.
 *
 * @lore AH3: role="alert" for accessibility — screen readers announce immediately.
 * Token contract: --status-warning (setup gaps), --status-error (failures).
 * No --color-error/success (dead tokens, AI1 owns).
 */
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

/**
 * AH3 §1.7b: "Thinking…" indicator — shown when last message is human and
 * within the turn timeout window. Client-derived from thread state.
 */
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

/**
 * AH3 §1.7b: Stale crash-recovery Retry card — shown when last message is human
 * AND older than ASSISTANT_TURN_TIMEOUT_MS. Never shows an infinite spinner.
 */
function StaleRetryCard({ onRetry }: { onRetry?: () => void }): JSX.Element {
	// FR-21: styled as an inline thread element (like ThinkingRow), not a floating alert.
	// Removed red border + overlay background — the error context is communicated
	// through the status-error text colour and the "try again" call to action.
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
			<button
				type="button"
				className="type-control border-width-thin shrink-0 px-[9px] py-[6px] rounded-[var(--r-subtle)] border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
				onClick={onRetry}
			>
				Retry
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------

function AssistantOverlayInner({
	contextRefs,
	onRemoveContextRef,
}: {
	contextRefs: ReadonlyArray<AssistantContextRef>;
	onRemoveContextRef: (index: number) => void;
}): JSX.Element {
	// artifacts-become-knowledge: scopeKind for knowledge items created from pending_block refs.
	const { user } = useCurrentUser();
	// BC3 B6: "the assistant is your agent" — an ordinary agent with
	// `ownerUserId === me`. `GET /api/agents` carries `ownerUserId` directly, so
	// the overlay finds it straight off the one agents fetch every agent picker
	// already shares — no second fetch.
	const { agents, loading: agentsLoading } = useAgents();
	const myAgentId = agents.find((a) => a.ownerUserId === user?.id)?.id ?? null;

	// BC3: no more `GET /api/threads/assistant` create-on-read. Resolve the
	// existing direct thread with my agent, if any; the overlay's first send
	// creates one via `send_message({ recipients: [myAgentId] })`.
	const agentHostFilter = myAgentId
		? { host: { kind: "agent" as const, id: myAgentId } }
		: undefined;
	const threadSearch = useThreads(agentHostFilter);
	const existingThreadId = threadSearch.threads[0]?.id;
	const { status: threadStatus, data, error, refresh } = useThread(existingThreadId);

	/** Shared by the populated ThreadShell composer and the empty first-send composer. */
	const sendToThread = useCallback(
		async (
			targetThreadId: string | undefined,
			input: { type: string; payload: unknown; clientKey: string },
		): Promise<string> => {
			if (!myAgentId) throw new Error("No assistant agent to message");

			// pending_block refs become real knowledge items on send — never wire refs.
			const pendingBlocks = contextRefs.filter(
				(ref): ref is AssistantContextRef & { kind: "pending_block" } =>
					ref.kind === "pending_block",
			);
			const entityRefs = contextRefs.filter(
				(ref): ref is AssistantContextRef & { kind: "knowledge_item" | "task" | "message" } =>
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

			// @lore artifacts-become-knowledge: For each pending_block, create a knowledge
			// item parented to this thread. The content was captured at click time — a real
			// document row, not a pointer that rots when the source is edited. `/api/knowledge`
			// is untouched by this item — no `call()` door exists for it yet.
			const teamId = user?.teamId ?? null;
			await Promise.all(
				pendingBlocks.map((ref) =>
					apiFetch("/api/knowledge", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							parentKind: "thread",
							parentId: res.data.thread.id,
							body: ref.content,
							format: "markdown",
							scopeKind: teamId ? "product" : "factory",
							scopeId: teamId,
							updatedBy: user?.id,
						}),
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
			// re-fetch thread so the sent message appears without closing and
			// reopening the overlay. The WS nudge will arrive shortly after, but
			// refresh() ensures immediate visibility.
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
			// The new thread now exists on this host — re-run the search that
			// resolves `existingThreadId`.
			threadSearch.retry();
		},
		[sendToThread, threadSearch],
	);

	if (agentsLoading || (myAgentId && threadSearch.status === "loading")) {
		return (
			<div className="flex flex-1 items-center justify-center p-4">
				<span className="loading loading-spinner loading-sm text-[var(--text-tertiary)]" />
			</div>
		);
	}

	if (!myAgentId || threadSearch.status === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-[9px] p-4">
				<p className="type-small  text-[var(--text-secondary)]">
					{threadSearch.error ?? "Couldn't find your assistant agent."}
				</p>
				<Button variant="ghost" size="sm" onClick={threadSearch.retry}>
					Retry
				</Button>
			</div>
		);
	}

	// B6: no thread yet — an empty compose-only state. The first send creates
	// the thread (`recipients: [myAgentId]`); no create-on-read, no flag.
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

	// AH3 §1.7b: Compute thinking/stale state from thread state (client-derived).
	// Show "thinking…" only when: last message is human AND within ASSISTANT_TURN_TIMEOUT_MS.
	// Show Retry card when: last message is human AND PAST the timeout (crash recovery).
	// @lore BC3 B5/B6: the overlay knows its own counterpart — it opened a
	// direct thread with exactly one agent — so "the last message is human"
	// is an identity comparison against that agent id, not a structural id
	// prefix check (which no longer means anything once every agent
	// is an ordinary owned agent).
	const lastMessage = msgsAsc[msgsAsc.length - 1];
	const lastMessageIsHuman = lastMessage !== undefined && lastMessage.senderId !== myAgentId;
	const lastMessageIsWithinTimeout =
		lastMessageIsHuman &&
		lastMessage !== undefined &&
		Date.now() - new Date(lastMessage.createdAt).getTime() < ASSISTANT_TURN_TIMEOUT_MS;
	const isThinking = lastMessageIsWithinTimeout;
	const isStale = lastMessageIsHuman && !lastMessageIsWithinTimeout;

	// AH3: Partition messages — notice messages are REMOVED from ThreadShell and
	// rendered as standalone notice cards below the thread. This ensures getByText
	// doesn't find the message bubble text AND the notice card title simultaneously.
	// @lore AH3: ThreadShell's `renderMessageExtra` injects BELOW the bubble
	// text — so both the bubble text and a card title would have matched
	// /no api key/i. Instead, we filter notice messages out of the messages
	// array and render them separately, unrelated to that prop.
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

	// @lore UI-138/139/140: The fragment return caused ThreadShell to receive no
	// definite height from the overlay's flex container, so the message list
	// clipped and the composer was invisible. A flex-1 min-h-0 wrapper gives
	// ThreadShell the h-full parent it requires. hideHostBanner suppresses the
	// duplicate "Assistant" header (UI-140) — the overlay already has its own.
	// Notice/thinking cards are rendered as shrink-0 rows below ThreadShell and
	// stay outside ThreadShell to avoid the text-collision mentioned in AH3 lore.
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
			{/* AH3: Notice/thinking/stale cards rendered OUTSIDE ThreadShell (avoids
			    text collision with the scroll area) and ABOVE the ThreadShell wrapper
			    so the composer stays pinned to the overlay bottom (NEW-13). */}
			{noticeMessages.map((m) => {
				const p = plainPayloadCache.get(m.id);
				if (p === undefined || isRedactedPayload(p) || p.notice === undefined) return null;
				return (
					<div key={m.id} className="shrink-0 px-[12px] pt-[9px]">
						<AssistantNoticeCard notice={p.notice} onRetry={refresh} />
					</div>
				);
			})}
			{/* AH3 §1.7b: Thinking indicator — client-derived from thread state */}
			{isThinking && (
				<div className="shrink-0 px-[12px] pt-[9px]">
					<ThinkingRow />
				</div>
			)}
			{/* AH3 §1.7b: Stale crash-recovery Retry card */}
			{isStale && (
				<div className="shrink-0 px-[12px] pt-[9px]">
					<StaleRetryCard onRetry={refresh} />
				</div>
			)}
			{/* flex-1 min-h-0 gives ThreadShell a parent with a definite height
			    so its internal h-full resolves correctly (UI-138/139). */}
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

/**
 * AssistantOverlay — the popover dialog anchored to the assistant trigger button.
 *
 * Renders nothing when `open === false`.
 *
 * @lore AI2: Migrated to useDialogBehavior with modal=false, layer="overlay".
 * modal=false: no scrim, no backdrop dismiss (L21 design rule: user must be able
 * to interact with Main content while overlay stays open). Escape still closes.
 * The overlay carries data-dialog-layer="overlay" (--z-overlay = 40) instead of
 * the old hardcoded z-30 class.
 */
export function AssistantOverlay({
	open,
	onClose,
	anchorRef: _anchorRef,
	contextRefs,
	onRemoveContextRef,
}: AssistantOverlayProps): JSX.Element | null {
	// @lore L21: modal=false → no scrim, no backdrop dismiss. Escape closes via behavior.
	const behavior = useDialogBehavior({
		open,
		onClose,
		isDirty: false,
		modal: false,
		layer: "overlay",
	});

	// @lore AI2: modal=false surfaces don't use a focus trap, so Escape must be caught
	// at document level (the overlay div won't receive keyboard events unless focused).
	// behavior.requestDismiss() is called on Escape so the guard rule applies.
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				behavior.requestDismiss();
			}
		};
		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, [open, behavior.requestDismiss]);

	if (!open) return null;

	const overlayProps = behavior.getOverlayProps();

	return (
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
			{/* Overlay close button bar — no title because ThreadShell's hostBanner
			    already shows the agent identity. A duplicate "Assistant" h2 here
			    caused two stacked headers (UI-140). Only the close control stays. */}
			<div className="border-width-thin-b flex items-center justify-end px-[12px] py-[6px]  border-[var(--border-subtle)] shrink-0">
				<button
					type="button"
					aria-label="Close assistant"
					/* AI5 AQ-015: 44px touch floor ≤1024px, dense 24px ≥1280px. */
					className="flex items-center justify-center w-[24px] h-[24px] min-h-[44px] min-w-[44px] xl:min-h-[24px] xl:min-w-[24px] rounded-[var(--r-pill)] bg-transparent border-none text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent-deep)]  "
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
				</button>
			</div>
			<AssistantOverlayInner contextRefs={contextRefs} onRemoveContextRef={onRemoveContextRef} />
		</div>
	);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// @lore AF14: Coc→Assistant rename complete. CocOverlay.tsx deleted. AssistantOverlay is the sole mount point.
// ---------------------------------------------------------------------------

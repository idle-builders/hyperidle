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
 * not a design-system custom component. It lives in packages/web/src/shell/.
 */

import { BetCard, ThreadShell, useDialogBehavior } from "@hyperidle/design-system";
import type {
	AssistantNotice,
	BlockRef,
	InlineRef,
	Message,
	PlainPayload,
	ToolCallSummary,
} from "@hyperidle/shared";
import { ASSISTANT_TURN_TIMEOUT_MS } from "@hyperidle/shared";
import { type JSX, type ReactNode, type RefObject, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BlockRefEmbed } from "../components/BlockRefEmbed.js";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { useAssistantThread } from "../hooks/useAssistantThread";
import { useBet } from "../hooks/useBet.js";
import { apiFetch } from "../services/api-fetch.js";
import { createOpenHandler } from "../services/open-handler.js";

/**
 * AD8b B3.1: Render a single tinted tool-call row.
 *
 * Design spec:
 *   - Background: rgba(22, 118, 79, 0.03) (forest green tint, very low opacity)
 *   - Radius: var(--r-subtle, 10px)
 *   - Padding: 9px 12px
 *   - Tool name: 11px mono uppercase, --text-tertiary color
 *   - Result summary: 13px, --text-secondary color
 */
function ToolCallRow({ toolCall }: { toolCall: ToolCallSummary }): JSX.Element {
	return (
		<div
			style={{
				background: "color-mix(in oklab, var(--accent-primary) 3%, transparent)",
				borderRadius: "var(--r-subtle, 10px)",
				padding: "9px 12px",
			}}
		>
			<div
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: "11px",
					textTransform: "uppercase",
					color: "var(--text-tertiary)",
					letterSpacing: "var(--tracking-caps-sm, 0.06em)",
					marginBottom: "3px",
				}}
			>
				{toolCall.name}
			</div>
			<div
				style={{
					fontSize: "13px",
					color: "var(--text-secondary)",
					wordBreak: "break-word",
				}}
			>
				{toolCall.output}
			</div>
		</div>
	);
}

/**
 * AK4 Task 6: Render a draft bet card below its toolCall row.
 *
 * When `toolCall.name` is `create_bet` or `edit_bet` and `status === 'ok'`,
 * parse `betId` from `toolCall.output` JSON, fetch via `useBet`, and render:
 *   - While loading: a skeleton placeholder (`data-testid="bet-draft-card-skeleton"`)
 *   - On data: a `BetCard` with `onClick → navigate('/work/bets/:betId')`
 *     (`data-testid="bet-draft-card"`)
 *   - On error or status !== 'ok': nothing (ToolCallRow already shows the error)
 *
 * @lore AK4: betId is parsed from the already-structured `output` JSON (design-it-twice A1).
 * The model CANNOT inject a betId — it is server-forced (CRITICAL-2 auth boundary).
 * All bet cards point at the same server-bound betId regardless of which toolCall rendered it.
 */
function BetDraftCardForToolCall({ toolCall }: { toolCall: ToolCallSummary }): JSX.Element | null {
	const navigate = useNavigate();

	// Only render for ok create_bet / edit_bet
	const isDraftBetTool =
		(toolCall.name === "create_bet" || toolCall.name === "edit_bet") && toolCall.status === "ok";

	let betId: string | undefined;
	if (isDraftBetTool) {
		try {
			const parsed = JSON.parse(toolCall.output) as { betId?: string };
			betId = parsed.betId;
		} catch {
			// unparseable output — no card
		}
	}

	// useBet is always called (hooks must not be conditional) but with undefined when not applicable
	const { data, loading } = useBet(isDraftBetTool && betId ? betId : undefined);

	if (!(isDraftBetTool && betId)) return null;

	if (loading) {
		return (
			<div
				data-testid="bet-draft-card-skeleton"
				style={{
					height: "80px",
					borderRadius: "var(--r-subtle)",
					background: "var(--surface-elevated)",
					animation: "pulse 1.5s ease-in-out infinite",
					marginTop: "6px",
				}}
			/>
		);
	}

	if (!data) return null;

	const capturedBetId = betId;
	return (
		<div data-testid="bet-draft-card" style={{ marginTop: "6px" }}>
			<BetCard
				title={data.title}
				team={data.team ?? ""}
				status={data.status}
				description={data.description}
				onClick={() => navigate(`/work/bets/${capturedBetId}`)}
			/>
		</div>
	);
}

/**
 * AD8b B3.1: Render tool-call summary rows for a plain message.
 *
 * When a plain message has payload.toolCalls, renders tinted rows stacked
 * vertically with 6px gap per the AC-7 design spec.
 *
 * @lore AD8b: Tool-call summaries are embedded on the assistant's plain
 * response message (not a separate message type). This keeps the thread
 * timeline clean while surfacing what the assistant actually did.
 *
 * @lore AK4: For `create_bet`/`edit_bet` ok toolCalls, `BetDraftCardForToolCall`
 * renders a BetCard alongside the ToolCallRow. Error toolCalls show only the row.
 */
function renderToolCallSummaries(message: Message): ReactNode {
	if (message.type !== "plain") return null;
	const payload = message.payload as PlainPayload;
	if (!payload.toolCalls || payload.toolCalls.length === 0) return null;

	return (
		<div
			data-testid="tool-call-summaries"
			style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}
		>
			{payload.toolCalls.map((tc, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: tool calls in a message are ordered and stable
				<div key={i}>
					<ToolCallRow toolCall={tc} />
					<BetDraftCardForToolCall toolCall={tc} />
				</div>
			))}
		</div>
	);
}

/**
 * T4: renderRefEmbeds for AssistantOverlay — builds BlockRefEmbed cards for block refs.
 * AM5 T9: accepts a navigate function so each embed wires the open contract (block-anchored open).
 * @lore AM5 T9: onOpen routes through createOpenHandler → host(hostKind, hostId, blockId) →
 * resolveHostRoute + #block-<id> fragment (H2/AC2). Cards are now interactive when in AssistantOverlay.
 */
function renderRefEmbedsForAssistant(
	refs: ReadonlyArray<InlineRef>,
	navigate: (path: string) => void,
): ReactNode {
	const blockRefs = refs.filter((r): r is BlockRef => r.kind === "block");
	if (blockRefs.length === 0) return null;
	const openHandler = createOpenHandler(navigate, {});
	return (
		<div className="flex flex-col gap-1 mt-1">
			{blockRefs.map((r) => (
				<BlockRefEmbed
					key={`${r.blockId}-${r.hostId}`}
					blockId={r.blockId}
					hostKind={r.hostKind}
					hostId={r.hostId}
					onOpen={() =>
						openHandler({
							route: "host",
							hostKind: r.hostKind,
							hostId: r.hostId,
							blockId: r.blockId,
						})
					}
				/>
			))}
		</div>
	);
}

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
		<span className="inline-flex items-center gap-1 rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
			<span className="font-mono text-[var(--text-tertiary)] uppercase text-[10px]">
				{contextRef.kind}
			</span>
			<span className="max-w-[120px] truncate">{contextRef.label}</span>
			<button
				type="button"
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
	affordance: JSX.Element;
}

function getNoticeConfig(notice: AssistantNotice, onRetry?: () => void): NoticeConfig {
	switch (notice.kind) {
		case "missing_key":
			return {
				title: "No API key yet",
				description:
					"I can't think until an API key is set. Add your Anthropic key to get started.",
				colorToken: "var(--status-warning)",
				affordance: (
					<button
						type="button"
						className="text-[12px] font-[500] px-[9px] py-[6px] rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)]"
						onClick={() => {
							// Navigate to Settings → Credentials
							// @lore AH3: settings navigation is via existing nav patterns
							window.dispatchEvent(
								new CustomEvent("navigate-settings", { detail: { tab: "credentials" } }),
							);
						}}
					>
						Settings → Credentials
					</button>
				),
			};
		case "missing_harness":
			return {
				title: "Runtime not configured",
				description: "I don't have a runtime selected. Pick a harness for me and I'll be ready.",
				colorToken: "var(--status-warning)",
				affordance: (
					<button
						type="button"
						className="text-[12px] font-[500] px-[9px] py-[6px] rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)]"
						onClick={() => {
							window.dispatchEvent(
								new CustomEvent("navigate-settings", { detail: { tab: "agents" } }),
							);
						}}
					>
						Open Agent settings
					</button>
				),
			};
		case "provider_error":
			return {
				title: "Couldn't reach the model",
				description: "The model provider returned an error. This is usually temporary.",
				colorToken: "var(--status-error)",
				affordance: (
					<button
						type="button"
						className="text-[12px] font-[500] px-[9px] py-[6px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
			role="alert"
			style={{
				borderRadius: "var(--r-subtle)",
				border: `1.5px solid ${config.colorToken}`,
				padding: "12px",
				display: "flex",
				flexDirection: "column",
				gap: "6px",
			}}
		>
			<div
				style={{
					fontSize: "13px",
					fontWeight: 600,
					color: config.colorToken,
				}}
			>
				{config.title}
			</div>
			<div
				style={{
					fontSize: "12px",
					color: "var(--text-secondary)",
					lineHeight: "1.5",
				}}
			>
				{config.description}
				{notice.kind === "provider_error" && notice.code && (
					<code
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: "11px",
							background: "var(--surface-elevated)",
							borderRadius: "var(--r-subtle)",
							padding: "1px 4px",
							marginLeft: "6px",
						}}
					>
						{notice.code}
					</code>
				)}
			</div>
			<div style={{ marginTop: "3px" }}>{config.affordance}</div>
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
					fontSize: "13px",
					color: "var(--text-tertiary)",
				}}
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
	return (
		<div
			role="alert"
			style={{
				borderRadius: "var(--r-subtle)",
				border: "1.5px solid var(--status-error)",
				padding: "12px",
				display: "flex",
				flexDirection: "column",
				gap: "6px",
			}}
		>
			<div style={{ fontSize: "13px", fontWeight: 600, color: "var(--status-error)" }}>
				Couldn't reach the model
			</div>
			<div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
				That didn't finish — try again.
			</div>
			<div style={{ marginTop: "3px" }}>
				<button
					type="button"
					className="text-[12px] font-[500] px-[9px] py-[6px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
					onClick={onRetry}
				>
					Retry
				</button>
			</div>
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
	// AF14 AC2: destructure `refresh` so sent messages stay visible immediately.
	const { status, data, error, retry, refresh } = useAssistantThread();
	// AM5 T9: navigate for block-ref-embed open-contract wiring
	const navigate = useNavigate();

	const handleAppendMessage = useCallback(
		async (input: { type: string; payload: unknown; clientKey: string }): Promise<void> => {
			if (!data?.thread) return;
			const refsToSend = contextRefs.map((ref) =>
				ref.kind === "block"
					? ({
							kind: "block" as const,
							blockId: ref.blockId,
							hostKind: ref.hostKind,
							hostId: ref.hostId,
						} satisfies { kind: "block"; blockId: string; hostKind: string; hostId: string })
					: { kind: ref.kind, id: ref.id },
			);
			const payload =
				input.type === "plain" && typeof input.payload === "object" && input.payload !== null
					? {
							...(input.payload as Record<string, unknown>),
							refs: refsToSend.length > 0 ? refsToSend : undefined,
						}
					: input.payload;

			const res = await apiFetch(`/api/threads/${data.thread.id}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...input, payload }),
			});
			if (!res.ok) {
				const text = await res.text().catch(() => res.statusText);
				throw new Error(`Failed to send message: ${res.status} ${text}`);
			}
			// AF14 AC2: re-fetch thread so the sent message appears without
			// closing and reopening the overlay. The WS update will arrive
			// shortly after, but refresh() ensures immediate visibility.
			refresh();
		},
		[data?.thread, contextRefs, refresh],
	);

	if (status === "loading" || (!data && status !== "error")) {
		return (
			<div className="flex flex-1 items-center justify-center p-4">
				<span className="loading loading-spinner loading-sm text-[var(--text-tertiary)]" />
			</div>
		);
	}

	if (status === "error" || !data) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
				<p className="text-sm text-[var(--text-secondary)]">
					{error ?? "Failed to load assistant thread"}
				</p>
				<button type="button" className="btn btn-xs btn-ghost" onClick={retry}>
					Retry
				</button>
			</div>
		);
	}

	const { thread, messages, identities } = data;
	const msgsAsc: ReadonlyArray<Message> = [...messages].sort((a, b) =>
		a.createdAt.localeCompare(b.createdAt),
	);

	// AH3 §1.7b: Compute thinking/stale state from thread state (client-derived).
	// Show "thinking…" only when: last message is human AND within ASSISTANT_TURN_TIMEOUT_MS.
	// Show Retry card when: last message is human AND PAST the timeout (crash recovery).
	const lastMessage = msgsAsc[msgsAsc.length - 1];
	const lastMessageIsHuman = lastMessage !== undefined && !lastMessage.senderId.startsWith("ast-");
	const lastMessageIsWithinTimeout =
		lastMessageIsHuman &&
		lastMessage !== undefined &&
		Date.now() - new Date(lastMessage.createdAt).getTime() < ASSISTANT_TURN_TIMEOUT_MS;
	const isThinking = lastMessageIsWithinTimeout;
	const isStale = lastMessageIsHuman && !lastMessageIsWithinTimeout;

	// AH3: Partition messages — notice messages are REMOVED from ThreadShell and
	// rendered as standalone notice cards below the thread. This ensures getByText
	// doesn't find the message bubble text AND the notice card title simultaneously.
	// @lore AH3: renderMessageExtra injects BELOW the bubble text — so if we used it,
	// both the bubble text and card title would match /no api key/i. Instead, we
	// filter notice messages out of the messages array and render them separately.
	const noticeMessages = msgsAsc.filter(
		(m): m is Message & { type: "plain" } =>
			m.type === "plain" && !!(m.payload as PlainPayload).notice,
	);
	const threadMessages = msgsAsc.filter(
		(m) => m.type !== "plain" || !(m.payload as PlainPayload).notice,
	);

	return (
		<>
			{/* Context chips area — only renders when refs are attached */}
			{contextRefs.length > 0 && (
				<div
					data-testid="assistant-context-chips"
					className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)] px-3 py-2"
				>
					{contextRefs.map((contextRef, i) => (
						<ContextChip
							key={
								contextRef.kind === "block"
									? `${contextRef.kind}-${contextRef.blockId}-${contextRef.hostId}`
									: `${contextRef.kind}-${contextRef.id}`
							}
							ref={contextRef}
							index={i}
							onRemove={onRemoveContextRef}
						/>
					))}
				</div>
			)}
			<ThreadShell
				thread={thread}
				messages={threadMessages}
				identities={identities}
				onAppendMessage={handleAppendMessage}
				hostTitle="Assistant"
				renderRefEmbeds={(refs) => renderRefEmbedsForAssistant(refs, navigate)}
				renderMessageExtra={renderToolCallSummaries}
			/>
			{/* AH3: Notice cards rendered OUTSIDE ThreadShell to avoid text collision */}
			{noticeMessages.map((m) => {
				const noticePayload = m.payload as PlainPayload;
				if (!noticePayload.notice) return null;
				return (
					<div key={m.id} className="px-[12px] pb-[9px]">
						<AssistantNoticeCard notice={noticePayload.notice} onRetry={refresh} />
					</div>
				);
			})}
			{/* AH3 §1.7b: Thinking indicator — client-derived from thread state */}
			{isThinking && (
				<div className="px-[12px] pb-[9px]">
					<ThinkingRow />
				</div>
			)}
			{/* AH3 §1.7b: Stale crash-recovery Retry card */}
			{isStale && (
				<div className="px-[12px] pb-[9px]">
					<StaleRetryCard onRetry={refresh} />
				</div>
			)}
		</>
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
	// Extract the memoized requestDismiss so the effect below has a stable dep reference.
	// behavior is a new object each render; requestDismiss is useCallback-memoized inside
	// useDialogBehavior and only changes when guarding/isDirty/onClose change.
	const { requestDismiss } = behavior;

	// @lore AI2: modal=false surfaces don't use a focus trap, so Escape must be caught
	// at document level (the overlay div won't receive keyboard events unless focused).
	// behavior.requestDismiss() is called on Escape so the guard rule applies.
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
		<div
			role={overlayProps.role}
			aria-label="Assistant conversation"
			aria-modal={overlayProps["aria-modal"]}
			data-dialog-layer={overlayProps["data-dialog-layer"]}
			onKeyDown={overlayProps.onKeyDown}
			className={[
				"fixed bottom-16 right-4",
				"w-[360px] min-h-[200px] max-h-[70vh]",
				"flex flex-col overflow-hidden",
				"rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-overlay)]",
				"shadow-[var(--shadow-elevated)]",
				"animate-[assistant-open_var(--motion-fast)_ease-out_forwards]",
			].join(" ")}
			style={{ zIndex: overlayProps.style.zIndex }}
		>
			{/* Overlay header bar: "Assistant" title + close button */}
			<div className="flex items-center justify-between px-[12px] py-[9px] border-b border-[var(--border-subtle)] shrink-0">
				<h2
					className="text-[15px] font-[600] text-[var(--text-primary)]"
					id="assistant-overlay-title"
				>
					Assistant
				</h2>
				<button
					type="button"
					aria-label="Close assistant"
					/* AI5 AQ-015: 44px touch floor ≤1024px, dense 24px ≥1280px. */
					className="flex items-center justify-center w-[24px] h-[24px] min-h-[44px] min-w-[44px] xl:min-h-[24px] xl:min-w-[24px] rounded-[var(--r-pill)] bg-transparent border-none text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)]"
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

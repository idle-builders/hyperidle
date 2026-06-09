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

import { ThreadShell } from "@hyperidle/design-system";
import type {
	BlockRef,
	InlineRef,
	Message,
	PlainPayload,
	ToolCallSummary,
} from "@hyperidle/shared";
import { type JSX, type ReactNode, type RefObject, useCallback, useEffect, useRef } from "react";
import { BlockRefEmbed } from "../components/BlockRefEmbed.js";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { useAssistantThread } from "../hooks/useAssistantThread";
import { apiFetch } from "../services/api-fetch.js";

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
				background: "rgba(22, 118, 79, 0.03)",
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
 * AD8b B3.1: Render tool-call summary rows for a plain message.
 *
 * When a plain message has payload.toolCalls, renders tinted rows stacked
 * vertically with 6px gap per the AC-7 design spec.
 *
 * @lore AD8b: Tool-call summaries are embedded on the assistant's plain
 * response message (not a separate message type). This keeps the thread
 * timeline clean while surfacing what the assistant actually did.
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
				<ToolCallRow key={i} toolCall={tc} />
			))}
		</div>
	);
}

/**
 * T4: renderRefEmbeds for AssistantOverlay — builds BlockRefEmbed cards for block refs.
 */
function renderRefEmbedsForAssistant(refs: ReadonlyArray<InlineRef>): ReactNode {
	const blockRefs = refs.filter((r): r is BlockRef => r.kind === "block");
	if (blockRefs.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 mt-1">
			{blockRefs.map((r) => (
				<BlockRefEmbed
					key={`${r.blockId}-${r.hostId}`}
					blockId={r.blockId}
					hostKind={r.hostKind}
					hostId={r.hostId}
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

function AssistantOverlayInner({
	contextRefs,
	onRemoveContextRef,
}: {
	contextRefs: ReadonlyArray<AssistantContextRef>;
	onRemoveContextRef: (index: number) => void;
}): JSX.Element {
	const { status, data, error, retry } = useAssistantThread();

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
		},
		[data?.thread, contextRefs],
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
				messages={msgsAsc}
				identities={identities}
				onAppendMessage={handleAppendMessage}
				hostTitle="Assistant"
				renderRefEmbeds={renderRefEmbedsForAssistant}
				renderMessageExtra={renderToolCallSummaries}
			/>
		</>
	);
}

/**
 * AssistantOverlay — the popover dialog anchored to the assistant trigger button.
 *
 * Renders nothing when `open === false`.
 */
export function AssistantOverlay({
	open,
	onClose,
	anchorRef: _anchorRef,
	contextRefs,
	onRemoveContextRef,
}: AssistantOverlayProps): JSX.Element | null {
	const dialogRef = useRef<HTMLDivElement>(null);

	// Escape key closes the overlay.
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, [open, onClose]);

	// Focus management: move focus into the overlay when it opens.
	useEffect(() => {
		if (!open) return;
		const el = dialogRef.current;
		if (!el) return;
		const focusable = el.querySelector<HTMLElement>(
			"button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
		);
		focusable?.focus();
	}, [open]);

	if (!open) return null;

	return (
		<div
			ref={dialogRef}
			role="dialog"
			aria-label="Assistant conversation"
			aria-modal="false"
			className={[
				"fixed bottom-16 right-4",
				"w-[360px] min-h-[200px] max-h-[70vh]",
				"flex flex-col overflow-hidden",
				"rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-overlay)]",
				"shadow-[var(--shadow-elevated)]",
				"z-30",
				"animate-[coc-open_var(--motion-fast)_ease-out_forwards]",
			].join(" ")}
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
					className="flex items-center justify-center w-[24px] h-[24px] rounded-[var(--r-pill)] bg-transparent border-none text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)]"
					onClick={onClose}
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
// @lore AD8b: CocOverlay.tsx re-exports from this module for backward compat.
// ---------------------------------------------------------------------------

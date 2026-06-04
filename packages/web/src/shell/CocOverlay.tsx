/**
 * L21 — CocOverlay
 *
 * Popover overlay that renders a ThreadShell in coach configuration.
 * Anchored to the CocTrigger button ref.
 *
 * Positioning: grows upward and to the right from the trigger's top corner.
 * Dimensions: 360px wide, max-height 70vh. z-index 30 (above Main, below Settings).
 *
 * @lore L21 (design): overlay does NOT close on clicking outside. The user
 * must be able to interact with Main content (to select context items via the
 * "+" attach affordance) while the overlay remains open. Only Escape and
 * clicking the trigger again close it.
 *
 * @lore L21 (arch): CocOverlay is a shell-level composition (like SettingsPanel)
 * not a design-system custom component. It lives in packages/web/src/shell/.
 */

import { ThreadShell } from "@hyperidle/design-system";
import type { BlockRef, InlineRef, Message } from "@hyperidle/shared";
import { type JSX, type ReactNode, type RefObject, useCallback, useEffect, useRef } from "react";
import { BlockRefEmbed } from "../components/BlockRefEmbed.js";
import type { CocContextRef } from "../contexts/CocContext";
import { useCocThread } from "../hooks/useCocThread";
import { apiFetch } from "../services/api-fetch.js";

/**
 * T4: renderRefEmbeds for CocOverlay — builds BlockRefEmbed cards for block refs.
 *
 * @lore T4: Wired in CocOverlay (not HostThreadSection) per reviewer critique:
 * the reviewer found that plan §4.6 wiring was in HostThreadSection/WorkBet.tsx,
 * but those are not ThreadShell consumers — only CocOverlay and Conversations are.
 */
function renderRefEmbedsForCoc(refs: ReadonlyArray<InlineRef>): ReactNode {
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

export interface CocOverlayProps {
	open: boolean;
	onClose: () => void;
	/** @lore L21: anchorRef is reserved for future dynamic positioning relative
	 * to the CocTrigger button. Currently the overlay uses fixed bottom-16 right-4
	 * positioning. The prop is optional — pass a ref when dynamic anchoring lands. */
	anchorRef?: RefObject<HTMLButtonElement | null>;
	contextRefs: ReadonlyArray<CocContextRef>;
	onRemoveContextRef: (index: number) => void;
}

/**
 * Context chip rendered above the composer in the overlay.
 * Shows kind-icon + label + dismiss button.
 */
function ContextChip({
	ref: cocRef,
	index,
	onRemove,
}: {
	ref: CocContextRef;
	index: number;
	onRemove: (i: number) => void;
}): JSX.Element {
	return (
		<span className="inline-flex items-center gap-1 rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
			<span className="font-mono text-[var(--text-tertiary)] uppercase text-[10px]">
				{cocRef.kind}
			</span>
			<span className="max-w-[120px] truncate">{cocRef.label}</span>
			<button
				type="button"
				aria-label={`Remove ${cocRef.label}`}
				className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
				onClick={() => onRemove(index)}
			>
				×
			</button>
		</span>
	);
}

function CocOverlayInner({
	contextRefs,
	onRemoveContextRef,
}: {
	contextRefs: ReadonlyArray<CocContextRef>;
	onRemoveContextRef: (index: number) => void;
}): JSX.Element {
	const { status, data, error, retry } = useCocThread();

	const handleAppendMessage = useCallback(
		async (input: { type: string; payload: unknown; clientKey: string }): Promise<void> => {
			if (!data?.thread) return;
			// T4: serialize block refs with their full triple; entity refs with kind+id only.
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
			// @lore L21 review S1: throw on non-ok so ThreadShell's Composer
			// receives the rejection and can surface an error state to the user.
			// Silently discarding fetch errors (the prior behaviour) meant the
			// user had no indication their message failed to send.
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
					{error ?? "Failed to load coach thread"}
				</p>
				<button type="button" className="btn btn-xs btn-ghost" onClick={retry}>
					Retry
				</button>
			</div>
		);
	}

	const { thread, messages, identities } = data;
	// Sort messages ascending for ThreadShell (it handles descending internally).
	const msgsAsc: ReadonlyArray<Message> = [...messages].sort((a, b) =>
		a.createdAt.localeCompare(b.createdAt),
	);

	return (
		<>
			{/* Context chips area — only renders when refs are attached */}
			{contextRefs.length > 0 && (
				<div
					data-testid="coc-context-chips"
					className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)] px-3 py-2"
				>
					{contextRefs.map((cocRef, i) => (
						<ContextChip
							key={
								cocRef.kind === "block"
									? `${cocRef.kind}-${cocRef.blockId}-${cocRef.hostId}`
									: `${cocRef.kind}-${cocRef.id}`
							}
							ref={cocRef}
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
				hostTitle="Chief of Staff"
				renderRefEmbeds={renderRefEmbedsForCoc}
			/>
		</>
	);
}

/**
 * CocOverlay — the popover dialog anchored to the CocTrigger button.
 *
 * Renders nothing when `open === false`.
 */
export function CocOverlay({
	open,
	onClose,
	anchorRef: _anchorRef,
	contextRefs,
	onRemoveContextRef,
}: CocOverlayProps): JSX.Element | null {
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
		// Focus the first focusable element inside the overlay.
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
			aria-label="Chief of Staff conversation"
			aria-modal="false"
			className={[
				// Positioning: fixed, bottom-right of the viewport above the Rail trigger area.
				// @lore L21: the overlay anchors to the Rail's bottom-right. Using fixed
				// positioning rather than absolute avoids z-index stacking context issues
				// with nested overflow containers in AppShell. The offset is calibrated to
				// sit above the trigger button in the Rail.
				"fixed bottom-16 right-4",
				// Dimensions per design spec (approved.md).
				"w-[360px] min-h-[200px] max-h-[70vh]",
				// Surface + border + shadow per design spec.
				// @lore visual-parity C-03: surface-overlay (not surface-container — that is for sidebars/inset areas).
				// shadow-elevated (not --float, which is not a Hearth token).
				"flex flex-col overflow-hidden",
				"rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-overlay)]",
				"shadow-[var(--shadow-elevated)]",
				// z-index: above Main (z-0), below Settings (z-40).
				"z-30",
				// Animation: fade in + subtle translate up.
				"animate-[coc-open_var(--motion-fast)_ease-out_forwards]",
			].join(" ")}
		>
			{/* Overlay header bar: "Assistant" title + close button */}
			<div className="flex items-center justify-between px-[12px] py-[9px] border-b border-[var(--border-subtle)] shrink-0">
				{/* Visually-hidden heading kept for screen readers; visible label shown in header */}
				<h2 className="text-[15px] font-[600] text-[var(--text-primary)]" id="coc-overlay-title">
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
			<CocOverlayInner contextRefs={contextRefs} onRemoveContextRef={onRemoveContextRef} />
		</div>
	);
}

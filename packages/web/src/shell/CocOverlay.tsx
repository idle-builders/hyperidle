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
import type { Message } from "@hyperidle/shared";
import { type JSX, type RefObject, useCallback, useEffect, useRef } from "react";
import type { CocContextRef } from "../contexts/CocContext";
import { useCocThread } from "../hooks/useCocThread";

export interface CocOverlayProps {
	open: boolean;
	onClose: () => void;
	anchorRef: RefObject<HTMLButtonElement | null>;
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
		<span className="inline-flex items-center gap-1 rounded-[var(--r1)] border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-xs text-[var(--text-mid)]">
			<span className="font-mono text-[var(--text-lo)] uppercase text-[10px]">{cocRef.kind}</span>
			<span className="max-w-[120px] truncate">{cocRef.label}</span>
			<button
				type="button"
				aria-label={`Remove ${cocRef.label}`}
				className="ml-1 text-[var(--text-lo)] hover:text-[var(--text-hi)]"
				onClick={() => onRemove(index)}
			>
				×
			</button>
		</span>
	);
}

function CocOverlayInner({
	onClose,
	contextRefs,
	onRemoveContextRef,
}: {
	onClose: () => void;
	contextRefs: ReadonlyArray<CocContextRef>;
	onRemoveContextRef: (index: number) => void;
}): JSX.Element {
	const { status, data, error, retry } = useCocThread();

	const handleAppendMessage = useCallback(
		async (input: { type: string; payload: unknown; clientKey: string }): Promise<void> => {
			if (!data?.thread) return;
			const refsToSend = contextRefs.map(({ kind, id }) => ({ kind, id }));
			const payload =
				input.type === "plain" && typeof input.payload === "object" && input.payload !== null
					? {
							...(input.payload as Record<string, unknown>),
							refs: refsToSend.length > 0 ? refsToSend : undefined,
						}
					: input.payload;

			await fetch(`/api/threads/${data.thread.id}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...input, payload }),
			});
		},
		[data?.thread, contextRefs],
	);

	if (status === "loading" || (!data && status !== "error")) {
		return (
			<div className="flex flex-1 items-center justify-center p-4">
				<span className="loading loading-spinner loading-sm text-[var(--text-lo)]" />
			</div>
		);
	}

	if (status === "error" || !data) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
				<p className="text-sm text-[var(--text-mid)]">{error ?? "Failed to load coach thread"}</p>
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
							key={`${cocRef.kind}-${cocRef.id}`}
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
				"flex flex-col overflow-hidden",
				"rounded-[var(--r2)] border border-[var(--border-default)] bg-[var(--surface-2)]",
				"shadow-[var(--float)]",
				// z-index: above Main (z-0), below Settings (z-40).
				"z-30",
				// Animation: fade in + subtle translate up.
				"animate-[coc-open_var(--motion-fast)_ease-out_forwards]",
			].join(" ")}
		>
			{/* Visually-hidden heading for screen reader announcement */}
			<h2 className="sr-only" id="coc-overlay-title">
				Chief of Staff
			</h2>
			<CocOverlayInner
				onClose={onClose}
				contextRefs={contextRefs}
				onRemoveContextRef={onRemoveContextRef}
			/>
		</div>
	);
}

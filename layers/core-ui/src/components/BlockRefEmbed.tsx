/**
 * T4 — BlockRefEmbed component.
 *
 * Renders a block reference as an inline embed card inside a thread message.
 * Uses useBlockResolution to fetch and resolve the referenced block.
 *
 * States:
 *   loading  — skeleton shimmer (while fetching host body)
 *   resolved — block content in a bordered card with host label
 *   degraded — "source changed" indicator (block no longer exists)
 *   error    — "could not load" with retry button
 *
 * @lore T4: BlockRefEmbed is a web-layer component that does data fetching.
 * It cannot live in the design-system (which must stay fetch-free). The integration
 * point is ThreadShell's renderRefEmbeds render prop which calls into this component.
 */

import type { BlockHostKind } from "../block/types.js";
import type { JSX } from "react";
import { ErrorState, renderPayload, Skeleton } from "../ds";
import { useBlockResolution } from "../hooks/useBlockResolution.js";

export interface BlockRefEmbedProps {
	blockId: string;
	hostKind: BlockHostKind;
	hostId: string;
	/**
	 * AM5 T9 WIRE: Called when the user clicks the embed card to open the block in context.
	 * Routes through the open contract (block-anchored open, H2/AC2) — caller supplies
	 * createOpenHandler to keep this component navigation-agnostic.
	 * When absent, the card is non-interactive (backward compat).
	 */
	onOpen?: () => void;
}

/**
 * Renders an inline embed card for a block reference in a thread message.
 */
export function BlockRefEmbed({
	blockId,
	hostKind,
	hostId,
	onOpen,
}: BlockRefEmbedProps): JSX.Element {
	const { status, payload, hostLabel, error, retry } = useBlockResolution(
		hostKind,
		hostId,
		blockId,
	);

	if (status === "loading") {
		// AI5: shared Skeleton single bar (skeleton-pulse, not animate-pulse).
		return (
			<Skeleton
				height="32px"
				ariaLabel="Loading block reference"
				dataTestId="block-ref-embed-loading"
			/>
		);
	}

	if (status === "degraded") {
		return (
			<div
				data-testid="block-ref-embed-degraded"
				className="border-width-thin  border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-3 py-2 bg-[var(--surface-container)]"
			>
				<div className="type-label  uppercase  text-[var(--text-tertiary)] mb-[6px]">
					Block from {hostLabel ?? hostKind}
				</div>
				<div className="type-metadata  text-[var(--text-tertiary)] italic">
					Source changed — the referenced block no longer exists in the source document.
				</div>
			</div>
		);
	}

	if (status === "error") {
		// AI5: shared compact ErrorState (inline, no shadow), preserving the
		// original error copy + retry affordance.
		return (
			<ErrorState
				compact
				title="Could not load reference"
				description={error ?? "Could not load referenced content"}
				// @lore AI5: the error state always offers retry (production
				// useBlockResolution always returns a retry fn); guard so the
				// affordance renders even if a caller omits it.
				onRetry={retry ?? (() => undefined)}
				dataTestId="block-ref-embed-error"
			/>
		);
	}

	// status === "resolved"
	if (!payload) return <></>;

	// AM5 T9: wire onOpen to make the embed card interactive when the open contract is supplied.
	// Uses button wrapper only when onOpen is provided (keyboard + pointer accessible, backward compat).
	const cardContent = (
		<>
			<div className="type-label  uppercase  text-[var(--text-tertiary)] mb-[6px]">
				Block from {hostLabel ?? hostKind}
			</div>
			<div className="type-small  text-[var(--text-secondary)]">{renderPayload(payload)}</div>
		</>
	);

	if (onOpen) {
		return (
			<button
				type="button"
				data-testid="block-ref-embed-resolved"
				onClick={onOpen}
				className="border-width-thin w-full text-left  border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-3 py-2 bg-[var(--surface-container)] hover:bg-[var(--surface-container)] hover:border-[var(--border-default)]   focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
			>
				{cardContent}
			</button>
		);
	}

	return (
		<div
			data-testid="block-ref-embed-resolved"
			className="border-width-thin  border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-3 py-2 bg-[var(--surface-container)]"
		>
			{cardContent}
		</div>
	);
}

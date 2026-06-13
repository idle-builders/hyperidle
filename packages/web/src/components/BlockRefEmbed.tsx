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

import { ErrorState, renderPayload, Skeleton } from "@hyperidle/design-system";
import type { BlockHostKind } from "@hyperidle/shared";
import type { JSX } from "react";
import { useBlockResolution } from "../hooks/useBlockResolution.js";

export interface BlockRefEmbedProps {
	blockId: string;
	hostKind: BlockHostKind;
	hostId: string;
}

/**
 * Renders an inline embed card for a block reference in a thread message.
 */
export function BlockRefEmbed({ blockId, hostKind, hostId }: BlockRefEmbedProps): JSX.Element {
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
				className="border border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-3 py-2 bg-[var(--surface-container)]"
			>
				<div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
					Block from {hostLabel ?? hostKind}
				</div>
				<div className="text-[12px] text-[var(--text-tertiary)] italic">
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

	return (
		<div
			data-testid="block-ref-embed-resolved"
			className="border border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-3 py-2 bg-[var(--surface-container)]"
		>
			<div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
				Block from {hostLabel ?? hostKind}
			</div>
			<div className="text-[13px] text-[var(--text-secondary)]">{renderPayload(payload)}</div>
		</div>
	);
}

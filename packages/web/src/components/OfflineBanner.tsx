import type { JSX } from "react";

/**
 * L5 — Offline indicator banner. Renders only when network is unreachable.
 * The companion `useOfflineQueue` hook tracks queued verdict commits and
 * replays them on reconnect; this component renders the visual state.
 *
 * @lore L5 ADV-03: offline-handling acceptance criterion. When online but
 * a sync just completed, we surface a "Synced N items" toast via
 * `syncedToast` instead of the offline banner. The two states are
 * mutually exclusive (consumer decides which to render).
 */

export interface OfflineBannerProps {
	/** Whether the network is currently unreachable. */
	offline: boolean;
	/** When set, render a "Synced N items" toast instead. Counts replayed verdicts. */
	syncedCount?: number | null;
	onDismissSyncedToast?: () => void;
}

export function OfflineBanner({
	offline,
	syncedCount,
	onDismissSyncedToast,
}: OfflineBannerProps): JSX.Element | null {
	if (offline) {
		return (
			<div
				role="status"
				aria-live="polite"
				data-testid="offline-banner"
				className="flex h-9 items-center justify-center gap-2 border-b border-[var(--border-default)] bg-[color-mix(in_oklab,var(--warn)_20%,transparent)] px-3 text-xs text-[var(--text-hi)]"
			>
				<span aria-hidden="true">●</span>
				<span>Offline — verdicts will queue and sync on reconnect.</span>
			</div>
		);
	}
	if (typeof syncedCount === "number" && syncedCount > 0) {
		const noun = syncedCount === 1 ? "item" : "items";
		return (
			<div
				role="status"
				aria-live="polite"
				data-testid="synced-toast"
				className="fixed bottom-32 left-1/2 z-40 -translate-x-1/2 rounded-[var(--r2)] border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-hi)] shadow-[var(--float)]"
			>
				<button
					type="button"
					onClick={onDismissSyncedToast}
					className="flex items-center gap-2"
					aria-label={`Dismiss synced confirmation: ${syncedCount} ${noun} synced`}
				>
					<svg aria-hidden="true" width={12} height={12} viewBox="0 0 12 12" fill="currentColor">
						<path d="M10.5 3L4.5 9L1.5 6l1-1l2 2l5-5z" />
					</svg>
					<span>
						Synced {syncedCount} {noun}
					</span>
				</button>
			</div>
		);
	}
	return null;
}

/**
 * AF8 — Notification drain loop.
 *
 * A 1-minute interval that calls `flushQueue` (which already calls
 * `recoverStuckLeases` at its top). The drain makes lease recovery automatic:
 * stuck leases are recovered on every tick without manual intervention.
 *
 * @lore AF8: The drain does NOT replace the dispatcher's direct-send path.
 * The dispatcher still attempts immediate push for non-silenced rows.
 * The drain handles the PENDING rows that the dispatcher deferred
 * (silenced/quiet-hours/flood-coalesced/retry). For the in-app popover,
 * rows are written to the store and the popover reads them — egress delivery
 * via the drain is orthogonal to in-app display.
 *
 * @lore AF8: COST-BREACH SILENCE SPLIT (concept hard rule #8).
 * The drain calls the updated flushQueue which implements the split:
 *   - cost_breach bypasses factory silence (silence_mode) but RESPECTS quiet hours
 *   - blocking defers on either factory silence OR quiet hours
 *   - digest always flushes (non-interruptive)
 * See flushQueue in dispatcher.ts for the implementation.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { loadNotificationConfig } from "./config.js";
import type { AdapterFactory } from "./dispatcher.js";
import { flushQueue } from "./dispatcher.js";
import type { NotificationsConfigDeps, NotificationsSilenceDeps } from "./ports.js";

export const NOTIFICATION_DRAIN_INTERVAL_MS = 60_000; // 1 minute

export interface DrainDeps {
	now?: () => Date;
	/**
	 * @lore AU19 Increment 1g: `loadNotificationConfig`/`flushQueue` both need
	 * injected ports (Mechanism C) now that `notifications` is a nested
	 * Service package — `packages/server` wires the real functions, zero
	 * behavior change.
	 */
	notificationsConfig: NotificationsConfigDeps;
	silencePolicy: NotificationsSilenceDeps;
}

/**
 * Start the notification drain on a 1-minute interval.
 * Each tick: load config; if disabled, no-op; else flushQueue.
 * Returns a disposer that stops the interval.
 */
export function startNotificationDrain(
	db: HyperIdleDb,
	factory: AdapterFactory,
	deps: DrainDeps,
): () => void {
	const nowFn = deps.now ?? ((): Date => new Date());

	const handle = setInterval(() => {
		void (async () => {
			const cfg = await loadNotificationConfig(db, deps.notificationsConfig);
			if (!cfg) return;
			await flushQueue(db, factory, cfg, nowFn(), deps.silencePolicy);
		})();
	}, NOTIFICATION_DRAIN_INTERVAL_MS);

	return (): void => {
		clearInterval(handle);
	};
}

/**
 * @lore AU20 Stage 2: minimal barrel — ~12m/8t (design target: 12m/10t).
 * The 66m/44t sprawl is deleted; only the coherent product API is re-exported.
 *
 * Queue ops (4m/3t):
 *   enqueue, listNotifications, markNotifications, reap
 *   + NotificationFilter, NotificationSelector, NotificationPatch
 *
 * Delivery engine (1m/2t):
 *   deliver
 *   + DeliverySpec, DeliveryResult
 *
 * Config + prefs (4m):
 *   readConfig, updateConfig, readPreferences, updatePreferences
 *
 * Shared deps type (1t):
 *   NotificationsDeps
 *
 * @lore AU43: getDailyDigest (demo-only trigger), isSilenced (constant-false,
 * no writer), Notification / NotificationAdapter / NotificationChannel (adapter
 * abstraction over one channel) removed from the public surface.
 *
 * @lore BC3 architecture.md §5 B7: `installNotifications` (the inbox-enqueue
 * listener) removed — its only production trigger was the policy engine's
 * "attention" event, deleted with `items` (R2).
 */

export type { DeliveryResult, DeliverySpec } from "./install.js";

export { deliver, readPreferences, updatePreferences } from "./install.js";
export type {
	NotificationFilter,
	NotificationPatch,
	NotificationSelector,
} from "./notification-queue.js";
export { enqueue, listNotifications, markNotifications, reap } from "./notification-queue.js";
export type { NotificationsDeps } from "./ports.js";

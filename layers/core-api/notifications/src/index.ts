/**
 * @lore AU20 Stage 2: minimal barrel — ~12m/8t (design target: 12m/10t).
 * The 66m/44t sprawl is deleted; only the coherent product API is re-exported.
 *
 * Queue ops (4m/3t):
 *   enqueue, listNotifications, markNotifications, reap
 *   + NotificationFilter, NotificationSelector, NotificationPatch
 *
 * Delivery engine (2m/4t):
 *   installNotifications, deliver
 *   + DeliverySpec, DeliveryResult, NotificationConfigPatch, SafeNotificationConfig
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
 */

export type {
	DeliveryResult,
	DeliverySpec,
	NotificationConfigPatch,
	SafeNotificationConfig,
} from "./install.js";

export {
	deliver,
	installNotifications,
	readConfig,
	readPreferences,
	updateConfig,
	updatePreferences,
} from "./install.js";
export type {
	NotificationFilter,
	NotificationPatch,
	NotificationSelector,
} from "./notification-queue.js";
export { enqueue, listNotifications, markNotifications, reap } from "./notification-queue.js";
export type { NotificationsDeps } from "./ports.js";

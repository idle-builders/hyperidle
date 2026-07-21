/**
 * @lore AU20 Stage 2: minimal barrel — ~12m/11t (design target: 12m/10t).
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
 * Silence (1m):
 *   isSilenced
 *
 * Daily digest (1m):
 *   getDailyDigest
 *
 * Shared deps type (1t):
 *   NotificationsDeps
 *
 * Base types (3t):
 *   Notification, NotificationChannel, NotificationAdapter
 */

export { getDailyDigest } from "./daily-digest.js";
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
export { isSilenced } from "./silence-policy.js";
export type { Notification, NotificationAdapter, NotificationChannel } from "./types.js";

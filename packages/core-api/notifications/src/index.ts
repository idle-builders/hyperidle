/**
 * Barrel for @hyperidle/notifications (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `notificationQueue` pgTable object — that would let a consumer obtain the
 * table transitively and defeat Table ACL (Mechanism A). Consumers get typed
 * functions; the table stays private to this Service.
 *
 * @lore AU19 Increment 1g: this is the real cut-over — `adapter-factory.ts`,
 * `config.ts`, `console-adapter.ts`, `daily-digest.ts`, `digest.ts`,
 * `dispatcher.ts`, `drain.ts`, `mute.ts`, `notification-listener.ts`,
 * `notification-queue.ts`, `ntfy-adapter.ts`, `redact.ts`, `silence-policy.ts`,
 * `smtp-adapter.ts`, `types.ts` moved here from `packages/server/src/notifications/`
 * unchanged (behavior-preserving move, aside from the DI-port signature
 * additions documented in `ports.ts`). Five real outbound edges (`settings`,
 * `conversation`, `work`, `users`, `connections`) became injected DI ports
 * (Mechanism C, see `ports.ts`); a sixth (`org`, `teamMembers`-by-id) was a
 * table-ownership-guard completeness finding, also ported.
 */

// -- adapter factory (config → concrete NotificationAdapter) --
export { defaultNotificationAdapterFactory } from "./adapter-factory.js";
// -- config (server_config.notifications projection + secrets) --
export type {
	NotificationConfig,
	NotificationConfigPatch,
	SafeNotificationConfig,
} from "./config.js";
export {
	assertNtfyUrlNotSSRF,
	loadNotificationConfig,
	pickRecipient,
	readNotificationConfig,
	redactNotificationConfig,
	sanitizeCron,
	sanitizeEmail,
	sanitizeNtfyUrl,
	sanitizeSmtpCredential,
	sanitizeSmtpHost,
	sanitizeTopic,
	updateNotificationConfig,
} from "./config.js";
// -- console adapter --
export type { ConsoleAdapterOptions } from "./console-adapter.js";
export { createConsoleAdapter } from "./console-adapter.js";
// -- daily digest (E7 — queued items with no verdict in the last 24h) --
export { getDailyDigest } from "./daily-digest.js";
// -- digest (drain-all-pending → one batched send) --
export type { DigestResult } from "./digest.js";
export { runDailyDigest } from "./digest.js";
// -- dispatcher (event-bus subscriber → route/push/queue) --
export type { AdapterFactory, AlertPreferences, DispatcherDeps } from "./dispatcher.js";
export {
	applyAlertPreferences,
	dispatchDigest,
	enqueueNotification,
	flushQueue,
	recoverStuckLeases,
	registerNotificationDispatcher,
	tryFloodReserve,
} from "./dispatcher.js";
// -- drain (1-minute interval → flushQueue) --
export type { DrainDeps } from "./drain.js";
export { NOTIFICATION_DRAIN_INTERVAL_MS, startNotificationDrain } from "./drain.js";
// -- mute (per-type mute preferences) --
export type { MutePreferenceReader, MutePreferenceWriter } from "./mute.js";
export {
	defaultMutePreferenceReader,
	defaultMutePreferenceWriter,
	getMutedTypeKeys,
} from "./mute.js";
// -- notification listener (event → typed in-app row) --
export type { NotificationListenerDeps } from "./notification-listener.js";
export { registerNotificationListener } from "./notification-listener.js";
// -- notification queue (the ONLY module touching the notificationQueue table) --
// @lore AU20 Ag6a: 18 fragmented queue-CRUD functions collapsed into 4 general
// operations with discriminated filter/selector/patch types. Old functions remain
// as package-internal helpers (used by dispatcher.ts / digest.ts via relative
// import); only these 4 are public surface.
export type {
	EnqueueOptions,
	NotificationFilter,
	NotificationPatch,
	NotificationSelector,
} from "./notification-queue.js";
export {
	enqueue,
	listNotifications,
	markNotifications,
	reap,
} from "./notification-queue.js";
// -- DI ports (Mechanism C) --
export type {
	NotificationsConfigDeps,
	NotificationsConfigPatch,
	NotificationsConfigSection,
	NotificationsCredentialCipher,
	NotificationsCredentialStore,
	NotificationsDeliveryConfig,
	NotificationsDigestDeps,
	NotificationsMuteDeps,
	NotificationsServerConfigPort,
	NotificationsSilenceConfig,
	NotificationsSilenceDeps,
	NotificationsTeamReader,
	NotificationsUserReader,
	NotificationsVerdictReader,
	NotificationsWorkReader,
} from "./ports.js";
// -- redact (secret-scrubbing for error messages) --
export type { ScrubContext } from "./redact.js";
export { scrubErrorMessage } from "./redact.js";
// -- silence policy (factory/quiet-hours/per-team silence) --
export {
	isFactorySilenced,
	isInSilenceWindow,
	isSilenced,
	readSilenceWindow,
} from "./silence-policy.js";
// -- types (wire shapes shared across this Service's modules) --
export type {
	Classification,
	Notification,
	NotificationAdapter,
	NotificationChannel,
	NotificationSeverity,
	QueueReason,
	Recipient,
	SendResult,
} from "./types.js";

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
 *
 * @lore AU20 Ag6a: 18 fragmented queue-CRUD functions collapsed into 4 general
 * operations with discriminated filter/selector/patch types. Old functions remain
 * as package-internal helpers (used by dispatcher.ts / digest.ts via relative
 * import); only these 4 are public surface.
 *
 * @lore AU20 Ag6b: entire adapter + digest + mute/silence-policy + PII-redact +
 * SSRF-guard delivery chain absorbed behind `installNotifications` and the wrapper
 * functions in `install.ts`. The 15 individual DI-port types are replaced by one
 * collapsed `NotificationsDeps` bag. ~78 exports → ~20. Four queue types
 * (EnqueueOptions, NotificationFilter, NotificationPatch, NotificationSelector)
 * removed from barrel (zero external importers; callers use inline literals).
 * NOTIFICATION_QUEUE_CAP moved to notification-queue.ts so both the public
 * `enqueue` and the package-internal `enqueueNotification` share one ceiling.
 */

// -- config (public patch shape + safe read-only projection) --
export type { NotificationConfigPatch, SafeNotificationConfig } from "./config.js";
// -- daily digest query (status route) --
export { getDailyDigest } from "./daily-digest.js";
// -- digest dispatch result type --
export type { DigestResult } from "./digest.js";
// -- delivery chain entry point (config-driven, wires dispatcher+listener+drain) --
export {
	flush,
	installNotifications,
	readConfig,
	readPreferences,
	runDigest,
	sendTest,
	updateConfig,
	updatePreferences,
} from "./install.js";
// -- notification queue (public CRUD surface from Ag6a) --
// EnqueueOptions, NotificationFilter, NotificationPatch, NotificationSelector
// are module-internal types (zero external importers); callers use inline
// object literals inferred from the function signatures.
export {
	enqueue,
	listNotifications,
	markNotifications,
	reap,
} from "./notification-queue.js";
// -- collapsed deps bag (replaces 15 individual port types) --
// @lore AU20 Ag6b-fix: `NotificationsSilenceDeps` was NOT dead — `isSilenced`
// (exported below) takes it as a parameter, and `packages/core-api/src/__tests__/
// {AD4-,}policy-engine.integration.test.ts` + `silence-policy.integration.test.ts`
// build one to call `isSilenced` directly. Re-exporting the existing
// package-internal type (unchanged shape) restores usability without
// widening the barrel with new ports.
export type { NotificationsDeps, NotificationsSilenceDeps } from "./ports.js";
// -- silence policy predicate (used by @hyperidle/policy via composition root) --
// @lore AU20 Ag6b-fix: `isInSilenceWindow` restored — pure predicate with a
// real external consumer (`silence-policy.integration.test.ts`'s unit-style
// coverage of the window math), mistakenly dropped as "zero importers".
export { isInSilenceWindow, isSilenced } from "./silence-policy.js";
// -- wire shapes shared with consumers --
export type {
	Notification,
	NotificationAdapter,
	NotificationChannel,
} from "./types.js";

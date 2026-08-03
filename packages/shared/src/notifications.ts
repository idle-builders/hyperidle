/**
 * AF8 — Notification type registry and shared types.
 *
 * Single source of truth for all registered notification types.
 * Shared across server, fabric, and web so Settings, the drain, and the
 * popover all key off the same registry — adding a new type means adding
 * one entry here and it appears automatically in Settings.
 *
 * @lore AF8: "digest" is an egress delivery mode, NOT a type. It is
 * therefore absent from this registry. agent.health.degraded and
 * auto_unblock are ambient (concept hard rule #6) — also absent.
 * The NOTIFICATION_TYPES array IS the complete registry; do not derive
 * types from string keys elsewhere.
 *
 * @lore AU21 Increment 14a: `cost_alert` is HARD-DELETED along with the rest
 * of the cost-cap feature — no replacement notification type.
 */

/** Two urgency levels for in-app notifications. digest is egress only. */
export type NotificationUrgency = "immediate" | "ambient";

/** Stable keys for the registered notification types. */
export type NotificationTypeKey = "review_request" | "blocker_alert";

/** A registered notification type entry. */
export interface NotificationType {
	readonly key: NotificationTypeKey;
	readonly label: string;
	/**
	 * AI4 Decision 4 (B2): compact uppercase label for space-constrained surfaces
	 * (e.g. NotificationPopover's meta-strip row). Stored as uppercase literal so
	 * DOM textContent equals the registry value without JS `.toUpperCase()` —
	 * the casing contract (Decision 1a) requires verbatim render on the label path.
	 */
	readonly shortLabel: string;
	readonly description: string;
	readonly defaultUrgency: NotificationUrgency;
}

/**
 * The complete notification type registry.
 * - review_request: item verb=review, risk_tier >= medium OR blocking
 * - blocker_alert:  agent is blocked and needs intervention
 *
 * @lore AF8: review_request defaultUrgency is "immediate" but the listener
 * may demote it to "ambient" for low-risk (risk_tier < medium, non-blocking)
 * reviews — defaultUrgency is the Settings/registry fallback, not a hard
 * per-instance guarantee.
 */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
	{
		key: "review_request",
		label: "Review requests",
		shortLabel: "REVIEW",
		description: "When an agent needs your review",
		defaultUrgency: "immediate",
	},
	{
		key: "blocker_alert",
		label: "Blocker alerts",
		shortLabel: "BLOCKER",
		description: "When an agent is blocked and needs you to intervene",
		defaultUrgency: "immediate",
	},
] as const;

/**
 * Returns the default urgency for a type key.
 * Falls back to "ambient" for unknown keys (defensive; should not happen
 * if callers use NotificationTypeKey strictly).
 */
export function urgencyForType(key: NotificationTypeKey): NotificationUrgency {
	const entry = NOTIFICATION_TYPES.find((t) => t.key === key);
	return entry?.defaultUrgency ?? "ambient";
}

/**
 * AI4 Decision 4: Returns the compact uppercase shortLabel for a notification
 * type key. Replaces the page-local TYPE_LABELS map in NotificationPopover.
 * Falls back to the key string for unknown keys (defensive).
 */
export function shortLabelForType(key: NotificationTypeKey): string {
	const entry = NOTIFICATION_TYPES.find((t) => t.key === key);
	return entry?.shortLabel ?? key;
}

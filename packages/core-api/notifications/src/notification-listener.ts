/**
 * AF8 — Notification event listener.
 *
 * Subscribes to the "notification" bus event, enriches policy-engine "attention"
 * pushes into typed, source-linked notification_queue rows, and ignores
 * dep-watcher "auto_unblock" events (concept hard rule #6).
 *
 * @lore AF8: The MANDATORY kind discriminator (not optional on NotificationEvent)
 * means TypeScript forces both emit sites to set it. The listener filters
 * exclusively on `event.kind === "auto_unblock"` — NEVER on message text.
 * Message copy is presentation, not a contract; a copy change would silently
 * re-classify an auto-unblock as a notification, re-breaking hard rule #6.
 *
 * @lore AF8: Source link shape is CORRECTED here. The original dispatcher.ts:178
 * built `/conversations/item/<id>` which 404s (router only defines
 * `/conversations/:threadId`). We build `/conversations/${item.threadId}` instead.
 * If item.threadId is null, we fall back to "/conversations" (queue) rather than
 * emitting a broken link.
 *
 * @lore AF8: The listener is registered in bootstrapAppRuntime alongside the existing
 * registerNotificationDispatcher. Both subscribe to "notification" but serve
 * different purposes: the dispatcher handles egress delivery (push/email); the
 * listener populates the in-app notification store (typeKey/urgency/sourceLink).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type {
	EventBus,
	NotificationEvent,
	NotificationTypeKey,
	NotificationUrgency,
} from "@hyperidle/shared";
import { enqueueNotification } from "./dispatcher.js";
import type { MutePreferenceReader } from "./mute.js";
import type { NotificationsWorkReader } from "./ports.js";
import type { NotificationSeverity } from "./types.js";

export interface NotificationListenerDeps {
	mute: MutePreferenceReader;
	now?: () => Date;
	/**
	 * @lore AU19 Increment 1g: `work` DI port (Mechanism C) — this listener
	 * used to raw-query the foreign `items` table (`work`-owned) directly;
	 * now injected (`getItemById`), wired to `@hyperidle/work`'s real export.
	 */
	work: NotificationsWorkReader;
}

/**
 * Derive the notification type key and urgency from item properties.
 * blocking or high/medium risk → blocker/review immediate; low risk → ambient.
 *
 * @lore AF8 W5: medium and high risk both map to immediate (concept rule: "≥ medium →
 * immediate"). The two formerly-separate if-branches were identical — collapsed to one
 * predicate for clarity. Behavior unchanged.
 */
function classifyItem(item: {
	blocking: boolean | null;
	riskTier: string | null;
	kind: string | null;
}): { typeKey: NotificationTypeKey; urgency: NotificationUrgency } {
	if (item.blocking) {
		return { typeKey: "blocker_alert", urgency: "immediate" };
	}
	const risk = item.riskTier ?? "low";
	// ≥ medium risk → immediate review request (high, blocking-tier, and medium all qualify)
	if (risk === "high" || risk === "blocking" || risk === "medium") {
		return { typeKey: "review_request", urgency: "immediate" };
	}
	// low risk → ambient review
	return { typeKey: "review_request", urgency: "ambient" };
}

/**
 * Build the corrected thread-keyed source link.
 * Falls back to "/conversations" if threadId is missing (avoids 404-shaped links).
 */
function buildSourceLink(item: { threadId: string | null }): string {
	if (item.threadId) {
		return `/conversations/${item.threadId}`;
	}
	return "/conversations";
}

/**
 * Register the notification listener on the event bus.
 * Returns a disposer that unsubscribes cleanly.
 */
export function registerNotificationListener(
	db: HyperIdleDb,
	bus: EventBus,
	deps: NotificationListenerDeps,
): () => void {
	const nowFn = deps.now ?? ((): Date => new Date());
	let disposed = false;

	const unsub = bus.on("notification", (event: NotificationEvent): void => {
		if (disposed) return;

		// AF8: MANDATORY kind filter — auto_unblock is ambient, NOT a notification
		// (concept hard rule #6). Filter on kind ONLY — never on message text.
		if (event.kind === "auto_unblock") return;

		// policy-engine push (kind="attention") → enqueue typed row
		void (async () => {
			if (disposed) return;
			const now = nowFn();
			const targetId = event.targetId;

			// Look up the item to determine type, urgency, and source link
			const item = await deps.work.getItemById(db, targetId);

			if (!item) return;

			const { typeKey, urgency } = classifyItem(item);
			const sourceLink = buildSourceLink(item);

			// Honor mute preferences before enqueue
			if (await deps.mute.isTypeMuted(typeKey)) return;

			// Map type key to egress severity (blocking/cost_breach/digest)
			const severity: NotificationSeverity = urgency === "immediate" ? "blocking" : "digest";

			await enqueueNotification(db, {
				eventType: event.type,
				subjectId: targetId,
				severity,
				title: item.title.slice(0, 140),
				body: item.body?.slice(0, 10_000) ?? "",
				reason: "silence", // will be delivered by drain
				channel: null,
				now,
				typeKey,
				urgency,
				sourceLink,
			});
		})();
	});

	return (): void => {
		disposed = true;
		unsub();
	};
}

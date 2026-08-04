/**
 * AU27 Increment 5 (Decision 5) — the never-silent net. The force budget
 * (`AL6_MAX_FORCE_RETURNS`) is finite, so a session can still end without
 * calling its required return action. `provisioner.ts` already emits
 * `session_not_returned` on that verdict (existing event); its only
 * subscriber today is the observability dispatcher (logging). This module
 * adds the product-facing reaction: post one plain notice into the
 * session's calling thread, so the person or agent waiting on it is never
 * left silently hanging.
 *
 * @lore This module physically IS `@hyperidle/conversation`, the Service
 * that owns `threads`/`messages` — the write (`insertMessage`) is an
 * ordinary INTRA-package call, no seam needed (same shape as
 * `assistant-thread-pin-reaction.ts`). No injected deps: the notice is
 * authored as the session's own agent (`event.agentId`, guaranteed to be a
 * real `users` row — the agent that just ran the session), not a synthetic
 * system sender id.
 *
 * @lore Matches `lifecycle-propagation.ts`/`handoff-protocol.ts`'s existing
 * precedent: a core-side direct `insertMessage` write does NOT also emit
 * `thread_message_appended` (that event's sole producer is
 * `routes/threads.ts`, the HTTP route) — a pre-existing, accepted gap in
 * live-UI-update coverage for system-authored messages, not introduced or
 * widened here.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger, type EventBus, type SessionNotReturnedEvent } from "@hyperidle/shared";
import { insertMessage } from "./conversation-store.js";

const logger = createLogger({ pkg: "core-api.session-not-returned-notice" });
const registeredBuses = new WeakSet<EventBus>();

/** The one notice text posted when a session ends without returning. */
export const SESSION_NOT_RETURNED_NOTICE_TEXT = "I couldn't finish that turn. Try asking again.";

async function reactToSessionNotReturned(
	db: HyperIdleDb,
	event: SessionNotReturnedEvent,
): Promise<void> {
	// No calling thread (e.g. a task_run session, sourceCorrelation is
	// {taskId, teamId}) — there is nowhere to post; no-op, per Decision 5.
	if (!event.callingThreadId) return;

	const now = new Date().toISOString();
	await insertMessage(db, {
		id: crypto.randomUUID(),
		senderId: event.agentId,
		threadId: event.callingThreadId,
		type: "plain",
		payload: JSON.stringify({ text: SESSION_NOT_RETURNED_NOTICE_TEXT }),
		clientKey: `session-not-returned-${event.sessionId}`,
		createdAt: now,
	});
}

/**
 * Register the never-silent-net reaction on `eventBus`. Returns an
 * unsubscribe function. Safe to call more than once with the SAME `eventBus`
 * instance — only the first registration takes effect (same per-eventBus-
 * instance idempotency guard shape as the sibling core-api reactions).
 */
export function registerSessionNotReturnedNotice(db: HyperIdleDb, eventBus: EventBus): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("session_not_returned", (event) => {
		void reactToSessionNotReturned(db, event).catch((error: unknown) => {
			logger.error("session-not-returned notice failed", {
				sessionId: event.sessionId,
				callingThreadId: event.callingThreadId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}

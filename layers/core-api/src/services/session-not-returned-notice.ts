/**
 * The never-silent net. The force budget
 * (`MAX_FORCE_RETURNS`) is finite, so a session can still end without
 * calling its required return action. `provisioner.ts` already emits
 * `session_not_returned` on that verdict (existing event); its only
 * subscriber today is the observability dispatcher (logging). This module
 * adds the product-facing reaction: post one plain notice into the
 * session's calling thread, so the person or agent waiting on it is never
 * left silently hanging.
 *
 * @lore BC3 architecture.md §5 B2: relocated from `@hyperidle/conversation`
 * (deleted) to this layer file, and posts through the composed
 * `send_message` action instead of a raw `insertMessage` — the thread
 * module owns the write and the `changes` row that comes with it now.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus, SessionNotReturnedEvent } from "@hyperidle/event-bus";
import type { SendMessageRunFn } from "../actions/action.js";

export type { SendMessageRunFn };

const logger = createLogger({ pkg: "core-api.session-not-returned-notice" });
const registeredBuses = new WeakSet<EventBus>();

/** The one notice text posted when a session ends without returning. */
export const SESSION_NOT_RETURNED_NOTICE_TEXT = "I couldn't finish that turn. Try asking again.";

async function reactToSessionNotReturned(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: SessionNotReturnedEvent,
	sendMessage: SendMessageRunFn,
): Promise<void> {
	// No BAKED calling thread — only a subscription_run session reaches this: it
	// has no thread host to resolve one from at emit time, and (unlike
	// `reply`'s own call-time fallback to a direct thread) this reaction has
	// no agent-facing call to fall back from — no-op, per Decision 5.
	if (!event.callingThreadId) return;

	await sendMessage(
		{ actor: event.agentId, db, eventBus, now: new Date().toISOString() },
		{ threadId: event.callingThreadId, text: SESSION_NOT_RETURNED_NOTICE_TEXT },
	);
}

/**
 * Register the never-silent-net reaction on `eventBus`. Returns an
 * unsubscribe function. Safe to call more than once with the SAME `eventBus`
 * instance — only the first registration takes effect.
 */
export function registerSessionNotReturnedNotice(
	db: HyperIdleDb,
	eventBus: EventBus,
	sendMessage: SendMessageRunFn,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("session_not_returned", (event) => {
		void reactToSessionNotReturned(db, eventBus, event, sendMessage).catch((error: unknown) => {
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

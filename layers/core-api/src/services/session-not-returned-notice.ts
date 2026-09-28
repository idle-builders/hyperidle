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
	// no agent-facing call to fall back from — no-op.
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
		return () => {
			// Already registered for this bus — nothing new to dispose.
		};
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

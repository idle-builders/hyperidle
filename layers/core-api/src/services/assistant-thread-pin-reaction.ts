/**
 * "Pin the assistant thread after its first AI reply" — moved from
 * `@hyperidle/conversation` to Layer code so the injected `findUserById` DI
 * port (`AssistantThreadPinReactionDeps`) is deleted. The Layer can import
 * both `@hyperidle/users` and `@hyperidle/conversation` directly.
 *
 * @lore AU44: Row 1 SIMPLIFY — eliminated `AssistantThreadPinReactionDeps` by
 * moving this registration function to the Layer where `findUser` is directly
 * importable (no cross-Service seam needed).
 */

import { findThread, updateThread } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { ThreadMessageAppendedEvent } from "@hyperidle/event-bus";
import type { EventBus } from "@hyperidle/event-bus";
import { findUser } from "@hyperidle/users";

const logger = createLogger({ pkg: "core-api.assistant-thread-pin-reaction" });
const registeredBuses = new WeakSet<EventBus>();

async function reactToThreadMessageAppended(
	db: HyperIdleDb,
	event: ThreadMessageAppendedEvent,
): Promise<void> {
	if (event.messageType !== "plain") return;

	const sender = await findUser(db, { id: event.senderId });
	if (sender?.kind !== "ai") return;

	const thread = await findThread(db, { id: event.threadId });
	if (!thread || thread.hostKind !== "user" || thread.pinned) return;

	await updateThread(db, event.threadId, { pinned: true });
}

/**
 * Register the "pin the assistant thread after its first AI reply" reaction
 * on `eventBus`. Returns an unsubscribe function. Safe to call more than once
 * with the SAME `eventBus` instance — only the first registration takes effect.
 */
export function registerAssistantThreadPinReaction(
	db: HyperIdleDb,
	eventBus: EventBus,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("thread_message_appended", (event) => {
		void reactToThreadMessageAppended(db, event).catch((error: unknown) => {
			logger.error("assistant thread pin reaction failed", {
				threadId: event.threadId,
				senderId: event.senderId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}

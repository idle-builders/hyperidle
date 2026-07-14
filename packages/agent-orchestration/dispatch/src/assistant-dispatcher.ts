/**
 * AD8b Task 9 — Assistant Dispatcher.
 *
 * AC-3: When a human posts a message to the assistant thread, the assistant
 *       responds (session is provisioned).
 *
 * Subscribes to thread_message_appended events and:
 *   - Filters: senderId is human AND thread is an assistant thread (hostKind="user")
 *   - Logs the dispatch intent (full session provisioning is a future story)
 *
 * Pure filter functions are exported for unit testing.
 *
 * @lore AD8b: The dispatcher uses isAssistantThread() which checks
 * hostKind="user" (not pinned status, per Reviewer C1 fix). A user-hosted
 * thread is always an assistant thread — regardless of pinned state.
 *
 * @lore AD8b: The assistant thread exists per-user. When a human posts,
 * the dispatcher fires. AI senders (the assistant itself) are filtered out
 * to prevent echo loops.
 *
 * @lore AU19 Increment 3h: `getThreadById`/`updateThread` (conversation) and
 * `getUserById` (users) became the injected `DispatchPorts.conversation`/
 * `.users` ports (Mechanism C). `registerAssistantDispatcher` takes `ports`
 * as an explicit first parameter; `service.ts`'s `createDispatchOps` binds
 * it once at the composition root so the exported bound version keeps the
 * ORIGINAL `(eventBus, db)` signature every real call site (`app.ts`) uses.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, ThreadMessageAppendedEvent } from "@hyperidle/shared";
import type { DispatchPorts } from "./ports.js";

// ---------------------------------------------------------------------------
// Filter types and pure functions (exported for unit testing)
// ---------------------------------------------------------------------------

export interface ThreadLike {
	readonly hostKind: string;
	readonly hostId: string;
	readonly pinned: boolean;
}

/**
 * Returns true if the thread is an assistant thread (hostKind="user").
 *
 * @lore AD8b (Reviewer C1): We identify assistant threads by hostKind="user",
 * NOT by pinned status. The thread starts unpinned and may or may not be
 * pinned depending on state. hostKind="user" is the stable discriminant.
 */
export function isAssistantThread(thread: ThreadLike): boolean {
	return thread.hostKind === "user";
}

// ---------------------------------------------------------------------------
// Dispatcher registration
// ---------------------------------------------------------------------------

const logger = {
	info: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher
		console.info(`[assistant-dispatcher] ${msg}`, ctx ?? "");
	},
	error: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher
		console.error(`[assistant-dispatcher] ${msg}`, ctx ?? "");
	},
};

/**
 * Register the assistant dispatcher on the event bus.
 * Returns an unsubscribe function.
 *
 * AC-6: When the assistant (AI sender) posts their first response to an
 * assistant thread, update thread.pinned=true. This is idempotent — already-
 * pinned threads are not updated again.
 *
 * @lore AH3 M4: The dispatch (human → triggers assistant turn) was originally
 * sketched here as a placeholder log. AH3 implemented the real trigger inline
 * in threads.ts POST messages handler, which is the correct location (same
 * request context, fire-and-forget with .catch). This dispatcher now owns ONLY
 * the pin-on-first-response logic (AC-6). Removing the dead dispatch branch
 * eliminates the two-subscriber ambiguity. shouldDispatchForAssistant is
 * retained for unit tests that validate the filter predicate independently.
 */
export function registerAssistantDispatcherInternal(
	ports: DispatchPorts,
	eventBus: EventBus,
	db: HyperIdleDb,
): () => void {
	// @lore AF3 C9b: async handlers fail the EventHandler<T> overload (Promise<void>
	// vs void). Use a sync outer wrapper + void async IIFE so the on<T> overload
	// resolves correctly. Explicit event type annotation ensures T is inferred.
	const unsubscribe = eventBus.on(
		"thread_message_appended",
		(event: ThreadMessageAppendedEvent) => {
			void (async () => {
				try {
					// Look up the thread to get hostKind/hostId
					const threadRow = await ports.conversation.getThreadById(db, event.threadId);

					if (!threadRow) {
						return; // Thread not found — skip
					}

					// Look up the sender to determine their kind (human vs ai)
					const senderRow = await ports.users.getUserById(db, event.senderId);

					if (!senderRow) {
						return; // Unknown sender — skip
					}

					const threadLike: ThreadLike = {
						hostKind: threadRow.hostKind,
						hostId: threadRow.hostId,
						pinned: threadRow.pinned === true,
					};

					// AC-6: When the AI assistant posts their first response to an assistant
					// thread, pin the thread. Idempotent — skip if already pinned.
					if (senderRow.kind === "ai" && isAssistantThread(threadLike) && !threadLike.pinned) {
						await ports.conversation.updateThread(db, event.threadId, { pinned: true });

						logger.info("assistant thread pinned after first response", {
							threadId: event.threadId,
							senderId: event.senderId,
							hostId: threadRow.hostId,
						});
					}
				} catch (err) {
					logger.error("assistant dispatcher failed", {
						error: err instanceof Error ? err.message : String(err),
					});
				}
			})();
		},
	);

	return unsubscribe;
}

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
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { threads, users } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

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

export interface DispatchCheckInput {
	readonly senderKind: string;
	readonly thread: ThreadLike;
}

/**
 * Returns true if the assistant should be dispatched for this message:
 *   - sender must be human (not an AI agent)
 *   - thread must be an assistant thread (hostKind="user")
 */
export function shouldDispatchForAssistant(input: DispatchCheckInput): boolean {
	return input.senderKind === "human" && isAssistantThread(input.thread);
}

// ---------------------------------------------------------------------------
// Dispatcher registration
// ---------------------------------------------------------------------------

const logger = {
	info: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: strategy-layer dispatcher
		console.info(`[assistant-dispatcher] ${msg}`, ctx ?? "");
	},
	error: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: strategy-layer dispatcher
		console.error(`[assistant-dispatcher] ${msg}`, ctx ?? "");
	},
};

/**
 * Register the assistant dispatcher on the event bus.
 * Returns an unsubscribe function.
 *
 * AC-3: Subscribes to thread_message_appended. When a human posts to their
 * assistant thread, logs the dispatch intent. Full session provisioning is
 * a future story — this establishes the event-driven skeleton.
 *
 * AC-6: When the assistant (AI sender) posts their first response to an
 * assistant thread, update thread.pinned=true. This is idempotent — already-
 * pinned threads are not updated again.
 *
 * @lore AD8b: The same thread_message_appended event is used for both dispatch
 * (human → triggers assistant) and pinning (AI response → thread.pinned=true).
 * Pinning happens on AI responses so the thread is "activated" after first
 * assistant interaction, not before.
 */
export function registerAssistantDispatcher(eventBus: EventBus, db: HyperIdleDb): () => void {
	const unsubscribe = eventBus.on("thread_message_appended", async (event) => {
		try {
			// Look up the thread to get hostKind/hostId
			const [threadRow] = await db
				.select()
				.from(threads)
				.where(eq(threads.id, event.threadId))
				.limit(1);

			if (!threadRow) {
				return; // Thread not found — skip
			}

			// Look up the sender to determine their kind (human vs ai)
			const [senderRow] = await db
				.select()
				.from(users)
				.where(eq(users.id, event.senderId))
				.limit(1);

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
				await db.update(threads).set({ pinned: true }).where(eq(threads.id, event.threadId));

				logger.info("assistant thread pinned after first response", {
					threadId: event.threadId,
					senderId: event.senderId,
					hostId: event.hostId,
				});
				return;
			}

			if (!shouldDispatchForAssistant({ senderKind: senderRow.kind, thread: threadLike })) {
				return; // Not an assistant thread or not a human sender
			}

			logger.info("assistant dispatch triggered", {
				threadId: event.threadId,
				senderId: event.senderId,
				hostId: event.hostId,
			});

			// @lore AD8b: Full session provisioning (connecting to the assistant
			// agent and running a session) is deferred to a future story.
			// This skeleton establishes the event subscription and filtering logic.
		} catch (err) {
			logger.error("assistant dispatch failed", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	});

	return unsubscribe;
}

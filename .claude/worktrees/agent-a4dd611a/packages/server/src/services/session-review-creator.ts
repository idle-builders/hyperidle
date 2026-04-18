import { type HyperIdleDb, items, sessions, tasks, threads } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent, SessionEndedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

/**
 * Subscribes to session_ended events and creates review items
 * for sessions associated with medium/high risk tasks.
 *
 * Returns an unsubscribe function.
 */
export function registerSessionReviewCreator(db: HyperIdleDb, eventBus: EventBus): () => void {
	const handler = (event: SessionEndedEvent): void => {
		// Look up session to get taskId
		const session = db.select().from(sessions).where(eq(sessions.id, event.sessionId)).get();
		if (!session) return;

		// Look up task to get riskTier
		const task = db.select().from(tasks).where(eq(tasks.id, session.taskId)).get();
		if (!task) return;

		// Only create review items for medium/high risk
		if (task.riskTier !== "medium" && task.riskTier !== "high") return;

		// Create or use existing thread
		let threadId = task.threadId;
		if (!threadId) {
			threadId = crypto.randomUUID();
			const now = new Date().toISOString();
			db.insert(threads)
				.values({
					id: threadId,
					kind: "review",
					createdAt: now,
				})
				.run();

			// Update task with new threadId
			db.update(tasks).set({ threadId }).where(eq(tasks.id, task.id)).run();
		}

		// Create review item
		const itemId = crypto.randomUUID();
		const now = new Date().toISOString();
		const outcome = session.outcome ?? "completed";

		db.insert(items)
			.values({
				id: itemId,
				kind: "review",
				title: `Session completed: ${outcome}`,
				threadId,
				riskTier: task.riskTier,
				createdAt: now,
			})
			.run();

		// Emit item_created event
		const itemEvent: ItemCreatedEvent = {
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: threadId,
			kind: "review",
			timestamp: Date.now(),
		};
		eventBus.emit(itemEvent);
	};

	return eventBus.on("session_ended", handler);
}

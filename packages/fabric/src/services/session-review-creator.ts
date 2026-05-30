import {
	type HyperIdleDb,
	items,
	sessions,
	taskStrategyFabric,
	tasks,
	threads,
} from "@hyperidle/db";
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
		void (async () => {
			// Look up session to get taskId
			const [session] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, event.sessionId))
				.limit(1);
			if (!session) return;

			// Look up task
			const [task] = await db.select().from(tasks).where(eq(tasks.id, session.taskId)).limit(1);
			if (!task) return;

			// @lore O2: riskTier moved from tasks to taskStrategyFabric extension table.
			// Only create review items for medium/high risk.
			const [fabricRow] = await db
				.select()
				.from(taskStrategyFabric)
				.where(eq(taskStrategyFabric.taskId, session.taskId))
				.limit(1);
			const riskTier = fabricRow?.riskTier ?? null;
			if (riskTier !== "medium" && riskTier !== "high") return;

			// Create or use existing thread
			let threadId = task.threadId;
			if (!threadId) {
				threadId = crypto.randomUUID();
				const now = new Date().toISOString();
				// L1a: thread now carries host_kind/host_id; for session-review the
				// host is the task that ended.
				await db.insert(threads).values({
					id: threadId,
					hostKind: "task",
					hostId: task.id,
					initiatorId: session.agentId,
					participants: JSON.stringify([session.agentId]),
					lastActiveAt: now,
					createdAt: now,
				});

				// Update task with new threadId
				await db.update(tasks).set({ threadId }).where(eq(tasks.id, task.id));
			}

			// Create review item
			const itemId = crypto.randomUUID();
			const now = new Date().toISOString();
			const outcome = session.outcome ?? "completed";

			await db.insert(items).values({
				id: itemId,
				kind: "review",
				title: `Session completed: ${outcome}`,
				threadId,
				riskTier,
				createdAt: now,
			});

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
		})();
	};

	return eventBus.on("session_ended", handler);
}

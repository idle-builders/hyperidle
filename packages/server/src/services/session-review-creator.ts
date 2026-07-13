import { type HyperIdleDb, sessions, taskPlanningSignals } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent, SessionEndedEvent } from "@hyperidle/shared";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { getThreadById, insertThread, updateThread } from "./conversation-store.js";
import { resolveReviewRecipients } from "./org-routing.js";
import { getUserById } from "./user-store.js";

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
			if (!session?.taskId) return;

			// Look up task
			const task = await work.getTaskById(db, session.taskId);
			if (!task) return;

			// @lore O2: riskTier moved from tasks to taskPlanningSignals extension table.
			// Only create review items for medium/high risk.
			const [fabricRow] = await db
				.select()
				.from(taskPlanningSignals)
				.where(eq(taskPlanningSignals.taskId, session.taskId))
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
				await insertThread(db, {
					id: threadId,
					hostKind: "task",
					hostId: task.id,
					initiatorId: session.agentId,
					participants: JSON.stringify([session.agentId]),
					lastActiveAt: now,
					createdAt: now,
				});

				// Update task with new threadId
				await work.updateTaskById(db, task.id, { threadId });
			}

			// @lore AD1: Wire review routing to humans on session-end review creation.
			// Resolve human recipients via org_edges using the agent's userId, role,
			// and the task's teamId. Falls back to ALL human users when no edges match.
			// Merges into existing thread participants (sorted + deduplicated).
			const agentRow = await getUserById(db, session.agentId);

			const humanIds = await resolveReviewRecipients(db, {
				userId: session.agentId,
				agentRole: agentRow?.role ?? undefined,
				teamId: task.teamId,
			});

			if (humanIds.length > 0) {
				const threadRow = await getThreadById(db, threadId);

				const currentParticipants: string[] = threadRow
					? (JSON.parse(threadRow.participants) as string[])
					: [session.agentId];

				const merged = [...new Set([...currentParticipants, ...humanIds])].sort();
				await updateThread(db, threadId, { participants: JSON.stringify(merged) });
			}

			// Create review item
			const itemId = crypto.randomUUID();
			const now = new Date().toISOString();
			const outcome = session.outcome ?? "completed";

			await work.createItem(db, {
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

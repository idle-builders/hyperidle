import { type HyperIdleDb, sessions, taskStrategyFabric } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent, SessionEndedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type {
	ReviewConversationStore,
	ReviewOrgRouting,
	ReviewUserDirectory,
	ReviewWorkStore,
} from "./ports.js";

/**
 * Deps `registerSessionReviewCreator` needs from `work`/`conversation`/
 * `users`/`org` (Mechanism C — `review` never imports another Service
 * package directly).
 *
 * @lore AU19 Increment 1j: `work`/`conversation`/`users`/`org` are all
 * already-migrated real packages — ordinary same-layer core-api→core-api
 * edges, wired directly at the production call site (`server-factory.ts`)
 * to the real exported functions (no interim indirection needed).
 */
export interface SessionReviewCreatorDeps {
	readonly work: Pick<ReviewWorkStore, "getTaskById" | "updateTaskById" | "createItem">;
	readonly conversation: Pick<
		ReviewConversationStore,
		"insertThread" | "getThreadById" | "updateThread"
	>;
	readonly users: Pick<ReviewUserDirectory, "getUserById" | "listUsersByKind">;
	readonly org: ReviewOrgRouting;
}

/**
 * Subscribes to session_ended events and creates review items
 * for sessions associated with medium/high risk tasks.
 *
 * Returns an unsubscribe function.
 */
export function registerSessionReviewCreator(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: SessionReviewCreatorDeps,
): () => void {
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
			const task = await deps.work.getTaskById(db, session.taskId);
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
				await deps.conversation.insertThread(db, {
					id: threadId,
					hostKind: "task",
					hostId: task.id,
					initiatorId: session.agentId,
					participants: JSON.stringify([session.agentId]),
					lastActiveAt: now,
					createdAt: now,
				});

				// Update task with new threadId
				await deps.work.updateTaskById(db, task.id, { threadId });
			}

			// @lore AD1: Wire review routing to humans on session-end review creation.
			// Resolve human recipients via org_edges using the agent's userId, role,
			// and the task's teamId. Falls back to ALL human users when no edges match.
			// Merges into existing thread participants (sorted + deduplicated).
			const agentRow = await deps.users.getUserById(db, session.agentId);

			const humanIds = await deps.org.resolveReviewRecipients(
				db,
				{
					userId: session.agentId,
					agentRole: agentRow?.role ?? undefined,
					teamId: task.teamId,
				},
				{ listUsersByKind: deps.users.listUsersByKind },
			);

			if (humanIds.length > 0) {
				const threadRow = await deps.conversation.getThreadById(db, threadId);

				const currentParticipants: string[] = threadRow
					? (JSON.parse(threadRow.participants) as string[])
					: [session.agentId];

				const merged = [...new Set([...currentParticipants, ...humanIds])].sort();
				await deps.conversation.updateThread(db, threadId, {
					participants: JSON.stringify(merged),
				});
			}

			// Create review item
			const itemId = crypto.randomUUID();
			const now = new Date().toISOString();
			const outcome = session.outcome ?? "completed";

			await deps.work.createItem(db, {
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

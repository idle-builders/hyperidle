import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent, SessionEndedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { ReviewPorts } from "./ports.js";
import { handleUnconsumedGrantOnSessionEnd } from "./proposed-call-workflow.js";

/**
 * Register both `review`-domain `session_ended` subscribers in one
 * idempotent boot entry-point.
 *
 * Two subscribers registered (each independent — they serve different
 * concerns, sharing no state):
 *
 * 1. **Session-review creator** (AD1): for medium/high-risk tasks, creates
 *    a review item + routes to human reviewers when a session ends.
 *
 * 2. **Liveness net** (AC11b): fires when a session ends WITHOUT consuming
 *    its tailored grant (crash/no-show). First occurrence re-provisions via
 *    `ports.intentRecorder`; second occurrence transitions the PC to `held`
 *    and writes a `failed` Outcome so the result is never silently discarded.
 *
 * Returns an unsubscribe function that removes both handlers.
 *
 * @lore AU20 Am9: renamed from `registerSessionReviewCreator`; deps
 * collapsed from `SessionReviewCreatorDeps` (5 individual fields) to
 * `ReviewPorts` (the composite bag). The liveness net handler was previously
 * the exported `handleUnconsumedGrantOnSessionEnd` — now wired here as a
 * production `session_ended` subscriber for the first time (it was exported
 * but never registered in server-factory.ts before this WP).
 *
 * @lore AD1: Wire review routing to humans on session-end review creation.
 * Resolve human recipients via org_edges using the agent's userId, role,
 * and the task's teamId. Falls back to ALL human users when no edges match.
 * Merges into existing thread participants (sorted + deduplicated).
 *
 * @lore AU19 Increment 1j/1k: `work`/`conversation`/`users`/`org`/`taskRiskTier`
 * are all already-migrated real packages — ordinary same-layer core-api→core-api
 * edges, wired directly at the production call site to the real exported
 * functions.
 */
export function registerReviewSubscriptions(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: ReviewPorts,
): () => void {
	// --- Subscriber 1: session-review creator (AD1) ---
	const sessionReviewHandler = (event: SessionEndedEvent): void => {
		void (async () => {
			// Look up session to get taskId
			const [session] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, event.sessionId))
				.limit(1);
			if (!session?.taskId) return;

			// Look up task
			const task = await ports.work.getTaskById(db, session.taskId);
			if (!task) return;

			// @lore O2: riskTier moved from tasks to taskPlanningSignals extension
			// table (owned by `work` — read via the work port).
			// Only create review items for medium/high risk.
			const riskTier = await ports.work.getRiskTierByTaskId(db, session.taskId);
			if (riskTier !== "medium" && riskTier !== "high") return;

			// Create or use existing thread
			let threadId = task.threadId;
			if (!threadId) {
				threadId = crypto.randomUUID();
				const now = new Date().toISOString();
				// L1a: thread now carries host_kind/host_id; for session-review the
				// host is the task that ended.
				await ports.conversation.insertThread(db, {
					id: threadId,
					hostKind: "task",
					hostId: task.id,
					initiatorId: session.agentId,
					participants: JSON.stringify([session.agentId]),
					lastActiveAt: now,
					createdAt: now,
				});
				await ports.work.updateTaskById(db, task.id, { threadId });
			}

			// @lore AD1: Wire review routing to humans on session-end review creation.
			const agentRow = await ports.users.getUserById(db, session.agentId);
			const humanIds = await ports.org.resolveReviewRecipients(
				db,
				{
					userId: session.agentId,
					agentRole: agentRow?.role ?? undefined,
					teamId: task.teamId,
				},
				{ listUsersByKind: ports.users.listUsersByKind },
			);

			if (humanIds.length > 0) {
				const threadRow = await ports.conversation.getThreadById(db, threadId);
				const currentParticipants: string[] = threadRow
					? (JSON.parse(threadRow.participants) as string[])
					: [session.agentId];
				const merged = [...new Set([...currentParticipants, ...humanIds])].sort();
				await ports.conversation.updateThread(db, threadId, {
					participants: JSON.stringify(merged),
				});
			}

			// Create review item
			const itemId = crypto.randomUUID();
			const now = new Date().toISOString();
			const outcome = session.outcome ?? "completed";

			await ports.work.createItem(db, {
				id: itemId,
				kind: "review",
				title: `Session completed: ${outcome}`,
				threadId,
				riskTier,
				createdAt: now,
			});

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

	// --- Subscriber 2: liveness net (AC11b) ---
	const livenessHandler = (event: SessionEndedEvent): void => {
		// SessionEndedEvent carries agentId and taskId directly — no DB lookup needed.
		if (!event.taskId) return;
		void handleUnconsumedGrantOnSessionEnd(db, {
			taskId: event.taskId,
			agentId: event.agentId,
			intentRecorder: ports.intentRecorder,
			// AU21 §6 Decision B: bake the re-provision request at emit time —
			// see `applyLivenessRetry`'s `@lore` in `proposed-call-workflow.ts`.
			getTaskById: ports.work.getTaskById,
			requireRunnableAgent: ports.requireRunnableAgent,
			// AU21 §9 Increment 12 (Decision H3): also bake the contextBundle.
			getBetById: ports.getBetById,
			getTeamById: ports.getTeamById,
			assembleSessionKnowledge: ports.assembleSessionKnowledge,
			// AU21 §9 Increment 12 (Decision H3), Wave E: also bake harnessDisabled.
			readServerConfig: ports.readServerConfig,
		});
	};

	const unsub1 = eventBus.on("session_ended", sessionReviewHandler);
	const unsub2 = eventBus.on("session_ended", livenessHandler);

	return () => {
		unsub1();
		unsub2();
	};
}

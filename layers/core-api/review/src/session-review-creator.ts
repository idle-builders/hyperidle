import type { HyperIdleDb } from "@hyperidle/db";
import type { SessionEndedEvent } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ReviewPorts } from "./ports.js";
import { handleUnconsumedGrantOnSessionEnd } from "./proposed-call-workflow.js";

/**
 * Register the `review`-domain `session_ended` subscriber in one
 * idempotent boot entry-point.
 *
 * **Liveness net** (AC11b): fires when a session ends WITHOUT consuming
 * its tailored grant (crash/no-show). First occurrence re-provisions via
 * `ports.intentRecorder`; second occurrence transitions the PC to `held`
 * and writes a `failed` Outcome so the result is never silently discarded.
 *
 * Returns an unsubscribe function.
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
			// AU27 Increment 1 (Decision 0): also bake callingThreadId.
			resolveOrCreateCallingThread: ports.resolveOrCreateCallingThread,
		});
	};

	const unsub2 = eventBus.on("session_ended", livenessHandler);

	return () => {
		unsub2();
	};
}

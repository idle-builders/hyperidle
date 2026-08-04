/**
 * AU21 §6 Decision B4 / §10 — core-api's reaction to the NEW pre-handoff
 * `agent_run_admission_failed` event, one subscriber per `kind`, per the
 * finalized subscriber table:
 *
 *   routine_run       -> routine finalizes the run to outcome="error"
 *                         (replaces `failOrRelease`'s deleted direct write)
 *   task_run          -> work marks the taskDispatchAttempts row failed
 *   session_start     -> the explicitSessionStarts row is marked failed, no
 *                         automatic retry (an explicit human/agent-requested
 *                         start; nothing should silently retry a manual
 *                         trigger later)
 *   knowledge_action  -> a review-flagged item is created; no run-record
 *                         mutation exists for a knowledge action
 *   reengagement      -> review's existing retry-count liveness-net pattern
 *   assistant_turn    -> informational only, no mutation (lowest-stakes
 *                         family; a user-visible surfacing is a reasonable
 *                         product follow-up but not required to close AU15's
 *                         guarantee)
 *
 * Only `terminal===true` triggers a reaction — `terminal===false` is
 * informational (orchestration is still retrying on its own backoff).
 *
 * @lore this module is imported by BOTH the production composition root
 * (`server-factory.ts`'s `registerCoreDomainServices`) and the integration
 * test fixture (`test-fixtures.ts`'s `eventBus` fixture) — `registeredBuses`
 * makes `registerAgentRunAdmissionReactions` idempotent PER eventBus
 * instance so a test requesting both `eventBus` and `app` (which wires the
 * SAME eventBus into `createServer`'s production boot path) never
 * double-registers and double-fires a reaction.
 */

import { resolveInjectedConnectionsForAgent } from "@hyperidle/connections";
import { insertThread } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { resolveInjectedFilesystemsForAgent } from "@hyperidle/filesystems";
import {
	type CreateReviewItemResult,
	createReviewItem,
	reengageOnAdmissionFailure,
} from "@hyperidle/review";
import * as routineService from "@hyperidle/routine";
import { enqueueWorkIntent, transitionSessionRequest } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import { type AgentRunAdmissionFailedEvent, createLogger, type EventBus } from "@hyperidle/shared";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { resolveOrCreateCallingThread } from "./calling-thread-bindings.js";

const logger = createLogger({ pkg: "core-api.agent-run-admission-reactions" });
const registeredBuses = new WeakSet<EventBus>();

/** Extract the bare knowledge item id from an intent's `knowledge:<id>` source id. */
function knowledgeItemIdFromSourceId(sourceId: string): string {
	return sourceId.replace(/^knowledge:/, "");
}

async function flagStalledKnowledgeAction(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: AgentRunAdmissionFailedEvent,
): Promise<CreateReviewItemResult> {
	const knowledgeItemId = knowledgeItemIdFromSourceId(event.sourceId);
	const flagStalledKnowledgeReviewItem = createReviewItem({
		conversation: { insertThread },
		work: {
			createItem: (exec: WriteExecutor, values) => work.create(exec, "item", values),
		},
	});
	return flagStalledKnowledgeReviewItem(db, eventBus, {
		knowledgeItemId,
		layer: null,
		title: "Agent work stalled: knowledge action",
		body: `Knowledge item ${knowledgeItemId} could not be admitted for agent work (${event.failureCode}).`,
		riskTier: "low",
		attentionScore: 0,
		reasoning: { failureCode: event.failureCode, intentId: event.intentId },
		nowMs: event.timestamp,
	});
}

async function reactToAdmissionFailure(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: AgentRunAdmissionFailedEvent,
): Promise<void> {
	switch (event.kind) {
		case "routine_run":
			await routineService.updateRoutineRun(
				db,
				event.sourceId,
				{
					outcome: "error",
					endedAt: new Date(event.timestamp).toISOString(),
					errorMessage: event.failureCode,
				},
				{ onlyIfRunning: true },
			);
			return;
		case "task_run":
			await work.taskDispatchAttemptStore.markFailed(db, event.sourceId);
			return;
		case "session_start":
			await transitionSessionRequest(db, {
				target: "explicitStart",
				to: "failed",
				startId: event.sourceId,
				failureCode: event.failureCode,
			});
			return;
		case "knowledge_action":
			await flagStalledKnowledgeAction(db, eventBus, event);
			return;
		case "reengagement":
			await reengageOnAdmissionFailure(db, {
				proposedCallId: event.sourceId,
				intentRecorder: { record: enqueueWorkIntent },
				// AU21 §6 Decision B: bake the re-provision request at emit time —
				// see `applyLivenessRetry`'s `@lore` in `proposed-call-workflow.ts`.
				getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
				requireRunnableAgent,
				readServerConfig,
				// AU21 §9 Increment 12 follow-up (F2 gap closure): also bake
				// injectedFilesystems.
				resolveInjectedFilesystemsForAgent,
				// AU21 §9 Increment 12 follow-up part 2 (F2 gap closure —
				// connections): also bake injectedConnections.
				resolveInjectedConnectionsForAgent: (db, agentId) =>
					resolveInjectedConnectionsForAgent(db, agentId, findUser),
				// AU27 Increment 1 (Decision 0): also bake callingThreadId.
				resolveOrCreateCallingThread,
			});
			return;
		case "assistant_turn":
			// Informational only — no durable "run" record exists for a thread
			// message; a user-visible surfacing is a reasonable product
			// follow-up but not required to close AU15's guarantee.
			return;
	}
}

/**
 * Register core-api's reactions to `agent_run_admission_failed` on
 * `eventBus`. Returns an unsubscribe function. Safe to call more than once
 * with the SAME `eventBus` instance — only the first registration takes
 * effect.
 */
export function registerAgentRunAdmissionReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on(
		"agent_run_admission_failed",
		(event: AgentRunAdmissionFailedEvent) => {
			if (!event.terminal) return;
			void reactToAdmissionFailure(db, eventBus, event).catch((error: unknown) => {
				logger.error("agent_run_admission_failed reaction failed", {
					kind: event.kind,
					intentId: event.intentId,
					error: error instanceof Error ? error.message : String(error),
				});
			});
		},
	);

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}

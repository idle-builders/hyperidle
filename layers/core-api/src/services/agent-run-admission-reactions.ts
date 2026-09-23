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
 *   thread_turn       -> the never-silent net's sibling case: the session
 *                         couldn't even be admitted, so one plain notice is
 *                         posted into the thread the turn came from (see
 *                         `notifyThreadTurnAdmissionFailure` below) — the
 *                         person waiting on it is never left in silence.
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

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type {
	AgentRunAdmissionFailedEvent,
	AgentRunAdmissionFailureCode,
	EventBus,
} from "@hyperidle/event-bus";
import * as routineService from "@hyperidle/routine";
import * as work from "@hyperidle/task";
import { findThread, listMessages } from "@hyperidle/thread";
import { findUser, listUsers } from "@hyperidle/user";
import type { ActionContext, AdjustThreadRunFn, SendMessageRunFn } from "../actions/action.js";

export type { AdjustThreadRunFn, SendMessageRunFn };

const logger = createLogger({ pkg: "core-api.agent-run-admission-reactions" });
const registeredBuses = new WeakSet<EventBus>();

/** Extract the bare document id from an intent's `knowledge:<id>` source id. */
function documentIdFromSourceId(sourceId: string): string {
	return sourceId.replace(/^knowledge:/, "");
}

/**
 * Parse a `thread_turn` intent's `sourceId`, built by `thread-actions.ts`'s
 * wake loop as `` `${messageId}:${agentId}` `` (see `resolveThreadTurnRequest`'s
 * caller in `thread-actions.ts`). `messageId` is always a `randomUUID()` — it
 * never contains `:` — so splitting on the FIRST `:` is safe even though an
 * agent id theoretically could.
 */
function parseThreadTurnSourceId(
	sourceId: string,
): { readonly messageId: string; readonly agentId: string } | undefined {
	const i = sourceId.indexOf(":");
	if (i < 0) return undefined;
	return { messageId: sourceId.slice(0, i), agentId: sourceId.slice(i + 1) };
}

/** One short, plain-English reason per failure code — no invented detail. */
const THREAD_TURN_FAILURE_REASON: Record<AgentRunAdmissionFailureCode, string> = {
	INVALID_WORK_SOURCE: "the message it was answering is no longer available",
	MAX_ATTEMPTS_EXCEEDED: "it could not be started after repeated attempts",
	TARGET_AGENT_NOT_RUNNABLE: "the agent is not available to run right now",
	PROVISIONING_FAILED: "no harness is available on this machine",
};

/**
 * The never-silent net's sibling case (`session-not-returned-notice.ts`
 * covers "ended without answering"; this covers "could not even start"):
 * post ONE plain notice into the thread the turn came from, sent AS the
 * agent that could not be started — but ONLY when the thread has at least
 * one HUMAN member. The notice exists to tell a person; with no person in
 * the thread there is nobody to tell, and skipping it also closes a
 * ping-pong: `agentsToWake` (`@hyperidle/domain-model`'s `actions/thread.ts`)
 * excludes the sender but, in a 2-member thread, wakes the OTHER member when
 * that member is an agent. In an agent↔agent direct thread with no harness
 * available, A's failed turn would post a notice as A, which wakes B; B's
 * turn then fails too, posts as B (a new intent id, so a new `clientKey`),
 * which wakes A — unbounded, with no agent ever actually running in
 * between. Requiring a human member breaks that loop at its source: an
 * all-agent thread never posts here at all.
 */
async function notifyThreadTurnAdmissionFailure(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: AgentRunAdmissionFailedEvent,
	sendMessage: SendMessageRunFn,
): Promise<void> {
	const parsed = parseThreadTurnSourceId(event.sourceId);
	if (!parsed) {
		logger.error("thread_turn admission failure: sourceId is not <messageId>:<agentId>", {
			intentId: event.intentId,
			sourceId: event.sourceId,
		});
		return;
	}
	const { messageId, agentId } = parsed;
	const [sourceMessage] = await listMessages(db, { id: messageId });
	if (!sourceMessage) {
		// The message the turn came from is gone — nowhere left to post the
		// notice. Logged, never thrown: this is a reaction, not a request.
		logger.error("thread_turn admission failure: source message is gone, notice dropped", {
			intentId: event.intentId,
			messageId,
			agentId,
		});
		return;
	}
	const thread = await findThread(db, { id: sourceMessage.threadId });
	const members = thread ? (JSON.parse(thread.participants) as string[]) : [];
	const humanMembers =
		members.length > 0 ? await listUsers(db, { ids: members, kind: "human" }) : [];
	if (humanMembers.length === 0) {
		// Nobody to tell — see the ping-pong note above.
		return;
	}
	const agent = await findUser(db, { id: agentId });
	const displayName = agent?.name ?? agentId;
	const result = await sendMessage(
		{ actor: agentId, db, eventBus, now: new Date(event.timestamp).toISOString() },
		{
			threadId: sourceMessage.threadId,
			clientKey: `thread-turn-admission-failed:${event.intentId}`,
			text: `${displayName} could not be started: ${THREAD_TURN_FAILURE_REASON[event.failureCode]}.`,
		},
	);
	if (!result.ok) {
		logger.error("thread turn admission notice refused", {
			intentId: event.intentId,
			threadId: sourceMessage.threadId,
			problems: result.problems,
		});
	}
}

/**
 * @lore BC3 architecture.md §5 B7b — the second `items` writer, kept alive
 * as a `send_message` instead: "a knowledge action that could not be
 * admitted gets flagged for a human" is the SAME behaviour, at the SAME
 * moment, into the SAME thread (the document's, `document`-
 * hosted, resolved not recreated on every failure). `system:propagation`
 * posts into it — host-scoped, so it may post, and its first post joins it
 * (architecture.md §3.4) — never the synthetic `"attention_engine"` sender
 * `changes.actor`'s FK would reject.
 */
async function flagStalledKnowledgeAction(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: AgentRunAdmissionFailedEvent,
	deps: { readonly sendMessage: SendMessageRunFn; readonly adjustThread: AdjustThreadRunFn },
): Promise<void> {
	const documentId = documentIdFromSourceId(event.sourceId);
	const now = new Date(event.timestamp).toISOString();
	const ctx: ActionContext = { actor: "system:propagation", db, eventBus, now };

	const existing = await findThread(db, { host: { kind: "document", id: documentId } });
	let threadId = existing?.id;
	if (threadId === undefined) {
		const created = await deps.adjustThread(ctx, {
			host: { kind: "document", id: documentId },
			members: ["system:propagation"],
		});
		if (!created.ok) {
			logger.error("flagStalledKnowledgeAction: could not create the document's thread", {
				documentId,
				problems: created.problems,
			});
			return;
		}
		threadId = created.data.thread.id;
	}

	const sent = await deps.sendMessage(ctx, {
		threadId,
		clientKey: `knowledge-stall:${event.intentId}`,
		review: {
			title: "Agent work stalled: knowledge action",
			reasoning: [
				`Document ${documentId} could not be admitted for agent work (${event.failureCode}).`,
			],
		},
	});
	if (!sent.ok) {
		logger.error("knowledge action stall notice refused", {
			intentId: event.intentId,
			threadId,
			problems: sent.problems,
		});
	}
}

async function reactToAdmissionFailure(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: AgentRunAdmissionFailedEvent,
	agentOrchestration: AgentOrchestrationPort,
	threadDeps: { readonly sendMessage: SendMessageRunFn; readonly adjustThread: AdjustThreadRunFn },
): Promise<void> {
	switch (event.kind) {
		case "routine_run":
			// `routine` is core-api's own Service — in-layer, not a crossing.
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
			// Mark the explicitSessionStarts row failed. No automatic retry —
			// an explicit human/agent-requested start must not be silently restarted.
			await agentOrchestration.requests.failExplicitSessionStart(event.sourceId, event.failureCode);
			return;
		case "knowledge_action":
			await flagStalledKnowledgeAction(db, eventBus, event, threadDeps);
			return;
		case "thread_turn":
			await notifyThreadTurnAdmissionFailure(db, eventBus, event, threadDeps.sendMessage);
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
	agentOrchestration: AgentOrchestrationPort,
	threadDeps: { readonly sendMessage: SendMessageRunFn; readonly adjustThread: AdjustThreadRunFn },
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on(
		"agent_run_admission_failed",
		(event: AgentRunAdmissionFailedEvent) => {
			if (!event.terminal) return;
			void reactToAdmissionFailure(db, eventBus, event, agentOrchestration, threadDeps).catch(
				(error: unknown) => {
					logger.error("agent_run_admission_failed reaction failed", {
						kind: event.kind,
						intentId: event.intentId,
						error: error instanceof Error ? error.message : String(error),
					});
				},
			);
		},
	);

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}

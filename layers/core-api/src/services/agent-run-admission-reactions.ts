/**
 * Core-api's reaction to the pre-handoff `agent_run_admission_failed`
 * event, one subscriber per `kind` that has a run record to finalize:
 *
 *   subscription_run  -> logged only; a subscription's wake carries no run
 *                         row to finalize
 *   task_run          -> work marks the taskDispatchAttempts row failed
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

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type {
	AgentRunAdmissionFailedEvent,
	AgentRunAdmissionFailureCode,
	EventBus,
} from "@hyperidle/event-bus";
import * as work from "@hyperidle/task";
import { findThread, listMessages } from "@hyperidle/thread";
import { findUser, listUsers } from "@hyperidle/user";
import type { SendMessageRunFn } from "../actions/action.js";

export type { SendMessageRunFn };

const logger = createLogger({ pkg: "core-api.agent-run-admission-reactions" });
const registeredBuses = new WeakSet<EventBus>();

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

async function reactToAdmissionFailure(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: AgentRunAdmissionFailedEvent,
	threadDeps: { readonly sendMessage: SendMessageRunFn },
): Promise<void> {
	switch (event.kind) {
		// A subscription's wake carries no run row to finalize, so a refused
		// wake is just logged.
		case "subscription_run":
			logger.warn("subscription wake refused admission", {
				intentId: event.intentId,
				sourceId: event.sourceId,
				failureCode: event.failureCode,
			});
			return;
		case "task_run":
			await work.taskDispatchAttemptStore.markFailed(db, event.sourceId);
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
	threadDeps: { readonly sendMessage: SendMessageRunFn },
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {
			// Already registered for this bus — nothing new to dispose.
		};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on(
		"agent_run_admission_failed",
		(event: AgentRunAdmissionFailedEvent) => {
			if (!event.terminal) return;
			void reactToAdmissionFailure(db, eventBus, event, threadDeps).catch((error: unknown) => {
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

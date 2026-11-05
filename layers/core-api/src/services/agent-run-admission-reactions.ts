// @lore: agent-run-admission — `registeredBuses` idempotent per EventBus; boot+test wire SAME bus; without it `eventBus`+`app` combo double-fires

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import { SYSTEM_ACTOR_ID } from "@hyperidle/domain-model";
import type {
	AgentRunAdmissionFailedEvent,
	AgentRunAdmissionFailureCode,
	EventBus,
} from "@hyperidle/event-bus";
import * as work from "@hyperidle/task";
import { findThread } from "@hyperidle/thread";
import { findUser, listUsers } from "@hyperidle/user";
import type { SendMessageRunFn } from "../actions/action.js";

export type { SendMessageRunFn };

const logger = createLogger({ pkg: "core-api.agent-run-admission-reactions" });
const registeredBuses = new WeakSet<EventBus>();

/**
 * What a person reads when an agent could not start: plain words and, where
 * there is one, the next step. No internal nouns (no engine jargon).
 * @lore: the notice is posted by HyperIdle (the system actor), never as the agent; no-program text matches NoEligibleHarnessError's hint
 */
const THREAD_TURN_FAILURE_REASON: Record<AgentRunAdmissionFailureCode, string> = {
	INVALID_WORK_SOURCE: "The message it was answering is gone.",
	TARGET_AGENT_NOT_RUNNABLE: "It is switched off right now.",
	PROVISIONING_FAILED:
		"No agent program is signed in on this computer. Sign in to one under [Agent programs](/people/me), then send your message again.",
};

/**
 * The never-silent net's sibling case (`session-not-returned-notice.ts`
 * covers "ended without answering"; this covers "could not even start"):
 * post ONE plain notice into the thread the turn came from, posted by HyperIdle
 * itself (the system actor, which may post in any thread and wakes nobody) — but
 * ONLY when the thread has at least one HUMAN member. The notice exists to tell a
 * person; with no person in the thread there is nobody to tell.
 */
async function notifyThreadTurnAdmissionFailure(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: AgentRunAdmissionFailedEvent,
	threadId: string,
	sendMessage: SendMessageRunFn,
): Promise<void> {
	const thread = await findThread(db, { id: threadId });
	const members = thread ? (JSON.parse(thread.participants) as string[]) : [];
	const humanMembers =
		members.length > 0 ? await listUsers(db, { ids: members, kind: "human" }) : [];
	if (humanMembers.length === 0) {
		// Nobody to tell — see the ping-pong note above.
		return;
	}
	const agent = await findUser(db, { id: event.agentId });
	const displayName = agent?.name ?? event.agentId;
	const result = await sendMessage(
		{ actor: SYSTEM_ACTOR_ID, db, eventBus, now: new Date(event.timestamp).toISOString() },
		{
			threadId,
			clientKey: `run-admission-failed:${event.streamId}:${event.sourceId}:${event.agentId}`,
			text: `${displayName} could not start. ${THREAD_TURN_FAILURE_REASON[event.failureCode]}`,
		},
	);
	if (!result.ok) {
		logger.error("thread turn admission notice refused", {
			threadId,
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
	// A task run that never started fails its dispatch attempt, so the task shows it.
	if (event.taskId !== null && event.sourceKind === "task") {
		await work.taskDispatchAttemptStore.markLatestRequestedFailed(db, event.taskId);
		return;
	}
	// A turn in a thread tells the people there. A subscription's wake has no one waiting.
	if (event.threadId !== null && event.sourceKind === "assistant") {
		await notifyThreadTurnAdmissionFailure(db, eventBus, event, event.threadId, threadDeps.sendMessage);
		return;
	}
	logger.warn("agent run refused admission", {
		agentId: event.agentId,
		sourceKind: event.sourceKind,
		sourceId: event.sourceId,
		failureCode: event.failureCode,
	});
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
			void reactToAdmissionFailure(db, eventBus, event, threadDeps).catch((error: unknown) => {
				logger.error("agent_run_admission_failed reaction failed", {
					sourceKind: event.sourceKind,
					sourceId: event.sourceId,
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

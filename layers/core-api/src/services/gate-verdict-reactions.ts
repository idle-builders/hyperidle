/**
 * Gate verdict reactions — core-api's response to a human approving a gate block.
 *
 * When a verdict message with decision "approve" or "approve-with-comments" resolves
 * a thread, this reaction checks whether the resolved review message has a matching
 * gate_review record. If it does, it submits a new session_start intent whose
 * `bakedRequest.gateResume` carries the native session ID and blocked tool name —
 * the run-orchestration provisioner uses these to add a per-tool clearance and
 * resume the suspended harness session (Phase 9 in provisioner.ts).
 *
 * @lore no-extra-clearance-from-ordinary-review: the gate_reviews lookup is the
 * guard. A review that was NOT created by the gate has no record and no resume fires.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { findMessage } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus, ThreadResolvedEvent } from "@hyperidle/event-bus";
import { findGateReviewByMessageId } from "@hyperidle/settings";

const logger = createLogger({ pkg: "core-api.gate-verdict-reactions" });
const registeredBuses = new WeakSet<EventBus>();

async function reactToThreadResolved(
	db: HyperIdleDb,
	event: ThreadResolvedEvent,
	agentOrchestration: AgentOrchestrationPort,
): Promise<void> {
	// Load the verdict message that resolved the thread.
	const verdictMessage = await findMessage(db, { id: event.resolvedByMessageId });
	if (!verdictMessage) return;
	if (verdictMessage.type !== "verdict") return;

	// Parse the verdict payload to check decision and get resolvesMessageId.
	let verdictPayload: { decision?: string; resolvesMessageId?: string } | undefined;
	try {
		verdictPayload = JSON.parse(verdictMessage.payload) as typeof verdictPayload;
	} catch {
		return; // malformed payload — ignore
	}
	if (!verdictPayload) return;

	const { decision, resolvesMessageId } = verdictPayload;
	// Only act on approve/approve-with-comments verdicts.
	if (decision !== "approve" && decision !== "approve-with-comments") return;
	if (!resolvesMessageId) return;

	// Look up the gate review for the resolved message.
	const gateReview = await findGateReviewByMessageId(db, resolvesMessageId);
	if (!gateReview) return; // not a gate-blocked review — ordinary review, skip

	// Guard: need nativeSessionId to resume.
	if (!gateReview.nativeSessionId) {
		logger.warn("gate verdict: no nativeSessionId on gate review — cannot resume", {
			gateReviewId: gateReview.id,
			sessionId: gateReview.sessionId,
		});
		return;
	}

	// Submit a session_start intent with gateResume payload so the provisioner
	// can add the per-tool clearance and call harness.resumeSession.
	const idempotencyKey = `gate-resume-${gateReview.id}`;
	await agentOrchestration.intents.submit({
		kind: "session_start",
		sourceKind: "session",
		sourceId: gateReview.sessionId,
		idempotencyKey,
		bakedRequest: {
			agentId: gateReview.agentId,
			taskId: gateReview.taskId,
			gateResume: {
				nativeSessionId: gateReview.nativeSessionId,
				blockedTool: gateReview.blockedTool,
				ruleId: gateReview.ruleId,
			},
		},
	});

	logger.info("gate verdict: submitted session_start for gate resume", {
		gateReviewId: gateReview.id,
		sessionId: gateReview.sessionId,
		nativeSessionId: gateReview.nativeSessionId,
		blockedTool: gateReview.blockedTool,
		idempotencyKey,
	});
}

/**
 * Register the gate verdict reaction on `eventBus`. Returns an unsubscribe
 * function. Safe to call more than once with the SAME `eventBus` instance —
 * only the first registration takes effect.
 */
export function registerGateVerdictReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("thread_resolved", (event) => {
		void reactToThreadResolved(db, event, agentOrchestration).catch((error: unknown) => {
			logger.error("thread_resolved gate verdict reaction failed", {
				threadId: event.threadId,
				resolvedByMessageId: event.resolvedByMessageId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}

import type { EventBus } from "./event-bus.js";
import type {
	AgentRunAdmissionFailureCode,
	AgentWorkIntentKind,
	AgentWorkIntentSourceKind,
} from "./events.js";

const AGENT_WORK_INTENT_KINDS = [
	"assistant_turn",
	"session_start",
	"knowledge_action",
	"routine_run",
	"bet_decomposition",
	"task_run",
	"reengagement",
] as const;

/** Narrow a raw `agent_work_intents.kind` (a plain DB `text` column) to `AgentWorkIntentKind`. */
export function isAgentWorkIntentKind(value: string): value is AgentWorkIntentKind {
	return (AGENT_WORK_INTENT_KINDS as readonly string[]).includes(value);
}

const AGENT_WORK_INTENT_SOURCE_KINDS = [
	"thread_message",
	"explicit_session_start",
	"knowledge_action",
	"routine_run",
	"bet",
	"task_dispatch_attempt",
	"proposed_call",
] as const;

/** Narrow a raw `agent_work_intents.source_kind` (a plain DB `text` column) to `AgentWorkIntentSourceKind`. */
export function isAgentWorkIntentSourceKind(value: string): value is AgentWorkIntentSourceKind {
	return (AGENT_WORK_INTENT_SOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * AU21 §6 Decision B4 / §12 — the ONE construction+emission point for the
 * pre-handoff `agent_run_admission_failed` channel, shared by BOTH real
 * failure sites:
 *
 *   - `session-requests`'s `failOrRelease` (drain-time claim/dispatch
 *     failure — before any `agentSessionRequest` exists).
 *   - `run-orchestration`'s `runClaimedRequest` (provisioning-time failure —
 *     a `agentSessionRequest` was handed off, but building/deploying the
 *     actual session failed before it started running, e.g. a
 *     `TargetAgentNotRunnableError` from `provisioner.ts`'s admission
 *     Phase 1, or any other hard pre-admission infra failure).
 *
 * Lives in `@hyperidle/shared` (a leaf both already depend on) rather than
 * being exported from `@hyperidle/session-requests` as first drafted: `
 * session-requests` and `run-orchestration` are SIBLING agent-orchestration
 * packages that must not import each other directly (the same Mechanism-C
 * discipline `session-requests`'s own top-of-file `@lore` documents:
 * "session-requests never imports another Service"; `run-orchestration` has
 * no dependency on `@hyperidle/session-requests` in its `package.json` today
 * and adding one solely to reach a helper would be exactly the kind of new
 * cross-package edge this work package exists to prevent). A shared leaf
 * function is the correct home, not a relocation of one Service's internal
 * bookkeeping into another's import graph.
 */
export function reportAdmissionFailure(
	eventBus: EventBus,
	input: {
		readonly intentId: string;
		readonly kind: AgentWorkIntentKind;
		readonly sourceKind: AgentWorkIntentSourceKind;
		readonly sourceId: string;
		readonly failureCode: AgentRunAdmissionFailureCode;
		readonly terminal: boolean;
		readonly timestamp?: number;
	},
): void {
	eventBus.emit({
		type: "agent_run_admission_failed",
		streamId: `${input.kind}:${input.sourceId}`,
		intentId: input.intentId,
		kind: input.kind,
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		failureCode: input.failureCode,
		terminal: input.terminal,
		timestamp: input.timestamp ?? Date.now(),
	});
}

import {
	AGENT_WORK_INTENT_KINDS,
	type AgentWorkIntentKind,
	type AgentWorkIntentSourceKind,
} from "./events.js";

/** Narrow a raw `agent_work_intents.kind` (a plain DB `text` column) to `AgentWorkIntentKind`. */
export function isAgentWorkIntentKind(value: string): value is AgentWorkIntentKind {
	return (AGENT_WORK_INTENT_KINDS as readonly string[]).includes(value);
}

const AGENT_WORK_INTENT_SOURCE_KINDS = [
	"thread_message",
	"explicit_session_start",
	"knowledge_action",
	"routine_run",
	"task_dispatch_attempt",
	"proposed_call",
] as const;

/** Narrow a raw `agent_work_intents.source_kind` (a plain DB `text` column) to `AgentWorkIntentSourceKind`. */
export function isAgentWorkIntentSourceKind(value: string): value is AgentWorkIntentSourceKind {
	return (AGENT_WORK_INTENT_SOURCE_KINDS as readonly string[]).includes(value);
}

// @lore AU29 §2.4: `reportAdmissionFailure` (the pre-handoff `agent_run_admission_failed`
// construction+emit point, AU21 §6 Decision B4/§12) is gone — `framework/shared` is the
// event bus HOST, and a framework package that also publishes on it is both the pipe and
// the water. Its two real callers (`session-requests`'s `failOrRelease` and
// `run-orchestration`'s `runClaimedRequest`) now each build the event literal and call
// `eventBus.emit(...)` themselves; they still share the event *type* below (`events.ts`),
// just not an emit helper. The two guards above stay here — both callers still need them.

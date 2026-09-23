/**
 * Agent-work-intent type guards, local to @hyperidle/session-requests.
 *
 * @lore AU44-b8: moved from framework/domain-model/src/agent-work-intent-kinds.ts.
 * Guards over event-bus types used only within agent-orchestration.
 */
import {
	AGENT_WORK_INTENT_KINDS,
	type AgentWorkIntentKind,
	type AgentWorkIntentSourceKind,
} from "@hyperidle/event-bus";

const AGENT_WORK_INTENT_SOURCE_KINDS = [
	"thread_message",
	"explicit_session_start",
	"knowledge_action",
	"routine_run",
	"task_dispatch_attempt",
	// @lore BC5 T6: additive alongside `routine_run`; the cut-over block retires it.
	"subscription",
] as const;

/** Narrow a raw `agent_work_intents.kind` DB column value to `AgentWorkIntentKind`. */
export function isAgentWorkIntentKind(value: string): value is AgentWorkIntentKind {
	return (AGENT_WORK_INTENT_KINDS as readonly string[]).includes(value);
}

/** Narrow a raw `agent_work_intents.source_kind` DB column value to `AgentWorkIntentSourceKind`. */
export function isAgentWorkIntentSourceKind(value: string): value is AgentWorkIntentSourceKind {
	return (AGENT_WORK_INTENT_SOURCE_KINDS as readonly string[]).includes(value);
}

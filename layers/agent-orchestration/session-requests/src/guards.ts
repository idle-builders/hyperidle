import {
	AGENT_WORK_INTENT_KINDS,
	type AgentWorkIntentKind,
	type AgentWorkIntentSourceKind,
} from "@hyperidle/event-bus";

const AGENT_WORK_INTENT_SOURCE_KINDS = [
	"thread_message",
	"task_dispatch_attempt",
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

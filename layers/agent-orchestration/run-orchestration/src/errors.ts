/**
 * Agent-orchestration-owned error classes and guards.
 *
 * @lore AU44-b8: error classes moved from framework/domain-model/src/errors.ts.
 * Guards moved from framework/domain-model/src/agent-work-intent-kinds.ts.
 * All symbols are used exclusively within agent-orchestration.
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
	"proposed_call",
] as const;

/** Narrow a raw `agent_work_intents.kind` DB column value to `AgentWorkIntentKind`. */
export function isAgentWorkIntentKind(value: string): value is AgentWorkIntentKind {
	return (AGENT_WORK_INTENT_KINDS as readonly string[]).includes(value);
}

/** Narrow a raw `agent_work_intents.source_kind` DB column value to `AgentWorkIntentSourceKind`. */
export function isAgentWorkIntentSourceKind(value: string): value is AgentWorkIntentSourceKind {
	return (AGENT_WORK_INTENT_SOURCE_KINDS as readonly string[]).includes(value);
}

export class ConcurrencyLimitError extends Error {
	constructor(
		public readonly agentId: string,
		public readonly limit: number,
	) {
		super(`Agent '${agentId}' concurrency limit reached (${limit})`);
		this.name = "ConcurrencyLimitError";
	}
}

/**
 * @lore AU21 §12 — the emit→deactivate→drain race, RESOLVED (founder,
 * 2026-07-27): if the agent resolved at emit is deactivated by the time
 * orchestration goes to provision the session, that is a provisioning
 * failure like any other — reported via the pre-handoff
 * `agent_run_admission_failed` channel with `failureCode:
 * "TARGET_AGENT_NOT_RUNNABLE"`, no bespoke race-handling.
 */
export class TargetAgentNotRunnableError extends Error {
	constructor(public readonly agentId: string) {
		super(`Agent '${agentId}' is not a runnable AI agent (deactivated after admission was baked)`);
		this.name = "TargetAgentNotRunnableError";
	}
}

/**
 * AH2: Thrown by session provisioning when no registered adapter matches the
 * agent's harnessType.
 *
 * @lore AH2: Distinct from MissingCredentialError — this is a configuration
 * problem (no adapter registered for that type), not a credential problem.
 */
export class NoEligibleHarnessError extends Error {
	constructor(public readonly harnessType: string) {
		super(
			`No registered adapter matches harness type '${harnessType}'. ` +
				`Check Settings → Agents or ensure the harness is registered at startup.`,
		);
		this.name = "NoEligibleHarnessError";
	}
}

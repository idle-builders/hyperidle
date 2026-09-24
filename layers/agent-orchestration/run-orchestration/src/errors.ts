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
	constructor(
		public readonly harnessType: string,
		reason?: string,
	) {
		super(
			`No registered adapter matches harness type '${harnessType}'${reason ? ` — ${reason}` : ""}. ` +
				`Check Settings → Agents or ensure the harness is registered at startup.`,
		);
		this.name = "NoEligibleHarnessError";
	}
}

/**
 * No harness could be selected for an agent that pinned none — the pool was
 * empty, paused, filtered out, or full. `reason` comes from the pool itself,
 * which is the only thing that can tell those apart.
 *
 * Exists as a named class purely so the failure gets a usable `error_code`:
 * the durable record derives it from `err.name`, and a plain `new Error` lands
 * as the literal string `"Error"` — which is what every failed request in a
 * real database used to carry.
 */
export class NoAvailableHarnessError extends Error {
	constructor(public readonly reason: string) {
		super(`Could not select a harness to run this agent — ${reason}`);
		this.name = "NoAvailableHarnessError";
	}
}

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

export class ConcurrencyLimitError extends Error {
	constructor(
		public readonly agentId: string,
		public readonly limit: number,
	) {
		super(`Agent '${agentId}' concurrency limit reached (${limit})`);
		this.name = "ConcurrencyLimitError";
	}
}

export class TargetAgentNotRunnableError extends Error {
	constructor(public readonly agentId: string) {
		super(`Agent '${agentId}' is not a runnable AI agent (deactivated after admission was baked)`);
		this.name = "TargetAgentNotRunnableError";
	}
}

/**
 * Thrown by session provisioning when no registered adapter matches the agent's harnessType.
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
 * Named class (not a plain Error) so the failure gets a usable `error_code`
 * — the durable record derives it from `err.name`.
 */
export class NoAvailableHarnessError extends Error {
	constructor(public readonly reason: string) {
		super(`Could not select a harness to run this agent — ${reason}`);
		this.name = "NoAvailableHarnessError";
	}
}

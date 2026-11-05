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
				`Sign in to an agent program on this computer (Agent programs on your page), or pick another under Runs on in the agent's Edit dialog.`,
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

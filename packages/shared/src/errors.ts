export class InvalidTransitionError extends Error {
	constructor(
		public readonly from: string,
		public readonly to: string,
	) {
		super(`Invalid transition from '${from}' to '${to}'`);
		this.name = "InvalidTransitionError";
	}
}

export class VersionConflictError extends Error {
	constructor(
		public readonly entityId: string,
		public readonly expected: number,
		public readonly actual: number,
	) {
		super(`Version conflict for '${entityId}': expected ${expected}, got ${actual}`);
		this.name = "VersionConflictError";
	}
}

export class CapacityExceededError extends Error {
	constructor(
		public readonly teamId: string,
		public readonly capacity: number,
	) {
		super(`Team '${teamId}' is at capacity (${capacity})`);
		this.name = "CapacityExceededError";
	}
}

export class CostCapExceededError extends Error {
	constructor(
		public readonly entityId: string,
		public readonly spend: number,
		public readonly cap: number,
	) {
		super(`Cost cap exceeded for '${entityId}': ${spend}/${cap}`);
		this.name = "CostCapExceededError";
	}
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

export class MissingCredentialError extends Error {
	constructor(public readonly credential: string) {
		super(`Missing credential: '${credential}'`);
		this.name = "MissingCredentialError";
	}
}

export class ActiveRoutinesError extends Error {
	constructor(
		public readonly agentId: string,
		public readonly count: number,
	) {
		super(`Agent '${agentId}' has ${count} active routines`);
		this.name = "ActiveRoutinesError";
	}
}

/**
 * AH2: Thrown by session provisioning when no registered adapter matches the
 * agent's harnessType. The agent's harness must be registered in the adapter
 * pool before sessions can be created.
 *
 * @lore AH2: Distinct from MissingCredentialError — this is a configuration
 * problem (no adapter registered for that type), not a credential problem.
 * The message points to Settings → Agents so the user knows where to fix it.
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

/**
 * AH3: Thrown when a provider hangs and never emits a completion or error event
 * within ASSISTANT_TURN_TIMEOUT_MS. Maps explicitly to the `provider_error` notice
 * class — NOT the default unmapped branch — so it does not trip console.error.
 *
 * @lore AH3: A hung provider (no throw, no completion) must be bounded by a wall-clock
 * timeout so the "never silent" guarantee holds even when the provider connection stalls.
 * This error travels through persistTurnFailure just like any other provider error.
 */
export class ProviderTimeoutError extends Error {
	constructor() {
		super("Provider did not respond within the turn timeout window.");
		this.name = "ProviderTimeoutError";
	}
}

/**
 * AH3: Wall-clock timeout for one assistant turn. After this many milliseconds
 * with no completion/error event from the harness, the turn aborts and persists
 * a `provider_error` notice. Exported from @hyperidle/shared so both server
 * (timeout enforcement) and client (crash-recovery indicator, §1.7b) use the
 * same boundary value.
 *
 * @lore AH3: 120_000ms = 2 minutes. Long enough for a slow but real response;
 * short enough that a hung provider surfaces within a visible session rather
 * than stranding the UI in "thinking…" forever.
 */
export const ASSISTANT_TURN_TIMEOUT_MS = 120_000;

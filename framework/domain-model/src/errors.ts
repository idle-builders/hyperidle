export class InvalidTransitionError extends Error {
	constructor(
		public readonly from: string,
		public readonly to: string,
	) {
		super(`Invalid transition from '${from}' to '${to}'`);
		this.name = "InvalidTransitionError";
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

/**
 * @lore AU21 §12 — the emit→deactivate→drain race, RESOLVED (founder,
 * 2026-07-27): if the agent resolved at emit is deactivated by the time
 * orchestration goes to provision the session, that is a provisioning
 * failure like any other — reported via the pre-handoff
 * `agent_run_admission_failed` channel with `failureCode:
 * "TARGET_AGENT_NOT_RUNNABLE"`, no bespoke race-handling. Thrown by
 * `provisioner.ts`'s `admitSession` Phase 1 (the real point where a
 * deactivated agent currently sails through unchecked — traced, not
 * guessed — `getUserById` loads the row but never re-validated `status`
 * before this fix).
 */
export class TargetAgentNotRunnableError extends Error {
	constructor(public readonly agentId: string) {
		super(`Agent '${agentId}' is not a runnable AI agent (deactivated after admission was baked)`);
		this.name = "TargetAgentNotRunnableError";
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
 * AH3: Wall-clock timeout for one assistant turn. After this many milliseconds
 * with no completion/error event from the harness, the turn aborts and persists
 * a `provider_error` notice. Exported from @hyperidle/domain-model so both server
 * (timeout enforcement) and client (crash-recovery indicator, §1.7b) use the
 * same boundary value.
 *
 * @lore AH3: 120_000ms = 2 minutes. Long enough for a slow but real response;
 * short enough that a hung provider surfaces within a visible session rather
 * than stranding the UI in "thinking…" forever.
 */
export const ASSISTANT_TURN_TIMEOUT_MS = 120_000;

/**
 * POLISH-060 B2: Thrown by the LLM HTTP client on a non-2xx response.
 * `dispatch`'s `mapErrorToNotice` maps 401/403 → auth notice, 400 →
 * model/config notice, other codes → generic (transient) provider_error.
 *
 * @lore AU19 Increment 3h: reclassified from `packages/server/src/harness/
 * llm-client.ts` to `@hyperidle/domain-model` — `dispatch`'s error-mapping needs
 * `instanceof HttpError` across the agent-orchestration → agent-execution
 * seam, and Mechanism C forbids a Service importing another Service's class
 * (even for `instanceof`). Same treatment as `MissingCredentialError`/
 * `NoEligibleHarnessError`/`ProviderTimeoutError` above — a cross-cutting
 * error taxonomy lives in `shared`, not in the Service that happens to throw
 * it first.
 */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "HttpError";
	}
}


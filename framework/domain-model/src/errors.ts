export class MissingCredentialError extends Error {
	constructor(public readonly credential: string) {
		super(`Missing credential: '${credential}'`);
		this.name = "MissingCredentialError";
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
 * (even for `instanceof`). Same treatment as `MissingCredentialError` — a cross-cutting
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

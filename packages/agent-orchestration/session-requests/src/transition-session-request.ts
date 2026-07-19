/**
 * Unified state-machine writer — replaces the 7 individual transition verb
 * exports with two parameterised functions.
 *
 * @lore AU20 Ag3b (METHOD-COLLAPSE): `markRequestRunning`,
 * `terminalizeAgentSessionRequest`, `terminalizeAgentSessionRequestInTx`,
 * `requestAgentSessionTermination`, `markExplicitSessionStartAdmitted`,
 * `markExplicitSessionStartFailed`, and `projectExplicitSessionStartTerminalState`
 * collapse into `transitionSessionRequest` (opens own tx when needed) +
 * `transitionSessionRequestInTx` (for callers already inside a tx). A new
 * disposition adds a discriminant arm, not a new exported function.
 *
 * `deps` carries `triggerHistory` (needed by `{to:'running'}`) and
 * `lifecycleInbox` (needed by terminal cases). Cases that need neither
 * (`{to:'termination-requested'}` and `{target:'explicitStart'}`) do not
 * require `deps` in their overloads.
 */

import type { AgentSessionRequest, HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { AgentSessionRequestStatus } from "@hyperidle/shared";
import {
	markRequestRunning,
	requestAgentSessionTermination,
	terminalizeAgentSessionRequest,
	terminalizeAgentSessionRequestInTx,
} from "./agent-session-requests.js";
import {
	markExplicitSessionStartAdmitted,
	markExplicitSessionStartFailed,
	projectExplicitSessionStartTerminalState,
} from "./explicit-session-starts.js";
import type { MarkRequestRunningDeps } from "./ports.js";

// ---------------------------------------------------------------------------
// Transition spec discriminated unions
// ---------------------------------------------------------------------------

/** Spec for `{to:'running'}` — was `markRequestRunning`. */
export interface SessionRequestRunningTransition {
	readonly to: "running";
	readonly requestId: string;
	readonly sessionId: string;
	readonly claimToken?: string;
}

/** Spec for terminal transitions of an agentSessionRequest — was `TerminalizeAgentSessionRequestInput`. */
export type SessionRequestTerminalTransition =
	| {
			readonly to: Extract<AgentSessionRequestStatus, "completed" | "failed" | "cancelled">;
			readonly precondition: "running";
			readonly requestId: string;
			readonly sessionId: string;
			readonly failureCode?: string;
			readonly errorMessage?: string;
			/** Natural completion: reject if a termination reason already exists. */
			readonly requireNoTerminationReason?: boolean;
	  }
	| {
			readonly to: "failed";
			readonly precondition: "claimed";
			readonly requestId: string;
			readonly claimToken: string;
			readonly failureCode?: string;
			readonly errorMessage?: string;
	  };

/** Spec for `{to:'termination-requested'}` — was `requestAgentSessionTermination`. */
export interface SessionRequestTerminationRequestedTransition {
	readonly to: "termination-requested";
	readonly requestId: string;
	readonly reason: string;
	readonly requestedBy?: string;
}

/** Spec for pre-admission explicit-start transitions — was `markExplicitSessionStartAdmitted/Failed`. */
export type SessionRequestExplicitStartTransition =
	| {
			readonly target: "explicitStart";
			readonly to: "admitted";
			/** The ExplicitSessionStart row id (primary key). */
			readonly startId: string;
			readonly requestId: string;
			readonly sessionId: string;
	  }
	| {
			readonly target: "explicitStart";
			readonly to: "failed";
			/** The ExplicitSessionStart row id (primary key). */
			readonly startId: string;
			readonly failureCode: string;
	  };

/**
 * Full discriminated union of all transitions that `transitionSessionRequest` handles.
 * `{target:'explicitStart'}` covers only the pre-admission phase (keyed by `startId`);
 * post-run projection (keyed by `requestId`) is in `SessionRequestInTxTransition`.
 */
export type SessionRequestTransition =
	| SessionRequestRunningTransition
	| SessionRequestTerminalTransition
	| SessionRequestTerminationRequestedTransition
	| SessionRequestExplicitStartTransition;

/**
 * Spec for tx-scoped transitions: terminal agentSessionRequest writes and
 * post-run explicit-start projection (keyed by `requestId`).
 * Used by `transitionSessionRequestInTx`.
 */
export type SessionRequestInTxTransition =
	| SessionRequestTerminalTransition
	| {
			readonly target: "explicitStart";
			/** Distinguishes this arm from the pre-admission `SessionRequestExplicitStartTransition` which uses `startId`. */
			readonly requestId: string;
			readonly to: Extract<AgentSessionRequestStatus, "completed" | "failed" | "cancelled">;
			readonly sessionId: string | null;
			readonly failureCode: string | null;
	  };

// ---------------------------------------------------------------------------
// Deps bundle (subset of DurableAgentQueueDeps)
// ---------------------------------------------------------------------------

// @lore AU20 B1a: TerminalizeSessionRequestDeps removed — agentLifecycleInbox
// is now owned by session-requests; terminalize functions call inbox directly.
type TransitionDeps = MarkRequestRunningDeps;

// ---------------------------------------------------------------------------
// transitionSessionRequest — overloads
// ---------------------------------------------------------------------------

/** `{to: 'running'}` → `void`. Requires `deps.triggerHistory`. */
export function transitionSessionRequest(
	db: HyperIdleDb,
	spec: SessionRequestRunningTransition,
	deps: TransitionDeps,
): Promise<void>;

/** Terminal request transition → `AgentSessionRequest | null`. No deps needed. */
export function transitionSessionRequest(
	db: HyperIdleDb,
	spec: SessionRequestTerminalTransition,
): Promise<AgentSessionRequest | null>;

/** `{to: 'termination-requested'}` → disposition string. No deps. */
export function transitionSessionRequest(
	db: HyperIdleDb,
	spec: SessionRequestTerminationRequestedTransition,
): Promise<"accepted" | "idempotent" | "conflict" | "terminal">;

/** Pre-admission explicit-start transitions → `void`. No deps. */
export function transitionSessionRequest(
	db: HyperIdleDb,
	spec: SessionRequestExplicitStartTransition,
): Promise<void>;

// Implementation signature (not visible to callers as a distinct overload).
export function transitionSessionRequest(
	db: HyperIdleDb,
	spec: SessionRequestTransition,
	deps?: Partial<TransitionDeps>,
): Promise<
	void | AgentSessionRequest | null | "accepted" | "idempotent" | "conflict" | "terminal"
> {
	// @lore AU20 Ag3b: use `"target" in spec` alone (not compound) so TypeScript's
	// control-flow narrows `spec` to `SessionRequestExplicitStartTransition` inside
	// the block and removes it from the fallthrough — a compound `&&` prevents that.
	if ("target" in spec) {
		if (spec.to === "admitted") {
			return markExplicitSessionStartAdmitted(db, {
				id: spec.startId,
				requestId: spec.requestId,
				sessionId: spec.sessionId,
			});
		}
		// to === 'failed' (pre-admission)
		return markExplicitSessionStartFailed(db, {
			id: spec.startId,
			failureCode: spec.failureCode,
		});
	}
	if (spec.to === "running") {
		return markRequestRunning(
			db,
			spec.requestId,
			spec.sessionId,
			deps as MarkRequestRunningDeps,
			spec.claimToken,
		);
	}
	if (spec.to === "termination-requested") {
		return requestAgentSessionTermination(db, {
			requestId: spec.requestId,
			reason: spec.reason,
			requestedBy: spec.requestedBy,
		});
	}
	// Terminal case (precondition: 'running' | 'claimed')
	const terminalInput =
		spec.precondition === "running"
			? ({
					requestId: spec.requestId,
					precondition: "running" as const,
					sessionId: spec.sessionId,
					state: spec.to,
					failureCode: spec.failureCode,
					errorMessage: spec.errorMessage,
					requireNoTerminationReason: spec.requireNoTerminationReason,
				} as const)
			: ({
					requestId: spec.requestId,
					precondition: "claimed" as const,
					claimToken: spec.claimToken,
					state: spec.to,
					failureCode: spec.failureCode,
					errorMessage: spec.errorMessage,
				} as const);
	return terminalizeAgentSessionRequest(db, terminalInput);
}

// ---------------------------------------------------------------------------
// transitionSessionRequestInTx — tx-scoped variant
// ---------------------------------------------------------------------------

/** Terminal request transition inside an existing tx → `AgentSessionRequest | null`. No deps needed. */
export function transitionSessionRequestInTx(
	exec: WriteExecutor,
	spec: SessionRequestTerminalTransition,
): Promise<AgentSessionRequest | null>;

/** Post-run explicit-start projection inside an existing tx → `void`. No deps. */
export function transitionSessionRequestInTx(
	exec: WriteExecutor,
	spec: Extract<SessionRequestInTxTransition, { target: string }>,
): Promise<void>;

// Implementation.
export function transitionSessionRequestInTx(
	exec: WriteExecutor,
	spec: SessionRequestInTxTransition,
): Promise<AgentSessionRequest | null | void> {
	// Same `"target" in spec` alone pattern as `transitionSessionRequest` above.
	if ("target" in spec) {
		return projectExplicitSessionStartTerminalState(exec, spec.requestId, {
			status: spec.to,
			sessionId: spec.sessionId,
			failureCode: spec.failureCode,
		});
	}
	// Terminal request transition
	const terminalInput =
		spec.precondition === "running"
			? ({
					requestId: spec.requestId,
					precondition: "running" as const,
					sessionId: spec.sessionId,
					state: spec.to,
					failureCode: spec.failureCode,
					errorMessage: spec.errorMessage,
					requireNoTerminationReason: spec.requireNoTerminationReason,
				} as const)
			: ({
					requestId: spec.requestId,
					precondition: "claimed" as const,
					claimToken: spec.claimToken,
					state: spec.to,
					failureCode: spec.failureCode,
					errorMessage: spec.errorMessage,
				} as const);
	return terminalizeAgentSessionRequestInTx(exec as HyperIdleDb, terminalInput);
}

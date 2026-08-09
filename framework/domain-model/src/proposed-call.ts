/**
 * AL7 trust-first — Proposed Call constants and types.
 *
 * Replaces staged-operation.ts. The trust-first model:
 *   agent works in session 1 → attempts irreversible call →
 *   routed to review (captured as Proposed Call, session 1 ends) →
 *   human reviews → approve → tailored grant composed →
 *   proposed_call_granted event → session 2 re-provisioned →
 *   agent re-attempts with own tools → Outcome recorded.
 *
 * @lore AL7: StagedOperationSpec + STAGED_OPERATION_STATUSES deleted.
 * HyperIdle executes nothing of its own (AC12) — the agent's own session
 * emits and executes the approved call.
 */

/** Status lifecycle for a Proposed Call. */
export const PROPOSED_CALL_STATUSES = [
	"captured",
	"granted",
	"executed",
	"failed",
	"held",
] as const;

export type ProposedCallStatus = (typeof PROPOSED_CALL_STATUSES)[number];

/** Reversibility classification (fail-closed: no signal → irreversible). */
export const REVERSIBILITY = ["irreversible", "reversible"] as const;

export type Reversibility = (typeof REVERSIBILITY)[number];

/**
 * A Proposed Call — the captured record of an irreversible tool call the agent
 * attempted in session 1, now anchored to a review.
 */
export interface ProposedCall {
	readonly id: string;
	readonly reviewMessageId: string; // the gate
	readonly subjectThreadId: string; // anchor
	readonly artifactId: string; // action_operation artifact it nests on
	readonly originSessionId: string; // session 1
	readonly toolId: string; // verbatim tool name the agent called
	readonly args: Record<string, unknown>; // verbatim input
	readonly identityHash: string; // SHA-256 over canonical {toolId, args}; arg-pin convenience metadata; NOT a guard
	readonly reversibility: Reversibility;
	readonly status: ProposedCallStatus;
}

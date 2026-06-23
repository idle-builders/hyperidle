/**
 * AL7 — Staged operation constants and types shared across kernel, server, and UI.
 *
 * @lore AL7: StagedOperationSpec is the agent-authored fully-bound operation
 * parked un-executed behind the human gate. The dispatcher holds it until an
 * approve verdict fires. Agents only interact via stage_operation; the dispatcher
 * is Kernel-held and NOT in ALL_TOOL_DEFINITIONS.
 */

/** Status lifecycle for a staged operation. */
export const STAGED_OPERATION_STATUSES = ["pending", "executing", "executed", "failed"] as const;

export type StagedOperationStatus = (typeof STAGED_OPERATION_STATUSES)[number];

/** Terminal statuses for an operation outcome. */
export const OPERATION_OUTCOME_STATUSES = ["ok", "failed"] as const;

export type OperationOutcomeStatus = (typeof OPERATION_OUTCOME_STATUSES)[number];

/**
 * The fully-bound, parked operation. Passed to executeCapability.
 *
 * @lore AL7: params is Record<string, unknown> (not string) — the dispatcher
 * JSON.parse()'s the DB column before calling executeCapability, so callers
 * never handle raw JSON.
 */
export interface StagedOperationSpec {
	readonly id: string;
	readonly capabilityTool: string;
	readonly operation: string;
	readonly params: Record<string, unknown>;
	readonly idempotencyKey: string;
	readonly reversibility: string;
}

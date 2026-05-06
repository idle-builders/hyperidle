/**
 * L20 — Lifecycle Propagation shared types.
 *
 * These types are used by the propagation engine (server) and could be
 * consumed by UI code that renders propagation state.
 */

export type PropagationLevel = "session" | "task" | "bet" | "product" | "portfolio";

export type PropagationStatus = "applied" | "skipped" | "failed" | "pending_retry";

export interface PropagationResult {
	sourceLevel: PropagationLevel;
	sourceId: string;
	targetLevel: PropagationLevel;
	targetId: string;
	/** e.g. "in_progress -> review" or null if no-op */
	targetTransition: string | null;
	status: PropagationStatus;
	failureReason?: string;
}

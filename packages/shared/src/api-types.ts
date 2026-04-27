/** Standard error response shape for all API errors. */
export interface ApiErrorResponse {
	error: string;
	code: string;
	details?: Record<string, unknown>;
}

/** Error codes used across the API. */
export const API_ERROR_CODES = {
	UNAUTHORIZED: "UNAUTHORIZED",
	VALIDATION_ERROR: "VALIDATION_ERROR",
	INTERNAL_ERROR: "INTERNAL_ERROR",
	NOT_FOUND: "NOT_FOUND",
	CONFLICT: "CONFLICT",
	FORBIDDEN: "FORBIDDEN",
	// I2 — rate-limit and body-limit middleware. Adding these constants
	// up front (red phase) so the security tests can assert against the
	// canonical code without lifting magic strings into the test file.
	RATE_LIMITED: "RATE_LIMITED",
	PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
	// L2 — founder verdict conflict on the same thread.
	FOUNDER_CONFLICT: "FOUNDER_CONFLICT",
	// L4 — verdict undo window expired (RFC 9110 §15.5.10 — 410 Gone).
	GONE: "GONE",
	// L7 — factory paused; mutating routes return 423 Locked while a
	// kill switch is active. Recovery verbs themselves bypass the guard
	// (see factory-paused-guard middleware).
	LOCKED: "LOCKED",
} as const;

/** L4 — Verdict undo API. */
export interface VerdictUndoRequest {
	itemId: string;
	actorId: string;
	reason?: string;
}

export interface VerdictUndoSuccess {
	undo_response_id: string;
	reverted_response_id: string;
	prior_decision: string | null;
	at: string;
}

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

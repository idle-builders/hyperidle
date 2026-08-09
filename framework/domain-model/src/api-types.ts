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
	// S1 — per-user authentication error codes.
	SESSION_EXPIRED: "SESSION_EXPIRED",
	SESSION_REVOKED: "SESSION_REVOKED",
	INVITE_CLAIMED: "INVITE_CLAIMED",
	INVITE_EXPIRED: "INVITE_EXPIRED",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

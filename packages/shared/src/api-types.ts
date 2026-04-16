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
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

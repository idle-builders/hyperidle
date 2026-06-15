/**
 * Discriminated union returned by every skill tool handler.
 *
 * Tools never throw on expected failures (validation, not-found, conflicts).
 * Instead they return `err(...)` with a stable machine-readable code so the
 * agent harness can route on the failure shape.
 */
export type ToolResult<T = unknown> =
	| { readonly success: true; readonly data: T }
	| { readonly success: false; readonly error: string; readonly code: string };

/** Wrap a successful payload. */
export function ok<T>(data: T): ToolResult<T> {
	return { success: true, data };
}

/** Wrap an expected failure with a machine-readable code and human-readable message. */
export function err(code: string, error: string): ToolResult<never> {
	return { success: false, error, code };
}

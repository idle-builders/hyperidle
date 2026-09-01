/** Normalize Drizzle execute results across postgres-js and PGlite. */
export function executeRows<T>(
	result: ReadonlyArray<T> | { readonly rows: ReadonlyArray<T> },
): ReadonlyArray<T> {
	return "rows" in result ? result.rows : result;
}

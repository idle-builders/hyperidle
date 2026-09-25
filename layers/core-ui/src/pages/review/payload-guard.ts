/**
 * Minimal runtime guards for agent-authored artifact payloads.
 *
 * Canvases receive `artifact.payload: unknown`. These helpers let mappers verify
 * the top-level shape before reading fields, so malformed payloads fall back to
 * the safe local fixture instead of throwing or rendering nonsense.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
	return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

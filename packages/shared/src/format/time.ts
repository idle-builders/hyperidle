/**
 * AI3 — One clock — shared time formatter.
 *
 * STUB: signatures only. All functions throw until green phase.
 * Green phase (task #2) fills the implementation.
 */

export const TIME_PLACEHOLDER = "—";

export type TimestampInput = string | number | Date | null | undefined;

export function relativeShort(_input: TimestampInput, _now?: number): string {
	throw new Error("AI3: relativeShort not yet implemented");
}

export function relativeLong(_input: TimestampInput, _now?: number): string {
	throw new Error("AI3: relativeLong not yet implemented");
}

export function clockTime(_input: TimestampInput, _opts?: { seconds?: boolean }): string {
	throw new Error("AI3: clockTime not yet implemented");
}

export function absoluteDate(_input: TimestampInput): string {
	throw new Error("AI3: absoluteDate not yet implemented");
}

export function absoluteDateTime(_input: TimestampInput): string {
	throw new Error("AI3: absoluteDateTime not yet implemented");
}

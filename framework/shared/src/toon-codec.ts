/**
 * Type-safe wrappers around `encode`/`decode` for callers that work with
 * typed structs. The single unavoidable widening cast lives here — callers
 * use these generics and never write their own `as unknown as`.
 *
 * @lore TOON-boundary: `encode` requires `Record<string,unknown>` while
 * callers hold typed structs. Widening a typed struct to `Record<string,unknown>`
 * requires a double-cast in TS strict mode because structural subtyping alone
 * doesn't prove every property value satisfies `unknown`. The canonical fix is
 * to contain the ONE cast here, behind a generic API, so no caller ever writes
 * `as unknown as`. Both `encodeTyped` and `decodeTyped` are the only places
 * this boundary is crossed.
 */

/**
 * The one error this codec throws.
 *
 * @lore AU34: declared in a module of its own until nothing outside this package reached it and its
 * only reader was this file. Folded in rather than carried across the split as a module with no
 * consumer outside its package.
 */
export class ToonParseError extends Error {
	readonly line: number;
	readonly detail: string;

	constructor(message: string, line: number, detail: string) {
		super(`TOON parse error at line ${line}: ${message} (${detail})`);
		this.name = "ToonParseError";
		this.line = line;
		this.detail = detail;
	}
}

export function encodeTyped<T extends object>(value: T): string {
	// `encode` accepts any object and only reads it — no cast needed.
	return encode(value);
}

/**
 * Type-safe wrapper around `decode`. Returns `T` after decoding.
 * The caller asserts that the TOON content matches `T` — no runtime validation
 * is performed here. Add a guard (e.g. zod parse) at the call site when
 * deserializing untrusted data.
 */
export function decodeTyped<T extends object>(toon: string): T {
	// Single audited narrowing cast: decode returns Record<string,unknown> (an
	// object); the caller asserts the concrete shape T. No runtime validation —
	// add a zod parse at the call site for untrusted input. Constraining
	// `T extends object` keeps this a one-step downcast (no `unknown` bridge).
	return decode(toon) as T;
}

/**
 * Encode a JavaScript object into TOON format.
 */
export function encode(obj: object): string {
	const lines: string[] = [];
	flattenToLines(obj, "", lines);
	return lines.join("\n");
}

function flattenToLines(value: unknown, prefix: string, lines: string[]): void {
	// @lore I6: skip undefined values, matching JSON.stringify behavior.
	// JSON.stringify({a: undefined}) produces {} — TOON should be consistent.
	if (value === undefined) {
		return;
	}

	if (value === null) {
		lines.push(`${prefix}:`);
		return;
	}

	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			const key = `${prefix}[${i}]`;
			flattenToLines(value[i], key, lines);
		}
		return;
	}

	if (typeof value === "object" && value !== null) {
		const entries = Object.entries(value as Record<string, unknown>);
		for (const [k, v] of entries) {
			const key = prefix ? `${prefix}.${k}` : k;
			flattenToLines(v, key, lines);
		}
		return;
	}

	if (typeof value === "string") {
		if (value === "") {
			// Empty string: use key followed by colon+space and empty
			// Distinguish from null by having ": " (colon-space) vs ":" (colon only)
			lines.push(`${prefix}: `);
			return;
		}
		if (value.includes("\n")) {
			lines.push(`${prefix}: |`);
			for (const line of value.split("\n")) {
				lines.push(`  ${line}`);
			}
			return;
		}
		lines.push(`${prefix}: ${value}`);
		return;
	}

	// numbers, booleans
	lines.push(`${prefix}: ${String(value)}`);
}

/**
 * Decode a TOON string into a JavaScript object.
 */
export function decode(toon: string): Record<string, unknown> {
	const lines = toon.split("\n");
	const result: Record<string, unknown> = {};
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		// Bounds-check above guarantees element; guard below satisfies noUncheckedIndexedAccess.
		if (line === undefined) break;

		// Skip empty lines and separator lines
		if (line.trim() === "" || line.trim().startsWith("---")) {
			i++;
			continue;
		}

		// Check if this is a continuation line (indented) — should not appear outside multi-line context
		if (line.startsWith("  ") && !line.includes(":")) {
			throw new ToonParseError(
				"unexpected indented line outside multi-line block",
				i + 1,
				`got "${line.trim()}"`,
			);
		}

		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) {
			throw new ToonParseError("missing colon separator", i + 1, `got "${line}"`);
		}

		const key = line.substring(0, colonIndex);
		const rawValue = line.substring(colonIndex + 1);

		// Check for multi-line string (value is " |")
		if (rawValue === " |") {
			const multiLines: string[] = [];
			i++;
			while (i < lines.length) {
				const continuationLine = lines[i];
				// Bounds-check above guarantees element; guard below satisfies noUncheckedIndexedAccess.
				if (continuationLine === undefined) break;
				if (!continuationLine.startsWith("  ")) break;
				multiLines.push(continuationLine.substring(2));
				i++;
			}
			setNestedValue(result, key, multiLines.join("\n"), i);
			continue;
		}

		const parsedValue = parseValue(rawValue);
		setNestedValue(result, key, parsedValue, i + 1);
		i++;
	}

	return result;
}

function parseValue(raw: string): unknown {
	// Null: nothing after colon
	if (raw === "") {
		return null;
	}

	// Value starts after the space following colon
	// ":" means null, ": " means empty string, ": value" means value
	if (!raw.startsWith(" ")) {
		return null;
	}

	const value = raw.substring(1);

	// Empty string
	if (value === "") {
		return "";
	}

	// Boolean
	if (value === "true") return true;
	if (value === "false") return false;

	// Number
	if (/^-?\d+(\.\d+)?$/.test(value)) {
		return Number(value);
	}

	return value;
}

function setNestedValue(
	obj: Record<string, unknown>,
	keyPath: string,
	value: unknown,
	lineNum: number,
): void {
	const segments = parseKeyPath(keyPath, lineNum);
	let current: Record<string, unknown> | unknown[] = obj;

	for (let i = 0; i < segments.length - 1; i++) {
		// Loop bound (i < segments.length - 1) guarantees seg and nextSeg exist.
		const seg = segments[i];
		const nextSeg = segments[i + 1];
		if (seg === undefined || nextSeg === undefined) break; // satisfies noUncheckedIndexedAccess

		if (typeof seg === "number") {
			const arr = current as unknown[];
			if (arr[seg] === undefined) {
				arr[seg] = typeof nextSeg === "number" ? [] : {};
			}
			current = arr[seg] as Record<string, unknown> | unknown[];
		} else {
			const record = current as Record<string, unknown>;
			if (record[seg] === undefined) {
				record[seg] = typeof nextSeg === "number" ? [] : {};
			}
			current = record[seg] as Record<string, unknown> | unknown[];
		}
	}

	// segments.length >= 1 guaranteed by parseKeyPath (it always produces at least one segment).
	const lastSeg = segments[segments.length - 1];
	if (lastSeg === undefined) return; // unreachable: parseKeyPath always returns ≥1 segment
	if (typeof lastSeg === "number") {
		(current as unknown[])[lastSeg] = value;
	} else {
		(current as Record<string, unknown>)[lastSeg] = value;
	}
}

function parseKeyPath(keyPath: string, lineNum: number): Array<string | number> {
	const segments: Array<string | number> = [];
	let current = "";

	for (let i = 0; i < keyPath.length; i++) {
		const ch = keyPath[i];

		if (ch === ".") {
			if (current) {
				segments.push(current);
				current = "";
			}
		} else if (ch === "[") {
			if (current) {
				segments.push(current);
				current = "";
			}
			const closeBracket = keyPath.indexOf("]", i);
			if (closeBracket === -1) {
				throw new ToonParseError("unclosed bracket in key", lineNum, `key "${keyPath}"`);
			}
			const indexStr = keyPath.substring(i + 1, closeBracket);
			const index = Number(indexStr);
			if (!Number.isInteger(index) || index < 0) {
				throw new ToonParseError(
					"invalid array index",
					lineNum,
					`index "${indexStr}" in key "${keyPath}"`,
				);
			}
			segments.push(index);
			i = closeBracket;
		} else {
			current += ch;
		}
	}

	if (current) {
		segments.push(current);
	}

	return segments;
}

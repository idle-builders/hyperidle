/**
 * Type-safe wrapper around `encode` for callers that work with typed structs.
 * The single unavoidable widening cast lives here — callers use this generic
 * and never write their own `as unknown as`.
 *
 * @lore TOON-boundary: `encode` requires `Record<string,unknown>` while
 * callers hold typed structs. Widening a typed struct to `Record<string,unknown>`
 * requires a double-cast in TS strict mode because structural subtyping alone
 * doesn't prove every property value satisfies `unknown`. The canonical fix is
 * to contain the ONE cast here, behind a generic API, so no caller ever writes
 * `as unknown as`.
 */

export function encodeTyped<T extends object>(value: T): string {
	// `encode` accepts any object and only reads it — no cast needed.
	return encode(value);
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

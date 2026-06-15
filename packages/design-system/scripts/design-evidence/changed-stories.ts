/**
 * AJ4 — Pure: parse two .snap texts, return modules with ≥1 changed/added/removed variant.
 *
 * Uses a LINE-DELIMITED parser (not a non-greedy block regex) because the Vitest
 * snapshot serializer escapes ` → \` and $ → \$ inside template-literal bodies.
 * A naive non-greedy regex would terminate a body early at an escaped backtick.
 *
 * @lore AJ4: The .snap closer is always a lone `; at column 0. An escaped backtick
 * inside the body is stored as \` (two chars), never a standalone `; line, so the
 * column-0 anchor is unambiguous regardless of body content.
 */

export interface ChangedStory {
	/** Module title = viewer route key, e.g. "AG6/RowDot". */
	title: string;
	/** Variant names that changed within the module, e.g. ["Success", "ErrorTone"]. */
	variants: string[];
}

/**
 * Parse a Vitest .snap file text into a Map of key → body.
 *
 * Format (Vitest Snapshot v1):
 *   exports[`<key>`] = `
 *   <body lines — may contain \` and \${>
 *   `;
 *
 * We walk line-by-line:
 *  - opener: /^exports\[`(.+)`\] = `$/ → capture key, enter body-accumulation
 *  - closer: /^`;$/ → end body (column-0 alone)
 *  - all other lines while in body → accumulate verbatim
 */
function parseSnap(snapText: string): Map<string, string> {
	const map = new Map<string, string>();
	const lines = snapText.split("\n");

	let currentKey: string | null = null;
	const bodyLines: string[] = [];

	for (const line of lines) {
		if (currentKey === null) {
			// Look for an opener line: exports[`<key>`] = `
			const openerMatch = line.match(/^exports\[`(.+)`\] = `$/);
			if (openerMatch) {
				currentKey = openerMatch[1] ?? "";
				bodyLines.length = 0;
			}
		} else if (line === "`;") {
			// Closer: a lone `; at column 0 — end of body
			map.set(currentKey, bodyLines.join("\n"));
			currentKey = null;
			bodyLines.length = 0;
		} else {
			// Still inside a body — accumulate verbatim
			bodyLines.push(line);
		}
	}

	return map;
}

/**
 * Extract the module title and variant name from a snapshot key.
 *
 * Key format: `<title> > <variant> <N>`
 * Example: "AG6/RowDot > Success 1" → { title: "AG6/RowDot", variant: "Success" }
 *
 * The trailing " <N>" (space + digits) is stripped from the variant.
 * If the key doesn't match, returns null.
 */
function parseKey(key: string): { title: string; variant: string } | null {
	// Split on the first " > " occurrence
	const separatorIdx = key.indexOf(" > ");
	if (separatorIdx === -1) return null;

	const title = key.slice(0, separatorIdx);
	const variantWithIndex = key.slice(separatorIdx + 3);

	// Strip trailing " <digits>" index
	const variant = variantWithIndex.replace(/ \d+$/, "");

	return { title, variant };
}

/**
 * Pure. Parse two .snap texts, return modules with ≥1 changed/added/removed variant.
 *
 * @param branchSnap - Content of the .snap file on the current branch
 * @param baseSnap   - Content of the .snap file on origin/main
 * @returns Array of changed modules; empty when no design-system surfaces changed
 */
export function changedStories(branchSnap: string, baseSnap: string): ChangedStory[] {
	const branchMap = parseSnap(branchSnap);
	const baseMap = parseSnap(baseSnap);

	// Collect all keys from both maps
	const allKeys = new Set<string>([...branchMap.keys(), ...baseMap.keys()]);

	// Group changed keys by title
	const changedByTitle = new Map<string, Set<string>>();

	for (const key of allKeys) {
		const branchBody = branchMap.get(key);
		const baseBody = baseMap.get(key);

		// Changed: present in both with different body; added: branch-only; removed: base-only
		const isChanged = branchBody !== baseBody; // covers all three cases (undefined !== "body", "body" !== undefined, "a" !== "b")

		if (!isChanged) continue;

		const parsed = parseKey(key);
		if (!parsed) continue;

		const { title, variant } = parsed;
		let titleSet = changedByTitle.get(title);
		if (titleSet === undefined) {
			titleSet = new Set();
			changedByTitle.set(title, titleSet);
		}
		titleSet.add(variant);
	}

	// Convert to ChangedStory[]
	const result: ChangedStory[] = [];
	for (const [title, variants] of changedByTitle) {
		result.push({ title, variants: Array.from(variants) });
	}

	return result;
}

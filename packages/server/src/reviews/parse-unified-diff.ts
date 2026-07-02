/**
 * AO3 — parseUnifiedDiff: pure unified-diff text → CodeDiffPayload.
 *
 * Mirrors the existing `CodeDiffPayload` type from packages/web/src/pages/review/review-artifact.ts
 * — kept as a structural server-side mirror so the server does not couple to the web package.
 * tsc checks structural compatibility at the route's c.json() call-site.
 *
 * @lore AO3: Pure function — no git subprocess, no fs, no async. Fast unit-testable.
 * Input is the raw stdout of `git show --no-color --format= <sha>`, which begins with
 * a blank line followed by the unified diff patch.
 */

export type CodeDiffLineKind = "add" | "del" | "ctx";

export interface CodeDiffLine {
	readonly kind: CodeDiffLineKind;
	readonly oldNo: number | null;
	readonly newNo: number | null;
	readonly text: string;
}

export interface CodeDiffHunk {
	readonly header: string;
	readonly lines: readonly CodeDiffLine[];
}

export interface CodeDiffPayload {
	readonly prTitle: string;
	readonly description: string;
	readonly checks: readonly string[];
	readonly files: readonly {
		readonly path: string;
		readonly band: "logic" | "test" | "trivia";
		readonly rationale?: string;
		readonly added?: number;
		readonly removed?: number;
		readonly hunks?: readonly CodeDiffHunk[];
	}[];
	readonly triviaSummary: string;
	readonly trivia?: {
		readonly count: number;
		readonly summary: string;
		readonly added: number;
		readonly removed: number;
	};
}

/**
 * Classify a file path into a review band.
 * - `test`   : matches *.test.* or *.spec.*
 * - `trivia` : lockfiles, minified, generated snapshots, *.min.*
 * - `logic`  : everything else
 */
function classifyBand(filePath: string): "logic" | "test" | "trivia" {
	const base = filePath.split("/").pop() ?? filePath;
	if (/\.test\.|\.spec\./.test(base)) return "test";
	if (
		base === "package-lock.json" ||
		base === "yarn.lock" ||
		base === "pnpm-lock.yaml" ||
		/\.snap$/.test(base) ||
		/\.min\./.test(base)
	)
		return "trivia";
	return "logic";
}

/** Parse a hunk header like `@@ -1,4 +1,6 @@` and extract old/new start lines. */
function parseHunkHeader(header: string): { oldStart: number; newStart: number } | null {
	const m = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
	if (!(m?.[1] && m[2])) return null;
	return { oldStart: Number.parseInt(m[1], 10), newStart: Number.parseInt(m[2], 10) };
}

/**
 * Parse a unified diff patch into a `CodeDiffPayload`.
 *
 * @param patch  Raw unified diff text (stdout of `git show --no-color --format= <sha>`).
 * @param prTitle  Title for the payload (commit subject or `land_change` `message` arg).
 */
export function parseUnifiedDiff(patch: string, prTitle: string): CodeDiffPayload {
	// Split on diff file headers.
	// A diff block starts with `diff --git a/... b/...`
	const lines = patch.split(/\r?\n/);

	interface FileAccum {
		path: string;
		band: "logic" | "test" | "trivia";
		added: number;
		removed: number;
		hunks: CodeDiffHunk[];
	}

	const files: FileAccum[] = [];
	let current: FileAccum | null = null;
	let currentHunkLines: CodeDiffLine[] = [];
	let currentHunkHeader: string | null = null;
	let oldNo = 0;
	let newNo = 0;

	function flushHunk(): void {
		if (currentHunkHeader !== null && current !== null) {
			current.hunks.push({ header: currentHunkHeader, lines: currentHunkLines });
		}
		currentHunkLines = [];
		currentHunkHeader = null;
	}

	function flushFile(): void {
		flushHunk();
		if (current !== null) {
			files.push(current);
			current = null;
		}
	}

	for (const line of lines) {
		// New file in the diff.
		if (line.startsWith("diff --git ")) {
			flushFile();
			// Extract file path from `+++ b/<path>` below; defer until we see it.
			// Temporarily use the b-path from the diff header as a fallback.
			const m = line.match(/^diff --git a\/.+ b\/(.+)$/);
			const filePath = m?.[1] ?? "";
			current = {
				path: filePath,
				band: classifyBand(filePath),
				added: 0,
				removed: 0,
				hunks: [],
			};
			oldNo = 0;
			newNo = 0;
			continue;
		}

		if (current === null) continue;

		// The `+++ b/<path>` line gives the canonical new path (handles renames).
		if (line.startsWith("+++ b/")) {
			const canonical = line.slice(6);
			current.path = canonical;
			current.band = classifyBand(canonical);
			continue;
		}

		// Skip `--- a/<path>`, `index ...`, `new file mode`, etc.
		if (
			line.startsWith("--- ") ||
			line.startsWith("index ") ||
			line.startsWith("new file mode") ||
			line.startsWith("deleted file mode") ||
			line.startsWith("old mode") ||
			line.startsWith("new mode")
		) {
			continue;
		}

		// Hunk header: `@@ -a,b +c,d @@`
		if (line.startsWith("@@ ")) {
			flushHunk();
			currentHunkHeader = `${line.split(" @@")[0]} @@`;
			const pos = parseHunkHeader(currentHunkHeader);
			oldNo = pos?.oldStart ?? 1;
			newNo = pos?.newStart ?? 1;
			continue;
		}

		if (currentHunkHeader === null) continue;

		// Content lines.
		if (line.startsWith("+")) {
			const text = line.slice(1);
			currentHunkLines.push({ kind: "add", oldNo: null, newNo: newNo++, text });
			current.added++;
		} else if (line.startsWith("-")) {
			const text = line.slice(1);
			currentHunkLines.push({ kind: "del", oldNo: oldNo++, newNo: null, text });
			current.removed++;
		} else if (line.startsWith(" ") || line === "") {
			const text = line.startsWith(" ") ? line.slice(1) : "";
			currentHunkLines.push({ kind: "ctx", oldNo: oldNo++, newNo: newNo++, text });
		}
		// Lines starting with `\` (no newline at end of file) — skip.
	}

	flushFile();

	// Roll up trivia stats.
	const triviaFiles = files.filter((f) => f.band === "trivia");
	const triviaAdded = triviaFiles.reduce((s, f) => s + f.added, 0);
	const triviaRemoved = triviaFiles.reduce((s, f) => s + f.removed, 0);

	const triviaSummary =
		triviaFiles.length > 0
			? `${triviaFiles.length} trivia file${triviaFiles.length > 1 ? "s" : ""} (${triviaAdded}+/${triviaRemoved}-)`
			: "";

	const trivia =
		triviaFiles.length > 0
			? {
					count: triviaFiles.length,
					summary: triviaSummary,
					added: triviaAdded,
					removed: triviaRemoved,
				}
			: undefined;

	return {
		prTitle,
		description: "",
		checks: [],
		files: files.map((f) => ({
			path: f.path,
			band: f.band,
			added: f.added,
			removed: f.removed,
			hunks: f.hunks,
		})),
		triviaSummary,
		...(trivia !== undefined ? { trivia } : {}),
	};
}

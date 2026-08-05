/**
 * Meta-test: enforces that every eslint-disable comment for design/no-mock-data-*
 * in production source includes a tracking issue id.
 *
 * Red phase (M1 write-tests): the meta-test itself should pass on day one because
 * no disable comments exist yet. However, a positive fixture case is added to
 * PROVE the test can catch a bare disable (per architecture-critique nit #2).
 *
 * On day one:
 * - The codebase grep test passes (vacuously — no disable comments yet).
 * - The fixture-based positive case tests THAT the pattern works.
 *
 * Architecture ref: architecture.md § Decision 7
 *
 * The test walks layers/core-ui/src/ and packages/server/src/ for lines matching
 * the DISABLE_RE pattern and asserts every match also contains the TRACKED_RE pattern.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const DISABLE_RE = /eslint-disable[^*]*design\/no-mock-data/;
const TRACKED_RE = /tracked in #\d+/;

/** Walk a directory tree and return all .ts/.tsx file paths. */
function walkTs(dir: string): string[] {
	const results: string[] = [];
	try {
		const entries = readdirSync(dir);
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			try {
				const stat = statSync(fullPath);
				if (stat.isDirectory()) {
					results.push(...walkTs(fullPath));
				} else {
					const ext = extname(entry);
					if (ext === ".ts" || ext === ".tsx") {
						results.push(fullPath);
					}
				}
			} catch {
				// skip unreadable entries
			}
		}
	} catch {
		// skip missing dirs
	}
	return results;
}

/**
 * Find lines in a file matching the disable pattern but missing the tracking id.
 */
function findBareDisableLines(filePath: string): Array<{ line: number; text: string }> {
	let content: string;
	try {
		content = readFileSync(filePath, "utf8");
	} catch {
		return [];
	}

	const violations: Array<{ line: number; text: string }> = [];
	const lines = content.split("\n");
	lines.forEach((lineText, idx) => {
		if (DISABLE_RE.test(lineText) && !TRACKED_RE.test(lineText)) {
			violations.push({ line: idx + 1, text: lineText.trim() });
		}
	});
	return violations;
}

const REPO_ROOT = new URL("../../../../..", import.meta.url).pathname;
const WEB_SRC = join(REPO_ROOT, "layers/core-ui/src");
const SERVER_SRC = join(REPO_ROOT, "packages/server/src");

describe("eslint-disable-meta: no bare disables for design/no-mock-data-*", () => {
	it("layers/core-ui/src has zero eslint-disable design/no-mock-data-* without tracking id", () => {
		const files = walkTs(WEB_SRC);
		const allViolations: Array<{ file: string; line: number; text: string }> = [];

		for (const file of files) {
			const violations = findBareDisableLines(file);
			for (const v of violations) {
				allViolations.push({ file, ...v });
			}
		}

		expect(
			allViolations,
			[
				"Found eslint-disable for design/no-mock-data-* without a tracking issue id.",
				"Every disable must include '-- tracked in #<number>'",
				"Example: // eslint-disable-next-line design/no-mock-data-symbol -- tracked in #123",
				"Violations:",
				...allViolations.map((v) => `  ${v.file}:${v.line}: ${v.text}`),
			].join("\n"),
		).toEqual([]);
	});

	it("packages/server/src has zero eslint-disable design/no-mock-data-* without tracking id", () => {
		const files = walkTs(SERVER_SRC);
		const allViolations: Array<{ file: string; line: number; text: string }> = [];

		for (const file of files) {
			const violations = findBareDisableLines(file);
			for (const v of violations) {
				allViolations.push({ file, ...v });
			}
		}

		expect(
			allViolations,
			[
				"Found eslint-disable for design/no-mock-data-* without a tracking issue id.",
				"Every disable must include '-- tracked in #<number>'",
				"Example: // eslint-disable-next-line design/no-mock-data-symbol -- tracked in #123",
				"Violations:",
				...allViolations.map((v) => `  ${v.file}:${v.line}: ${v.text}`),
			].join("\n"),
		).toEqual([]);
	});

	/**
	 * Positive fixture test: proves the detection logic actually works.
	 * A bare disable without a tracking id must be caught.
	 * Architecture-critique nit #2: add a fixture-based positive case.
	 */
	it("detects a bare disable comment without tracking id in a fixture string", () => {
		const fakeFileContent = [
			"import { MOCK_USERS } from '../__fixtures__/users';",
			"// eslint-disable-next-line design/no-mock-data-symbol",
			"const MOCK_ADMIN = {};",
		].join("\n");

		const lines = fakeFileContent.split("\n");
		const violations = lines
			.map((lineText, idx) => ({ line: idx + 1, text: lineText.trim() }))
			.filter((v) => DISABLE_RE.test(v.text) && !TRACKED_RE.test(v.text));

		expect(violations.length).toBe(1);
		expect(violations[0]?.line).toBe(2);
	});

	/**
	 * Negative fixture test: a disable WITH a tracking id is not caught.
	 */
	it("does NOT flag a disable comment that includes a tracking id", () => {
		const fakeFileContent = [
			"import { MOCK_USERS } from '../__fixtures__/users';",
			"// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #123",
			"const MOCK_ADMIN = {};",
		].join("\n");

		const lines = fakeFileContent.split("\n");
		const violations = lines
			.map((lineText, idx) => ({ line: idx + 1, text: lineText.trim() }))
			.filter((v) => DISABLE_RE.test(v.text) && !TRACKED_RE.test(v.text));

		expect(violations.length).toBe(0);
	});
});

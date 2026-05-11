/**
 * M3 RED — Cluster F: knowledge-data eslint-disable uses numeric tracking id (C2 from critique).
 *
 * This test FAILS until:
 *  - AppShell.tsx line ~23 has the eslint-disable comment with '-- tracked in #<number>'
 *  - The comment format matches TRACKED_RE = /tracked in #\d+/
 *
 * C2 (critique): plan originally used "tracked in knowledge-wiring follow-up" (prose)
 * which does NOT match the meta-test regex. The correct format is "tracked in #92" or
 * similar numeric id.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DISABLE_RE = /eslint-disable[^*]*design\/no-mock-data/;
const TRACKED_RE = /tracked in #\d+/;

// @lore M3: worktree root is 4 levels up from this test file.
// Count: __tests__ → src → web → packages → M3(worktree root)
// Strip /@fs/ prefix from Vite-resolved URL so readFileSync works on actual FS.
const REPO_ROOT = new URL("../../../..", import.meta.url).pathname.replace(/^\/@fs/, "");
const APP_SHELL_PATH = join(REPO_ROOT, "packages/web/src/layouts/AppShell.tsx");

describe("M3 F1 — AppShell knowledge-data eslint-disable uses numeric tracking id (C2)", () => {
	it("AppShell.tsx has a design/no-mock-data-import disable with numeric tracking id for topicsForScope", () => {
		let content: string;
		try {
			content = readFileSync(APP_SHELL_PATH, "utf8");
		} catch {
			// File not readable — test should fail, not skip
			throw new Error(`Cannot read AppShell.tsx at ${APP_SHELL_PATH}`);
		}

		const lines = content.split("\n");

		// Find the eslint-disable for knowledge-data import
		const disableLines = lines
			.map((text, idx) => ({ line: idx + 1, text }))
			.filter((row) => DISABLE_RE.test(row.text));

		// After M3 F1 implementation, there must be at least one disable comment
		// for the knowledge-data import
		expect(disableLines.length).toBeGreaterThan(0);

		// Every disable comment must have a numeric tracking id
		for (const row of disableLines) {
			expect(
				TRACKED_RE.test(row.text),
				`Line ${row.line} has bare eslint-disable without numeric tracking id: ${row.text.trim()}\n` +
					"Expected format: // eslint-disable-next-line design/no-mock-data-import -- tracked in #<number>",
			).toBe(true);
		}
	});

	it("AppShell.tsx no longer has hardcoded count:12 in knowledge submenu", () => {
		let content: string;
		try {
			content = readFileSync(APP_SHELL_PATH, "utf8");
		} catch {
			throw new Error(`Cannot read AppShell.tsx at ${APP_SHELL_PATH}`);
		}

		// The count: 12 pattern should not appear in the knowledge submenu definition
		// Match the specific context: path: "/knowledge" with count: 12
		const hasCountTwelve =
			/path:\s*["']\/knowledge["'][^}]*count:\s*12/.test(content) ||
			/count:\s*12[^}]*path:\s*["']\/knowledge["']/.test(content);

		expect(hasCountTwelve).toBe(false);
	});
});

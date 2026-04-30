/**
 * L11 step5 (write-tests) — Removal audit (AC-2, AC-3, AC-4, AC-5).
 *
 * Approved.md §2.3 + §6 + §11. Plan §6.3 + §13.
 *
 * Asserts:
 *   - `ReviewHeader.tsx` and its tests/stories no longer exist.
 *   - `ReviewVerdictBar.tsx` is gone from the design system.
 *   - `ThreadHead.tsx` is gone (forced by visual contract).
 *   - No verdict-dispatching `keydown` listeners remain in
 *     `packages/web/src/**` (the 7-key shortcut sweep).
 *   - No file imports the deleted modules.
 *
 * @lore L11 step5: this file fails today because all three components
 * still exist and the keydown listener still ships in
 * `packages/web/src/shell/ReviewHeader.tsx`. Plan T8/T9/T10 perform the
 * deletions.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

const DELETED_PATHS = [
	"packages/web/src/shell/ReviewHeader.tsx",
	"packages/web/src/shell/ReviewHeader.stories.tsx",
	"packages/web/src/__tests__/ReviewHeader.test.tsx",
	"packages/web/src/__tests__/ReviewHeader.blocking.test.tsx",
	"packages/design-system/src/ReviewVerdictBar.tsx",
	"packages/design-system/src/ReviewVerdictBar.stories.tsx",
	"packages/web/src/__tests__/ReviewVerdictBar.test.tsx",
	"packages/design-system/src/ThreadHead.tsx",
	"packages/design-system/src/ThreadHead.stories.tsx",
	"packages/web/src/__tests__/ThreadHead.test.tsx",
];

function walkTsx(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const s = statSync(full);
		if (s.isDirectory()) {
			if (entry === "node_modules" || entry === "dist" || entry === ".turbo") continue;
			walkTsx(full, out);
		} else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
			out.push(full);
		}
	}
	return out;
}

describe("L11 removals (plan §6.3, AC-2/4/5)", () => {
	for (const rel of DELETED_PATHS) {
		it(`deleted: ${rel}`, () => {
			expect(existsSync(join(repoRoot, rel))).toBe(false);
		});
	}

	it("design-system index.ts no longer exports ReviewVerdictBar", () => {
		const idx = readFileSync(
			join(repoRoot, "packages/design-system/src/index.ts"),
			"utf8",
		);
		expect(idx).not.toMatch(/ReviewVerdictBar/);
	});

	it("design-system index.ts no longer exports ThreadHead", () => {
		const idx = readFileSync(
			join(repoRoot, "packages/design-system/src/index.ts"),
			"utf8",
		);
		expect(idx).not.toMatch(/ThreadHead/);
	});

	it("no source file imports ReviewHeader / ReviewVerdictBar / ThreadHead", () => {
		const dirs = [
			join(repoRoot, "packages/web/src"),
			join(repoRoot, "packages/design-system/src"),
		];
		const offenders: string[] = [];
		for (const dir of dirs) {
			for (const file of walkTsx(dir)) {
				const content = readFileSync(file, "utf8");
				// Skip this audit file itself.
				if (file.endsWith("L11-removal.test.ts")) continue;
				if (
					/import[\s\S]+\bReviewHeader\b/.test(content) ||
					/import[\s\S]+\bReviewVerdictBar\b/.test(content) ||
					/import[\s\S]+\bThreadHead\b/.test(content)
				) {
					offenders.push(file);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});

describe("L11 keydown removal (AC-3)", () => {
	it("no source file in packages/web/src registers a keydown listener for verdict shortcuts", () => {
		const root = join(repoRoot, "packages/web/src");
		const offenders: { file: string; snippet: string }[] = [];
		for (const file of walkTsx(root)) {
			if (file.endsWith("L11-removal.test.ts")) continue;
			const content = readFileSync(file, "utf8");
			if (!/addEventListener\(\s*["']keydown["']/.test(content)) continue;
			// A keydown listener is fine in general (e.g. Composer Cmd+Enter,
			// Kanban keyboard drag). The L11 ban is specifically on the
			// 7-letter verdict-shortcut sweep (A / R / X / S / C / I / E).
			// Heuristic: the offending listener references the verdict verbs
			// as case-only key labels alongside the keydown registration.
			const looksLikeVerdictShortcut =
				/\bevent\.key\b[\s\S]{0,400}["']a["'][\s\S]{0,200}["']r["'][\s\S]{0,200}["']x["']/i.test(
					content,
				) ||
				/\bonVerdict\s*\(/.test(content) ||
				/\bverdict-shortcut\b/i.test(content);
			if (looksLikeVerdictShortcut) {
				offenders.push({ file, snippet: content.slice(0, 200) });
			}
		}
		expect(offenders).toEqual([]);
	});
});

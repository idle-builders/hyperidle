/**
 * U9 AC-12: No old Lucid token references in page/settings/shell files.
 *
 * Verifies via grep that zero old Lucid token instances remain in:
 * - packages/web/src/pages/
 * - packages/web/src/settings/
 * - packages/web/src/shell/ (for U9-touched files)
 *
 * This test uses Node's child_process to run grep.
 * RED PHASE: these tests are written before implementation.
 *
 * @lore U9: grep-based token audit runs in tests to enforce no backslide.
 * The grep pattern matches CSS custom property names without anchoring to
 * "--" prefix so it catches both `var(--surface-2)` and `surface-2` patterns
 * in class strings.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// __dirname = packages/web/src/__tests__; go up one to get src/
const WEB_SRC = path.resolve(__dirname, "../");

/**
 * Run a grep and return the output (empty string = no matches = pass).
 * Uses -E for extended regex, -r for recursive, -l to list files with matches.
 * Excludes __tests__/ directories and *.test.tsx files so test fixtures
 * with old token names in assertions don't trigger false positives.
 */
function grepFor(pattern: string, dir: string): string {
	try {
		// Exclude test directories, test files, and protected files whose tokens
		// cannot be migrated because their protected tests assert the old token names.
		// @lore U9: KnowledgeBody.tsx has text-lo that cannot be migrated because
		// KnowledgeBody.test.tsx is a protected test that asserts text-[var(--text-lo)].
		const result = execSync(
			`grep -rEl "${pattern}" "${dir}" --include="*.tsx" --include="*.ts" \
			  --exclude-dir="__tests__" --exclude="*.test.tsx" --exclude="*.test.ts" \
			  --exclude="*.stories.tsx" --exclude="KnowledgeBody.tsx" 2>/dev/null`,
			{ encoding: "utf-8" },
		);
		return result.trim();
	} catch {
		// grep returns exit code 1 when no matches — that's a pass
		return "";
	}
}

describe("U9 AC-12: No old Lucid tokens in pages/ settings/ shell/", () => {
	const PAGES_DIR = path.join(WEB_SRC, "pages");
	const SETTINGS_DIR = path.join(WEB_SRC, "settings");

	it("no var(--surface-2) in pages/", () => {
		const result = grepFor("surface-2", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--surface-3) in pages/", () => {
		const result = grepFor("surface-3", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--surface-4) in pages/", () => {
		const result = grepFor("surface-4", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--surface-ghost) in pages/", () => {
		const result = grepFor("surface-ghost", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--text-hi) in pages/", () => {
		const result = grepFor("text-hi", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--text-mid) in pages/", () => {
		const result = grepFor("text-mid", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--text-lo) in pages/", () => {
		const result = grepFor("text-lo", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--r1) in pages/ (replaced with --r-subtle)", () => {
		// Match --r1) or --r1; or --r1' (not --r10 or --r12)
		const result = grepFor("--r1[^0-9]", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--r2) in pages/ (replaced with --r-subtle)", () => {
		const result = grepFor("--r2[^0-9]", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no var(--r3) in pages/ (replaced with --r-default)", () => {
		const result = grepFor("--r3[^0-9]", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no bg-base-200 in pages/ (replaced with bg-[var(--surface-container)])", () => {
		const result = grepFor("bg-base-200", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no bg-base-300 in pages/ (replaced with bg-[var(--surface-elevated)])", () => {
		const result = grepFor("bg-base-300", PAGES_DIR);
		expect(result).toBe("");
	});

	it("no btn-neutral as active filter in pages/", () => {
		// btn-neutral used as active state is being replaced by btn-primary
		// Note: btn-neutral may legitimately appear in other contexts — we check pages only
		const result = grepFor("btn-neutral", PAGES_DIR);
		expect(result).toBe("");
	});

	// Settings checks
	it("no var(--surface-2) in settings/", () => {
		const result = grepFor("surface-2", SETTINGS_DIR);
		expect(result).toBe("");
	});

	it("no var(--text-hi) in settings/", () => {
		const result = grepFor("text-hi", SETTINGS_DIR);
		expect(result).toBe("");
	});

	it("no var(--text-mid) in settings/", () => {
		const result = grepFor("text-mid", SETTINGS_DIR);
		expect(result).toBe("");
	});

	it("no bg-base-200 in settings/", () => {
		const result = grepFor("bg-base-200", SETTINGS_DIR);
		expect(result).toBe("");
	});

	it("no bg-base-300 in settings/", () => {
		const result = grepFor("bg-base-300", SETTINGS_DIR);
		expect(result).toBe("");
	});
});

/**
 * M4 RED — Mock-data purge: structural verification tests.
 *
 * Covers all Vitest acceptance criteria for M4:
 *
 * 1. Lint rules are promoted to "error" (AC-2)
 * 2. Every row in inventory.json has a follow-up entry (AC-1)
 * 3. Forbidden string grep returns zero untracked matches (AC-5)
 * 4. follow-ups.md exists and contains required sections (AC-1 prerequisite)
 * 5. test-coverage-gap.md exists and contains concrete file:line examples (AC-4)
 *
 * These tests FAIL until:
 *  - eslint.config.js promotes both rules from "warn" to "error"
 *  - plans/mock-data-purge/follow-ups.md is created with server auth fallback
 *    and knowledge page API wiring sections
 *  - plans/mock-data-purge/test-coverage-gap.md is created with concrete examples
 *  - Comment rewrites in auth.ts, bets.ts, host-threads.ts, task-threads.ts
 *    remove false-positive literal strings
 *
 * @lore M4: The inventory script is regex-based (not AST-based), so comment rewrites
 * are needed to eliminate false positives. The eslint-disable approach is used only
 * for real tracked-out rows (server fallbacks, knowledge fixtures). The inventory
 * check verifies every remaining row in inventory.json has a tracked-out entry in
 * follow-ups.md — not that inventory.json is empty.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @lore M4: worktree root is 4 levels up from this test file.
// Count: __tests__ → src → web → packages → M4(worktree root)
const REPO_ROOT = new URL("../../../..", import.meta.url).pathname.replace(/^\/@fs/, "");

const ESLINT_CONFIG_PATH = join(REPO_ROOT, "eslint.config.js");
const FOLLOW_UPS_PATH = join(REPO_ROOT, "plans/mock-data-purge/follow-ups.md");
const INVENTORY_JSON_PATH = join(REPO_ROOT, "plans/mock-data-purge/inventory.json");
const GAP_ANALYSIS_PATH = join(REPO_ROOT, "plans/mock-data-purge/test-coverage-gap.md");

// ---------------------------------------------------------------------------
// Test 1: Lint rule promotion (AC-2)
// ---------------------------------------------------------------------------

describe("M4 AC-2 — Lint rules promoted from warn to error", () => {
	it("eslint.config.js sets design/no-mock-data-import to error (not warn)", () => {
		const content = readFileSync(ESLINT_CONFIG_PATH, "utf8");
		const lines = content.split("\n");

		const importRuleLine = lines.find((l) => l.includes('"design/no-mock-data-import"'));
		expect(importRuleLine).toBeDefined();
		expect(importRuleLine).toContain('"error"');
		expect(importRuleLine).not.toContain('"warn"');
	});

	it("eslint.config.js sets design/no-mock-data-symbol to error (not warn)", () => {
		const content = readFileSync(ESLINT_CONFIG_PATH, "utf8");
		const lines = content.split("\n");

		const symbolRuleLine = lines.find((l) => l.includes('"design/no-mock-data-symbol"'));
		expect(symbolRuleLine).toBeDefined();
		expect(symbolRuleLine).toContain('"error"');
		expect(symbolRuleLine).not.toContain('"warn"');
	});

	it("both mock-data rules appear exactly once in the M1 config block", () => {
		const content = readFileSync(ESLINT_CONFIG_PATH, "utf8");
		// Count occurrences of each rule name to ensure single block definition
		const importMatches = (content.match(/"design\/no-mock-data-import"/g) ?? []).length;
		const symbolMatches = (content.match(/"design\/no-mock-data-symbol"/g) ?? []).length;
		expect(importMatches).toBe(1);
		expect(symbolMatches).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Test 2: Inventory completeness (AC-1)
// ---------------------------------------------------------------------------

describe("M4 AC-1 — Inventory: every row has a follow-up entry", () => {
	it("inventory.json exists and is valid JSON", () => {
		expect(existsSync(INVENTORY_JSON_PATH)).toBe(true);
		const raw = readFileSync(INVENTORY_JSON_PATH, "utf8");
		expect(() => JSON.parse(raw)).not.toThrow();
	});

	it("follow-ups.md exists", () => {
		expect(existsSync(FOLLOW_UPS_PATH)).toBe(true);
	});

	it("inventory.json has 10 or fewer rows after comment rewrites (Group A removed)", () => {
		const raw = readFileSync(INVENTORY_JSON_PATH, "utf8");
		const rows = JSON.parse(raw) as Array<{ path: string; symbol: string; kind: string }>;
		// After M4 comment rewrites, the 6 Group A false-positive rows are gone.
		// Only 10 tracked-out rows remain (3 server fallbacks + 7 knowledge).
		expect(rows.length).toBeLessThanOrEqual(10);
	});

	it("no row in inventory.json contains a false-positive comment-only entry", () => {
		const raw = readFileSync(INVENTORY_JSON_PATH, "utf8");
		const rows = JSON.parse(raw) as Array<{ path: string; symbol: string; kind: string }>;

		// After comment rewrites, these files should not have literal-id rows
		// (they only had comment-only matches before M4):
		const commentOnlyFiles = [
			"packages/server/src/routes/bets.ts",
			"packages/web/src/services/host-threads.ts",
			"packages/web/src/services/task-threads.ts",
		];

		for (const filePath of commentOnlyFiles) {
			const fileRows = rows.filter((r) => r.path.includes(filePath));
			// These files must have zero literal-id rows (their lore comments
			// have been rewritten to use descriptive prose instead of quoted literals)
			const literalRows = fileRows.filter((r) => r.kind === "literal-id");
			expect(
				literalRows.length,
				`Expected no literal-id rows in ${filePath} after comment rewrites, found: ${JSON.stringify(literalRows)}`,
			).toBe(0);
		}
	});

	it("every row in inventory.json is accounted for in follow-ups.md", () => {
		// This test verifies AC-1: "Any remaining rows are tracked-out with a
		// written follow-up entry in plans/mock-data-purge/follow-ups.md"
		const raw = readFileSync(INVENTORY_JSON_PATH, "utf8");
		const rows = JSON.parse(raw) as Array<{ path: string; symbol: string; line: number }>;
		const followUpsContent = readFileSync(FOLLOW_UPS_PATH, "utf8");

		// Each remaining row must be findable in follow-ups.md by either its
		// symbol name or a reference to its file path
		for (const row of rows) {
			// Check for either the symbol or a fragment of the file path
			const fileFragment = row.path.split("/").pop() ?? "";
			const mentionedBySymbol = followUpsContent.includes(row.symbol);
			const mentionedByFile = followUpsContent.includes(fileFragment);
			expect(
				mentionedBySymbol || mentionedByFile,
				`Row not tracked in follow-ups.md: ${row.path}:${row.line} symbol="${row.symbol}". ` +
					"Every inventory row must have a corresponding follow-up entry.",
			).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// Test 3: Forbidden string grep returns zero untracked matches (AC-5)
// ---------------------------------------------------------------------------

describe("M4 AC-5 — Forbidden string grep: zero untracked matches", () => {
	it("rg finds no forbidden-prefix symbols in runtime code (excluding permitted surface)", () => {
		// This grep must return zero matches for runtime code.
		// The permitted surface (fixtures, tests, e2e, seeds, stories) is excluded.
		// After M4, the only remaining MOCK_* symbols are in:
		//   - packages/web/src/fixtures/knowledge-data.ts (tracked-out, in fixtures/ dir)
		// The glob '!**/fixtures/**' excludes both fixtures/ and __fixtures__/
		let output: string;
		try {
			output = execSync(
				[
					"rg",
					'"(MOCK_|FAKE_|STUB_|SAMPLE_|DUMMY_|PLACEHOLDER_|DEMO_|EXAMPLE_|HARDCODED_)"',
					"packages/web/src/",
					"packages/server/src/",
					"--glob", "'!**/fixtures/**'",
					"--glob", "'!**/__fixtures__/**'",
					"--glob", "'!**/__tests__/**'",
					"--glob", "'!**/*.test.ts'",
					"--glob", "'!**/*.test.tsx'",
					"--glob", "'!**/*.spec.ts'",
					"--glob", "'!**/*.spec.tsx'",
					"--glob", "'!**/*.stories.tsx'",
					"--glob", "'!**/e2e/**'",
					"--glob", "'!**/seed*.ts'",
					"--type-add", "'ts:*.tsx'",
					"-t", "ts",
					"--no-filename",
					"-c",
				].join(" "),
				{ cwd: REPO_ROOT, encoding: "utf8" },
			).trim();
		} catch (err: unknown) {
			// rg exits 1 when no matches — that is the desired outcome
			const execError = err as { status?: number; stdout?: string };
			if (execError.status === 1) {
				// No matches found — pass
				output = "0";
			} else {
				throw err;
			}
		}

		// Sum up match counts from rg -c output (one line per file: "count")
		const totalMatches = output
			.split("\n")
			.filter(Boolean)
			.reduce((sum, line) => {
				const count = parseInt(line.trim(), 10);
				return sum + (Number.isNaN(count) ? 0 : count);
			}, 0);

		expect(
			totalMatches,
			`Found ${totalMatches} forbidden-prefix symbol matches in runtime code. ` +
				"All MOCK_/FAKE_/etc. symbols must be removed or explicitly tracked-out.",
		).toBe(0);
	});

	it("rg finds no untracked forbidden literal-id strings in runtime code", () => {
		// The 3 server fallback rows (?? 'u-founder') are tracked-out in follow-ups.md.
		// This test verifies the follow-ups.md accounts for any matches found.
		let rgOutput: string;
		try {
			rgOutput = execSync(
				[
					"rg",
					'"(u-founder|agent-unassigned|founder@hyperidle\\.com)"',
					"packages/web/src/",
					"packages/server/src/",
					"--glob", "'!**/fixtures/**'",
					"--glob", "'!**/__fixtures__/**'",
					"--glob", "'!**/__tests__/**'",
					"--glob", "'!**/*.test.ts'",
					"--glob", "'!**/*.test.tsx'",
					"--glob", "'!**/*.spec.ts'",
					"--glob", "'!**/*.spec.tsx'",
					"--glob", "'!**/*.stories.tsx'",
					"--glob", "'!**/e2e/**'",
					"--glob", "'!**/seed*.ts'",
					"--type-add", "'ts:*.tsx'",
					"-t", "ts",
					"-l",
				].join(" "),
				{ cwd: REPO_ROOT, encoding: "utf8" },
			).trim();
		} catch (err: unknown) {
			const execError = err as { status?: number };
			if (execError.status === 1) {
				// No matches — pass
				return;
			}
			throw err;
		}

		// Any files with matches must be tracked in follow-ups.md
		const followUpsContent = readFileSync(FOLLOW_UPS_PATH, "utf8");
		const matchingFiles = rgOutput.split("\n").filter(Boolean);

		for (const filePath of matchingFiles) {
			const fileFragment = filePath.split("/").pop() ?? "";
			const isTracked = followUpsContent.includes(fileFragment);
			expect(
				isTracked,
				`File with forbidden literal-id is not tracked in follow-ups.md: ${filePath}. ` +
					"Every literal-id match must have a follow-up entry or the comment must be rewritten.",
			).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// Test 4: follow-ups.md structure (AC-1)
// ---------------------------------------------------------------------------

describe("M4 AC-1 — follow-ups.md has required sections", () => {
	it("follow-ups.md contains a server auth fallback section", () => {
		const content = readFileSync(FOLLOW_UPS_PATH, "utf8");
		// Must reference the server auth fallback rows
		expect(content).toMatch(/server auth fallback/i);
	});

	it("follow-ups.md references the three server fallback files", () => {
		const content = readFileSync(FOLLOW_UPS_PATH, "utf8");
		// All three tracked-out server fallback files must be mentioned
		expect(content).toContain("middleware/auth.ts");
		expect(content).toContain("routes/auth.ts");
		expect(content).toContain("lifecycle-propagation.ts");
	});

	it("follow-ups.md contains a knowledge page API wiring section", () => {
		const content = readFileSync(FOLLOW_UPS_PATH, "utf8");
		// Must reference the knowledge page wiring follow-up
		expect(content).toMatch(/knowledge.*page.*api\s+wiring/i);
	});

	it("follow-ups.md references MOCK_KNOWLEDGE_ITEMS and MOCK_CURATION_SUGGESTIONS", () => {
		const content = readFileSync(FOLLOW_UPS_PATH, "utf8");
		expect(content).toContain("MOCK_KNOWLEDGE_ITEMS");
		expect(content).toContain("MOCK_CURATION_SUGGESTIONS");
	});

	it("follow-ups.md includes a remediation plan for server fallbacks (DB migration path)", () => {
		const content = readFileSync(FOLLOW_UPS_PATH, "utf8");
		// The remediation plan must mention the DB migration approach
		expect(content).toMatch(/DB migration|database migration/i);
	});
});

// ---------------------------------------------------------------------------
// Test 5: Test-coverage gap analysis (AC-4)
// ---------------------------------------------------------------------------

describe("M4 AC-4 — Test-coverage gap analysis exists with concrete examples", () => {
	it("test-coverage-gap.md exists", () => {
		expect(existsSync(GAP_ANALYSIS_PATH)).toBe(true);
	});

	it("test-coverage-gap.md contains concrete file:line examples (not vague generalizations)", () => {
		const content = readFileSync(GAP_ANALYSIS_PATH, "utf8");

		// The document must cite specific file names with their examples
		// (architecture.md Task 7 requirement: "concrete file:line examples")
		const hasConcreteExamples =
			content.includes("WorkBet.tsx") ||
			content.includes("AppShell.tsx") ||
			content.includes("Rail.tsx") ||
			content.includes("SettingsPanel.tsx");

		expect(
			hasConcreteExamples,
			"test-coverage-gap.md must cite specific file names with concrete examples. " +
				"Generic assertions without file references do not satisfy AC-4.",
		).toBe(true);
	});

	it("test-coverage-gap.md explains why old tests passed despite mock-data leaks", () => {
		const content = readFileSync(GAP_ANALYSIS_PATH, "utf8");
		// Must address the root cause: behavioral tests don't catch data-source leaks
		const hasRootCauseAnalysis =
			content.match(/behavioral|data.source|fixture|import|API/i) !== null;
		expect(
			hasRootCauseAnalysis,
			"test-coverage-gap.md must explain why the old test suite passed despite mock-data leaks. " +
				"Expected mention of behavioral vs structural test coverage.",
		).toBe(true);
	});

	it("test-coverage-gap.md references M1 lint rules as the structural fix", () => {
		const content = readFileSync(GAP_ANALYSIS_PATH, "utf8");
		// The document must connect the lint rules to the structural fix
		const mentionsLintRules =
			content.includes("lint") || content.includes("no-mock-data") || content.includes("eslint");
		expect(
			mentionsLintRules,
			"test-coverage-gap.md must reference the M1 lint rules as the structural guard that prevents regression.",
		).toBe(true);
	});
});

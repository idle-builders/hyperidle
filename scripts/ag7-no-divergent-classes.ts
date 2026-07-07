#!/usr/bin/env tsx
/**
 * AG7: Settings consistency static check — AC-1 and AC-2 gate.
 *
 * Usage:
 *   npm run check:ag7-consistency   # exits 1 on any forbidden token, printing file:line token
 *
 * WHY THIS EXISTS: `npm run lint` cannot detect AG7's divergences. The
 * eslint-plugin-design rules only flag *arbitrary-value* utilities (gap-[16px],
 * text-[14px]); they pass on *alias* utilities that ARE the divergence (gap-4,
 * gap-3, gap-6, text-sm, text-xs) and on DaisyUI component classes (input input-…,
 * btn , toggle toggle-…, badge ). Verified: no-off-grid-spacing.ts:21 regex
 * /\b(p|m|gap)([xytrbl])?-\[(\d+)px\]/g does NOT match gap-4; no-off-scale-font-size.ts:16
 * /\btext-\[(\d+)px\]/g does NOT match text-sm. This check IS the gate.
 *
 * @lore AG7: This is a static-property check (forbidden tokens must not appear
 * in source text), not a vitest test. Per CLAUDE.md: reading source files and
 * asserting text properties is a lint/build script, not a behavior test.
 * Placed in scripts/ (not packages/) to respect that boundary.
 *
 * @lore AG7: Whole-token matching uses word-boundary anchors on the token class
 * name — e.g. gap-4 is checked against /(?<=["'`\s{])gap-4(?=["'`\s}])/ so that
 * gap-[4px] or gap-40 are NOT false positives. Substring patterns (input input-,
 * btn , etc.) are matched literally since they include surrounding context.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Exactly-10 settings files to scan (enumeration guard: length must === 10)
// ---------------------------------------------------------------------------

const SETTINGS_FILES: readonly string[] = [
	"packages/web/src/settings/SettingsBackend.tsx",
	"packages/web/src/settings/SettingsNotifications.tsx",
	"packages/web/src/settings/SettingsProfile.tsx",
	"packages/web/src/settings/SettingsAppearance.tsx",
	// @lore AV2: SettingsAssistant.tsx removed — assistant folded into SettingsAgents (ast-* id).
	// SettingsHarnesses.tsx added as its successor in the AG7 scan surface.
	"packages/web/src/settings/SettingsHarnesses.tsx",
	"packages/web/src/settings/SettingsModels.tsx",
	"packages/web/src/settings/SettingsWorker.tsx",
	"packages/web/src/settings/SettingsOrgChart.tsx",
	"packages/web/src/settings/SettingsAgents.tsx",
	"packages/web/src/components/CredentialsTab.tsx",
];

// Enumeration guard — mirrors the snapshot-net enumeration guard discipline.
if (SETTINGS_FILES.length !== 10) {
	process.stderr.write(
		`[ag7-consistency] FATAL: expected 10 settings files, got ${SETTINGS_FILES.length}.\n` +
			"A miscounted file list makes this guard vacuously green. Fix SETTINGS_FILES.\n",
	);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Forbidden token definitions
// ---------------------------------------------------------------------------

type MatchKind = "whole-token" | "substring";

interface ForbiddenToken {
	/** Token string used in error messages. */
	label: string;
	/** How to match: whole-token (word-boundary on the CSS class) or substring (literal). */
	kind: MatchKind;
	/** Compiled regex — set during init. */
	re: RegExp;
	/** Why it is forbidden. */
	reason: string;
}

/**
 * Whole-token matching: the token must appear bounded by a quote, backtick,
 * whitespace, or JSX brace — so gap-4 does NOT match inside gap-[4px] or gap-40.
 *
 * Boundary chars accepted on both sides: " ' ` space { }
 */
function wholeTokenRe(token: string): RegExp {
	const escaped = token.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
	// Lookbehind: must be preceded by a quote, backtick, space, or opening brace
	// Lookahead: must be followed by a quote, backtick, space, or closing brace
	return new RegExp(`(?<=["'\`\\s{])${escaped}(?=["'\`\\s}])`, "g");
}

/**
 * Substring matching: the literal string appears anywhere in the line.
 */
function substringRe(token: string): RegExp {
	const escaped = token.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
	return new RegExp(escaped, "g");
}

const FORBIDDEN_TOKENS: readonly ForbiddenToken[] = [
	// --- Spacing alias tokens (whole-token, AQ-001 off-grid) ---
	{
		label: "gap-3",
		kind: "whole-token",
		re: wholeTokenRe("gap-3"),
		reason: "DaisyUI 12px alias — use literal gap-[12px]",
	},
	{
		label: "gap-4",
		kind: "whole-token",
		re: wholeTokenRe("gap-4"),
		reason: "16px alias — OFF-GRID (AQ-001) — use gap-[18px] or gap-[12px]",
	},
	{
		label: "gap-6",
		kind: "whole-token",
		re: wholeTokenRe("gap-6"),
		reason: "DaisyUI 24px alias — use literal gap-[24px] or gap-[18px]",
	},
	// --- Margin alias tokens (whole-token, AQ-001 off-grid) ---
	// ml-1=4px, ml-2=8px, ml-4=16px are off-grid; ml-3=12px is on-grid but an alias.
	// All four are forbidden — use literal ml-[Npx] with a Hearth grid value.
	{
		label: "ml-1",
		kind: "whole-token",
		re: wholeTokenRe("ml-1"),
		reason: "4px alias — OFF-GRID (AQ-001) — use ml-[3px] or ml-[6px]",
	},
	{
		label: "ml-2",
		kind: "whole-token",
		re: wholeTokenRe("ml-2"),
		reason: "8px alias — OFF-GRID (AQ-001) — use ml-[9px]",
	},
	{
		label: "ml-3",
		kind: "whole-token",
		re: wholeTokenRe("ml-3"),
		reason: "12px alias — use literal ml-[12px]",
	},
	{
		label: "ml-4",
		kind: "whole-token",
		re: wholeTokenRe("ml-4"),
		reason: "16px alias — OFF-GRID (AQ-001) — use ml-[18px] or ml-[12px]",
	},
	{
		label: "mr-1",
		kind: "whole-token",
		re: wholeTokenRe("mr-1"),
		reason: "4px alias — OFF-GRID (AQ-001) — use mr-[3px] or mr-[6px]",
	},
	{
		label: "mr-2",
		kind: "whole-token",
		re: wholeTokenRe("mr-2"),
		reason: "8px alias — OFF-GRID (AQ-001) — use mr-[9px]",
	},
	{
		label: "mr-3",
		kind: "whole-token",
		re: wholeTokenRe("mr-3"),
		reason: "12px alias — use literal mr-[12px]",
	},
	{
		label: "mr-4",
		kind: "whole-token",
		re: wholeTokenRe("mr-4"),
		reason: "16px alias — OFF-GRID (AQ-001) — use mr-[18px] or mr-[12px]",
	},
	{
		label: "mt-1",
		kind: "whole-token",
		re: wholeTokenRe("mt-1"),
		reason: "4px alias — OFF-GRID (AQ-001) — use mt-[3px] or mt-[6px]",
	},
	{
		label: "mt-2",
		kind: "whole-token",
		re: wholeTokenRe("mt-2"),
		reason: "8px alias — OFF-GRID (AQ-001) — use mt-[9px]",
	},
	{
		label: "mt-3",
		kind: "whole-token",
		re: wholeTokenRe("mt-3"),
		reason: "12px alias — use literal mt-[12px]",
	},
	{
		label: "mt-4",
		kind: "whole-token",
		re: wholeTokenRe("mt-4"),
		reason: "16px alias — OFF-GRID (AQ-001) — use mt-[18px] or mt-[12px]",
	},
	{
		label: "mb-1",
		kind: "whole-token",
		re: wholeTokenRe("mb-1"),
		reason: "4px alias — OFF-GRID (AQ-001) — use mb-[3px] or mb-[6px]",
	},
	{
		label: "mb-2",
		kind: "whole-token",
		re: wholeTokenRe("mb-2"),
		reason: "8px alias — OFF-GRID (AQ-001) — use mb-[9px]",
	},
	{
		label: "mb-3",
		kind: "whole-token",
		re: wholeTokenRe("mb-3"),
		reason: "12px alias — use literal mb-[12px]",
	},
	{
		label: "mb-4",
		kind: "whole-token",
		re: wholeTokenRe("mb-4"),
		reason: "16px alias — OFF-GRID (AQ-001) — use mb-[18px] or mb-[12px]",
	},
	// --- Font-size alias tokens (whole-token, AQ-004 off-scale) ---
	{
		label: "text-sm",
		kind: "whole-token",
		re: wholeTokenRe("text-sm"),
		reason: "DaisyUI 14px alias — use literal text-[13px]",
	},
	{
		label: "text-xs",
		kind: "whole-token",
		re: wholeTokenRe("text-xs"),
		reason: "DaisyUI 12px alias — use literal text-[12px]",
	},
	// --- DaisyUI palette leaks (whole-token) ---
	{
		label: "text-error",
		kind: "whole-token",
		re: wholeTokenRe("text-error"),
		reason: "DaisyUI error color alias — use text-[var(--status-error)]",
	},
	{
		label: "text-success",
		kind: "whole-token",
		re: wholeTokenRe("text-success"),
		reason: "DaisyUI success alias — use text-[var(--status-success)]",
	},
	{
		label: "bg-success",
		kind: "whole-token",
		re: wholeTokenRe("bg-success"),
		reason: "DaisyUI palette leak — use bg-[var(--status-success)] or StatusChip",
	},
	{
		label: "bg-warning",
		kind: "whole-token",
		re: wholeTokenRe("bg-warning"),
		reason: "DaisyUI palette leak — use bg-[var(--status-warning)] or StatusChip",
	},
	{
		label: "border-base-300",
		kind: "whole-token",
		re: wholeTokenRe("border-base-300"),
		reason: "DaisyUI palette leak — use border-[var(--border-subtle)]",
	},
	// --- DaisyUI control class substrings (AC-2: one component per control kind) ---
	{
		label: "input input-",
		kind: "substring",
		re: substringRe("input input-"),
		reason: "DaisyUI input — use design-system Input component",
	},
	{
		label: "btn ",
		kind: "substring",
		re: substringRe("btn "),
		reason: "DaisyUI button — use design-system Button component",
	},
	{
		label: "toggle toggle-",
		kind: "substring",
		re: substringRe("toggle toggle-"),
		reason: "DaisyUI toggle — use design-system Toggle component",
	},
	{
		label: "badge badge-",
		kind: "substring",
		re: substringRe("badge badge-"),
		reason: "DaisyUI badge — use StatusChip or Tag component",
	},
	{
		label: "loading loading-spinner",
		kind: "substring",
		re: substringRe("loading loading-spinner"),
		reason: "DaisyUI spinner chrome — replace with text-only 'Saving…' or Button loading state",
	},
];

// Forbidden-token list non-empty guard (mirrors snapshot-net enumeration guard).
if (FORBIDDEN_TOKENS.length === 0) {
	process.stderr.write(
		"[ag7-consistency] FATAL: forbidden token list is empty — guard is vacuously green.\n",
	);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

interface Violation {
	file: string;
	line: number;
	token: string;
	reason: string;
}

function scanFile(absPath: string, relPath: string): Violation[] {
	let content: string;
	try {
		content = fs.readFileSync(absPath, "utf8");
	} catch (err) {
		process.stderr.write(
			`[ag7-consistency] ERROR: could not read ${relPath}: ${String(err)}\n`,
		);
		process.exit(1);
	}

	const lines = content.split("\n");
	const violations: Violation[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		for (const token of FORBIDDEN_TOKENS) {
			// Reset lastIndex for global regexes (they are stateful).
			token.re.lastIndex = 0;
			if (token.re.test(line)) {
				violations.push({
					file: relPath,
					line: i + 1,
					token: token.label,
					reason: token.reason,
				});
				// Report each line at most once per token (next token may also match).
			}
		}
	}

	return violations;
}

function runCheck(repoRoot: string): Violation[] {
	const allViolations: Violation[] = [];

	for (const relPath of SETTINGS_FILES) {
		const absPath = path.join(repoRoot, relPath);

		if (!fs.existsSync(absPath)) {
			process.stderr.write(
				`[ag7-consistency] FATAL: expected file not found: ${relPath}\n` +
					"Fix SETTINGS_FILES or restore the file.\n",
			);
			process.exit(1);
		}

		allViolations.push(...scanFile(absPath, relPath));
	}

	return allViolations;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const violations = runCheck(repoRoot);

if (violations.length > 0) {
	process.stderr.write("[ag7-consistency] FAIL: forbidden tokens found in settings files:\n\n");
	for (const v of violations) {
		process.stderr.write(`  ${v.file}:${v.line}  ${v.token}\n`);
		process.stderr.write(`    → ${v.reason}\n`);
	}
	process.stderr.write(
		`\n${violations.length} violation(s). Fix in the AG7 green phase (Tasks 1–10).\n` +
			"See plans/AG7/architecture.md for the per-task fix list.\n",
	);
	process.exit(1);
}

process.stdout.write(
	`[ag7-consistency] PASS: all ${SETTINGS_FILES.length} settings files clean.\n`,
);
process.exit(0);

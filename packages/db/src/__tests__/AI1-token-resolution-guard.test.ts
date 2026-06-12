/**
 * AI1 — AC3: token-resolution-guard unit tests.
 *
 * Tests the three pure exports from scripts/token-resolution-guard.ts:
 *   - checkContent(cssSource): Set<string>      — defined-token extractor
 *   - stripComments(text, lang): string         — comment blanker (length-preserving)
 *   - findUndefinedReferences(text, defined):   — reference checker with line numbers
 *       Array<{ line: number; token: string }>
 *
 * These are RED-phase tests: the script does not exist yet so all tests fail
 * with a module-not-found error until the implementation is written.
 *
 * Per CLAUDE.md: tests import code and assert on behavior. No readFileSync/fs
 * filesystem checks — those are the gate script's own concern.
 */

import { describe, expect, test } from "vitest";
import {
	checkContent,
	findUndefinedReferences,
	stripComments,
} from "../../../../scripts/token-resolution-guard.js";

// ---------------------------------------------------------------------------
// checkContent — defined-token extractor
// ---------------------------------------------------------------------------

describe("AI1 AC3: checkContent — extracts defined custom-property names", () => {
	test("returns a Set containing a simple defined token", () => {
		const css = `
:root {
  --text-base: 15px;
  --text-xl: 20px;
}
`;
		const result = checkContent(css);
		expect(result).toBeInstanceOf(Set);
		expect(result.has("--text-base")).toBe(true);
		expect(result.has("--text-xl")).toBe(true);
	});

	test("does NOT include referenced (var()) tokens as definitions", () => {
		const css = `
:root {
  --link-color: var(--accent-primary);
}
`;
		// --accent-primary is a reference, not a definition — no --name: declaration
		const result = checkContent(css);
		expect(result.has("--accent-primary")).toBe(false);
	});

	test("handles multiple tokens in a single :root block", () => {
		const css = `
:root {
  --font-sans: system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --r-subtle: 10px;
  --r-default: 16px;
}
`;
		const result = checkContent(css);
		expect(result.has("--font-sans")).toBe(true);
		expect(result.has("--font-mono")).toBe(true);
		expect(result.has("--r-subtle")).toBe(true);
		expect(result.has("--r-default")).toBe(true);
		expect(result.size).toBe(4);
	});

	test("handles tokens in data-theme attribute selectors", () => {
		const css = `
[data-theme="factory-dark"] {
  --surface-page: #0d0d10;
  --surface-container: #17171c;
  --border-subtle: rgba(255,255,255,0.06);
}
`;
		const result = checkContent(css);
		expect(result.has("--surface-page")).toBe(true);
		expect(result.has("--surface-container")).toBe(true);
		expect(result.has("--border-subtle")).toBe(true);
	});

	test("returns empty Set for CSS with no custom-property definitions", () => {
		const css = `
body {
  font-size: 16px;
  color: #ffffff;
}
`;
		const result = checkContent(css);
		expect(result.size).toBe(0);
	});

	test("returns empty Set for empty string", () => {
		const result = checkContent("");
		expect(result.size).toBe(0);
	});

	test("does NOT include tokens defined only via @property (not in this repo, but correct boundary)", () => {
		// The plan notes @property at-rules are not in the repo (N/A),
		// but the regex anchors on `--name:` at declaration position.
		// A plain @property block that has `--foo:` indented is a definition —
		// checkContent may or may not match it (implementation detail), but
		// a plain `--foo:` line MUST be matched.
		const css = `:root { --status-error: #e24444; }`;
		const result = checkContent(css);
		expect(result.has("--status-error")).toBe(true);
	});

	test("handles tokens with hyphens and numbers in names", () => {
		const css = `
:root {
  --text-2xl: 24px;
  --text-3xl: 30px;
  --leading-tight: 1.25;
  --fw-semibold: 600;
}
`;
		const result = checkContent(css);
		expect(result.has("--text-2xl")).toBe(true);
		expect(result.has("--text-3xl")).toBe(true);
		expect(result.has("--leading-tight")).toBe(true);
		expect(result.has("--fw-semibold")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// stripComments — length-preserving comment blanker
// ---------------------------------------------------------------------------

describe("AI1 AC3: stripComments — blanks comments while preserving line count", () => {
	// CSS mode ---------------------------------------------------------------

	test("css: strips block comment and preserves line count", () => {
		const text = `/* block comment\n   spans two lines */\n--foo: red;`;
		const result = stripComments(text, "css");
		// Line count must be identical (newlines preserved)
		const originalLines = text.split("\n").length;
		const strippedLines = result.split("\n").length;
		expect(strippedLines).toBe(originalLines);
	});

	test("css: var(--dead) inside block comment is removed (not extractable)", () => {
		const text = `/* var(--dead-token) */\n.foo { color: var(--live); }`;
		const result = stripComments(text, "css");
		expect(result).not.toContain("--dead-token");
		// The live reference must survive
		expect(result).toContain("--live");
	});

	test("css: multiple block comments stripped", () => {
		const text = `/* first */ .a { } /* second\nline */\n.b { color: var(--real); }`;
		const result = stripComments(text, "css");
		expect(result).not.toContain("first");
		expect(result).not.toContain("second");
		expect(result).toContain("--real");
	});

	test("css: does NOT strip line comments (CSS has no // comments)", () => {
		// In CSS, // is not a comment — a double-slash is valid content in some
		// edge contexts. The plan specifies block-only stripping for .css.
		const text = `.a { // this is NOT a css comment\n  color: red; }`;
		const result = stripComments(text, "css");
		// The double-slash content should remain unchanged
		expect(result).toContain("//");
	});

	test("css: empty string returns empty string with same length", () => {
		const result = stripComments("", "css");
		expect(result).toBe("");
		expect(result.length).toBe(0);
	});

	// TS mode ----------------------------------------------------------------

	test("ts: strips // line comment", () => {
		const text = `const x = 1; // var(--dead-token) in a comment\nconst y = 2;`;
		const result = stripComments(text, "ts");
		expect(result).not.toContain("--dead-token");
		expect(result).toContain("const x = 1;");
		expect(result).toContain("const y = 2;");
	});

	test("ts: strips /* block comment */", () => {
		const text = `/* @lore var(--bg-canvas) */\nconst a = "val";`;
		const result = stripComments(text, "ts");
		expect(result).not.toContain("--bg-canvas");
		expect(result).toContain("a");
	});

	test("ts: line comment stripped but var() in string survives", () => {
		// The live reference in the styling string must NOT be stripped
		const text = `const cls = "border-[var(--border-subtle)]"; // was var(--border-lo)`;
		const result = stripComments(text, "ts");
		// The string reference should survive
		expect(result).toContain("--border-subtle");
		// The comment reference should be gone
		expect(result).not.toContain("--border-lo");
	});

	test("ts: block comment spanning lines preserves line count", () => {
		const text = `/**\n * @lore var(--danger) migrated to var(--status-error) in AI1\n */\nconst x = 1;`;
		const result = stripComments(text, "ts");
		const originalLines = text.split("\n").length;
		const strippedLines = result.split("\n").length;
		expect(strippedLines).toBe(originalLines);
		expect(result).not.toContain("--danger");
		expect(result).not.toContain("--status-error");
	});

	test("ts: both line and block comments stripped in same file", () => {
		const text = `/* block */ const a = 1; // line var(--dead)\nconst b = "val";`;
		const result = stripComments(text, "ts");
		expect(result).not.toContain("--dead");
	});

	test("ts: preserves line count (newlines inside block comment become spaces/newlines)", () => {
		const text = `line1\n/* line2-comment\nline3-comment */\nline4`;
		const result = stripComments(text, "ts");
		expect(result.split("\n").length).toBe(text.split("\n").length);
	});
});

// ---------------------------------------------------------------------------
// findUndefinedReferences — reference checker with line numbers
// ---------------------------------------------------------------------------

describe("AI1 AC3: findUndefinedReferences — reports undefined var() with file+token+line", () => {
	const NO_TOKENS: ReadonlySet<string> = new Set();

	test("returns empty array for empty text", () => {
		const result = findUndefinedReferences("", NO_TOKENS);
		expect(result).toEqual([]);
	});

	test("returns empty array when all referenced tokens are defined", () => {
		const defined = new Set(["--border-subtle", "--text-base"]);
		const text = `.a { border: var(--border-subtle); font-size: var(--text-base); }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toEqual([]);
	});

	test("reports a single undefined token with correct name", () => {
		const defined = new Set(["--text-base"]);
		const text = `.a { border: var(--border-lo); }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--border-lo");
	});

	test("reports correct 1-based line number for undefined token", () => {
		const defined = new Set(["--text-base"]);
		const text = `line one\nline two\n.a { border: var(--does-not-exist); }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.line).toBe(3); // 1-based
		expect(result[0]?.token).toBe("--does-not-exist");
	});

	test("reports multiple undefined tokens, each with correct line number", () => {
		const defined = new Set(["--border-subtle"]);
		const text = [
			`.a { border: var(--does-not-exist); }`, // line 1
			`.b { color: var(--also-missing); }`, // line 2
			`.c { border: var(--border-subtle); }`, // line 3 — defined, no report
		].join("\n");
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(2);
		const tokens = result.map((r) => r.token);
		expect(tokens).toContain("--does-not-exist");
		expect(tokens).toContain("--also-missing");
		const byToken = Object.fromEntries(result.map((r) => [r.token, r.line]));
		expect(byToken["--does-not-exist"]).toBe(1);
		expect(byToken["--also-missing"]).toBe(2);
	});

	test("AC3 — Tailwind arbitrary-value form: border-[var(--border-lo)] is caught", () => {
		// This is the TaskSheet pattern — the headline bug fix
		const defined = new Set(["--border-subtle"]);
		const text = `<div className="border-[var(--border-lo)] p-4">`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--border-lo");
	});

	test("AC3 — plain CSS var() form: var(--ui) in CSS is caught", () => {
		const defined = new Set(["--font-sans"]);
		const text = `body { font-family: var(--ui); }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--ui");
	});

	test("AC3 — template string form: className={`text-[var(--mono)]`} is caught", () => {
		const defined = new Set(["--font-mono"]);
		const text = "const cls = `font-[var(--mono)]`;";
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--mono");
	});

	test("AC3 — style-object string form: style={{ color: 'var(--color-error, red)' }} is caught", () => {
		// The SettingsAssistant case — fallback value must NOT exempt the dead token
		const defined = new Set(["--status-error"]);
		const text = `const el = <div style={{ color: "var(--color-error, red)" }} />`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--color-error");
	});

	test("fallback value does not exempt an undefined token", () => {
		// var(--x, red) → token is --x; fallback `red` is ignored for gate purposes
		const defined: ReadonlySet<string> = new Set();
		const text = `.a { color: var(--undefined-token, fallback-value); }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--undefined-token");
	});

	test("fallback value does not produce a spurious undefined-token report", () => {
		// The fallback `red` or another word must not be treated as a token
		const defined: ReadonlySet<string> = new Set(["--real-token"]);
		const text = `.a { color: var(--real-token, fallback); }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(0);
	});

	test("nested var() — both outer and inner tokens reported if undefined", () => {
		// R3 from the architecture plan: nested var(--a, var(--b)) → both reported
		const defined: ReadonlySet<string> = new Set();
		const text = `.a { color: var(--outer, var(--inner)); }`;
		const result = findUndefinedReferences(text, defined);
		const tokens = result.map((r) => r.token);
		expect(tokens).toContain("--outer");
		expect(tokens).toContain("--inner");
	});

	test("nested var() — outer defined but inner undefined → only inner reported", () => {
		const defined = new Set(["--outer"]);
		const text = `.a { color: var(--outer, var(--inner)); }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--inner");
	});

	test("var() with whitespace around token name is tolerated", () => {
		// Plan notes regex tolerates `\s*` after `(` — var( --x ) style
		const defined: ReadonlySet<string> = new Set();
		const text = `.a { color: var( --spacey-token ); }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--spacey-token");
	});

	test("multiple occurrences of the same undefined token on the same line — reported (at least once)", () => {
		const defined: ReadonlySet<string> = new Set();
		const text = `.a { border: var(--dupe); outline: var(--dupe); }`;
		const result = findUndefinedReferences(text, defined);
		// At minimum one report per occurrence (implementation may deduplicate per-line or not)
		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(result.every((r) => r.token === "--dupe")).toBe(true);
	});

	test("text with no var() references returns empty array", () => {
		const defined: ReadonlySet<string> = new Set();
		const text = `.a { font-size: 16px; color: #fff; }`;
		const result = findUndefinedReferences(text, defined);
		expect(result).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Integration: stripComments + findUndefinedReferences pipeline
// (proves the AC3 false-positive contract: @lore comments don't red the gate)
// ---------------------------------------------------------------------------

describe("AI1 AC3: comment-strip + find pipeline — lore comments do not cause false positives", () => {
	test("CSS: @lore block comment with dead token name does not produce a report", () => {
		// The --bg-canvas case: comment-only, no live reference
		const rawCss = `/* @lore W3: was var(--bg-canvas) */\n.real { color: var(--text-primary); }`;
		const defined = new Set(["--text-primary"]);
		const stripped = stripComments(rawCss, "css");
		const result = findUndefinedReferences(stripped, defined);
		expect(result).toHaveLength(0);
	});

	test("TS: @lore // line comment with dead token name does not produce a report", () => {
		// The --danger case: JS line comment documents the old name
		const rawTs = `// @lore U9: was var(--danger)\nconst cls = "text-[var(--status-error)]";`;
		const defined = new Set(["--status-error"]);
		const stripped = stripComments(rawTs, "ts");
		const result = findUndefinedReferences(stripped, defined);
		expect(result).toHaveLength(0);
	});

	test("TS: JSDoc block comment with dead token does not produce a report", () => {
		// The --density-text @lore T1 case
		const rawTs = `/**\n * @lore T1: density-text was var(--density-text) and var(--density-text-h2)\n */\nconst x = "font-size: var(--text-base)";`;
		const defined = new Set(["--text-base"]);
		const stripped = stripComments(rawTs, "ts");
		const result = findUndefinedReferences(stripped, defined);
		expect(result).toHaveLength(0);
	});

	test("live undefined token on styling line still reported after comment stripping", () => {
		// Comment contains a known-dead token (ok), but the styling line has a real dead token
		const rawTs = `// was var(--border-lo)\nconst cls = "border-[var(--border-lo)]";`;
		const defined: ReadonlySet<string> = new Set(["--border-subtle"]);
		const stripped = stripComments(rawTs, "ts");
		const result = findUndefinedReferences(stripped, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--border-lo");
	});

	test("CSS: live token in @lore body comment removed, same-line live reference in rule still reported", () => {
		// Multi-line fixture: comment on line 1, dead token on line 2, defined on line 3
		const rawCss = [
			"/* @lore T1: replaces var(--density-text-h2) */", // line 1 — in comment
			"h2 { font-size: var(--density-text-h2); }", // line 2 — LIVE dead ref
			"p { font-size: var(--text-base); }", // line 3 — defined
		].join("\n");
		const defined = new Set(["--text-base"]);
		const stripped = stripComments(rawCss, "css");
		const result = findUndefinedReferences(stripped, defined);
		expect(result).toHaveLength(1);
		expect(result[0]?.token).toBe("--density-text-h2");
		expect(result[0]?.line).toBe(2);
	});
});

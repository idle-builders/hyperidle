/**
 * AR2 — coverage-guard unit tests (TDD red phase).
 *
 * Tests the new pure functions in scripts/honest-harness-guard.ts (AR2 §1):
 *
 *   declaredHarnesses(source): Set<string>
 *     Returns the set of harness names declared via requireHarness() calls.
 *
 *   missingHarnesses(source): SupportedHarness[]
 *     Returns the supported harnesses absent from the declared set.
 *     A fully-covered file returns []. A file declaring only "claude" returns
 *     ["builtin", "codex", "opencode"].
 *
 * And the coverage-debt allowlist interaction via checkGuardRules (existing fn):
 *   - A harness-facing file that covers only a subset → violation naming missing harnesses
 *   - A harness-facing file in the coverage-debt allowlist → pass
 *   - A clean (full-coverage) file in the coverage-debt allowlist → violation "debt paid"
 *
 * These tests are intentionally RED until the implementation lands.
 */

import { describe, expect, test } from "vitest";
import { declaredHarnesses, missingHarnesses } from "../../../../scripts/honest-harness-guard.js";

// ── declaredHarnesses ─────────────────────────────────────────────────────────

describe("declaredHarnesses — parses requireHarness() literals from source", () => {
	test("empty source → empty set", () => {
		const result = declaredHarnesses("");
		expect(result.size).toBe(0);
	});

	test("single requireHarness call → one entry", () => {
		const src = `requireHarness("claude")`;
		const result = declaredHarnesses(src);
		expect(result.has("claude")).toBe(true);
		expect(result.size).toBe(1);
	});

	test("single-quoted name is also captured", () => {
		const src = `requireHarness('codex')`;
		const result = declaredHarnesses(src);
		expect(result.has("codex")).toBe(true);
	});

	test("four separate requireHarness calls → full set", () => {
		const src = [
			'requireHarness("builtin")',
			'requireHarness("claude")',
			'requireHarness("codex")',
			'requireHarness("opencode")',
		].join("\n");
		const result = declaredHarnesses(src);
		expect(result.has("builtin")).toBe(true);
		expect(result.has("claude")).toBe(true);
		expect(result.has("codex")).toBe(true);
		expect(result.has("opencode")).toBe(true);
	});

	test("multi-arg call captures both names", () => {
		const src = `requireHarness("claude", "codex")`;
		const result = declaredHarnesses(src);
		expect(result.has("claude")).toBe(true);
		expect(result.has("codex")).toBe(true);
	});

	test("extra whitespace around args is handled", () => {
		const src = `requireHarness( "builtin" )`;
		const result = declaredHarnesses(src);
		expect(result.has("builtin")).toBe(true);
	});

	test("no requireHarness calls → empty set", () => {
		const src = `describe("test", () => { expect(true).toBe(true); })`;
		const result = declaredHarnesses(src);
		expect(result.size).toBe(0);
	});
});

// ── missingHarnesses ──────────────────────────────────────────────────────────

describe("missingHarnesses — returns SUPPORTED_HARNESSES not declared in source", () => {
	test("source with no requireHarness → all four missing", () => {
		const missing = missingHarnesses("");
		expect(missing).toContain("builtin");
		expect(missing).toContain("claude");
		expect(missing).toContain("codex");
		expect(missing).toContain("opencode");
		expect(missing).toHaveLength(4);
	});

	test("source declaring only claude → missing builtin + codex + opencode", () => {
		const src = `requireHarness("claude")`;
		const missing = missingHarnesses(src);
		expect(missing).toContain("builtin");
		expect(missing).toContain("codex");
		expect(missing).toContain("opencode");
		expect(missing).not.toContain("claude");
		expect(missing).toHaveLength(3);
	});

	test("source declaring all four → empty (fully covered)", () => {
		const src = [
			'requireHarness("builtin")',
			'requireHarness("claude")',
			'requireHarness("codex")',
			'requireHarness("opencode")',
		].join("\n");
		const missing = missingHarnesses(src);
		expect(missing).toHaveLength(0);
	});

	test("source declaring builtin + claude → missing codex + opencode", () => {
		const src = `requireHarness("builtin")\nrequireHarness("claude")`;
		const missing = missingHarnesses(src);
		expect(missing).toContain("codex");
		expect(missing).toContain("opencode");
		expect(missing).not.toContain("builtin");
		expect(missing).not.toContain("claude");
		expect(missing).toHaveLength(2);
	});

	test("'gh' is NOT in SUPPORTED_HARNESSES — declaring only gh still yields all four missing", () => {
		const src = `requireHarness("gh")`;
		const missing = missingHarnesses(src);
		expect(missing).toHaveLength(4);
	});
});

// ── Comment/string stripping (W-1 fix) ────────────────────────────────────────

describe("declaredHarnesses — comment and string mentions do NOT count as declared", () => {
	test("harness name in a line comment is NOT declared", () => {
		// Gate: requireHarness("codex")   ← this would be a comment in real source
		const src = `// requireHarness("codex")\nrequireHarness("builtin")\nrequireHarness("claude")\nrequireHarness("opencode")`;
		const result = declaredHarnesses(src);
		// codex is only in a line comment — must NOT be counted
		expect(result.has("codex")).toBe(false);
		expect(result.has("builtin")).toBe(true);
		expect(result.has("claude")).toBe(true);
		expect(result.has("opencode")).toBe(true);
	});

	test("harness name in a block/JSDoc comment is NOT declared", () => {
		const src = `/**\n * Gate: requireHarness("codex")\n */\nrequireHarness("builtin")`;
		const result = declaredHarnesses(src);
		expect(result.has("codex")).toBe(false);
		expect(result.has("builtin")).toBe(true);
	});

	test("harness name in a string literal is NOT declared", () => {
		// Error message string that mentions the harness name
		const src = `throw new Error("requireHarness('codex') passed but no auth.json");\nrequireHarness("builtin")`;
		const result = declaredHarnesses(src);
		expect(result.has("codex")).toBe(false);
		expect(result.has("builtin")).toBe(true);
	});

	test("file that gates 3 harnesses but mentions the 4th only in a comment → missingHarnesses reports the 4th", () => {
		// This is the exact sanity-break scenario from the reviewer:
		// remove the real requireHarness("codex") gate call,
		// leave "codex" in a JSDoc comment and an error string — guard must FAIL.
		const srcWithCommentOnly = [
			`/**`,
			` * Gate: requireHarness("codex")`,
			` */`,
			`throw new Error("requireHarness('codex') passed but no auth.json");`,
			`requireHarness("builtin")`,
			`requireHarness("claude")`,
			`requireHarness("opencode")`,
		].join("\n");
		const missing = missingHarnesses(srcWithCommentOnly);
		// codex appears only in comment + string — must be reported as missing
		expect(missing).toContain("codex");
		expect(missing).toHaveLength(1);
	});

	test("real requireHarness call is not stripped — all four declared", () => {
		const src = [
			`requireHarness("builtin")`,
			`requireHarness("claude")`,
			`requireHarness("codex")`,
			`requireHarness("opencode")`,
		].join("\n");
		const missing = missingHarnesses(src);
		expect(missing).toHaveLength(0);
	});
});

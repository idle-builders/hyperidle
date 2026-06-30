#!/usr/bin/env tsx
/**
 * AR1 — honest-harness-guard: fails the build when a harness-facing integration
 * test stubs/scripts/mocks the harness it is supposed to exercise against the real
 * binary, or gates itself with a `skipIf`-on-absent availability check.
 * (architecture.md Mechanism 3 + Decision 2/3/5.)
 *
 * Usage:
 *   npx tsx scripts/honest-harness-guard.ts --check            # CI mode (rides `lint`)
 *   npx tsx scripts/honest-harness-guard.ts --write-allowlist  # (re)generate the debt ledger
 *
 * File selection is PATH-ONLY via isHarnessIntegrationPath (single source —
 * scripts/lib/honest-harness-predicate.ts), so the guard and the attestation
 * floor agree on exactly which files are "agentic".
 *
 * Three checks over the selected files:
 *   1. Lane checks (immediate, NEVER allowlisted): no `*.real-harness.test.ts`
 *      file, no `vitest.real-harness.config.ts`, no `test:real-harness` script.
 *   2. skipIf-on-absent check (immediate, NEVER allowlisted): a skip-when-absent
 *      availability gate in a selected file is always a violation — that is the
 *      pattern requireHarness replaces.
 *   3. Stub-content check (allowlisted, monotonic-shrink): a selected file that
 *      constructs/imports/mocks a fake harness seam. Known debt is tracked in
 *      honest-harness-guard.allowlist.json; the allowlist only ever shrinks.
 *
 * Allowlist rules:
 *   dirty + allowlisted        → PASS  (known debt; AR2–AR6 convert it)
 *   dirty + NOT allowlisted    → FAIL  (new offender — real harness or demote to *.test.ts)
 *   clean + allowlisted        → FAIL  (debt paid — remove from allowlist)
 *   allowlisted path missing   → FAIL  (stale entry)
 *
 * @lore AR1: the guard is a standalone tsx check (not an eslint rule) because it
 *   reasons about whole-repo facts (does the dead .real-harness config exist?) and
 *   owns a stateful monotonic-shrink allowlist — neither fits ESLint's per-file AST
 *   model. It rides `npm run lint` (precedent: ag7-no-divergent-classes.ts) so CI's
 *   Lint step enforces it with no new CI job.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	BUILTIN_ONLY_INTEGRATION,
	SUPPORTED_HARNESSES,
	type SupportedHarness,
	isHarnessIntegrationPath,
} from "./lib/honest-harness-predicate.js";

export { isHarnessIntegrationPath } from "./lib/honest-harness-predicate.js";
export { SUPPORTED_HARNESSES, type SupportedHarness } from "./lib/honest-harness-predicate.js";
export { BUILTIN_ONLY_INTEGRATION } from "./lib/honest-harness-predicate.js";

// ── Pure detection ────────────────────────────────────────────────────────────

/**
 * A selected file is "stub-dirty" when it constructs, imports, or vi.mock()s a
 * fake/scripted/echo/capturing/mock harness seam instead of driving the real one.
 */
const STUB_PATTERNS: readonly RegExp[] = [
	// fake-adapter constructions
	/new\s+(?:Scripted|Echo|Capturing|Mock)(?:Adapter|Harness|HarnessAdapter)\b/,
	/new\s+ScriptedHarness\b/,
	// a hand-rolled HarnessAdapter implementation
	/class\s+\w+\s+implements\s+HarnessAdapter\b/,
	// a factory function / arrow whose RETURN TYPE is HarnessAdapter — i.e. it
	// hand-builds and returns a fake adapter object (the dominant in-repo stub
	// idiom: `function makeStubAdapter(...): HarnessAdapter { return {...} }`,
	// `const make = (): HarnessAdapter => ({...})`). The `)` anchor before the
	// colon scopes this to a RETURN-TYPE annotation, so a parameter annotation
	// (`adapter: HarnessAdapter`) and a type import do NOT match. AC5: stub-the-seam
	// via a factory must fail the build just like `new ScriptedAdapter` /
	// `implements HarnessAdapter`. (AR1 finding 3 — AL6-return-gate +
	// ah5-gates-on-broken-stream evaded the old set with this exact shape.)
	/\)\s*:\s*HarnessAdapter\b/,
	// importing a mock harness adapter module
	/import\s+[^;]*mock-harness-adapter/,
	// vi.mock of the harness seam / the llm-client / a callLlm module
	/vi\.mock\(\s*["'][^"']*harness[^"']*["']/,
	/vi\.mock\(\s*["'][^"']*llm-client[^"']*["']/,
	/vi\.mock\(\s*["'][^"']*callLlm[^"']*["']/,
];

export function isStubDirty(source: string): boolean {
	return STUB_PATTERNS.some((re) => re.test(source));
}

// ── AR2: coverage detection ───────────────────────────────────────────────────

/**
 * Strip line comments (`//…`) and block comments (`/*…*\/`) from TypeScript
 * source, AND blank out any occurrence of `requireHarness(...)` that appears
 * INSIDE a string or template literal — so that the call regex only fires on
 * genuine code-level call expressions.
 *
 * Strategy (single pass with state tracking):
 *  1. Block comments (`/*…*\/`, including JSDoc `/**…*\/`) → removed entirely.
 *  2. Line comments (`//…` to end of line) → removed entirely.
 *  3. String/template literals (single/double/backtick, escape-aware) →
 *     KEPT in output but any `requireHarness` text inside them is blanked with
 *     spaces of equal length — preserving offset alignment while erasing the
 *     false call expression. The surrounding quotes remain so the string is
 *     syntactically intact and a direct `requireHarness("builtin")` call OUTSIDE
 *     a string is unaffected.
 *
 * @lore AR2 W-1 (round-2 fix): The original implementation matched requireHarness
 * over raw source text — a JSDoc comment or error-string literal containing
 * `requireHarness("codex")` was falsely counted as declared. Confirmed by the
 * reviewer's sanity-break: removing the real gate call while JSDoc + error-string
 * mentions remained left the guard green. This fix strips comment occurrences and
 * blanks in-string occurrences so only real call expressions remain matchable.
 *
 * @lore AR2 W-1: We do NOT replace the entire string content with `""` because
 * the direct call `requireHarness("builtin")` has its argument `"builtin"` as a
 * top-level string literal — replacing ALL strings with `""` erases the harness
 * name from real calls too. Instead we blank only the `requireHarness` text inside
 * strings, leaving the surrounding string (and its content) intact.
 */
function stripCodeSoOnlyRealCallsRemain(source: string): string {
	const REQUIRE_HARNESS_TEXT = "requireHarness";
	let result = "";
	let i = 0;
	const len = source.length;

	while (i < len) {
		// Block comment: /* … */
		if (source[i] === "/" && source[i + 1] === "*") {
			i += 2;
			while (i < len && !(source[i] === "*" && source[i + 1] === "/")) {
				i++;
			}
			i += 2; // consume closing */
			continue;
		}
		// Line comment: // … \n
		if (source[i] === "/" && source[i + 1] === "/") {
			i += 2;
			while (i < len && source[i] !== "\n") {
				i++;
			}
			continue;
		}
		// String/template literals — keep in output but blank requireHarness inside them
		if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
			const quote = source[i];
			result += source[i]; // opening quote
			i++;
			while (i < len && source[i] !== quote) {
				// Escape sequence
				if (source[i] === "\\" && i + 1 < len) {
					result += source[i] + source[i + 1];
					i += 2;
					continue;
				}
				// Template expression ${…} — recurse logically (simplified: no nesting)
				if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
					result += source[i] + source[i + 1];
					i += 2;
					let depth = 1;
					while (i < len && depth > 0) {
						if (source[i] === "{") depth++;
						else if (source[i] === "}") depth--;
						result += source[i];
						i++;
					}
					continue;
				}
				// Check: does the string content contain `requireHarness`?
				if (
					source.startsWith(REQUIRE_HARNESS_TEXT, i) &&
					source[i + REQUIRE_HARNESS_TEXT.length] === "("
				) {
					// Blank it with spaces of equal length
					result += " ".repeat(REQUIRE_HARNESS_TEXT.length);
					i += REQUIRE_HARNESS_TEXT.length;
					continue;
				}
				result += source[i];
				i++;
			}
			if (i < len) {
				result += source[i]; // closing quote
				i++;
			}
			continue;
		}
		result += source[i];
		i++;
	}
	return result;
}

/**
 * Regex matching every `requireHarness(...)` call in a file body. The captured
 * group is the entire argument list (everything between the parens).
 *
 * Applied ONLY on source pre-processed by `stripCodeSoOnlyRealCallsRemain` —
 * comments are removed and in-string occurrences of `requireHarness` are blanked.
 *
 * @lore AR2 W-1: Applied after stripping so occurrences in JSDoc/block/line
 * comments and string literals are invisible to this regex. Removing a real gate
 * call now FAILS the guard even when the harness name remains in a comment or
 * error-string. Confirmed load-bearing by round-2 sanity-break.
 */
const REQUIRE_HARNESS_CALL = /requireHarness\s*\(\s*([^)]*)\)/g;
const HARNESS_NAME_LITERAL = /["']([a-z-]+)["']/g;

/**
 * The set of harness names a file passes to `requireHarness(...)` across all calls.
 * Handles multi-arg calls (`requireHarness("claude", "codex")`).
 *
 * Comments are stripped and in-string occurrences of requireHarness are blanked
 * before matching — only genuine call expressions count as declared.
 */
export function declaredHarnesses(source: string): Set<string> {
	const stripped = stripCodeSoOnlyRealCallsRemain(source);
	const declared = new Set<string>();
	for (const call of stripped.matchAll(REQUIRE_HARNESS_CALL)) {
		for (const lit of call[1].matchAll(HARNESS_NAME_LITERAL)) {
			declared.add(lit[1]);
		}
	}
	return declared;
}

/**
 * A selected harness-facing integration file must declare EVERY supported harness.
 * Returns the missing ones (empty array = fully covered).
 */
export function missingHarnesses(source: string): SupportedHarness[] {
	const declared = declaredHarnesses(source);
	return SUPPORTED_HARNESSES.filter((h) => !declared.has(h));
}

/**
 * A selected file has an absent-skipIf when it uses test/it/describe.skipIf as a
 * skip-when-absent availability gate (the pattern requireHarness replaces).
 *
 * Narrow shape: `.skipIf(!…)` or `.skipIf(<name>Installed|Present|Configured|Missing|Absent)`.
 * The inverse skip-WHEN-PRESENT assertion (e.g. asserting a binary is absent) is a
 * different intent; AR1 removes the one such case (cursor) outright, so it need not
 * be specially excluded here.
 */
const ABSENT_SKIPIF_PATTERNS: readonly RegExp[] = [
	/(?:test|it|describe)\.skipIf\s*\(\s*!/,
	/(?:test|it|describe)\.skipIf\s*\(\s*\w*(?:Installed|Present|Configured)\b/,
	/(?:test|it|describe)\.skipIf\s*\(\s*\w*(?:Missing|Absent)\b/,
];

export function hasAbsentSkipIf(source: string): boolean {
	return ABSENT_SKIPIF_PATTERNS.some((re) => re.test(source));
}

// ── AR7: banned model-caller import detection ─────────────────────────────────

/**
 * Strip block and line comments from TypeScript source while correctly skipping
 * string/template literal contents. Used so that an import path that appears
 * only in a comment does not trigger the banned-import check.
 *
 * Strategy mirrors `stripCodeSoOnlyRealCallsRemain` but is simpler: we DO NOT
 * blank in-string text (we need the import specifier strings themselves to be
 * intact so the import regex can match them). Instead we only erase comment
 * regions — the import statement inside a comment is gone; the import statement
 * outside a comment still contains its specifier string.
 */
function stripComments(source: string): string {
	let result = "";
	let i = 0;
	const len = source.length;

	while (i < len) {
		// Block comment: /* … */
		if (source[i] === "/" && source[i + 1] === "*") {
			i += 2;
			while (i < len && !(source[i] === "*" && source[i + 1] === "/")) {
				i++;
			}
			i += 2; // consume closing */
			continue;
		}
		// Line comment: // … \n
		if (source[i] === "/" && source[i + 1] === "/") {
			i += 2;
			while (i < len && source[i] !== "\n") {
				i++;
			}
			continue;
		}
		// String/template literals — keep verbatim (specifiers live inside strings)
		if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
			const quote = source[i];
			result += source[i];
			i++;
			while (i < len && source[i] !== quote) {
				if (source[i] === "\\" && i + 1 < len) {
					result += source[i] + source[i + 1];
					i += 2;
					continue;
				}
				if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
					result += source[i] + source[i + 1];
					i += 2;
					let depth = 1;
					while (i < len && depth > 0) {
						if (source[i] === "{") depth++;
						else if (source[i] === "}") depth--;
						result += source[i];
						i++;
					}
					continue;
				}
				result += source[i];
				i++;
			}
			if (i < len) {
				result += source[i]; // closing quote
				i++;
			}
			continue;
		}
		result += source[i];
		i++;
	}
	return result;
}

/**
 * Specifier substrings that identify the raw model-callers. A harness-facing
 * integration test must NOT import these directly — it must get adapters from
 * the seam (provision-real-session.ts / require-harness.ts) instead.
 *
 * @lore AR7: import-ban (not model-id string-matching) is the lock because
 * model-id matching is brittle: it breaks on every model rename/addition and
 * can be evaded by assigning the id to a variable. The true enforcement
 * invariant is structural: if a test cannot import the raw adapter classes or
 * the llm-client, it cannot construct an adapter at all, so there is no path
 * left to supply a custom model. The ban is on the specifier strings that
 * identify each raw model-caller module; `provision-real-session.ts` is the
 * only file allowed to import them (it's a `.ts` support module, not a
 * `.integration.test.ts`, so `isHarnessIntegrationPath` never selects it).
 */
const BANNED_IMPORT_SPECIFIERS: readonly RegExp[] = [
	/\/cli-harness-adapter/,
	/\/builtin-harness-adapter/,
	/\/llm-client/,
];

/** Adapter construction patterns that indicate a test bypassed the seam. */
const BANNED_CONSTRUCTION_PATTERNS: readonly RegExp[] = [
	/new\s+CliHarnessAdapter\s*\(/,
	/new\s+BuiltinHarnessAdapter\s*\(/,
];

/** Regex matching static named/default imports: `import ... from "..."`. */
const IMPORT_STMT = /import\s[^;]*from\s*["']([^"']+)["']/g;
/** Regex matching dynamic imports: `import("...")` or `await import("...")`. */
const DYNAMIC_IMPORT = /(?:await\s+)?import\s*\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Banned model-caller import specifiers + raw-adapter construction in a
 * harness-facing integration test. Returns the offending evidence strings
 * (empty = clean).
 *
 * Detects (over comment-stripped source):
 *   - any `import … from "…"` whose specifier matches `/cli-harness-adapter/`,
 *     `/builtin-harness-adapter/`, or `/llm-client/`
 *   - any bare side-effect `import "…"` (no `from`) matching those specifiers
 *   - any `import("…")` dynamic import matching those specifiers
 *   - any `new (Cli|Builtin)HarnessAdapter(` construction
 *
 * Does NOT match `provision-real-session`, `adapter-pool`, `session-provisioning`/
 * `provisionSession`, or `require-harness` — those remain importable.
 *
 * @lore AR7: import-ban (not model-id string-matching) is the structural lock
 * for the per-harness test-model matrix. Model-id matching is brittle (breaks
 * on rename, evadable via variable indirection). Banning the import of the raw
 * model-caller modules (named, side-effect, and dynamic) leaves no sanctioned
 * path to construct an adapter with a custom model: the only remaining path is
 * the seam (provision-real-session.ts / require-harness.ts), whose factories
 * read the locked HARNESS_TEST_MODELS map.
 */
export function bannedModelToolImports(source: string): string[] {
	const stripped = stripComments(source);
	const found = new Set<string>();

	// Check static named/default imports: import ... from "..."
	for (const match of stripped.matchAll(IMPORT_STMT)) {
		const specifier = match[1];
		if (specifier === undefined) continue;
		for (const pattern of BANNED_IMPORT_SPECIFIERS) {
			if (pattern.test(specifier)) {
				found.add(`import "${specifier}"`);
				break;
			}
		}
	}

	// Check bare side-effect imports: `import "..."` (no `from`, no binding).
	// A named import (`import { x } from "..."`) has its specifier captured by
	// IMPORT_STMT above. The side-effect form starts with `import` followed
	// directly (optional whitespace) by a quote. We detect it by splitting on
	// lines and checking each line independently — the `/g` statefulness issue
	// cannot arise on single-line matches.
	for (const line of stripped.split("\n")) {
		const trimmed = line.trim();
		// A bare side-effect import starts with `import "` or `import '` (no `{`, no `*`, no name before the quote)
		const sideEffectMatch = /^import\s*(["'])([^"']+)\1/.exec(trimmed);
		if (!sideEffectMatch) continue;
		const specifier = sideEffectMatch[2];
		if (specifier === undefined) continue;
		for (const pattern of BANNED_IMPORT_SPECIFIERS) {
			if (pattern.test(specifier)) {
				found.add(`import "${specifier}"`);
				break;
			}
		}
	}

	// Check dynamic imports (used in AR2 Lane 1 candidate retry loop)
	for (const match of stripped.matchAll(DYNAMIC_IMPORT)) {
		const specifier = match[1];
		if (specifier === undefined) continue;
		for (const pattern of BANNED_IMPORT_SPECIFIERS) {
			if (pattern.test(specifier)) {
				found.add(`import("${specifier}")`);
				break;
			}
		}
	}

	// Check construction patterns (catches re-export / aliased imports)
	for (const pattern of BANNED_CONSTRUCTION_PATTERNS) {
		const m = stripped.match(pattern);
		if (m) {
			found.add(m[0].trim());
		}
	}

	return [...found];
}

// ── Guard rules over (already-read) files ─────────────────────────────────────

export interface GuardFile {
	/** Repo-relative POSIX path. */
	path: string;
	/** File source (empty string if missing). */
	source: string;
	/** Whether the file exists on disk. */
	exists: boolean;
}

export interface GuardResult {
	path: string;
	violation: string | null;
}

/**
 * Apply the lane/skipIf/stub-content/coverage/model-import rules to a set of
 * pre-read files against the allowlists. Returns one result per input file plus
 * one per stale allowlist entry. The coverage-debt allowlist (AR2) stages files
 * that cover only a subset — they pass the coverage check until their conversion
 * lands. The model-import-debt allowlist (AR7) stages files that import raw
 * model-callers directly — they pass until converted to use the seam.
 */
export function checkGuardRules(
	files: GuardFile[],
	allowlist: string[],
	coverageAllowlist?: string[],
	modelImportAllowlist?: string[],
): GuardResult[] {
	const allow = new Set(allowlist.map((p) => p.replace(/\\/g, "/")));
	const coverageAllow = new Set((coverageAllowlist ?? []).map((p) => p.replace(/\\/g, "/")));
	const modelImportAllow = new Set((modelImportAllowlist ?? []).map((p) => p.replace(/\\/g, "/")));
	const results: GuardResult[] = [];
	const seen = new Set<string>();

	for (const f of files) {
		const p = f.path.replace(/\\/g, "/");
		seen.add(p);
		results.push({ path: p, violation: ruleFor(f, p, allow, coverageAllow, modelImportAllow) });
	}

	// Rule 4 (stale): an allowlisted path that never appeared as an existing file.
	for (const entry of allow) {
		if (seen.has(entry)) continue;
		results.push({
			path: entry,
			violation:
				`stale allowlist entry — ${entry} no longer exists. ` +
				`Remove it from honest-harness-guard.allowlist.json.`,
		});
	}

	return results;
}

function ruleFor(
	f: GuardFile,
	p: string,
	allow: Set<string>,
	coverageAllow: Set<string>,
	modelImportAllow: Set<string> = new Set(),
): string | null {
	// Only harness-facing integration files are subject to the guard.
	if (!isHarnessIntegrationPath(p)) return null;

	const allowlisted = allow.has(p);
	const coverageAllowlisted = coverageAllow.has(p);
	const modelImportAllowlisted = modelImportAllow.has(p);

	// Rule 4 (stale): allowlisted but the file is gone.
	if (!f.exists) {
		if (allowlisted) {
			return (
				`stale allowlist entry — ${p} no longer exists. ` +
				`Remove it from honest-harness-guard.allowlist.json.`
			);
		}
		if (coverageAllowlisted) {
			return (
				`stale coverage-debt entry — ${p} no longer exists. ` +
				`Remove it from scripts/coverage-debt.allowlist.json.`
			);
		}
		if (modelImportAllowlisted) {
			return (
				`stale model-import-debt entry — ${p} no longer exists. ` +
				`Remove it from scripts/model-import-debt.allowlist.json.`
			);
		}
		return null;
	}

	// skipIf-on-absent is NEVER allowlisted — always a violation in a selected file.
	if (hasAbsentSkipIf(f.source)) {
		return (
			`skipIf-on-absent availability gate in a harness-facing integration test. ` +
			`Replace it with requireHarness(<name>) — never skipIf to green.`
		);
	}

	const dirty = isStubDirty(f.source);

	if (dirty && allowlisted) return null; // Rule 1: known debt.
	if (dirty && !allowlisted) {
		return (
			`stubbed/scripted/mocked harness seam in a harness-facing integration test. ` +
			`Write against the real harness binary (requireHarness) or demote to a *.test.ts unit.`
		);
	}
	if (!dirty && allowlisted) {
		return (
			`debt paid — ${p} no longer stubs the harness but is still on the allowlist. ` +
			`Remove it from honest-harness-guard.allowlist.json.`
		);
	}

	// AR4: BUILTIN_ONLY_INTEGRATION carve-out — skip the 4-harness coverage rule for
	// files whose production path is genuinely builtin-only (runAssistantTurn cannot run
	// a CLI harness: no sandbox cwd, no .mcp.json bridge). These files MUST still declare
	// requireHarness("builtin") — a builtin-only file that declares NO harness is a violation.
	// stub + skipIf rules already fired above; only the coverage rule is exempted here.
	const isBuiltinOnly = BUILTIN_ONLY_INTEGRATION.some((suffix) => p.endsWith(suffix));
	if (isBuiltinOnly) {
		const declared = declaredHarnesses(f.source);
		if (!declared.has("builtin")) {
			return (
				`builtin-only harness-facing integration test must declare requireHarness("builtin"). ` +
				`Declared: { ${[...declared].join(", ") || "none"} }. ` +
				`(AR4: BUILTIN_ONLY_INTEGRATION carve-out still requires builtin to be declared.)`
			);
		}
		return null; // builtin declared — passes the carve-out
	}

	// AR2: Coverage rule — every selected file must declare all SUPPORTED_HARNESSES.
	// W3: use the EXACT isHarnessIntegrationPath predicate (already applied above).
	// This check runs on clean (non-stub) files; stub-allowlisted files already exited.
	const missing = missingHarnesses(f.source);
	if (missing.length > 0) {
		if (coverageAllowlisted) return null; // staged debt — AR3–AR6 conversions.
		// Check if the coverage debt was paid (full coverage but still on allowlist).
		return (
			`incomplete harness coverage — declares { ${[...declaredHarnesses(f.source)].join(", ") || "none"} } ` +
			`but a harness-facing integration test must cover the full supported matrix. ` +
			`Add a requireHarness("<name>") lane for: ${missing.join(", ")}. ` +
			`(AR2: every supported harness, equal coverage. SUPPORTED_HARNESSES is the source of truth.)`
		);
	}
	// Clean and fully covered — check if it's on the coverage allowlist (debt paid).
	if (missing.length === 0 && coverageAllowlisted) {
		return (
			`coverage debt paid — ${p} now covers the full harness matrix but is still on the coverage allowlist. ` +
			`Remove it from scripts/coverage-debt.allowlist.json.`
		);
	}

	// AR7: Model-import rule — no direct imports of raw model-callers.
	const bannedImports = bannedModelToolImports(f.source);
	if (bannedImports.length > 0) {
		if (modelImportAllowlisted) return null; // staged debt — monotonic shrink.
		return (
			`${p} must not import the raw model-callers (cli-harness-adapter/builtin-harness-adapter/llm-client) — ` +
			`drive the harness via provision-real-session.ts (runThroughHarness / lockedHarnessAdapter); ` +
			`the model is locked in HARNESS_TEST_MODELS. Offending evidence: ${bannedImports.join(", ")}.`
		);
	}
	// Debt paid: clean of banned imports but still on model-import allowlist.
	if (bannedImports.length === 0 && modelImportAllowlisted) {
		return (
			`model-import debt paid — ${p} no longer imports raw model-callers but is still on the allowlist. ` +
			`Remove it from scripts/model-import-debt.allowlist.json.`
		);
	}

	return null; // clean + not allowlisted — the honest case.
}

// ── Filesystem scan (CLI side) ────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const ALLOWLIST_PATH = path.join(SCRIPT_DIR, "honest-harness-guard.allowlist.json");
/** AR2: parallel coverage-debt allowlist — stages subset-covered files until their conversion. */
const COVERAGE_DEBT_PATH = path.join(SCRIPT_DIR, "coverage-debt.allowlist.json");

/** AR7: model-import-debt allowlist — stages files that import raw model-callers directly. */
const MODEL_IMPORT_DEBT_PATH = path.join(SCRIPT_DIR, "model-import-debt.allowlist.json");

const SCAN_DIRS = [
	"packages/server/src/harness/__tests__",
	"packages/server/src/__tests__",
	// AR4: AH3/AK4 real files live here — add to SCAN_DIRS so the guard lints them.
	// NOTE: SCAN_DIRS is guard-lint-only; attestation floor selects via isHarnessIntegrationPath
	// on vitest JSON paths (EXPLICIT_HARNESS_INTEGRATION suffix), independent of SCAN_DIRS (N-1).
	"packages/server/src/routes/__tests__",
];

/** Collect every existing harness-facing integration file as a GuardFile. */
function collectSelectedFiles(): GuardFile[] {
	const out: GuardFile[] = [];
	for (const dir of SCAN_DIRS) {
		const abs = path.join(REPO_ROOT, dir);
		if (!fs.existsSync(abs)) continue;
		for (const name of fs.readdirSync(abs)) {
			const rel = `${dir}/${name}`;
			if (!isHarnessIntegrationPath(rel)) continue;
			out.push({ path: rel, source: fs.readFileSync(path.join(abs, name), "utf8"), exists: true });
		}
	}
	return out;
}

/** Stale allowlist entries whose files no longer exist (added as non-existing GuardFiles). */
function withStaleEntries(files: GuardFile[], allowlist: string[]): GuardFile[] {
	const present = new Set(files.map((f) => f.path));
	const extras: GuardFile[] = [];
	for (const entry of allowlist) {
		const e = entry.replace(/\\/g, "/");
		if (present.has(e)) continue;
		extras.push({ path: e, source: "", exists: fs.existsSync(path.join(REPO_ROOT, e)) });
	}
	return [...files, ...extras];
}

function readAllowlist(): string[] {
	if (!fs.existsSync(ALLOWLIST_PATH)) return [];
	const parsed: unknown = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
	if (!Array.isArray(parsed)) throw new Error("allowlist must be a JSON array of paths");
	return parsed.map((p) => String(p));
}

/** AR2: read the coverage-debt allowlist (parallel to the stub allowlist). */
function readCoverageAllowlist(): string[] {
	if (!fs.existsSync(COVERAGE_DEBT_PATH)) return [];
	const parsed: unknown = JSON.parse(fs.readFileSync(COVERAGE_DEBT_PATH, "utf8"));
	if (!Array.isArray(parsed)) throw new Error("coverage-debt allowlist must be a JSON array of paths");
	return parsed.map((p) => String(p));
}

/** AR7: read the model-import-debt allowlist (parallel to stub + coverage allowlists). */
function readModelImportAllowlist(): string[] {
	if (!fs.existsSync(MODEL_IMPORT_DEBT_PATH)) return [];
	const parsed: unknown = JSON.parse(fs.readFileSync(MODEL_IMPORT_DEBT_PATH, "utf8"));
	if (!Array.isArray(parsed)) throw new Error("model-import-debt allowlist must be a JSON array of paths");
	return parsed.map((p) => String(p));
}

// ── Lane checks (immediate, never allowlisted) ────────────────────────────────

function laneViolations(): string[] {
	const violations: string[] = [];

	// 1a: no *.real-harness.test.ts file may survive anywhere in packages/.
	const survivors: string[] = [];
	const walk = (dir: string): void => {
		for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
			if (name.name === "node_modules" || name.name === "dist" || name.name === ".git") continue;
			const full = path.join(dir, name.name);
			if (name.isDirectory()) walk(full);
			else if (name.name.endsWith(".real-harness.test.ts")) {
				survivors.push(path.relative(REPO_ROOT, full));
			}
		}
	};
	walk(path.join(REPO_ROOT, "packages"));
	for (const s of survivors) {
		violations.push(`dead lane: ${s} — rename to *.integration.test.ts (the .real-harness lane is gone)`);
	}

	// 1b: no vitest.real-harness.config.ts.
	if (fs.existsSync(path.join(REPO_ROOT, "vitest.real-harness.config.ts"))) {
		violations.push("dead lane: vitest.real-harness.config.ts must be deleted");
	}

	// 1c: no test:real-harness npm script.
	const pkg: unknown = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
	const scripts =
		pkg && typeof pkg === "object" && "scripts" in pkg
			? (pkg as { scripts?: Record<string, string> }).scripts
			: undefined;
	if (scripts && "test:real-harness" in scripts) {
		violations.push('dead lane: the "test:real-harness" npm script must be removed');
	}

	return violations;
}

// ── --write-allowlist ─────────────────────────────────────────────────────────

function writeAllowlist(): void {
	const files = collectSelectedFiles();
	const dirty = files
		.filter((f) => !hasAbsentSkipIf(f.source) && isStubDirty(f.source))
		.map((f) => f.path)
		.sort();
	fs.writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(dirty, null, "\t")}\n`);
	process.stdout.write(`honest-harness-guard: wrote ${dirty.length} known-debt entries to allowlist.\n`);
	for (const d of dirty) process.stdout.write(`  ${d}\n`);
}

/**
 * AR2: --write-coverage-allowlist — COMPUTES the coverage-debt seed from the actual
 * missingHarnesses() predicate over the repo's harness-facing files. Never hand-copied
 * from the stub allowlist (W1: the coincidence that the sets are currently identical is
 * load-bearing and unverified — derive each from its own predicate).
 *
 * @lore AR2 W1: The coverage-debt set is the set of files where missingHarnesses()
 * returns a non-empty slice. The stub allowlist is derived from isStubDirty(). These
 * are currently the same five files (AL6/ah5) by coincidence — but each debt axis must
 * retire independently, so they are stored in separate JSON files.
 */
function writeCoverageAllowlist(): void {
	const files = collectSelectedFiles();
	const withMissing = files
		.filter((f) => missingHarnesses(f.source).length > 0)
		.map((f) => f.path)
		.sort();
	fs.writeFileSync(COVERAGE_DEBT_PATH, `${JSON.stringify(withMissing, null, "\t")}\n`);
	process.stdout.write(
		`honest-harness-guard: wrote ${withMissing.length} coverage-debt entries.\n`,
	);
	for (const d of withMissing) process.stdout.write(`  ${d}\n`);
}

/**
 * AR7: --write-model-import-allowlist — COMPUTES the model-import-debt seed from
 * the actual `bannedModelToolImports()` predicate over all repo harness-facing files.
 * Never hand-copied from the stub or coverage allowlists (each debt axis retires
 * independently — see AR2 W1 lore in `writeCoverageAllowlist`).
 */
function writeModelImportAllowlist(): void {
	const files = collectSelectedFiles();
	const withBanned = files
		.filter((f) => bannedModelToolImports(f.source).length > 0)
		.map((f) => f.path)
		.sort();
	fs.writeFileSync(MODEL_IMPORT_DEBT_PATH, `${JSON.stringify(withBanned, null, "\t")}\n`);
	process.stdout.write(
		`honest-harness-guard: wrote ${withBanned.length} model-import-debt entries.\n`,
	);
	for (const d of withBanned) process.stdout.write(`  ${d}\n`);
}

// ── --check ───────────────────────────────────────────────────────────────────

function runCheck(): { ok: boolean; violations: GuardResult[]; lane: string[] } {
	const lane = laneViolations();
	const allowlist = readAllowlist();
	const coverageAllowlist = readCoverageAllowlist();
	const modelImportAllowlist = readModelImportAllowlist();
	const selectedFiles = collectSelectedFiles();
	// Stale-entry detection for ALL three allowlists.
	const files = withStaleEntries(
		withStaleEntries(
			withStaleEntries(selectedFiles, allowlist),
			coverageAllowlist,
		),
		modelImportAllowlist,
	);
	const results = checkGuardRules(files, allowlist, coverageAllowlist, modelImportAllowlist).filter(
		(r) => r.violation !== null,
	);
	return { ok: lane.length === 0 && results.length === 0, violations: results, lane };
}

const isEntrypoint =
	process.argv[1] ===
	(typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));

if (isEntrypoint) {
	if (process.argv.includes("--write-allowlist")) {
		writeAllowlist();
		process.exit(0);
	}
	if (process.argv.includes("--write-coverage-allowlist")) {
		// AR2: Compute and write the coverage-debt allowlist from actual missingHarnesses().
		// AR2's own test (AR2-provision-real-session.integration.test.ts) MUST NOT appear
		// in the output — it must cover all four harnesses and pass the coverage check clean.
		writeCoverageAllowlist();
		process.exit(0);
	}
	if (process.argv.includes("--write-model-import-allowlist")) {
		// AR7: Compute and write the model-import-debt allowlist from actual
		// bannedModelToolImports() predicate. The seam (provision-real-session.ts) and
		// require-harness.ts are NOT selected by isHarnessIntegrationPath (.ts suffix,
		// not .integration.test.ts) so they will never appear in the output.
		writeModelImportAllowlist();
		process.exit(0);
	}
	if (process.argv.includes("--check")) {
		const { ok, violations, lane } = runCheck();
		if (ok) {
			process.stdout.write("honest-harness-guard --check: clean.\n");
			process.exit(0);
		}
		process.stderr.write("honest-harness-guard --check: honest-harness violations found!\n\n");
		for (const l of lane) process.stderr.write(`  ${l}\n`);
		for (const v of violations) process.stderr.write(`  ${v.path}: ${v.violation}\n`);
		process.stderr.write(
			"\nHarness-facing integration tests must drive the real binary (requireHarness),\n" +
				"never a stub. Known debt is tracked in scripts/honest-harness-guard.allowlist.json\n" +
				"(monotonic shrink — AR2–AR6 convert it). Coverage debt in\n" +
				"scripts/coverage-debt.allowlist.json (AR2). See plans/AR2/architecture.md.\n",
		);
		process.exit(1);
	}
	process.stderr.write(
		"Usage: npx tsx scripts/honest-harness-guard.ts [--check | --write-allowlist | --write-coverage-allowlist | --write-model-import-allowlist]\n",
	);
	process.exit(1);
}

# M1 Architecture — Mock-data linter + auto-inventory generator

**Workpackage:** M1 (Track M — Mock-Data Purge pre-rollout)
**Author:** Designer (architecture phase)
**Date:** 2026-05-10

---

## Required reading (builder MUST open these)

1. `plans/mock-data-purge/concept.md` — locked concept (hard rules, prefix set, permitted surface)
2. `docs/guides/developer/mock-data-policy.md` — ground-truth dev policy (cites rule IDs + script path)
3. `plans/work-packages/TRACK-M.md` — M1 acceptance criteria (canonical)
4. `plans/mock-data-purge/inventory.md` — hand-curated 2026-05-09 preview (sanity-check target)
5. `packages/eslint-plugin-design/src/rules/no-raw-actor-fetch.ts` — rule shape template
6. `packages/eslint-plugin-design/src/index.ts` — plugin entry (register new rules here)
7. `packages/eslint-plugin-design/src/util.ts` — shared helpers (`createRule`)
8. `packages/eslint-plugin-design/src/__tests__/fixtures.test.ts` — test pattern
9. `eslint.config.js` — existing config (L16 AC-3 block is the structural precedent)
10. `scripts/verify.ts` — verify orchestrator (new inventory-drift step goes here)
11. `package.json` — root scripts (wire `mock-inventory` command)
12. `.gitignore` — `plans/*` is gitignored; must add negation for inventory artifacts

---

## Architectural decisions

### 1. Single source of truth — shared policy module

**Verdict:** Create `packages/eslint-plugin-design/src/mock-data-policy.ts`.

This module exports:
- `FORBIDDEN_PREFIXES` — the closed prefix list as `readonly string[]`
- `PERMITTED_MOCK_SURFACE_GLOBS` — the closed glob set as `readonly string[]`
- `LITERAL_ID_STRINGS` — the closed literal-id set as `readonly string[]`
- `DEFAULT_PREFIX_ALLOWLIST` — path-based allowlist for `DEFAULT_*` (see decision 2)
- `POLICY_DOC_URL` — `"docs/guides/developer/mock-data-policy.md"`

Both lint rules import from this module. The inventory script also imports from it. One edit to the policy module propagates everywhere. The module lives inside `eslint-plugin-design` because that package owns the enforcement logic; the script imports it via workspace resolution (`eslint-plugin-design/src/mock-data-policy.js`).

**Reason:** The concept mandates one source of truth for permitted-mock-surface globs + forbidden-prefix set. Colocation with the lint rules avoids a cross-package dependency cycle (the script depends on the plugin, not the reverse).

### 2. Symbol-prefix rule disambiguation for `DEFAULT_*`

**Verdict:** Path filter. The `design/no-mock-data-symbol` rule flags `DEFAULT_*` symbols ONLY in files matching a closed set of "data provider" paths:

```ts
const DEFAULT_PREFIX_DATA_PATHS: readonly string[] = [
  "/fixtures/",
  "/data/",
  "/services/",
  "/routes/",
  "/layouts/",
  "/pages/",
];
```

If the file path contains any of these fragments AND the symbol starts with `DEFAULT_`, the rule fires. Files under `/hooks/`, `/components/`, `/lib/`, `/config/`, `/theme/` are exempt — their `DEFAULT_*` symbols are UI/config defaults (e.g. `DEFAULT_THEME`, `DEFAULT_DENSITY`).

Additionally, the rule unconditionally flags `DEFAULT_*` symbols whose name ends with `_DATA`, `_SETTINGS`, `_CONFIG` when the value is an object/array literal (regardless of path). This catches `DEFAULT_SETTINGS` in any location.

**Reason:** Path filter is the simplest mechanism that disambiguates correctly for the inventory's known offenders (`DEFAULT_SETTINGS` in `fixtures/app-shell-data.ts`, `DEFAULT_FOUNDER_ID` in `routes/threads.ts` and `routes/coach.ts`). A per-symbol allowlist would require manual curation for every new constant. A value-shape heuristic is too fragile (an object literal is common for both mock and config). Path + name-suffix is deterministic, verifiable by lint alone (concept hard rule 6), and catches the known offenders without false-positiving on `DEFAULT_THEME` in a hooks file.

### 3. Literal-id detector — script only, policy module provides the list

**Verdict:** The literal-id detection lives ONLY in `scripts/mock-inventory.ts`, NOT as an ESLint rule.

The `LITERAL_ID_STRINGS` array is exported from the shared policy module:

```ts
export const LITERAL_ID_STRINGS: readonly string[] = [
  "u-founder",
  "agent-unassigned",
  "founder@hyperidle.com",
];
```

The script does a simple regex search per-file for these strings (quoted: `"u-founder"` or `'u-founder'`). It reports them as `kind: "literal-id"` rows.

**Reason:** ESLint AST-based detection of arbitrary string literals requires visiting every Literal node in every file and regex-matching — viable but hostile to performance and produces confusing error messages for developers (a string literal is not "wrong" in the way a symbol name is). The inventory script already does a full file walk anyway, so regex search there is zero additional cost. The concept's hard rule 6 (verifiable by path alone) makes the script the natural home — literal-id detection is a path-scoped search, not a structural rule about declarations.

The M2 architect may add entries to `LITERAL_ID_STRINGS` if the inventory surfaces more.

### 4. Triage hint heuristic

**Verdict:** The script emits `triageHint` per row using this logic:

```
straight-swap:
  - kind === "literal-id" AND the string is "u-founder" or "founder@hyperidle.com"
    (replacement is auth context — obvious, exists as concept)
  - symbol name matches "FOUNDER_ID" or "DEFAULT_FOUNDER_ID"
    (same — auth context)
  - the file already imports from a hook in packages/web/src/hooks/ that fetches
    the same entity shape (heuristic: hook name contains the entity noun)

needs-contract:
  - symbol contains "SETTINGS" or "RAIL" or "COST"
    (no existing endpoint for these — M2 must design)
  - kind === "literal-id" AND the string is "agent-unassigned"
    (agent assignment service does not exist yet)

borderline:
  - symbol contains "FALLBACK" or "AVATAR"
    (visual fallback — M2 decides if it's real mock or empty-state vocab)
  - anything not matched above defaults to "borderline"
```

This is a heuristic. M2 overrides with authoritative triage. The script's hint is a time-saver, not a contract.

**Reason:** The concept states "Final triage decision is M2's call" — the script provides a first guess based on the known inventory from the 2026-05-09 snapshot. Simple string matching on symbol names is sufficient because the offender count is small (10 forbidden + 5 borderline) and the names are distinctive. No import-graph analysis needed for M1.

### 5. Inventory format and gitignore

**Verdict:** Use `git add -f` (force-add) for the inventory artifacts. Do NOT modify `.gitignore`.

The repo already tracks many files under `plans/*` despite the gitignore rule — all `plans/L*/` files were force-added. This is the established pattern. The builder will:

```bash
git add -f plans/mock-data-purge/inventory.json
git add -f plans/mock-data-purge/inventory.md
git add -f plans/mock-data-purge/queue.md
```

Once force-added, git tracks the files normally (diffs appear in PRs, commits update them). The `plans/*` gitignore only prevents accidental `git add .` from picking up new untracked plans artifacts — which is the desired behavior.

The `--check` mode in the script compares against the tracked copy. If a PR changes offenders, the developer runs `bun run mock-inventory` to regenerate, then commits the updated files. CI's `--check` mode catches forgotten regenerations.

**Reason:** This matches the established codebase convention (dozens of `plans/L*/*.md` files are force-tracked). Modifying `.gitignore` with negation patterns for one subdirectory introduces fragility (git negation ordering is subtle) and would require testing the interaction with the existing wildcard. Force-add is the path of least surprise for the next agent.

### 6. CI drift check

**Verdict:** Add a new step to the verify orchestrator (`scripts/verify.ts`) as a new tool entry:

```ts
{
  name: "mock-inventory",
  cmd: "bun",
  args: ["run", "scripts/mock-inventory.ts", "--check"],
},
```

The `--check` flag makes the script:
1. Regenerate the inventory in memory.
2. Compare against the on-disk `plans/mock-data-purge/inventory.json`.
3. Exit 0 if identical, exit 1 if divergent (printing the diff to stderr).

Without `--check`, the script writes the files (developer workflow: `bun run scripts/mock-inventory.ts` to regenerate before committing).

The step runs a full walk every time (no caching). The walk scope is `packages/web/src/` + `packages/server/src/` — two directories, ~200 files total. At file-read + regex speeds in Bun this completes in <500ms. Caching would add complexity for negligible savings on a set this small.

The step is placed AFTER lint:eslint in the verify tool list (it depends on the same source files but is independent of lint results). It runs in the default `bun run verify` but is excluded from `--quick`.

A root `package.json` script alias is also added:
```json
"mock-inventory": "bun scripts/mock-inventory.ts",
"mock-inventory:check": "bun scripts/mock-inventory.ts --check"
```

**Reason:** Full walk is fast enough (<500ms) that caching is premature. The `--check` pattern mirrors common CI idioms (e.g. `prettier --check`, `biome check`). Placing it in verify means every `bun run verify` catches drift without developers needing to remember a separate command.

### 7. Per-line `eslint-disable` enforcement

**Verdict:** Use a custom meta-test (not the `eslint-comments` plugin). The test lives in:
`packages/eslint-plugin-design/src/__tests__/no-mock-data-disable.test.ts`

The test:
1. Uses the `Linter` API programmatically (same pattern as `fixtures.test.ts`).
2. Feeds it a fixture containing `// eslint-disable-next-line design/no-mock-data-symbol` WITHOUT a tracking id.
3. Asserts the lint still fires (the disable comment is NOT honored).
4. Feeds it a fixture with `// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #123`.
5. Asserts the lint IS suppressed (ESLint natively honors inline disables; we only test that the comment format is correct).

Wait — ESLint natively honors ALL `eslint-disable` comments regardless of format. To actually REJECT bare disables (without a tracking id), we need enforcement at the rule level or via the `eslint-comments` plugin.

**Revised approach:** The rules themselves use `meta.hasSuggestions: false` (no auto-fix). For enforcement of the tracking-id requirement on disable comments, we use ESLint's built-in `--report-unused-disable-directives` plus a custom approach:

Actually, the cleanest enforcement: **configure `linterOptions.reportUnusedDisableDirectives`** is not what we need. What we need is: "a disable comment for our rules must contain a tracking reference."

**Final verdict:** Add `reportDescriptionRequired` logic directly in both rules. When the rule fires, it checks if there is an `eslint-disable` directive on the same/previous line. If so, and the directive comment does not contain `tracked in #` (regex: `/tracked in #\d+/`), the rule reports ANYWAY (ignoring the disable). This is implemented by making the rule inspect the source code comments directly.

Actually, this is impossible — ESLint processes disable directives BEFORE the rule runs. A disabled rule never fires.

**Actual final verdict:** Use the `@eslint-community/eslint-plugin-eslint-comments` plugin rule `eslint-comments/require-description` with a custom pattern. BUT that adds a dependency.

**Simplest correct approach:** A Vitest meta-test that greps the codebase for `eslint-disable.*design/no-mock-data` and asserts every match contains `tracked in #\d+`. This is a static analysis test — no runtime enforcement needed because:
- The lint rules fire at `warn` in M1 (not error) — developers cannot "disable" a warning that doesn't block CI.
- When promoted to `error` in M4, the meta-test ensures no bare disables exist.

The regex for the meta-test:
```ts
const DISABLE_RE = /eslint-disable[^*]*design\/no-mock-data/;
const TRACKED_RE = /tracked in #\d+/;
```

The test walks `packages/web/src/` and `packages/server/src/`, finds all lines matching `DISABLE_RE`, and asserts each also matches `TRACKED_RE`. Failure message: `"eslint-disable for design/no-mock-data-* requires a tracking issue id (e.g. '-- tracked in #123')"`.

**Reason:** Adding a new eslint-comments plugin dependency for one rule is disproportionate. A Vitest test that greps source files is zero-dependency, fast, and catches the exact violation. It runs on every `bun run test` invocation. When M4 promotes to error, any bare disable would both fail this test AND leave the lint error un-suppressed (double enforcement).

### 8. Wired at `warn` only in M1

**Verdict:** Both rules are wired at `warn` in `eslint.config.js`. The config block targets `packages/web/src/**/*.{ts,tsx}` and `packages/server/src/**/*.ts` with the permitted-mock-surface globs as `ignores`.

The eslint.config.js diff adds ONE new block (not two — both rules share one block since they target the same file set with the same ignores):

```js
// M1 — Mock-data guard (warn-level baseline). Promotion to error is M4.
{
  files: ["packages/web/src/**/*.{ts,tsx}", "packages/server/src/**/*.ts"],
  ignores: [
    "packages/web/src/**/*.stories.tsx",
    "packages/web/src/**/__tests__/**",
    "packages/web/src/**/*.test.{ts,tsx}",
    "packages/web/src/**/*.spec.{ts,tsx}",
    "packages/web/src/**/__fixtures__/**",
    "packages/web/src/**/e2e/**",
    "packages/server/src/**/__tests__/**",
    "packages/server/src/**/*.test.ts",
    "packages/server/src/**/*.spec.ts",
    "packages/server/src/**/__fixtures__/**",
    "packages/server/src/**/e2e/**",
    "packages/server/src/**/seed*.ts",
  ],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
  plugins: { design },
  rules: {
    "design/no-mock-data-import": "warn",
    "design/no-mock-data-symbol": "warn",
  },
},
```

The existing L16 AC-3 `no-restricted-imports` block STAYS — it fires at `error` for `__fixtures__/` imports. The new `design/no-mock-data-import` rule layers on top with broader coverage (also catches `fixtures/` without the double-underscore prefix, and any other permitted-mock-surface path). They do not conflict — a file can trigger both; the L16 block gives a more specific message for `__fixtures__/` while the new rule gives the general policy message for `fixtures/` (like `packages/web/src/fixtures/app-shell-data.ts`).

**Reason:** The concept states "the existing block keeps working — the new rule layers on top." Wiring at `warn` means existing offenders produce warnings that name the file, symbol, and policy URL (AC validation scenario 1) without breaking CI. M4 promotes to error.

---

## File-by-file changes (dependency order)

### Phase A: Shared policy module

**File 1: `packages/eslint-plugin-design/src/mock-data-policy.ts`** (NEW)

```ts
/**
 * Shared source of truth for the mock-data guard.
 * Both ESLint rules and scripts/mock-inventory.ts import from here.
 * See: docs/guides/developer/mock-data-policy.md (the canonical human doc).
 */

/** Closed set of forbidden symbol-name prefixes in runtime production code. */
export const FORBIDDEN_PREFIXES: readonly string[] = [
  "MOCK_",
  "FAKE_",
  "STUB_",
  "SAMPLE_",
  "DUMMY_",
  "PLACEHOLDER_",
  "FALLBACK_",
  "DEMO_",
  "LEGACY_",
  "EXAMPLE_",
  "HARDCODED_",
];

/**
 * DEFAULT_* is forbidden only when the file path contains one of these
 * fragments (data-provider locations), OR when the symbol name ends with
 * one of DEFAULT_SUFFIX_TRIGGERS (regardless of path).
 */
export const DEFAULT_PREFIX_DATA_PATHS: readonly string[] = [
  "/fixtures/",
  "/data/",
  "/services/",
  "/routes/",
  "/layouts/",
  "/pages/",
];

export const DEFAULT_SUFFIX_TRIGGERS: readonly string[] = [
  "_DATA",
  "_SETTINGS",
  "_ID",
];

/** Closed set of file-path globs where mock data is legal. */
export const PERMITTED_MOCK_SURFACE_GLOBS: readonly string[] = [
  "**/__fixtures__/**",
  "**/__tests__/**",
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
  "**/*.stories.tsx",
  "**/e2e/**",
  "**/seed*.{ts,js}",
];

/**
 * Path fragments used for runtime detection (non-glob, for string matching).
 * A file whose path contains any of these is on the permitted surface.
 */
export const PERMITTED_SURFACE_PATH_FRAGMENTS: readonly string[] = [
  "/__fixtures__/",
  "/__tests__/",
  "/e2e/",
];

export const PERMITTED_SURFACE_SUFFIXES: readonly string[] = [
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  ".stories.tsx",
];

/** Hardcoded identity strings flagged by the inventory script. */
export const LITERAL_ID_STRINGS: readonly string[] = [
  "u-founder",
  "agent-unassigned",
  "founder@hyperidle.com",
];

/** Forbidden import path fragments (importer is a runtime file). */
export const FORBIDDEN_IMPORT_FRAGMENTS: readonly string[] = [
  "/__fixtures__/",
  "/fixtures/",
];

/** URL of the policy doc for actionable error messages. */
export const POLICY_DOC_URL = "docs/guides/developer/mock-data-policy.md";
```

### Phase B: Lint rules

**File 2: `packages/eslint-plugin-design/src/rules/no-mock-data-import.ts`** (NEW)

Rule shape mirrors `no-raw-actor-fetch.ts`:
- `meta.type: "problem"`
- `meta.messages.mockDataImport` — actionable message naming file, import path, policy URL, and where the import IS legal
- `create()` — visits `ImportDeclaration` nodes; checks if the import source matches `FORBIDDEN_IMPORT_FRAGMENTS`; reports if the current file is NOT on the permitted surface (determined by checking the filename against `PERMITTED_SURFACE_PATH_FRAGMENTS` and `PERMITTED_SURFACE_SUFFIXES`)

Key detail: the rule does NOT re-implement the L16 `no-restricted-imports` check for `__fixtures__/`. Both fire independently — the L16 block at `error`, this rule at `warn` with a broader message. This is intentional (layered enforcement).

**File 3: `packages/eslint-plugin-design/src/rules/no-mock-data-symbol.ts`** (NEW)

Rule shape:
- `meta.type: "problem"`
- `meta.messages.mockDataSymbol` — actionable message naming file, symbol name, matched prefix, policy URL, where it IS legal
- `create()` — visits `VariableDeclaration` (top-level `const`/`let`) and `ExportNamedDeclaration` wrapping variable declarations. For each declarator whose `id.name` starts with any `FORBIDDEN_PREFIXES` entry, reports.
- `DEFAULT_*` handling: checks the filename against `DEFAULT_PREFIX_DATA_PATHS` OR the symbol name ending with any `DEFAULT_SUFFIX_TRIGGERS` entry. If neither matches, `DEFAULT_*` is allowed.

**File 4: `packages/eslint-plugin-design/src/index.ts`** (EDIT)

Add imports and register both new rules:
```ts
import { noMockDataImport } from "./rules/no-mock-data-import.js";
import { noMockDataSymbol } from "./rules/no-mock-data-symbol.js";

// In the rules record:
"no-mock-data-import": noMockDataImport,
"no-mock-data-symbol": noMockDataSymbol,
```

### Phase C: ESLint config

**File 5: `eslint.config.js`** (EDIT)

Add the new config block (see decision 8 above for the full shape). Place it AFTER the existing L16 AC-3 block. The L16 block stays unchanged.

### Phase D: Inventory script

**File 6: `scripts/mock-inventory.ts`** (NEW)

Bun-runnable script. Structure:

```ts
#!/usr/bin/env bun
/**
 * Mock-data inventory generator (M1).
 * Walks packages/web/src/ and packages/server/src/, detects mock-data
 * offenders, emits inventory.json + inventory.md + queue.md.
 *
 * Usage:
 *   bun scripts/mock-inventory.ts          # write files
 *   bun scripts/mock-inventory.ts --check  # CI mode: compare, exit 1 on diff
 */

import { /* policy exports */ } from "../packages/eslint-plugin-design/src/mock-data-policy.js";
```

Core logic:
1. Walk `packages/web/src/` and `packages/server/src/` recursively (Bun's `Glob` or `fs.readdirSync` recursive).
2. Skip files on the permitted surface (path fragment + suffix check).
3. For each file, read content as string.
4. **Symbol detection:** Regex for top-level `const` or `export const` declarations matching forbidden prefixes. Capture symbol name, line number.
5. **Import detection:** Regex for `import` statements from forbidden paths (`/fixtures/`, `/__fixtures__/`).
6. **Literal-id detection:** Regex for quoted `LITERAL_ID_STRINGS` values.
7. For each hit, compute `triageHint` (decision 4 heuristic).
8. Compute `importerCount` by grepping for the symbol name across all files (simple count).
9. Emit `inventory.json` (sorted by path for stable diffs).
10. Emit `inventory.md` (markdown table grouped by package, area, triage hint).
11. Emit `queue.md` (checklist: `- [ ] path:symbol (triageHint)`).

`--check` mode: generate in memory, read on-disk, deep-compare JSON. If divergent, print added/removed rows to stderr and exit 1.

**File 7: `scripts/lib/mock-inventory-types.ts`** (NEW)

```ts
export interface InventoryRow {
  path: string;
  line: number;
  symbol: string;
  kind: "import" | "symbol" | "literal-id";
  shape: string;
  importerCount: number;
  triageHint: "straight-swap" | "needs-contract" | "borderline";
}
```

### Phase E: CI integration

**File 8: `scripts/verify.ts`** (EDIT)

Add `mock-inventory` to the `TOOLS` array:
```ts
{
  name: "mock-inventory",
  cmd: "bun",
  args: ["run", "scripts/mock-inventory.ts", "--check"],
},
```

Place it after `lint:eslint`, before `test`. Exclude from `QUICK_TOOLS` set.

**File 9: `package.json`** (EDIT)

Add script aliases:
```json
"mock-inventory": "bun scripts/mock-inventory.ts",
"mock-inventory:check": "bun scripts/mock-inventory.ts --check"
```

### Phase F: Gitignore

No `.gitignore` edit needed. Use `git add -f` for the three inventory artifacts (`plans/mock-data-purge/inventory.json`, `inventory.md`, `queue.md`). This matches the established pattern for all `plans/L*/*.md` files already tracked in the repo.

### Phase G: Tests

**File 11: `packages/eslint-plugin-design/src/__tests__/no-mock-data-import.test.ts`** (NEW)

Uses `Linter` API (same pattern as `fixtures.test.ts`):
- Positive: import from `../fixtures/app-shell-data` in a file named `pages/AppShell.tsx` triggers warning
- Positive: import from `../__fixtures__/work-bet-fixtures` in a file named `pages/WorkBet.tsx` triggers warning
- Negative: same import in a file named `pages/__tests__/AppShell.test.tsx` does NOT trigger
- Negative: same import in a file named `pages/__fixtures__/helper.ts` does NOT trigger
- Negative: import from `../hooks/useTheme` does NOT trigger
- Message: asserts the message contains the policy URL and the symbol/path

**File 12: `packages/eslint-plugin-design/src/__tests__/no-mock-data-symbol.test.ts`** (NEW)

Uses `Linter` API:
- Positive: `export const MOCK_USERS = []` in `pages/Users.tsx` triggers
- Positive: `const DEMO_FOUNDER_ID = "u-founder"` in `layouts/AppShell.tsx` triggers
- Positive: `const DEFAULT_SETTINGS = {}` in `fixtures/app-shell-data.ts` triggers (path contains `/fixtures/`)
- Positive: `const DEFAULT_FOUNDER_ID = "u-founder"` in `routes/threads.ts` triggers (path + suffix)
- Negative: `const DEFAULT_THEME = "dark"` in `hooks/useTheme.ts` does NOT trigger
- Negative: `const DEFAULT_DENSITY = "compact"` in `config/density.ts` does NOT trigger
- Negative: `const MOCK_BET = {}` in `__tests__/bet.test.ts` does NOT trigger (permitted surface)
- Allowlist: `const DEFAULT_WEIGHTS = {}` in `hooks/useWeights.ts` does NOT trigger (not a data path, no suffix trigger)
- Message: asserts actionable content (file, symbol, prefix, policy URL, where it IS legal)

**File 13: `packages/eslint-plugin-design/src/__tests__/no-mock-data-disable.test.ts`** (NEW)

The meta-test for tracking-id enforcement:
- Walks `packages/web/src/` and `packages/server/src/` for lines containing `eslint-disable.*design/no-mock-data`
- Asserts each such line also contains `tracked in #\d+`
- Initially passes (no disable comments exist yet — the rules are new)
- Proves the contract: future disable comments MUST include tracking id

**File 14: `scripts/__tests__/mock-inventory.test.ts`** (NEW)

Vitest tests for the inventory script logic (import the detection functions, not spawn the script):
- Triage heuristic: given symbol `FOUNDER_ID`, returns `straight-swap`
- Triage heuristic: given symbol `DEFAULT_SETTINGS`, returns `needs-contract`
- Triage heuristic: given symbol `FALLBACK_AVATAR`, returns `borderline`
- Literal-id detection: finds `"u-founder"` in a sample string
- Literal-id detection: does NOT find `"u-founder"` in a comment
- Permitted-surface filter: skips `__tests__/` paths
- Full integration: run against a small temp directory with known fixtures, assert row count and kinds

---

## Test plan

| AC (abbreviated) | Test file | Assertion shape |
|---|---|---|
| `design/no-mock-data-import` exists and fires | `__tests__/no-mock-data-import.test.ts` | Linter returns warning with ruleId `design/no-mock-data-import` for forbidden import |
| `design/no-mock-data-symbol` exists and fires | `__tests__/no-mock-data-symbol.test.ts` | Linter returns warning with ruleId `design/no-mock-data-symbol` for forbidden prefix |
| Permitted-surface paths NOT flagged | Both test files (negative cases) | Linter returns zero warnings for test/fixture/story paths |
| `DEFAULT_*` allowlist (theme/density) | `__tests__/no-mock-data-symbol.test.ts` | Zero warnings for `DEFAULT_THEME` in hooks path |
| `DEFAULT_*` flagged when in data path | `__tests__/no-mock-data-symbol.test.ts` | Warning for `DEFAULT_SETTINGS` in fixtures path |
| `scripts/mock-inventory.ts` emits inventory.json | `scripts/__tests__/mock-inventory.test.ts` | Output array contains expected rows |
| Script detects literal-id strings | `scripts/__tests__/mock-inventory.test.ts` | Row with `kind: "literal-id"` for `"u-founder"` |
| Script emits triageHint | `scripts/__tests__/mock-inventory.test.ts` | Rows have correct hint values per heuristic |
| Actionable error messages | Both lint test files | Message contains file path, symbol/import, policy URL, where-legal guidance |
| Per-line disable without tracking id rejected | `__tests__/no-mock-data-disable.test.ts` | Grep finds zero bare disables in source |
| Both rules wired at warn | `eslint.config.js` inspection + `bun run lint:eslint` | lint:eslint exits 0 (warnings don't fail); warnings appear in output |
| CI drift check fails on divergence | `scripts/__tests__/mock-inventory.test.ts` | `--check` mode exits 1 when inventory.json is stale |
| `bun run check` + `bun run lint` + `bun run test` green | CI / `bun run verify` | Exit 0 |

---

## Validation against AC list

| AC (from TRACK-M.md) | Satisfied by | Proven by |
|---|---|---|
| `design/no-mock-data-import` rule in `packages/eslint-plugin-design/src/rules/` | File 2 | File 11 |
| `design/no-mock-data-symbol` rule alongside | File 3 | File 12 |
| `scripts/mock-inventory.ts` walks packages, emits inventory.json/md/queue.md | File 6 | File 14 |
| Script detects literal-id strings as `kind: "literal-id"` | File 6 (literal-id regex) | File 14 (literal-id test case) |
| Lint rules + script emit actionable messages (file, symbol, policy URL, where-legal) | Files 2, 3, 6 | Files 11, 12, 14 |
| Per-line eslint-disable requires tracking issue id | File 13 (meta-test) | File 13 |
| Both rules wired at `warn` for web + server, with permitted-surface ignores | File 5 (eslint.config.js edit) | `bun run lint:eslint` produces warnings, exits 0 |
| CI step regenerates and fails on drift | Files 8, 9 (verify.ts + package.json) | File 14 (--check integration test) |
| Vitest tests cover positive/negative/allowlist/disable scenarios | Files 11, 12, 13, 14 | `bun run test` green |
| `bun run check` + `bun run lint` + `bun run test` all green | All files | `bun run verify` exit 0 |
| Lint rules produce warnings for every existing offender | Files 2, 3, 5 | Run `bun run lint:eslint` on main, observe warnings for known offenders |
| Script inventory.json is non-empty | File 6 | File 14 + manual run |

---

## Risks / open questions

1. **Force-add persistence.** Once `git add -f` tracks the inventory files, they stay tracked across branches. But if a branch deletes and re-creates the files, the builder must `git add -f` again. The CI `--check` mode will catch this (it reads the on-disk file, which will be missing if not tracked).

2. **`DEFAULT_*` false positives.** The path-filter + suffix-trigger heuristic is tuned to the current codebase. If a new `DEFAULT_FOO_DATA` constant appears in a legitimate config file, it will false-positive. Mitigation: the rule is at `warn`, so it's advisory not blocking. M4 promotion requires a clean audit.

3. **Import resolution in `design/no-mock-data-import`.** The rule checks the import specifier STRING, not resolved paths. An import like `import { x } from "../fixtures/app-shell-data"` is caught by the `/fixtures/` fragment match. An aliased import via `tsconfig paths` (e.g. `@fixtures/app-shell-data`) would NOT be caught. Current codebase has no such aliases — verify at M4.

4. **Seed file detection.** The globs include `**/seed*.{ts,js}` as permitted surface. The ESLint `ignores` array in the config block does NOT include a server seed pattern because the only seed file is `packages/db/src/seed.ts` (outside the rule's `files` scope of `packages/server/src/**`). If a seed file moves into `packages/server/src/`, the ignores must be updated. Low risk — seed belongs in `packages/db/`.

5. **`importerCount` accuracy.** A simple grep for the symbol name across all files may over-count (e.g. `FOUNDER_ID` appears in comments, strings, or unrelated variables). Acceptable for a triage hint — not load-bearing. M2 does authoritative analysis.

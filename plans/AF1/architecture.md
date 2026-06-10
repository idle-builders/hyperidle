# AF1 Architecture Plan — Make the typecheck gate real and self-protecting

## Required reading

- `.pipeline/work-packages/TRACK-AF.md` (AF1 section)
- `tsconfig.json` (root)
- `packages/*/tsconfig.json` (all 11 packages)
- `scripts/verify-attest.ts`
- `scripts/check-attestation.ts`
- `.github/workflows/ci.yml`
- `package.json` (root, scripts section)

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Impact |
|---|---|---|
| Root tsconfig has `"include": []` | Confirmed. `tsc --noEmit -p tsconfig.json` compiles nothing, exits 0. | Root cause confirmed. |
| Root references list 9 packages, missing web and pipeline | Confirmed. `references` has shared, db, server, fabric, design-system, eslint-plugin-design, api-contract, desktop, eval. web and pipeline absent. | Gate discovers packages dynamically (glob), so this gap is irrelevant. |
| web is `composite: false` | Confirmed. Also pipeline is `composite: false`. Both set `declaration: false, declarationMap: false`. | Cannot use `tsc -b` alone; need per-package `tsc --noEmit`. |
| ~1,861 errors exist | Actual own-error count (after filtering reference noise): **4,474 total across 10 broken packages** (see table below). The spec's ~1,861 was from `tsc -b --noEmit` which stops early on dependency failures. | Exception list is larger than spec estimated; quarantine still works. |
| CI validates attestation, not tsc directly | Confirmed. CI runs `npx tsx scripts/check-attestation.ts` with `VERIFY_SECRET`. No tsc in CI. | AC2 ("CI fails") is satisfied transitively: broken check -> no attestation -> CI fails. No CI changes needed. |
| `npm run check` is `tsc --noEmit -p tsconfig.json` | Confirmed in root `package.json`. | Will be replaced with the gate script. |
| verify chains: check && lint && knip && ... | Confirmed. check is the first step in verify. | Gate script replaces check; verify chain is unchanged. |

## Ground truth: per-package error counts

Methodology: `tsc --noEmit -p packages/<pkg>/tsconfig.json`, then filter output to only errors in files matching `^packages/<pkg>/` and exclude error codes TS6305, TS6307, TS6059 (cross-reference resolution noise that belongs to the referenced package, not the consumer).

| Package | Own errors | Status | AF drain |
|---|---|---|---|
| `api-contract` | 0 | CLEAN | -- |
| `shared` | 155 | BROKEN | AF2 |
| `db` | 2 | BROKEN | AF2 |
| `design-system` | 23 | BROKEN | AF2 |
| `desktop` | 3 | BROKEN | AF2 |
| `eslint-plugin-design` | 72 | BROKEN | AF2 |
| `eval` | 20 | BROKEN | AF2 |
| `fabric` | 173 | BROKEN | AF3 |
| `server` | 3,780 | BROKEN | AF4 |
| `web` | 235 | BROKEN | AF5 |
| `pipeline` | 11 | BROKEN | AF2 (leaf) |

**Total own errors: 4,474.** The api-contract package is clean and will NOT be on the exception list.

## Architecture decisions

### Decision 1: Invocation mechanism — per-package fan-out script

**Rejected alternative A: `tsc -b --noEmit` from root.**
Build mode resolves references correctly (no TS6305 noise) but has two fatal flaws: (1) it stops checking downstream packages when an upstream dependency has errors, so server shows only 2 errors instead of 3,780 — the quarantine cannot give per-package verdicts; (2) web and pipeline are `composite: false` and cannot be `tsc -b` targets at all.

**Rejected alternative B: Fix root `include` to glob all source.**
Would create a single flat compilation that ignores package boundaries. Per-package quarantine is impossible. Also conflicts with per-package `rootDir` settings.

**Chosen: A custom TypeScript script (`scripts/typecheck-gate.ts`)** that:
1. Discovers packages dynamically by globbing `packages/*/tsconfig.json`.
2. Reads the exception list from `typecheck-debt.json`.
3. For each discovered package, spawns `tsc --noEmit -p packages/<pkg>/tsconfig.json`.
4. Filters each package's stderr to count only own-package errors (files matching `packages/<pkg>/`) excluding reference-noise codes (TS6305, TS6307, TS6059).
5. Guards against tsc crashes: if exit code is non-zero but zero own errors were parsed, treats the package as CRASHED (always fails).
6. For non-excepted packages: any own error -> gate fails.
7. For excepted packages: own errors are counted and reported but tolerated.
8. Reports a summary table at the end.
9. Exits 0 if all non-excepted packages are clean; exits 1 otherwise.
10. Detects stale exception entries (excepted package with 0 own errors) and fails with an actionable fix message.

**Why this wins:** Aligns perfectly with AF2-AF5's per-package drain order. Each package gets an independent verdict. The exception list is a list of package names. Dynamic package discovery means the gate is self-maintaining -- adding or removing a package directory is automatically reflected. The script is ~100 lines, uses only Node.js child_process and fs/glob, no external dependencies.

**Performance:** N sequential `tsc --noEmit` invocations (currently 11 packages). Each takes 2-8 seconds (tsc parses the full project each time). Total: ~30-60 seconds. Parallelization is possible but unnecessary — `npm run check` is already a blocking gate step and 60 seconds is acceptable. If needed later, packages without mutual dependencies can be parallelized.

### Decision 2: Exception list shape — `typecheck-debt.json`

```typescript
// typecheck-debt.json — root of repository
{
  "$schema": "./scripts/typecheck-debt.schema.json",  // optional, for IDE support
  "description": "Packages with known type errors, quarantined by AF1. Drained by AF2-AF5.",
  "packages": {
    "shared":                { "owner": "AF2", "errors": 155, "note": "noUncheckedIndexedAccess in tests + toon-codec" },
    "db":                    { "owner": "AF2", "errors": 2,   "note": "test-utils PgliteDatabase type" },
    "design-system":         { "owner": "AF2", "errors": 23,  "note": "ThreadShell implicit any + shared ref" },
    "desktop":               { "owner": "AF2", "errors": 3,   "note": "menu template + credential validator" },
    "eslint-plugin-design":  { "owner": "AF2", "errors": 72,  "note": "test-fixtures missing JSX types" },
    "eval":                  { "owner": "AF2", "errors": 20,  "note": "seeding + types shared refs" },
    "fabric":                { "owner": "AF3", "errors": 173, "note": "attention-scoring, writeback, types" },
    "server":                { "owner": "AF4", "errors": 3780,"note": "largest cluster — routes, middleware, tests" },
    "web":                   { "owner": "AF5", "errors": 235, "note": "props mismatches, test-setup, shared refs" },
    "pipeline":              { "owner": "AF2", "errors": 11,  "note": "runner-otel test, skill-frontmatter" }
  }
}
```

**Shape rationale:**
- `packages` is a Record<string, entry>. Key = package directory name (not npm scope). Machine-readable, greppable, diff-reviewable.
- `owner` = which AF workpackage drains this package. Informational, not enforced by the gate.
- `errors` = error count at time of quarantine. Informational — the gate does not enforce the count, only presence/absence on the list. This lets AF2-AF5 make partial progress without updating the count on every commit.
- `note` = human-readable summary of what's broken. Informational.

The gate reads `Object.keys(json.packages)` to get the excepted set. That's it. The metadata is for humans and the AF2-AF5 builders.

**Why JSON, not YAML or a tsconfig `exclude`:**
- JSON is natively parseable by the gate script with zero dependencies.
- YAML needs a parser dependency.
- tsconfig `exclude` patterns would be a different mechanism (file-level suppression) that doesn't match the package-level quarantine model.

### Decision 3: Gate semantics

1. **Non-excepted package with any own error -> FAIL.** (AC2)
2. **Excepted package with own errors -> PASS (tolerated).** Errors are reported in the summary but do not fail the gate.
3. **Excepted package with zero own errors -> FAIL (stale entry).** (Good hygiene ratchet.) Once a package is clean, its entry MUST be removed from the exception list. The failure message tells the user exactly what to do: `"Remove '<name>' from typecheck-debt.json — it has zero type errors."` This prevents the list from growing stale and makes AF2-AF5 completion mechanically verifiable.
4. **Removing a still-broken package -> FAIL.** (AC5) Falls out naturally: the package is no longer excepted, so rule 1 applies.
5. **tsc crash (exit non-zero, zero parsed own errors) -> FAIL.** If tsc crashes (OOM, missing/invalid tsconfig, internal compiler error) it may produce zero parseable error lines. Without this guard, the gate would count 0 errors and incorrectly PASS a non-excepted package. The crash guard treats this as FAILED regardless of exception status, and surfaces tsc's raw output so the developer can diagnose the root cause. This rule takes priority over rules 1-3: a crashed package is always a failure, never quarantined or passed.

**Stale-entry detection risk analysis:** Could a package be "clean" in one run and "broken" in another due to non-determinism? No. TypeScript type-checking is deterministic given the same source. The only risk is a race between a fix commit and the exception-list update — but that's a single-commit operation, not a real risk.

### Decision 4: CI wiring — no changes needed

The CI pipeline (`ci.yml`) validates the HMAC-signed attestation from `npm run verify`. The attestation is generated after the full verify chain succeeds, which includes `npm run check` as its first step. If `check` fails, `verify` fails, no attestation is produced, and CI fails with "no attestation found."

The attestation's `tools` array includes `"check"` which already corresponds to the typecheck step. The attestation's `sha` field and the `git diff --name-only` check in `check-attestation.ts` ensure no source changes sneak in after verify.

**Confirmation:** AC2 ("CI fails on a new error") is satisfied without any CI changes.

### Decision 5: `npm run check` rewiring

Current: `"check": "tsc --noEmit -p tsconfig.json"`

New: `"check": "npx tsx scripts/typecheck-gate.ts"`

The gate script replaces the direct tsc invocation. It produces human-readable output (a summary table) and exits 0/1. The `verify` chain (`check && lint && ...`) continues to work unchanged.

### Decision 6: Dynamic package discovery (not hardcoded)

**Decision:** The gate discovers packages by globbing `packages/*/tsconfig.json` at runtime. It does NOT maintain a hardcoded array of package names.

**Rejected alternative:** A hardcoded `ALL_PACKAGES` array with a disk-divergence guard that fails if any directory exists on disk but is missing from the array. This was the original design. The reviewer correctly observed that dynamic discovery is strictly simpler: it is self-maintaining, cannot diverge from reality, and eliminates the guard entirely. Adding a new package to the monorepo automatically brings it under the gate with zero manual steps.

**Why not hardcode + guard:** The guard exists solely to compensate for the hardcoded list's staleness risk. Dynamic discovery removes both the problem and the compensating control. The only benefit of a hardcoded list would be explicit opt-in semantics (a new package must be manually added to be checked), but that is an anti-feature for a typecheck gate: every package with a tsconfig SHOULD be checked. If a package genuinely needs to be excluded, that is a different mechanism (an explicit exclusion list, not an implicit inclusion list).

**Validation for `typecheck-debt.json` consistency:** After discovering packages, the gate validates that every key in `typecheck-debt.json` corresponds to an actual package directory. If an entry names a package that no longer exists, the gate fails with a clear message. This catches stale debt entries after package renames or removals.

---

## Binding contract for AF2-AF5 builders

> **When you drain a package to zero type errors, you MUST remove its entry from `typecheck-debt.json` in the same commit.** If you don't, `npm run check` will fail with a stale-entry error.

This is enforced mechanically by gate rule 3: an excepted package with zero own errors causes the gate to exit 1. The failure message tells you exactly what to do:

```
STALE quarantine entry: "<package>" has 0 type errors.
Remove it from typecheck-debt.json in this commit. Example:
  jq 'del(.packages["<package>"])' typecheck-debt.json > tmp && mv tmp typecheck-debt.json
```

The stale-entry ratchet is not optional. It exists so that the debt list is always an accurate snapshot of remaining work. AF2-AF5 builders: plan for this step when you complete a package.

---

## Type signatures and file shapes

### `scripts/typecheck-gate.ts`

```typescript
#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// -- Types --

interface DebtEntry {
  owner: string;
  errors: number;
  note: string;
}

interface DebtFile {
  description: string;
  packages: Record<string, DebtEntry>;
}

interface PackageResult {
  name: string;
  ownErrors: number;
  excepted: boolean;
  crashed: boolean;       // tsc exited non-zero but produced 0 parseable errors
  errorLines: string[];   // first N lines for context on failure
  rawOutput: string;      // full tsc output — surfaced on crash for diagnosis
}

// -- Constants --

const REFERENCE_NOISE_CODES = ["TS6305", "TS6307", "TS6059"];

// ALL_PACKAGES is discovered dynamically at startup — see Decision 6.

const DEBT_FILE = "typecheck-debt.json";
const MAX_ERROR_LINES = 10;  // show first N errors per failing package
```

**Gate script pseudocode:**

```
1. Discover packages dynamically:
   allPackages = glob("packages/*/tsconfig.json")
     .map(path => path.split("/")[1])   // extract directory name
     .sort()
   If allPackages is empty, exit 1 ("no packages found").
2. Read typecheck-debt.json -> exceptedSet = Set of package names.
   Validate: every key in exceptedSet must exist in allPackages.
   If any excepted package has no matching directory, exit 1
   ("typecheck-debt.json references unknown package '<name>'").
3. results: PackageResult[] = []
4. For each pkg in allPackages:
   a. Run: tsc --noEmit -p packages/<pkg>/tsconfig.json
      Capture stdout+stderr as text. Record the exit code.
   b. Parse lines matching /error TS\d+/.
   c. Filter to lines starting with packages/<pkg>/ (own-file filter).
   d. Filter out lines matching any REFERENCE_NOISE_CODES.
   e. Count remaining = ownErrors.
   f. CRASH GUARD: If exitCode !== 0 AND ownErrors === 0, the tsc
      process failed without producing parseable type errors (e.g. OOM,
      missing tsconfig, internal compiler error). Mark the package as
      CRASHED — store the raw tsc output for reporting. A crashed
      package always counts as FAILED regardless of exception status.
   g. Store PackageResult { name, ownErrors, excepted, crashed, errorLines, rawOutput }.
5. Evaluate results:
   - crashedPackages = results where crashed === true
   - failedNonExcepted = results where !crashed && !excepted && ownErrors > 0
   - staleExcepted = results where !crashed && excepted && ownErrors === 0
6. Print summary table:
   Package             Errors   Status
   api-contract             0   PASS
   shared                 155   QUARANTINED (AF2)
   ...
   [any crashed]                CRASHED (tsc did not produce type errors)
   [any failing non-excepted]   FAIL
   [any stale excepted]         STALE — see fix instructions below
7. If crashedPackages.length > 0:
   For each crashed package, print its raw tsc output.
   Print "tsc crashed for the above packages. Fix the underlying issue
   (missing tsconfig, OOM, internal error) before the gate can evaluate them."
   Exit 1.
8. If failedNonExcepted.length > 0:
   Print the error lines for each failed package (up to MAX_ERROR_LINES).
   Exit 1.
9. If staleExcepted.length > 0:
   Print "Stale quarantine entries: <names>.
   These packages now have zero type errors — remove them from
   typecheck-debt.json in this commit. Example:
     jq 'del(.packages[\"<name>\"])' typecheck-debt.json > tmp && mv tmp typecheck-debt.json"
   Exit 1.
10. Exit 0.
```

### `typecheck-debt.json` (root of repository)

See Decision 2 above for the exact contents.

### `package.json` script change

```diff
-    "check": "tsc --noEmit -p tsconfig.json",
+    "check": "npx tsx scripts/typecheck-gate.ts",
```

No other script changes. `verify`, `verify:quick`, and all other scripts that chain through `check` are unchanged.

## Verification methods

| AC | Criterion | Verification |
|---|---|---|
| AC1 | `npm run check` type-checks every package including web | **By construction:** The gate discovers packages dynamically by globbing `packages/*/tsconfig.json` -- it cannot miss a package. **Integration test:** Run `npm run check` on the clean branch; verify stdout mentions all 11 package names in the summary table. |
| AC2 | Type error in non-excepted file -> check exits non-zero, CI fails | **Integration test:** Add `const x: string = 123` to `packages/api-contract/src/index.ts` (the only non-excepted package), run the gate script, assert exit code 1 and the file is named in output. CI fails transitively via attestation (confirmed by architecture analysis — no CI change needed). |
| AC3 | Exception list enumerates exactly the broken units | **Static verification:** The `typecheck-debt.json` file is the single source of truth. Its contents match the ground-truth table from this plan. The gate script reads only this file. An observer reads it and knows precisely what debt remains. |
| AC4 | `npm run verify` passes on the clean branch | **Integration test:** Run `npm run verify` on the clean branch (after all AF1 changes). Assert exit 0. |
| AC5 | Removing a still-broken unit from the list -> check fails | **Integration test:** Remove `"shared"` from `typecheck-debt.json`, run gate script, assert exit code 1. Shared has 155 own errors so it must fail. |
| (Extra) | Stale entry detection | **Integration test:** Add a fake package `"api-contract"` to `typecheck-debt.json` (it has 0 errors), run gate script, assert exit code 1 with "stale" message. |
| (Extra) | Crash guard | **Integration test:** Temporarily corrupt a package's `tsconfig.json` (e.g., write `{{{` to `packages/api-contract/tsconfig.json`), run gate script, assert exit code 1 with "CRASHED" in output and raw tsc error surfaced. Restore the file after. |

### Validation scenarios (from spec)

| Scenario | How to validate |
|---|---|
| Add `const x: string = 123` to a non-excepted file -> exits non-zero, names file | Manually inject into `api-contract/src/index.ts`, run `npx tsx scripts/typecheck-gate.ts`, verify exit 1 + file named. |
| Same error inside an excepted unit -> check passes, unit stays on list | Inject into `packages/shared/src/index.ts`, run gate, verify exit 0 + shared shows as QUARANTINED. |
| `npm run verify` on clean branch -> passes | Run `npm run verify`, assert exit 0. |
| Remove still-broken package from list -> check fails | Remove `"shared"` from `typecheck-debt.json`, run gate, verify exit 1. |
| Corrupted tsconfig -> crash guard fires | Write `{{{` to `packages/api-contract/tsconfig.json`, run gate, verify exit 1 with CRASHED status. Restore. |

## Security and abuse cases

| Concern | Applicability | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A — no API endpoints touched. Pure build tooling. | -- |
| Input-trust boundary | N/A — gate script reads only a local JSON file and tsc output. No untrusted input. | -- |
| Secret-handling | N/A — no credentials involved. The attestation HMAC secret is handled by existing `verify-attest.ts`, unchanged. | -- |
| Path-traversal | N/A — no path input from users. Package names are hardcoded. | -- |
| SSRF | N/A — no outbound requests. | -- |
| Attestation forgery | Already handled. Existing HMAC-signed attestation prevents forging a "passed" result. Gate script failure -> no attestation -> CI blocks. No change needed. | -- |

## Protected tests

```
protectedTests: []
```

No existing test files are modified. AF1 creates new files only.

## Shared files

```
sharedFiles:
  - package.json          # "check" script changes
  - typecheck-debt.json   # new file, but AF2-AF5 will modify it (removing entries)
```

## Migrations

No renames, removals, or moves of existing symbols. The only change to an existing file is the `check` script in `package.json`.

## Risks and ambiguities

1. **Performance.** 11 sequential tsc invocations may take 30-60 seconds. This is acceptable for a gate. If it becomes a bottleneck, packages without mutual references can be parallelized (shared, eslint-plugin-design, api-contract can run in parallel; downstream packages run after their deps).

2. **TypeScript version.** The gate uses `tsc --noEmit` on composite tsconfigs. In TypeScript 6.0.3 (current), this works — `--noEmit` silently ignores `composite: true` for that run. If a future TypeScript version rejects this combination, the fix is to add `--composite false` to the per-package invocation (TS 5.x added this flag). Low risk.

3. **Error-line parsing.** The gate matches `error TS\d+` in tsc output. TypeScript's error format has been stable for many major versions. If it changes, the regex is a single line to update. Low risk.

4. **Pipeline package.** Pipeline is `composite: false` like web, and is absent from root `references`. It has 11 own errors. The spec mentions "10 real packages" but there are actually 11 (pipeline is the 11th). Dynamic discovery includes it automatically. Pipeline's errors will be drained by AF2 since it is a leaf package with only shared as a dependency.

5. **TS6133 ("declared but never read") in the noise filter.** TS6133 is a real error (unused variable), not reference noise. It is NOT filtered. Only TS6305/TS6307/TS6059 are filtered. This is correct: TS6133 belongs to the package where the unused variable is declared.

6. **Crash guard false positives.** The crash guard triggers when tsc exits non-zero with zero parsed own errors. Could this happen for a legitimately clean package? In theory, if a package has ONLY reference-noise errors (TS6305/TS6307/TS6059), the gate would filter all of them out, leaving ownErrors=0, while tsc's exit code is 1. This would trigger the crash guard. However, reference-noise errors are already filtered correctly (they belong to dependencies, not this package) and a package whose only tsc output is reference noise genuinely has zero own errors. **Mitigation:** The crash guard checks `ownErrors === 0` against the *raw* parsed error count (before filtering), not the filtered count. If tsc produced ANY parseable error lines (even filtered ones), it is not a crash. The crash guard fires only when tsc exits non-zero with zero parseable lines at all.

7. **Dynamic discovery includes unexpected directories.** If someone creates a `packages/experiments/tsconfig.json` directory, the gate will discover and check it. This is the correct behavior: every package with a tsconfig should be type-checked. If a directory should be excluded, that is a deliberate decision that should be handled by not giving it a tsconfig, not by relying on a hardcoded whitelist.

## Ordered task list for the builder

### Task 1: Create `typecheck-debt.json`

**File:** `typecheck-debt.json` (repository root)

**Contents:** The exact JSON from Decision 2 above. 10 entries (all packages except api-contract). Error counts and notes from the ground-truth table.

**Verify:** File exists, is valid JSON, contains exactly the 10 broken package names.

### Task 2: Create `scripts/typecheck-gate.ts`

**File:** `scripts/typecheck-gate.ts`

**Behavior:** As described in the pseudocode above. The script:
- Discovers packages dynamically by globbing `packages/*/tsconfig.json` (see Decision 6).
- Reads `typecheck-debt.json` from the repository root (relative to `process.cwd()`).
- Validates that every key in `typecheck-debt.json` maps to a discovered package directory.
- For each discovered package, runs `tsc --noEmit -p packages/<pkg>/tsconfig.json` via `execSync`, capturing combined stdout+stderr and recording the exit code.
- Filters error lines to own-package files, excludes TS6305/TS6307/TS6059.
- Counts own errors per package.
- **Crash guard:** If tsc exits non-zero AND zero own errors were parsed, marks the package as CRASHED and captures the raw tsc output for diagnosis.
- Prints a summary table to stdout.
- Fails if any package crashed, any non-excepted package has own errors, or any excepted package has zero own errors (stale).
- On crash failure, prints raw tsc output for each crashed package.
- On stale failure, prints an actionable fix message: which entries to remove and a jq example command.
- On type-error failure, prints the first N error lines for each failing package for context.

**Key implementation details:**
- **Dynamic discovery:** Use `fs.readdirSync("packages", { withFileTypes: true })` to list directories, then filter to those containing a `tsconfig.json`. Sort alphabetically for deterministic output. No hardcoded package list.
- Use `execSync` with `{ encoding: "utf-8", stdio: "pipe" }` and catch the non-zero exit — tsc exits 1 on errors, but the gate script must not crash on that. Wrap in try/catch and read `error.stdout` / `error.stderr` from the thrown error object (Node's `execSync` throws on non-zero exit and attaches the output to the error). **Record the exit code** from `error.status` for the crash guard.
- **Crash guard logic:** After parsing, if `exitCode !== 0 && ownErrors === 0`, this means tsc failed but not with type errors the gate can parse. This is a crash (OOM, invalid tsconfig, internal error). Set `crashed = true`. A crashed package is ALWAYS a gate failure, regardless of exception status.
- The regex for matching errors: `/^(packages\/[^/]+\/.*): error (TS\d+):/`
- Package-name extraction from error path: split on `/`, take index 1.
- Error filtering: `!REFERENCE_NOISE_CODES.includes(tsCode) && pkgName === currentPackage`
- The shebang `#!/usr/bin/env tsx` matches existing scripts in the `scripts/` directory.
- Match existing script I/O style: `process.stderr.write` for status/progress messages (like `verify-attest.ts`), `process.stdout.write` for the summary table.
- **Missing-file guard:** If `typecheck-debt.json` does not exist, exit 1 with a clear message ("typecheck-debt.json not found -- create it or run AF1 setup").
- **Orphaned debt entry guard:** If any key in `typecheck-debt.json` does not correspond to a discovered package, exit 1 with "typecheck-debt.json references unknown package '<name>' -- remove it or create the package".

**Verify:** Run `npx tsx scripts/typecheck-gate.ts` on the clean branch. Assert exit 0 and summary shows all 11 packages.

### Task 3: Update `package.json` check script

**File:** `package.json` (root)

**Change:**
```diff
-    "check": "tsc --noEmit -p tsconfig.json",
+    "check": "npx tsx scripts/typecheck-gate.ts",
```

**Verify:** `npm run check` now runs the gate script. Exit 0 on clean branch.

### Task 4: Validate all acceptance criteria

Run the four validation scenarios from the spec:

1. Add `const x: string = 123` to `packages/api-contract/src/index.ts`. Run `npm run check`. Assert exit 1, file named. Revert.
2. Add `const x: string = 123` to `packages/shared/src/index.ts`. Run `npm run check`. Assert exit 0 (shared is excepted). Revert.
3. Run `npm run verify` on the clean branch. Assert exit 0.
4. Remove `"shared"` from `typecheck-debt.json`. Run `npm run check`. Assert exit 1. Restore.

Also validate the stale-entry check:
5. Add `"api-contract": { "owner": "test", "errors": 0, "note": "test" }` to `typecheck-debt.json`. Run `npm run check`. Assert exit 1 with stale message. Restore.

### Task 5: Commit and push

- `git add typecheck-debt.json scripts/typecheck-gate.ts package.json`
- `git commit -m "feat(AF1): make typecheck gate real and self-protecting [skip ci]"`
- After full `npm run verify` passes, commit attestation and push.

## Appendix: Why not unit-test the gate script?

The gate script is a ~100-line build tool that shells out to `tsc`. Its correctness is defined by its exit code and output when run against the real codebase. A unit test that mocks `execSync` would test the mock, not the gate. The validation scenarios (Task 4) are the correct verification: they exercise the real gate against the real codebase with real tsc output.

If a future refactor makes the gate complex enough to warrant unit tests (e.g., extracting the error-parsing logic into a pure function), that's the time to add them — not now.

## Appendix: Error-code reference

| Code | Meaning | Filtered? | Why |
|---|---|---|---|
| TS6305 | Output file has not been built from source file | YES | Cross-package reference noise. The dependency's `.d.ts` hasn't been emitted because we use `--noEmit`. |
| TS6307 | File is not listed within the file list of project | YES | Cross-package reference noise. File belongs to a referenced project, not the current project. |
| TS6059 | File is not under rootDir | YES | Cross-package reference noise. Referenced project's source is outside the current project's rootDir. |
| All others | Real type errors | NO | These are genuine errors that belong to the package where the file lives. |

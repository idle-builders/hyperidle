# Architecture Critique: AF1

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:N/A DM:N/A N:9 MD:8 FMC:7 S:8 V:8

## Dimension Scores

### 1. Spec Alignment — 9/10

Every acceptance criterion maps to a plan task:
- AC1 (check every package incl. web) -> Task 2 (ALL_PACKAGES array with all 11), Task 3 (rewire check script). Verified: web and pipeline both in the hardcoded list.
- AC2 (new error in non-excepted file -> non-zero exit + CI fails) -> Decision 3 rule 1, Decision 4 (attestation-transitive CI failure). Verified: plan correctly identifies that no CI changes are needed.
- AC3 (exception list enumerates exactly what's broken) -> Task 1 (typecheck-debt.json with 10 entries). Verified: 10 packages match the ground-truth table; api-contract excluded as clean.
- AC4 (verify passes) -> Task 4 scenario 3.
- AC5 (removing still-broken unit -> fail) -> Decision 3 rule 1 (natural fallout). Verified: correct -- once removed from exception set, rule 1 catches it.

The plan introduces exactly one thing not directly asked for by any AC: the stale-entry ratchet (Decision 3 rule 3 -- excepted package with zero errors -> fail). This is a reasonable good-hygiene addition that serves AF2-AF5's drain workflow. It does not violate any AC and has a validation scenario. Not scope creep.

The plan's "error count" metadata in typecheck-debt.json (owner, errors, note fields) is informational-only -- the gate ignores it. This is fine: it serves AF2-AF5 builders without adding enforcement complexity.

**One gap:** The spec says "units (packages or files)" for the exception list granularity. The plan chose packages. This is spec-compliant (packages are a valid unit), but the plan should be more honest about the blast radius: a new error introduced into an already-excepted package (e.g., server with 3,780 existing errors) will not be caught by the gate. The plan acknowledges this implicitly ("errors are counted and reported but tolerated") but does not flag it as a known limitation or explain why file-level granularity was rejected. That said, given that AF2-AF5 drain these packages to zero, the window is shrinking and package-level is pragmatically correct.

### 2. Layer Integrity — 10/10

Pure build tooling. No runtime code, no layer crossings. The script lives in `scripts/`, reads a JSON file, shells out to tsc, and exits. It touches no packages' internals. The `package.json` script change is at the monorepo root. Perfect layer discipline.

### 3. API Contracts — N/A

No API endpoints touched. Correctly identified as N/A in the security section.

### 4. Data Model Alignment — N/A

No schema changes. No migrations. Correctly scoped.

### 5. Naming — 9/10

- `typecheck-gate.ts` -- honest name, says what it does.
- `typecheck-debt.json` -- clearly communicates that this is tracked debt, not a permanent config.
- `REFERENCE_NOISE_CODES` -- self-documenting constant.
- `ALL_PACKAGES` -- clear, though "ALL" is slightly misleading since it excludes the root.
- `PackageResult`, `DebtEntry`, `DebtFile` -- straightforward types.
- `ownErrors` -- clear distinction from cross-package reference noise.

No naming conflicts with existing domain terms.

### 6. Module Depth — 8/10

The gate script is a single-file tool with a small interface: run it, get exit 0 or 1 plus a summary table. Good depth -- significant logic (fan-out, filtering, attribution, stale detection) hidden behind a trivial interface.

The only concern is the hardcoded `ALL_PACKAGES` array. The plan includes a package-directory guard that fails if a new package exists on disk but not in the array. This is a correct self-protection mechanism, but it means every new package addition requires editing the script. The alternative (reading `packages/*/` from disk) would be simpler and more resilient. The plan chose the hardcoded list to make the gate's scope explicit. This is defensible but adds maintenance cost -- see WARNING below.

### 7. Failure-Mode Coverage — 7/10

**Strengths:**
- Missing `typecheck-debt.json` file -> exit 1 with clear message.
- New package on disk not in the array -> exit 1 with clear message (package-directory guard).
- Non-excepted package with errors -> exit 1.
- Excepted package with zero errors -> exit 1 (stale ratchet).
- tsc non-zero exit (normal for broken packages) -> caught via try/catch on execSync.
- Security/abuse cases correctly identified as N/A for build tooling.

**Gaps:**
- The plan does not specify behavior when tsc ITSELF fails to run (not type errors, but a crash -- e.g., missing tsconfig.json, broken node_modules, OOM). The execSync try/catch catches exit code 1, but what about exit code 2 or signals? Does the script treat any tsc failure as "has errors" or does it distinguish between "tsc found errors" (exit 1, has error output) and "tsc crashed" (exit 2 or signal, no parseable output)?
- The plan does not specify the behavior when `typecheck-debt.json` is malformed JSON (parseable but wrong shape -- e.g., missing `packages` key, or packages value is an array instead of an object).
- The plan does not address what happens if the error-line regex matches zero lines for a package that tsc reports as having errors (exit 1). This could happen if tsc's output format changes, resulting in a false "0 own errors" count and the gate passing when it shouldn't.

### 8. Simplicity / Over-Engineering Risk — 8/10

**Right-sized decisions:**
- Per-package fan-out script vs. tsc -b: justified by the web/pipeline composite:false constraint and the need for per-package verdicts. Not over-engineering -- it's the only approach that works.
- JSON over YAML: correct, zero-dependency parsing.
- Sequential execution over parallel: correct for now, with a noted optimization path.
- ~80 lines: proportionate to the problem.

**One concern:** The `errors` count field in typecheck-debt.json. The plan says "informational -- the gate does not enforce the count." This is clean. But it creates a maintenance question for AF2-AF5: builders making partial progress in a package will leave the count stale. The plan acknowledges this ("lets AF2-AF5 make partial progress without updating the count on every commit") which is the right call.

**Another concern:** The package-directory guard adds ~5 lines of complexity to catch a rare scenario (someone adds a 12th package without updating the gate). It's justified for self-protection, but the same goal could be achieved by reading `packages/*/` from disk instead of hardcoding -- which would be simpler AND remove the guard entirely. See WARNING below.

### 9. Verifiability — 8/10

Every AC has a concrete verification method with expected outcomes:
- AC1: assertion that ALL_PACKAGES matches disk + integration check that summary mentions all 11.
- AC2: inject error in api-contract, assert exit 1.
- AC3: static verification (read the file).
- AC4: `npm run verify` exit 0.
- AC5: remove shared, assert exit 1.
- Extra (stale): add api-contract to debt list, assert exit 1.

All scenarios are concrete and executable. The plan correctly argues against unit-testing the gate script with mocked execSync (appendix) -- the real validation is integration against the real codebase.

**Gap:** No test-first ordering. The plan's Task 4 (validate) comes after Tasks 1-3 (implementation). For build tooling this is acceptable -- you cannot run the gate until it exists. But the plan could name the validation scenarios earlier as the acceptance bar, then implement toward them.

**Protected tests: []** is correct -- no existing tests are modified.

---

## CRITICAL

(none)

## WARNING

### W1 — Error-line parsing has a false-negative risk on tsc crash vs. type errors
[plan: Decision 1, step 3.b-e; Task 2 key implementation details]

The plan's regex `/^(packages\/[^/]+\/.*): error (TS\d+):/` parses tsc's error output. When tsc exits non-zero because of type errors, this works. But tsc can also exit non-zero for other reasons (missing tsconfig, unresolvable project references, OOM). In those cases, the output may not match the regex, resulting in ownErrors=0. If the package is excepted, the stale-ratchet would then wrongly demand its removal. If the package is non-excepted, the gate would wrongly report 0 errors and pass.

The more dangerous case: tsc crashes for a non-excepted package, produces no parseable error lines, the regex matches nothing, ownErrors=0, the gate passes. The builder introduced a type error, but the gate says green.

Fix: After running tsc, if the exit code is non-zero AND ownErrors is 0 after filtering, treat this as a gate failure with a diagnostic message ("tsc exited with errors but no parseable type errors found for packages/<pkg> -- possible tsc crash or output format change"). This is a 3-line addition that closes the false-negative hole.

### W2 — Hardcoded ALL_PACKAGES vs. dynamic discovery
[plan: Decision 1, Task 2; the package-directory guard]

The plan hardcodes ALL_PACKAGES and adds a guard that fails if a new directory appears in `packages/`. This works but is backwards: the guard exists to compensate for the hardcoding. Reading `packages/*/` directories from disk would eliminate both the hardcoded list AND the guard, making the script simpler and self-maintaining. The only argument for hardcoding is "explicit is better than implicit," but the guard's existence proves the list WILL diverge from reality -- the guard just catches it loudly.

If the architect prefers hardcoding for explicitness, acknowledge this as a tradeoff and keep the guard. But consider that the guard adds a failure mode (false positive if a non-package directory appears under `packages/`) and maintenance burden (every new package requires editing two things: the gate script AND typecheck-debt.json if broken). Dynamic discovery + filtering for directories containing `tsconfig.json` would be more robust.

This is a WARNING, not CRITICAL, because the guard catches the divergence before it becomes silent.

### W3 — Stale-ratchet interaction with AF2-AF5 partial progress
[plan: Decision 3, rule 3]

The stale-ratchet (excepted + 0 own errors -> fail) requires that when a builder drains a package to zero errors, they MUST also remove it from `typecheck-debt.json` in the same commit. If a builder fixes the last error in `shared` but forgets to update the debt file, `npm run check` fails. This is by design -- but the plan should explicitly state this as a contract for AF2-AF5 builders: "When your package reaches zero own errors, remove it from typecheck-debt.json in the same commit or check will fail."

The plan's Decision 3 mentions "the builder must remove it" but does not flag this as a binding contract that downstream workpackage plans must incorporate. This matters because a builder who runs `npm run check` after fixing the last error, BEFORE removing the debt entry, will see a confusing failure. The error message ("Stale quarantine entries: <name>. Remove from typecheck-debt.json.") handles this, so the risk is confusion, not breakage. Still worth an explicit callout in the task list.

## SUGGESTION

### S1 — Clarify the blast-radius tradeoff of package-level exceptions
[plan: Decision 2, Decision 3]

The plan should add a one-sentence note in Decision 2 or Decision 3: "Package-level quarantine means a new error introduced into an already-excepted package (e.g., a new bug in server while it has 3,780 existing errors) will not be caught by the gate. This window shrinks as AF2-AF5 drain each package to zero. File-level quarantine was rejected because maintaining a list of ~300+ individual broken files creates merge-conflict pressure and provides little benefit given the packages will be fully drained within days."

### S2 — The plan's error count (4,474) vs. the spec's estimate (~1,861)
[plan: Plan reconciliation table]

The plan explains the discrepancy (spec's ~1,861 was from `tsc -b --noEmit` which stops early). This is good. But the discrepancy is 2.4x, which means the spec's "~1,861 pre-existing errors" claim (repeated in the AF1 workpackage text) is significantly wrong. The plan could note that AF2-AF5 scoping should use the plan's ground-truth counts (4,474 total), not the spec's estimate, to avoid under-budgeting.

### S3 — Consider a tsc exit-code sanity check
[plan: Task 2 pseudocode, step 3]

After tsc runs and before error-line parsing, check: if tsc exited 0 (clean), assert ownErrors will be 0 -- if regex parsing finds errors despite exit 0, something is wrong. If tsc exited non-zero, assert ownErrors > 0 after parsing (see W1). This bidirectional sanity check catches both false positives and false negatives from regex drift.

### S4 — Note that test files outside `include` paths are not checked
[plan: Plan reconciliation or Risks section]

Some packages (db, design-system, desktop) have `__tests__/` directories at the package root, outside their `include: ["src"]` path. These test files are not compiled by `tsc -p packages/<pkg>/tsconfig.json` and therefore not checked by the gate. This is a pre-existing condition (not introduced by AF1) and these files are vitest-compiled, but the plan's AC1 claim "type-checks every package" could be read as "type-checks every file." A brief note clarifying that the gate checks what each package's tsconfig includes -- not vitest-compiled test files outside that scope -- would prevent misunderstanding.

## What's Working Well

- **The plan reconciliation table is excellent.** Every assumption from the spec is verified against reality, with impact noted. This is how "spec vs. reality" should be documented -- the architect ran the commands, counted the errors, and corrected the spec's stale numbers. The ground-truth error table with per-package counts is the kind of evidence that makes a plan trustworthy.

- **The CI-transitive argument is sound and well-reasoned.** The plan correctly identifies that no CI changes are needed because the attestation chain already ensures check failure -> no attestation -> CI failure. The architect read `verify-attest.ts` and `check-attestation.ts`, verified the `tools` array includes `"check"`, confirmed the HMAC and `git diff --name-only` guards, and concluded AC2 is satisfied transitively. This saves the builder from unnecessary CI work and avoids touching a shared workflow file.

- **The rejected-alternatives section for Decision 1 is honest.** Both `tsc -b` and the root-include approach are rejected with specific, verifiable reasons (composite:false packages, early-stop on dependency errors). The reasons are not straw-manned -- they are real constraints confirmed by running the tool. This is what "design-it-twice" should look like for a forced decision.

---

**Verdict: READY FOR BUILDER.** Score 8/10. No CRITICAL findings. The three WARNINGs are edge-case hardening (W1 -- tsc crash false negative, W2 -- hardcoded list vs. dynamic discovery, W3 -- stale-ratchet contract for AF2-AF5). W1 is the most important: a 3-line guard against tsc crashes producing false greens. The builder should address W1 during implementation; W2 and W3 are judgment calls the architect can accept or reject.

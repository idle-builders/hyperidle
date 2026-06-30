# AT1 — Architecture: affected test selection across `test`, `verify`, e2e

Requirements: `.pipeline/work-packages/AT1/requirements.md`. Not manifest-registered (intentional).
North star: **verify runs the affected slice, not the whole giant suite. Full slice only at release.**

## Required reading (builder)

- `package.json` — `test`, `test:full`(new), `test:integration`, `test:all`, `test:e2e`, `test:e2e:full`(new), `verify`, `verify:release`(new).
- `packages/web/package.json` + `packages/web/playwright.config.ts` — e2e runner; webServer auto-starts vite:5179, `page.route()` mocking (no API server), `reuseExistingServer:!CI`.
- `scripts/verify-attest.ts` — attested legs + payload; add `scope` + e2e leg; make unit/integration legs scope-driven.
- `scripts/lib/attestation-floor.ts` — redefine the floor (presence → symmetry).
- `packages/db/src/__tests__/ar1-attestation-floor.test.ts` — the floor's unit-test home/pattern to extend.
- `scripts/check-attestation.ts` — `scope` (required) + `--require-scope` + swap floor call.
- `.github/workflows/release-guard.yml` — bump gate; add `--require-scope=full` step.
- `.github/workflows/ci.yml` — confirm CI runs **no** tests (validates attestation only); e2e stays out of CI (runs locally in verify-attest; attestation carries it).
- `docs/guides/developer/testing.md`, `useful-commands-reference.md` — DOC-CLASS:minor.

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan |
|---|---|---|
| `npm run test` = unit only | ✅ `vitest.config.ts` excludes `*.integration.test.*` | Affected on `test` |
| verify-attest runs unit via `npm run test`, integration directly | ✅ verify-attest.ts:79, :124-126 | Both become scope-driven |
| Per-harness floor reads integration JSON, trips on any-zero | ✅ `assertPerHarnessFloor` (attestation-floor.ts), called verify-attest.ts:177 + check-attestation.ts:179 | Replace with symmetry floor (D4) |
| HMAC covers whole payload minus `hmac` | ✅ check-attestation.ts:143-144 | `scope` signed automatically |
| `test:all` = "all tests" full | ⚠️ `test && test:integration`; `test`→affected would silently shrink it | Repoint → `test:full && test:integration` |
| e2e in verify/CI | ❌ NOT in verify, NOT in any workflow; 92 specs; local-only standing rule | **Add** e2e as a 3rd attested leg in verify-attest (local; CI validates attestation, never runs e2e — rule preserved) |
| Playwright supports affected | ✅ `--only-changed[=ref]` (≥1.46; on 1.61) | e2e leg uses `--only-changed=origin/main` |
| release-guard detects bump, has VERIFY_SECRET | ✅ bump; ❌ no VERIFY_SECRET | Add scope step + `VERIFY_SECRET` env |

## Decisions

### D1 — Full-mode = `VERIFY_SCOPE` env + per-leg `*:full` scripts
`verify` is an unchanged `&&` chain ending in verify-attest. verify-attest reads `process.env.VERIFY_SCOPE`: `"full"` → run the full command of each leg + stamp `scope:"full"`; else → affected command + `scope:"affected"`. Env threads through the unchanged chain; verify is local-only so inline env is safe (reject a CLI flag that would force a parallel chain). `verify:release` = `VERIFY_SCOPE=full npm run verify`.

### D2 — Enforce scope via `check-attestation.ts --require-scope=full`, called from release-guard
check-attestation already HMAC-verifies + parses the payload — the single authentic place to assert `scope`. Normal CI calls it flag-less (scope-agnostic). release-guard, when `bumped=='true'`, calls it `--require-scope=full` with `VERIFY_SECRET`. No duplicated bump logic, no cross-job trust gap. (Rejected: auto-detecting the bump inside check-attestation — pollutes the general gate, wrong on push-to-main.)

### D3 — Affected commands + empty-set
- unit: `vitest run --changed=origin/main --passWithNoTests`
- integration: `vitest run --config vitest.integration.config.ts --changed=origin/main --passWithNoTests` (+ the existing json reporter in verify-attest)
- e2e: `playwright test --only-changed=origin/main`
`--passWithNoTests` makes vitest's empty affected set exit 0. Playwright `--only-changed` is documented to exit early/0 when no test files changed (⚠️ confirm empirically — AC9; add `--pass-with-no-tests` if not). Base ref hardcoded `origin/main` (worktree-off-origin/main always has it — Risk R2).

### D4 — Floor redefinition: presence → **conditional symmetry + untagged guard** (founder spec; corrected post-critique)

**Critique B1 (verified against code):** my "every harness file fans across all lanes" premise is FALSE. Only **2 of 14** predicate-matched harness integration files emit `[harness:X]` buckets (`AR2-provision-real-session`, 6 tags; `AL7` uses the wrong describe wording `"codex CLI"` → likely 0 buckets). The other 12 (e.g. `AM2-real-harness-discovery`, which really does exercise all four binaries via `describe("codex")`/`describe("claude")`) populate global `agenticExecuted` but **zero** `byHarness` buckets — `extractAgenticCounts` keys only on `/\[harness:([a-z-]+)\]/` (attestation-floor.ts:98). So a naive `sum(byHarness)===0 → pass` is **blind** to any untagged harness file that ran, making the symmetry floor *weaker* than presence in affected mode.

**Corrected floor — `assertHarnessSymmetry(byHarness, agenticExecuted, supported)`:**
- `agenticExecuted === 0` → **pass** (no harness file in the affected slice; nothing ran).
- `agenticExecuted > 0` **and** `byHarness` has zero tagged buckets → **FAIL** ("a harness-facing test ran but emitted no `[harness:X]` buckets — tag it"). This is the **untagged guard**: it makes the blind case loud instead of a silent pass, forcing the file to be tagged before it can be relied on.
- `agenticExecuted > 0` **and** buckets present → **pass iff** every supported harness has count > 0 **and** `max === min`; else **fail** (unequal/missing lane = the AR2 silent-drop regression).

Replaces `assertPerHarnessFloor` at **both** call sites (verify-attest mint + check-attestation validate). Note it now takes the global `agenticExecuted` too (already returned by `extractAgenticCounts`).

**Honest guarantee statement (was overclaimed):** the per-harness symmetry guarantee covers **only `[harness:X]`-tagged files** — same as the presence floor did (it only ever verified AR2's lanes; the 12 untagged files were never in the per-harness guarantee, today or after). What AT1 changes: in **affected** mode the guarantee is active only when a tagged harness file is selected; the **full release run** (always selects AR2) restores it. This is the accepted affected/full tradeoff applied to the floor — **not** "strictly stronger" (that claim was wrong). The untagged guard ensures an affected run can't silently pass with a *non-tagged* harness file as its only harness coverage.

**Residual (B1, pre-existing AR2 debt — RESOLVED: DEFER).** The *mixed* case — a tagged file (AR2) co-selected with an untagged one — still hides the untagged file's per-harness breakdown. This residual exists in the current presence floor at full/release too (untagged files are never bucketed), so AT1 neither creates nor worsens it. **Founder decision: defer.** The remaining harness files are being migrated to proper `[harness:X]` setup by in-flight AR workpackages; because the floor keys on the tag, each migrated file is **auto-picked-up** by symmetry with no AT1 change. The untagged guard (hard-fail) stands — it nudges any untagged-only affected run toward tagging, aligned with the AR migration direction. No tagging migration is absorbed into AT1.

**Design-it-twice (rejected alt):** disable the floor entirely when `scope!=="full"`. Rejected — affected mode would then have *zero* harness guarantee even when a tagged file is selected; the untagged guard + conditional symmetry keeps affected honest for what it can see.

### D5 — Integration leg is affected too (+ empty-slice JSON fix — critique B2)
The redefined floor makes pruning the integration/harness leg safe. This is the **main efficiency win** (the real-LLM harness tail no longer runs on unrelated branches). Integration leg keeps its json reporter so the symmetry floor still reads counts from whatever ran.

**B2 — empty integration slice must NOT mint `status=failed`.** Today verify-attest.ts:134-153 treats a missing/unparseable integration JSON as `status=failed` (correct for full mode: "leg crashed"). Under affected selection an empty integration slice (`--changed` matches 0 integration files) exits 0 and **may not write a JSON file at all** (`--passWithNoTests` exits 0 but a no-suite run can skip flushing the reporter — version-dependent, unverified). The fix: **capture the integration leg's exit code separately** (already in the try/catch at :128-132). Then:
- leg exit 0 **and** JSON absent/empty → legitimate "0 selected": set `agenticExecuted=0`, `byHarness={}`, leave `status` unchanged (the corrected floor's `agenticExecuted===0 → pass` handles it). **Do not fail.**
- leg exit non-zero (crash/real failure) → `status=failed` as today, regardless of JSON.
This must be an explicit task + AC asserting the attestation is `status:"passed"` (not merely exit-0 of the bare command) on an empty integration slice.

### D6 — e2e becomes a third attested leg
verify-attest runs `test:e2e` (affected) / `test:e2e:full` (full) after integration; its exit code folds into `status`. e2e has no floor (not harness-bucketed). Runs **locally** inside verify (Playwright boots its own vite:5179); CI never runs e2e — it validates the attestation, so the "e2e never a GH-Actions job" rule holds. `ATTESTED_TOOLS = ["test","test:integration","test:e2e"]`.

⚠️ **Limitation (R3) — accepted (Option 1):** Playwright `--only-changed` selects by changed **test/spec files + their import graph**. Confirmed empirically: every e2e spec imports only `./fixtures` + Node builtins — **zero** imports from `packages/web/src`. e2e specs are black-box (browser nav + `page.route()` mocks), so a pure app-code change selects **no** e2e specs. **This is NOT a coverage hole:** a component edit is still caught in affected mode by its **vitest component test** (white-box, imports the component) — `BetThread.tsx` → `BetThread.test.tsx`. What affected mode defers to release is the full-journey *e2e*, not component coverage. Affected-e2e = "specs you edited (+ fixtures)"; journey e2e rides the **full** run at release. Rejected alternatives: coarse "any web src change → all 92 e2e" (kills small-verify on frontend work) and a bespoke route→spec map (fragile affected-engine). Document the boundary in `testing.md`.

### D7 — `scope` required, no back-compat; `partial`/`smartSkipped` untouched
`scope` always present; check-attestation fails on absent/invalid. Affected is **not** `partial` — `partial` stays `false`, `smartSkipped` `[]`; `scope` is the only new signal (don't trip check-attestation.ts:154).

## Vitest / Playwright semantics (verified)
- Vitest `--changed=<ref>` (docs, fetched 2026-06-30): module-graph reverse-dep selection from files changed vs ref; cross-package. `--changed` alone = uncommitted. ⚠️ uncommitted-vs-ref nuance non-load-bearing (clean tree at attest → full branch diff regardless; R1).
- Playwright `--only-changed[=ref]` (docs): "Only run test files that have been changed between 'HEAD' and 'ref'." Import-graph aware; git-only. Empty-set exit code → AC9 empirical confirm.

## Contracts

```ts
// scripts/lib/attestation-scope.ts  (NEW — pure, unit-tested)
export type VerifyScope = "affected" | "full";
export interface LegCommands { unit: string; integration: string; e2e: string; }
/** Resolve per-leg shell commands + recorded scope from VERIFY_SCOPE. */
export function resolveLegs(verifyScopeEnv: string | undefined): { legs: LegCommands; scope: VerifyScope };
//  "full" → full commands + scope:"full"; else → affected commands + scope:"affected"
/** Gate: error string if attestation scope fails the requirement, else null.
 *  required===undefined → null (scope-agnostic). scope must be a valid VerifyScope. */
export function assertScope(scope: string | undefined, required: VerifyScope | undefined): string | null;
```

```ts
// scripts/lib/attestation-floor.ts  — REPLACE assertPerHarnessFloor with:
/** Conditional symmetry + untagged guard (D4):
 *   agenticExecuted===0                       → null (nothing ran)
 *   agenticExecuted>0 && no tagged buckets     → error (untagged harness file ran — tag it)
 *   agenticExecuted>0 && buckets present       → null iff every supported harness >0 AND max===min, else error */
export function assertHarnessSymmetry(
  byHarness: Record<string, { executed: number; skipped: number }> | undefined,
  agenticExecuted: number,
  supported: readonly string[],
): string | null;
// keep extractAgenticCounts / VitestJsonResult unchanged.
```

```ts
// scripts/check-attestation.ts — Attestation gains (REQUIRED, no `?`):
scope: VerifyScope;
// argv: --require-scope=<affected|full> (default undefined). Validate scope ∈ {affected,full} (fail if absent/invalid),
// then assertScope(attestation.scope, requireScope). Swap assertPerHarnessFloor → assertHarnessSymmetry.
```

```jsonc
// package.json (final)
"test":          "vitest run --changed=origin/main --passWithNoTests",
"test:full":     "vitest run",
"test:all":      "npm run test:full && npm run test:integration",
"test:e2e":      "npm run -w @hyperidle/web test:e2e",          // web script becomes --only-changed=origin/main
"test:e2e:full": "npm run -w @hyperidle/web test:e2e:full",     // new web script: plain `playwright test`
"verify:release":"VERIFY_SCOPE=full npm run verify",
// packages/web/package.json:
//   "test:e2e":      "playwright test --only-changed=origin/main",
//   "test:e2e:full": "playwright test",
```

## Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | `resolveLegs("full")` → full commands + `scope:"full"`; `resolveLegs(undefined\|"affected"\|"")` → affected commands + `scope:"affected"` | Unit test of `attestation-scope.ts` |
| AC2 | `assertScope`: `(x,undefined)`→null; `("affected","full")`→string; `("full","full")`→null; `(undefined,"full")`→string; `("full",undefined)`→null | Unit test |
| AC3 | `assertHarnessSymmetry`: `agenticExecuted=0`→null; positive+no-buckets→string (untagged guard); all-equal-positive-buckets→null; one-harness-zero-others-positive→string; unequal positives→string. **Must subsume every adversarial case in `ar2-per-harness-floor.test.ts`** (codex-zero, missing-key, multi-zero) ported onto the new fn and proven still-failing | Unit test extending `ar1-attestation-floor.test.ts`; port `ar2-per-harness-floor.test.ts` cases |
| AC3b | Empty integration slice (`--changed` selects 0 integration files) yields an attestation with `status:"passed"`, `scope:"affected"`, `agenticExecuted:0` — NOT `status:failed` (critique B2) | Empirical: run verify on a branch whose diff reaches no integration test, read the minted JSON |
| AC4 | verify-attest writes `scope` into the signed payload; `VERIFY_SCOPE=full` ⇒ full legs + `scope:"full"`, else affected + `scope:"affected"` | Unit test on `resolveLegs` (AC1); real attestation = AC8 |
| AC5 | check-attestation rejects absent/invalid `scope`; `--require-scope=full` fails `scope:"affected"`, passes `scope:"full"` | Unit (assertScope) + empirical: signed affected attestation → `check-attestation --require-scope=full` exits 1; full → 0 |
| AC6 | release-guard runs `check-attestation --require-scope=full` only when `bumped=='true'`, with `VERIFY_SECRET`; bump detection reads the merge-base `package.json` (not PR head) so an affected attestation can't ride an undetected bump (critique H3) | Read workflow YAML; empirical: a crafted `scope:"affected"` attestation on a version-bump diff fails `check-attestation --require-scope=full` |
| AC6b | The release-guard scope step is wired as a required status check (single enforcement point — H3); normal CI `check-attestation` stays scope-agnostic | Document the ruleset requirement; flag to founder (ruleset changes are founder-only per repo rule) |
| AC7 | Harness symmetry floor enforced in both verify-attest (mint) and check-attestation (validate) via `assertHarnessSymmetry` | Grep both call sites use the new fn; unit AC3 covers logic |
| AC8 | Real `npm run verify` on this branch → `.verify-attestations/<sha>.json` with `scope:"affected"`, `status:"passed"`, symmetry floor satisfied for whatever harness tests ran | Empirical: run verify, read JSON |
| AC9 | Empty affected set exits 0 for each runner: vitest `--changed --passWithNoTests`; playwright `--only-changed` with no changed specs | Empirical: on a no-test-change branch run each leg, observe exit 0 (add `--pass-with-no-tests` to playwright if needed) |
| AC10 | `npm run test` on a branch changing only file X runs only tests whose import-closure reaches X | Empirical (build phase): touch a leaf, observe vitest selection |
| AC11 | `npm run verify` green end-to-end | `{{verify}}` |
| AC12 | Docs: `testing.md` + `useful-commands-reference.md` describe affected legs, e2e-in-verify, full-at-release, and the e2e under-selection caveat (R3) | Read rendered markdown diff |

## Ordered task list
1. `scripts/lib/attestation-scope.ts` — `resolveLegs` + `assertScope` + `VerifyScope`. (AC1,AC2)
2. `scripts/lib/attestation-floor.ts` — add `assertHarnessSymmetry` (keep extractAgenticCounts). (AC3)
3. Unit tests for the three pure fns. (AC1,AC2,AC3,AC5-unit)
4. `scripts/verify-attest.ts` — `const {legs,scope}=resolveLegs(process.env.VERIFY_SCOPE)`; run unit=`legs.unit`, integration=`legs.integration`(+json reporter), **e2e=`legs.e2e`**; add `scope` to payload; swap floor→`assertHarnessSymmetry`; update lore. (AC4,AC7,AC6-mint)
5. `scripts/check-attestation.ts` — required `scope` + `--require-scope`; swap floor→`assertHarnessSymmetry`. (AC5,AC7)
6. `package.json` + `packages/web/package.json` — scripts per contract. (AC9,AC10, supports AC4/AC8)
7. `.github/workflows/release-guard.yml` — bump-gated `--require-scope=full` step + `VERIFY_SECRET`. (AC6)
8. Empirical proofs: `npm run verify` (AC8); empty-set exit-0 per runner (AC9); affected selection (AC10); crafted require-scope pass/fail (AC5). 
9. Docs. (AC12)
10. Full `npm run verify` green. (AC11)

## Route checklist
N/A — no HTTP routes.

## Security & abuse cases
- **Forged `scope`/counts** → signed inside the HMAC payload; tamper invalidates HMAC. ✅
- **Release-gate bypass** (bump on affected) → release-guard `--require-scope=full` rejects affected/absent. ✅
- **Cross-job trust gap** → enforcement reuses check-attestation's own HMAC verify (D2). ✅
- **Symmetry-floor evasion** (lopsided harness run minting green) → `assertHarnessSymmetry` fails unequal lanes in both mint + validate. ✅
- Rate-limit / input-trust / path-traversal / SSRF / secrets → **N/A** (no endpoint, no agent-authored field, no new credential; `VERIFY_SECRET` pre-existing).

## Protected tests
- `packages/db/src/__tests__/ar1-attestation-floor.test.ts` — extend, do not weaken.
- `packages/db/src/__tests__/ar2-per-harness-floor.test.ts` (critique B5 — directly imports `assertPerHarnessFloor`, 10+ adversarial cases incl. codex-zero / missing-key). The migration must **port** every case onto `assertHarnessSymmetry` and prove each still fails — NOT delete them. Removing `assertPerHarnessFloor` without porting destroys the AR2 regression proof.

The symmetry floor (+ untagged guard) must remain ≥ as strict as the presence floor against the AR2 "one harness silently dropped" case.

## Migrations
- `assertPerHarnessFloor` → `assertHarnessSymmetry`: update both call sites (verify-attest.ts:177, check-attestation.ts:179) + **both** test files (`ar1-attestation-floor.test.ts`, `ar2-per-harness-floor.test.ts` — critique B5; port, don't delete). Consumers confirmed via `rg -a assertPerHarnessFloor` (use `rg -a`, not plain grep — CLAUDE.md control-char hazard): the two scripts + the two test files. No others.
- `test:all`: `test && test:integration` → `test:full && test:integration`; update the stale `@lore AR1` comment (verify-attest.ts:75-78) **and** the ci.yml:17 comment (critique H6 — both describe `test:all` as full; both become lies once `test`→affected).
- **Atomic (critique H6):** `ATTESTED_COMMAND_UNIT = "npm run test"` (verify-attest.ts:79) becomes affected the instant the `test` script gains `--changed`. The `resolveLegs` swap (task 4) and the `package.json` `test` change (task 6) **must land in the same commit** — otherwise full-mode verify (`VERIFY_SCOPE=full`) would run an affected unit leg while stamping `scope:"full"` = an incoherent attestation. Update the log line (verify-attest.ts:112) too.
- `ATTESTED_TOOLS` gains `"test:e2e"`.

## Shared files
`package.json`, `packages/web/package.json`, `scripts/verify-attest.ts`, `scripts/check-attestation.ts`, `scripts/lib/attestation-floor.ts`, `.github/workflows/release-guard.yml`.

## Risks
- **R1** vitest uncommitted-vs-ref nuance — non-load-bearing (clean tree at attest). ⚠️
- **R2** `origin/main` not fetched → `--changed`/`--only-changed` fail; worktree flow guarantees it; stale local main over-selects (safe). Document prerequisite.
- **R3** e2e affected under-selects for app-only changes (Playwright can't trace browser interaction → source) ⇒ most PRs run 0 e2e; full run at release is the real e2e gate. Document explicitly.
- **R4** e2e in verify adds Playwright/vite boot to local verify even in affected mode if any spec is selected; affected keeps it rare. Acceptable per the goal.
```

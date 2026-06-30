# AT1 — Affected test selection across `test`, `verify`, and e2e

DOC-CLASS: minor

## Goal

**Value & audience.** For the developer/agent who runs `npm run verify` before every ship: stop running the entire giant test set on every branch. A normal verify should run + attest only the slice **affected** by the branch diff vs `origin/main` — across **all three** test types (unit/component, integration, e2e) — using each runner's own changed-file selection (vitest `--changed`, Playwright `--only-changed`). The full suite runs only at version release as the backstop. **North star: make verify runs smaller and more relevant by selecting the affected slice instead of the whole set.**

**Success (observable).** After this ships:
- `npm run test` runs only the unit/component test files whose module-graph closure intersects the branch diff vs `origin/main` (`vitest run --changed=origin/main`). Empty affected set → 0 tests, exit 0.
- The **integration** leg of verify runs affected-only too (`vitest --changed=origin/main` on the integration config) — so a branch that doesn't touch harness/DB code does **not** pay for the real-LLM harness suite.
- The **e2e** leg runs affected-only (`playwright test --only-changed=origin/main`) and is **part of `npm run verify`** (newly added).
- The signed attestation carries `scope: "affected" | "full"`.
- A version-bump PR is required to carry `scope: "full"` (full unit + full integration + full e2e); non-release PRs accept either. Enforced in `release-guard.yml`.
- A `full` path exists for each leg (no changed-filter) and a `verify:release` that mints `scope:"full"`.

**Scope — explicitly OUT:**
- CI docs-fast-path (`ci.yml`) — keeps its `.md`-suffix git-path gating.
- Attestation source-drift guard (`check-attestation.ts` `srcHash`) — unchanged; integrity check, not selection.
- Non-test verify steps (typecheck gate, lint, knip, mock-inventory, token/vocab guards, build×2) — unchanged. No "affected" for them.
- No general-purpose package/workspace affected engine. Each test runner's native changed-file flag is the only mechanism.

## The harness-symmetry floor (redefinition — load-bearing)

Today the attestation per-harness floor (`assertPerHarnessFloor`) trips unless **every** supported harness executed ≥1 test. That is incompatible with affected selection (an unrelated change selects 0 harness tests → all-zero → trips).

**Redefine the floor to conditional symmetry** (founder spec): *for the harness test files that were selected to run, more than one harness ran and each harness ran equally much.* Precisely, over the executed-per-harness counts:
- **All zero** (no harness file in the affected slice) → **pass** (nothing was supposed to run).
- **Any non-zero** → **pass iff every supported harness has a non-zero count AND all counts are equal** (`max === min`). Otherwise fail — an unequal/missing lane means a harness was silently dropped (the AR2 regression this floor exists to catch).

This is **scope-agnostic** — it is honest in affected mode (symmetric subset) and full mode (all files, naturally symmetric) without a per-mode disable. It holds because every harness integration test file fans across all supported harnesses (AR2 `[harness:X]` lanes), so any file subset yields equal per-harness counts. `scope:"full"` additionally guarantees the slice = the whole suite, so "all zero" cannot occur unless the suite itself is empty.

(The unit and e2e legs have no floor; pruning them is unconditionally safe.)

## What `scope` means (noun)

`scope` is a signed field recording **which selection produced this attestation**:
- `"affected"` — all three legs ran their changed-file selection vs `origin/main` (a subset).
- `"full"` — all three legs ran the whole suite (no changed-filter).

Not a pass/fail signal (`status`), not per-leg. Hard rule: a version-bump PR's attestation must have `scope === "full"`. No back-compat — `scope` is always present; an absent/invalid value fails validation.

## Guide draft (dev-facing)

> **Verify runs only what your branch touched.** `npm run verify` now selects the *affected* slice of the test suite instead of the whole thing — across unit/component (`vitest --changed`), integration (`vitest --changed`), and e2e (`playwright --only-changed`), all diffed against `origin/main`. A branch that only touches the web UI won't run the real-LLM harness suite; a branch that doesn't touch e2e-covered surfaces won't spin up Playwright. Verify gets dramatically faster and more relevant.
>
> The harness attestation stays honest: for whatever harness tests *did* run, every harness ran an equal amount — an unequal lane still fails the attestation.
>
> **Releases run everything.** Bump the version and `verify` must produce a `full`-scope attestation (`npm run verify:release`) — full unit + integration + e2e. The Release Guard rejects an `affected`-scope attestation on a version bump, because a release is the one moment the entire suite (including edges the changed-file graph can't see) must be proven green. Need a full run anytime: `npm run test:full`, `npm run test:e2e:full`.

## Required reading (downstream: /architecture, /pipeline)

- `package.json` — `test`, `test:integration`, `test:all`, `test:e2e`, `verify` scripts.
- `packages/web/package.json` + `packages/web/playwright.config.ts` — e2e runner, webServer, current spec set.
- `vitest.config.ts`, `vitest.integration.config.ts` — unit + integration projects.
- `scripts/verify-attest.ts` — the attested legs + payload; where `scope` + the e2e leg are added, where the unit/integration legs invoke selection.
- `scripts/lib/attestation-floor.ts` — the floor to redefine (symmetry).
- `scripts/check-attestation.ts` — payload validation; `scope` + `--require-scope`.
- `.github/workflows/release-guard.yml` — version-bump detection; home of the `scope === "full"` requirement.
- `.github/workflows/ci.yml` — confirm CI runs **no** tests (validates attestation only); e2e stays out of CI as a GH job (it runs locally inside verify, attestation carries the result).
- `docs/guides/developer/testing.md` + `useful-commands-reference.md` — DOC-CLASS:minor.

## Open architecture questions (defer to /architecture)

1. Full-mode mechanism (env `VERIFY_SCOPE=full` vs flags) and how each leg toggles selection.
2. Where `scope` is enforced (release-guard reusing `check-attestation --require-scope`).
3. Playwright `--only-changed` empty-set + webServer behavior (`--pass-with-no-tests`); confirm vitest `--changed` empty-set (`--passWithNoTests`).
4. e2e-in-verify: app/server dependency, where the e2e leg sits in the verify chain, and that it stays local-only (CI never runs it; attestation carries the result).

## DOC-CLASS rationale

`minor` — small additions to existing dev docs (`testing.md`, `useful-commands-reference.md`). No new page, no UI. DESIGN-CLASS n/a. Human-concept-review not triggered.

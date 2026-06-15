# AH5 Code Review — Rework (local-only live lane), Phase 4

**Workpackage:** AH5 — Live agent-path smoke lane. **Branch:** `feat/AH5-rework`. **Rework commit:** `c76b1244`. **Base:** `origin/main`.
**Reviewer:** single evaluator (Phase 2 rework critique APPROVED 9/10 → Phase 4 code review). Design lens skipped (no UI surface).
**Diff reviewed:** `git diff origin/main..HEAD`.

## Verdict: DONE.

All 5 ACs MET under the local-only model. The venue fix is **real and complete** — the forbidden GitHub workflow is gone, `ci.yml` is byte-identical to pre-AH5 main, and the live lane is in no always-run gate. Zero CRITICAL. All key-free gates pass with **no `OPENROUTER_API_KEY` in the environment** (verified by execution). All preserved DONE contracts from the prior code review survived byte-faithful. One NIT (a single residual "CI" comment), non-blocking.

---

## The venue fix — REAL + COMPLETE (verified by execution, not assertion)

The whole point of the rework. All conditions hold:

1. **`.github/workflows/ah5-smoke.yml` is gone, no replacement.** `git cat-file -e origin/main:.github/workflows/ah5-smoke.yml` → does not exist on main (the revert already removed it); the rework adds no workflow back. `ls .github/workflows/` → only `ci.yml`, `deploy.yml`, `desktop-release.yml`, `release-guard.yml`, `release.yml`. No AH5 workflow anywhere.
2. **`ci.yml` byte-identical to pre-AH5 main.** `git diff origin/main -- .github/workflows/ci.yml` → **empty**. No `workflow_dispatch:` leftover (the only `workflow_dispatch:` occurrences in `.github/workflows/` are in `release.yml` and `deploy.yml` — both pre-existing, unrelated).
3. **No GitHub workflow runs e2e/live LLMs for AH5.** Grep of `.github/workflows/` for `ah5|smoke|openrouter|live` → zero AH5 matches.
4. **The live lane is not smuggled into any automatic gate.** `npm run verify` chain = `check → lint → knip → mock-inventory → nimmly → demo-fixture → token → harness-vocab → ah5-mock-guard → build → desktop build → verify-attest`. It contains the **key-free** `ah5-mock-guard:check` only; it does **not** contain `smoke:ah5`, `test:e2e:ah5`, the probe, or the resolve step. `npm run test` = `vitest run` (no live lane). `smoke:ah5` is a standalone root script (`tsx scripts/ah5-smoke-local.ts`), referenced by nothing in `verify`/`test`/`test:all`/ship's gate. Confirmed by grep.
5. **The live orchestrator FAILS CLOSED on absent key (step 1).** `scripts/ah5-smoke-local.ts:88-98` — if `OPENROUTER_API_KEY` is unset/blank, it writes a clear local-only message and `process.exit(1)` before any other step. No silent skip.

**Security:** `OPENROUTER_API_KEY` is read only from `process.env` (orchestrator, probe, test-server, resolve-model); never a `secrets.*` reference anywhere; never echoed; seeded **encrypted** (AES-256-GCM via `encryptCredentialValue`) into `server_credentials`; cost report carries tokens+cents+model only. Sole outbound host is the fixed `https://openrouter.ai/api`. Removing the GH workflow removes the secret-in-CI surface entirely — net security improvement. No regression.

---

## AC completeness audit

| AC | Status | Evidence |
|---|---|---|
| **AC1** No mocks on proof path; static guard enforces; probe drives real `provisionSession` span | **MET** | No-mock guard (`scripts/ah5-no-mock-guard.ts`) compiles (line-comment globs), inspects ≥1 spec, fails closed on zero specs (`process.exit(1)`). **Adversarially re-verified:** injecting `page.route("**/sessions/provision", …)` into the AH5 spec → guard exits **1** with VIOLATION at the right line; restoring → exit **0**. It runs key-free in the `verify` chain via `ah5-mock-guard:check` (executed: PASS). Probe (`ah5-real-turn-probe.ts`) drives production `provisionSession → runSession → BuiltinHarnessAdapter → callLlm` with the production `DbCredentialResolver` reading an encrypted seeded key — zero mocks. |
| **AC2** Documented gates, ranked, `:nitro`, not hardcoded, fixture-tested | **MET** | `selectSmokeModel` pure (free/gen/price pre-filter via shared `preFilterModels` → per-provider tools+uptime+status gate → ≥2-provider redundancy → throughput-desc/latency-asc/price-asc rank → `${id}:nitro` → ordered fallback). **Executed key-free:** `select-smoke-model.test.ts` → **22 passed**. `Number.isNaN` (N2 fixed); `preFilterModels` single source of truth, re-exported from eval index (N3 fixed). |
| **AC3** ≥1 real tool action via prescriptive prompt, observable | **MET** | Probe **always-asserts** (fail-closed) a `write_session_notes` `tool_call_recorded` event with `notes === "AH5-SMOKE-OK"` (`ah5-real-turn-probe.ts:370-403`): absence → `failed=true` → `process.exit(1)`; arg mismatch → fail. The prior C3 fix is **intact** — NOT re-`fixme`'d. Only the UI-overlay row assertion remains `test.fixme`-gated (AH3 dependency, unchanged). |
| **AC4** Off the hot path AND genuinely gates (broken trigger → fail) | **MET** | "CI" reinterpreted as the local verification lane (mandated by the project's local-only-e2e rule). Off-path: the live lane is in no `.github/workflows/*`, no `verify`, no `test`. Genuinely-gates: the **key-free** `ah5-gates-on-broken-stream.integration.test.ts` drives the production `provisionSession` seam, injects a zero-event adapter, and asserts the combined `probeSucceeds` predicate (A: outcome==="completed" ∧ B: cost>0 ∧ C: `write_session_notes` observed) **fails** — proving B and C load-bearing even when A vacuously passes. **Executed key-free:** **3 passed**. The reinterpretation + founder-amendment is durably recorded (see below). |
| **AC5** Cost bounded by cap, reported, cents, fail-closed | **MET** | Probe asserts `0 < totalCostCents ≤ cap`, writes `ah5-cost.json` **before** assertions (fail-closed ordering). `ah5-assert-budget.ts` is the redundant local gate: missing/unparseable/over-cap → `exit 1`. `isWithinCostCap` pure + unit-tested. All three paths (probe write, budget-assert read, report dir) unified on `packages/web/playwright-report-ah5/ah5-cost.json` (W2 fix preserved). |

---

## Preserved DONE contracts — nothing sound regressed

Cross-checked against the prior `code-review.md` re-review DONE pins; all intact:

- **Probe tool-call assertion** — always-run, fail-closed, `notes === "AH5-SMOKE-OK"`. NOT regressed to the pre-C3 "we don't fail on tool-call absence" state. ✓
- **Gating integration test** — `probeSucceeds` mirrors the real probe predicate; B and C each proven load-bearing across 3 tests. ✓
- **No-mock guard** — compiles, ≥1-spec, fails-closed-on-zero, catches injected forbidden route (adversarially confirmed). ✓
- **Unified cost path** — `packages/web/playwright-report-ah5/` across probe/budget-assert/report. ✓
- **Server export-map (W3)** — `./services/credential-encryption` + `./services/server-config` present in `packages/server/package.json` exports. ✓
- **Selection module** — `preFilterModels` single source of truth (N3), `Number.isNaN` (N2). 22 tests green. ✓
- **knip.json** — registers `vite.ah5.config.ts` + `playwright.ah5.config.ts` so the orchestrator/scripts aren't flagged dead. `npm run knip` → exit 0. ✓

---

## Founder-amendment durability (critique W1) — RESOLVED

The "CI means the local verification lane" reinterpretation is durably recorded in **two** places that survive `/write-docs`:
- `.pipeline/work-packages/TRACK-AH.md` § AH5 — a prominent "Implementation note (do not repeat this mistake)" block pointing to `plans/AH5/architecture-rework.md` §AC4, naming PR #301 and `npm run smoke:ah5`.
- `scripts/ah5-smoke-local.ts:24-31` — `@lore AH5` stating the lane is local-only, "CI" in AC4 = local verification lane, and that running it in GitHub Actions is the reverted error.

Both load-bearing; the founder-amendment flag is impossible to lose. The critique SUGGESTIONs (orchestrator selection-test is a documented pre-flight not the gate; `AH5_MODEL_OVERRIDE` seed-file shape pinned; "fine in CI" soft-skip lore dropped) are all addressed in the orchestrator `@lore` and the test-server warning (now points to `npm run smoke:ah5` as the hard gate).

---

## Negative lenses

- **Adversarial** — Saboteur: no backdoor, no weakened test, no silent regression; the no-mock guard fails closed on zero specs AND on injected routes (verified). Auditor: the rework's claim (delete workflow, restore ci.yml, local-only lane) matches the diff exactly. New Hire: the orchestrator's 8 steps are linear, labeled, and lore-documented. Type safety: two `as unknown as HyperIdleDb` casts (probe + test-server) — pre-existing PGlite→typed-db convention from the original DONE version, matches the eval harness, not introduced by the rework, not a regression.
- **Simplification** — orchestrator is the one new module and earns its place (replaces the deleted workflow's job-step sequence). Rest of the rework is subtraction + comment rewording. No dead code (knip clean), no single-use wrappers, no premature generics.
- **AI slop** — none introduced. Comments are load-bearing lore, not filler. No "TODO: implement" on implemented code, no "simplified version" tells.

---

## Validation executed (all key-free — no `OPENROUTER_API_KEY` in env)

- `git diff origin/main -- .github/workflows/ci.yml` → **empty** (byte-identical).
- `ah5-mock-guard:check` (npm) → PASS; injected `page.route("**/sessions/provision")` → exit 1 VIOLATION; restored → exit 0.
- `select-smoke-model.test.ts` → **22 passed**.
- `ah5-gates-on-broken-stream.integration.test.ts` → **3 passed**.
- `npm run check` → 12/12 packages PASS.
- `npm run lint` → exit 0.
- `npm run knip` → exit 0.
- `npm run test` (full unit) → **5096 passed (470 files)**.
- `npm run test:integration` → **2881 passed, 6 skipped (247 files)** (skips pre-existing).

The live lane itself (`npm run smoke:ah5`) is local-only and requires a real key — by design it is NOT run in this review (and never in any automatic gate). Its DoD is the developer/ship-builder's local proof at ship time, per the AH-track proof model.

---

## Findings

### CRITICAL
_None._

### WARNING
_None._

### NIT
- **N1 (non-blocking, comment-only)** — `packages/eval/src/smoke/select-smoke-model.ts:177` `@lore` on `isWithinCostCap` still reads *"Called by the probe and by the **CI** budget-assert step."* This is the one residual "CI" reference the rework's §R task-5 rewording list did not enumerate (it named the probe/resolve/test-server/spec/catalog files, not the `isWithinCostCap` lore). Behavior-neutral — it sits in a pure, key-free helper. Reword "CI" → "local lane" for consistency with the rest of the rework. Does not block DONE.

---

## Doc check

No user-facing doc change warranted — the diff touches `packages/eval/src/smoke/`, `packages/web/scripts/` + e2e + configs, `scripts/`, `packages/server/.../__tests__/`, pipeline/plan artifacts, and `package.json`/`knip.json`. No `docs/guides/user/`, no UI component, no production route. Confirmed reasonable.

---

**Verdict: DONE.** All 5 ACs MET; venue fix real + complete; zero CRITICAL; all key-free gates green with no API key; all preserved DONE contracts intact. The single NIT (one residual "CI" comment in a key-free helper) is non-blocking — fold it in opportunistically.

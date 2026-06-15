# AH5 (REWORK) — Live agent-path smoke lane, LOCAL-ONLY

**Supersedes:** the CI-coupling decisions in `plans/AH5/architecture.md` (§3 "CI wiring" and the `.github/workflows/ah5-smoke.yml` deliverable). Everything else in `architecture.md` — model-selection module (§1), the Playwright lane shape (§2), the "genuinely gates" mechanism (§4), the AC→verification mapping (§5), the `provisionSession`-driven probe and no-mock guard — **stands as written and is preserved**. This rework changes **where and how the live lane is invoked**, not what it proves. Read `architecture.md` first; this file is the delta.

**Why this rework exists.** The first AH5 shipped (PR #296), then was reverted (PR #301) for an **architecture fail**: it authored `.github/workflows/ah5-smoke.yml` — a GitHub Actions job (nightly cron + labeled-PR + `workflow_dispatch`) that ran the live-LLM / e2e smoke lane in GitHub CI. **In this project that is forbidden.** e2e (`*.spec.ts`) and ALL expensive/live-LLM lanes run **LOCAL ONLY**, never as a GitHub Actions job. GitHub `ci.yml` runs only fast, key-free checks: check, lint, knip, the guards, `test:all` (unit + integration), build, attestation. The reverted implementation's substance (selection, probe, guards, gating test) was reviewer-APPROVED and re-reviewed DONE; only its **CI venue** was wrong.

**The restored material.** This branch (`feat/AH5-rework`) carries a revert-of-revert that re-applies the entire original AH5 change set as starting material — including the forbidden workflow and the one-line `ci.yml` edit. The builder reworks **from** that material per §R (ordered task list) below.

**Skill calls per spec:** `/architecture` only (rework of an existing M workpackage; no new nouns → no `/concept`, no user surface → no `/design`). Original critique 8/10 APPROVED; original code-review re-verdict DONE. This rework does not reopen those — it corrects a single category error (CI venue) the project's local-only-e2e rule makes load-bearing.

---

## The load-bearing correction (one rule, stated once)

> **e2e and every live-LLM / expensive lane runs LOCAL ONLY. No `.github/workflows/*.yml` may run e2e or call a live model. GitHub CI = fast, key-free checks only.**

Consequences that drive every decision below:
- **Delete** `.github/workflows/ah5-smoke.yml`. No GitHub workflow replaces it.
- **`OPENROUTER_API_KEY` is a LOCAL environment variable**, never a GitHub Actions secret. No `secrets.*` reference anywhere for this lane.
- The live lane must **not** be in `ci.yml`, must **not** be in default `npm run verify`, and must **not** be in default `npm run test` / `test:all` (those stay key-free and fast).
- The **key-free** parts of AH5 (the pure `selectSmokeModel` unit tests, the `provisionSession` broken-stream gating **integration** test, the `isWithinCostCap` unit test, the no-mock static guard) **do** run in the standard gates (`npm run test` / `test:integration` / lint), because they need no key and are fast. That is exactly where the project's gate boundary already puts them.
- The live lane (real OpenRouter turn + Playwright UI proof + budget/cost report) is a **manually-invoked local lane** the developer / ship-builder runs **before** shipping AH5-dependent work, with the key from their local environment.

---

## Required reading (engineer reads these before reworking)

Everything in `architecture.md`'s "Required reading" still applies. **Add / re-weight:**
- `plans/AH5/architecture.md` — the preserved plan (selection §1, lane §2, gating §4, AC map §5). This rework is a delta on §3 and the CI-venue parts of §2/§5/§7.
- `plans/AH5/code-review.md` — the re-review DONE verdict pins the exact runtime behaviors that must survive the rework (probe asserts `write_session_notes`, gating test mirrors `probeSucceeds`, cost paths unified to `packages/web/playwright-report-ah5/`). **Do not regress these.**
- `.github/workflows/ci.yml` — the fast per-PR/per-push gate. AH5 must **not** add a job here and must **not** run e2e/live here. (The restored revert added a harmless `workflow_dispatch:` trigger to `ci.yml` — see Plan reconciliation row 6; revert that one line too, it was part of the smoke-lane scaffolding.)
- `.claude/skills/ship/SKILL.md` — establishes that `/ship` runs `npm run verify` (key-free, no e2e) then attestation + PR. The live lane is **adjacent to** ship (a documented local pre-ship step), not inside `verify`.
- `vitest.config.ts` (projects include `packages/eval`) — confirms `select-smoke-model.test.ts` already runs in `npm run test`, key-free. **No change needed there.**
- `packages/web/scripts/ah5-resolve-model.ts`, `ah5-real-turn-probe.ts`, `ah5-test-server.ts`, `ah5-assert-budget.ts` — the four scripts whose **comments/lore** reference "the CI lane / ah5-smoke.yml" and must be reworded to "the local lane."
- `packages/web/e2e/ah5-live-agent-path.spec.ts` — header + `test.fixme` lore reference "ah5-smoke.yml CI workflow"; reword to "local lane (`npm run -w @hyperidle/web test:e2e:ah5`)."

---

## Plan reconciliation (rework ⇆ restored implementation)

| # | Restored-impl assumption | Reality / rule | Rework handling |
|---|---|---|---|
| 1 | `.github/workflows/ah5-smoke.yml` runs the lane (cron + labeled-PR + dispatch), secret-gated | **Forbidden** — no GH workflow runs e2e/live LLM | **Delete the file.** No replacement workflow. The lane becomes a local npm-script lane (§L). |
| 2 | `OPENROUTER_API_KEY` injected from `secrets.OPENROUTER_API_KEY` | Key is a **local** env var only | All invocation docs/comments say "export `OPENROUTER_API_KEY` in your shell." No `secrets.*`. The scripts already read `process.env.OPENROUTER_API_KEY` (no code change — they never hard-depended on GH secrets). |
| 3 | CI step `ah5-assert-budget.ts` runs `if: always()` after the lane | No CI step exists now | The **probe itself** already asserts `totalCostCents ≤ cap` and writes `ah5-cost.json` **before** asserting (fail-closed ordering, per code-review AC5 MET). `ah5-assert-budget.ts` becomes a **local** post-lane script the lane runner invokes (and the developer can run manually). It already fails-closed on missing/unparseable/over-cap file. No GH wiring. |
| 4 | CI step runs the no-mock guard, the selection unit tests, the resolve step, the probe, the Playwright lane in sequence | Those belong to two homes by **cost**, not one workflow | **Split by key-need:** key-free (`select-smoke-model.test.ts`, gating integration test, no-mock guard) → already in `npm run test` / `test:integration` / lint, which run in the normal gate. Key-needing (resolve → probe → Playwright UI) → the **local lane orchestrator** (§L), one command, run by the developer/ship-builder. |
| 5 | `select-smoke-model.test.ts` only runs in CI smoke job | **Wrong even pre-rework** — `packages/eval` is in `vitest.config.ts` projects, so it already runs in `npm run test` (key-free, fixture-based). Code-review confirms 22 passing. | No change. The plan text in `architecture.md` already says these are key-free and unit-tested; the rework just removes the *additional* CI-job invocation. |
| 6 | The revert restored a `workflow_dispatch:` trigger added to `ci.yml` | That trigger was scaffolding for manually firing the smoke job; it is not part of AH5's value and was added by the AH5 changeset | **Revert that one line** in `ci.yml` (remove `workflow_dispatch:`) so AH5 leaves `ci.yml` byte-identical to pre-AH5 main. Not strictly forbidden (it runs no live LLM), but AH5's `sharedFiles` declared `ci.yml` read-only; honoring that keeps the hot path untouched. |
| 7 | Playwright `playwright.ah5.config.ts` is local config with two webServers, ports 3097/5182 | Correct and sound (mirrors AH1's local lane) | **Preserve unchanged.** This is already a local config; nothing GH-specific in it. |
| 8 | Server exports `./services/credential-encryption` + `./services/server-config` (W3 fix) | Restored by the revert-of-revert | **Preserve.** The local lane still imports these; the export-map entries remain load-bearing. |

**No `/concept` gap. No spec/doc contradiction** beyond the AC4-wording reconciliation (§AC4 below), which is a venue reinterpretation the project's own local-only rule mandates, not a primitive reshape.

---

## What is preserved verbatim (do NOT reopen)

These were APPROVED in critique and DONE in re-review. The rework must keep them byte-faithful except for comment rewording:

1. **Dynamic OpenRouter model selection** — `packages/eval/src/smoke/{policy,openrouter-catalog,select-smoke-model,index}.ts`. Pure `selectSmokeModel` (free/gen/price pre-filter via shared `preFilterModels` → per-provider tools+uptime+status gate → ≥2-provider redundancy → throughput-desc/latency-asc/price-asc rank → `${id}:nitro` → ordered fallback). Fixture-based unit tests (`select-smoke-model.test.ts`, 22 cases) that **run in `npm run test`** because they are key-free. **Untouched.**
2. **The `provisionSession`-driven real-turn probe** — `packages/web/scripts/ah5-real-turn-probe.ts`. Drives the production `provisionSession → runSession → BuiltinHarnessAdapter → callLlm` span with the production `DbCredentialResolver` reading an encrypted seeded key — zero mocks. **Always-asserts** a real `completion`, the `write_session_notes` `tool_call_recorded` event with `notes === "AH5-SMOKE-OK"`, and `totalCostCents ≤ cap > 0` (writes `ah5-cost.json` first). **Untouched** except comment rewording (CI → local).
3. **The no-mock static guard** — `scripts/ah5-no-mock-guard.ts`. Compiles, inspects ≥1 spec, fails closed on zero specs, flags `page.route` on proof-path globs. **Untouched** as code; its **invocation moves** from the deleted CI step to (a) the local lane orchestrator and (b) optionally `npm run verify`'s guard chain (it is key-free and fast — see §L "Optionally fold into verify").
4. **The local Playwright config + test-server + resolve script** — `playwright.ah5.config.ts`, `vite.ah5.config.ts`, `ah5-test-server.ts` (PGlite + `encryptCredentialValue`-seeded key + `createServer`), `ah5-resolve-model.ts`. Already local. **Untouched** except comment rewording.
5. **The "genuinely gates" integration test** — `packages/server/src/harness/__tests__/ah5-gates-on-broken-stream.integration.test.ts`. Drives the production `provisionSession` seam, injects a zero-event adapter, asserts the combined `probeSucceeds` predicate (outcome + cost>0 + `write_session_notes` observed) fails. **Key-free → runs in `npm run test:integration` → already in the normal gate.** **Untouched.** This is the automated, always-run proof that the lane "genuinely gates" — and it needs no live model, which is precisely why AC4's gating half survives the venue change intact.

---

## The local lane — how the live smoke lane runs (the rework's core)

### Decision: manually-invoked local lane, NOT inside `/ship`'s automatic `verify`

**Design-it-twice:**

- **Option A — fold the live lane into `/ship`'s gate (make `npm run verify` or a ship pre-step run it automatically).** Shape: `verify` (or a ship hook) shells the resolve → probe → Playwright sequence with the key. Trade-off: every ship of *any* workpackage would need `OPENROUTER_API_KEY` present and would spend real money + OpenRouter latency on every verify. Reason to reject: **fatal** — `verify`/`test` must stay key-free and fast (the whole project rule); a key-gated `verify` breaks every contributor without a key and turns a deterministic gate into a flaky, costed one. This is the same category error as the GH workflow, just relocated.

- **Option B — a standalone local lane command the developer / ship-builder runs deliberately, with the key in their shell, before shipping AH5-dependent work.** Shape: one orchestrator script + npm script; key-free gates (`verify`, `test`, the gating integration test, the guard) stay automatic; the live lane is explicit and opt-in. Trade-off: it is not *automatically* run on every change — relies on the ship process (and the AH-track hard requirement) to invoke it for the workpackages it proves. Reason to reject: weaker automation. **But** this is exactly how the project treats e2e/live everywhere (local-only, developer-driven), and the AH track's hard requirement already says each AH workpackage is *proven by driving the real app via this lane locally with screenshots* — i.e. a human/agent runs it deliberately at proof time.

**Chosen: B.** It is the only option compatible with "key-free, fast `verify`/`test`" and "e2e/live is local-only." The lane is a **single local command**; the always-run automated gates carry the regression-protection (gating integration test + selection unit tests + no-mock guard), and the live lane carries the real-money end-to-end proof at ship/proof time.

### The lane command

Add a root orchestrator script + npm script that runs the full live lane **locally**, reading the key from `process.env`:

- `scripts/ah5-smoke-local.ts` (**replaces** the deleted workflow's job-step sequence as a Node script):
  1. Assert `process.env.OPENROUTER_API_KEY` is set; if absent, **exit non-zero** with a clear message (`AH5 live lane requires OPENROUTER_API_KEY in your shell; this lane is local-only and never runs in GitHub CI`). Fail-closed, never silent-skip (the GH job's "skip if secret empty" fork-safety is irrelevant locally — locally, absence is operator error).
  2. Run the no-mock static guard (`scripts/ah5-no-mock-guard.ts`); abort on violation.
  3. Run the selection unit tests as a fast pre-gate (`npm run test -- select-smoke-model`); abort on red. *(Fast, key-free — fail early before spending money.)*
  4. Resolve the model: `npx tsx packages/web/scripts/ah5-resolve-model.ts` with `RESOLVE_MODEL_FILE` set (default `/tmp/ah5-model-selection.json`). Supports an optional `AH5_MODEL_OVERRIDE` env (the local analogue of the workflow's `model_override` dispatch input) — if set, write `{"routedId": <override>}` to `RESOLVE_MODEL_FILE` and skip live selection.
  5. Run the real-turn probe: `npx tsx packages/web/scripts/ah5-real-turn-probe.ts` (reads `RESOLVE_MODEL_FILE`, `AH5_MAX_COST_CENTS`, `AH5_MAX_TOKENS`). The probe writes `packages/web/playwright-report-ah5/ah5-cost.json` then asserts cap + tool-call.
  6. Run the Playwright UI lane: `npm run -w @hyperidle/web test:e2e:ah5`. (Pre-AH3, the UI-trigger assertions are `test.fixme`-gated; the live UI proof for the trigger lands when AH3 does — unchanged from `architecture.md`.)
  7. Run the budget assert as a redundant fail-closed post-step: `npx tsx packages/web/scripts/ah5-assert-budget.ts` (fails on missing/unparseable/over-cap `ah5-cost.json`). Run it even if step 5/6 failed (the script's own fail-closed-on-absence makes a crashed lane red, not green).
  8. Emit a final summary line with the chosen model, `totalCostCents`, token total, and the report directory path. Echo where the screenshots + cost report live for visual proof.

- `package.json` (root): `"smoke:ah5": "tsx scripts/ah5-smoke-local.ts"`. This is the **one documented command** to run the lane locally.
- `packages/web/package.json`: keep `"test:e2e:ah5"` (already present) — the orchestrator and a developer running just the UI half both use it.
- root `package.json`: keep `"test:e2e:ah5"` convenience (already present).

### Where the key comes from
`OPENROUTER_API_KEY` is exported in the developer's / ship-builder's shell (e.g. from a local `.env` they source, or their secret manager). **Never** committed, **never** a GitHub secret, **never** echoed (the probe already seeds it *encrypted* into `server_credentials` via `encryptCredentialValue` and the cost report contains only tokens+cents). The lane's only outbound host is the fixed `https://openrouter.ai/api` (no SSRF surface).

### Budget cap / cost report / fail-closed — locally
Identical mechanism to `architecture.md` §2, minus the CI step:
- `AH5_MAX_COST_CENTS` (default 5) and `AH5_MAX_TOKENS` (default 20_000) read from the local env (the orchestrator sets sane defaults if unset).
- The probe asserts `totalCostCents ≤ cap` (cents, not dollars) and `> 0`, writing `ah5-cost.json` **before** the assertion (fail-closed ordering — a crash mid-turn still leaves a parseable-or-absent file the budget-assert step catches).
- `ah5-assert-budget.ts` is the redundant local gate: **exit non-zero on missing/unparseable/over-cap**. "Fail closed on absence" is preserved exactly — a lane that crashes before writing the file reads as **red**, never "no overflow → green."

### Optionally fold the *key-free* guard into `verify`
The no-mock static guard (`scripts/ah5-no-mock-guard.ts`) is key-free and fast. It MAY be added to `npm run verify`'s guard chain (alongside `mock-inventory:check`, `nimmly-guard:check`, etc.) so the "no `page.route` on the AH5 proof path" property is enforced on **every** verify, not only when the live lane runs. This is the *only* AH5 piece that belongs in `verify`; the live model call does not. (Recommended but optional — the guard already runs inside the local lane orchestrator regardless.)

---

## AC4 reconciliation — "runs in CI" reinterpreted

**The spec's AC4 text:** *"Runs in CI off the hot path; genuinely gates (broken trigger → fail)."*

**Reinterpretation (mandated by the project's local-only-e2e rule):** "CI" in the AH5 spec must be read as **"the project's verification lane,"** which for an e2e/live-LLM lane is the **local** lane — **not** GitHub Actions. The two halves of AC4 are satisfied as follows:

- **"Runs in CI off the hot path"** → the live lane runs **locally** via `npm run smoke:ah5`, deliberately invoked by the developer/ship-builder at proof/ship time, with `OPENROUTER_API_KEY` from the local environment. It is **off** the GitHub hot path by construction (it is not in `ci.yml`) and off the `verify`/`test` hot path (key-free, fast gates stay key-free and fast). "Off the hot path" is over-satisfied: it is off *every* automatic path and only fires when a human/agent runs the proof.
- **"Genuinely gates (broken trigger → fail)"** → proven by the **key-free** `ah5-gates-on-broken-stream.integration.test.ts`, which **runs in `npm run test:integration` on every normal gate** (no live model needed). It drives the production `provisionSession` seam, injects a broken (zero-event) adapter, and asserts the combined `probeSucceeds` predicate (outcome + cost>0 + `write_session_notes` observed) **fails** — proving the probe's liveness condition is load-bearing. The **local live lane** then demonstrates the same predicate **passing** against a real model. A deliberately re-broken trigger reddens the gating integration test (automatic) and the live probe (local). The gating property therefore does **not** depend on GitHub Actions at all.

**Net:** AC4 is fully met under the project's definition of its verification lane. The "genuinely gates" guarantee is *stronger* here than in the reverted version, because its automated proof (the integration test) already lives in the always-run gate, independent of any live key or CI venue.

### Spec-AC amendment flagged for the founder (NOT silently rewritten)
> **AH5 AC4 says "Runs in CI."** In this project, e2e and live-LLM lanes are **local-only by rule** and never run in GitHub Actions. As written, AC4's "CI" is ambiguous and — taken literally as "GitHub Actions" — is exactly what got the first AH5 reverted. **Recommended amendment:** change AC4 to *"Runs in the local verification lane off the hot path (e2e/live lanes are local-only; never GitHub Actions), and genuinely gates (broken trigger → fail), with the gating property also proven by a key-free integration test that runs in `npm run test:integration`."* This is a **flag for founder decision**, not a unilateral spec edit — the plan implements the local-only reading either way, but the spec text should be corrected so the next reader doesn't repeat the GitHub-Actions mistake.

---

## Acceptance criteria → corrected verification method

Each AC mapped to its home by **key-need**: key-free (runs in the normal gate — `npm run test` / `test:integration` / lint / verify) vs. **local live lane** (run with a key via `npm run smoke:ah5`).

| AC | Type | Key-free gate (automatic) | Local live lane (keyed, manual) |
|---|---|---|---|
| **AC1** Frontend-driven lane asserts a real streamed response; no mocks on the proof path | static + e2e | **No-mock static guard** (`ah5-no-mock-guard.ts`) — key-free, runs in the local-lane orchestrator and optionally in `verify`. Compiles, inspects ≥1 spec, fails closed on zero specs, flags forbidden `page.route`. | **Probe** drives production `provisionSession → callLlm` with the encrypted seeded key, zero mocks (real streamed completion). UI-trigger assertion `test.fixme`-gated until AH3 (unchanged). Screenshots → `packages/web/playwright-report-ah5/`. |
| **AC2** Model selected at runtime by documented gates, ranked, `:nitro`, not hardcoded; delisting → next candidate | runtime (pure) | **`select-smoke-model.test.ts`** (22 cases, fixture-based) — **runs in `npm run test`** (`packages/eval` in vitest projects). Gate/rank/`:nitro`/fallthrough proven without a key. No-hardcoded-model property enforced by the guard. | Live `ah5-resolve-model.ts` exercises the real fetchers against OpenRouter once per lane run. |
| **AC3** ≥1 real tool-using action via prescriptive prompt; tool effect observable | runtime + e2e | The gating integration test's `probeSucceeds` predicate includes the `write_session_notes` term (key-free). | **Probe asserts** (always, fail-closed) a real `write_session_notes` `tool_call_recorded` with `notes === "AH5-SMOKE-OK"`. UI `tool-call-summaries` row rides the AH3 `test.fixme` gate (unchanged). |
| **AC4** Runs off the hot path AND genuinely gates (broken trigger → fail) | integration + lane | **`ah5-gates-on-broken-stream.integration.test.ts`** — key-free, **runs in `npm run test:integration`**, drives production `provisionSession`, proves the combined liveness predicate is load-bearing (broken stream → fails). | The live lane (`npm run smoke:ah5`) demonstrates the same predicate **passing** against a real model, locally, off every automatic path. **No GitHub workflow.** See AC4 reconciliation above. |
| **AC5** Token cost bounded by a cap and reported; cents not dollars; fail closed | runtime + lane | **`isWithinCostCap`** pure unit test (key-free, in `npm run test`). | **Probe** reads `result.totalCostCents`, asserts `≤ cap > 0`, writes `ah5-cost.json` first. **`ah5-assert-budget.ts`** redundant local fail-closed step (missing/unparseable/over-cap → non-zero). |

### Static-property guards (lint/script, not tests)
- **No-mock-on-proof-path guard** — `scripts/ah5-no-mock-guard.ts`, key-free. Runs in the local lane orchestrator; **optionally added to `verify`**. (Was: a CI step. Now: local + optional verify.)
- **No-hardcoded-model guard** — same script. Unchanged.

---

## §R — Ordered task list (changes from the restored implementation)

The branch already carries the full restored AH5 change set. The rework is **subtractive + comment-level + one new orchestrator** — do **not** rewrite the sound code. In order:

1. **Delete the GitHub workflow.** Remove `.github/workflows/ah5-smoke.yml` entirely. *(Proves: the forbidden venue is gone.)* Verify no other workflow references the smoke lane (`grep -rn "ah5\|smoke" .github/workflows/`).
2. **Revert the `ci.yml` scaffolding line.** Remove the `workflow_dispatch:` trigger the AH5 changeset added to `.github/workflows/ci.yml` so `ci.yml` is byte-identical to pre-AH5 main. *(Honors AH5's `sharedFiles: ci.yml read-only`.)* Confirm with `git diff origin/main -- .github/workflows/ci.yml` showing no AH5-introduced lines remain (only the revert-of-revert's other files).
3. **Add the local lane orchestrator.** Create `scripts/ah5-smoke-local.ts` implementing the §L step sequence (assert key present → guard → selection pre-test → resolve (with `AH5_MODEL_OVERRIDE` support) → probe → Playwright `test:e2e:ah5` → budget assert → summary). Reads `OPENROUTER_API_KEY` from `process.env`; **fails closed** (non-zero) if absent, with the local-only message. Never references `secrets.*`.
4. **Add the npm script.** `package.json` (root): `"smoke:ah5": "tsx scripts/ah5-smoke-local.ts"`. Keep existing `test:e2e:ah5` (web + root) as-is.
5. **Reword CI/secret references in scripts + spec to "local lane."** Comment/lore-only edits — **no behavior change**:
   - `packages/web/scripts/ah5-resolve-model.ts` — header "Called once per CI run (from ah5-smoke.yml…)" → "Called once per local lane run (from `scripts/ah5-smoke-local.ts`…)". Keep the `RESOLVE_MODEL_FILE` lore.
   - `packages/web/scripts/ah5-test-server.ts` — "injected by the CI workflow or set locally" → "set in your local shell".
   - `packages/web/scripts/ah5-real-turn-probe.ts` — any "CI" lore → "local lane".
   - `packages/eval/src/smoke/openrouter-catalog.ts` — "only called in the CI lane which has the key" → "only called in the local lane which has the key".
   - `packages/web/e2e/ah5-live-agent-path.spec.ts` — header "runs ONLY in the ah5-smoke.yml CI workflow" → "runs ONLY in the local lane (`npm run -w @hyperidle/web test:e2e:ah5`)"; the `test.fixme` lore that mentions "CI via the ah5-smoke.yml workflow step" → "the local lane's probe step". **Keep the `test.fixme` gates themselves** (AH3 dependency unchanged).
6. **Optionally fold the key-free guard into `verify`.** Add `scripts/ah5-no-mock-guard.ts` to `npm run verify`'s guard chain (a `"ah5-mock-guard:check"` script + chaining), since it is key-free and fast. *(Recommended; does not gate on a key.)* If added, confirm `npm run verify` still passes with no key present.
7. **Confirm the key-free gates already cover their ACs without GitHub.** No code change — verify by running: `npm run test -- select-smoke-model` (AC2, 22 pass), `npm run test:integration -- ah5-gates-on-broken-stream` (AC4 gating, 3 pass), `npm run test -- isWithinCostCap`-equivalent (AC5 math). `npx tsx scripts/ah5-no-mock-guard.ts` (AC1 static, exit 0 + "inspected ≥1 spec"). These prove the rework didn't break the preserved behavior.
8. **Local live-lane proof (the DoD for the lane itself).** With `OPENROUTER_API_KEY` exported locally: `npm run smoke:ah5`. Inspect the screenshot(s) + `packages/web/playwright-report-ah5/ah5-cost.json` (cents, `totalCostCents > 0`, `≤ cap`). Confirm the probe asserts the `write_session_notes` tool call. Capture the cost summary line as proof. **This is run locally, never in GitHub.**
9. **Verify + lint + check clean, key-free.** `npm run check`, `npm run lint`, `npm run test`, `npm run test:integration`, `npm run verify` — all green **with no key present** (proving the standard gates stay key-free and the live lane is not in them). The deleted workflow + reverted `ci.yml` line must not break `verify`.
10. **Update plan artifacts.** Ensure `plans/AH5/architecture-rework.md` (this file) is the authoritative venue plan; leave `architecture.md` for reference (its §3 is superseded, noted at its head is unnecessary — this file's preamble already states the supersession).

---

## Risks / ambiguities

1. **"Local-only means weaker automation."** The live lane no longer fires on a nightly cron. **Mitigation:** the *gating* property (the thing that protects against regressions) lives in the key-free integration test that runs on every `test:integration`. The live lane is the real-money end-to-end proof run deliberately at ship/proof time — exactly the AH track's stated proof model. Accepted trade-off; it is the project rule.
2. **A contributor forgets to run the live lane before shipping AH5-dependent work.** **Mitigation:** the AH-track hard requirement (proven by driving the real app via this lane with screenshots) makes running it part of the proof for every AH workpackage; the ship process surfaces it. Document `npm run smoke:ah5` in the AH5 lore + (optionally) a `/ship` checklist note. Not a code gate — a process one, consistent with how the project treats all e2e.
3. **`OPENROUTER_API_KEY` absent locally.** The orchestrator **fails closed** (non-zero, clear message) rather than skipping. No silent green. (The GH job's "skip if secret empty for forks" logic is deleted — irrelevant locally.)
4. **Comment rewording accidentally changes behavior.** **Mitigation:** task 5 is comment/lore-only; task 7/9 re-run the preserved tests + guard to confirm zero behavior drift.
5. **AC4 wording remains literally "runs in CI" in the spec.** Flagged for founder amendment (§AC4); the plan implements the local-only reading regardless. Until the founder amends, the rework's AC4 mapping is the binding interpretation, recorded here.

---

## Security & abuse cases

- **Secret handling (now local, not a GH secret):** `OPENROUTER_API_KEY` is a **local** env var, never committed, never a GitHub Actions secret, never echoed. The probe seeds it **encrypted** into `server_credentials` via `encryptCredentialValue` (AES-256-GCM) — no plaintext in logs/DB/artifacts. Cost reports carry tokens+cents only. Removing the GH workflow **removes** the secret-in-CI surface entirely — a net security improvement. **Addressed.**
- **Rate-limit / budget abuse:** budget cap + fail-closed + `BuiltinHarnessAdapter` `maxIterations` bound a runaway loop from burning the local key. **Addressed.**
- **SSRF:** only outbound host is the fixed `https://openrouter.ai/api` (gateway constant + catalog endpoints); no user-controlled URL. **N/A (fixed host).**
- **Input-trust boundary:** the prescriptive prompt is test-authored; tool-effect assertion reads server state, not agent prose. **N/A for this lane.**
- **Path traversal:** test-server uses a fixed tmp workspace base path; `RESOLVE_MODEL_FILE` / cost-report paths are operator/env-controlled local paths, not network input. **N/A.**

---

## route-checklist

AH5 adds **no production routes** (unchanged from `architecture.md`). The local lane mounts only the test-server's `createServer` app; no e2e-only route is reachable from production `createServer`. **(none in production.)**

## protectedTests

```
protectedTests: [
  "packages/web/e2e/ah1-onboarding-credentials.spec.ts",                    // AH1 lane must keep passing
  "packages/server/src/services/__tests__/credential-runtime-path.integration.test.ts", // AH1 runtime-key proof
  "packages/eval/src/smoke/__tests__/select-smoke-model.test.ts",           // AH5: encodes the documented gates; runs key-free in npm run test
  "packages/server/src/harness/__tests__/ah5-gates-on-broken-stream.integration.test.ts" // AH5: the gating proof — must keep proving broken stream → fail (key-free)
]
```
The rework must not alter these assertions. The two AH5 entries are the key-free proofs that carry AC2 and AC4's gating half on every normal gate — they are precisely what makes the local-only model honest.

## sharedFiles

```
sharedFiles: [
  ".github/workflows/ci.yml",          // RESTORE to pre-AH5 (remove the AH5-added workflow_dispatch line); AH5 adds NO workflow
  "package.json",                       // add "smoke:ah5" root script
  "packages/web/package.json",          // keep existing test:e2e:ah5 (no change)
  "packages/eval/src/index.ts"          // re-export smoke selection (unchanged from restored impl)
]
```
The deleted `.github/workflows/ah5-smoke.yml` is removed, not shared. No conflict with concurrent AH workpackages.

## migrations

The only "migration" is the **deletion** of `.github/workflows/ah5-smoke.yml` and the **revert** of the one `ci.yml` line — both enumerated in §R tasks 1–2. No schema/route/testid/column rename. No call-site migration (the scripts already read `process.env.OPENROUTER_API_KEY`; only their comments referenced the workflow).

# Architecture Critique: AH5 (REWORK — local-only live lane)

ARCHITECTURE-SCORE: 9/10  rounds=1  score-line: SA:9 LI:10 AC:9 DM:9 N:9 MD:8 FMC:9 S:9 V:9

Verdict: **APPROVED.** Score ≥7, zero CRITICAL. The fix is **real, not relocated** — verified against the branch, not asserted. The rework deletes the forbidden venue, restores `ci.yml` to pre-AH5 byte-identity, and refuses to fold the live lane into any always-run gate. One WARNING and a few SUGGESTIONs the builder folds in during execution; none block.

This critique scores the rework delta (`architecture-rework.md`). The preserved substance (selection, probe, gating test, no-mock guard, cost cap) was already APPROVED 8/10 and re-reviewed DONE — not reopened, only its venue corrected.

---

## The #1 adjudication: is the fix REAL, or just RELOCATED?

**REAL. Confirmed on the branch.** All three load-bearing conditions hold:

**(a) Deletes the forbidden workflow.** §R task 1 + reconciliation row 1 delete `.github/workflows/ah5-smoke.yml` entirely, no replacement workflow. Verified the file currently exists (4479 bytes) and carries four `secrets.OPENROUTER_API_KEY` references (lines 13/42/82/95/103), a `schedule:` nightly cron, a labeled-PR trigger, and a `model_override` `workflow_dispatch` input — i.e. exactly the GitHub-Actions live-LLM job the project forbids. The plan removes it outright and adds no `.github/workflows/*` in its place. Plan even mandates the grep-confirm (`grep -rn "ah5\|smoke" .github/workflows/`) — and I ran it: the smoke file is the **only** workflow reference, so deletion fully clears the venue.

**(b) Reverts the `ci.yml` line to pre-AH5 main.** §R task 2 + reconciliation row 6 remove the AH5-added `workflow_dispatch:` trigger. Verified: `git diff origin/main -- .github/workflows/ci.yml` shows exactly one added line (`+  workflow_dispatch:` under `on:`), and `origin/main`'s `ci.yml` has no `workflow_dispatch`. The plan's byte-identity claim is accurate and the verification step it prescribes (`git diff origin/main -- .github/workflows/ci.yml` → empty) is the right gate. Correctly framed as honoring AH5's declared `sharedFiles: ci.yml read-only`, not as a security rule — that nuance is right (a bare `workflow_dispatch:` runs no live LLM; the reason to remove it is contract hygiene, and the plan says so).

**(c) Does NOT relocate the live lane into the fast/key-free gate.** This is where a lazy rework fails, and this plan does not. §L "Decision: manually-invoked local lane, NOT inside `/ship`'s automatic `verify`" explicitly design-it-twice rejects Option A (fold into `verify`/ship) with the correct reasoning: *"This is the same category error as the GH workflow, just relocated."* The live lane (`scripts/ah5-smoke-local.ts` / `smoke:ah5` → resolve → probe → Playwright → budget-assert) requires `OPENROUTER_API_KEY` from `process.env` and **fails closed** if absent — it is in no `.github/workflows/*`, not in `verify`, not in `test`/`test:all`. Verified the four scripts already read `process.env.OPENROUTER_API_KEY` (test-server, probe, resolve-model), so the de-secretization is a comment/venue change with zero behavioral coupling to GH secrets. The only thing the plan permits into `verify` is the **key-free** no-mock static guard (§"Optionally fold") — that is correct: it spends no money, makes no network call, and enforces a static property on every run. That is the one piece that *belongs* in `verify`, and the plan correctly scopes it as the only one.

**Net on item 1: the category error is eliminated at its root, not pushed downhill.** This is the single most important thing the rework had to get right, and it gets it right with explicit reasoning rather than accident.

---

## Item 2: key-free / key-required split is clean

**Confirmed clean, both directions.**

- **Key-free stays in the always-run gate.** `select-smoke-model.test.ts` (22 cases, `packages/eval` is in vitest projects → runs in `npm run test`), `ah5-gates-on-broken-stream.integration.test.ts` (`packages/server/.../__tests__/`, `*.integration.test.ts` → `npm run test:integration`), the `isWithinCostCap` unit test, and the no-mock static guard (key-free script) — all four need no key, are fast, and the plan keeps them exactly where the project's gate boundary already puts them. Reconciliation row 5 correctly notes this was *already* true pre-rework (the eval package was always in the vitest projects), so removing the redundant CI-job invocation loses nothing.
- **Key-required is local-only.** The live lane requires the key from the local shell, never a GH secret, never in default `test`/`verify`. The plan's "fail-closed on absent key locally (operator error), never silent-skip" (§L step 1, risk 3) is the right call — it deliberately drops the GH job's "skip-if-secret-empty fork-safety" fork because that logic is meaningless locally.
- **Nothing key-requiring leaks into the always-run path.** Verified the scripts read `process.env` and the live HTTP fetchers (`fetchSmokeCatalog`/`fetchModelEndpoints`) are only invoked by `ah5-resolve-model.ts` inside the lane — the unit tests use the captured fixture, never a live call. The line is drawn correctly.

The "split by key-need, not by venue" framing (reconciliation row 4) is the precise correct mental model for why this works.

---

## Item 3: "genuinely gates" (AC4) still holds without a GitHub job

**Holds — and the plan's claim that it is *stronger* now is defensible, not spin.** The gating property was never carried by the GitHub job; it was always carried by the **key-free** `ah5-gates-on-broken-stream.integration.test.ts`, which drives the production `provisionSession` seam, injects a zero-event adapter, and asserts the combined `probeSucceeds` predicate (outcome + cost>0 + `write_session_notes` observed) fails. That test runs in `npm run test:integration` on every normal gate, independent of any live key or CI venue. The re-review (`code-review.md` lines 105/112) confirms all 3 gate cases pass and that `probeSucceeds` faithfully mirrors the probe's real predicate (the W1 under-proving was fixed in the DONE version). Removing the GitHub job removes *nothing* from this proof. The live lane demonstrates the same predicate **passing** against a real model locally — the demonstration half, not the gating half. The gating half was, is, and remains a key-free integration test. AC4-gating survives the venue change intact. **Sound.**

---

## Item 4: AC reconciliation — "runs in CI" reinterpreted

**Defensible reading; the founder-flag is the right call.** Verified the spec AC4 literally reads: *"The lane runs in CI (pre-merge and/or scheduled, off the hot per-PR path given E2E cost/latency) and genuinely gates."* Taken literally as "GitHub Actions," that text is exactly what got AH5 reverted. The plan reinterprets "CI" as "the project's verification lane" — which, for an e2e/live-LLM lane, is **local-only by the project's own rule**. This is not a unilateral spec rewrite: §AC4 + risk 5 **flag a precise amendment for the founder** (`change AC4 to "Runs in the local verification lane off the hot path … and genuinely gates … with the gating property also proven by a key-free integration test"`) and implement the local-only reading regardless. That is the correct posture per the project's own norms (don't silently rewrite the spec; reinterpret per a load-bearing project rule and flag the text). The reinterpretation is the *only* reading compatible with "e2e/live is local-only" — the literal reading is the forbidden one. I concur with the reinterpretation and the flag.

One firmness point (carried into the WARNING below): the plan should make the founder-flag **impossible to lose** — it lives only in `architecture-rework.md`. See WARNING W1.

---

## Item 5: nothing sound was lost

**Confirmed preserved.** §"What is preserved verbatim" enumerates the five load-bearing artifacts and the plan's task list is subtractive + comment-level + one new orchestrator — it explicitly does *not* rewrite the sound code:
- Model selection (`selectSmokeModel`: free/gen/price pre-filter via shared `preFilterModels` → per-provider tools+uptime+status gate → ≥2-provider redundancy → throughput-desc/latency-asc/price-asc rank → `:nitro` → ordered fallback) — untouched, 22 tests stay green.
- The `provisionSession`-driven probe with the **always-run** `write_session_notes` tool-call assertion (the C3 fix from the DONE review — `notes === "AH5-SMOKE-OK"`, fail-closed) — untouched except comment rewording. The plan correctly preserves this as the AC3 gate; it must not regress to the pre-C3 "we don't fail on tool-call absence" state.
- The no-mock guard (compiles, inspects ≥1 spec, fails closed on zero specs) — untouched as code; invocation moves to the local orchestrator (+ optional `verify`).
- The local Playwright config + test-server + resolve script — already local, untouched.
- The gating integration test — untouched, key-free, stays in the gate.

The plan's explicit "do not regress these" pointer to `code-review.md` (required-reading) is exactly right — the DONE review pinned the runtime behaviors (probe asserts the tool call, cost paths unified to `packages/web/playwright-report-ah5/`, server export-map entries for `credential-encryption`/`server-config`), and I verified the cost path is already unified on the branch. Preservation is correctly scoped.

---

## CRITICAL

_None._

---

## WARNING

- **[plan §AC4, §risks 5] The founder-amendment flag lives only in `architecture-rework.md` — durably record it where the spec is read, or the next agent repeats the GitHub-Actions mistake.** The reinterpretation of "CI" → "local verification lane" is correct, but `plans/<wp>/` artifacts are working/transitive and may be retired at `/write-docs`. The spec text in `.pipeline/work-packages/TRACK-AH.md` § AH5 still literally says "runs in CI." The whole reason AH5 was reverted is that someone read "CI" as "GitHub Actions." **Fix:** add a one-line pointer at the AH5 spec (or a `@lore AH5` at the top of `scripts/ah5-smoke-local.ts`) stating "this lane is local-only; 'CI' in AC4 means the local verification lane — see `plans/AH5/architecture-rework.md` §AC4." A `@lore` in the orchestrator is durable code-resident memory; the plan already lists lore capture (risk 2) but ties it to "document `npm run smoke:ah5`" — make the local-only-meaning-of-CI itself the lore, not just the command name. (Not blocking — the plan implements the correct behavior regardless; this protects the *next* reader.)

---

## SUGGESTION

- **[plan §L step 3, §R task 6] The orchestrator runs the selection unit tests AND the plan optionally folds the guard into `verify` — avoid the orchestrator silently masking a gate the real gate should own.** §L step 3 has `ah5-smoke-local.ts` run `npm run test -- select-smoke-model` as a fast pre-gate. That is fine as a fail-early money-saver, but it is *also* run in `npm run test` (the real gate). State explicitly that the orchestrator's copy is a convenience pre-flight, not the authoritative gate — so no one later "moves" the selection test out of `npm run test` thinking the orchestrator covers it. One sentence in §L. (Same spirit for the no-mock guard: the plan already says it runs in the orchestrator *and* optionally `verify`; recommend folding into `verify` so the static property is enforced on every change, not only when someone runs the live lane.)

- **[plan §L step 4] `AH5_MODEL_OVERRIDE` local analogue — confirm the override path still flows through the same seed file the test-server/probe read.** The plan replaces the deleted workflow's `model_override` dispatch input with an `AH5_MODEL_OVERRIDE` env that writes `{"routedId": <override>}` to `RESOLVE_MODEL_FILE` and skips live selection. Good parity. Confirm the override-written file shape matches what `ah5-resolve-model.ts` normally writes (ordered fallback list included or gracefully absent) so the probe/test-server consumer doesn't choke on a one-key file. Minor — name the exact shape in §L so the builder doesn't guess.

- **[plan §R task 5] Comment-rewording is behavior-neutral, but one reworded file (`ah5-test-server.ts` line 22) currently says "injected by the CI workflow" inside a `@lore` — ensure the rewording also drops the now-false "WARNING: OPENROUTER_API_KEY not set" *soft-skip* if it implies CI-style silent-skip.** Verified `ah5-test-server.ts:100` emits a *warning* (not fail) when the key is absent. That soft posture was for the CI fork-safety case. The orchestrator now fails closed on absent key (§L step 1), so the test-server's soft-warn is downstream of a hard gate and harmless — but confirm the rewording doesn't leave a misleading "this is fine in CI" lore. Comment-only; fold into task 5.

- **[plan §migrations] "Deletion of a workflow as a migration" is fine, but add the post-condition assertion.** The plan lists the workflow deletion + `ci.yml` revert as the only "migration." Good. Add to §R task 9 an explicit assertion that `npm run verify` passes **with no key in the env** — the plan states this (task 9) but make it the named DoD for the venue fix: "verify green, key absent" is the single proof that the live lane is *not* in the always-run path. (The plan already requires this — just elevate it to the headline proof of the rework.)

---

## What's Working Well

- **The category error is killed at the root with explicit design-it-twice reasoning, not accident.** §L names the relocation trap (`"the same category error as the GH workflow, just relocated"`) and rejects it. That sentence is the whole rework's thesis and it is correct. A weaker plan would have moved the lane into a ship pre-step and called it done; this one refuses.

- **The split is by *key-need*, not by *venue* — the correct invariant.** Reconciliation row 4's "two homes by cost, not one workflow" is the precise mental model. Key-free proofs (selection, gating, guard, cost-math) stay automatic; the keyed live lane is local + manual. This is exactly how the project treats all e2e/live, so AH5 stops being a special case and rejoins the project's norm.

- **AC4's gating half is provably venue-independent.** The gating property was always carried by the key-free integration test, never the GitHub job. Removing the job removes nothing from the proof — and the plan demonstrates this rather than asserting it (§AC4, "the gating property therefore does not depend on GitHub Actions at all"). The "stronger now" claim is earned: the always-run automated proof is independent of any live key or CI venue.

- **Security posture improved, correctly noted.** Removing the GH workflow removes the secret-in-CI surface entirely (§Security). The key is now a local env var, never a GH secret, seeded encrypted (AES-256-GCM) into `server_credentials`, never echoed; cost reports carry tokens+cents only; the sole outbound host is the fixed `https://openrouter.ai/api` (no SSRF). Net security improvement, accurately characterized.

- **Preservation is byte-faithful and explicitly fenced.** The "do NOT reopen" list + the required-reading pointer to `code-review.md`'s DONE pins (probe asserts the tool call, unified cost path, server export-map entries) means the rework cannot silently regress the hard-won C1/C3/W1/W2/W3 fixes. The subtractive task list keeps the sound code sound.

---

## Per-dimension scores

| Dim | Score | Note |
|---|---|---|
| System Architecture (SA) | 9 | Live lane correctly placed local-only; the one category error is excised, not relocated. |
| Layer Integrity (LI) | 10 | Test/CI infra; no production-layer reach. The local-vs-CI venue boundary is now respected exactly. |
| API/Contract (AC) | 9 | `sharedFiles` honored (`ci.yml` byte-restored); orchestrator + `smoke:ah5` script contracts clean; AC4 reinterpreted + founder-flagged. |
| Data Model (DM) | 9 | Unchanged from preserved plan (encrypted credential seed, cost JSON shape); cost path already unified. |
| Naming (N) | 9 | `smoke:ah5` / `ah5-smoke-local.ts` honest; "local lane" rewording consistent. Minus: founder-flag naming lives only in transitive artifact (W1). |
| Module Depth (MD) | 8 | One new orchestrator script of real value; rest is subtraction + comments. Slight risk the orchestrator's pre-flight test run duplicates the real gate (SUGGESTION). |
| File/Module Count (FMC) | 9 | Net file count drops (workflow deleted); one orchestrator added. Proportional to an M rework. |
| Security (S) | 9 | Secret-in-CI surface removed; local key fail-closed; fixed outbound host; no plaintext. Net improvement. |
| Verifiability (V) | 9 | AC→home mapping by key-need is concrete; "verify green, key absent" is the load-bearing proof; gating test venue-independent. |

**Total: 9/10.**

---

## What the designer must do (none blocking — fold during execution)

1. **W1** — Make the "CI means the local lane" reinterpretation durable in code/spec (`@lore AH5` in `ah5-smoke-local.ts` and/or a pointer at the TRACK-AH.md AH5 spec), not only in the transitive `architecture-rework.md`.
2. **SUGGESTIONs** — clarify the orchestrator's selection-test run is a pre-flight not the gate; pin the `AH5_MODEL_OVERRIDE` seed-file shape; ensure comment rewording drops the stale "fine in CI" soft-skip lore; elevate "verify green with no key" to the headline DoD of the venue fix.

The builder may proceed to rework execution. The fix is real. I will re-review the resulting diff in Phase 4 against this plan and the preserved DONE contracts.

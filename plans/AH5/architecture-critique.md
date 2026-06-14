# Architecture Critique: AH5

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:8 N:8 MD:8 FMC:8 S:8 V:8

Verdict: **APPROVED.** Score ≥7, no CRITICAL. One WARNING and several SUGGESTIONs the builder must fold in during red/green — none block test-writing. The sequencing call is sound and confirmed against the current codebase.

---

## Verdict on the AH3-sequencing question (the #1 thing to adjudicate)

**The designer's call is correct. Ship the harness + model-selection + CI as AH5's deliverable; gate AH5's own DoD on the deterministic real-turn probe (`provisionSession`-driven); `test.fixme()`-gate the UI assertion only if AH3 is unmerged at build time. This does NOT gut AC #1.**

Grounding (verified against the AH1+AH2-merged worktree, not asserted):

1. **The message→turn→stream trigger is genuinely absent today.** `POST /api/threads/:id/messages` (`packages/server/src/routes/threads.ts` ~L883) inserts the message row and emits `thread_message_appended` — and stops. No `provisionSession`/`startSessionProvision`/harness call fires off a posted plain message. `AssistantOverlay.tsx` L202 POSTs the message and renders; nothing drives a turn. So the headline UI assertion ("send a message → real streamed response renders") **cannot pass against current main** — it depends on a trigger that is AH3's deliverable. The designer's premise is factually correct.

2. **But the real model-call SPAN is fully reachable today without AH3.** `provisionSession(deps, params)` (`packages/server/src/services/session-provisioning.ts` L998 → `runSession` L516 → `BuiltinHarnessAdapter` → `resolveAgentModel` openrouter branch → `callLlm` `${baseUrl}/v1/messages`) is a clean in-process entrypoint that runs one real turn end-to-end with the production `DbCredentialResolver`. The probe driving `provisionSession` directly exercises **credential → model-gateway → harness → callLlm with zero mocks** — exactly the span the spec says is currently untested. This is the part of AC #1 that matters most ("no mocked agent/credential/session/LLM routes anywhere on the path"), and the probe satisfies it independent of the UI trigger.

3. **Therefore the split is honest, not a dodge.** AH5's gating proof (the probe) tests the real no-mock model span — the thing the spec exists to protect. The UI assertion tests the *trigger wiring*, which is literally AH3's job; the spec itself names AH3/AH4 as **consumers** ("the lane then becomes the proof target for AH3 and AH4"), not prerequisites. `test.fixme()`-gating a sibling-owned trigger while keeping the no-mock model span gated by AH5 is the correct engineering call. It would only "gut AC #1" if AH5 mocked the LLM to make the UI pass — it does the opposite (real `callLlm`, fail-closed).

**One refinement the designer must commit to (folded into the WARNING below):** the probe must NOT be a parallel re-implementation of the turn path. It must call the *same* `provisionSession`/`runSession` entrypoint the eventual AH3 trigger calls, so the probe and the UI assertion prove the *same* span. The plan gestures at this ("the same real turn-provisioning entrypoint") but never names `provisionSession` — pin it. If the probe instantiates `BuiltinHarnessAdapter` by hand with bespoke wiring, it proves a different path than production and the gate is theater.

---

## CRITICAL

_None._

---

## WARNING

- **[plan §Sequencing, §2 files, §4, §7 steps 6–7] The probe's entrypoint is unpinned — name `provisionSession`/`runSession` explicitly, or the gate proves the wrong path.** The plan repeatedly says "the same real turn-provisioning entrypoint the probe uses" and "one real OpenRouter turn through `BuiltinHarnessAdapter`" but never identifies it. Verified: `provisionSession(deps, params)` (`session-provisioning.ts` L998) is the production wrapper over `admitSession`+`runSession`; that is the single entrypoint both the probe and the future AH3 trigger must use. **Fix:** in §2, §4, and §7, state that `ah5-real-turn-probe.ts` and `ah5-gates-on-broken-stream.integration.test.ts` both drive `provisionSession` (or `runSession`) — NOT a hand-built adapter — so "broken stream" is injected at the same seam production uses, and the probe's liveness condition pins the *production* turn path. Without this, AC #4's "deliberately re-broken trigger/stream path makes the lane fail" can pass while production stays broken.

---

## SUGGESTION

- **[plan §Plan reconciliation row 9, §2 test-server] The "AH1 seed (`migrateCredentialsToStore`)" precedent is misdescribed — it is a net-new seed, not a reuse.** Verified: `ah1-test-server.ts` does NOT seed any credential; it relies on the Playwright spec driving real `PUT /api/credentials/*`, and `migrateCredentialsToStore` only relocates *legacy server_config blobs* — it does not read `OPENROUTER_API_KEY` from env. So AH5's "seed `openrouter_api_key` encrypted from `process.env`" is novel. **Fix:** pin the exact mechanism: `encryptCredentialValue(value, serverSecret)` from `services/credential-encryption.ts` (AES-256-GCM, the same helper `routes/credentials.ts` L230 uses), with `serverSecret` from `getServerSecret`, inserted into `serverCredentials` (`@hyperidle/db`). This is correct and keeps the production resolver mock-free — but the plan should reference the real helper, not a precedent that doesn't seed.

- **[plan §1 Option A rationale] "eval already owns OpenRouter HTTP + key conventions" is half-true — eval owns the OpenRouter *inference* key convention, but there is NO catalog/endpoints fetch code in `packages/eval/src` to reuse.** Verified: zero hits for `/models`, `endpoints`, `fetchCatalog` in eval. The fetchers (`fetchSmokeCatalog`/`fetchModelEndpoints`) are entirely net-new. The Option-A placement decision is still sound (eval owns the `OPENROUTER_API_KEY` posture and real-LLM concerns belong out of `server`), but the rationale overstates reuse. **Fix:** soften the claim to "eval owns the `OPENROUTER_API_KEY` convention and real-LLM posture"; acknowledge the catalog HTTP is new.

- **[plan §2 cost reporting, §7 step 5] Pin the cost-cents source — `estimateCostUsd` is module-private, and `totalCostCents` already exists in two places.** Verified: `estimateCostUsd` (builtin-harness-adapter.ts L108) is `function`-scoped, not exported; `cost_update`/`token_usage` events carry `WireMoney`; `packages/eval/src/provision-harness.ts` L103 already surfaces `result.totalCostCents`. **Fix:** state whether the probe reads `totalCostCents` off the provisioning result (preferred — already aggregated, mirrors eval) or computes from `cost_update` events. Avoid a third `computeCostCents` helper if the provisioning result already exposes the total; the plan's §7 step 5 hedges ("export a shared pure helper if clean") — resolve it: read the existing `totalCostCents`, add a pure cap-comparison only.

- **[plan §2 prescriptive tool, §6, §8 risk 5] Tool choice for the prescriptive prompt is still unresolved and is load-bearing for AC #3.** The plan offers `write_session_notes` (UI-visible only via `tool-call-summaries`) vs a state-changing tool (`create_task`). AC #3 requires "tool effect observable in UI." A `tool-call-summaries` row naming the tool is observable, so `write_session_notes` technically satisfies it — but the spec's validation scenario says "the tool is actually invoked and its effect is observable." **Fix:** before red phase, confirm which tools the assistant-overlay turn actually registers (the registry the AH3/AH2 builtin loop wires), and pick the one with the strongest UI-visible effect. Name it in the plan, not "confirm against AH3." If only `tool-call-summaries` is available pre-AH3, that's acceptable for the probe (`tool_call` event observed), but the UI-effect half then rides the same `test.fixme()` gate as the rest of the UI spec — say so.

- **[plan §1 Algorithm step 1, §Plan reconciliation row 4] Price-ceiling gate is completion-only, but the spec says "combined prompt+completion price under a documented ceiling (~$0.50/1M completion)."** The spec text is slightly self-contradictory ("combined" then "completion"). The plan gates on `pricing.completion` only. That's a defensible reading (completion dominates cost for short prompts), but **flag it explicitly** so the reviewer/builder don't treat it as drift. **Fix:** add one line to the policy doc-comment: "gate on completion price; prompt price is negligible for the lane's short prescriptive prompts — completion-only ceiling, per spec's `$0.50/1M completion`." A unit test should assert a model priced over the completion ceiling is dropped (already in §1 test list — good).

- **[plan §1 OpenRouter field shapes] `created` / `supported_parameters` / `uptime_last_30m` shapes are asserted from docs, not pinned to a captured fixture — guard against a silent API-shape drift.** The plan's correctness hinges on `pricing.*` being per-token USD strings (×1e6), `created` unix-seconds, throughput/latency as `{p50,...}` objects on authenticated reads. These are reasonable and the plan flags the ×1e6 risk (§8 risk 2). **Fix:** the fixture JSON in `select-smoke-model.test.ts` should be a *captured real response* (one authenticated `GET /models/{id}/endpoints` snapshot committed as a fixture), not hand-authored, so the field shapes are real and the test breaks loudly if OpenRouter changes them. Add one assertion that `fetchModelEndpoints`'s field-narrowing matches the captured fixture's shape.

- **[plan §3 CI, §5 budget-assert] The `ah5-assert-budget.ts` "redundant" CI step is good fail-closed design, but specify the failure when `ah5-cost.json` is ABSENT.** If the lane crashes before writing the cost file (e.g. selection returns empty `ranked`, or the turn throws), the budget-assert step must treat a *missing* `ah5-cost.json` as a failure (exit non-zero), not a pass. Otherwise a crash that skips cost-writing reads as "no overflow → green." **Fix:** state `ah5-assert-budget.ts` exits non-zero if the file is missing or unparseable — fail-closed on absence, not just on overflow.

- **[plan §protectedTests] Good that AH1's two contracts are frozen. Add the AH5 selection unit test once written.** Minor: after red phase, `select-smoke-model.test.ts` becomes the contract that must not silently drift (it encodes the documented gates). Consider adding it to `protectedTests` so a future "loosen the uptime floor to make CI pass" edit is caught. (Not blocking — it's AH5's own test, but the gates are policy.)

---

## What's Working Well

- **The probe-as-gating-proof is the right architecture and is grounded in a real entrypoint.** Decoupling AH5's DoD (real no-mock model span via `provisionSession`) from a sibling-owned UI trigger is exactly how to keep a proof-lane honest without blocking on AH3. The §4 "genuinely gates" mechanism — break the stream at the harness seam, assert the *liveness* check (not HTTP 200) fails — correctly targets the load-bearing condition. This is the single hardest part of the spec and the plan nails the shape.

- **The no-mock prohibition is enforced two ways, not just asserted.** Production `DbCredentialResolver` reading an encrypted store (not `EnvCredentialResolver`) genuinely exercises the prod credential path; the static `ah5-no-mock-guard.ts` script (correctly classified as a lint/script, not a vitest test, per the project's testing rules) blocks `page.route` on proof-path globs. AC #1's "no mocks on the path" is mechanically enforced, which is what the spec demanded.

- **The fallback/fallthrough is made a pure, unit-testable property** (remove top model from fixture → `ranked[0]` becomes prior `ranked[1]`), satisfying AC #2's "delisting → next candidate" deterministically without a live key. Correct call — the alternative (live-testing delisting) is untestable.

- **Off-hot-path CI is concrete and fail-closed:** separate `ah5-smoke.yml`, secret-gated job (`if: secrets.OPENROUTER_API_KEY != ''`), label-opt-in for PRs, `ci.yml` untouched. The design respects MEMORY constraints (test CI on branch before merge, §7 step 12) and keeps the per-PR gate off OpenRouter latency.

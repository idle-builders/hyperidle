# Architecture Critique: AH6

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:8 AC:8 DM:8 N:9 MD:8 FMC:7 S:8 V:7

Plan: `plans/AH6/architecture.md`. Reviewed COLD against `.pipeline/work-packages/TRACK-AH.md` §AH6 and verified every load-bearing factual claim against worktree source. All four critical reconciliation claims (R-1, R-3, R-4, R-5) hold up under code inspection.

## Verdict: APPROVED (score ≥7, no unresolved CRITICAL)

Findings below are WARNING/suggestion — they harden an already-correct plan. None block `/write-tests`.

---

## Load-bearing claims — verified against code

| Claim | Verdict | Evidence |
|---|---|---|
| **R-3** Interception belongs at `callLlm` *definition* in `llm-client.ts`, below gateway + `resolveAgentModel` | **TRUE** | `callLlm` exported at `llm-client.ts:399`; adapter imports it. `assistant-turn.ts:314` calls `resolveAgentModel` BEFORE the adapter's first `callLlm`. Wrapping the definition module is transparent to all 6 call sites + `new BuiltinHarnessAdapter()` zero-arg construction. Constraint "do not intercept above the gateway" honored. |
| **R-1** `createThreadRoutes` no-ops the turn trigger without `assistantTurnDeps`; `createServer`→`createApp` never builds/passes it | **TRUE** | `threads.ts:617-621` signature + L610 lore confirm no-op. `app.ts:412` passes `options.assistantTurnDeps`. `server-factory.ts:292-337` `createApp({…})` call object has NO `assistantTurnDeps`. `ah5-test-server.ts:134` boots via `createServer` → trigger is a silent no-op today. The plan's B3 wiring is genuinely necessary and correctly the single largest real-code change. |
| **R-4** fixme spec testids don't exist; real handles differ | **TRUE** | `ah5-live-agent-path.spec.ts:123-149` uses `setup-name-input`, `setup-submit`, `assistant-trigger`, `assistant-overlay`, `assistant-composer`, `streaming-indicator` — none exist on `AssistantOverlay.tsx`. Real handles confirmed: `tool-call-summaries` (L173), `bet-draft-card` (L141), `ThinkingRow` "Assistant is thinking…" (L409), trigger `getByRole("button",{name:/assistant/i})` (already used in AH3 skip spec L217). |
| **R-5/R-7** per-agent seam gated on `agent.modelId`; seed `modelProvider:"openrouter"`+`modelId` required | **TRUE** | `model-gateway.ts:194` — `resolveAgentModel` takes per-agent branch ONLY `if (agent.modelId)`, else tier fallback. Without the seed the live turn falls to `resolveModelTier` and the seam (the AH5 W4 gap) stays unproven. Seed task is correct. |
| **§5** synthetic-artifact removal sites complete | **TRUE** | `grep -rln "AH5-SMOKE-OK\|ah5-real-turn-probe"` returns exactly the 6 sites §5 enumerates. No DB seed/migration carries the task — in-script only. Removal surface is complete. |

---

## Per-dimension notes

**1. Spec Alignment — 9.** All 7 ACs map to tasks; all tasks trace to an AC or a forced dependency (R-1 wiring is forced by AC "everyday run replays through the choke point"). No scope creep — the one production touch (B3) is the minimum to make the headline interaction fire, justified in Risks §1 and matches AH3's explicit design (threads route built to receive the deps). Out-of-scope items (mocked chrome specs stay, no quality judging) respected.

**2. Layer Integrity — 8.** Interception sits in the Agent Runtime (`packages/server/src/harness`), below the Meta Layer gateway — correct. The production wiring of `assistantTurnDeps` into `createServer` is a Meta-Layer boot change but additive (default unchanged when deps absent). No frontend reaching past its neighbor. Cassettes live in `packages/web/e2e/` but are consumed by the server-side interceptor via env — a minor cross-package locality smell (see WARNING-3).

**3. API Contracts — 8.** No HTTP routes added (route-checklist correctly N/A). The internal contracts that matter are typed: `CallLlmOptions`/`LlmResponse` (existing), `CassetteMissError`, the `{key,request,response}` entry shape, `LLM_CASSETTE_MODE` union `"replay"|"record"|undefined`. The cassette entry shape is specified field-by-field (§1). The dispatcher's three-branch contract is explicit.

**4. Data Model Alignment — 8.** No DB schema change (verified — `AH5-SMOKE-OK` task is in-script only). Cassette JSON format specified: ordered array, `key`/`request`/`response`, `response = {stopReason,content,usage}`. Hash input enumerated field-by-field with explicit inclusions/exclusions.

**5. Naming — 9.** `callLlmDirect` (raw) / `callLlm` (dispatcher) / `replayLlm` / `recordLlm` / `CassetteMissError` are honest. Preserving the exported `callLlm` name means zero call-site churn — verified the 6 adapter sites + `harness-discovery.ts` import the name, not the body. No new closed-vocabulary collisions.

**6. Module Depth — 8.** `llm-cassette.ts` hides record/replay/hash/cost behind a small surface (`replayLlm`, `recordLlm`). The dispatcher in `llm-client.ts` is a 3-line branch. Reuse ledger avoids a parallel harness (knip would flag duplication). The recorder-tap doing double duty (cassette + cost + per-agent-seam observation) is good depth, not overload.

**7. Failure-Mode Coverage — 7.** Fail-closed paths are well covered: missing cassette → `CassetteMissError` (throw, never network fallthrough); missing key in record → fail closed; cost cap → hard-abort mid-run. Security & abuse block addresses secret-handling, input-trust (env-gate), SSRF/path-traversal (N/A, fixed paths), fail-open. **Gap:** S3 thinking-state observability under instant replay is not addressed (WARNING-1). The negative-proof Term-2 mixes two failure modes in one assertion (WARNING-2).

**8. Simplicity / Over-Engineering — 8.** Design-it-twice §A/§B/§C are genuine (each rejected alt has a real reject reason, not a strawman — §A's constructor-injection alt correctly notes the zero-arg `new BuiltinHarnessAdapter()` prod path makes injection costly). Config clone (§C) over-justified at ~40 lines but the CI-vs-local env-contract separation argument is sound given PR#301. No premature abstraction. Minor: the §5 "Decision:" entries leave two reference sites with an OR-then-decide framing that reads slightly unresolved (suggestion).

**9. Verifiability — 7.** Every AC has a concrete method (A1 unit / A2 integration / A3 e2e / smoke:ah6 live / ah6-assert-budget / grep-guard / §7 negative). Red-tests-first ordering present (Phase A before B). protectedTests populated (broken-stream test, AH3 no-key path, DOM-snapshot net). **Deductions:** S3's visible→not-visible assertion is racy under replay with no stated mitigation (WARNING-1); A2's "stubbed callLlm" needs the stub to assert the model id that *reached* it, and the plan should name the assertion target precisely (suggestion).

---

## WARNING

- **[plan §2 S3 / §7 / Verifiability]** **Thinking→answered transition is racy under instant replay.** Verified: `AssistantOverlay.tsx:536` `isThinking = lastMessageIsHuman && (Date.now() - lastMessage.createdAt < ASSISTANT_TURN_TIMEOUT_MS)`, and the thread updates via WebSocket subscription (`useAssistantThread.ts:127` `ws.subscribe("thread:…")`), not polling. Under replay `callLlm` returns with zero network latency, so the human-message push (isThinking→true) and the assistant-message push (isThinking→false) can land in the same/adjacent event-loop tick — the `getByText(/thinking/i)` *visible* assertion may never catch the row. The plan asserts visible THEN not-visible (S3) with no mitigation. → **Fix:** add an explicit observability strategy to §2/§7 — e.g. `recordLlm`/`replayLlm` honor an `LLM_REPLAY_DELAY_MS` (small, e.g. 150ms) so the thinking row is reliably paintable in the replay lane, OR weaken S3 to assert only the terminal state + a non-racy thinking signal (the human message present + reply landed), OR drive S3 via Playwright's `toBeVisible` with a deterministic delay injected at the cassette layer. Name which, so the builder doesn't ship a flaky gate.

- **[plan §7 Term 2]** **Negative-proof Term-2 conflates two failure modes in one assertion.** It says "inject a `callLlm` that throws / returns empty content via `LLM_CASSETTE_MODE=replay` against an empty cassette → `CassetteMissError` (replay) OR an error completion → persists `provider_error` notice, NOT a real reply; assert S1 distinct-reply predicate fails." A `CassetteMissError` (throw) and an empty-content completion are different runtime paths that persist different states; an OR-assertion can pass on the wrong branch and still look green. → **Fix:** split into two deterministic sub-assertions: (a) empty cassette → `CassetteMissError` thrown and turn persists a failure notice (no assistant reply appended); (b) a recorded-but-empty-content response → S1 distinct-reply predicate is `false`. Assert each path's persisted state explicitly, not via an OR.

- **[plan §1 / Layer Integrity / §B3]** **Cassette read locality.** Cassettes live under `packages/web/e2e/cassettes/` but `replayLlm`/`recordLlm` run in `packages/server`. The server interceptor must therefore resolve a path into the web package (or receive it via env), which couples server-side code to a web-package directory layout. Plan §1 says "fixed repo-relative constant per scenario" but does not name how the server module learns the path. → **Fix:** specify the path-passing mechanism — env var `LLM_CASSETTE_DIR` set by the AH6 Playwright config (`webServer.env`), with the server interceptor reading only from that env (no hardcoded `../web/...` reach). Keeps the server module free of a web-package path literal and keeps the choke point env-gated end-to-end.

---

## SUGGESTION

- **[plan §4 / A2]** Name the A2 stub assertion target precisely: the stub `callLlm` should capture `options.model.model` and the test asserts it equals the seeded per-agent OpenRouter id (NOT a `BUILT_IN_GATEWAY_CONFIG` tier id). The plan describes this in prose; state it as the literal assertion so the red test is unambiguous. Note `resolveProvider(provider, agent.modelId, …)` (gateway L197) is what carries the id through — assert on the resolved `model.model`, since `agent.modelId` becomes `resolved.model`.

- **[plan §3 cost wiring]** The recorder derives cost from `usage × model rate`. Name the rate source — `trackUsage`'s existing rate table vs. a recorder-local constant. If the recorder re-implements the rate lookup, that's a second source of truth for pricing; prefer reusing the adapter's `trackUsage` cost figure (the plan hints at this but leaves "Two reuse options" partly open). Pin one.

- **[plan §5]** Two reference-cleanup rows still read as "OR … **Decision:**" — the decisions ARE made, but the OR-framing invites a builder to re-litigate. Trim to the chosen action only (retire `ah5-smoke-local.ts`; keep `ah5-*.spec.ts` under the renamed config).

- **[plan §1 keying]** The `:nitro`/routing-suffix strip before hashing is a nice touch but is a normalization the A1 unit test does not currently name. Add an A1 case: two requests differing only in the OpenRouter routing suffix hash to the SAME key.

---

## What's Working Well

- **Every load-bearing claim is backed by a real code citation, and all four held under independent verification.** The R-1 discovery (production `createServer` never wires `assistantTurnDeps`, so the trigger is a silent no-op through the lane) is exactly the class of gap that let AH5 ship the headline interaction proven only by mocks — the plan caught it, scoped the fix additively, and made it the first green task. This is the single most valuable thing in the plan.
- **Fail-closed discipline is thorough and correct:** missing cassette throws rather than falling through to network (preserving the offline/no-key invariant), cost cap hard-aborts mid-run, missing key fails the live lane. The dangerous failure mode (replay silently hitting the network) is explicitly identified and structurally prevented by the env-gate + throw.
- **Local-only live lane is unambiguous** — `smoke:ah6` only, no GH Actions workflow, R-6 cites the PR#301 revert directly. The AH5 CI-vs-local mistake is not repeated, and §C's config-clone rationale defends the separation at the architecture level.

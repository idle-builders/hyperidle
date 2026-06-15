# AH3 — Architecture Critique (reviewer, Phase 2)

Score: **8 / 10** — PASS (≥7). The plan correctly diagnoses three independent root causes (all verified in code: no trigger, assistant agent lacks harness/model, overlay doesn't subscribe), reuses harness/stream/resolve machinery without inheriting the task state machine, and maps every AC to a concrete mechanism. Two WARNINGs concern fire-and-forget durability and the cross-harness persona-equality proof; the streaming-AC question is adjudicated below as acceptable, not a blocker.

## 9-dimension scoring

| Dimension | Score | Note |
|---|---|---|
| Layer integrity | 9 | Trigger sits in the Meta/server layer; `runAssistantTurn` reuses AdapterPool (Agent Runtime) downward only. No layer reaches past its neighbor. |
| API/contract fidelity | 8 | Route checklist concrete; `createThreadRoutes` gains optional `assistantTurnDeps`. Plumbing through `server-factory`/`app` named. |
| Data model | 8 | PlainPayload `notice?: {kind, code?}` extension chosen over new MessageType — correct (minimal blast radius). Migration backfills `ast-*` rows. |
| Decoupling (design-it-twice) | 9 | §A (task-free turn) and §B (extend PlainPayload) both argued with real reject reasons. Strongest part of the plan. |
| Reuse / no-dup | 8 | Reuses resolveAgentModel, AdapterPool, streamEvents, composePrompt sibling. R1 flags harness-start duplication with a 30-line extraction trigger. |
| Error handling | 7 | Three classes mapped to detection points; secret-scrub boundary explicit. **But fire-and-forget durability is under-specified (W1).** |
| Testability / AC coverage | 8 | Every AC has a verification row. Cross-harness equality test is the right proof — **but its mechanism is shaky (W2).** |
| Security/abuse | 8 | Re-entrancy guard sound (senderId is server-derived from Principal, not client-supplied — verified). Secret boundary correct. In-flight single-turn guard noted. |
| Risk transparency | 9 | R1–R4 honest; AH2-overlap (R2) and streaming-granularity (R3) flagged for exactly this review. |
| **Avg** | **8** | Solid, ship-able plan. Two WARNINGs to close before build. |

## Adjudication of the six required risks

1. **Streaming AC — ACCEPTABLE, not CRITICAL.** AC wording: "visible, streaming response." The thinking→answered transition delivers a *visible progressive state* that resolves to a real model reply distinct from the seeded welcome — which is what the Playwright proof (scenario 1) actually asserts. Token-granular streaming is gold-plating for a 360px single-founder overlay and adds a WS event type + buffer for marginal value. **Verdict: thinking-indicator + landed-reply satisfies the AC.** Builder must deliver, to pass: (a) "Assistant is thinking…" row appears on send before any assistant message; (b) it is *replaced* (not appended-below) by the assistant `plain` reply via `thread_message_appended`; (c) the reply text is provably a real model call, not seeded/echoed. If the Playwright assertion only checks "a message appeared," that's insufficient — it must assert the reply differs from the welcome text (scenario 1 already says this). Lock that assertion.

2. **Fire-and-forget reliability — WARNING (W1).** See below.

3. **Persona consolidation — MOSTLY SOUND, one gap (W2).** Canonical source `users.soulPrompt` on `ast-{userId}` is correct and single. Removing the Settings→Agents editor for `role==="assistant"` is the right "removal beats sync." **But:** the route checklist hedges — "Settings → Agents agent PATCH … reject soul write for `ast-*` (or UI omits — confirm one is enough)." UI-only omission is NOT enough: the PATCH endpoint must *reject* a soul write to an `ast-*` agent, else the "exactly one editing surface" AC is defeated by a direct API call. Make the server-side reject mandatory, not "or." (W2 also covers the equality proof.)

4. **Error specificity without leak — SOUND.** Verified: `MissingCredentialError` and `NoEligibleHarnessError` are distinct classes in `shared/errors.ts`; `resolveAgentModel` throws the former, `adapterPool.select()` returning null maps to the latter, harness `error` event → `provider_error`. The three classes ARE distinguishable at the point the notice is created. Class→fixed-copy mapping (never `error.message`) closes the leak. Good.

5. **E2E provability — ADEQUATE with a caveat (N1).** WS subscribe pattern exists in `useThreadDetail` and runs against the real server in Playwright. The turn runs server-side via the same AdapterPool; AH5 supplies a real key. The plan correctly defers the live-key screenshot to AH5's lane. Caveat: the `assistantTurnDeps`-absent no-op path means a pure-chrome test sees NO reply — fine, but the plan must ensure AH5's lane wires real deps end-to-end (it says it does). N1: confirm AH5 actually threads `assistantTurnDeps` in its server boot, or the live proof silently no-ops.

6. **AC completeness — COMPLETE.** All five ACs + four validation scenarios map to concrete mechanisms in the AC→verification table. No unmapped AC. The textarea AC's "shared style" is correctly read as "migrate both raw instances onto the design-system Input" + a grep-lint guard.

## WARNING

- **W1 — Fire-and-forget durability under-specified.** `void runAssistantTurn(...).catch(persistTurnFailure)` covers a thrown/rejected promise → a notice is persisted. **Two holes:** (a) **server crash mid-turn** leaves the user message with no reply and no notice — on restart nothing re-drives it; the overlay shows "thinking…" forever (the indicator is client-transient, but a reopened overlay with no reply reads as silence, violating "never silent"). (b) The **in-flight guard is an in-memory set** (§199) — it does not survive restart and does not bound a turn that hangs without throwing (no timeout specified). **Fix the plan to specify:** a turn timeout that maps to `provider_error` on expiry (so a hung provider call still produces a notice), and an explicit decision on crash-recovery — either accept it (document that a crashed turn requires the user to re-send, and ensure the stale "thinking…" indicator clears on overlay reopen rather than spinning forever) or add a minimal re-drive. The "never silent" AC is the whole point of this WP; a hung/crashed turn is the one path that can still be silent.

- **W2 — Cross-harness persona-equality proof mechanism is hand-wavy.** AC3 demands the persona is "provably the persona the running agent uses, regardless of which harness." The plan's proof (§4) "runs the same persona through both adapter paths and asserts identical persona text reaches the model boundary." **The two paths are not symmetric:** builtin consumes `config.composedPrompt` (a string — easy to assert, verified the field exists); SDK reads CLAUDE.md *from the workspace cwd* (verified: `writeWorkspaceCLAUDEmd` writes a file, adapter auto-discovers it). Asserting "identical text reaches the model boundary" for the SDK path means either (a) asserting the *file content written* equals `composeAssistantPrompt` output (a write-side assertion, which proves the string is identical but NOT that the SDK actually injects it), or (b) intercepting the SDK's actual system-prompt assembly. The plan should state which, and it should be (a)+(b)-lite: assert `composeAssistantPrompt` output is byte-identical to both the builtin `composedPrompt` and the bytes written to CLAUDE.md. That is provable and sufficient. As written, "reaches the model boundary identically" overclaims for the SDK side. **Fix:** specify the equality assertion as `composeAssistantPrompt(soul) === builtin.config.composedPrompt === readFileSync(CLAUDE.md)` — single-source byte equality, not a runtime model-boundary intercept. Also: make the Settings→Agents `ast-*` soul-write *server reject* mandatory (per risk-3 above), not "UI omits or reject."

## NOTE

- **N1 — AH5 dep-wiring is load-bearing for the live proof.** The no-op-when-`assistantTurnDeps`-absent design means the entire live path silently does nothing if AH5's server boot forgets to thread the deps. Flag to AH5 explicitly as a required step, not an assumption.
- **N2 — R2 (AH2 sharedFile overlap on `users.ts`).** The assistant-agent-defaults backfill (task 1) edits the same insert AH2 may touch. Plan flags it; ensure pipeline serializes or the two branches collide on `users.ts`.
- **N3 — `persistTurnFailure` default → `provider_error`.** Reasonable, but means an *unexpected* internal error (e.g., a bug in context-building) is surfaced to the founder as "the model provider returned an error" — misleading. Low-stakes for a single-founder app, but note it: the default class should be the most-recoverable framing, and a genuine internal error masquerading as a provider error could send the user chasing the wrong fix (clicking Retry forever). Acceptable for now; worth a `console.error` on the unmapped branch so the real cause is debuggable.

## Verdict
Pass at 8. The diagnosis is correct and verified against code; the decoupling reasoning is strong; AC coverage is complete. Close W1 (turn timeout + crash/hung-turn "never silent" guarantee) and W2 (concrete byte-equality persona proof + mandatory server-side `ast-*` soul-write reject) before the builder starts — both are plan-text additions, not redesigns.

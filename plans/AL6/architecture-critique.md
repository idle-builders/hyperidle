## Architecture Critique: AL6

ARCHITECTURE-SCORE: 6/10  rounds=1  score-line: SA:5 LI:9 AC:7 DM:8 N:8 MD:8 FMC:6 S:8 V:5

Verdict: **NEEDS-REVISION.** One CRITICAL falsifies the load-bearing AC4 claim ("exactly two drain sites"); fixing it is mechanical but mandatory before build. Two WARNINGs on verifiability/exemption-wiring. Everything else is strong.

---

### CRITICAL

- **[concept §3.2 / arch §2 + §2.3] The "exactly two drain sites" claim is FALSE. There is a third turn-finalizing site the plan never enforces — direct AC4 violation.** I independently grepped every `streamEvents` consumer (non-test). Five sites consume the stream:
  1. `session-provisioning.ts:760` — task session drain (plan's site A) ✓
  2. `assistant-turn.ts:661` `drainStreamEvents` — assistant turn (plan's site B) ✓
  3. **`bet-decomposition.ts:616` `drainForCompletion` — UNNAMED.** This runs a *complete, independent PM agent turn*: `selected.adapter.startSession(sessionConfig)` (a real agent, real system prompt, real model tier `workhorse`) → drains `streamEvents` for the completion JSON → `stopSession`. It is unambiguously "an agent turn on a harness." It ends by returning raw JSON and **never invokes a return action** — exactly the silent-escape AL6 exists to close.
  4. `isolated-session-worker.ts:54` — forked-child relay: drains `ClaudeAgentSdkAdapter.streamEvents` and forwards events over IPC. Not an independent finalizer (its events re-surface to site A via `IsolatedHarnessAdapter`), but it IS a `for await … streamEvents` and the §2.3 lint guard would flag it.
  5. `remote-harness-adapter.ts` / `isolated-harness-adapter.ts` internal forwarding — adapter-internal relays.

  The spec is unambiguous: "Every agent turn, on **every** harness, ends by invoking one of a defined, closed set" and "enforcement holds uniformly **regardless of which harness produced the turn**." Bet-decomposition is a turn the plan's two-site wiring structurally cannot see.

  **Fix (pick one, state it in the plan):**
  - **(a) Wire it.** Add a task: thread the gate (or its relay-exempt variant) through `drainForCompletion`. But note bet-decomposition is a *contract-coerced* turn (must return a JSON array, tools `[]`) — forcing a return action would break it. So more likely:
  - **(b) Explicitly exempt it with a defensible boundary, and encode that boundary in the closed model.** Define what distinguishes a "reviewable work turn" (gated) from an "internal extraction turn" (exempt: no tools, deterministic structured-output contract). The concept §1.1 currently says "a turn = one harness session run" with NO such carve-out — so this exemption must be added to the concept, not hand-waved. Without it, AC4 ("every harness") is provably unmet and the §2.3 lint guard contradicts itself (it will flag sites 3/4/5, forcing either suppression comments — drift — or wiring).
  - **Either way:** the plan's framing "verified by grep: only two" must be corrected. It was not verified; the grep returns five consumers. This is a CC-007 spec/codebase-drift instance caught in the plan, exactly where it should be.

---

### WARNING

- **[arch §2.3 — single-seam lint guard] The guard is named as AC4's load-bearing decision but its target set is wrong given the CRITICAL above.** A `for await (… of <expr>.streamEvents(…))` AST rule will fire on sites 3, 4, and 5 — all legitimate drains the plan does not gate. The plan must either (i) gate them, or (ii) define the allowlist/exemption convention the rule honors, *before* T9 is buildable. As written, T9 either fails to compile clean or forces `eslint-disable` comments on three sites — which is precisely the "forgotten drain site" drift the guard was meant to prevent, inverted. Re-scope T9 after resolving the CRITICAL.

- **[arch §5 AC2 — "type/lint guard" mislabeled as a test] The AC2 verification mixes a runtime value-assertion test with a claimed "static property."** `expect([...RETURN_ACTION_NAMES].every(n => ALL_TOOL_DEFINITIONS.some(d => d.name === n)))` is a unit test importing two constants and asserting on values — legitimate, and correctly defended in the plan. But the row header calls it "static property → Type/lint guard," and the CLAUDE.md rule is that a *static property* uses lint/type, not a test. The closure check (`every name is a real tool`) genuinely IS runtime-testable-via-import (allowed). The *closedness* (`ReturnActionName` is a finite union, not widenable to `string[]`) is the static property and is correctly the `as const` type. The plan is actually doing the right thing — but the table's "static property" label invites a builder to write a `readFileSync`/grep "lint" where a value-import test is correct. Re-label AC2's method as "unit test (value assertion on imported constants) + `as const` type" to remove the ambiguity. (No `readFileSync` test, per CLAUDE.md.)

---

### SUGGESTION

- **[arch §2.1 — aborted exemption wiring] The `aborted` exemption is not a distinct teardown branch in code.** Verified at `session-provisioning.ts`: `aborted` does `break` (line 767) and then falls through to the *normal* `endSession` path (line 923) — the same path as genuine completion. `crashed` (897) and `budgetExhausted` (911) are distinct branches; `aborted` is not. So the builder must read the `aborted` flag *at evaluation time* to map normal-fall-through → `"stopped"` vs true completion → `"completed"`. The plan names `aborted` as an endReason input (correct) but should explicitly note it is NOT a separate teardown branch, to prevent the builder from looking for one and mis-mapping abort to `"completed"` (which would spuriously flag an intentional handoff-abort as `not_returned`).

- **[arch §3 — event path] Plan says `SessionNotReturnedEvent` lives in `packages/shared/src/events/` (a directory).** The events actually live in the single file `packages/shared/src/events.ts` (verified: `SessionStartedEvent`/`SessionEndedEvent` at lines 33/44, plus the `DomainEvent` union and bus type map there). Minor path correction; intent ("alongside session events, same pattern") is right. The new event's shape matches `SessionEndedEvent` field-for-field (good).

- **[concept §4.2 / arch §2.4 — MCP risk] The MCP-bridge risk (T7) is REAL but the primary path already holds — verified.** `claude-agent-sdk-adapter.ts:272-277` emits `{ type: "tool_call", toolName: block.name, args }` into the stream for every `tool_use` block *even when MCP performs the actual invoke* (confirmed by the X5 comment at lines 238-240 and the `interceptToolCalls` logic at provisioning:757). So the gate observing `streamEvents` WILL see return tool_calls on the CLI/SDK/remote MCP path. The `registry.invoke` fallback (§2.4) is sound and agnostic but, on this reading, **unnecessary** — T7 will likely confirm the stream surfaces it. Keep T7 as a proof, but the architecture can state with confidence the fallback is a contingency, not the expected path. Good that the plan kept it conditional.

- **[concept §2 / arch §1] Closure boundary is defensible.** The three return tools (`submit_review`, `handoff_to`, `send_message`) map to real registered tools (`submit-review.ts:128`, `handoff-to.ts:86`, `send-message.ts:51`; all in `assistant-tools.ts` registry). The "surfaces output to a human-attended surface" test cleanly excludes `create_artifact`/`write_memory`/`update_task_status` (non-terminal) — the deferral of argument-gated `update_task_status` via the pre-wired `_args` predicate is the right call for a name-only v1 set. No widening risk.

---

### What's Working Well

- **The seam choice is genuinely correct and well-argued.** Observing the existing `ToolCallEvent` (`{type, toolName, args}` — verified at `harness-events.ts:13-17`) adds zero new adapter method and zero new event the adapters must emit. The observer-in-loop-vs-wrapper-iterable trade-off (§7) is real, quantified, and lands on the right side (one line per loop, no duplication of cost/tool/error branch logic). This is the high-leverage decision and the plan nailed it.
- **Exemption model (crashed/aborted/budget_exhausted) maps cleanly to the actual teardown branches** in `session-provisioning.ts` (verified) — the gate evaluation slots into the normal-completion path without touching `endSession`. Additive `returnVerdict?` on `ProvisionSessionResult` lets tests assert without parsing the bus. No DB, no migration, verdict/thread grammar untouched — every hard constraint from the spec respected.

---

## Round 2

ARCHITECTURE-SCORE: 8/10  rounds=2  score-line: SA:8 LI:9 AC:8 DM:8 N:9 MD:8 FMC:8 S:8 V:8

Verdict: **APPROVED.** The CRITICAL is closed with a sound, source-verified property-based exemption. Both WARNINGs resolved. One residual SUGGESTION on the lint-rule AST target (builder-implementation detail, not a plan defect) and a re-confirmation note. Builder proceeds.

### Finding 1 (CRITICAL — third drain) — RESOLVED

Independently re-verified in source, not taken on the designer's word:

- **`drainForCompletion` runs with `tools: []` — CONFIRMED.** `bet-decomposition.ts:564-573` builds `sessionConfig` with `tools: []` (line 570), `modelTier: "workhorse"`, passes it to `startSession` (575); `drainForCompletion` (612-625) consumes only `completion`/`error` events and returns raw text for `JSON.parse`. The exemption's one machine-checkable leg is true in source. The exemption is valid.
- **Exemption is a PROPERTY, not a file allowlist — CONFIRMED.** Concept §1.5 defines a three-property predicate; arch §2.3 implements `isInternalExtractionDrain(config) → config.tools.length === 0` as the machine-checkable leg, with deterministic-parse + platform-internal as call-site contracts the empty-tools leg implies (a tool-less run cannot invoke a return and cannot act on the user's behalf). A future `tools:[]` extraction drain is auto-covered. No per-call-site special-casing rots.
- **AC1 boundary is tight enough that a real agent turn can NEVER satisfy the exemption — CONFIRMED, and this is the decisive point.** A return action is *itself a tool invocation*. A run with `tools: []` therefore **structurally cannot invoke a return action** — enforcement is not skipped, it is undefinable. The exemption set is exactly "runs where the gate's question has no answer." A genuine user-facing agent turn does real work via tools and returns via a (tool) return action, so it always has a non-empty tool surface. The boundary cannot leak a real turn. AC1, restated in concept §1.5 as quantifying over turns-that-are-not-extraction-drains, is now precisely true rather than false-by-omission. This is the correct resolution (option b), and the reasoning for rejecting option a (you would have to invent and inject a return tool into a contract whose entire point is "emit JSON," firing `not-returned` forever) is airtight.
- **The "exactly two, verified by grep" overclaim is corrected.** Concept §3.2 and arch §2 now carry the re-grepped five-loop enumeration with the honest note that the prior count missed the third turn drain. Drift-in-the-plan caught where it should be.

### Drain enumeration — INDEPENDENTLY RE-CONFIRMED

I re-grepped `for await … streamEvents` (non-test) myself. **Exactly five consumption loops, matching the designer's claim:**

1. `session-provisioning.ts:760` — enforced turn drain (site A). ✓
2. `assistant-turn.ts:665` — enforced turn drain (site B); RHS is `const stream = adapter.streamEvents(handle)` (661) looped at 665. ✓
3. `bet-decomposition.ts:617` — exempt extraction drain; `const stream = adapter.streamEvents(handle)` (616) looped at 617; config `tools: []`. ✓
4. `isolated-session-worker.ts:54` — forwarding relay; body is `process.send?.({ type: "event", event })` only — verbatim re-emit, no completion-parse. ✓
5. `desktop-worker-client.ts:223` — forwarding relay; body is `this.ws?.send(JSON.stringify({type:"event",…}))` only — verbatim re-emit. ✓

Every other `streamEvents` hit is an adapter *method definition* (builtin/cli/remote/isolated/sdk/mock) or a comment — not a consumption loop. **No other unexempted turn drain exists.** Confirmed.

### Finding 2 (WARNING — lint guard scope) — RESOLVED

Re-scoped T9 / §2.3.1 to a three-way classifier (turn-drain → must `observe` + `evaluateReturn`; forwarding-relay → must NOT; exempt-extraction-drain → must NOT) keyed on sanctioned markers (`// AL6-relay`, `// AL6-exempt`) plus structural signatures. This is sound: relays and the extraction drain are explicitly recognized as intentional, so the rule fires `eslint-disable` on nothing. The marker-abuse hole ("a marker silences a real turn drain") is closed by the companion **value-import unit test** (T6b) asserting the `AL6-exempt`-marked drain's config genuinely has `tools: []` — the marker cannot lie. Verified the relay loop bodies are pure forwards and the extraction config is `tools:[]`, so all three marker assignments are honest. Sound.

### Finding 3 (WARNING — AC2 label) — RESOLVED

AC2 re-labeled "value-import unit test (+ type)" (arch §5 row + footer), with the explicit builder instruction: "the builder must NOT write a `readFileSync`/grep 'lint' for this; the value-import test is the correct and required form." The closedness leg is correctly assigned to the `as const` union type (a `check`-time guarantee), the closure leg to the import-and-assert test. Ambiguity removed. Matches CLAUDE.md (static property → type, not a `readFileSync` test).

### Residual SUGGESTION (non-blocking — builder note, not a plan defect)

- **[arch §2.3.1 — lint rule AST target misses the `const stream` indirection]** The rule is specified to key on "a `ForOfStatement` with `await` whose right-hand side is a `CallExpression` to `.streamEvents`." But **two of the five loops do not match that shape**: sites B (`assistant-turn.ts:665`) and C (`bet-decomposition.ts:617`) assign `const stream = adapter.streamEvents(handle)` and then `for await (const event of stream)` — the loop's RHS is the identifier `stream`, a `CallExpression` to `.streamEvents`. An AST rule matching only direct `.streamEvents()` in the for-of RHS would silently skip site B (a real enforced turn drain that MUST `observe`) and site C — re-creating the exact "forgotten drain" blind spot the guard exists to prevent, this time in the guard itself. The builder must implement the rule to also resolve a one-hop `const`-bound `streamEvents()` iterable (or, simpler and more robust, key the rule textually/structurally on the loop being a `streamEvents` drain via local binding resolution). The §2.3.1 **marker+grep fallback** has the same literal-line risk and must likewise match across the assignment, not only same-line `for await … streamEvents`. This is an implementation instruction, not a soundness gap — the three-way classification model is correct; only its AST predicate as worded is too narrow. Flagging so T9 is built against all five real loops, not the three that happen to be single-expression.

### Score movement

SA 5→8 (the missed third drain and false "two sites" framing are corrected; the seam now provably covers all turn drains). AC 7→8 (AC1 now precisely true under a tight, leak-proof exemption; AC4 guard re-scoped to not self-defeat). FMC 6→8 (the lint-guard failure mode — forcing `eslint-disable` on relays — is resolved by per-kind classification + marker-honesty test). V 5→8 (verifiability of each AC is now unambiguous; the one residual is a builder AST-target note, not an unverifiable claim). N 8→9 (concept's "turn vs internal-extraction drain" noun split is clean and load-bearing). Remaining points held off a 9/10: the §2.3.1 AST-target narrowness is a real (if mechanical) trap that, if the builder follows the wording literally, reopens the blind spot — so the verifiability dimension is strong-but-not-airtight until T9 lands against all five loops.

---

## v2 (hook-based return forcing — re-architecture critique)

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:8 N:9 MD:8 FMC:8 S:8 V:7

Verdict: **APPROVED (8/10).** v2 actually FORCES (not flags), uses the real SDK `Stop` hook, and proves it on a live agent. All three v1-rejection gaps are addressed at the contract level. Two WARNINGs are real plan defects (a false claim about `endSession` + an eval type that can't carry the verdict it must assert) that the builder MUST fix in T6/T9 — but they are mechanical, not architectural, so they do not block approval. The two-tier guarantee is coherent; the SDK hook API is verified against installed source; the live eval is genuinely on a Tier-1 force path.

### Source-verification of the six load-bearing claims

1. **SDK `Stop` hook API — VERIFIED.** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`: `Options.hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>` (:1318); `HookEvent` union includes `'Stop'` (:757); `HookCallback => Promise<HookJSONOutput>` (:743); `SyncHookJSONOutput` (:5540) carries `decision?: 'approve' | 'block'`, `reason?: string`, `continue?: boolean`, `stopReason?: string` — exactly as the plan quotes. `StopHookInput` has `hook_event_name:'Stop'`, `stop_hook_active`, `last_assistant_message?`. The plan's type quotes are faithful to source. The designer's `⚠️ UNVERIFIED-AT-RUNTIME` flag is **honestly scoped**: the *type* permits `{decision:"block",reason}` but the *type does not prove the in-process callback's block-decision is honored at runtime* (the documented `decision:block` Stop semantics come from the settings.json/stdout-JSON hook protocol, not the in-process SDK README). T7 (a real `query()` run asserting re-prompt) is the correct gate to close it. **Not a CRITICAL** — Tier-1a does not collapse; the API exists and is correctly shaped; only runtime honoring is pending proof, and the plan names the exact test that proves it.

2. **Two-tier guarantee holds uniformly (AC4) — SOUND, with one builder-trap (WARNING-A below).** `SessionOutcome` is a real union (`shared/src/events.ts:42`, `"completed"|"crashed"|"stopped"`) and the additive `not_returned` member is schema-safe (`sessions.outcome` is `text("outcome")` free-text at `db/src/schema.ts:261` — "No DB change" holds). The force→reject fallback is coherent and non-looping: the SDK hook allows the stop once `forceCount >= AL6_MAX_FORCE_RETURNS` (=2), the drain then sees `returned===false` and applies Tier-2 reject — bounded, no infinite loop, mid-turn side-effects preserved (concept §3.4 hard rule 3). No path lets a Tier-2 turn settle `completed` without a return *provided WARNING-A is fixed*.

3. **Builtin re-injection (Tier-1b) is reachable — VERIFIED.** `builtin-harness-adapter.ts` owns its loop: `runChatTurn` `while(true)` (:454) emits `completion` then `break`s (:508-527); `runLoop`'s task loop `while(!session.done && iterationCount<maxIterations)` (:369) is the second terminal break. The plan §1.2 correctly names BOTH break points. `executeToolCalls` (:702) iterates tool calls so `returnSeen` via `isReturnAction` is trackable there. The re-inject-then-`continue`-instead-of-`break` point is real. Tier-1b is not fiction.

4. **Live eval is a REAL live-LLM eval — SOUND, with one type gap (WARNING-B below).** `runEvalSession` (`eval/src/provision-harness.ts:47`) registers `BuiltinHarnessAdapter` (:60) and calls the real `provisionSession` with a real model — Tier-1 force path. `submit-review.ts` is the exact pattern the plan mirrors (`seedMinimalWorld` + agent system prompt + `judgeSessionCompleted`/`judgeSubmitReviewCalled`). The §6 `fr-forced-return-builder` scenario (prompt that *tempts non-return*, assert ≥1 `AL6_FORCE_RETURN_MESSAGE` injected, assert return-eventually OR `not_returned`, assert NOT `completed`-with-`not_returned`-verdict) **would have caught the v1 bug** (v1 settled `completed` + side event — judge #3 fails on exactly that). The eval is on the force path, not stubbed. The SDK path being proven by T7-behavioral rather than in-eval is a defensible trade-off (the force *guarantee* is identical across Tier-1 mechanisms; SDK-in-eval is a larger harness lift). Founder's DoD ("live eval") is met by the builtin force eval.

5. **Verification methods correct per CLAUDE.md — YES.** Runtime behavior (forcing, reject, mid-turn) → integration tests + live eval. AC2 closure → value-import unit test (not grep). Static properties (`SessionOutcome` exhaustiveness, classifying lint guard) → `check`/`lint`, explicitly "not a test" (§4 tail, §5). No `readFileSync`-as-test. Correct.

6. **T1–T10 buildable, v1 keep/replace boundary clean — YES.** Dependency order is sane: T1 (shared) → T2 (exhaustiveness + per-adapter cap bit) → T3 (red) → T4/T5 (force paths) → T6 (drain reject) → T7/T8 (SDK + MCP proofs) → T9 (eval) → T10 (lint guard). The v1 reconciliation table (§0.2) is honest: `ReturnGate`/`evaluateReturn`/`session_not_returned`/`RETURN_ACTION_NAMES` KEPT as detection core; only the *response* at the drain (the rejected `:973` `endSession(...)` → implicit `completed`) is REPLACED. No dead `return-gate` code dangles; no half-migrated drain (the single drain decision stays at site A, §1.4). The v1 honest-revert already landed (`:961-986` currently emits event then settles `completed` — the exact rejected shape v2 replaces).

### WARNING

- **[WARNING-A — arch §1.4 + §3: the `endSession` "already takes an optional final outcome arg" claim is FALSE; the session ROW will still write `completed` unless T6 widens the signature.]** Verified `session-lifecycle.ts:248`: `endSession(db, eventBus, context, costInCents, baselineCost?, routineRunOutcome?: "budget_exhausted")`. The 6th arg is typed `"budget_exhausted"` and is consumed ONLY by `updateRoutineRunOnSessionEnd` (:308) — the **routine_run** row. It does NOT touch the session row write, which **hardcodes `outcome: "completed"`** at :276 AND the `session_ended` event `outcome: "completed"` at :295. Moreover `budget_exhausted` never flows through `endSession` at all (that path returns at provisioning :944 before calling it). So the plan's "pass `not_returned` the same way" is doubly wrong. **Consequence if built as written:** `ProvisionSessionResult.outcome` would say `not_returned` but the persisted `sessions.outcome` row and the `session_ended` event would still say `completed` — the v1 bug surviving in the DB and on the bus. **Required T6 fix:** add a real terminal-outcome parameter to `endSession` that overrides BOTH the row `.set({outcome})` (:276) and the `session_ended` event `outcome` (:295), defaulting to `"completed"`. This is mechanical but load-bearing — it is the actual AC1 teeth at the persistence layer. Plan must correct the §1.4/§3 wording so the builder threads the outcome through the row+event, not the routine-run arg.

- **[WARNING-B — arch §6: `TriggerResult.outcome` is typed `"completed" | "crashed"` and cannot carry `not_returned`; judges #2/#3 cannot assert the verdict they're specified to assert.]** Verified `eval/src/types.ts:59`: `readonly outcome: "completed" | "crashed"`. The §6 eval judges must assert "outcome settled `not_returned` (never `completed`)" (judge #2) and "did NOT end `completed` with `returnVerdict==='not_returned'`" (judge #3). The plan mentions adding "an additive eval-only field" for the *force counter* but is **silent on widening `TriggerResult` to surface the `not_returned` outcome + the `returnVerdict`** that judges #2/#3 read. `provisionSession` already returns `returnVerdict` (`session-provisioning.ts:231`) and (post-T6) `outcome: not_returned`, but `runEvalSession` currently narrows to `"completed"|"crashed"` (`@lore X7`, types.ts:54). **Required T9 fix:** widen `TriggerResult` to carry `outcome` incl. `not_returned` + the `returnVerdict` (or expose them via the additive eval field) so the three judges can read the verdict. Without it the eval cannot distinguish the v1 bug from a pass — defeating the whole point of making the eval the DoD. Mechanical, but the eval is non-functional as specified until fixed.

### NIT

- **[arch §0.3 + §3: cited consumer path `observability/events.ts:44` is imprecise.]** The file is `shared/src/observability/events.ts:44` (`readonly outcome: SessionOutcome`), not `server/src/observability/` (which holds only `services/observability/`). The consumer is real and the exhaustiveness guard applies; only the path string is off. Minor, but the builder enumerating consumers for the §5 `never` guard should use the correct path. Also: real outcome-discriminating reads are sparse (`agent-profile.ts:96,293` use `s.outcome === "completed"` DB-string filters, not exhaustive switches) — the §5 `never`-tail guard mostly bites at the *event/row write* sites (`endSession`) and the `ProvisionSessionResult` narrowing, which is where it matters. The plan's claim that "every switch consumer must handle it" slightly overstates how many true switches exist, but the guard is still correct and worth keeping.

### Verdict

v2 clears the bar v1 failed. It forces via the real, source-verified SDK `Stop` hook (Tier-1a) and the HyperIdle-owned builtin loop (Tier-1b); it rejects-as-`not_returned` where forcing is impossible (Tier-2); and it proves real forcing on a live agent via the builtin eval whose judges would have caught the exact v1 regression. The honest `⚠️ UNVERIFIED-AT-RUNTIME` scoping + T7 gate is the right engineering posture, not a dodge. **APPROVED at 8/10.** The two WARNINGs (`endSession` outcome threading; `TriggerResult` verdict surfacing) are mandatory T6/T9 corrections the builder must make — they are the difference between "outcome says not_returned in one in-memory struct" and "the DB row, the bus event, and the eval all agree the turn was not completed." Flag them to the builder as build-blocking-within-task, not plan-blocking.

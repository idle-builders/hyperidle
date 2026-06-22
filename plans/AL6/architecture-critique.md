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

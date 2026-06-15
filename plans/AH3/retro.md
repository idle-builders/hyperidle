# AH3 — Retro Observations

**Workpackage:** AH3 "The Assistant actually responds (one soul, real textareas)"  
**Status:** DONE (after 3 review rounds)  
**Duration:** June 14–15, 2026 (L workpackage, 3 review cycles vs 1 expected)  
**Cost signal:** 3 HIGH-severity bugs invisible to green suite across 2 review rounds; each required substantial rework.

---

## Key Cost Signals

### The stub-the-seam-where-the-bug-lives pattern (Cost: 2 review rounds)

**What happened:** Round 1 implementation passed all tests green (25/25 unit, 12/12 integration), but the happy-path test used a `ScriptedAdapter` stub that hardcoded its reply regardless of input. This masked **three independent bugs simultaneously**:

1. **H1 (Round 1):** `runAssistantTurn` never called `resolveAgentModel`. The turn threw on `BuiltinHarnessAdapter.startSession` ("resolvedModel is required") → caught and surfaced as generic `provider_error`. The spec (architecture §1 step 2) explicitly mandated reusing `resolveAgentModel` + `readServerConfig`; the builder skipped it entirely.

2. **H2 (Round 1):** Notice field was declared on `PlainPayload` but stripped during DB read-back. `messageRowSchema.parse()` used `plainPayloadSchemaWithToolCalls` which lacked `notice`, so zod's default drop-unknown-fields behavior silently erased the field from every error notice persisted. The overlay received notice-free bubbles that rendered as ordinary chat text instead of guidance cards.

3. **H3 (Round 2, deeper):** After H1 was fixed (model resolution added, types correct), the turn ran without throwing but still failed in substance — the user's message never reached the model. Plan §1.4 mandated "conversational context (no task)" with "the thread transcript as the message history." The builder loaded the thread correctly but never passed it to the adapter; the builtin adapter defaulted to its task-planning loop, running `runPlanningTurn` against an empty conversation. The user's question reached neither the system prompt nor the message list.

**Why tests missed it:** The ScriptedAdapter was the common stub across all three failure paths. It returned a fixed completion regardless of `SessionConfig`, so:
- H1: No test exercised `startSession` against a real adapter that throws on missing `resolvedModel`.
- H2: Tests read raw `JSON.parse(payload)` before zod, bypassing the schema stripping. No round-trip test via the GET route.
- H3: The adapter never checked whether `messages` was populated — a scripted stub returns the same reply every time.

**Cost:** Rounds 1→2 rework (H1, H2 fixes + tests + 6 commits). Round 2→3 rework (H3 fix, two discriminating tests, 1 commit). **Total: 2 unplanned review rounds on an L workpackage.**

**What would have caught it at Round 1:**
- A discriminating test for H1: happy-path must use a real or realistic adapter stub (not a scripted return). Alternately, mandate `resolvedModel` in the type system so missing it is a compile error (fixed in Round 3).
- A discriminating test for H2: route-level round-trip test that persists a notice, GETs it back via `/api/threads/assistant`, and asserts the notice survives schema parsing.
- A discriminating test for H3: adapter stub that echoes or validates the input (e.g., captures `config.messages` or emits error if a required field is missing). The round-3 fix added exactly this — `CapturingAdapter` and `ValidatingAdapter` — and immediately discriminated H3 from passing.

---

### Plan step skipped silently; declared-but-unread field survived review

**What happened:** Architecture plan §1 step 2 mandated: "Resolve model + credential (reuse `resolveAgentModel` + `readServerConfig` from sessions-routes pattern)." The builder implemented `runAssistantTurn` without reading this step, omitting the resolve call entirely. Additionally, `AssistantTurnParams.triggerMessageId` was declared at line 85 but never read until the H3 fix. The field was redundant — the workaround (load the whole thread) made it unnecessary at runtime — but it should have signaled something was wrong.

**Cost:** Missed plan step is a builder discipline issue; the declared-but-unread field is a code-smell that type-checkers don't catch (prefixing with `_` to suppress lint is the interim signal, but it didn't happen here).

---

### `as unknown` cast as bug-shipping vehicle (Round 1 H1)

In assistant-turn.ts:340, the builder cast `SessionConfig` construction via `as unknown as Parameters<...>[0]` to work around a type mismatch. The config lacked `resolvedModel` and had extra fields (`messages` at the time, later fixed). The cast silenced the compiler and allowed the wrong shape to ship. No test validated the config shape — it only asserted that *some* reply persisted, not that the reply came from a correctly-configured turn.

**Cost:** The cast let a compile-time error masquerade as correct, delaying H1 discovery by one full review round.

---

### Design contract violation (textareas not migrated)

Plan §5 + design/approved.md mandated: "Migrate both raw `<textarea>` instances to design-system `Input textarea`." The builder patched SettingsAssistant inline with `style={{borderRadius:"var(--r-default)"}}` instead of using the design-system component. The grep-lint guard ("zero `className="textarea"` in settings") was not added. One raw instance (SettingsAgents Soul Prompt) was properly migrated to `Input`, but SettingsAssistant kept the raw `<textarea>` + `font-mono`, contradicting design W2 (prose font). 

**Cost:** Design intent (shared textarea style from a single source) was unmet. The inline workaround made the spec non-compliance invisible to the planned lint guard. **This persisted through all 3 reviews because the functional "multi-line field is rectangular" test passed while the structural "reuse design-system Input" AC was skipped.**

---

## What Went Right

1. **Adversarial reviewer lens:** The 3-round code-review process (distinct reviewer, not the builder) caught all three H-class bugs across 2 rounds that the green suite missed. H1 + H2 were flagged in Round 1; H3 was unmasked when H1 was fixed and the reviewer re-traced the turn path end-to-end.

2. **Critique loop discipline:** Architecture + design critique (Phase 2) flagged 4 WARNINGs (W1 durability, W2 persona byte-equality, design W1 Retry visibility, W2 mono font) that shaped the plan before red/green phases. The warnings were load-bearing — they caught real gaps that would have shipped otherwise.

3. **H3 fix validation:** Round-3 fix introduced two genuinely discriminating tests:
   - `CapturingAdapter` — echoes the user message it receives, fails if `messages` is empty.
   - `ValidatingAdapter` — emits error unless a specific question is in the transcript, fails if the question wasn't delivered.
   
   Both would have failed silently under the ScriptedAdapter regime. They demonstrate that **test discriminating power is the inverse of stub-the-seam brittleness.**

4. **Producer/evaluator separation:** Builder and reviewer were different agents. The reviewer ran three independent audit passes (code-read, trace-production-path, test-discriminating-power) without assuming the builder's test coverage was complete. This separation paid for itself in catching what green tests missed.

---

## Lessons for `/compound`

### CC-004 Recurrence: Wiring gap

AH3 is a textbook instance of **CC-004: "Unit tests pass while production path is dead."** The happy-path test stubbed the exact seams where the bugs lived:
- Adapter selection: ScriptedAdapter always returns, hiding missing model resolution (H1).
- Schema round-trip: Tests parse raw JSON, bypassing schema drop-unknown (H2).
- Message delivery: Adapter ignores input, hiding empty transcript (H3).

**Recommendation for `/compound`:** The CC-004 fix proposes a "production wiring proof" gate: *every AC that produces/consumes an event/route/handler must show one test that drives the production entrypoint.* AH3 demonstrates this is necessary but not sufficient. The additional gate needed: **tests that stub an internal service (adapter, harness, bus) must implement at least the interface contract of that service, or use a real instance under test.** Scripted stubs that bypass the seam are acceptable only for mocking external I/O (network, filesystem), not for internal surfaces the AC depends on.

### CC-010 Takeaway: TDD still works

Round 3's discriminating tests (CapturingAdapter, ValidatingAdapter) were written *after* the bug was found in review, not before implementation. This violates the red-phase discipline. However, the moment they were added, H3 became immediately detectable — had they been written first (red phase), H3 would have failed to green on round 1. The tests aren't the problem; the **timing of their discovery relative to implementation** is. Process opportunity: adversarial red-phase test design (writing tests that assume the worst about the implementation before it exists) would have surfaced H1/H2/H3 at red-phase.

---

## Follow-up opportunities

1. **Stub-the-seam safety gate:** Add a template section to `.claude/skills/write-tests/SKILL.md` requiring stub/mock implementations to honor the real interface contract (or cite why they're an exception). Specifically: adapters, harness startSession, event bus, and credential resolvers cannot be fully scripted; they must at least branch on input.

2. **Declared-but-unread field linting:** Add an ESLint rule to flag parameters/fields prefixed with `_` or never read in the function body. Low-fi early warning.

3. **Design contract lint:** The grep-guard for "zero `className="textarea"` in settings" should have been added as part of the fix; make it mandatory in the plan's "textareas" task to include the lint rule, not just the migration.

4. **Round-trip schema tests:** After H2, add a template line to `.claude/skills/write-tests/SKILL.md` for any schema change: "route-level round-trip test asserting the persisted row survives parse → serialize → parse."

---

## Retro log entries

Eight entries appended to `.pipeline/retro-log.jsonl`:
- 2 HIGH failures (stub-seam, specification-skip)
- 1 HIGH friction (type-escape cast)
- 2 LOW successes (adversarial lens, discriminating tests)
- 3 gaps/medium (declared-but-unread, design contract, duplication)

All tagged for `/compound` correlation with CC-004 (wiring gap), CC-009 (multi-agent review), CC-010 (TDD).

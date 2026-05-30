# Architecture Critique: R5

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:7 DM:8 N:8 MD:8 FMC:5 S:7 V:8

---

## Dimension Scores

### 1. Spec Alignment (8/10)

All 5 ACs (task creation, review submission, verdict round-trip, cost display, status chips) map to plan tasks. The gap analysis in the concept is thorough and correctly identifies the 3 critical gaps (missing `create_task`, missing `submit_review`, missing bet cost accumulation). Task ordering follows AC dependencies. No scope creep -- the 7 tasks are all traceable to ACs.

Minor deduction: AC3 (verdict round-trip) is tested only in the integration test (Task 5, test 3), but has no unit-level verification of the `read_inbox` thread-participant filtering that makes it work. The test plan for AC3 depends on end-to-end wiring being correct rather than verifying the specific predicate (agent in participants -> verdict appears in inbox).

### 2. Layer Integrity (9/10)

Clean. New skill tools live in `packages/server/src/skill-tools/` (Agent Runtime layer). Cost accumulation lives in `packages/fabric/src/services/cost-cap.ts` (Meta Layer). The fabric layer already imports `tasks` and `bets` from `@hyperidle/db` in other files (`materialization.ts`, `session-context.ts`), so adding those imports to `cost-cap.ts` does not introduce a new cross-layer dependency. No layer reaches past its neighbor.

### 3. API Contracts (7/10)

The new tools are well-specified with Zod input schemas and concrete `ToolResult` return shapes. The `create_task` handler returns `ok({ taskId, betId })` and the `submit_review` handler returns `ok({ messageId, threadId, betId })` -- clear contracts.

Deduction: the plan does not specify error status codes for the tool results. The `err()` calls use string codes (`"NOT_FOUND"`, `"INVALID_INPUT"`) but the plan does not enumerate all possible error codes and when they fire for each tool. This is somewhat mitigated by the existing pattern (other tools do the same), but for a plan document it would be stronger to enumerate them.

### 4. Data Model Alignment (8/10)

The plan correctly identifies that all needed columns already exist (`bets.costActualMinor`, `bets.costActualCurrency`, `bets.tokensActualJson`, `tasks.betId`). Schema verification confirmed: `bets` table (schema.ts L97-100) has exactly these columns. `tasks.betId` is a non-null FK referencing `bets.id` (schema.ts L112-114). No migrations needed -- correct.

### 5. Naming (8/10)

`create_task` and `submit_review` are honest names that describe exactly what they do. They are consistent with the existing naming pattern (`send_message`, `log_task`, `create_item`, `handoff_to`). The names don't conflict with existing primitives.

### 6. Module Depth (8/10)

Good. Two new tools with small public surfaces (one exported `ToolDefinition` each). The `recordCostAndCheck` extension adds one optional parameter (`taskId`) -- minimal interface growth. Token accumulation is a private block in Phase 11, not a new export.

### 7. Failure-Mode Coverage (5/10)

This is the weakest dimension. Several issues:

See CRITICAL findings below for the `costMinor: totalCostCents` over-counting issue that the plan inherits and extends to bets.

The security table (plan L563-573) claims "dedup logic in `recordCostAndCheck` prevents re-processing of the same cost event. Bet cost accumulation inherits this protection." This is incorrect -- the dedup logic (lines 76-99 of cost-cap.ts) applies to cap EVENTS (warnings and breaches), not to the cost accumulation `UPDATE` itself. Every call to `recordCostAndCheck` unconditionally increments `users.costActual` and `teams.costActual` with no dedup. The "Bet cost accumulation inherits this protection" statement in the security table is therefore false for the accumulation path.

The plan's D4 (token accumulation) uses a read-modify-write pattern on `bets.tokensActualJson` at session teardown. If two sessions for the same bet end concurrently, the read-modify-write is not atomic -- one session's tokens could be lost. The plan does not address this race condition. (The "concurrent bet cost updates" risk at line 625 correctly notes the `SET x = x + delta` pattern is atomic for cost, but doesn't mention that the token JSON merge is NOT atomic.)

### 8. Simplicity (7/10)

Design-it-twice is present for D3 (cost accumulation: Option A centralized vs Option B at session end) with a concrete rationale for Option A. Good.

D5's fallback path (plain message when `artifactRef` is omitted) is a pragmatic simplification for integration verification. However, it means the `submit_review` tool has two code paths that do meaningfully different things (review-type message vs plain-type message). This is acceptable for the scope but should be explicitly noted as tech debt.

D4's "redundant reconciliation" at session teardown (re-incrementing cost on the bet that was already incremented per-event in D3) is explicitly over-engineered. The plan says it "serves as a consistency check / final reconciliation" but actually it double-counts: D3 increments per event, then D4 increments the full total again. This is a bug, not a reconciliation. See CRITICAL.

### 9. Verifiability (8/10)

Every AC has a concrete verification method with test file names, assertion shapes, and expected values. The test plan names 6 unit tests and 5 integration tests. Protected tests are listed (15 files). The plan correctly flags the `tool-schemas.test.ts` risk (test counts tool names -- adding 2 new tools will break the `EXPECTED_TOOL_NAMES` assertion, requiring an update).

Minor deduction: Task 6 (unit tests) is ordered AFTER Task 5 (integration tests) but describes tests that should logically come first. The TDD ordering is inverted -- unit tests should be red-phase for Tasks 1-2, not a follow-on.

---

## CRITICAL

1. **[plan D3/D4, L369-381, L405-427] Pre-existing cost over-counting inherited by bet accumulation.** `session-provisioning.ts` L347-349 passes `costMinor: totalCostCents` (the in-memory running total) to `recordCostAndCheck`. But `recordCostAndCheck` (cost-cap.ts L219-232) does `SET costActual = coalesce(costActual, 0) + effectiveCostMinor` -- it ADDS the value. Since `totalCostCents` is cumulative (100, then 200, then 300...), each call adds the full running total, not the delta. Three 1-cent events would produce: `costActual` += 1, then += 2, then += 3 = 6 cents, not 3 cents. The plan proposes to extend this exact code path for bet cost accumulation (L369-381), which would inherit the same over-counting bug. The plan MUST either:
   - (a) Note this as a pre-existing bug, document that R5's bet accumulation will over-count by the same factor as agent/team cost, and file a follow-up to fix all three together; OR
   - (b) Change the bet accumulation to use the delta (not totalCostCents) by computing `effectiveCostMinor` from the event's `deltaCost` rather than the running total; OR  
   - (c) Fix `session-provisioning.ts` to pass the delta instead of the running total (but this would change existing behavior for agent/team cost and is out of R5 scope per the protected tests list).
   
   Recommendation: option (a). Document the bug, inherit it consistently, file follow-up. Fixing it only for bets while agents/teams remain broken would create inconsistency.

2. **[plan D4, L405-427] Token JSON merge is not atomic -- concurrent session teardown race.** Two sessions for the same bet ending simultaneously would both read `bets.tokensActualJson`, merge their tokens, and write back. The second write overwrites the first. The plan's risk section (L625-627) correctly notes cost uses `SET x = x + delta` (atomic), but does not address that the token JSON merge is a read-modify-write. Fix: either (a) use a database transaction with SELECT FOR UPDATE (PostgreSQL), or (b) use SQL JSON merge operators, or (c) accept the race as low-risk for v1 (single-adapter pool means one session per agent) and document it as a known limitation.

3. **[plan D4, L408-409] Double-counting cost at session teardown.** The plan says D4 "atomically increments `bets.costActualMinor` by `totalCostCents` (redundant with per-event accumulation from D3, but serves as a consistency check / final reconciliation)." This is not a consistency check -- it is additive double-counting. D3 increments the bet per cost_update event. Then D4 increments it again by the full session total. The result is bet cost = (sum of running totals per event) + (final total). Fix: Remove the cost increment from D4. D4 should ONLY write `tokensActualJson`. Cost is handled by D3.

4. **[plan D5/Task 2, L93-101, L291-294] `ReviewPayload.artifactRef` is required, not optional.** The `ReviewPayload` type in `packages/shared/src/thread.ts` L95-99 defines `artifactRef: ArtifactRef` (required, no `?`). The `reviewPayloadSchema` in `threads-schema.ts` L41-45 also requires `artifactRef`. The plan's `submit_review` tool attempts to construct a `ReviewPayload` with `artifactRef` as the full review path but also has a fallback that omits it (posting a plain message instead). The issue: the plan's code at L293 constructs `const payload: ReviewPayload = { title, reasoning, artifactRef }` -- this only works when `artifactRef` is provided. That's fine. But the plan must acknowledge that the fallback path (no artifactRef -> plain message) means the `promotedRichMessageId` predicate will NOT fire (it only finds review/questionnaire messages), so the RichMessageCard will NOT render. The plan should explicitly state this limitation: the fallback path satisfies "message appears in thread" but does NOT satisfy "renders as a RichMessageCard." This may affect AC2 verification.

## WARNING

1. **[plan L569, Security table] False claim about dedup protection for cost accumulation.** The security table says "The dedup logic in `recordCostAndCheck` (per-session dedup set) prevents re-processing of the same cost event. Bet cost accumulation inherits this protection." The dedup set (cost-cap.ts L70-99) tracks `cost_cap_breached` and `cost_cap_warning` event emissions, NOT the `UPDATE users/teams SET costActual += X` accumulation. Every call to `recordCostAndCheck` unconditionally runs the cost increment. Fix: Remove the false dedup claim from the security table. Replace with an honest statement: "Cost accumulation has no per-event dedup. The same over-counting behavior that exists for agent/team cost applies to bet cost."

2. **[plan Task 1, L198-206] Event emission shape mismatch.** The plan emits `{ type: "task_state_changed", fromState: "proposed", toState: "proposed" }` when creating a new task. A `fromState === toState` event is semantically meaningless -- it represents no transition. Existing code in `transitionTask` never emits events where `fromState === toState`. This event would be a new pattern that could confuse downstream consumers. Fix: Either emit a different event type (e.g., `task_created`) or don't emit an event for task creation (the REST route `POST /api/tasks` doesn't emit one).

3. **[plan Task 6, Task ordering] TDD violation: unit tests ordered after integration tests.** Task 6 (unit tests for new tools) is listed AFTER Task 5 (integration tests). TDD requires red-phase unit tests BEFORE implementation (Tasks 1-2). The builder should write unit tests as part of Tasks 1-2, not as a separate Task 6 after integration tests. Fix: Merge Task 6's test specifications into Tasks 1 and 2 respectively, and reorder so tests come before implementation.

4. **[plan Task 2, L268] Participants stored as JSON string, parsed manually.** The `submit_review` handler parses `existingThread.participants` via `JSON.parse()` and pushes to the resulting array. This is the same pattern used in other code (`read-inbox.ts` L36-39), so it is consistent. However, the plan does not validate the parsed value with `threadParticipantsSchema` (defined in `threads-schema.ts` L115). A malformed participants column would cause a runtime error. Fix: Validate with `threadParticipantsSchema.safeParse()` or at minimum wrap the parse in a try-catch.

5. **[plan Task 1, L182] Task creation does not validate bet state.** The `create_task` tool inserts a new task regardless of the parent bet's status. An agent could create tasks on a `killed` or `shipped` bet. The REST route `POST /api/tasks` similarly has no bet-state guard, so this is consistent with existing behavior, but it is worth noting as a gap.

## SUGGESTION

1. **[plan Task 2, L275-286] Thread creation should include the founder/team lead as a participant.** The plan (D2, L65) says "It adds both the agent and the bet's team lead (or the founder) as participants." But the implementation code at L277 only adds the agent: `participants: JSON.stringify([ctx.agentId])`. The founder is not added. Without the founder as a participant, the founder cannot find the thread via `read_inbox` or the threads API with `participant_id` filtering. The bet detail page (WorkBet) will still show the thread via `hostKind: "bet"` matching, so this may not block functionality, but the stated design intent is not implemented.

2. **[plan D3, L370-371] Task lookup per cost_update event adds a DB read.** The plan acknowledges this trade-off (L80-81) and says cost events are infrequent (one per LLM response ~10-60s). This is correct for today's usage. Consider caching the `task.betId` in the session-provisioning closure since `params.taskId` is immutable for the session lifetime, avoiding the repeated query.

3. **[plan, general] The R5 spec is not in the pipeline manifest.** `pipeline-manifest.yaml` has no R5 entry. This means automated tooling that reads the manifest cannot discover R5. While this doesn't affect the plan's technical correctness, it should be added.

---

## What's Working Well

1. **Plan reconciliation table (L33-44) is excellent.** Each spec assumption is verified against reality with a concrete resolution. The `traceId` mismatch is correctly identified and scoped out. The `items` table coexistence is correctly noted. This is the kind of thoroughness that prevents "the plan references things that don't exist" failures downstream.

2. **Design-it-twice for D3 (cost accumulation) is genuine, not theatre.** Option A (centralized in `recordCostAndCheck`) vs Option B (at session end) with concrete trade-off analysis. The decision to centralize is well-reasoned: per-event accumulation survives crash scenarios where session teardown never runs.

3. **Protected tests list is comprehensive and correctly identifies the `tool-schemas.test.ts` risk.** The plan anticipates that `EXPECTED_TOOL_NAMES` in tool-schemas.test.ts will need updating and flags it as Risk 1. This saves the builder from a surprise test failure.

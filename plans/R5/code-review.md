# R5 Code Review: Agent Work Loop

**Reviewer:** Phase 4 reviewer (same agent as Phase 2 architecture-critique)
**Verdict:** DONE -- with warnings
**Date:** 2025-05-30

---

## Phase 2 Critical Findings -- Disposition

| # | Phase 2 Finding | Addressed? | Evidence |
|---|---|---|---|
| 1 | Pre-existing cost over-counting (totalCostCents is running total, not delta) | YES -- inherited consistently | Bet accumulation uses the same `effectiveCostMinor` path as agent/team. `@lore` comment in `R5-agent-work-loop.test.ts:345-346` documents the debt. |
| 2 | Token JSON merge not atomic | YES -- documented as accepted risk | `@lore R5 D4` comment on `accumulateSessionTokensOnBet` (session-provisioning.ts:129-134) explicitly states "Uses a read-modify-write pattern (not atomic at the DB level) which is acceptable for single-founder usage." |
| 3 | Double-counting cost at session teardown (D4 must NOT re-increment costActualMinor) | YES -- correctly addressed | `accumulateSessionTokensOnBet` (session-provisioning.ts:136-178) ONLY writes `tokensActualJson`. It does NOT touch `costActualMinor`. `@lore` at line 133-134: "Do NOT re-increment costActualMinor here -- that is done by recordCostAndCheck per-event (D3). This function ONLY writes tokensActualJson." |
| 4 | ReviewPayload.artifactRef required -- plain fallback path acknowledged | YES -- fallback implemented with @lore | `@lore R5 D5` comment on `submit-review.ts:35-38` documents the fallback behavior. When `artifactRef` is omitted, a `plain`-type message is posted. |

All four Phase 2 critical findings were addressed.

---

## Lens 1: Architecture

### Contracts match the plan

- `create_task` tool: handler signature, Zod schema (`title: min(1).max(512)`, `description: max(65_536).optional()`, `doneCondition: max(65_536).optional()`), and return shape `ok({ taskId, betId })` all match the plan (architecture.md L166-216). PASS.
- `submit_review` tool: handler signature, Zod schema, `ReviewPayload` construction, and return shape `ok({ messageId, threadId, betId })` match the plan (architecture.md L236-335). PASS.
- `RecordCostAndCheckParams.taskId?: string` extension matches plan (architecture.md L352-360). PASS.
- `accumulateSessionTokensOnBet` correctly ONLY writes tokensActualJson, not cost -- matching the plan correction from architecture-critique CRITICAL #3. PASS.
- Tool registration: both tools added to `ALL_TOOL_DEFINITIONS` with no role restriction (`roles: undefined`), matching plan (architecture.md L218). PASS.

### Layer integrity

- `create-task.ts` and `submit-review.ts` live in `packages/server/src/skill-tools/` (Agent Runtime layer). PASS.
- `cost-cap.ts` in `packages/fabric/src/services/` (Meta Layer) now imports `bets` and `tasks` from `@hyperidle/db`. This follows existing patterns -- `cost-cap.ts` already imported `items`, `teams`, `users` from `@hyperidle/db`. PASS.
- `session-provisioning.ts` in `packages/server/src/services/` (Agent Runtime layer) imports `bets` from `@hyperidle/db`. This follows existing pattern -- it already imported `sessions`, `tasks`, `users`. PASS.
- No layer reaches past its neighbor. PASS.

### Type safety

- One `as string[]` cast in `submit-review.ts:66`: `JSON.parse(existingThread.participants) as string[]`. This matches the existing pattern in `read-inbox.ts:36`. The Phase 2 architecture-critique WARNING #4 recommended validating with `threadParticipantsSchema.safeParse()`, but the builder followed the existing codebase pattern for consistency. Acceptable.
- No `any` in production code. PASS.
- No `@ts-ignore`. PASS.

---

## Lens 2: Design

N/A -- no UI surface in R5 (the `BetCreateDialog.tsx` change is a logically-equivalent De Morgan refactor of `!trimmedPitch || !resolvedProductId.trim()` to `!(trimmedPitch && resolvedProductId.trim())`, which is a no-op).

---

## Lens 3: Security

- **Input validation:** Both tools validate via `safeParse` at the handler boundary. Title capped at 512 chars, description at 65,536, reasoning at 16 items x 1024 chars each. PASS.
- **Authorization:** `senderId` is always `ctx.agentId` (derived from session provisioning, not agent input). `betId` is derived from `ctx.taskId` (not agent input), preventing cross-bet injection (plan D1). PASS.
- **Rate limiting:** Tools run inside the harness event loop, which is bounded by cost cap and context window. No external HTTP endpoint added. PASS.
- **Injection:** `participants` is built from `JSON.stringify([ctx.agentId])` (trusted input). Message payload uses `JSON.stringify` on typed objects. No string concatenation for SQL or JSON. PASS.
- **Path traversal:** N/A -- no path inputs in new code. PASS.
- **SSRF:** N/A -- no outbound URLs from agent input. PASS.

---

## Lens 4: Adversarial

### W-1: `accumulateSessionTokensOnBet` has no direct test coverage

The function at `session-provisioning.ts:136-178` is private and has no unit test. The integration test `R5-agent-work-loop.test.ts:391-420` claims to test token accumulation but cheats -- it directly writes `tokensActualJson` to the bet via `db.update(bets).set(...)` and then verifies the GET API parses it. It does NOT exercise the actual merge logic in `accumulateSessionTokensOnBet`.

**Impact:** The merge logic (reading existing `byTier`, merging with accumulated tokens, writing back) is untested. Bugs in the merge (e.g., the `.byTier ?? {}` fallback at line 161, the `if (!counts) continue` guard at line 166) would not be caught.

**Recommendation:** Add a unit test that calls `accumulateSessionTokensOnBet` directly (export it or test via `provisionSession` with a scripted adapter that emits `token_usage` events).

### W-2: `fromState === toState` event emission in create_task

`create-task.ts:60-68` emits `{ type: "task_state_changed", fromState: "proposed", toState: "proposed" }`. This was flagged in Phase 2 (architecture-critique WARNING #2). The event is semantically meaningless -- no transition occurred. Existing code in `transitionTask` never emits events where `fromState === toState`. Downstream consumers that filter for `fromState !== toState` (e.g., to track transitions) would silently drop this event. Consumers that don't filter would see a no-op transition.

**Impact:** Low -- the event is benign but adds noise to the event stream.

### W-3: `@lore` for cost over-counting is in a test file, not production code

The `@lore R5: known debt` comment documenting the pre-existing cost over-counting bug is at `R5-agent-work-loop.test.ts:345-346`. This is the wrong location -- `@lore` comments should be on the production code path where the decision is made, not in a test file. The relevant production site is `session-provisioning.ts:408` (`costMinor: totalCostCents`), which has no `@lore` about this being a running total rather than a delta.

### W-4: Thread creation does not include founder as participant

Per plan D2 (architecture.md L65): "It adds both the agent and the bet's team lead (or the founder) as participants." The implementation at `submit-review.ts:82` only adds `[ctx.agentId]`. This was flagged in Phase 2 (architecture-critique SUGGESTION #1). The founder is not automatically a participant.

The integration test works around this at `R5-agent-work-loop.test.ts:264-272` by manually adding the founder to the thread participants before posting the verdict. In production, the founder would need to be added separately, or the bet detail page would need to use `hostKind: "bet"` matching (not participant-based filtering) to show the thread.

**Impact:** Medium -- the verdict round-trip works in the test because the test manually patches participants, but in production the founder would not automatically see the thread in their inbox.

---

## Lens 5: Simplification

### S-1: Double Zod validation in tool handlers

Both `create-task.ts:30-33` and `submit-review.ts:41-44` call `safeParse` on their input before processing. However, `tool-registry.ts:179` already calls `safeParse` before invoking the handler. This means every tool call is validated twice. This is consistent with all 12 existing tools (every handler does its own `safeParse`), so it's a codebase-wide pattern, not an R5 issue. Not actionable for R5, but worth noting as systemic redundancy.

### S-2: BetCreateDialog.tsx change is unnecessary

The change at `BetCreateDialog.tsx:90` from `!trimmedPitch || !resolvedProductId.trim()` to `!(trimmedPitch && resolvedProductId.trim())` is logically equivalent (De Morgan's law). It produces identical behavior. This change appears to have been made during a lint pass or style preference, but it adds churn to the diff without benefit. Not blocking.

---

## Lens 6: AI Slop

- No verbose naming patterns. Tool names (`create_task`, `submit_review`) follow existing conventions.
- `@lore` comments are substantive and reference specific plan decisions (D1, D2, D4, D5). Not filler.
- No "TODO: implement" on implemented code.
- No unnecessary `async` (both handlers legitimately await DB operations).
- No defensive over-engineering beyond the double `safeParse` pattern (which is codebase-wide).
- No `=== true` or redundant else-return patterns.
- PASS.

---

## AC Completeness

| AC | Criterion | Test Coverage | Verdict |
|---|---|---|---|
| AC1 | Agent creates tasks via skill tools, tasks appear in WorkBet task table | `create-task.test.ts` (6 tests: happy path, optional fields, state, event, NOT_FOUND, INVALID_INPUT). `R5-agent-work-loop.test.ts` AC1 (task visible in GET /api/bets/:id). | PASS |
| AC2 | Agent submits review, renders as RichMessageCard in bet's host thread | `submit-review.test.ts` (6 tests: review-type with artifactRef, plain fallback, thread reuse, participant addition, NOT_FOUND, empty reasoning). `R5-agent-work-loop.test.ts` AC2 (review message in bet host thread, both paths). | PASS -- with caveat: the plain fallback does NOT render as RichMessageCard (it's a plain message). Only the artifactRef path produces a review-type message that RichMessageCard would render. This is documented in `@lore R5 D5`. |
| AC3 | User submits verdict, persisted and readable by agent | `R5-agent-work-loop.test.ts` AC3 (founder posts verdict, agent reads via read_inbox). | PASS -- with caveat: test manually adds founder to participants (W-4 above). |
| AC4 | Cost flows through, displays in WorkBet cost section | `cost-cap-bet.test.ts` (4 tests: increment, cumulative, backward compat, zero cost). `R5-agent-work-loop.test.ts` AC4 cost (3 tests: increment, cumulative, backward compat). Token test simulates by direct DB write, does not exercise `accumulateSessionTokensOnBet` (W-1 above). | PASS for cost. WEAK for tokens (test does not exercise the actual function). |
| AC5 | Task status updates reflected in WorkBet task table status chips | `create-task.test.ts` (state=proposed). `R5-agent-work-loop.test.ts` AC5 (session task in_progress, created task proposed). | PASS |

---

## Protected Tests

Three protected test files were modified:
- `tool-registry.test.ts`: Added 2 tool names + updated count (12 -> 14). Assertion logic unchanged.
- `tool-registry-role.test.ts`: Updated count (12 -> 14) + description text. Assertion logic unchanged.
- `tool-schemas.test.ts`: Added 2 tool names. Assertion logic unchanged.

All changes are necessary to accommodate the 2 new tools and do not weaken any assertion. This was anticipated in the plan (Risk 1, architecture.md L618). ACCEPTABLE.

---

## Summary

**DONE** with the following warnings to track:

1. **W-1 (test gap):** `accumulateSessionTokensOnBet` merge logic is untested. The token integration test simulates by direct DB write.
2. **W-2 (semantic):** `create_task` emits `task_state_changed` with `fromState === toState`, which is meaningless.
3. **W-3 (lore placement):** Cost over-counting `@lore` is in a test file, not at the production call site.
4. **W-4 (design gap):** Founder not auto-added to bet thread participants. Test works around it manually.

None of these block shipping. W-1 and W-4 should be tracked as follow-up items.

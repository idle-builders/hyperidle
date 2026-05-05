# Architecture Critique: L14

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:6 LI:9 AC:8 DM:8 N:9 MD:9 FMC:7 S:8 V:6

---

## Findings

### CRITICAL

**[plan §Phase 2, AC-1 / §Phase 1 reconciliation table]** `blocked → paused` is NOT a valid transition in the existing state machine. `VALID_TRANSITIONS` at `packages/server/src/services/bet-state-machine.ts:32` reads: `blocked: new Set(["in_progress", "killed"])` — `paused` is absent. AC-1 claims `POST /bets/:id/pause` supports `blocked → paused`. This is false against the real code. The plan's reconciliation table (line 65: "State machine supports `in_progress → paused` — Just need the route") does not check `blocked → paused` at all. The builder will either:
- (a) Add `paused` to blocked's transition set — a state-machine change that has its own design implications (can a blocked bet be paused without first being unblocked?), OR
- (b) Restrict the pause route to `in_progress → paused` and `behind → paused` only, matching what VALID_TRANSITIONS actually supports.
The plan must explicitly decide and document this. Leaving it as "blocked → paused" with no state-machine change means the integration test for AC-1 will produce 409, not 200.
**Fix:** Add a T1b task: "Decide and document whether `blocked → paused` is a valid transition; if yes, update VALID_TRANSITIONS; if no, remove `blocked` from AC-1's transition list."

**[plan §Phase 2, AC-4 / §T5 BetActionsBar]** `updateBetField` at `bet-state-machine.ts:242` enforces `bet.status !== "in_progress"` with a hard throw. The approved design's action table shows "Adjust appetite" as available for `paused`, `behind`, and `blocked` bets — all non-`in_progress` states. If a user clicks "Adjust appetite" on a paused bet, the PATCH route will return 500 (the service throws, the global error handler catches it). The plan identifies that MUTABLE_BET_FIELDS includes appetite (Phase 1 reconciliation, line 64) and says "No change needed" — but it does not address the status restriction. This is a gap that will produce a runtime failure. **Fix:** The plan must add a task to either (a) relax `updateBetField`'s status check to include `behind`, `paused`, and `blocked` (with a rationale), or (b) restrict the UI's "Adjust appetite" button to `in_progress` only and update the approved design's action table.

---

### WARNING

**[plan §Phase 2, AC-11 / §T10 E2E]** The AC-11 Playwright verification reads: `page.locator('[data-testid="composer-textarea"]').isFocused()`. This testid does not exist. The textarea in `HostThreadSection.tsx:215` has no `data-testid` attribute — it has only a `ref` (`composerRef`). The verification method is unimplementable without adding the testid. The builder must add `data-testid="composer-textarea"` to the HostThreadSection textarea as part of T8 or T10. This is a code change not listed in any task. **Fix:** Add to T8 or T5: "Add `data-testid=\"composer-textarea\"` to the textarea in `packages/web/src/shell/HostThreadSection.tsx`."

**[plan §Phase 2, AC-12 / BetDetail type]** AC-12 verifies the revision log by having the Playwright test "GET /api/bets/:id directly, parse revisionLog." The `BetDetail` type at `packages/web/src/types/bet.ts` has no `revisionLog` field — the type does not include it. The GET /bets/:id enriched response (T2) will include `revisionLog: string | null` (it's on the raw bet row), but the TypeScript type for what `useBet` returns does not declare it. If the test uses the typed `BetDetail`, it cannot access `revisionLog` without a type assertion. The plan's enriched response shape (Phase 3 type signatures) shows `revisionLog: string | null` in the response — but this does not appear in `BetDetail`. **Fix:** Either (a) add `revisionLog?: string | null` to `BetDetail` in `packages/web/src/types/bet.ts`, or (b) clarify that the E2E test calls the raw API endpoint directly (bypassing the typed hook) and parses JSON without type safety.

**[plan §Security, Appetite enum bypass]** The plan correctly identifies the appetite enum gap and specifies adding a guard in `updateBetField` when `field === "appetite"`. However, the task that applies this fix is listed as "part of T3" (the pause route), but T3 is "Add POST /bets/:id/pause route" in `bets.ts`. The appetite enum guard belongs in `bet-state-machine.ts` (`updateBetField` function), not in the route file. The task placement is wrong. **Fix:** Assign the appetite enum guard explicitly to T1 (bet-state-machine.ts changes) or add a dedicated task T1b. Do not describe it as part of T3 whose scope is the route file.

**[plan §Phase 2, AC-1 verification]** AC-1's verification only tests `in_progress → paused`. It does not test `behind → paused`, even though that is claimed as supported. The integration test must cover all three claimed source states. **Fix:** Add `behind → paused` test case to AC-1 verification (and `blocked → paused` once the CRITICAL blocking issue above is resolved).

**[plan §Phase 2, AC-4]** The AC-4 verification says "the existing appetite enum validation in createBetSchema already covers this; verify it hasn't regressed." This is misleading. The `createBetSchema` validates appetite on CREATE. The PATCH route uses `updateBetSchema` which validates `field: z.enum(MUTABLE_BET_FIELDS)` and `value: z.string()` — the PATCH route does NOT validate the appetite value against `BET_APPETITES`. The plan's "Security & abuse cases" section correctly identifies this gap and says to add a guard in `updateBetField`. AC-4's verification description must reference testing the PATCH endpoint with an invalid appetite value (e.g. `"small"` or `"3 weeks"`) and asserting 400, not just pointing to createBetSchema. **Fix:** Update AC-4 verification to explicitly test `PATCH /bets/:id { field: "appetite", value: "big", reason: "..." }` returns 400 after T1 implements the guard.

**[plan §T4 resume route]** The plan specifies `reason: body.reason ?? "Resumed by founder"` as the default reason when no reason is provided. Using a hardcoded string as a synthetic reason in the revision log ("Resumed by founder") is misleading — the revision log is supposed to record the human's stated reason. If the human provides no reason, the revision log should record `null` or an empty reason, not a fabricated string. The `transitionBet` function already handles missing reason via `options?.reason ?? \`Transitioned to ${toState}\`` — so the service layer already has its own default. The route should pass `body.reason` (undefined if absent) without fabricating a replacement. **Fix:** Remove the `?? "Resumed by founder"` default from the route body; let the service layer's default apply.

---

### SUGGESTION

**[plan §Phase 2, Protected tests]** The protected-tests block correctly lists five test files. However, the plan adds assertions to `bets.validation.test.ts` (per T3's dep note: "integration test in bets.validation.test.ts extension"). The protected-tests contract says "New assertions may be added." The plan should add a note that the existing assertions in `bets.validation.test.ts` are frozen — only appends are allowed. This is implied by the protected-tests rule but should be made explicit for the builder.

**[plan §Phase 0, Q3 — GET enrichment]** The plan acknowledges that `teams` has no `name` column and that `team` in the response will be the team's `id`. The approved design and the `BetDetail` type both use `team: string` (not a team name). This is correct given the schema reality. However, the plan's `BetDetail enriched response` comment says `team: "from teams.id (name join when available)"` — "name join when available" implies a future code path that doesn't exist yet. The comment should say "teams table has no name column; team field returns the team ID." This avoids a future maintainer adding a dead code path looking for a name column.

**[plan §T9 — useBet refresh]** The plan specifies adding `refresh: () => void` to `UseBetResult` implemented via incrementing a counter that triggers `useEffect`. This is a correct and minimal approach. One nuance: the current `useBet` hook uses `betId` as the only dependency in `useEffect`. If the refresh counter is a separate state, it needs to be added to the dependency array. The plan does not specify this. The builder should add `refreshCount` to the useEffect deps array, otherwise the refresh will not trigger.

**[plan §Phase 2, AC-7]** The AC-7 verification uses `WorkBet` with `overrideBet` prop. This prop exists at `WorkBet.tsx:177`. Good — the plan correctly identifies the testable surface. The test description should also verify that `getByRole("button", { name: "Adjust appetite" })` exists for `in_progress` (per the design's action table). Currently AC-7 only checks for Pause and Kill bet buttons. The Adjust appetite and Unblock buttons should also be asserted.

---

## What's Working Well

1. **The design-it-twice section is substantive.** Option A vs. Option B on GET enrichment is a real decision with genuine trade-offs argued correctly. Option B is rejected for valid architectural reasons (client-side joins violate the three-layer boundary). This is not theatre — both options are plausible and the reasoning for the chosen path is correct.

2. **The security section is thorough.** The concurrent pause+kill race condition is correctly identified and the existing compare-and-set pattern in `transitionBet` is cited by name (`@lore I1 adversary-M1`). The appetite enum bypass is self-discovered in the security section. IDOR handling references the existing `assertBetReadable` helper and acknowledges the v1 single-founder caveat honestly. This is above-average security coverage for a feature plan.

---

## Summary

The plan scores 7/10 and advances with the critical issues flagged. The two CRITICAL findings must be resolved before `/write-tests`:

1. `blocked → paused` transition mismatch between the plan's AC-1 and the actual state machine — must decide and document.
2. `updateBetField` status check blocking appetite adjustments on non-`in_progress` bets — must add a task to relax the check or restrict the UI.

These are implementation-blocking gaps, not stylistic issues. The builder cannot implement T3 (pause route) or AC-4 (appetite adjust) without resolving them.

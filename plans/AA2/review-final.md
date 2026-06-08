# AA2 Review Round 4 (Final) -- Routine Management & Session Adaptation

**Reviewer:** Phase 4 code review (round 4 / final)
**Branch:** `feat/AA2-routine-management-session-adaptation`
**Verdict:** **DONE**

---

## Fix Verification

The round 3 critical finding (`ARC-ROUND3-1`) is resolved. The fix applied Option C from the round 3 recommendations: match on `routineId + outcome = "running"` instead of `sessionId`.

### What changed (commit `96a22a3e`)

`packages/server/src/services/session-lifecycle.ts`, function `updateRoutineRunOnSessionEnd`:

- **WHERE clause** changed from `eq(routineRuns.sessionId, sessionId)` to `and(eq(routineRuns.routineId, routineId), eq(routineRuns.outcome, "running"))`. This eliminates the temporal ordering bug: the hook no longer depends on sessionId being populated on the routine_runs row at fire time.
- **UPDATE SET** now includes `sessionId` (back-populates it during the lifecycle hook), so the historical record is complete.
- **`@lore` comment** (lines 57-63) accurately documents the rationale and the constraint.

### Temporal ordering (now correct)

1. Trigger endpoint inserts routine_runs with `outcome = "running"`, `sessionId = NULL`.
2. `provisionSession` runs, eventually calls `endSession`/`crashSession`.
3. Lifecycle hook queries `WHERE routineId = X AND outcome = 'running'` -- finds the row (sessionId is irrelevant to the match).
4. Hook updates: outcome, sessionId, endedAt, cost, summary, plus routines.lastRunAt and routines.lastRunSummary.
5. Trigger endpoint's post-provision sessionId UPDATE (routines-routes.ts line 561-564) is now redundant but harmless.

### Safety of `routineId + outcome = "running"` as a unique key

Coalescing (AC-5) guarantees at most one active session per routine. A new routine_runs row with `outcome = "running"` is only inserted when `shouldCoalesce` returns false (no active session). The lifecycle hook finalizes the running row before any new trigger can insert another. Therefore, at most one row per routine can have `outcome = "running"` at any time.

---

## Test Coverage for the Fix

Three new tests in `packages/server/src/__tests__/routines-aa2.test.ts` (describe block "AC-6 fix"):

1. `endSession updates routine_run outcome to success and back-populates sessionId` -- inserts routine_run with sessionId=NULL, calls endSession, asserts outcome="success" and sessionId populated.
2. `crashSession updates routine_run outcome to error and back-populates sessionId` -- same pattern, asserts outcome="error".
3. `no-ops when no running routine_run row exists for the routine` -- pre-AA2 scenario, asserts no crash and no rows created.

All 5840+ tests pass. Verify green.

---

## AC Completeness Audit (Final)

| AC | Statement | Verdict | Evidence |
|---|---|---|---|
| AC-1 | Create routine from Work surface | **PASS** | POST /api/routines with Zod validation, stub task, RoutineCreateDialog, WorkTeam button. 8 integration tests + component tests. |
| AC-2 | Pause, resume, delete | **PASS** | PATCH state, DELETE soft-delete, GET filters. 10 integration tests. |
| AC-3 | Provisioning reuse with adapted context | **PASS** | provisionSession branches on routineId, buildRoutineSessionContextData + composeRoutinePrompt. 7 unit tests. |
| AC-4 | Clean session starts with last run summary continuity | **PASS** | Read: buildRoutineSessionContextData reads routines.lastRunSummary. Write: updateRoutineRunOnSessionEnd updates routines.lastRunSummary via routineId+outcome match. 3 lifecycle tests. |
| AC-5 | Coalescing | **PASS** | shouldCoalesce helper + trigger endpoint + scheduler check + skipped runs logged. 3 integration tests. |
| AC-6 | Session outcomes recorded | **PASS** | Lifecycle hook matches on routineId+outcome="running", updates outcome/sessionId/endedAt/cost/summary. 3 fix-specific tests + 4 API tests. |

**Result:** 6/6 PASS.

---

## Non-Blocking Observation (Carried Forward)

**Stale `@lore` comment in `routines-routes.ts` lines 555-560.** The comment says "the session-lifecycle hook (endSession/crashSession) can find this run row via `WHERE sessionId = <session-id>` and update its outcome." The hook now matches on `routineId + outcome = "running"`, not sessionId. The comment is factually incorrect. The code is correct -- only the comment is stale. Should be cleaned up in a follow-up.

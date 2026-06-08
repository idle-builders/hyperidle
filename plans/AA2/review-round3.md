# AA2 Review Round 3 — Post-Fix Re-Review

**Reviewer:** Phase 4 code review (round 3)
**Branch:** `feat/AA2-routine-management-session-adaptation`
**Verdict:** **NOT DONE** -- 1 critical finding remains (same root cause as Round 2, fix is temporally incorrect)

---

## Critical Finding

### ARC-ROUND3-1: sessionId back-population executes AFTER the lifecycle hook has already fired and no-oped

**Ref:** Architecture plan section 5.4 step 5, section 5.5 step 1
**Files:** `packages/server/src/routes/routines-routes.ts` lines 546-564, `packages/server/src/services/session-provisioning.ts` lines 660-678, `packages/server/src/services/session-lifecycle.ts` lines 72-82

The Round 2 fix added a back-population UPDATE (routines-routes.ts lines 561-564) after `provisionSession` returns. However, this update runs too late. The call sequence is:

1. **Line 529-534:** `routine_runs` row inserted with `sessionId = null`, `outcome = "running"`.
2. **Line 547:** `provisionSession(...)` is called. This function runs synchronously through all 11 phases, including Phase 10 (drain event stream via `for await` over `harness.streamEvents`).
3. **Inside `provisionSession`, line 671:** `endSession()` is called (or `crashSession` on line 661).
4. **Inside `endSession`, line 239-247:** `updateRoutineRunOnSessionEnd()` fires. It queries `routine_runs WHERE routineId = X AND sessionId = Y AND outcome = 'running'`. The row has `sessionId = NULL`. In SQL, `NULL = 'some-uuid'` evaluates to NULL (falsy). Zero rows match. The hook silently no-ops.
5. **`provisionSession` returns** to the trigger endpoint.
6. **Line 561-564:** The back-population UPDATE sets `sessionId = result.sessionId` on the routine_runs row. This is now too late -- the lifecycle hook has already fired and no-oped in step 4.

**Result:** The `routine_runs` row ends up with `sessionId` correctly populated (from step 6) but `outcome` permanently stuck at `"running"` (because the lifecycle hook could not update it in step 4). The session is already done. This is a zombie row.

**Impact:** AC-4 (lastRunSummary continuity) and AC-6 (session outcomes recorded) remain broken on the provisionSession path, identical to Round 2.

**The comment on line 555-560 is misleading.** It states "the session-lifecycle hook (endSession/crashSession) can find this run row via `WHERE sessionId = <session-id>` and update its outcome." This is incorrect -- by the time the UPDATE on line 561 executes, `endSession`/`crashSession` have already completed inside `provisionSession`.

### Fix options (ordered by correctness)

**Option A (recommended): Accept a pre-generated sessionId in provisionSession.** Add `sessionId?: string` to `ProvisionSessionParams`. When provided, `provisionSession` uses it instead of calling `randomUUID()` in Phase 5. The trigger endpoint generates the sessionId, writes it to the routine_runs row, then passes it to `provisionSession`. Both the routine_runs row and the session share the same ID before provisioning starts.

**Option B: Pass runId into provisionSession, update routine_runs inside Phase 11 before endSession/crashSession.** Add `routineRunId?: string` to `ProvisionSessionParams`. Before calling `endSession`/`crashSession` in Phase 11, `provisionSession` updates the routine_runs row with the sessionId it generated. This keeps sessionId generation internal but requires `provisionSession` to know about routine_runs.

**Option C: Drop sessionId from the lifecycle hook WHERE clause.** Match on `routineId + outcome = "running"` only. Coalescing guarantees at most one running row per routine, so this is safe. The Round 2 review dismissed this as "fragile" but it is actually correct given coalescing.

---

## AC Completeness Audit (Round 3)

| AC | Statement | Verdict | Evidence |
|---|---|---|---|
| AC-1 | Create routine from Work surface | **PASS** | POST /api/routines + RoutineCreateDialog + WorkTeam button. |
| AC-2 | Pause, resume, delete | **PASS** | PATCH state, DELETE soft-delete, GET filters. |
| AC-3 | Routine sessions reuse provisioning with adapted context | **PASS** | `provisionSession` branches on `routineId`, uses `buildRoutineSessionContextData` + `composeRoutinePrompt`. |
| AC-4 | Clean session starts with last run summary continuity | **FAIL** | Read side works (buildRoutineSessionContextData reads lastRunSummary). Write side broken: lifecycle hook cannot find the routine_runs row because sessionId back-population runs after the hook fires. |
| AC-5 | Coalescing | **PASS** | `shouldCoalesce` helper + trigger endpoint check + skipped runs logged. |
| AC-6 | Session outcomes recorded in run history | **FAIL** | On the provisionSession path (production), the lifecycle hook no-ops because sessionId is still NULL when it fires. The back-population UPDATE runs after provisionSession returns -- after the hook has already executed. |

**Result:** 4 PASS, 2 FAIL.

---

## Observations (non-blocking, carried forward from Round 2)

- No test coverage for `updateRoutineRunOnSessionEnd`. The lifecycle hook has zero tests. A test that exercises the full trigger -> provision -> endSession -> routine_runs update flow would have caught this temporal ordering bug.
- RoutineCreateDialog padding `p-[18px] gap-[9px]` vs BetCreateDialog's `p-4 gap-3`. Minor consistency gap.
- Dynamic import of `nextCronMatch` (line 225) when `parseCron` is already statically imported from the same package.
- No validation that `ownerAgentId` is an agent (not a human user).

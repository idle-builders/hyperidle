# AA2 Review — Routine Management & Session Adaptation

**Reviewer:** Phase 4 code review  
**Branch:** `feat/AA2-routine-management-session-adaptation`  
**Verdict:** **NOT DONE** — 3 critical findings, 6 warnings

---

## Lens 1: Architecture

### CRITICAL — ARC-1: `provisionSession` not extended; routine sessions use raw INSERT

**Ref:** Architecture plan section 5.3, Task 6  
**Files:** `packages/server/src/services/session-provisioning.ts` (unchanged), `packages/server/src/routes/routines-routes.ts` lines 490-498

The architecture plan (section 5.3) requires extending `ProvisionSessionParams` with `routineId?: string` and branching context assembly in Phase 6/8.5. The concept doc says "Same `provisionSession` function. The caller passes a `routineId` parameter." Neither `session-provisioning.ts` nor `session-lifecycle.ts` was modified.

Instead, the trigger endpoint (`POST /:id/trigger`) does a raw `db.insert(sessions)` bypass that skips the entire 11-phase provisioning orchestrator — no workspace materialization, no context assembly, no prompt composition, no CLAUDE.md write. The routine session created this way is an empty shell: it has `state: "active"` and a `routineId`, but no composed prompt, no workspace, no materialized knowledge. This is not "reusing the existing session provisioning infrastructure" as AC-3 requires.

**Impact:** AC-3 is not met. Routine sessions do not receive routine context. The `buildRoutineSessionContextData` and `composeRoutinePrompt` functions are implemented and tested in isolation but never integrated into the session creation path.

### CRITICAL — ARC-2: `session-lifecycle.ts` not extended; routine run outcomes never updated

**Ref:** Architecture plan section 5.5, Task 6  
**File:** `packages/server/src/services/session-lifecycle.ts` (unchanged)

The plan requires a post-session hook in `endSession`/`crashSession` that: (1) updates the `routine_runs` row from `outcome: "running"` to the final outcome, (2) writes `last_run_summary` to the routine, (3) updates `last_run_at`. None of this was implemented.

Combined with ARC-3 below (outcome set to "success" at trigger time), routine runs are permanently stuck at outcome "success" from the moment they're created, regardless of what happens in the session.

**Impact:** AC-6 is not met. Session outcomes are not recorded in run history. The `lastRunSummary` continuity bridge (AC-4) is also broken — the agent's summary is never written back to the routine.

### CRITICAL — ARC-3: Routine run outcome set to "success" at trigger time instead of "running"

**Ref:** Architecture plan section 5.4 step 4  
**File:** `packages/server/src/routes/routines-routes.ts` line 507

The plan explicitly says: "Create a `routine_runs` row with `outcome: 'running'` (not 'success') at trigger time." The implementation sets `outcome: "success"`. This means every manually triggered routine shows as "success" immediately, before any work has been done. Combined with no lifecycle hook (ARC-2), the outcome is never updated.

Additionally, the `routine_runs` row does not store `sessionId` (plan section 5.4 step 5), so there's no link between the run and its session.

### WARNING — ARC-4: Missing FK constraints on new columns

**Ref:** Architecture plan sections 2.1, 2.2  
**File:** `packages/db/src/schema.ts` lines 296, 328

The plan specifies:
- `stubTaskId: text("stub_task_id").references(() => tasks.id, { onDelete: "set null" })`
- `sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" })`

The implementation omits `.references()` on both columns. No FK constraints exist in the migration SQL either. This means orphaned references can accumulate silently — if a task or session is deleted, the `stubTaskId`/`sessionId` values become dangling pointers.

### WARNING — ARC-5: Missing `created_at` backfill in migration

**Ref:** Architecture plan section 1.3  
**File:** `packages/db/drizzle/0024_brainy_moondragon.sql`

The plan specifies a backfill: `UPDATE routines SET created_at = '2026-01-01T00:00:00.000Z' WHERE created_at IS NULL;`. The migration only adds the column with no default and no backfill. Pre-existing routines will have `created_at = NULL`, which the frontend conditionally renders (line 233: `{routine.createdAt && ...}`), so it degrades gracefully. But it contradicts the plan.

### WARNING — ARC-6: WorkTeam.tsx not modified — no trigger point for RoutineCreateDialog

**Ref:** Architecture plan Task 9, approved design section 2 ("Trigger point")  
**File:** `packages/web/src/pages/WorkTeam.tsx` (unchanged)

The RoutineCreateDialog component exists and is tested, but WorkTeam.tsx was not modified to add the "New routine" button that opens it. The dialog is unreachable from the UI. The design spec explicitly defines the trigger point markup and `data-testid="routine-create-btn"`.

### OBSERVATION — ARC-7: Dynamic import of `nextCronMatch` is unnecessary

**File:** `packages/server/src/routes/routines-routes.ts` line 199

`nextCronMatch` is already exported from `@hyperidle/fabric` and `parseCron` is already statically imported from the same package at the top of the file. The dynamic `await import("@hyperidle/fabric")` adds an unnecessary async boundary and breaks the static import pattern used everywhere else.

---

## Lens 2: Design

### WARNING — DES-1: Delete confirmation text deviates from approved design

**Ref:** Approved design section 3b  
**File:** `packages/web/src/pages/WorkRoutine.tsx` line 245

Spec: "Delete this routine? History will be preserved."  
Actual: "Delete this routine? This cannot be undone."

These convey opposite meanings. The soft-delete preserves history (by design), but the copy says it cannot be undone. The spec's copy is more accurate and reassuring.

### WARNING — DES-2: Delete confirm button uses `btn-error` instead of spec's `btn-ghost`

**Ref:** Approved design section 3b  
**File:** `packages/web/src/pages/WorkRoutine.tsx` line 249

Spec: "Confirm delete" uses `text-[var(--status-error)]` text, `btn-ghost btn-sm`.  
Actual: `btn-error btn-sm` (a filled red button).

This is a visual weight difference — `btn-error` draws more attention than the spec intends. The spec chose `btn-ghost` with error-colored text to match the Delete button's own styling (text-only, error color).

### OBSERVATION — DES-3: Dialog padding/spacing differ from BetCreateDialog pattern

**Ref:** Approved design section 2 ("Pattern")  
**File:** `packages/web/src/pages/work/RoutineCreateDialog.tsx` line 140

Spec: `p-4 flex flex-col gap-3` (matches BetCreateDialog).  
Actual: `p-[18px] flex flex-col gap-[9px]`.  
BetCreateDialog: `p-4 flex flex-col gap-3` (confirmed at BetCreateDialog.tsx line 134).  
Spec: `min-w-[320px] max-w-[480px]`.  
Actual: `min-w-[340px] max-w-[520px]`.

The implementation uses Hearth-grid-valid values (18px, 9px) but deviates from the explicit "follows BetCreateDialog.tsx pattern exactly" instruction. The resulting dialog is slightly wider and uses different padding/gap values than every other dialog in the system.

### OBSERVATION — DES-4: Inline editing not implemented

**Ref:** Approved design section 3a  
**File:** `packages/web/src/pages/WorkRoutine.tsx`

The approved design specifies inline editing for name, description, schedule, and cost cap fields. This was not implemented. The workpackage AC says "create, edit, pause, resume, and delete" but the ACs list doesn't have a specific AC for inline editing. Flagged as an observation rather than a finding — the builder may have descoped this since the PATCH endpoint accepts these fields.

---

## Lens 3: Security

### OBSERVATION — SEC-1: No validation that ownerAgentId is an agent (not a human)

**Ref:** Architecture plan section 4.1 step 3  
**File:** `packages/server/src/routes/routines-routes.ts` lines 112-115

The plan says: "Verify ownerAgentId exists and is an agent (not human)." The implementation only checks existence (`!agent`), not that the user is an agent. A human user ID could be passed as `ownerAgentId`. Low severity given single-tenant desktop deployment, but it's a plan deviation.

### OBSERVATION — SEC-2: `POST /:id/retire` does not check for soft-deleted routines

**File:** `packages/server/src/routes/routines-routes.ts` lines 406-418

The `retire` endpoint (pre-AA2 legacy) does not check `existing.deletedAt`. A soft-deleted routine can be "retired" (setting `active: false`), which is a no-op but inconsistent with the DELETE/GET/PATCH guards.

---

## Lens 4: Adversarial

### OBSERVATION — ADV-1: Race condition between coalescing check and session creation

**File:** `packages/server/src/routes/routines-routes.ts` lines 465-498

The coalescing check (`shouldCoalesce`) and the session INSERT are separate queries with no transaction boundary. If two triggers fire simultaneously for the same routine:

1. Both call `shouldCoalesce` → both return `false` (no active session yet)
2. Both proceed to INSERT a session
3. Result: two concurrent sessions for the same routine

The architecture plan acknowledges this in the concept doc: "No double-fire risk because session creation is a single INSERT." But two INSERTs are not prevented by any uniqueness constraint. The plan's mitigation was for the scheduler path (where a single process fires one at a time), not for concurrent HTTP requests. Low probability in a single-tenant desktop app, but the contract says "coalesced (skipped)" — it should be enforced.

### OBSERVATION — ADV-2: `as` casts in test files

Test files contain many `as Record<string, unknown>` and `as z.infer<...>` casts. These are standard for untyped `res.json()` returns in Hono test patterns and match existing codebase conventions. Not a problem, but counted: ~25 `as` casts in new test files.

---

## Lens 5: Simplification

### OBSERVATION — SIM-1: `findReferenceTaskId` fallback chain is over-defensive

**File:** `packages/server/src/routes/routines-routes.ts` lines 77-93

The function tries three paths: (1) routine's stub task, (2) any task owned by the agent, (3) any task in the DB. Paths 2 and 3 are legacy fallbacks for pre-AA2 routines. Since AA2 always creates a stub task at routine creation time, these fallbacks will never trigger for AA2-created routines. The function is correct but the complexity is for backward compat only — consider a comment explaining this.

### OBSERVATION — SIM-2: Bet-creation fallback in POST /api/routines is complex

**File:** `packages/server/src/routes/routines-routes.ts` lines 157-196

Creating a stub task requires a bet for the `tasks.betId NOT NULL` FK. The code searches for a bet in the team, falls back to any bet in the DB, and finally creates a "Routine Operations" system bet if none exist. This is a 40-line block for what is essentially "ensure a bet exists." The @lore comment explains the rationale, but the code could be extracted to a helper for clarity.

---

## Lens 6: Slop

### OBSERVATION — SLOP-1: Comment restates the obvious

**File:** `packages/server/src/routes/routines-routes.ts` line 205

```typescript
// Should not reach here — already validated above
```

Inside a try-catch around `parseCron` that was indeed already validated. The comment is accurate but defensive — the `catch` block is dead code. Consider removing the try-catch entirely since validation passed.

### OBSERVATION — SLOP-2: Unnecessary empty catch block

**File:** `packages/server/src/routes/routines-routes.ts` lines 204-206

The try-catch around `nextCronMatch` swallows errors silently and sets `nextRunAt = null`. If `parseCron` validated successfully (which it did, 10 lines above), `nextCronMatch` cannot fail on a valid `CronFields` object. The try-catch is unnecessary defensive programming.

---

## AC Completeness Audit

| AC | Statement | Verdict | Evidence |
|---|---|---|---|
| AC-1 | Create routine from Work surface | **PARTIAL** | POST /api/routines works (tests pass), RoutineCreateDialog component exists and is tested, BUT WorkTeam.tsx was not modified — the dialog has no trigger point in the UI. A user cannot reach the create flow from the Work surface. |
| AC-2 | Pause, resume, delete routines | **PASS** | PATCH state works (existing AA1 + new soft-delete guard). DELETE sets deleted_at/state/active correctly. GET filters soft-deleted. 8 integration tests prove the behavior. |
| AC-3 | Routine sessions reuse provisioning with adapted context | **FAIL** | `provisionSession` was not extended. `buildRoutineSessionContextData` and `composeRoutinePrompt` are implemented and tested but never wired into the session creation path. The trigger endpoint does a raw INSERT that skips the 11-phase provisioning. |
| AC-4 | Clean session starts with last run summary continuity | **FAIL** | `buildRoutineSessionContextData` correctly reads `last_run_summary` (unit test proves it), but `last_run_summary` is never written back by the session lifecycle — `session-lifecycle.ts` was not modified. The continuity bridge is read-only with no writer. |
| AC-5 | Coalescing | **PASS** | `shouldCoalesce` works correctly. Manual trigger endpoint checks it. 5 unit tests + 3 integration tests. The scheduler path (`checkAndFireRoutine`) was NOT modified to call `shouldCoalesce`, but the manual trigger path does. |
| AC-6 | Session outcomes recorded in run history | **FAIL** | Outcome is set to "success" at trigger time (should be "running"). `session-lifecycle.ts` was not modified to update the outcome on session end. `sessionId` is not stored on the `routine_runs` row. RoutineRunOutcome type correctly includes "running" and "timeout" (type test exists). |

**Result:** 1 PASS, 1 PARTIAL, 1 PASS (with scheduler gap), 3 FAIL.

---

## Summary of Required Fixes

### CRITICAL (must fix before merge)

1. **ARC-1:** Extend `provisionSession` with `routineId` parameter. When present, call `buildRoutineSessionContextData` + `composeRoutinePrompt` instead of the task-based path. Remove the raw `db.insert(sessions)` from the trigger endpoint and call `provisionSession` instead.

2. **ARC-2:** Extend `endSession`/`crashSession` in `session-lifecycle.ts` to: (a) update the `routine_runs` row with final outcome, endedAt, cost, summary; (b) write `last_run_summary` to the routine row; (c) update `last_run_at` on the routine.

3. **ARC-3:** Change `outcome: "success"` to `outcome: "running"` in the trigger endpoint's `routine_runs` INSERT. Add `sessionId` to the INSERT.

### WARNINGS (should fix)

4. **ARC-4:** Add `.references()` calls for `stubTaskId` and `routineRuns.sessionId` per the architecture plan.
5. **ARC-5:** Add `created_at` backfill SQL to the migration.
6. **ARC-6:** Wire the RoutineCreateDialog into WorkTeam.tsx with the "New routine" button.
7. **DES-1:** Change delete confirmation copy to "Delete this routine? History will be preserved."
8. **DES-2:** Change confirm delete button from `btn-error` to `btn-ghost text-[var(--status-error)]`.
9. **DES-3:** Align dialog padding/spacing/dimensions with BetCreateDialog (`p-4 gap-3 min-w-[320px] max-w-[480px]`).

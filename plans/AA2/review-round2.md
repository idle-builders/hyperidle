# AA2 Review Round 2 — Post-Fix Re-Review

**Reviewer:** Phase 4 code review (round 2)
**Branch:** `feat/AA2-routine-management-session-adaptation`
**Verdict:** **NOT DONE** — 1 critical finding remains

---

## Critical Findings Status

### ARC-1: `provisionSession` extended with routineId — RESOLVED

`ProvisionSessionParams` now includes `routineId?: string` (line 208). When set, Phase 5 populates `sessions.routineId` (line 332), Phase 8.5 branches to `buildRoutineSessionContextData` + `composeRoutinePrompt` (lines 422-452), and `SessionContext` carries `routineId` to `endSession`/`crashSession` (line 377).

The trigger endpoint (`POST /:id/trigger`) now calls `provisionSession` when adapters are available (lines 547-553), falling back to bare DB INSERT only in kernel-only/test mode (lines 573-611). Both paths correctly pass `routineId`.

### ARC-2: Session lifecycle extended — RESOLVED (with caveat, see ARC-NEW-1)

`session-lifecycle.ts` now includes `updateRoutineRunOnSessionEnd` (lines 62-108). `SessionContext` gains optional `routineId` (lines 41-43). Both `endSession` (lines 238-247) and `crashSession` (lines 307-316) call the hook when `context.routineId` is set. The hook updates the `routine_runs` row outcome, `endedAt`, cost, and summary. It also updates `routines.lastRunAt` and `routines.lastRunSummary`.

### ARC-3: Routine run outcome and sessionId — PARTIALLY RESOLVED (see ARC-NEW-1)

The trigger endpoint now inserts `routine_runs` with `outcome: "running"` (line 533 for provisionSession path, line 593 for fallback path). The fallback path includes `sessionId: sessionId` (line 594). However, the provisionSession path does NOT include `sessionId` (lines 529-534).

---

## New Critical Finding

### ARC-NEW-1: routine_runs.sessionId mismatch causes lifecycle hook to silently no-op on provisionSession path

**Ref:** Architecture plan section 5.4 step 5, section 5.5 step 1
**Files:** `packages/server/src/routes/routines-routes.ts` lines 529-534, `packages/server/src/services/session-lifecycle.ts` lines 75-82

The provisionSession path inserts a `routine_runs` row without `sessionId`:

```typescript
await db.insert(routineRuns).values({
    id: runId,
    routineId,
    startedAt: now,
    outcome: "running",
    // sessionId is NOT set
});
```

The lifecycle hook (`updateRoutineRunOnSessionEnd`) queries with:

```typescript
eq(routineRuns.sessionId, sessionId)
```

In SQL, `NULL = 'some-uuid'` evaluates to `NULL` (falsy). The WHERE clause will never match a row where `sessionId` is NULL. The lifecycle hook will silently return (line 84-87 no-op path) and the routine_run row will remain stuck at `outcome: "running"` forever.

The fallback path (lines 588-595) correctly sets `sessionId: sessionId`, so it would work there. But the full provisionSession path -- the one used in production when adapters are present -- has this gap.

**Two fixes possible:**

1. **Change the lifecycle hook** to match on `routineId + outcome="running"` without requiring `sessionId` (remove `eq(routineRuns.sessionId, sessionId)` from the WHERE clause). This is fragile if multiple concurrent runs exist, but coalescing prevents that.

2. **Back-populate sessionId** on the routine_runs row after provisionSession returns. The trigger endpoint receives `result.sessionId` on line 555. Add an UPDATE to set `routine_runs.sessionId = result.sessionId` before returning.

Option 2 is cleaner: it preserves the lifecycle hook's precise matching and completes the sessionId FK link that AC-6 requires.

**Impact:** AC-6 is not met on the provisionSession path. Routine run outcomes will not be recorded when sessions end. AC-4 (lastRunSummary continuity) is also broken because the summary is never written back to the routine.

---

## Warning Findings Status

### ARC-4 (FK constraints): RESOLVED
`packages/db/src/schema.ts` line 298: `stubTaskId` has `.references(() => tasks.id, { onDelete: "set null" })`. Line 333: `routineRuns.sessionId` has `.references(() => sessions.id, { onDelete: "set null" })`. Migration SQL (lines 11-12) includes both FK constraints.

### ARC-5 (created_at backfill): RESOLVED
Migration line 7: `UPDATE "routines" SET "created_at" = NOW()::text WHERE "created_at" IS NULL;`. Uses `NOW()::text` instead of the plan's literal `'2026-01-01T00:00:00.000Z'` -- functionally equivalent, arguably better (actual migration time vs arbitrary epoch).

### ARC-6 (WorkTeam.tsx not wired): RESOLVED
WorkTeam.tsx lines 335-343: "New routine" Button with `data-testid="new-routine-btn"` and `onClick={() => setCreateRoutineOpen(true)}`. RoutineCreateDialog mounted at lines 462-471. State at line 198.

### DES-1 (Delete confirmation copy): RESOLVED
WorkRoutine.tsx line 245: "Delete this routine? History will be preserved." Matches the approved design spec exactly.

### DES-2 (Delete confirm button styling): RESOLVED
WorkRoutine.tsx line 249: `btn-ghost btn-sm min-h-[44px] text-[var(--status-error)]`. Uses `btn-ghost` with error-colored text per spec, not `btn-error`.

### DES-3 (Dialog padding/spacing): PARTIALLY RESOLVED
RoutineCreateDialog dimensions fixed: `min-w-[320px] max-w-[480px]` (matches BetCreateDialog exactly). Padding/gap remain at `p-[18px] gap-[9px]` (18px/9px) vs BetCreateDialog's `p-4 gap-3` (16px/12px). Both are on-grid Hearth values but differ from the "follows BetCreateDialog.tsx pattern exactly" instruction. Observation-level -- not blocking.

---

## AC Completeness Audit (Round 2)

| AC | Statement | Verdict | Evidence |
|---|---|---|---|
| AC-1 | Create routine from Work surface | **PASS** | POST /api/routines works. RoutineCreateDialog exists and is reachable via "New routine" button in WorkTeam.tsx. |
| AC-2 | Pause, resume, delete | **PASS** | PATCH state, DELETE soft-delete, GET filters. All working. |
| AC-3 | Routine sessions reuse provisioning with adapted context | **PASS** | `provisionSession` branches on `routineId`, uses `buildRoutineSessionContextData` + `composeRoutinePrompt`. Trigger endpoint calls `provisionSession`. |
| AC-4 | Clean session starts with last run summary continuity | **FAIL** | Read side works (buildRoutineSessionContextData reads lastRunSummary). Write side broken: lifecycle hook cannot find the routine_runs row (ARC-NEW-1), so lastRunSummary is never written back to the routine. |
| AC-5 | Coalescing | **PASS** | `shouldCoalesce` helper works. Trigger endpoint checks it. Skipped runs logged. |
| AC-6 | Session outcomes recorded in run history | **FAIL** | On the provisionSession path (production), the lifecycle hook's WHERE clause cannot match the routine_runs row (sessionId is NULL on insert, hook queries with eq(sessionId, value)). Run stays stuck at outcome="running". Fallback path works. |

**Result:** 4 PASS, 2 FAIL.

---

## Summary of Remaining Fix

**One fix unblocks both AC-4 and AC-6:** After `provisionSession` returns successfully in the trigger endpoint (line 555), update the routine_runs row to set `sessionId = result.sessionId`:

```typescript
// After provisionSession returns, link the routine_run to the session.
await db.update(routineRuns)
    .set({ sessionId: result.sessionId })
    .where(eq(routineRuns.id, runId));
```

This closes the sessionId gap. The lifecycle hook can then find the row via `routineId + sessionId + outcome="running"` and update it on session end.

---

## Observations (non-blocking)

- **RoutineCreateDialog padding:** `p-[18px] gap-[9px]` vs BetCreateDialog's `p-4 gap-3`. Both on-grid. Minor consistency gap.
- **Dynamic import of `nextCronMatch`** (line 225): `const { nextCronMatch } = await import("@hyperidle/fabric");` -- `parseCron` is already statically imported from the same package. Unnecessary async boundary.
- **SEC-1 from round 1** still applies: no validation that `ownerAgentId` is an agent (not human). Low severity.

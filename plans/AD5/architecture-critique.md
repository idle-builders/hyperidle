# AD5 — Architecture Critique

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:9 N:9 MD:9 FMC:7 S:9 V:7

---

## Dimension Scores

### 1. Spec Alignment: 8/10

Every AC maps to a task. No scope creep -- the 7 tasks correspond to the 7 ACs. The "AC-7: Cost From Session Accumulation" analysis correctly identifies that the data flow is already wired end-to-end and the gap is only in the rail endpoint (AC-6), avoiding unnecessary work.

**WARNING:** AC-2 in the spec says "a session is dispatched for it" after dependency unblock. The plan acknowledges this gap (Risks & Ambiguities #3) but only transitions the task to `accepted` -- it does not dispatch a session. The plan says full session provisioning "requires harness infrastructure that isn't available in the event handler context." This is a legitimate scope constraint, but the plan does not propose a verification method for the partial delivery. The test asserts task B moves to `accepted` and `task_state_changed` is emitted -- but the spec says "a session starts for task A's owner agent." The plan should explicitly call out that this AC is partially delivered and what remains.

**The plan correctly decides to remove bet pause/resume buttons** (AC-5 offers "either works end-to-end OR buttons are removed"). The removal path is the right choice given the 4-state bet state machine.

### 2. Layer Integrity: 9/10

The plan catches and resolves the fabric-cannot-import-server layer violation (AC-2). The "Design-It-Twice" section on dependency watcher registration is genuine -- Option A (register in app.ts) is correctly chosen to avoid cascading code moves. The reasoning is honest: "Moving code between packages is a refactoring concern, not a wiring concern."

The scheduler is started in `server-factory.ts` (correct: server depends on fabric, not reverse). The dependency watcher handler is registered in `app.ts` (correct: it calls a function already in the server package).

No cross-layer violations.

### 3. API Contracts: 8/10

No new endpoints. The plan correctly identifies that the only route changes are:
- `GET /api/rail` -- computation change (query replaces hardcoded zero), same response shape.
- `PATCH /api/settings` -- no change, already handles notification prefs.
- `POST /api/tasks/:id/transition` -- no change, but dependency watcher now listens to its event.

The route checklist at the bottom of the plan is present and accurate.

**WARNING:** The plan's "Type Signatures" section (line 348-355) defines `SettingsNotificationsProps` with `onSave?: (key: string, value: boolean) => void` and `initialValues?: Record<string, boolean>`. But the "Discovery" section (AC-3, line 117-118) says "The cleanest wiring is to call `useSettings()` directly inside `SettingsNotifications`." These are contradictory approaches. The `useSettings().save()` function takes `SettingsData` (the entire settings object), not `(key, value)`. If the component calls `useSettings()` directly, there are no props to define. If it takes props, the parent must translate. The plan must pick one approach and remove the other.

Examining the actual `useSettings().save()` signature (line 83-95 of `useSettings.ts`), it sends `{ notifications: updated.notifications }` -- requiring the caller to construct a full `SettingsData`. The direct-hook approach is simpler (the component reads `settings.notifications` and constructs the updated `SettingsData` on toggle change). The props-based approach adds an unnecessary abstraction layer for a component with a single usage site.

### 4. Data Model Alignment: 9/10

No schema changes. The plan correctly reads from existing columns:
- `teamMembers.costActual` (integer, default 0) -- verified in schema.ts line 95.
- `bets.costActualMinor` -- verified in schema.ts.
- `routineRuns.costMinor` -- verified in schema.ts.

The rail cost query (`sum(teamMembers.costActual)`) is valid against the schema. The plan correctly documents that `teamMembers.costActual` is cumulative, not daily-windowed (Risks & Ambiguities #1).

### 5. Naming: 9/10

All naming is honest and consistent:
- `conversationsBlockingCount` -- describes exactly what it measures.
- `BetActionKind` narrowing from 6 members to 3 -- clean, no aliasing.
- `KEY_MAP` for notification toggle → server field -- straightforward.
- No new domain primitives introduced, so no naming collisions.

### 6. Module Depth: 9/10

The changes are minimal-surface: one new prop on `SidebarProps`, one `useMemo` in `AppShell`, one event listener in `app.ts`, one scheduler call in `server-factory.ts`. No new modules, no new abstractions, no new exports. The plan correctly avoids creating a Badge component (two instances don't justify it).

### 7. Failure-Mode Coverage: 7/10

**Security & abuse cases** section is present and addresses scheduler abuse, notification PATCH amplification, and rate-limiting. All correctly marked applicable or N/A.

**WARNING:** The plan's `checkAndUnblockDependents` error handling is fire-and-forget with an empty catch:
```ts
void checkAndUnblockDependents(db, eventBus, event.taskId).catch(() => {});
```
This swallows all errors silently. The existing function has internal logging (`logger.warn` for malformed dependencies), but a database connection error or constraint violation during `transitionTask` would be completely invisible. The catch block should at minimum log the error. The plan should specify:
```ts
.catch((err) => {
  logger.error("dependency-watcher: checkAndUnblockDependents failed", {
    taskId: event.taskId,
    error: err instanceof Error ? err.message : String(err),
  });
});
```

**WARNING:** The rail cost query sums across ALL teams' `costActual` for a single `todaySpend` value. In a multi-team factory, this is correct (factory-wide spend), but the plan does not document this design decision. The team detail endpoint returns per-team cost. The rail returns factory-wide cost. This semantic distinction should be documented with a lore comment.

**SUGGESTION:** The routine scheduler poll interval of 60,000ms is hardcoded in the plan. The plan's "Risks & Ambiguities" #2 notes routines may fire up to 59s late. This is acceptable, but the plan does not specify what happens if `startRoutineScheduler` itself fails (e.g., the initial `registerEventTriggers` query fails). Looking at the code, `startRoutineScheduler` is async and the plan calls it in server-factory after createApp. If it rejects, the unhandled rejection would crash the server. The plan should specify a catch or try-catch.

### 8. Simplicity / Over-Engineering Risk: 9/10

The plan is admirably simple for a wiring workpackage. No abstractions, no feature flags, no registries, no plugin points. Each task is a 2-30 line change.

The "Design-It-Twice" section is genuine (not theatre) -- two real options with honest tradeoffs, and the simpler one is correctly chosen.

The `SettingsNotificationsProps` type in the Type Signatures section is mild over-engineering if the component uses `useSettings()` directly -- but this is already flagged as a contradiction in Dimension 3.

### 9. Verifiability: 7/10

Each AC has a concrete test file name and specific assertions. The test for AC-1 (routine scheduler boot) specifies a realistic integration test with polling. The test for AC-4 (sidebar badge) covers three states (count, zero, overflow). The test for AC-5 (bet button removal) correctly identifies which existing test assertions need updating.

**WARNING:** Task 7 says "Depends on: Tasks 1-6." This means all tests are written AFTER all implementation. This violates TDD (red-green principle). The plan should interleave tests with tasks: write each test file before its corresponding implementation task, or at minimum note that the red phase comes first within each task.

**WARNING:** The protected-tests list is present and specific (8 files). However, the list does not include `packages/web/src/pages/__tests__/WorkBet.L14-actions.test.tsx` -- which IS being modified. Modified test files should appear in the protected-tests list with an annotation that specific tests within are being intentionally changed (not accidentally broken). The current list implies this file is unprotected.

**SUGGESTION:** AC-6 test asserts `costBurnRate.todaySpend.minor === 5000`. The plan should also test the edge case where no teamMembers rows exist (to verify the `coalesce(sum(...), 0)` produces 0, not null).

---

## Findings

### CRITICAL

None.

### WARNING

1. **[plan §AC-3 "Discovery" vs §Type Signatures]** Contradictory `SettingsNotifications` integration approaches. The Discovery section says "call `useSettings()` directly inside `SettingsNotifications`" (no props needed). The Type Signatures section defines `SettingsNotificationsProps` with `initialValues` and `onSave`. The `useSettings().save()` function takes `SettingsData`, not `(key, value)`. Pick the direct-hook approach (simpler, single usage site) and remove the props type definition.

2. **[plan §AC-2 event handler]** Empty catch swallows all errors from `checkAndUnblockDependents`. Replace `catch(() => {})` with `catch((err) => { logger.error(...) })` so database errors, constraint violations, and unexpected failures are visible in logs.

3. **[plan §AC-2 Spec Alignment]** AC-2 in the spec says "a session is dispatched for it." The plan only transitions the task to `accepted`. This is a partial delivery -- the plan should explicitly state this in the AC-2 section (not just buried in Risks #3) and the test should NOT assert that a session exists, only that the task transitioned.

4. **[plan §Task 7]** Tests depend on Tasks 1-6, violating TDD ordering. The test for each AC should be written before (or concurrently with) the implementation task for that AC, not after all 6 tasks complete. Reorder to interleave: test then implement, per AC.

5. **[plan §Protected Tests]** `WorkBet.L14-actions.test.tsx` is being modified (Pause assertions change) but is absent from the protected-tests list. Add it with an annotation: "modified: Pause button assertions updated to assert absence."

### SUGGESTION

1. **[plan §AC-6]** Add a lore comment to the rail cost query documenting that `todaySpend` is factory-wide cumulative spend (summed across all teams' `costActual`), not daily or per-team.

2. **[plan §AC-1]** Specify error handling for `startRoutineScheduler` failure in server-factory. If `await startRoutineScheduler(...)` rejects, the server should log the error and continue (degraded mode: routines don't fire, but the server serves requests). Wrapping in try-catch with a logger.error is sufficient.

3. **[plan §AC-6 Verification]** Add an edge-case test for empty `teamMembers` table to verify the `coalesce(sum(...), 0)` produces `{ minor: 0 }`, not null.

### What's Working Well

1. **Plan Reconciliation table.** Every spec assumption is checked against reality, with a concrete resolution for each divergence. The layer violation discovery on fabric-cannot-import-server and the bet state machine analysis are particularly well-done -- they prevent the builder from hitting these walls during implementation.

2. **Migrations table (Symbol Renames/Removals).** Every call site for the removed `BetActionKind` members is enumerated with file, line number, and migration action. This is builder-ready -- no guesswork required. The `ConsequencePreviewDialogProps` narrowing table is equally precise.

---

## Verdict

Score 8/10 -- advances to build phase. The plan is well-structured for a wiring workpackage with strong codebase verification. The five WARNINGs are all addressable without restructuring: (1) pick one SettingsNotifications integration approach, (2) add error logging to the catch block, (3) document the partial AC-2 delivery, (4) reorder tests for TDD compliance, (5) add modified test file to protected list. None block the builder from starting.

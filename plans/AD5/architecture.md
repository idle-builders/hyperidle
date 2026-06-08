# AD5 — Architecture Plan

## Required Reading

From concept doc:
- `packages/fabric/src/bootstrap.ts`
- `packages/fabric/src/services/routine-scheduler.ts`
- `packages/server/src/services/dependency-watcher.ts`
- `packages/server/src/services/task-state-machine.ts`
- `packages/server/src/app.ts` (lines 55-100, 500-523)
- `packages/server/src/server-factory.ts`
- `packages/server/src/routes/settings.ts`
- `packages/server/src/routes/rail.ts`
- `packages/server/src/routes/teams-routes.ts` (lines 580-730)
- `packages/web/src/hooks/useSettings.ts`
- `packages/web/src/settings/SettingsNotifications.tsx`
- `packages/web/src/shell/Sidebar.tsx`
- `packages/web/src/layouts/AppShell.tsx` (lines 324-393)
- `packages/web/src/pages/WorkBet.tsx` (lines 298, 770-847, 1100-1170)
- `packages/web/src/pages/__tests__/WorkBet.L14-actions.test.tsx`
- `packages/shared/src/events.ts`

From design:
- `plans/AD5/design/approved.md`

---

## Plan Reconciliation: Spec vs Reality

| Spec Assumption | Reality | Resolution |
|---|---|---|
| `startRoutineScheduler()` in `bootstrapFabric()` | `bootstrapFabric` is sync; `startRoutineScheduler` is async (returns `Promise<RoutineScheduler>`). | Call in `server-factory.ts` after `createApp` instead. Keeps bootstrap sync, scheduler disposer in server-factory's own dispose chain. |
| `checkAndUnblockDependents(completedTaskId)` when task→done | The function exists but is never called from `transitionTask` or any event handler. | Register a `task_state_changed` listener in `bootstrapFabric` that calls `checkAndUnblockDependents` when `toState === "done"`. |
| "dispatch a session for the newly accepted task" | No auto-session-dispatch mechanism exists. `provisionSession` requires workspace adapters, harness setup, etc. The routine scheduler's `createRoutineSession` is a lightweight alternative. | Emit `task_state_changed` event (already happens via `transitionTask` inside `checkAndUnblockDependents`). Full session provisioning requires harness infrastructure beyond this wiring WP. The transition to `accepted` makes the task visible for assignment. |
| `useSettings` in `SettingsNotifications` | `SettingsNotifications` uses local `useState` only. `useSettings` exists with a `save()` method. But `SettingsNotifications` doesn't receive settings data — it uses hardcoded defaults. | Wire `SettingsNotifications` to accept initial values + save callback as props. Parent (`SettingsPage`) provides them from `useSettings`. |
| Sidebar blocking count badges | Y4 pattern exists for Knowledge. Sidebar has `knowledgeTriageCount` prop but no `conversationsBlockingCount` prop. | Add `conversationsBlockingCount` prop. AppShell computes it from existing `conversationsThreads.threads`. |
| Bet pause/resume endpoints | No `/pause`, `/resume`, `/activate` endpoints exist. State machine has 4 states (no "paused"). | Remove pause/resume/activate buttons from WorkBet UI. Activate is functionally equivalent to the existing `/commit` endpoint — but the WorkBet `handleActivate` calls a non-existent `/activate` URL. The `/commit` endpoint already transitions draft→active. Remove the redundant code. |
| Cost values show real spend | Rail returns `todaySpend: { minor: 0 }`. Team detail returns `costActual` from `teamMembers.costActual`. `teamMembers.costActual` is updated by `recordCostAndCheck` in cost-cap.ts. | Rail cost: read from `teamMembers` aggregate (sum all teams' costActual). Per-agent breakdown: already available in roster via team detail endpoint. |
| `email-digests` toggle | No server field. | Keep local-only; persist only the three mapped toggles. |
| ConsequencePreviewDialog `kind: "pause" | "kill"` | The dialog supports both "pause" and "kill" kinds. | Narrow the kind to `"kill"` only. Update dialog copy. |

---

## Acceptance Criteria & Verification

### AC-1: Routine Scheduler Fires Automatically

**What:** Routines with cron schedules fire without manual "Trigger Now."

**Implementation:**
- In `packages/server/src/server-factory.ts`, after `createApp()`, call `startRoutineScheduler(db, eventBus, { pollIntervalMs: 60_000 })`.
- Store the returned `RoutineScheduler` handle.
- Add `scheduler.stop()` to the `dispose` function before `disposeApp(app)`.

**Verification:** Integration test in `packages/server/src/__tests__/AD5-routine-scheduler-boot.test.ts`:
- Create a test app with `bootstrapFabric` passed as `strategyBootstrap`.
- Insert a routine with `nextRunAt` in the past and `active: true`.
- Call `startRoutineScheduler` with a fast poll interval (100ms).
- Wait for the scheduler to fire (poll with `setTimeout`).
- Assert the routine's `lastRunAt` is updated and a session row exists.
- Call `scheduler.stop()` and verify no further firings.

### AC-2: Dependency Auto-Unblock

**What:** When a task transitions to `done` and a downstream task's last dependency clears, the downstream task auto-transitions from `hold` to `accepted`.

**Implementation:**
- In `packages/fabric/src/bootstrap.ts`, register a new event handler:
  ```ts
  const unsubDepWatcher = eventBus.on("task_state_changed", (event) => {
    if (event.toState === "done") {
      void checkAndUnblockDependents(db, eventBus, event.taskId).catch(() => {
        /* fire-and-forget: errors logged inside checkAndUnblockDependents */
      });
    }
  });
  disposers.push(unsubDepWatcher);
  ```
- Import `checkAndUnblockDependents` from `@hyperidle/server` ... wait, that's a layer violation. Fabric cannot depend on server.

**Layer violation resolution:** `checkAndUnblockDependents` is in `packages/server/src/services/dependency-watcher.ts`. Fabric cannot import from server (dependency direction: server → fabric, not reverse).

**Two options:**
1. Move `checkAndUnblockDependents` to fabric (it only depends on db + eventBus + `transitionTask`)
2. Register the handler in the server layer instead of fabric

Option 2 is simpler: register the `task_state_changed` listener in `app.ts` alongside the other server-side event handlers. The handler calls `checkAndUnblockDependents` which is already in the server package.

**Revised implementation:**
- In `packages/server/src/app.ts`, inside the `if (db)` block (where disposers are collected), add:
  ```ts
  import { checkAndUnblockDependents } from "./services/dependency-watcher.js";
  
  const unsubDepWatcher = eventBus.on("task_state_changed", (event) => {
    if (event.toState === "done") {
      void checkAndUnblockDependents(db, eventBus, event.taskId).catch(() => {});
    }
  });
  disposers.push(unsubDepWatcher);
  ```

**Idempotency:** `checkAndUnblockDependents` re-reads task state each time. Calling it twice for the same completedTaskId:
- First call: dependent moves hold→accepted (via `transitionTask`), emits `task_state_changed`.
- Second call: dependent is now `accepted`, not `hold`, so the candidate query returns no rows. No-op.

**Verification:** Existing test `packages/server/src/__tests__/dependency-watcher.test.ts` already covers the core behavior. New integration test `packages/server/src/__tests__/AD5-dep-unblock-event.test.ts`:
- Create app with db + eventBus.
- Insert task A (in_progress) and task B (hold, dependencies: ["A"]).
- Transition task A to done via POST `/api/tasks/A/transition`.
- Assert task B is now `accepted` (poll or direct DB read).
- Assert `task_state_changed` event was emitted for task B.

### AC-3: Notification Preferences Persist

**What:** Notification preferences set in Settings persist across page refresh.

**Discovery:** `SettingsNotifications` is rendered in `SettingsPage.tsx` with zero props — fully self-contained. `useSettings` hook exists (`packages/web/src/hooks/useSettings.ts`) with a `save()` method but is NOT used in any production component. The cleanest wiring is to call `useSettings()` directly inside `SettingsNotifications`.

**Implementation in `packages/web/src/settings/SettingsNotifications.tsx`:**
1. Import `useSettings` from `../hooks/useSettings.js`
2. On mount, call `useSettings()` to get server-persisted values
3. Initialize toggle states from `settings.notifications` (mapping server keys to UI keys):
   - `reviewAlerts` → `review-requests`
   - `costAlerts` → `cost-alerts`
   - `blockerAlerts` → `blocker-notifications`
   - `email-digests` stays local-only (no server field)
4. On toggle change, if the key has a server mapping, call `save()` with updated `SettingsData`
5. Handle loading state (show toggles with defaults until API responds)
6. Handle save failure (revert toggle to previous value)

**Key mapping:**

```ts
const KEY_MAP: Record<string, keyof NotificationSettings> = {
  "review-requests": "reviewAlerts",
  "cost-alerts": "costAlerts",
  "blocker-notifications": "blockerAlerts",
};
```

**Verification:** Test `packages/web/src/__tests__/AD5-settings-notifications.test.tsx`:
- Mock `apiFetch` to return settings with `{ notifications: { reviewAlerts: false, costAlerts: true, blockerAlerts: true } }`.
- Render `SettingsNotifications`.
- Assert "Review requests" toggle is OFF (matches server value).
- Click "Review requests" toggle.
- Assert `apiFetch` was called with PATCH and body containing `{ notifications: { reviewAlerts: true } }`.
- Server integration already tested in `packages/server/src/routes/__tests__/` settings tests.

### AC-4: Sidebar Conversations Blocking Badge

**What:** The sidebar shows a count badge on the Conversations section header indicating blocking threads.

**Implementation in `packages/web/src/shell/Sidebar.tsx`:**
- Add `conversationsBlockingCount?: number` to `SidebarProps`.
- Wrap the Conversations `SectionHeader` in a flex container (same as Knowledge section).
- Render the badge span when count > 0 (identical styling to Knowledge triage badge).
- `data-testid="conversations-blocking-badge"`.

**Implementation in `packages/web/src/layouts/AppShell.tsx`:**
- Compute `conversationsBlockingCount`:
  ```ts
  const conversationsBlockingCount = useMemo(
    () => conversationsThreads.threads.filter(t => t.hasUnresolvedReview).length,
    [conversationsThreads.threads]
  );
  ```
- Pass `conversationsBlockingCount` to `<Sidebar>`.

**Reactivity:** The `useConversationsThreads` hook already re-fetches when thread data changes via WebSocket push. The badge updates automatically.

**Verification:** Test `packages/web/src/__tests__/AD5-sidebar-conversations-badge.test.tsx`:
- Render Sidebar with `conversationsBlockingCount={3}`.
- Assert `data-testid="conversations-blocking-badge"` is visible with text "3".
- Render with `conversationsBlockingCount={0}`.
- Assert badge is NOT in the document.
- Render with `conversationsBlockingCount={150}`.
- Assert badge shows "99+".

### AC-5: Bet Pause/Resume Removal

**What:** Pause/resume/activate buttons removed from WorkBet UI.

**Implementation in `packages/web/src/pages/WorkBet.tsx`:**
1. Change `BetActionKind` type to: `"kill" | "adjust-appetite" | "unblock"`
2. Delete `handleResume` function (lines ~777-789)
3. Delete `handleActivate` function (lines ~799-819)
4. Remove `"pause"`, `"resume"`, `"activate"` cases from `handleAction` (lines ~823-834)
5. Remove `handleResume` and `handleActivate` from `handleAction`'s dependency array
6. Delete the "Activate" button JSX (lines ~1114-1123)
7. Delete the "Pause" button JSX (lines ~1125-1134)
8. Change `ConsequencePreviewDialogProps.kind` from `"pause" | "kill"` to `"kill"` only
9. Remove all "pause" references from the dialog (title, label, placeholder text)
10. Update `ConsequencePreviewDialog` function to remove the `isKill` conditional — it's always kill

**Migration: Test updates in `packages/web/src/pages/__tests__/WorkBet.L14-actions.test.tsx`:**
- Test "shows Pause and Kill in overflow dropdown for active status" (line 83): Update to assert ONLY Kill is present, Pause is absent.
- Test "does NOT show Pause in overflow dropdown for draft status" (line 107): Keep as-is (still correct — no Pause for draft).
- Test "renders no Kill or Pause in overflow dropdown for completed status" (line 127): Keep the Pause assertion (still correct — no Pause).
- Test "renders no Kill or Pause in overflow dropdown for killed status" (line 135): Same.
- No test references `data-bet-action="activate"` — no changes needed for activate.

**Verification:** Updated test assertions (above) + `npm run check` passes (type narrowing from removing union members).

### AC-6: Cost Values Show Real Spend

**What:** Cost values on Work team page show real spend, not zeros.

**Analysis:** The team detail endpoint (`GET /api/teams/:id` in `teams-routes.ts`) already computes:
- `burn.costActual` from `teamMembers.costActual` (line 680, 710-712)
- `burn.betCostActual` from `bets.costActualMinor` sum (line 590-594, 718-720)
- `burn.routineCostThisMonth` from `routineRuns.costMinor` sum (line 603-624, 722-725)

These values are populated by `recordCostAndCheck` in fabric `cost-cap.ts`, which updates `teamMembers.costActual` and `bets.costActualMinor` when sessions report costs. The data flow is already wired end-to-end.

The RAIL endpoint returns zeros because it hardcodes `{ minor: 0, currency: factoryCurrency }` (rail.ts line 131).

**Implementation in `packages/server/src/routes/rail.ts`:**
- Replace hardcoded zero spend with actual aggregation:
  ```ts
  // Sum teamMembers.costActual across all teams for todaySpend
  import { teamMembers } from "@hyperidle/db";
  import { sql } from "drizzle-orm";
  
  const [spendRow] = await db
    .select({ total: sql<number>`coalesce(sum(${teamMembers.costActual}), 0)` })
    .from(teamMembers);
  const totalSpendMinor = spendRow?.total ?? 0;
  ```
- The rail cost becomes:
  ```ts
  todaySpend: { minor: totalSpendMinor, currency: factoryCurrency },
  ```

**Note:** `teamMembers.costActual` is a cumulative field, not daily. For true "today" spend, we would need a time-windowed query against session costs — but session cost columns were stripped in O2. The pragmatic v1: show cumulative spend (matching what the team page shows) rather than daily spend. The field name `todaySpend` is misleading but changing the rail API shape is out of scope.

**Per-agent breakdown:** The team detail endpoint already returns roster members with cost data via the agent health/status query. No additional work needed.

**Verification:** Integration test `packages/server/src/__tests__/AD5-rail-cost.test.ts`:
- Create test app with db + seed a team with `teamMembers.costActual = 5000`.
- Set `cost_cap_daily_minor` factory setting.
- GET `/api/rail`.
- Assert `costBurnRate.todaySpend.minor === 5000` (not 0).
- Assert `costBurnRate.todayCap` is populated from factory settings.

### AC-7: Cost From Session Accumulation

**What:** Cost is populated from session cost accumulation in the fabric layer.

**Analysis:** This is already implemented. The `recordCostAndCheck` function in `packages/fabric/src/services/cost-cap.ts`:
- Receives `costMinor` + `currency` from session cost reports
- Updates `bets.costActualMinor` via task→bet lookup (R5, line 40)
- The team detail endpoint reads these values

The missing piece is that `recordCostAndCheck` needs to be called. It IS called — the harness calls it when a session reports cost. The data flow is:
1. Harness reports cost → `recordCostAndCheck` → updates `bets.costActualMinor`, `teamMembers.costActual`
2. `GET /api/teams/:id` → reads `bets.costActualMinor`, `teamMembers.costActual` → returns in `burn`
3. WorkTeam page renders `burn.costActual`, `burn.betCostActual`

**The gap:** If no sessions have run and reported costs, the values will be 0 or null. This is correct behavior — there IS no spend. The "zeros" the spec mentions are likely from the RAIL endpoint (AC-6), not the team page.

**Verification:** Covered by AC-6 test (rail endpoint reads real spend). Additional test in existing `cost-cap.test.ts` framework: verify `recordCostAndCheck` updates `bets.costActualMinor` for the correct bet.

---

## Ordered Task List

### Task 1: Wire routine scheduler in server-factory (AC-1)

**Files:**
- `packages/server/src/server-factory.ts` — add `startRoutineScheduler` call after createApp, add stop to dispose
- `packages/fabric/src/index.ts` — ensure `startRoutineScheduler` is exported

**Depends on:** Nothing.

### Task 2: Wire dependency unblock on task→done (AC-2)

**Files:**
- `packages/server/src/app.ts` — add `task_state_changed` listener that calls `checkAndUnblockDependents`

**Depends on:** Nothing.

### Task 3: Wire notification settings persistence (AC-3)

**Files:**
- `packages/web/src/settings/SettingsNotifications.tsx` — import useSettings, read server values, call save on toggle change

**Depends on:** Nothing. SettingsPage renders SettingsNotifications with no props; no change needed in SettingsPage.

### Task 4: Add sidebar conversations blocking badge (AC-4)

**Files:**
- `packages/web/src/shell/Sidebar.tsx` — add `conversationsBlockingCount` prop, render badge
- `packages/web/src/layouts/AppShell.tsx` — compute count from conversationsThreads, pass to Sidebar

**Depends on:** Nothing.

### Task 5: Remove bet pause/resume/activate (AC-5)

**Files:**
- `packages/web/src/pages/WorkBet.tsx` — remove buttons, handlers, type narrowing
- `packages/web/src/pages/__tests__/WorkBet.L14-actions.test.tsx` — update test assertions

**Depends on:** Nothing.

### Task 6: Fix rail cost values (AC-6)

**Files:**
- `packages/server/src/routes/rail.ts` — replace hardcoded zeros with DB query

**Depends on:** Nothing.

### Task 7: Write tests for all ACs

**Test files (new):**
- `packages/server/src/__tests__/AD5-routine-scheduler-boot.test.ts`
- `packages/server/src/__tests__/AD5-dep-unblock-event.test.ts`
- `packages/web/src/__tests__/AD5-settings-notifications.test.tsx`
- `packages/web/src/__tests__/AD5-sidebar-conversations-badge.test.tsx`
- `packages/server/src/__tests__/AD5-rail-cost.test.ts`

**Test files (modified):**
- `packages/web/src/pages/__tests__/WorkBet.L14-actions.test.tsx`

**Depends on:** Tasks 1-6.

---

## Type Signatures & Schemas

### SidebarProps Addition

```ts
// packages/web/src/shell/Sidebar.tsx
export interface SidebarProps {
  // ... existing props ...
  
  /**
   * AD5: count of threads with unresolved reviews (blocking).
   * When > 0, a numeric badge renders adjacent to the Conversations header.
   */
  conversationsBlockingCount?: number;
}
```

### SettingsNotifications Props

```ts
// packages/web/src/settings/SettingsNotifications.tsx
interface SettingsNotificationsProps {
  /** Initial toggle values from server. Falls back to hardcoded defaults if absent. */
  initialValues?: Record<string, boolean>;
  /** Called on each toggle change with (key, newValue). */
  onSave?: (key: string, value: boolean) => void;
}
```

### BetActionKind (narrowed)

```ts
// packages/web/src/pages/WorkBet.tsx
type BetActionKind = "kill" | "adjust-appetite" | "unblock";
```

### ConsequencePreviewDialogProps (narrowed)

```ts
// packages/web/src/pages/WorkBet.tsx
interface ConsequencePreviewDialogProps {
  open: boolean;
  kind: "kill"; // was "pause" | "kill"
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}
```

---

## Security & Abuse Cases

| Vector | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | No new endpoints. Existing rate limits apply to PATCH /api/settings. |
| Input-trust boundary | N/A | No new user input surfaces. Notification toggles are boolean-validated by Zod schema. |
| Secret handling | N/A | No new credentials. |
| Path traversal | N/A | No file paths involved. |
| SSRF | N/A | No outbound URLs. |
| Scheduler abuse | Applicable | The routine scheduler polls on a fixed interval. A malicious routine with a past `nextRunAt` fires immediately — this is by design (routines are founder-configured). The `shouldCoalesce` check prevents double-firing. Factory cost cap provides the safety net. |
| Notification PATCH amplification | Low risk | Each toggle fires one PATCH. No debounce, but the payload is tiny and the endpoint is rate-limited globally. Rapid toggling produces multiple PATCHes; the last one wins (idempotent merge). |

---

## Protected Tests

```
protectedTests:
  - packages/server/src/__tests__/dependency-watcher.test.ts
  - packages/server/src/__tests__/dependency-watcher.perf.test.ts
  - packages/server/src/__tests__/task-state-machine.test.ts
  - packages/server/src/__tests__/cost-cap.test.ts
  - packages/server/src/__tests__/AA3-routine-cost.test.ts
  - packages/web/src/__tests__/Sidebar.test.tsx
  - packages/web/src/__tests__/Sidebar.y4-triage-badge.test.tsx
  - packages/web/src/hooks/__tests__/useSettings.test.ts
```

These existing tests must pass unchanged. The only test file that changes is `WorkBet.L14-actions.test.tsx` (modifying Pause assertions).

---

## Risks & Ambiguities

1. **Rail `todaySpend` is actually cumulative spend.** `teamMembers.costActual` is not windowed to "today." Renaming the field is an API-breaking change beyond this WP's scope. Pragmatic choice: populate with cumulative data, which is better than zeros. Document with a lore comment.

2. **Routine scheduler poll interval.** Using 60s. This means routines scheduled for a specific minute might fire up to 59s late. Acceptable for a cron-shaped scheduler; precision below 1 minute is not promised.

3. **Session dispatch on dependency unblock.** The spec says "dispatch a session for the newly accepted task." The architecture plan only transitions the task to `accepted` (via existing `checkAndUnblockDependents`). Full session provisioning (workspace, harness, adapter) is not wired — that requires harness infrastructure that isn't available in the event handler context. The `task_state_changed` event emission makes the task visible for the next scheduling cycle. This is a known gap; the wiring is partial.

4. **bootstrapFabric stays sync.** The dependency watcher handler is registered in `app.ts` (server layer), not in `bootstrapFabric` (fabric layer), to respect the dependency direction. The scheduler is started in `server-factory.ts`. `bootstrapFabric`'s signature does not change.

5. **SettingsPage integration.** Need to verify how `SettingsPage` currently renders `SettingsNotifications` — whether it passes props or the component is self-contained. The wiring approach adapts to what exists.

---

## Migrations (Symbol Renames/Removals)

### Removed: `BetActionKind` union members "pause" | "resume" | "activate"

| Call site | File | Migration |
|---|---|---|
| Type definition | `packages/web/src/pages/WorkBet.tsx` line 298 | Remove from union |
| `handleAction` switch | `packages/web/src/pages/WorkBet.tsx` lines 823-834 | Remove cases |
| `handleResume` function | `packages/web/src/pages/WorkBet.tsx` lines 777-789 | Delete |
| `handleActivate` function | `packages/web/src/pages/WorkBet.tsx` lines 799-819 | Delete |
| Activate button JSX | `packages/web/src/pages/WorkBet.tsx` lines 1114-1123 | Delete |
| Pause button JSX | `packages/web/src/pages/WorkBet.tsx` lines 1125-1134 | Delete |
| `handleAction` deps array | `packages/web/src/pages/WorkBet.tsx` line 846 | Remove `handleResume`, `handleActivate` |

### Narrowed: `ConsequencePreviewDialogProps.kind`

| Call site | File | Migration |
|---|---|---|
| Type definition | `packages/web/src/pages/WorkBet.tsx` line 318 | `"kill"` only |
| `consequenceDialog` state | `packages/web/src/pages/WorkBet.tsx` line ~693 | Narrow type |
| `ConsequencePreviewDialog` body | `packages/web/src/pages/WorkBet.tsx` lines 323-340 | Remove `isKill` conditional, always use kill copy |
| Dialog `placeholder` | `packages/web/src/pages/WorkBet.tsx` line 443 | Remove pause text |
| `handleConfirm` endpoint | `packages/web/src/pages/WorkBet.tsx` line 914 | Remove pause endpoint, always use "kill" |

### Test updates: `WorkBet.L14-actions.test.tsx`

| Test | Line | Migration |
|---|---|---|
| "shows Pause and Kill in overflow dropdown for active status" | 83-90 | Change: assert Kill present, Pause absent |
| "does NOT show Pause in overflow dropdown for draft status" | 107-110 | Keep (still correct) |
| "renders no Kill or Pause in overflow dropdown for completed status" | 127-133 | Keep (still correct) |
| "renders no Kill or Pause in overflow dropdown for killed status" | 135-141 | Keep (still correct) |
| "does NOT show Resume in overflow dropdown" | 143-147 | Keep (still correct) |

---

## Route Checklist

No new routes. Affected existing routes:
- `PATCH /api/settings` — no change, already handles notification prefs
- `GET /api/rail` — cost computation change (query, not shape)
- `POST /api/tasks/:id/transition` — no change, but dependency watcher now listens to its event

---

## Design-It-Twice: Dependency Watcher Registration

**Option A: Register in app.ts (server layer)**
- Handler lives in `app.ts` alongside disposer bag.
- `checkAndUnblockDependents` is already in the server package.
- No cross-package dependency issues.
- Trade-off: the handler is "kernel" code responding to a domain event, not truly strategy-layer.
- Reject reason for moving to fabric: fabric cannot import from server (layer violation).

**Option B: Move checkAndUnblockDependents to fabric**
- Function moves to `packages/fabric/src/services/dependency-watcher.ts`.
- It only depends on `db`, `eventBus`, `tasks` table, `transitionTask` (from server's task-state-machine).
- But `transitionTask` is in the server package — so we'd need to move that too, or inject it.
- Trade-off: Correct layering but cascading moves.
- Reject reason: Too much churn for a wiring workpackage.

**Decision: Option A.** Register in `app.ts`. The handler is a one-liner calling an existing service function. Moving code between packages is a refactoring concern, not a wiring concern.

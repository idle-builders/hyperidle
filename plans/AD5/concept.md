# AD5 — Concept Assessment

## Classification: No New or Reshaped Concepts

AD5 is a pure wiring workpackage. All nouns are **stable** — already built, documented, and contract-locked. No concept probing is needed.

## Noun Classification

| Noun | Classification | Evidence |
|---|---|---|
| Routine Scheduler | Stable | Built: `packages/fabric/src/services/routine-scheduler.ts`. Documented: `docs/process-layer/recurring-routines.md`. |
| Dependency Watcher | Stable | Built: `packages/server/src/services/dependency-watcher.ts`. Documented: `docs/process-layer/task-lifecycle.md` line 5. |
| Notification Preferences | Stable | API: `PATCH /api/settings`. Hook: `useSettings().save()`. Documented: `docs/human-interface-layer/interaction-cadences-notification-discipline.md`. |
| Sidebar Badge | Stable | Pattern exists: `knowledgeTriageCount` on Knowledge section (Y4). Reuse for Conversations blocking count. |
| Bet Lifecycle (pause/resume) | Stable | State machine is 4-state: draft/active/completed/killed. No "paused" state. `VALID_TRANSITIONS` in `bet-state-machine.ts` is authoritative. UI buttons call non-existent endpoints — they must be removed. |
| Cost Burn Rate | Stable | Accumulation: `cost-cap.ts` `recordCostAndCheck`. Team API: `GET /api/teams/:id` already returns `betCostActual` and `routineCostThisMonth`. Rail endpoint returns zeros due to O2 kernel/strategy separation (known gap). |

## Key Design Decision: Bet Pause/Resume

The bet state machine was deliberately simplified in U1 from 9 states to 4 (draft, active, completed, killed). The old "paused" state was folded into "active" — a running bet can be killed but not paused. The WorkBet UI has pause/resume/activate buttons that call endpoints (`/api/bets/:id/resume`, `/api/bets/:id/activate`) that do not exist and cannot exist given the current state machine.

**Decision:** Remove the pause/resume/activate buttons from the UI. The state machine contract in `docs/process-layer/bets-shape-commit-change-ship.md` and the `VALID_TRANSITIONS` constant are authoritative. Adding a "paused" state back would contradict the U1 simplification and require migration, schema changes, and state machine updates — far beyond AD5's "wire existing features" scope.

## Key Design Decision: Cost in Rail

The rail endpoint (`/api/rail`) currently returns `todaySpend: { minor: 0, ... }` because session cost columns were stripped from the kernel `sessions` table in O2 (kernel/strategy separation). Cost is now tracked at the strategy/fabric layer via `recordCostAndCheck` which updates `teamMembers.costActual`. The rail should read from the same source the team detail endpoint uses (`teamMembers` + `bets.costActualMinor`), not from session-level aggregation.

## Required Reading for Downstream Skills

| File | Why |
|---|---|
| `packages/fabric/src/bootstrap.ts` | Where `startRoutineScheduler` must be called |
| `packages/fabric/src/services/routine-scheduler.ts` | Scheduler API shape and disposer pattern |
| `packages/server/src/services/dependency-watcher.ts` | `checkAndUnblockDependents` signature |
| `packages/server/src/services/task-state-machine.ts` | Where `task_state_changed` event is emitted |
| `packages/server/src/app.ts` lines 500-523 | APP_DISPOSERS pattern for strategy bootstrap |
| `packages/server/src/routes/settings.ts` | PATCH endpoint for notification prefs |
| `packages/web/src/hooks/useSettings.ts` | `save()` function shape |
| `packages/web/src/settings/SettingsNotifications.tsx` | Toggle UI that needs wiring |
| `packages/web/src/shell/Sidebar.tsx` | Y4 badge pattern to replicate |
| `packages/web/src/layouts/AppShell.tsx` lines 324-326 | Y4 triage count fetch pattern |
| `packages/web/src/pages/WorkBet.tsx` lines 298, 779-832, 1118-1131 | Pause/resume buttons to remove |
| `packages/server/src/routes/rail.ts` | Cost burn rate zeros to fix |
| `packages/server/src/routes/teams-routes.ts` lines 590-624 | Working cost computation pattern |
| `packages/server/src/services/bet-state-machine.ts` lines 37-42 | Authoritative VALID_TRANSITIONS |
| `docs/process-layer/wip-and-cost-limits.md` | Cost model contracts |
| `docs/process-layer/recurring-routines.md` | Routine scheduler contracts |
| `docs/process-layer/task-lifecycle.md` | Dependency unblocking contract |

## Contracts Reaffirmed (not changed)

- **Routine Scheduler disposer pattern:** Returns `{ stop: () => void }`. Caller pushes `stop` into the disposer bag.
- **Dependency unblocking is idempotent:** `checkAndUnblockDependents` re-reads task state; calling it twice for the same completedTaskId produces at most one transition per dependent task.
- **Cost is Money (minor units + currency):** No duration axis. `WireMoney` type on the wire.
- **Bet state machine is closed:** 4 states, transitions defined in `VALID_TRANSITIONS`. No "paused" state.
- **Sidebar badges follow the Y4 pattern:** Numeric count, `data-testid`, 99+ overflow, same styling as `knowledge-triage-badge`.

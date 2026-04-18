# G4 — Built-in Routines — Plan

Spec: `docs/work-packages/TRACK-G.md §G4`.

## 1. Routine IDs (stable, non-UUID)

```
builtin:cost-sentinel
builtin:practice-meeting
builtin:post-bet-retro
builtin:portfolio-retro
builtin:knowledge-decay
```

## 2. Trigger configs

| Routine            | triggerType | triggerConfig                                          | Owner (seed id)                    | skillId                |
| ------------------ | ----------- | ------------------------------------------------------ | ---------------------------------- | ---------------------- |
| Cost Sentinel      | heartbeat   | `{ intervalSeconds: 900 }`                             | `seed-agent-cos`                   | `cost_watchdog`        |
| Practice Meeting   | calendar    | `{ cron: "0 10 * * MON" }`                             | `seed-agent-pf-facilitation`       | `practice_meeting`     |
| Post-Bet Retro     | event       | `{ eventType: "bet_shipped" }`                         | `seed-agent-pm-nimmly`             | `bet_retro`            |
| Portfolio Retro    | calendar    | `{ cron: "0 10 1-7 * MON" }` (first Monday of month)   | `seed-agent-cos`                   | `portfolio_retro`      |
| Knowledge Decay    | calendar    | `{ cron: "0 2 * * *" }`                                | `seed-agent-cos`                   | `knowledge_decay`      |

### "First Monday of the month" — cron feasibility

The existing `parseCron`/`nextCronMatch` in `routine-scheduler.ts` requires
**all five** fields to match: minute, hour, dayOfMonth (1–7), month, dayOfWeek
(MON). That is the "AND of both" semantics (the Unix cron "if both DOM and DOW
are restricted, either may match" quirk is NOT implemented — this parser always
ANDs them). For "first Monday of the month" we want the AND semantics:
`dayOfMonth ∈ {1..7}` AND `dayOfWeek = MON`. Verified by reading
`fieldMatches` + the match loop (lines 125–149). No parser extension needed.

## 3. Handler dispatch

`runBuiltinRoutine(db, eventBus, routineId, args?)` switches on `routineId`:

- `builtin:cost-sentinel` → reads factory `cost_cap` / `cost_actual` from
  `factory_settings`, computes ratio, emits `cost_cap_warning` (≥ 80%) and/or
  `cost_cap_breached` (≥ 100%) events targeted at `entityId="factory"`.
  Returns `{ fired: true, emitted: [...eventTypes] }`.
- `builtin:practice-meeting` → creates a new practice meeting anchor for the
  `facilitation` community using `createPracticeMeeting` (G3). Returns
  `{ fired: true, meetingId }`. Turn execution is out of scope.
- `builtin:post-bet-retro` → args = `{ betId }`. Loads the bet, writes a
  review `items` row titled `Post-bet retro: <bet.pitch>` with body that
  restates the hypothesis and records the realized outcome (from `bet.notes`
  / `bet.auditTrail`). Respects `silent`/`autonomyLevel` — when `silent=1` we
  still record the review but omit the `item_created` event to suppress
  notifications.
- `builtin:portfolio-retro` → aggregates `knowledge_items` with `layer ∈
  {"L3","L4"}` and `updated_at ≥ nowMs - 30 days`, writes a summary review
  item.
- `builtin:knowledge-decay` → calls `runStaleSweep(db, eventBus, nowMs)` from
  `@hyperidle/fabric`.

### Event-trigger integration for Post-Bet Retro

The scheduler's `registerEventTriggers` already subscribes event routines to
their configured event. But the existing handler spins up a session via
`createRoutineSession` — not what G4 wants for the retro (which should write a
review item and **not** require a `taskId`).

To avoid changing the scheduler's public interface, G4 introduces a thin
extension: `registerBuiltinRoutineHandlers(db, eventBus)` subscribes the
built-ins' `bet_shipped` handler directly. The scheduler's generic event-firing
path is kept untouched — the post-bet-retro routine's `triggerConfig.taskId` is
intentionally omitted, so the scheduler short-circuits it with "no taskId in
trigger config" (which the retro handler has already handled). `active=0` is
respected by the builtin handler (early return).

## 4. Manual trigger API

`POST /routines/:id/trigger` (existing):

- Extended: if routine id is a builtin, invoke `runBuiltinRoutine` instead of
  the generic session-creation path.
- If `routine.active === 0`, respond **403** `ROUTINE_DISABLED` without firing.
- Non-builtin path keeps current session-creation behaviour.

## 5. Seed updates (`packages/db/src/seed.ts`)

Call `seedBuiltinRoutines(db)` at the end of `seed()` so all 5 builtins are
inserted idempotently (`onConflictDoNothing`).

## 6. Test → AC map

| AC | Test                                                                                                     |
| -- | -------------------------------------------------------------------------------------------------------- |
| 1  | `runCostSentinel emits cost_cap_warning at 80%` + `emits cost_cap_breached at 100%` + `no-op below 80%`  |
| 2  | `runPracticeMeetingRoutine creates a new anchor row with role=practice_meeting_anchor`                   |
| 3  | `runPostBetRetro writes a review item comparing hypothesis vs reality for a shipped bet`                 |
| 4  | `runPortfolioRetro aggregates L3/L4 knowledge updated in last 30 days`                                   |
| 5  | `runKnowledgeDecay calls runStaleSweep and transitions stale items`                                      |
| 6  | `seed inserts all 5 builtins with correct trigger configs and owners` (in `seed.test.ts`)                |
| 7  | `POST /routines/builtin:cost-sentinel/trigger → 200 and emits cost_cap_warning when factory at threshold`|
| 8  | `POST /routines/:id/trigger returns 403 when active=0`                                                   |

Additional edge-case tests:

- `seedBuiltinRoutines is idempotent across two runs`
- `first-Monday cron fires on next first Monday (sanity check via parseCron + nextCronMatch)`
- `event-triggered post-bet-retro runs on bet_shipped and is skipped when active=0`

## 7. Risks & notes

- The scheduler's `checkAndFireRoutine` path requires a `taskId` in the
  trigger config; builtin routines bypass that path because their handlers
  create no sessions (except Post-Bet Retro via manual trigger, which uses
  the builtin handler).
- `runStaleSweep` expects a fabric db handle — the same Drizzle handle works.
- Emitting events from the cost sentinel reuses the shared event-bus dedupe
  mechanism; we intentionally do NOT call into `recordCostAndCheck` because
  there is no session context — instead we emit events directly on the bus.

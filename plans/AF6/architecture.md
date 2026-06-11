# AF6 — Architecture: Routine Scheduler Boot

Concept: `plans/AF6/concept.md` (WIRED, not reshaped). No new primitive, no new scheduling dependency.

## Revision 1 — critique fixes (score 7/10, approved-conditional)

Scope (iii) **RATIFIED and intact**: AF6 ships built-in auto-fire only; generic-routine auto-fire deferred to AF7. Changes folded from `architecture-critique.md`:

- **CRITICAL 1 (no run row for built-ins):** `runBuiltinRoutine` now inserts a terminal `routine_runs` row per fire (inside the function, so manual + scheduled get parity). AC5's `runs[]` populates; AC1's "last-run reflects real execution" is now whole. See §3 + §3a.
- **CRITICAL 2 (AC4 unprovable on shipped path):** chose **option (a)**. The monthly gate is reachable through the BOOTED scheduler on a capped generic routine BEFORE any session is created (verified: `checkAndFireRoutine` L399-415 writes `monthly_budget_exhausted` and returns *before* `createRoutineSession` at L441). AC4 is proven on the booted path with no entry into the zombie session path. See §5 + §7 AC4.
- **WARNING 1 (double-fire race):** `nextRunAt` is now advanced **synchronously before** built-in dispatch, not in a fire-and-forget `.then()`. See §3.
- **WARNING 2 (reaper not optional):** the periodic reaper sweep is **non-optional** — an in-process adapter hang is neither a crash-complete nor a process death, so the boot one-shot alone misses it. See §4 + task list.
- **WARNING 3 (AC2 two-phase):** AC2 test is now an explicit two-phase flip: disable-after-register → assert NO fire; re-enable → assert fire. See §7 AC2.
- **WARNING 4 (daily-digest contradiction):** daily-digest is GENERIC (`taskId`), so the (iii)-scoped scheduler will NOT fire it. The §2 seed `active:true` flip is **removed**; daily-digest auto-fire is documented as **AF7-deferred**. The `canProvision` generic-skip guard is promoted to an explicit task. See §2 + §3 + task list.
- Framing correction: option (i) (wire dispatcher) is a one-line change already in scope at `server-factory.ts`; deferred as a *risk* decision (AF7 owns end-to-end dispatch), not because it's hard. See §5.

## 0. Problem decomposition (root causes, evidence)

| # | Symptom (Z-bug) | Root cause | Evidence |
|---|---|---|---|
| R1 | No cron routine ever fires (Z8-003/006/101/102) | `startRoutineScheduler` has no boot caller | `app.ts` 505–548, `bootstrap.ts` — never invoked |
| R2 | Even if booted, seeded routines skipped | Seeds set no `nextRunAt`; poll loop requires `nextRunAt <= now` | `seed-fixtures.ts` BUILTIN_ROUTINE_SEEDS; scheduler L531–536 |
| R3 | Daily digest never fires (Z8-101/102) | Seed row `active: false` + no `nextRunAt` | `seed.ts` ≈389 |
| R4 | Calendar builtins can't fire on generic path (Z8-029/032) | Builtins have no `taskId`; `checkAndFireRoutine` returns `{fired:false,"no taskId"}`; builtins must run via `runBuiltinRoutine` (no session) | `builtin-routines.ts` BUILTIN_SPECS (no taskId); scheduler L390; route fork L543 |
| R5 | Manual trigger can brick a routine (zombie) | `running` run + `active` session never finalized → `shouldCoalesce` true forever | `routines-routes.ts` 624–702; `shouldCoalesce` L347 |
| R6 | Budget overrun risk | Caps exist (AA3) but only enforced on paths that actually reach provisioning | `session-provisioning.ts` 599–602; scheduler 402–417 |

**Scope of change:** wire R1; fix R2/R3 at seed + self-heal; fork R4 in scheduler; reap R5; verify R6. No budget rebuild, no model swap.

## 1. Boot wiring (R1)

### Constraint: async scheduler vs sync `bootstrapFabric`
`strategyBootstrap` is typed `(ctx) => Array<() => void>` — **synchronous** (`app.ts` L77). But
`startRoutineScheduler` is `async` (returns `Promise<RoutineScheduler>` because `registerEventTriggers`
awaits a DB read). Two viable options:

**Option A — start scheduler inside `bootstrapFabric`, push a deferred disposer.** Call
`startRoutineScheduler(...)` without awaiting; store the promise; push a disposer that awaits then
stops. Keeps boot in one place. Cost: the disposer must handle "scheduler still starting" (await the
promise in `stop`). Coupling: low. ~15 LOC.

**Option B — widen `strategyBootstrap` to allow async / return a richer handle.** Change signature to
`=> Array<() => void> | Promise<Array<() => void>>`. Cost: touches `app.ts` `createApp` (must `await`
disposer assembly), every kernel-only test that passes `strategyBootstrap`, and `server-factory.ts`.
Migration surface: ~6 call sites. Coupling: medium. Higher blast radius for a one-handler need.

**Chosen: Option A.** Lowest blast radius; matches the existing fire-and-forget disposer pattern
already used in `app.ts` (e.g. observability dispose closure L539–547). The scheduler's own
`registerEventTriggers` await is internal — we wrap the whole start in a promise the disposer drains.

```ts
// bootstrap.ts — inside bootstrapFabric, after existing disposers
const POLL_INTERVAL_MS = ctx.routinePollIntervalMs ?? 30_000; // observable, configurable for tests
const schedulerPromise = startRoutineScheduler(db, eventBus, { pollIntervalMs: POLL_INTERVAL_MS });
schedulerPromise.catch((err) => fabricLog.error("routine scheduler failed to start", { err }));
disposers.push(() => { void schedulerPromise.then((s) => s.stop()).catch(() => {}); });
```

- `routinePollIntervalMs` is added as an **optional** field on the `bootstrapFabric` ctx (default 30s). Tests pass a small value; production uses default. Does not widen the `strategyBootstrap` type — `server-factory.ts` already constructs the ctx inline (L167–181), so it can pass the field there without changing `createApp`'s signature.
- **Observability (Hard rule 1):** scheduler logs `"routine scheduler started (pollIntervalMs=N)"` at start. Add a single log line in `startRoutineScheduler` before returning. Each fire already emits `routine_fired` + writes `routine_run`.
- **Kernel-only mode** (`strategyBootstrap: undefined`) → no scheduler, as today. Correct: kernel tests must not spin a background interval.

### Boot ordering
Scheduler starts after the other fabric handlers (esp. `registerBuiltinRoutineHandlers`, which owns the
`bet_state_changed`→post-bet-retro path) so event subscriptions exist before the first poll. The
`bootstrapFabric` disposer array already orders pushes; append the scheduler last.

## 2. Self-heal seeded routines (R2/R3)

Two layers, because production seed runs via CLI (`npm run setup`), not server boot — existing DBs
won't re-seed.

**(a) Fix the seed fixtures (fresh installs).**
- `seed-fixtures.ts` `BUILTIN_ROUTINE_SEEDS`: leave as-is for trigger config (builtins run via `runBuiltinRoutine`, see §3) but they still need a `nextRunAt` so the poll loop selects them for the builtin-dispatch fork. Compute `nextRunAt` from the cron at seed time.
- `seed.ts` "Daily digest" row: **do NOT flip `active:true` in AF6** (WARNING 4). Daily-digest is a **generic** routine (`taskId: seed-task-daily-digest`) → under scope (iii) the booted scheduler deliberately will NOT fire it (the `canProvision` generic-skip guard, §3, blocks it; without that guard it would fire into the zombie path). Enabling it here would either be a no-op or manufacture the exact zombie AC3 forbids. **Daily-digest auto-fire is AF7** (needs the dispatcher), regardless of the `active` flag. Leave the seed row as-is; documented in §7/R-B. Computing `nextRunAt` for it is harmless but unnecessary — skip it to avoid implying it's schedulable in AF6.

**(b) Scheduler boot backfill (existing DBs — the durable fix).** On scheduler start, before the first
poll, run one pass: for every routine where `active = true`, `triggerType IN ('calendar','heartbeat','continuous')`,
and `nextRunAt IS NULL`, compute and persist `nextRunAt` via `computeNextRunAt(routine, now)`. This is
idempotent and self-healing: a routine that lost its `nextRunAt` (or never had one) becomes eligible.

```ts
// routine-scheduler.ts — new exported helper, called once at start
export async function backfillMissingNextRunAt(db: HyperIdleDb): Promise<number>;
// SELECT active scheduled routines WHERE nextRunAt IS NULL; for each, UPDATE nextRunAt = computeNextRunAt(r, now)
```

- **Why backfill rather than fire-overdue-immediately:** computing the *next* match (not back-firing) avoids a thundering herd of catch-up runs after downtime. A routine that was due during downtime simply fires at its next scheduled slot. (Catch-up semantics are out of scope; note as a known limitation.)
- Does **not** flip `active` for daily-digest on existing DBs (that's an operator/migration concern, not auto-enable — auto-enabling a disabled routine would violate operator intent). Fresh installs get it right via (a); existing installs: documented as requiring a one-line PATCH or re-seed. Flagged in §7 risks.

## 3. Builtin dispatch fork in the poll loop (R4)

The poll loop currently calls `checkAndFireRoutine` for every due routine — which fails for builtins
(no `taskId`). Add a fork mirroring `routines-routes.ts` L543.

```ts
// routine-scheduler.ts — inside the poll loop, per due routine
if (isBuiltinRoutineId(routine.id)) {
  // builtins write review items / sweeps directly, no session.
  // post-bet-retro requires args (betId) → it is event-only; skip in the calendar poll.
  if (routine.id === "builtin:post-bet-retro") continue; // event-driven, not calendar

  // WARNING 1 fix — advance nextRunAt SYNCHRONOUSLY, BEFORE dispatch.
  // runBuiltinRoutine is async (decay sweep / portfolio JOINs); at the 50ms
  // test poll interval, a fire-and-forget `.then(advance)` lets the next tick
  // re-select this still-overdue routine and double-fire. Advancing first
  // makes the row no longer due before the next poll can observe it.
  const nextRunAt = computeNextRunAt(routine, new Date());
  await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
  void runBuiltinRoutine(db, eventBus, routine.id).catch(() => {}); // writes its own run row (§3a)
} else {
  // scope (iii): generic routines are NOT auto-fired in AF6 (no dispatcher in
  // production → zombie session). The canProvision guard (below) gates them off.
  if (!opts.canProvision) continue;
  void checkAndFireRoutine(db, eventBus, routine).catch(() => {});
}
```

- **Dependency direction:** `routine-scheduler.ts` and `builtin-routines.ts` are both in `packages/fabric`. `runBuiltinRoutine`/`isBuiltinRoutineId` are already exported from fabric's index. No layer violation. ⚠️ Avoid a circular *module* import: import from `./builtin-routines.js` directly (sibling), not from the package index.
- **`nextRunAt` advance for builtins — synchronous (WARNING 1):** `runBuiltinRoutine` sets `lastRunAt` on fire but does NOT compute `nextRunAt`. The scheduler advances `nextRunAt` **before** dispatch so the routine is no longer `nextRunAt <= now` when the next poll runs. This eliminates the double-fire race the route-trigger path never hits (manual = one-shot, scheduler = repeating). The advance is unconditional (even a no-op/`skipped` run reschedules). **Test:** at a fast poll interval, assert exactly one run row per due-window.
- **`canProvision` guard (WARNING 4 / scope iii) — explicit, load-bearing:** the scheduler accepts `canProvision: boolean` in its options (default `false` in production: dispatcher is not registered — verified R-A). When `false`, generic (`taskId`) routines are skipped entirely — they never enter `checkAndFireRoutine`, never call `createRoutineSession`, never create the zombie. Built-ins (no session) always fire. Production passes `canProvision: false`; AF7 flips it `true` once the dispatcher is wired. AC4's monthly-gate test (§7) passes `canProvision: true` to a dispatcher-less harness specifically to reach the pre-session gate — see §5.
- **post-bet-retro** stays event-only (handled by `registerBuiltinRoutineHandlers`), excluded from calendar dispatch — it has `triggerType: 'event'` so the poll loop already filters it (`if (r.triggerType === 'event') return false`, L533). The explicit guard above is belt-and-suspenders.

### 3a. Built-in fires must write a `routine_runs` row (CRITICAL 1)

Verified: `runBuiltinRoutine` (builtin-routines.ts L204-249) only sets `routines.lastRunAt`; it inserts **no** `routine_runs` row. The route-trigger builtin branch writes none either. `GET /api/routines/:id` builds `runs[]` from `routineRuns`. So as-planned, after a built-in auto-fire `lastRunAt` advances but `runs[]` stays empty → **AC5 fails, AC1 half-true.**

**Fix — insert a terminal run row INSIDE `runBuiltinRoutine`** (single source of truth: manual trigger and scheduled fire both benefit; the §3 scheduler fork only advances `nextRunAt`, it writes no row):

```ts
// builtin-routines.ts — inside runBuiltinRoutine, replacing the lastRunAt-only update
const startedAt = new Date();
// ... run the routine, producing `result` ...
const endedAt = new Date();
await db.insert(routineRuns).values({
  id: crypto.randomUUID(),
  routineId,
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  outcome: result.fired ? "success" : "skipped",
  costMinor: 0,            // built-ins do bounded DB work, no harness cost (no session)
});
if (result.fired) {
  await db.update(routines).set({ lastRunAt: endedAt.toISOString() }).where(eq(routines.id, routineId));
}
```

- **Row fields:** `outcome = result.fired ? "success" : "skipped"` (both in the closed `RoutineRunOutcome` set — no type change); `startedAt`/`endedAt` bracket the synchronous run; `costMinor: 0` (built-ins carry no session and accrue no harness cost — distinct from AA3/AF10 cost, which only flows through provisioned sessions). The row is terminal on insert (no `running` intermediate) since built-in execution is synchronous and cannot leave a zombie.
- **Disabled short-circuit:** when `routine.active=false`, `runBuiltinRoutine` returns early (`{fired:false, reason:"disabled"}`) **before** any run row — correct: a disabled routine produces no run record, preserving AC2's negative assertion (disabled → no fire, no row).
- **Why insert even on `skipped`:** observability (Hard rule 1) — a no-op fire is still a fire the founder may want to see. Keeps `runs[]` honest about scheduler activity.
- **Observability note (SUGGESTION):** built-ins emit **no** `routine_fired` event (only `checkAndFireRoutine` does). Built-in observability rests on this `routine_runs` row + `lastRunAt`, not the event stream. A future event consumer must not assume `routine_fired` covers built-ins. Acceptable — stated so it does not surprise.

## 4. Zombie-session-proof Trigger path (R5)

The brick: a `running` routine_run + `active` session that never reaches `endSession`/`crashSession`
(process restart mid-run, adapter hang). `shouldCoalesce` then blocks all future runs.

**Reaper — two triggers, one function:**

```ts
// new: packages/server/src/services/routine-session-reaper.ts  (server layer — needs session-lifecycle)
export async function reapStaleRoutineSessions(
  db: HyperIdleDb, eventBus: EventBus, opts: { staleAfterMs: number; now?: number },
): Promise<number>;
```

Logic: find sessions where `state = 'active'` AND `routineId IS NOT NULL` AND
`startedAt < now - staleAfterMs`. For each, mark the session `crashed` (`endedAt = now`) and finalize
its `routine_run` (the `running` row for that routine) to outcome `timeout` with an error message. This
**self-heals coalescing** — the next fire sees no active session.

- **Why server layer:** the reaper finalizes via the same `routine_runs` semantics as `session-lifecycle.ts` (`updateRoutineRunOnSessionEnd` matches `routineId + outcome='running'`). It lives next to that code. `crashSession` may be reused if the in-memory `SessionContext` is reconstructable; if not (post-restart there is none), the reaper does a direct DB finalize (set session `crashed`, set routine_run `timeout`). Direct DB write is acceptable here because there is no live workspace/harness to tear down — the process that owned it is gone.
- **Boot trigger:** run once at `createApp` boot (or in `server-factory`) with `staleAfterMs` = a generous bound (e.g. 2× max session timeout, or 1h default). This clears zombies left by the previous process. Register as a disposer-less one-shot before the scheduler starts.
- **Periodic trigger — NON-OPTIONAL (WARNING 2):** the boot one-shot only clears zombies left by a *previous* process. A session that hangs *during* the current long-lived process (in-process adapter hang, no restart) is neither a crash-complete (route try/catch handles those) nor a process death (boot one-shot handles those) — it would never be reaped until the next boot, and AC3-under-hang would fail. So the periodic sweep is **required, not optional**. Implementation: call the reaper from within the poll loop guarded by a "last reaped" timestamp to keep it ~5-min cadence (cheaper than a second `setInterval`; the poll already wakes every 30s). One indexed query (`sessions_state_idx` + `routineId NOT NULL` + age filter). **Test:** insert an `active` routine session older than `staleAfterMs` with no process restart, advance the clock past the cadence, assert the periodic sweep reaps it (session→`crashed`, run→`timeout`).
- **`timeout` outcome** already exists in the closed `RoutineRunOutcome` set (`packages/shared/src/routine.ts`). No schema/type change.
- **Trigger route hardening (defensive):** the existing `POST /:id/trigger` provision path (`routines-routes.ts` 641–677) already wraps `provisionSession` in try/catch and writes `error` on throw. That handles crash-completes. The *unhandled* case is process death mid-run — covered by the boot reaper. No route change strictly required for AC3, but add the reaper so AC3 holds under restart.

## 5. Budget enforcement verification (R6) — wire-and-prove, no rebuild

Already implemented (AA3); AF6 confirms the booted scheduler path reaches the gates:
- **Monthly cap:** `checkAndFireRoutine` (scheduler path) checks `getRoutineMonthlySpend` and writes `monthly_budget_exhausted` before firing (L402–417). Reachable from the booted poll loop for generic routines. ✔
- **Per-run cap:** enforced inside `provisionSession` (`session-provisioning.ts` 599–602 → `budget_exhausted` via `endSession`). The scheduler's generic fire creates a *lightweight* session (`createRoutineSession`, L241) that does NOT run the provisioning cost loop — **this is the gap.** The scheduler-created session has no harness draining cost, so per-run cap is never evaluated for *scheduler-originated* generic routines.

**CRITICAL FINDING (verified):** `bootstrapFabric` in production (`server-factory.ts` L167–181) is
called WITHOUT `dispatcherDeps`, so `registerTaskDispatcher` (AD2) is **NOT registered in production**.
The scheduler's `createRoutineSession` (L241) is a stub insert that emits `session_started` and then
relies on the dispatcher to provision the real harness session. With no dispatcher registered, that
`session_started` is consumed by nobody → **the stub session never gets a harness, never accrues cost,
never calls `endSession`/`crashSession`, and stays `active` forever.** Consequences:
- A scheduler-fired generic routine creates a **zombie session by construction** (not just on restart). After one auto-fire, `shouldCoalesce` is permanently true → the routine bricks itself. This makes R5 the *default* outcome of AC1 for generic routines, not an edge case.
- Per-run cap (enforced inside `provisionSession`) is **never reached** on scheduler fires, because provisioning never runs.

**AF6 decision:** AF6 must not ship "auto-fire" that immediately bricks every generic routine. Options:
- **(i) Wire the dispatcher in production** — pass `dispatcherDeps` (adapterPool/workspaceAdapter/workspaceBasePath, already in scope in `server-factory`) into `bootstrapFabric`. Then stub sessions get provisioned, complete via `endSession`, finalize their `routine_run`, and per-run cap is enforced. This is the *correct* end-to-end fix but pulls AD2 provisioning into AF6's blast radius and may overlap AF7 (task auto-dispatch, explicitly out of scope).
- **(ii) Keep scheduler fires lightweight + rely on the reaper** — accept that scheduler-created stub sessions are short-lived placeholders; the reaper (§4) finalizes them to `timeout` after `staleAfterMs`, self-healing coalescing. AC1 (run recorded, nextRunAt advances) still holds because `checkAndFireRoutine` writes `lastRunAt`/`nextRunAt` and the `routine_fired` event fires. But every generic auto-run records as a session that times out — semantically wrong.
- **(iii) Built-ins only for v1 of auto-fire** — the five built-in routines (the actual Z-bugs: digest, decay, retros, practice) run via `runBuiltinRoutine` with **no session at all** (§3), so they have zero zombie risk and need no dispatcher. Generic operator-authored calendar routines remain manual-trigger-only until AF7 wires dispatch. This scopes AF6 to exactly the closed bugs without dragging in AD2/AF7.

**Shipping scope: (iii) — RATIFIED by critique.** The closed bugs (Z8-003/006/029/032/101/102) are all
about **built-in** routines firing on schedule — none require the generic session path. Built-ins fire
via `runBuiltinRoutine` (no session, no dispatcher, no zombie). Generic operator routines firing
autonomously is AF7 territory (task auto-dispatch).

**Framing correction (per critique):** option (i) — wiring the dispatcher in production — is a
**one-line change already fully in scope** at `server-factory.ts` L182-184 (`adapterPool`,
`workspaceAdapter`, `workspaceBasePath` are already constructed and in scope; pass them as
`dispatcherDeps` into `bootstrapFabric`). AF6 **does not** wire it. The deferral is a *risk* decision —
AF7 owns end-to-end task dispatch + provisioning correctness — **not** a "we can't reach it" decision.
Stated honestly so a future reader does not assume the wiring is hard.

### AC4 — proven on the BOOTED path via the pre-session monthly gate (CRITICAL 2, option (a))

The tension: under (iii) the only auto-fire targets are built-ins, which carry NO cost caps and run no
session — so there is nothing for AC4 to gate on any routine AF6 *auto-fires*. Routing AC4 to AA3
`provisionSession` boundary tests (per-run) and *manual* generic triggers (monthly) proves the old
boundary, not AF6's boot. **Resolved via option (a): prove the monthly gate through the BOOTED scheduler
on a capped generic routine.**

**Why this is reachable WITHOUT the zombie path (verified):** in `checkAndFireRoutine` the monthly-cap
check runs at L399-415 and, on exceed, inserts a `monthly_budget_exhausted` `routine_runs` row, advances
`nextRunAt`, and **returns** — all *before* `createRoutineSession` at L441. So a capped generic routine
whose month-to-date spend ≥ `costCapMonthlyMinor` hits the gate and writes the budget outcome **without
ever creating a session.** No stub session, no dispatcher needed, no zombie.

**AC4 test (booted path):** boot the scheduler with `canProvision: true` against a dispatcher-less
harness; seed a generic routine with `costCapMonthlyMinor = C` and prior `routineRuns` summing ≥ C;
seed `nextRunAt <= now`; wait one poll. Assert: a new `monthly_budget_exhausted` run row is written AND
**no** `sessions` row was created for that routine. This exercises the *shipped boot* (the scheduler
started by `bootstrapFabric`, not a direct `startRoutineScheduler` call) reaching the budget gate — the
AC's actual intent ("execution is bounded by budget"), proven before the session boundary. `canProvision:
true` here is test-only to reach the generic branch; production keeps `false` (scope iii).

**Per-run cap:** built-ins have no per-run session cost (bounded DB work, `costMinor:0`), so per-run cap
is a no-op for them by design. Per-run enforcement remains proven at the `provisionSession` boundary
(AA3 tests, intact) and becomes *live for auto-fire* only when AF7/AD2 wires dispatch — recorded as a
**DEFERRED-AC fragment** (per-run-cap-on-auto-fire → AF7). The *monthly* half of AC4 is proven on AF6's
booted path as above; that is the half AF6's boot newly enables. **No hardcoded cost numbers** — cost
flows from harness `cost_update` deltas; the AF10 interface is the existing `routineRuns.costMinor`
column and `recordCostAndCheck`. AF6 changes neither; AC4 compares `sum(costMinor) >= cap` only.

> AF10 coordination: AF6 reads `routine.costCapMonthlyMinor` / `costCapPerRunMinor` and sums
> `routineRuns.costMinor`. AF10 owns whether `costMinor` values are *correct*. AF6's contract: never
> assume a cost magnitude — only compare `sum(costMinor) >= cap`. If AF10 lands later, AF6 numbers
> auto-correct. No constant duplicated across the two.

## 6. Types / schema / files

**No schema migration.** All columns exist (`routines.nextRunAt`, `routineRuns.outcome`,
`sessions.routineId`/`state`). All outcomes (`timeout`, `budget_exhausted`, `monthly_budget_exhausted`)
exist in the closed set.

**Type additions (minimal):**
- `bootstrapFabric` ctx: `readonly routinePollIntervalMs?: number;` (optional, default 30_000).
- New exports from `@hyperidle/fabric`: `backfillMissingNextRunAt(db): Promise<number>`.
- New server service export: `reapStaleRoutineSessions(db, eventBus, opts): Promise<number>`.

**Files touched:**
| File | Change |
|---|---|
| `packages/fabric/src/services/routine-scheduler.ts` | builtin dispatch fork; **synchronous** `nextRunAt` advance before built-in dispatch (WARNING 1); `canProvision` option + generic-skip guard (WARNING 4); `backfillMissingNextRunAt`; start log line; **non-optional** periodic reaper cadence hook (WARNING 2) |
| `packages/fabric/src/services/builtin-routines.ts` | **insert terminal `routine_runs` row inside `runBuiltinRoutine`** (CRITICAL 1) — `outcome success/skipped`, `costMinor:0`, `startedAt`/`endedAt` |
| `packages/fabric/src/bootstrap.ts` | start scheduler (Option A), push deferred disposer; accept `routinePollIntervalMs` |
| `packages/fabric/src/index.ts` | export `backfillMissingNextRunAt` |
| `packages/server/src/server-factory.ts` | pass `routinePollIntervalMs` into bootstrap ctx (default); run boot reaper once |
| `packages/server/src/services/routine-session-reaper.ts` | **new** — `reapStaleRoutineSessions` |
| `packages/server/src/app.ts` | (only if reaper periodic sweep wired here) register reaper one-shot at boot |
| `packages/db/src/seed.ts` | **(no daily-digest change — WARNING 4)** daily-digest stays generic + AF7-deferred; do NOT flip `active:true` |
| `packages/db/src/seed-fixtures.ts` | builtins: compute/seed `nextRunAt` (or rely on backfill — see note) |

> Note: if seeding `nextRunAt` in fixtures is awkward (fixtures are static data, cron compute needs
> runtime), prefer **seed-time compute in `seed.ts`** (call `nextCronMatch(parseCron(cfg.cron), now)`
> when inserting each builtin) and keep `seed-fixtures.ts` declarative. Backfill (§2b) covers any gap.

## 7. AC → verification map

| AC | Method | Test |
|---|---|---|
| AC1 cron fires automatically; next/last reflect real execution | **Integration** (server): boot scheduler with small poll interval against a seeded **built-in** calendar routine (e.g. knowledge-decay/practice-meeting); assert the builtin's effect (review item / sweep) + a terminal `routine_runs` row written (§3a) + `lastRunAt` set + `nextRunAt` advances, with NO manual trigger. **Plus double-fire guard (WARNING 1):** at a fast poll interval, assert **exactly one** run row per due-window (synchronous `nextRunAt` advance prevents the second tick re-firing). Extends `AD5-routine-scheduler-boot.integration.test.ts` — do not duplicate its 4 cases; add builtin-fire + nextRunAt-advance + single-fire cases. | new cases in `AD5-routine-scheduler-boot.integration.test.ts` |
| AC2 event routines react to CURRENT state | **Integration — TWO-PHASE FLIP (WARNING 3):** register event triggers; (phase 1) flip routine `active:false` after registration, emit event, assert **NO fire and no run row** (kills a snapshot-at-registration impl); (phase 2) flip `active:true`, emit event, assert it **fires**. The negative assertion is what discriminates fresh-read from snapshot — a one-shot "emit, assert fire" does not. (Probe P2: code already re-reads at L497-501; test must still fail against a hypothetical snapshot impl.) | `routine-scheduler.integration.test.ts` (new case) |
| AC3 manual trigger never bricks | **Integration**: (a) insert a routine with a stale `active` routine session + `running` run; call `reapStaleRoutineSessions`; assert session→`crashed`, run→`timeout`, then `shouldCoalesce` returns false and a fresh trigger fires. (b) **periodic-sweep case (WARNING 2):** with the scheduler booted (no restart), insert an `active` session older than `staleAfterMs`, advance past the reaper cadence, assert the in-process periodic sweep reaps it. | new `routine-session-reaper.integration.test.ts` |
| AC4 monthly budget gate on the BOOTED path; recorded as budget outcome | **Integration (option a — booted path):** boot the scheduler via `bootstrapFabric` with `canProvision:true` + dispatcher-less harness; seed a **generic** routine with `costCapMonthlyMinor=C` + prior `routineRuns` summing ≥ C + `nextRunAt<=now`; wait one poll; assert a `monthly_budget_exhausted` run row is written AND **no `sessions` row** created (gate fires before `createRoutineSession`, L399-415 < L441). **Per-run-cap-on-auto-fire is DEFERRED→AF7** (no budgeted auto-fire execution exists under scope iii); per-run boundary stays proven by AA3 `provisionSession` tests. | new case in `AD5-routine-scheduler-boot.integration.test.ts`; AA3 path intact |
| AC5 founder observes auto-run from existing surfaces | **Integration**: after a built-in auto-fire (AC1), `GET /api/routines/:id` returns `runs[]` with `length >= 1` and a terminal outcome (`success`/`skipped`) + `lastRunAt` set, no manual trigger. **Depends on CRITICAL 1 fix** (run row written inside `runBuiltinRoutine`) — without it `runs[]` is empty and this fails. | `routines.routes.integration.test.ts` (new case) |
| Boot wiring is real (scheduler starts at boot) | **Integration** asserting *behavior*, not file contents: build app via fixture with `strategyBootstrap = bootstrapFabric`, seed a due routine, wait one poll, assert it fired. (Per testing rules: no `readFileSync` scans.) | `AD5-routine-scheduler-boot.integration.test.ts` |
| Observability (started + each fire visible) | Covered behaviorally by AC1/AC5 (run rows + `routine_fired` event). Log line is a side effect, not separately tested. | — |

## 8. Ordered tasks (TDD)

1. **Red:** write failing integration tests for AC1(builtin-fire + `routine_runs` row + nextRunAt-advance + **single-fire at fast poll**), AC2(**two-phase flip**: disable→no-fire, enable→fire), AC3(reaper boot-one-shot **+ in-process periodic sweep**), AC4(**monthly via booted scheduler, no session created**), AC5(GET `runs[].length>=1` from auto-run), and the boot-wiring behavior test + Option-A disposer-race test.
2. **CRITICAL 1:** insert terminal `routine_runs` row inside `runBuiltinRoutine` (success/skipped, costMinor:0, startedAt/endedAt). Single source of truth for manual + scheduled built-in fires.
3. `backfillMissingNextRunAt` in `routine-scheduler.ts` + export.
4. Builtin dispatch fork with **synchronous `nextRunAt` advance before dispatch** (WARNING 1) + `canProvision` option + generic-skip guard (WARNING 4); start log line.
5. `reapStaleRoutineSessions` service (server) + boot one-shot in `server-factory`/`app`.
6. **Periodic reaper cadence — NON-OPTIONAL (WARNING 2):** poll-loop sweep guarded by last-reaped timestamp (~5-min cadence). Required for AC3-under-in-process-hang.
7. Boot wiring in `bootstrapFabric` (Option A) + `routinePollIntervalMs` ctx field; pass from `server-factory` (incl. `canProvision:false` in production).
8. Seed fixes: builtins `nextRunAt` at seed time. **No daily-digest `active` flip** (WARNING 4) — daily-digest auto-fire is AF7-deferred.
9. **Green** all; `npm run check && npm run lint && npm run test:integration`.
10. Full `npm run verify`.

## 9. Risks / open questions for critique

- **R-A (RATIFIED — scope iii):** `bootstrapFabric` is called without `dispatcherDeps` (verified at `server-factory.ts` L167-181), so generic scheduler fires would create zombie stub sessions and per-run cap never runs. Critique **ratified** scope (iii): AF6 ships **built-in auto-fire only**; the `canProvision:false` guard (§3) keeps generic routines off the auto-fire path entirely. Generic auto-fire + dispatcher wiring (option i — a one-line change, see §5) is **AF7**. Resolved.
- **R-B (daily-digest — RESOLVED as AF7-deferred):** daily-digest is a **generic** routine (`taskId: seed-task-daily-digest`), so under scope (iii) the booted scheduler will NOT fire it regardless of the `active` flag — it needs the dispatcher (AF7). AF6 therefore does **not** flip it `active:true` (WARNING 4) and does not ship a migration to enable it; doing so would either no-op or fire into the zombie path. Daily-digest auto-fire is explicitly **AF7**. The founder-facing "built-in cron routines fire automatically" promise is satisfied by the 4 true built-ins (digest-routine excluded, as it is generic). Recorded as a **DEFERRED-AC fragment** for the workpackage register, not a silently-passed AC.
- **R-C (catch-up semantics):** routines due during downtime fire at next slot, not immediately (no thundering herd). Confirm this matches founder intent for, e.g., daily digest after an overnight outage.
- **R-D (reaper staleAfterMs):** choosing the bound. Too low → kills legitimately long sessions; too high → zombies linger. Propose 2× the configured max session timeout, default 1h. **Confirm source of truth for max session timeout.**
- **R-E (Option A disposer race — test NON-OPTIONAL):** if `dispose()` runs before `startRoutineScheduler` resolves, the deferred disposer awaits the promise then stops. Promoted to the red set (task 1): build app, dispose immediately, assert no leaked interval. Not "cheap to add later" — it ships in the test suite.
- **Note (test-file labeling):** `AD5-routine-scheduler-boot.integration.test.ts` calls `startRoutineScheduler` directly — it does NOT exercise boot via `bootstrapFabric` despite its name. The separate boot-wiring behavior test (§7) is the true boot coverage; do not assume the existing file already covers boot.

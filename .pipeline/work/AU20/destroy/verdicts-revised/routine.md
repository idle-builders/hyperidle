# routine — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

| Row | Old verdict | New verdict | Ruling | Why it moved |
|---|---|---|---|---|
| 3 `provisionTeamRoutines` | DELETE | **PLUGIN** | Ruling 3 | Seeding a team with ritual routines (retros, knowledge sweeps) is exactly what a plugin's install step does. The capability moves to the plugin; this function and its `builtin:kind:teamId` id scheme still leave core. The structural bug stands: it seeds a **global** sweep once per team (Ruling 1 — that duplication is still a bug even on a shared backend). |
| 4 `fireBuiltinRoutine` | DELETE | **PLUGIN** | Ruling 3 | The four rituals it dispatches (post-bet retro, portfolio retro, knowledge decay, knowledge promotion) are legitimate knowledge-management ceremony — re-provided by a plugin as generic routines. The structural conviction stands unchanged: this function is a second execution path that bypasses the agent-run architecture (no session, no intent queue, never runs the `skillId` its own specs declare). The plugin re-provision uses the generic path, **not** this function. |
| 5 `registerBuiltinRoutineHandlers` | DELETE | **PLUGIN** | Ruling 3 | The post-bet retro ritual (bet completes → retro happens) is a plugin-provided event trigger on `bet_state_changed`. The form-letter implementation (`Hypothesis: X / Reality: <date>`, no agent) is not re-provided. Ruling 2 confirms the trigger shape is right: `bet_state_changed` is an extension-surface event a plugin hangs off. |
| Feature: portfolio retro | DELETE ("dead forever, no replacement") | **PLUGIN** | Ruling 3 | A monthly portfolio retro is a ritual of the retro/practice-meeting kind — plugin territory. What is *not* re-provided: the current title-dump implementation and the per-team firing of a global read (Ruling 1). |
| Feature: knowledge decay/promotion sweeps | DELETE + re-wire as core `setInterval`s (Hole 2) | **PLUGIN** | Ruling 3 | First wave routed the sweeps to the composition root as core clocks. Wrong destination — the founder named "builtin knowledge sweeps" as knowledge-management ritual. They leave core entirely and come back as plugin-provided scheduled routines, fired **once globally**, not once per team (Ruling 1). |

**Ruling 2 re-examination — no rows flip.** Every DELETE in the first wave was re-checked against "did this rest on subscriber count?": none did. `registerBuiltinRoutineHandlers` was convicted for being a form letter bypassing the agent path, not for lacking listeners. `FireResult.sessionId/emitted/extra` die as payload fields nothing ever sets — the case Ruling 2 explicitly does not protect. The reaper kill is a config branch no production caller wires (re-confirmed: `service-bootstrap.ts:589` threads `reaperCadenceMs` but nothing passes `reap:`), not an event argument. And the standing blind spot is now doctrine, not a caveat: `registerEventTriggers` (`routine-scheduler.ts:702`) subscribes to whatever `eventType` stored routine rows name — **runtime data**. No event type reachable through routine triggers may ever be judged dead from this repository; plugins and users attach triggers to any event the product emits.

**Ruling 1 re-examination — no rows flip, one hole reworded.** No routine verdict rested on a single-user premise. Per-team routine rows are legitimate on a shared backend (a team's own retro cadence is per-team by nature); what remains convicted is seeding a **teamId-ignoring global sweep** once per team — re-confirmed in code: `runKnowledgeDecay` calls `ports.knowledge.runStaleSweep(db, eventBus, nowMs, undefined, …)` and `runPortfolioRetro` reads global `listRecentByLayers`, both discarding the seeded routine's team. Hole 4 ("empty routine list is the correct default") is restated for a shared backend: teams start with what their installed plugins provision — core still pre-installs nothing.

### What leaves core and becomes a plugin

**A knowledge-ritual plugin** (no work package exists yet — FOUNDER-RULINGS says one needs writing) re-provides, via the **generic** routine machinery this package keeps:

1. **Post-bet retro** — an event routine (`triggerType:"event"`, `eventType:"bet_state_changed"`, skill `bet_retro`) firing a real agent run that analyzes hypothesis vs reality, replacing the form letter. Two generic-path capability gaps block it today and become plugin-enabling core work: `registerEventTriggers` drops the event payload (the agent would not know which bet), and there is no payload filter (it would fire on every state change, not just `toState:"completed"`).
2. **Portfolio retro** — a monthly scheduled routine + `portfolio_retro` skill, agent-run, provisioned once (org-scoped), not per team.
3. **Knowledge decay sweep** and **knowledge promotion sweep** — scheduled routines invoking the knowledge service's sweeps, provisioned once globally.
4. **Per-team ritual provisioning** — the plugin's install/team-join step creates its routine rows through plain `insertRoutine`, replacing `provisionTeamRoutines`.

**What is deleted plain and never re-provided:** the `builtin:*` id scheme (`isBuiltinRoutineId`, `extractBuiltinKind`, `BuiltinRoutineId`), the bypass execution path (`fireBuiltinRoutine`'s switch, `RunBuiltinResult`, `PostBetRetroArgs`, the builtin branches in the tick / trigger route / bindings), the hardcoded TypeScript ritual bodies, the form-letter retro text, and per-team firing of global sweeps. Nobody would want these in any form; the plugin uses the generic path.

---

## Should this service exist?

**KEEP AS: routine definition store + the generic scheduler — unchanged, and strengthened by Ruling 2.** Routines are one of the five process primitives, with real doors on all three fronts: UI (`/api/routines/*` CRUD + trigger, WorkRoutine page, RoutineDetailPane, team routine cards), agent tools (`create_routine`, `update_routine`), and the scheduler timer (TICK every `config.pollIntervalMs`, wired at `layers/core-api/src/service-bootstrap.ts`). Under Ruling 2 this package is not just a feature — it is **the attachment mechanism** for the event extension surface: "plugins or users attach triggers and actions to events" is implemented here (`registerEventTriggers` + event-trigger routine rows). That raises the generic path's status and deepens the conviction of the builtin path, which sidesteps the product's own extension mechanism from inside core.

The builtin-routine subsystem still leaves core in its entirety. What changes is the destination: the rituals it carries are re-provided as a plugin (Ruling 3); the mechanism dies plain. The three structural findings stand:

1. **Per-team seeding of global sweeps is broken by construction** — N teams fire the same teamId-ignoring sweep N times daily (re-confirmed in `runKnowledgeDecay`/`runPortfolioRetro` signatures). Ruling 1 does not soften this: per-team *rituals* are fine, per-team *global sweeps* are duplication.
2. **The "retros" are form letters** — field interpolation, no agent, and each builtin spec declares a `skillId` nothing ever executes. The generic path is the first way to do exactly this.
3. **A second execution path bypassing the agent-run architecture is wrong** regardless of what it runs — no session, no intent queue, invisible to the extension surface.

## If written today, from scratch

Against the corrected premise — a shared backend serving several teams, OIDC identity, an event stream that plugins hang off:

- `insertRoutine`, `updateRoutine`, `getRoutine`, `listRoutines` — definition CRUD (UI + agent tools + **plugin provisioning**)
- `insertRoutineRun`, `updateRoutineRun`, `getRoutineRun`, `listRoutineRuns` — run records (coalescing guard, session-end closure, run history)
- `fireGenericRoutine` — the one firing path: resolve + bake + enqueue intent (resolver folded in), **carrying the triggering event's payload through to the run**
- `startRoutineScheduler` — the tick loop + event-trigger registration; this *is* the "attach a trigger to any event" extension surface
- `humanizeSchedule` — presentation sugar with a real UI door

Nothing named `builtin:*` exists. Rituals arrive as plugin-provisioned rows through the same CRUD everyone else uses. The one genuinely missing piece of the from-scratch shape is event-payload delivery to the fired run — today's `registerEventTriggers` discards it, which is what forced the builtin bypass into existence in the first place.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| PLUGIN | 3 |
| MERGE | 1 |
| SIMPLIFY | 5 |
| KEEP | 6 |

Surface: 17 methods → 11 exported methods in core (2 deleted plain, 3 leave core for the plugin, 1 merged in). Of ~860 lines in `routine-scheduler.ts`, roughly 470 (the builtin subsystem) leave core; only the ritual *intent* — four routines and two skills — is re-provided in the plugin, through the generic path.

## Feature-level kills

1. **Builtin-routine mechanism — DELETE, whole subsystem, nothing re-provided.** Dies plain: `BUILTIN_ROUTINE_IDS`, `BUILTIN_SPECS`, `isBuiltinRoutineId`, `extractBuiltinKind`, the `fireBuiltinRoutine` switch and ritual bodies (`runPostBetRetro`/`runPortfolioRetro`/`runKnowledgeDecay`/`runKnowledgePromotion`), the builtin branch of the scheduler tick, the ports blocks that exist only for them (`work`, `conversation`, `knowledge`), the builtin branch of `POST /api/routines/:id/trigger`, `POST /api/org/team-routines`, the seeding call in `POST /api/teams` and the `create_team` tool, `registerBuiltinRoutineReactions` + the builtin dispatch in `fireRoutine` (bindings), and `tools/eval/src/scenarios/builtin-routines.ts`.
2. **Knowledge rituals — PLUGIN (Ruling 3).** Post-bet retro, portfolio retro, knowledge decay, knowledge promotion: removed from core, re-provided by a knowledge-ritual plugin as generic routines + skills (see "What leaves core"). Requires the event-payload gap in `registerEventTriggers` closed as core work.
3. **The reaper piggyback — DELETE, unchanged.** `config.reap`/`reaperCadenceMs`/`ROUTINE_REAPER_CADENCE_MS`: never production-wired (re-confirmed — bootstrap threads `reaperCadenceMs`, nothing passes `reap:`). Dead branch shipped as config surface.
4. **Routine soft-delete — DELETE, unchanged.** `deletedAt` + `includeDeleted` + `DELETE /api/routines/:id` is a second off-switch next to retire (`active:false`). Not voided by any ruling — it is an enterprise reflex, not a single-user argument.
5. **Skipped-run audit rows on manual trigger — DELETE, unchanged.** `recordSkippedRun` duplicates the HTTP response into a run row. Audit trail nobody reads; no ruling touches it.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `isBuiltinRoutineId` | UI:POST /api/routines/:id/trigger, SCHED:TICK pollIntervalMs | DELETE | Recognizes `builtin:*` id strings — pure mechanism of the bypass path; the plugin uses ordinary routine ids. Kill both callers' builtin branches. |
| 2 | `extractBuiltinKind` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | DELETE | Id-string parsing (`builtin:kind:teamId`) for a scheme nobody re-provides. |
| 3 | `provisionTeamRoutines` | UI:POST /api/teams/, UI:POST /api/org/team-routines, AGENT:create_team | PLUGIN | Ruling 3: seeding ritual routines is the plugin's install step, done via `insertRoutine` with generic rows. This function leaves core; its bug (seeds a teamId-ignoring global sweep once per team) is not carried over — plugin provisions global sweeps once (Ruling 1). |
| 4 | `fireBuiltinRoutine` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | PLUGIN | Ruling 3: the four rituals it dispatches are re-provided by the plugin — through the generic path. The function itself is the second execution path bypassing the agent-run architecture (never runs its specs' own `skillId`) and is not re-provided. |
| 5 | `registerBuiltinRoutineHandlers` | BOOTSTRAP (bindings → `service-bootstrap.ts`) | PLUGIN | Ruling 3: bet-completes→retro is a plugin event trigger on `bet_state_changed` firing a real agent run. The form-letter body (`Hypothesis: X / Reality: <date>`) is not re-provided. Ruling 2: the event is the right attachment point. |
| 6 | `fireGenericRoutine` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:<db-configured eventType> via registerEventTriggers | SIMPLIFY | The core firing path — and post-rulings the plugin's execution vehicle. Drop `recordSkippedRun`, absorb the resolver (row 16), shrink return to `{fired, reason?, runId?}`. New core work it must gain for the plugin: carry the triggering event payload. |
| 7 | `startRoutineScheduler` | BOOTSTRAP (`service-bootstrap.ts`) — IS the SCHED:TICK door | SIMPLIFY | The timer door plus the event-trigger extension surface (Ruling 2 elevates it). Delete the builtin tick branch and the never-wired `reap`/`reaperCadenceMs` machinery. |
| 8 | `insertRoutine` | UI:POST /api/routines/, AGENT:create_routine, UI:POST /api/teams/ | SIMPLIFY | Keep the write — it becomes the plugin's provisioning door too. Drop `opts.onConflictDoNothing`… unless the plugin install step proves idempotent-seed need; today its only caller is row 3, which leaves core, so it goes. |
| 9 | `updateRoutine` | UI:PATCH /api/routines/:id, UI:POST /api/routines/:id/retire, AGENT:update_routine, SCHED:TICK, EVENT:session_ended | KEEP | Core value: retire toggle + the scheduler's `nextRunAt`/`lastRunAt` advance. Doors: PATCH route, update_routine tool, tick. |
| 10 | `getRoutine` | UI:GET /api/routines/:id (+5 more routes), AGENT:update_routine, SCHED:TICK | KEEP | Every route and the scheduler load the definition through it. Door: GET /api/routines/:id. |
| 11 | `listRoutines` | UI:GET /api/routines/, UI:GET /api/teams/:teamId, SCHED:TICK, BOOTSTRAP (settings backfill) | SIMPLIFY | Keep the list. Drop `includeDeleted` with the soft-delete kill; other filters live. |
| 12 | `insertRoutineRun` | UI:POST /api/routines/:id/trigger, SCHED:TICK | KEEP | Run row is load-bearing — coalescing guard and resolver validate against it. Door: SCHED:TICK. |
| 13 | `updateRoutineRun` | SCHED:TICK, EVENT:session_ended, EVENT:agent_run_lifecycle_changed, EVENT:agent_run_admission_failed | KEEP | Closes runs on session end / admission failure; `onlyIfRunning` race guard has three live production callers. |
| 14 | `getRoutineRun` | SCHED:TICK (via resolver), EVENT:session_ended | KEEP | Resolver validation + session-end closure both read the run row. |
| 15 | `listRoutineRuns` | UI:GET /api/routines/:id, UI:GET /api/teams/:teamId, SCHED:TICK | SIMPLIFY | Keep — run history + coalescing guard. Drop `order`: no production caller passes `"asc"`; hardcode desc. |
| 16 | `resolveRoutineRunRequest` | INTERNAL (sole caller: `fireGenericRoutine`) | MERGE | One caller, one transaction, plus a deps interface mirroring `RoutineSchedulerPorts`. Fold into `fireGenericRoutine`, unexport. |
| 17 | `humanizeSchedule` | UI:GET /api/routines/:id, UI:GET /api/teams/:teamId | KEEP | Readable schedules on the routine cards and detail pane — the primitive's main surface. Pure, zero deps. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `RoutineRunSourceUnavailableError` (class) | SIMPLIFY | Unexport. After row 16's merge its only job lives inside one file. |
| `RoutineSchedulerPorts` | SIMPLIFY | Drop `work`/`conversation`/`knowledge` blocks — every member serves only the ritual bodies leaving core; the plugin brings its own access, core ports do not serve it. Survives as `{settings, workIntents, requireRunnableAgent, getTeamById, assembleSessionKnowledge}`, absorbing `RoutineRunResolverDeps`. |
| `BuiltinRoutineId` | DELETE | Id scheme of the bypass mechanism — not re-provided. |
| `RunBuiltinResult` | DELETE | Return type of the bypass dispatcher — not re-provided. |
| `PostBetRetroArgs` | DELETE | One-field args type of a ritual body; the plugin's retro is a generic event routine, not this signature. |
| `FireResult` | SIMPLIFY | `sessionId`/`emitted`/`extra` are payload fields nothing sets on the generic path — exist only for the builtin merge. Ruling 2 does not protect never-set fields. Shrink to `{fired, reason?, runId?}`; the bindings' duplicate `FireRoutineResult` dies too. |
| `RoutineSchedulerConfig` | SIMPLIFY | Drop `reap` + `reaperCadenceMs` (never production-wired, re-confirmed). Survives as `{pollIntervalMs, canProvision?}` — and `canProvision` dies too once row 3 leaves core. |
| `RoutineScheduler` | KEEP | The stop handle the bootstrap disposer holds. Door: BOOTSTRAP. |
| `Routine` | KEEP | The row type; used by routes, reactions, bindings, tools — and the plugin surface. |
| `RoutineRun` | KEEP | The row type for run records. |
| `RoutinePatch` | SIMPLIFY | Drop the `\| SQL` widening — its own @lore admits it serves no caller. `Partial<NewRoutine>`. |
| `RoutineRunPatch` | SIMPLIFY | Same: drop `\| SQL`, no production caller passes a fragment. |
| `BakedRoutineRunRequest` | KEEP | The emit-time contract the work-intent seam and agent-orchestration drain consume. Door: SCHED:TICK → `enqueueWorkIntent`. Grows an event-payload field when the plugin work lands. |
| `RoutineRunResolverDeps` | MERGE | Dies as a declaration when row 16 merges — its four fields are already on `RoutineSchedulerPorts`. |

## Holes this leaves

1. **No automatic post-bet retro until the plugin exists.** What is lost meanwhile is a form letter, not analysis. The plugin's version needs two pieces of core work first: `registerEventTriggers` must pass the event payload through to the fired run, and event-trigger routines need a payload filter (`toState:"completed"`). The founder's parked "post-bet-retro bypasses the intent queue" story becomes: close those two gaps, then ship the ritual in the plugin.
2. **No knowledge decay/promotion until the plugin exists.** Changed from the first wave: these do **not** get re-wired as core `setInterval`s — Ruling 3 sends them to the plugin as globally-provisioned scheduled routines. Until then, stale knowledge does not decay and provisional items do not auto-promote. If that gap is unacceptable for long, the plugin is the work to schedule, not a core shim.
3. **No portfolio retro until the plugin exists.** Changed from "gone forever": the ritual returns in the plugin as an agent-run monthly review, provisioned once — not the current per-team title dump.
4. **New teams get no pre-installed routines from core.** Restated for the shared backend: teams start with whatever their installed plugins provision. Core seeding ceremony is gone; that is the correct division of labor.
5. **Manually triggering a coalesced routine leaves no `skipped` row.** The HTTP response still says `"coalesced"`. Unchanged.
6. **Deleted-routine history semantics change.** Hard delete takes run rows with it (FK); retire (`active:false`) remains the way to stop a routine while keeping history. Unchanged.
7. **No knowledge-ritual plugin work package exists.** FOUNDER-RULINGS confirms none is registered. Until one is written, every PLUGIN row in this file is a deletion with an IOU attached.

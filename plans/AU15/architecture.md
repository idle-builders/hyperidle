# AU15 — Routine agent-selection goes through the intent queue — Architecture

Track AU (Runtime Simplification). Backend/infra, no UI. Base: `origin/main` @ AU11/AU12(partial)/AU13(#442)/AU14(#441)/AU16(#440).

## 1. Context — problem and why now

One channel must exist between Core App and the Agent Layer: the durable `agent_work_intents` queue drained asynchronously by the agent layer. Every trigger family (assistant, session, knowledge, task, decomposition, re-engagement, routine) already records an intent and lets the drain resolve the agent. **Routine is the lone leak:** core `routine-scheduler.ts` still imports agent-owned `agent-selection.ts` and calls `isAgentAtWipLimit` + `selectAgentByAppDefaults` synchronously at fire-time (a second, undocumented Core→Agent channel). `runtime-simplification.md §"Current State After AU11"` names this the "one documented residual edge," filed as an AU8 boundary item. AU15 closes it.

## 2. Current-state audit (source-verified in worktree)

### 2a. The fire-time Core→Agent edge (the target)
- `services/routine-scheduler.ts:7` — `import { isAgentAtWipLimit, selectAgentByAppDefaults } from "./agent-selection.js"`. `agent-selection.ts` is **agent-owned** (`au11-runtime-ownership-guard.ts` `AU11_AGENT_FILES`, line 71). `routine-scheduler.ts` is **Core — Routine** (AU11 owner table).
- `routine-scheduler.ts:367` — `if (await isAgentAtWipLimit(db, targetAgentId))` (owner-WIP gate).
- `routine-scheduler.ts:374-384` — `selectAgentByAppDefaults({ surface: "routine_delegate", … })` (delegate selection).
- Both calls live only inside `checkAndFireRoutine` (the **generic**, non-builtin routine path). The 5 built-ins never reach this code.

### 2b. What the fire-time block actually does today (behavior, exact)
`checkAndFireRoutine` (generic routines), in order: (1) factory + monthly cost caps [core]; (2) **owner-WIP gate + delegate selection** [the edge]; (3) `if (!runtimeDeps) return "runtime unavailable"`; (4) txn: `insertRoutineRun(running)` + `recordAgentWorkIntent(kind:"routine_run", requestedBy: targetAgentId, idempotencyKey: routine:<runId>)`; (5) advance `lastRunAt`/`nextRunAt`, emit `agent_work_intent_recorded` + `routine_fired`.

Fire-time WIP outcomes:
- owner **not** at WIP → `targetAgentId = ownerAgentId`, fire.
- owner at WIP + `delegationAllowed` + `skillId` + delegate found → `targetAgentId = delegate`, fire.
- owner at WIP + (no delegate | delegation off) → **skip occurrence** (no run row, no intent), advance `nextRunAt`, return `{fired:false}`.

### 2c. The drain resolver already ignores the fire-time selection
`services/agent-work-intent-worker.ts` `resolveAuthoritativeInput` case `"routine_run"` (worktree lines ~196-219) reloads the run + routine via `routineService.getRoutineRunById` / `getRoutineById` and returns **`defaultAgentId: routine.ownerAgentId`** — it never reads `intent.requestedBy`. **Consequence: the fire-time delegate never runs.** Even when fire-time picks a delegate, the drain hands off the *owner*; provisioning then WIP-checks the owner. So today's delegation is cosmetic end-to-end (confirmed: the `del-successful-delegation` eval calls `checkAndFireRoutine` with no `runtimeDeps`, returns before creating any intent, and its `delegate_used`/`session_agent_correct` graders score 0).

### 2d. WIP is already enforced authoritatively at provision-time
`services/session-provisioning.ts:769-786` counts the agent's `active` sessions and throws `ConcurrencyLimitError` when `>= maxConcurrentSessions`. On that error, `agent-session-runtime.ts:306-308` calls `releaseRequestClaim` — the request returns to **pending (retryable), not terminal** (`agent-layer-boot.ts:100-109` documents this). The `routineRun(running)` is finalized only by the terminal lifecycle fact via `agent-lifecycle-projectors.ts` `projectRoutine` → `routineService.updateRoutineRunIfRunning`. So a WIP-blocked routine intent **defers and later runs** — it does not zombie or terminalize.

### 2e. Read/write ownership of the three tables in AU15's blast radius
AU13 (#442) already routed **every** `routines`/`routineRuns` read+write in `routine-scheduler.ts` and the drain resolver through `routine-service.ts` (verified: `getRoutineMonthlySpend`→`sumRoutineRunCostSince`, poll→`listActiveRoutines`, backfill→`listScheduledRoutinesMissingNextRunAt`, writes→`insertRoutineRun`/`updateRoutineById`, resolver→`getRoutineRunById`/`getRoutineById`). `au13-work-routine-ownership-guard.ts` is a **zero-allowlist** AST scan (owners = `work-service.ts` + `routine-service.ts` only) wired into `npm run lint`.

`agent_work_intents` has **no single-owner guard** and is raw-accessed from three non-owner production files today: `routes/threads.ts:1258` (insert — assistant family), `routes/sessions-routes.ts:397` (read), `services/agent-layer-boot.ts:56` (read — boot reconcile). The sanctioned write helper is `recordAgentWorkIntent` (`services/agent-work-intents.ts`). `routine-scheduler.ts` writes the intent **only** via `recordAgentWorkIntent` (line 413) — no raw access.

### 2f. AU11's prior objection to the drain-time move (must resolve/route around)
`plans/AU11/architecture.md §2` + `architecture-critique.md §"Round-1 WARNING 1"`: option (a) "push selection into the intent resolver" was **rejected**, for two reasons: (i) **scope** — AU11 was an import-path-only WP; any behavior change violated its invariant; (ii) **substance** — "WIP state can differ between fire and drain → a different agent chosen." Recorded as a `@lore` + AU8 boundary item, explicitly deferred to "future AU8-class work" — **which is this WP.**

## 3. Decision — DRAIN-TIME (move selection, close the channel)

**Move routine agent-selection (owner-WIP evaluation + delegate resolution) from fire-time `checkAndFireRoutine` (Core) to drain-time `resolveAuthoritativeInput` (Agent Layer). Remove the `agent-selection.ts` import from `routine-scheduler.ts`.** Fire-time keeps only Core-owned cost-cap gating and gains a Routine-domain coalescing guard for back-pressure.

### Why fire-time selection is NOT genuinely required (route around AU11's objection)
1. **Scope objection dissolved.** AU11 forbade behavior changes; AU15 is chartered to make exactly this one.
2. **Substance objection inverts in our favor.** "WIP can differ between fire and drain" is the *reason to evaluate at drain*, not against it — WIP checked closest to execution is *more* correct. And WIP is **already** authoritatively enforced at provision-time (§2d); the fire-time check is a redundant advisory pre-filter that is already backstopped by `ConcurrencyLimitError` + retryable release.
3. **No live "different agent" behavior to protect.** The drain resolver already discards the fire-time selection and runs the owner (§2c); delegation is cosmetic today. Moving selection to the resolver either preserves owner-runs or *repairs* delegation — it cannot regress a working behavior because none exists.
4. **This is the family-standard shape.** `bet_decomposition` already selects its agent *at drain-time* inside `resolveAuthoritativeInput`; `task_run` carries a fire-time-chosen agent and lets the dispatcher handle WIP at drain (`task-dispatcher.ts:216,300`). Routine joins the same pattern instead of being the one synchronous exception.

The alternative — "formalize a first-class second fire-time mode" — is rejected: the WP's Plan Calls forbid defaulting to it without proving the fire-time requirement is real, and §2d shows it is not.

### Back-pressure replacement (prevents pile-up)
Removing the fire-time WIP gate removes the back-pressure that stopped a busy owner from accumulating doomed runs. Replace it with a **Routine-domain coalescing guard** at fire-time: if `routineService.findRunningRoutineRun(routine.id)` returns a run, skip this occurrence (`{fired:false, reason:"previous run still in progress"}`) and advance `nextRunAt`. This is pure Routine domain (already an owned read, `routine-service.ts:205`), no agent-selection, no boundary crossing. Result: at most **one** in-flight run per routine; a WIP-blocked run sits pending and executes when the owner (or delegate) has capacity; later scheduled slots coalesce until it clears.

## 4. Concrete design

### 4a. `services/routine-scheduler.ts` — fire-time (Core), selection removed
- **Delete** import line 7 (`isAgentAtWipLimit, selectAgentByAppDefaults`).
- **Delete** the WIP/delegate block (lines 363-398). `targetAgentId` collapses to `routine.ownerAgentId` (used only for the `routine_fired` event `agentId` + the intent `requestedBy` correlation hint). `delegatedTo` is removed from `FireResult` (was only ever set by the deleted block; no production consumer reads it — `routines-routes.ts:471` and `builtin-routine-handlers.ts:195,199` read only `.fired`).
- **Add** coalescing guard immediately after the cost-cap checks and before the `runtimeDeps` guard:
  ```
  if (await routineService.findRunningRoutineRun(routine.id)) {
      const nextRunAt = computeNextRunAt(routine, now);
      await routineService.updateRoutineById(db, routine.id, { nextRunAt });
      return { fired: false, reason: "previous run still in progress" };
  }
  ```
- Txn (routineRun + `recordAgentWorkIntent`, `requestedBy: routine.ownerAgentId`), timestamps, and events are otherwise unchanged.
- No table access changes: cost caps + coalesce + writes all already route through `routineService` (au13-guard-clean). Intent write stays via `recordAgentWorkIntent`.

### 4b. `services/agent-work-intent-worker.ts` — drain-time (Agent Layer), selection added
`resolveAuthoritativeInput` case `"routine_run"`, after loading `run` + `routine` (unchanged, via `routineService`), replace the hard-coded `defaultAgentId: routine.ownerAgentId` with resolved selection:
```
let selectedAgentId = routine.ownerAgentId;
if (await isAgentAtWipLimit(db, routine.ownerAgentId)) {
    if (routine.delegationAllowed && routine.skillId) {
        const { agentId } = await selectAgentByAppDefaults({
            db, surface: "routine_delegate", teamId: null, workKey: routine.id,
            candidates: [], roleHint: null, spreadIndex: null,
            excludeAgentId: routine.ownerAgentId, skillId: routine.skillId,
        });
        if (agentId) selectedAgentId = agentId;   // else fall back to owner (defer via provision WIP)
    }
    // delegation off / no delegate → keep owner; provision-time WIP defers + retries (§2d)
}
await requireRunnableActor(db, selectedAgentId);
return { ...common, defaultAgentId: selectedAgentId, sourceKind: "routine", sourceId: runId,
         streamId: `routine:${routine.id}`, teamId: routine.teamId, taskId: null,
         sourceCorrelation: { routineId: routine.id, routineRunId: runId, teamId: routine.teamId } };
```
- `isAgentAtWipLimit` + `selectAgentByAppDefaults` are imported from `./agent-selection.js` — **agent→agent, same layer, no boundary crossing** (the whole point). `agent-work-intent-worker.ts` is in `AU9_AGENT_FILES`.
- The move **repairs delegation**: when the owner is at WIP and a delegate is available, the delegate is the one handed off and provisioned (finally end-to-end). When no delegate / delegation off, the owner is handed off and provision-time WIP defers-and-retries (clean, no zombie — §2d). Idempotency preserved: `recordAgentWorkIntent` dedupes on `(kind, sourceId, idempotencyKey)`; `claimAgentWorkIntent` CAS-leases prevent double-processing.
- This branch reads `routines`/`routineRuns` only via `routineService` (unchanged) and `users`/`sessions`/`userSkills` only via the agent-owned `agent-selection.ts` — **no raw access to any AU15 table.**

### 4c. `services/session-provisioning.ts`, reapers, lifecycle projectors — unchanged
Provision-time WIP enforcement (§2d) is the authoritative backstop and needs no change. `projectRoutine` finalizes `routineRun(running)` on completion (unchanged).

### 4d. Lore + doc updates
- `server-factory.ts:83-88` — the `@lore AU11` note describing the residual fire-time edge is now false; replace with an `@lore AU15` note stating routine selection resolves at drain-time in `resolveAuthoritativeInput`, matching every other family.
- `routine-scheduler.ts:219-224` (the `@lore AK7 §8` WIP/delegate comment) — remove/retarget.
- `docs/architecture/runtime-simplification.md §"Current State After AU11"` para 35 — the "one documented residual edge" is closed; update to reflect drain-time resolution (done at `/pipeline:write-docs`, noted here).

### 4e. Consequential eval updates (ungated but must stay honest)
`packages/eval/src/scenarios/delegation.ts` graders key on the **removed** fire-time reason strings (`"owner at WIP limit, no delegate available"` @299, `"owner at WIP limit, delegation not allowed"` @401) and on fire-time selection. Post-AU15 these must be repointed to the drain-time outcome (call `checkAndFireRoutine` *with* `runtimeDeps` + drain, then assert the delegate/owner session — the `del-successful-delegation` scenario now genuinely passes for the first time). `routine-sessions.ts` scenarios (heartbeat/calendar/humanReview/cost-cap) are unaffected. This is a small required follow-on inside the same WP, not a rewrite.

## 5. Read/write-ownership verification mechanism (founder directive)

**routines / routineRuns — covered by the existing zero-allowlist AU13 guard.** `au13-work-routine-ownership-guard.ts` (in `npm run lint`) fails on any raw `.from/.insert/.update/.delete(routines|routineRuns)` outside `work-service.ts`/`routine-service.ts`. `routine-scheduler.ts` and `agent-work-intent-worker.ts` are **not** in its allowlist, so any raw access AU15 might introduce (the new coalesce read, the resolver's selection) is caught mechanically. AU15's new lines use `routineService.findRunningRoutineRun` and the agent-owned `agent-selection.ts` — guard stays green. **This is the AU13-style mechanism the directive asks for; it already exists and already covers AU15's Routine-table reads AND writes.**

**agent_work_intents — AU15 adds zero new raw access; enforced by a focused static check.** AU15's only intent write is `recordAgentWorkIntent` (the sanctioned helper); its only intent reads are inside the owner module `agent-work-intent-worker.ts`. A zero-allowlist table-ownership guard for `agent_work_intents` **cannot** land in AU15 because three pre-existing non-owner accessors (`routes/threads.ts`, `routes/sessions-routes.ts`, `agent-layer-boot.ts` — §2e) would fail it, and migrating them is a Conversation/session/boot concern out of AU15's scope (do not reopen those domains here — earned, not preemptive). Instead AU15 adds a **narrow assertion** that its own touched Core file stays clean: extend `au6-agent-boundary-guard.ts` (regex per-file scan already in `npm run lint`) with two rules — (1) `routine-scheduler.ts` must not import from `agent-selection` (closes the primary edge as a verified static property); (2) `routine-scheduler.ts` must not contain a raw `.from/.insert/.update/.delete(agentWorkIntents)` (must go through `recordAgentWorkIntent`). Both are zero-allowlist for this file. The broader single-owner guard for `agent_work_intents` is explicitly logged as a **separate future WP** (like AU13 for routines), not silently assumed done.

## 6. File-by-file change list

| File | Change | Ownership check |
|---|---|---|
| `services/routine-scheduler.ts` | delete `agent-selection` import + WIP/delegate block; add `findRunningRoutineRun` coalesce; drop `delegatedTo` from `FireResult`; retarget `@lore` | au13-guard-clean (routineService only); au6-guard: no agent-selection import |
| `services/agent-work-intent-worker.ts` | add owner-WIP + delegate resolution in `routine_run` branch (imports from `./agent-selection.js`) | agent→agent (no boundary); routines/runs via routineService |
| `server-factory.ts` | replace stale `@lore AU11` residual-edge note with `@lore AU15` | comment only |
| `scripts/au6-agent-boundary-guard.ts` | add 2 zero-allowlist rules for `routine-scheduler.ts` (no agent-selection import; no raw agentWorkIntents) + fixtures | guard self-test |
| `packages/eval/src/scenarios/delegation.ts` | repoint graders from removed fire-time reasons to drain-time outcome | ungated eval, honesty |
| `docs/architecture/runtime-simplification.md` | note residual edge closed (deferred to write-docs) | doc |

## 7. Task breakdown — TDD ordered

### Red phase (write failing tests/guards first)
1. **R1 — drain-time selection (service integration test).** New `agent-work-intent-worker.routine-selection.integration.test.ts`: seed a routine (owner + delegate sharing a skill, `delegationAllowed:true`), record a `routine_run` intent, put owner at WIP (seed an active session), run `resolveAuthoritativeInput`/`drainAgentWorkIntents`; assert `defaultAgentId`/handed-off request targets the **delegate**. Second case: owner **not** at WIP → targets owner. Third: owner at WIP, no delegate → targets owner (deferral is provision's job). RED against current resolver (returns owner always).
2. **R2 — fire-time no longer selects (service integration test).** In the routines integration suite: put owner at WIP, call `checkAndFireRoutine` *with* `runtimeDeps`; assert it still records a `routine_run` intent (no fire-time skip on WIP) — RED against current fire-time gate that returns `{fired:false}`.
3. **R3 — coalescing (service integration test).** With an existing `routineRun(outcome:"running")` for the routine, `checkAndFireRoutine` returns `{fired:false, reason:"previous run still in progress"}` and writes no second run/intent. RED (no coalesce today).
4. **R4 — boundary guard (static).** Extend `au6-agent-boundary-guard.ts` + its fixture self-test: assert `routine-scheduler.ts` importing `agent-selection` and any raw `agentWorkIntents` access is a finding. RED against current source (line 7 import present).
5. **R5 — built-ins unaffected (service integration test / reuse).** Assert the 5 built-ins (`practice-meeting`, `post-bet-retro`, `portfolio-retro`, `knowledge-decay`, `knowledge-promotion`) still run via `runBuiltinRoutine`, write terminal `routineRuns`, and attribute to `routine.ownerAgentId` — unchanged (they never used fire-time selection). Likely already green via existing `builtin-routines.integration.test.ts`; add an explicit owner-attribution assertion if missing.

### Green phase
6. **G1** — move selection into `resolveAuthoritativeInput` `routine_run` (§4b); makes R1 green.
7. **G2** — delete import + WIP/delegate block from `checkAndFireRoutine`, drop `delegatedTo` (§4a); makes R2 green.
8. **G3** — add coalescing guard (§4a); makes R3 green.
9. **G4** — add the two `au6` rules + fixtures (§5); makes R4 green.
10. **G5** — retarget lore in `server-factory.ts` + `routine-scheduler.ts`; repoint `delegation.ts` eval graders (§4d, §4e).
11. **G6** — full gate: `npm run check` + `npm run lint` (au6/au9/au11/au13/au14 guards green) + `npm run test` + `npm run test:integration:service`.

## 8. Race analysis (AC-3) — ruled out

The fire→drain gap: routine due → `routineRun(running)` + intent written → (delay) → drain claims intent → resolves agent (WIP evaluated **now**) → hand-off → provision (WIP evaluated **again**, authoritative). WIP is now evaluated at the two points *closest to execution* instead of the stale fire moment — the race AU11 feared is **resolved**, not introduced. Double-processing is prevented by (a) `recordAgentWorkIntent` idempotency on `(kind, sourceId, idempotencyKey=routine:<runId>)`, (b) `claimAgentWorkIntent` CAS-lease (one drainer owns an intent at a time), (c) fire-time coalescing (one in-flight run per routine). If WIP fills between resolve and provision → `ConcurrencyLimitError` → retryable release → re-drain re-resolves (self-correcting). If it frees → provision succeeds. Neither path double-runs or zombies.

## 9. Trade-offs / open questions

- **Accepted:** a routine whose owner (and every eligible delegate) is *permanently* at max concurrency keeps one `routineRun(running)` pending indefinitely (coalesced, not piled up) until capacity frees. This is a pathological config; the routine-session reaper today reaps stale *sessions*, not session-less pending runs. Extending the reaper is deferred (earned, not preemptive) — flagged for the retro if it ever surfaces in practice.
- **Delegation repaired, not just relocated.** AU15 makes generic-routine delegation work end-to-end for the first time (it was cosmetic since AU9). If the reviewer judges delegation-repair out of AU15 scope, the fallback is resolver stays owner-only (`defaultAgentId = routine.ownerAgentId`, unchanged) + explicitly retire `delegationAllowed` as inert pending a future WP; the channel still closes either way. Recommendation: repair (it is a relocation of existing logic to the layer where it takes effect, not new complexity).
- **`agent_work_intents` single-owner guard** is broader than AU15 (3 pre-existing external accessors) — logged as a separate future WP, not closed here.

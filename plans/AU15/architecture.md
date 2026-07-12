# AU15 — Routine agent-selection goes through the intent queue — Architecture

Track AU (Runtime Simplification). Backend/infra, no UI. Base: `origin/main` @ AU11/AU12(partial)/AU13(#442)/AU14(#441)/AU16(#440).

> **Revision round 1** — addresses architecture-critique W1–W4 (no CRITICAL; core drain-time decision stands). W1: `agent_work_intents` full-guard deferral registered in AU8 (`TRACK-AU.md`). W2: coalescing unified onto the run-row signal across both fire paths. W3: terminal-failure finalization of session-less running runs designed + tested. W4: `au6` fixtures harness built in green phase, rules file-scoped to `routine-scheduler.ts`.

## 1. Context — problem and why now

One channel must exist between Core App and the Agent Layer: the durable `agent_work_intents` queue drained asynchronously by the agent layer. Every trigger family (assistant, session, knowledge, task, decomposition, re-engagement, routine) already records an intent and lets the drain resolve the agent. **Routine is the lone leak:** core `routine-scheduler.ts` still imports agent-owned `agent-selection.ts` and calls `isAgentAtWipLimit` + `selectAgentByAppDefaults` synchronously at fire-time (a second, undocumented Core→Agent channel). `runtime-simplification.md §"Current State After AU11"` names this the "one documented residual edge," filed as an AU8 boundary item. AU15 closes it.

## 2. Current-state audit (source-verified in worktree)

### 2a. The fire-time Core→Agent edge (the target)
- `services/routine-scheduler.ts:7` — `import { isAgentAtWipLimit, selectAgentByAppDefaults } from "./agent-selection.js"`. `agent-selection.ts` is **agent-owned** (`au11-runtime-ownership-guard.ts` `AU11_AGENT_FILES`). `routine-scheduler.ts` is **Core — Routine**.
- `routine-scheduler.ts:367` — `if (await isAgentAtWipLimit(db, targetAgentId))` (owner-WIP gate).
- `routine-scheduler.ts:374-384` — `selectAgentByAppDefaults({ surface: "routine_delegate", … })` (delegate selection).
- Both calls live only inside `checkAndFireRoutine` (the **generic**, non-builtin routine path). The 5 built-ins never reach this code.

### 2b. What the fire-time block actually does today (behavior, exact)
`checkAndFireRoutine` (generic routines), in order: (1) factory + monthly cost caps [core]; (2) **owner-WIP gate + delegate selection** [the edge]; (3) `if (!runtimeDeps) return "runtime unavailable"`; (4) txn: `insertRoutineRun(running)` + `recordAgentWorkIntent(kind:"routine_run", requestedBy: targetAgentId, idempotencyKey: routine:<runId>)`; (5) advance `lastRunAt`/`nextRunAt`, emit `agent_work_intent_recorded` + `routine_fired`. **`checkAndFireRoutine` calls NO coalescing today** (verified — the `shouldCoalesce` doc-comment at line 298 claiming it does is stale lore; the only live caller is the manual-trigger route, §2g).

Fire-time WIP outcomes:
- owner **not** at WIP → `targetAgentId = ownerAgentId`, fire.
- owner at WIP + `delegationAllowed` + `skillId` + delegate found → `targetAgentId = delegate`, fire.
- owner at WIP + (no delegate | delegation off) → **skip occurrence** (no run row, no intent), advance `nextRunAt`, return `{fired:false}`.

### 2c. The drain resolver already ignores the fire-time selection
`services/agent-work-intent-worker.ts` `resolveAuthoritativeInput` case `"routine_run"` (worktree ~196-219) reloads run + routine via `routineService.getRoutineRunById`/`getRoutineById` and returns **`defaultAgentId: routine.ownerAgentId`** — never reads `intent.requestedBy`. **Consequence: the fire-time delegate never runs.** Today's delegation is cosmetic end-to-end (the `del-successful-delegation` eval calls `checkAndFireRoutine` with no `runtimeDeps`, returns before creating any intent; its `delegate_used`/`session_agent_correct` graders score 0).

### 2d. WIP is already enforced authoritatively at provision-time
`services/session-provisioning.ts:783` throws `ConcurrencyLimitError` when active-session count `>= maxConcurrentSessions`. On that error, `agent-session-runtime.ts:306-308` calls `releaseRequestClaim` — the request returns to **pending (retryable), not terminal** (`agent-layer-boot.ts:100-109`); the boot loop re-drains intents+requests every ~1s (`agent-layer-boot.ts:198-200`). The `routineRun(running)` is finalized by the terminal lifecycle fact via `agent-lifecycle-projectors.ts:66` `projectRoutine` → `routineService.updateRoutineRunIfRunning`. So a WIP-blocked routine intent **defers and later runs** — no zombie, no terminalize.

### 2e. `projectRoutine` already finalizes terminal PROVISION failures (post-hand-off)
`projectRoutine` (`agent-lifecycle-projectors.ts:66-76`) keys on `fact.sourceId` (= the routineRun id, set at hand-off via `resolveAuthoritativeInput`'s `sourceId: runId`) and sets `outcome: fact.state === "completed" ? "success" : "error"`. So a non-retryable provision failure (`MISSING_CREDENTIAL`/`NO_ELIGIBLE_HARNESS`/`INTERNAL_ERROR`) that reaches `transitionAgentRunLifecycle(state:"failed")` (`agent-session-runtime.ts:315-322`) **does** finalize the routineRun to `error`. This path is already correct; §4c only adds a test + the one gap it does *not* cover.

### 2f. Read/write ownership of the three tables in AU15's blast radius
AU13 (#442) already routed **every** `routines`/`routineRuns` read+write in `routine-scheduler.ts` and the drain resolver through `routine-service.ts`. `au13-work-routine-ownership-guard.ts` is a **zero-allowlist** AST scan (owners = `work-service.ts` + `routine-service.ts` only), in `npm run lint`.

`agent_work_intents` has **no single-owner guard** and is raw-accessed from three non-owner production files: `routes/threads.ts` (insert — assistant family), `routes/sessions-routes.ts` (read), `services/agent-layer-boot.ts` (read — boot reconcile). Sanctioned write helper = `recordAgentWorkIntent` (`services/agent-work-intents.ts`). `routine-scheduler.ts` writes the intent **only** via `recordAgentWorkIntent` — no raw access.

### 2g. Existing coalescing signal (W2 — must reconcile)
`shouldCoalesce(db, routineId)` (`routine-scheduler.ts:303`) returns true iff an **active session** exists for the routine, and is the coalescing guard of the **manual-trigger** route (`routes/routines-routes.ts:497` → skipped run, reason `"coalesced"`). It is the ONLY live coalescing caller. A run-row signal (`routineService.findRunningRoutineRun`, `routine-service.ts:205`) is strictly broader: a `routine_run(outcome:"running")` exists from fire until the terminal lifecycle fact finalizes it — covering the fire→session-active window the session signal misses.

### 2h. AU11's prior objection to the drain-time move (must resolve/route around)
`plans/AU11/architecture.md §2` + `architecture-critique.md`: option (a) "push selection into the intent resolver" was rejected for (i) **scope** (AU11 was import-path-only) and (ii) **substance** ("WIP state can differ between fire and drain → a different agent chosen"). Deferred to "future AU8-class work" — this WP.

## 3. Decision — DRAIN-TIME (move selection, close the channel)

**Move routine agent-selection (owner-WIP evaluation + delegate resolution) from fire-time `checkAndFireRoutine` (Core) to drain-time `resolveAuthoritativeInput` (Agent Layer). Remove the `agent-selection.ts` import from `routine-scheduler.ts`.** Fire-time keeps only Core-owned cost-cap gating and a **unified** Routine-domain coalescing guard (§4a, W2). Selection at drain matches `bet_decomposition` (already selects at drain).

### Why fire-time selection is NOT genuinely required (route around AU11's objection)
1. **Scope objection dissolved.** AU11 forbade behavior changes; AU15 is chartered for exactly this one.
2. **Substance objection inverts.** "WIP can differ between fire and drain" is the reason to evaluate at drain — closest to execution — not against it. WIP is **already** authoritatively enforced at provision-time (§2d); the fire-time check was a redundant advisory pre-filter, backstopped by `ConcurrencyLimitError` + retryable release.
3. **No live behavior to protect.** The drain already discards the fire-time selection and runs the owner (§2c); delegation is cosmetic. Moving selection either preserves owner-runs or *repairs* delegation — cannot regress a working behavior.
4. **Family-standard shape.** `bet_decomposition` selects at drain; `task_run` handles WIP at drain-dispatch. Routine joins the pattern.

The "formalize a first-class second fire-time mode" alternative is rejected (§2b–2d show the fire-time requirement is not real).

## 4. Concrete design

### 4a. `services/routine-scheduler.ts` — fire-time (Core), selection removed, coalescing unified (W2)
- **Delete** import line 7 (`isAgentAtWipLimit, selectAgentByAppDefaults`).
- **Delete** the WIP/delegate block (lines 363-398). `targetAgentId` collapses to `routine.ownerAgentId` (used only for the `routine_fired` event `agentId` + intent `requestedBy` hint). Remove `delegatedTo` from `FireResult` (only the deleted block set it; no production consumer reads it — `routines-routes.ts:471` and `builtin-routine-handlers.ts:195,199` read only `.fired`).
- **Add** a coalescing guard after the cost-cap checks, before the `runtimeDeps` guard, using the **run-row** signal:
  ```
  if (await routineService.findRunningRoutineRun(routine.id)) {
      const nextRunAt = computeNextRunAt(routine, now);
      await routineService.updateRoutineById(db, routine.id, { nextRunAt });
      return { fired: false, reason: "previous run still in progress" };
  }
  ```
- **W2 — unify both fire paths onto one signal.** Repoint the manual-trigger route (`routes/routines-routes.ts:497`) from `shouldCoalesce` (session signal) to `routineService.findRunningRoutineRun` (run-row signal) so poll and manual coalesce on the **same** condition. This closes the double-run window the critique identified: a poll-created run that is fired-but-not-yet-provisioned (running run, no active session) now blocks a concurrent manual trigger (which `shouldCoalesce` would have let through). **Delete** the now-dead `shouldCoalesce` + its stale line-298 lore (guarded by `knip:production`; a `knip` finding here proves it was the sole caller). The manual route keeps writing its `outcome:"skipped"` record — only the predicate source changes.
- No table-access changes: cost caps + coalesce + writes route through `routineService` (au13-clean); intent write via `recordAgentWorkIntent`.

### 4b. `services/agent-work-intent-worker.ts` — drain-time (Agent Layer), selection added
`resolveAuthoritativeInput` case `"routine_run"`, after loading `run` + `routine` (unchanged, via `routineService`), replace the hard-coded `defaultAgentId: routine.ownerAgentId`:
```
let selectedAgentId = routine.ownerAgentId;
if (await isAgentAtWipLimit(db, routine.ownerAgentId)) {
    if (routine.delegationAllowed && routine.skillId) {
        const { agentId } = await selectAgentByAppDefaults({
            db, surface: "routine_delegate", teamId: null, workKey: routine.id,
            candidates: [], roleHint: null, spreadIndex: null,
            excludeAgentId: routine.ownerAgentId, skillId: routine.skillId,
        });
        if (agentId) selectedAgentId = agentId;   // else keep owner → provision WIP defers/retries (§2d)
    }
}
await requireRunnableActor(db, selectedAgentId);
return { ...common, defaultAgentId: selectedAgentId, sourceKind: "routine", sourceId: runId,
         streamId: `routine:${routine.id}`, teamId: routine.teamId, taskId: null,
         sourceCorrelation: { routineId: routine.id, routineRunId: runId, teamId: routine.teamId } };
```
- `isAgentAtWipLimit` + `selectAgentByAppDefaults` imported from `./agent-selection.js` — **agent→agent, same layer, no boundary crossing** (`agent-work-intent-worker.ts` ∈ `AU9_AGENT_FILES`).
- **Repairs delegation** end-to-end for the first time (owner at WIP + delegate available → delegate handed off and provisioned). No delegate / delegation off → owner handed off, provision-time WIP defers-and-retries (§2d). Idempotency preserved: `recordAgentWorkIntent` dedupes on `(kind, sourceId, idempotencyKey)`; `claimAgentWorkIntent` CAS-lease prevents double-processing.
- Reads `routines`/`routineRuns` via `routineService` only; `users`/`sessions`/`userSkills` via agent-owned `agent-selection.ts` only — no raw AU15-table access.

### 4c. Terminal-failure finalization of session-less running runs (W3)
The new fire-time coalescing (§4a) makes any `routine_run(outcome:"running")` block the routine until finalized. Enumerate every terminal state and confirm the run finalizes:
1. **Provision terminal failure (post-hand-off)** — `MISSING_CREDENTIAL`/`NO_ELIGIBLE_HARNESS`/`INTERNAL_ERROR`. Finalized by `projectRoutine` → `updateRoutineRunIfRunning(runId, {outcome:"error"})` (§2e). **Already correct — add a test (DoD AC-3c).**
2. **Retryable WIP/cost (post-hand-off)** — `ConcurrencyLimitError`/`CostCapExceededError`. Released to pending, run legitimately stays `running`, executes when capacity frees. Coalescing correctly holds one in-flight run. **Accepted (§9), tested via AC-2b.**
3. **Intent terminal failure (PRE-hand-off)** — `resolveAuthoritativeInput` throws `InvalidAgentWorkSourceError` (routine deactivated/deleted between fire and drain, or the selected agent is not runnable). The intent goes terminal `failed` in `failOrRelease` **before any request/session exists**, so no lifecycle fact ever fires and `projectRoutine` never runs → the `routineRun(running)` stays stuck → coalescing **bricks the routine**. This is the genuine gap the coalescing guard amplifies. **Fix:** in `agent-work-intent-worker.ts` `failOrRelease`, when an intent reaches terminal `failed` (`terminal === true`) and `intent.kind === "routine_run"`, finalize its source run via `routineService.updateRoutineRunIfRunning(intent.sourceId, { outcome: "error", endedAt, errorMessage: lastErrorCode })`. `updateRoutineRunIfRunning` is a no-op if already terminal (idempotent, safe under retry/race). This is an agent-owned worker calling `routineService` (already imported) — au13-clean, no boundary crossing. Runs only on pre-hand-off terminal failures (post-hand-off intents are `handed_off`, never re-enter `failOrRelease`), so it never touches the retryable defer path (case 2).

Net: every terminal path finalizes the run; coalescing self-heals in all cases. No reaper change needed (the AF6 §4 session reaper still covers crashed *active* sessions; §4c covers the new session-less pre-hand-off failure). If the builder discovers an additional session-less-stuck cause, extending the reaper to sweep stale session-less running runs is the documented fallback.

### 4d. `session-provisioning.ts`, session reaper, projectors — unchanged
Provision-time WIP (§2d) and `projectRoutine` (§2e) are the authoritative backstops; no change beyond §4c's `failOrRelease` addition.

### 4e. Lore + doc updates
- `server-factory.ts:83-88` — replace the stale `@lore AU11` residual-edge note with `@lore AU15` (routine selection resolves at drain-time in `resolveAuthoritativeInput`).
- `routine-scheduler.ts:219-224` (`@lore AK7 §8` WIP/delegate comment) + line-298 `shouldCoalesce` stale lore — remove/retarget (§4a deletes `shouldCoalesce`).
- `docs/architecture/runtime-simplification.md` para 35 — the "one documented residual edge" is closed (done at `/pipeline:write-docs`).

### 4f. Consequential eval updates (ungated but must stay honest)
`packages/eval/src/scenarios/delegation.ts` graders key on the **removed** fire-time reason strings (`"owner at WIP limit, no delegate available"`, `"owner at WIP limit, delegation not allowed"`) and fire-time selection. Repoint to the drain-time outcome (call `checkAndFireRoutine` *with* `runtimeDeps` + drain, assert the delegate/owner session — `del-successful-delegation` now genuinely passes). `routine-sessions.ts` scenarios are unaffected. Small required follow-on, not a rewrite.

## 5. Read/write-ownership verification mechanism (founder directive)

**routines / routineRuns — existing zero-allowlist AU13 guard.** `au13-work-routine-ownership-guard.ts` (in `npm run lint`) fails on any raw `.from/.insert/.update/.delete(routines|routineRuns)` outside `work-service.ts`/`routine-service.ts`. AU15's new coalesce read (`findRunningRoutineRun`), resolver reads, and `failOrRelease` finalize (`updateRoutineRunIfRunning`) all route through `routine-service.ts`; the touched files are not allowlisted, so any regression is caught. **Verification = guard stays green.**

**agent_work_intents — AU15 adds zero new raw access; enforced by two FILE-SCOPED `au6` rules (W4).** AU15's only intent write is `recordAgentWorkIntent`; only reads are inside the owner module. Extend `au6-agent-boundary-guard.ts` with two rules **scoped to `packages/server/src/services/routine-scheduler.ts` only** (`file ===` that exact path — NOT repo-wide; a repo-wide "no `agent-selection` import" rule would false-positive on the legitimately agent-owned importers `agent-work-intent-worker.ts`, `agent-defaults/resolvers.ts`, etc., and a repo-wide "no raw `agentWorkIntents`" rule would flag the three sanctioned/legacy accessors in §2f): (1) `routine-scheduler.ts` must not import from `agent-selection`; (2) `routine-scheduler.ts` must not contain a raw `.from/.insert/.update/.delete(agentWorkIntents)`. Both zero-allowlist for that one file.

**Full single-owner `agent_work_intents` guard — registered in AU8 (W1).** Cannot land in AU15 (three pre-existing non-owner accessors, §2f, must migrate first — out of AU15 scope). Registered durably in `.pipeline/work-packages/TRACK-AU.md` under AU8's `TABLE_OWNER` charter ("Follow-on registered by AU15"), not left as a plan-only aside that vanishes at write-docs.

## 6. File-by-file change list

| File | Change | Ownership check |
|---|---|---|
| `services/routine-scheduler.ts` | delete `agent-selection` import + WIP/delegate block; add `findRunningRoutineRun` coalesce; drop `delegatedTo` from `FireResult`; delete `shouldCoalesce` + stale line-298 lore; retarget `@lore` | au13-clean; au6 rule: no agent-selection import / no raw agentWorkIntents |
| `routes/routines-routes.ts` | repoint manual-trigger coalescing `shouldCoalesce` → `findRunningRoutineRun` (W2) | au13-clean (routineService) |
| `services/agent-work-intent-worker.ts` | add owner-WIP + delegate resolution in `routine_run` branch (imports `./agent-selection.js`); add `failOrRelease` routine-run finalize on terminal fail (W3) | agent→agent; routineService for run finalize |
| `server-factory.ts` | replace stale `@lore AU11` residual-edge note with `@lore AU15` | comment only |
| `scripts/au6-agent-boundary-guard.ts` | add 2 file-scoped rules for `routine-scheduler.ts` + **build a `--fixtures` self-test harness** (au13-style; none exists today, W4) | guard self-test |
| `packages/eval/src/scenarios/delegation.ts` | repoint graders to drain-time outcome | ungated eval, honesty |
| `docs/architecture/runtime-simplification.md` | note residual edge closed (deferred to write-docs) | doc |

## 7. Task breakdown — TDD ordered

### Red phase (write failing tests/guards first)
1. **R1 — drain-time selection (service integration test).** New `agent-work-intent-worker.routine-selection.integration.test.ts`: routine (owner + delegate sharing a skill, `delegationAllowed:true`), record `routine_run` intent, owner put at WIP (seed active session), drain; assert handed-off request targets the **delegate**. Cases: owner not at WIP → owner; owner at WIP + no delegate → owner. RED (resolver returns owner always).
2. **R2 — fire-time no longer selects (service integration test).** Owner at WIP, `checkAndFireRoutine` *with* `runtimeDeps` → still records a `routine_run` intent (no fire-time WIP skip). RED (current gate returns `{fired:false}`).
3. **R3 — unified coalescing (service integration test, W2).** (a) With an existing `routineRun(running)`, `checkAndFireRoutine` returns `{fired:false, reason:"previous run still in progress"}`, no second run/intent. (b) With the same running run and **no active session**, the manual-trigger route also coalesces (`reason:"coalesced"`) — proving both paths share the run-row signal. RED (no poll coalesce; manual uses session signal).
4. **R4 — terminal-failure finalization (service integration test, W3).** (a) A `routine_run` intent whose routine is deactivated between fire and drain → intent terminal `failed` → its `routineRun` finalized `error` (not stuck `running`) → a subsequent `checkAndFireRoutine` for that routine does NOT coalesce (self-healed). (b) A handed-off routine request that terminally fails at provision (`INTERNAL_ERROR`) → `projectRoutine` finalizes the run `error`. RED for (a) (no finalize today); (b) may already pass — assert it.
5. **R5 — boundary guard (static, W4).** Extend `au6-agent-boundary-guard.ts` with the two file-scoped rules AND a `--fixtures` self-test that asserts: `routine-scheduler.ts` with an `agent-selection` import → finding; with a raw `agentWorkIntents` access → finding; a *different* file importing `agent-selection` → NOT a finding (proves file-scoping). RED against current source (line-7 import present).
6. **R6 — built-ins unaffected (service integration test / reuse).** The 5 built-ins still run via `runBuiltinRoutine`, write terminal `routineRuns`, attribute to `routine.ownerAgentId`. Likely green via `builtin-routines.integration.test.ts`; add owner-attribution assertion if missing.

### Green phase
7. **G1** — move selection into `resolveAuthoritativeInput` `routine_run` (§4b) → R1 green.
8. **G2** — delete import + WIP/delegate block, drop `delegatedTo` (§4a) → R2 green.
9. **G3** — add `findRunningRoutineRun` coalesce in `checkAndFireRoutine`; repoint manual-trigger route; delete `shouldCoalesce` + stale lore (§4a) → R3 green.
10. **G4** — add `failOrRelease` routine-run finalize (§4c) → R4a green; confirm R4b.
11. **G5** — add the two file-scoped `au6` rules + **build the `--fixtures` harness** (§5, W4) → R5 green.
12. **G6** — retarget lore (`server-factory.ts`, `routine-scheduler.ts`); repoint `delegation.ts` eval graders (§4e, §4f).
13. **G7** — full gate: `npm run check` + `npm run lint` (au6/au9/au11/au13/au14 green) + `npm run knip:production` (proves `shouldCoalesce` removal clean) + `npm run test` + `npm run test:integration:service`.

## 8. Race analysis (AC-3) — ruled out

Fire→drain gap: routine due → `routineRun(running)` + intent → (delay) → drain claims intent → resolves agent (WIP evaluated **now**) → hand-off → provision (WIP evaluated **again**, authoritative). WIP is evaluated at the two points closest to execution instead of the stale fire moment — the race AU11 feared is **resolved**, not introduced. Double-processing prevented by (a) `recordAgentWorkIntent` idempotency on `(kind, sourceId, idempotencyKey=routine:<runId>)`, (b) `claimAgentWorkIntent` CAS-lease, (c) **unified** fire-time run-row coalescing (§4a, W2) — one in-flight run per routine across BOTH fire paths. WIP fills between resolve and provision → `ConcurrencyLimitError` → retryable release → re-drain re-resolves (self-correcting). Frees → provision succeeds. Terminal failure at either stage finalizes the run (§4c) so coalescing self-heals. No path double-runs or bricks.

## 9. Trade-offs / open questions

- **Accepted:** a routine whose owner (and every eligible delegate) is *permanently* at max concurrency keeps one `routineRun(running)` pending (coalesced, not piled up) until capacity frees. Pathological config; §4c ensures every *terminal* path still finalizes, so only a genuinely-runnable-but-blocked routine holds a pending run (correct).
- **Delegation repaired, not just relocated.** AU15 makes generic-routine delegation work end-to-end for the first time (cosmetic since AU9). Fallback if reviewer scopes repair out: resolver stays owner-only (unchanged); channel still closes. Recommendation: repair (relocation of existing logic to the layer where it takes effect, not new complexity).
- **Generic-path skip→defer semantic change** (owner-at-WIP-no-delegate): old dropped the occurrence, new defers via a coalesced pending run. Within spec (AC-2 "same outcome" scoped to built-ins, which are unaffected). Surfaced for founder sign-off.
- **`agent_work_intents` single-owner guard** — registered in AU8 (`TRACK-AU.md`, W1), not closed here.

# dispatch — Service-as-Product Re-Architecture (AU20, both lenses)

**Layer:** agent-orchestration · **Owned tables:** none · **Substrate:** internal-logic
**Now:** 23 methods / 50 types · **Target:** 5 methods / 5 types

---

## 1. INSIDE-OUT (anchor)

### Substrate = internal-logic (owned algorithm), NOT an external-API adapter

dispatch owns no DB table and adapts no single outside system. It is a **pure
coordination algorithm**: the **agent-work admission state machine**. Every *trigger*
in the product converges here and is turned into a *provisioned agent session*, then
handed off to `run-orchestration.executeAgentRunRequest` (the executor). It reaches
DOWN into many services (work, routine, conversation, model-gateway, …) but that is
consumption via injected ports — it is not an adapter *over* any one of them. The owned
thing is the **convergence policy**: subscribe trigger sources → decide whether/when to
admit → resolve model + context → hand to the executor.

Four trigger sources feed one convergent path:
- a **task** becoming ready,
- a **user message** to an assistant,
- a **routine** coming due (cron/event),
- a **builtin routine** payload firing (e.g. portfolio-retro).

### The FLOOR — the algorithm's coherent operation set (~5)

For an internal-logic service the floor is the minimal coherent op set of the owned
algorithm. The admission engine's is:

| # | Floor op | Why it is floor (not sugar) |
|---|---|---|
| 1 | **boot the engine** (`start` → disposer) | the machine must be wired to its trigger sources and torn down; one lifecycle |
| 2 | **admit a conversational trigger** (`runAssistantTurn`) | one of two externally-reachable convergence entry points |
| 3 | **admit a routine trigger** (`fireRoutine`) | the other externally-reachable entry point; builtin vs generic is an internal branch |
| 4 | **seed a team's routines** (`provisionTeamRoutines`) | the one write the machine owns as setup for its routine-trigger source |
| 5 | **observe the in-flight queue** (`getQueueSnapshot`) | read the admission machine's own live state |

Floor = **5**. There are **no genuine capabilities beyond the floor** — the algorithm's
coherent op set already is the product. The remaining 18 current methods are not extra
capabilities; they are fragmentation of these five (four registrars = one `start`; two
firing paths = one `fireRoutine`; execute+persistFailure = one `runAssistantTurn`) plus a
leaked utility (cron math) that is not this service's product.

---

## 2. OUTSIDE-IN (real demand)

Cross-service census (`service-data-23.json`):
- `run-orchestration` → `executeAssistantRequest` → **runAssistantTurn**
- `tool-handlers` → `provisionTeamRoutines` → **provisionTeamRoutines**
- `tool-handlers` → `parseCron`, `nextCronMatch` → **cron math — NOT dispatch's product** (leak; 3 importers: dispatch, run-orchestration, tool-handlers). Relocate to `@hyperidle/shared`; severs 2 of tool-handlers' 3 requests.

Composition-root / server demand (real, not in cross-service census):
- boot (`app.ts`) → **start**
- `routes/dispatch-queue-routes.ts` → **getQueueSnapshot**
- `routes/routines-routes.ts` / `tools/create-routine.ts` → **fireRoutine**

Every real demand maps onto exactly one floor op. No demand requires a method outside the floor.

---

## 3. THE COHERENT PRODUCT API (fusion — 5 methods, 5 types)

One bound-ops object (`createDispatchOps(ports) → DispatchOps`), parameterized by trigger
and intent — never a method or type per call site.

| Interface | Shape | Lens | Comes from |
|---|---|---|---|
| `start(config): Promise<Disposer>` | wire ALL trigger sources (task, assistant, routine scheduler, builtin) and return one disposer | both | floor #1 + boot demand |
| `runAssistantTurn(deps, request): Promise<void>` | admit one conversational turn; failure persistence internal | both | floor #2 + run-orchestration demand |
| `fireRoutine(db, eventBus, routine, opts?): Promise<FireResult>` | admit a routine by identity; builtin↔generic is an internal branch on the spec | both | floor #3 + routes/tools demand |
| `provisionTeamRoutines(db, opts): Promise<void>` | seed a team's builtin routines | both | floor #4 + tool-handlers demand |
| `getQueueSnapshot(): DispatchQueueSnapshot` | read the live admission queue | both | floor #5 + status-route demand |

**Types (5):** `DispatchOps`, `DispatchPorts` (the ONE structural DI contract — the ~34
`Dispatch*Accessor`/mirror types become inline non-exported members), `DispatchConfig`
(one boot config folding `TaskDispatcherDeps`+`RoutineSchedulerConfig`+runtime deps),
`DispatchQueueSnapshot` (`DispatchQueueEntry` folds in), `FireResult` (`Disposer = () => void`
stays inline). `createDispatchOps` is the factory (construction, not a product method).

**Evolvability (inside-out):** a new trigger source = an internal module wired inside
`start()`, zero new surface. A new builtin routine = one `BUILTIN_SPECS` entry, fired by
existing `fireRoutine`. A new downstream dependency = one field on `DispatchPorts`. All
four growth axes are absorbed without new exports — sub-linear.

**Completeness (no capability lost):** every current user feature is still deliverable —
task-ready dispatch, assistant chat turns, cron/event routine firing, builtin routines
(portfolio-retro etc.), team routine seeding, and queue observability all reach through
the five ops. Nothing that was reachable becomes unreachable; only the fragmentation is removed.

---

## 4. TARGET NUMBERS & DELETIONS

- **targetMethods = 5** (= floor 5 + 0 justified extras). `createDispatchOps` factory excluded from the op count.
- **targetTypes = 5** (`DispatchOps`, `DispatchPorts`, `DispatchConfig`, `DispatchQueueSnapshot`, `FireResult`).

**DELETED from dispatch (not internalized):**
- Cron math `parseCron` / `nextCronMatch` / `computeNextRunAt` (3 methods) → **relocated to
  `@hyperidle/shared`**; removed from dispatch outright, killing the utility-provider role
  and 2 of tool-handlers' 3 requests.

**Internalized (collapsed behind the 5-op surface, not deleted behaviorally):**
- ~34 `Dispatch*Accessor` + input/result/config mirror types → one structural `DispatchPorts`.
- 4 registrars (`registerTaskDispatcher`/`registerAssistantDispatcher`/`startRoutineScheduler`/`registerBuiltinRoutineHandlers`) → `start`.
- 2 firing paths (`runBuiltinRoutine`+`checkAndFireRoutine`) → `fireRoutine`.
- `persistTurnFailure` → internal to `runAssistantTurn`; `getRoutineMonthlySpend` → scheduler-internal budget read.
- builtin config/predicates (`BUILTIN_ROUTINE_IDS`, `BUILTIN_SPECS`, `extractBuiltinKind`, `isBuiltinRoutineId`) + `mapErrorToNotice`/`isAssistantThread`/`ThreadLike` → internal (tests import internals).

Net: 23 methods → **5**, 50 types → **5**, external demand fully served, trigger→execute
product boundary preserved.

---

## Stage 2 planner adjudication — census and admission ownership (supersedes conflicting claims above)

### Exact target

Keep the five cohesive object operations, but correct the implementation-site target to
**1 method / 5 types = 6**.

`surface-census.ts` counts exported implementation declarations, not methods stored on the object
returned by a factory. `createDispatchOps` is the sole exported value declaration. `start`,
`runAssistantTurn`, `fireRoutine`, `provisionTeamRoutines`, and `getQueueSnapshot` are members of
`DispatchOps` and add zero method declarations. Compatibility wrappers that merely produce five
counted methods are metric gaming and have been deleted.

```ts
createDispatchOps(ports: DispatchPorts): DispatchOps

interface DispatchOps {
  start(config: DispatchConfig): Promise<() => void>;
  runAssistantTurn(deps: /* inline structural input */, request: AgentSessionRequest): Promise<void>;
  fireRoutine(db, eventBus, routine, opts?): Promise<FireResult>;
  provisionTeamRoutines(db, opts): Promise<void>;
  getQueueSnapshot(): DispatchQueueSnapshot;
}
```

**Exported method declarations (1):** `createDispatchOps`.

**Exported type declarations (5):** `DispatchOps`, `DispatchPorts`, `DispatchConfig`,
`DispatchQueueSnapshot`, `FireResult`.

`DispatchQueueSnapshot` inlines the queue-entry shape. Disposer, assistant-turn deps,
post-bet-retro args, scheduler/task configs, builtin ids/specs/results, and all accessor/input/result
mirrors are structural members or package-private declarations, not exported types.

`getQueueSnapshot` moves onto the bound object. Queue storage, draining state, and stale-generation
state move from module globals into the `createDispatchOps` instance closure. Each instance is
isolated; snapshots copy the entries array. The dispatch-queue route receives the bound instance at
the composition root rather than importing a loose function.

### Reconciliation: task-ready admission is already durable outside dispatch

The current task dispatcher's apparent “success” path resolves a model and removes the queue entry
without creating or consuming a request. That code cannot prove the old claim that dispatch turns a
task-ready trigger into a session. Stage 1 could only pin subscription/snapshot behavior and did not
old-green this missing handoff.

The demanded task-ready capability nevertheless exists on the current canonical path:

1. `work` accepts/creates an owned task and, in the **same transaction**, inserts a
   `taskDispatchAttempts` row plus calls the existing session-requests
   `recordAgentWorkIntent(..., { kind: "task_run", sourceKind: "task_dispatch_attempt", ... })`.
2. `session-requests` durably claims that intent, resolves the attempt and task, enforces current
   actor/task eligibility, creates the session request, and hands it to run-orchestration.

Dispatch must **not** record another task intent before removing its legacy queue entry; that would
duplicate the already-atomic owner write and lacks the required dispatch-attempt source id. No new
reservation table or second admission path is introduced.

For AU20, the instance-local task queue is explicitly an **observability mirror of task lifecycle
events**, not the admission source of truth. Its drain may reconcile/remove entries after the
durable owner path is observable, but must not claim that model resolution alone dispatched work.
Add a new red integration test (Stage 1 could not old-green it) that accepts a task and proves the
existing owner path creates exactly one `taskDispatchAttempts` row and exactly one durable
`agent_work_intents` row before the emitted task event is mirrored/removed. The test must fail if
dispatch creates a second intent. Preserve the Stage 1 snapshot-copy and subscription tests while
migrating them to `ops.getQueueSnapshot()`.

The product description is narrowed accordingly: dispatch owns assistant/routine convergence and
the lifecycle/observability wiring around task triggers; durable task admission belongs to
work + session-requests. “Every trigger is turned into a provisioned session here” is no longer an
accurate dispatch substrate claim.

### Routine firing and lifecycle atomicity

- Preserve the existing generic routine atomic unit: insert the `routine_run` and record its
  `agent_work_intent` in one DB transaction, then emit after commit.
- The preflight `findRunningRoutineRun` is an advisory duplicate guard, not a cross-process atomic
  claim. AU20 does not add a dispatch-owned table, reservation, or uniqueness scheme. If routine's
  existing owner API cannot express a compare-and-create without broadening that Service's approved
  contract, preserve current behavior and document the concurrency limitation; do not fake
  atomicity in dispatch with an in-memory lock. A durable multi-process claim requires separately
  refined routine-owner demand.
- Preserve builtin poll semantics: advance `nextRunAt` before asynchronous firing to prevent the
  next poll from selecting the same due row. This is intentionally at-most-once across a crash.
- `start` is one lifecycle per ops instance. A second call before disposal rejects with a clear
  already-started error. Disposal is idempotent and permits a later restart with fresh queue state.
  If any registration or awaited scheduler setup fails, run already-acquired disposers in reverse
  order before rejecting; no partial subscribers or intervals survive.
- Scheduler ticks must not overlap within an instance. A tick-in-progress guard skips a concurrent
  interval callback; durable routine state remains the cross-process authority.

### Cron relocation

Move `parseCron`, `nextCronMatch`, and `computeNextRunAt` to `@hyperidle/shared`, including their
supporting cron type. Dispatch, run-orchestration, tool-handlers, and their tests import the shared
functions. Dispatch exposes no cron wrapper or alias. The Stage 1 cron behavior (named weekdays,
ranges, invalid-field rejection, and strictly-after matching) remains protected at the shared
location.

### Physical deletion and migration obligations

1. Consolidate live dispatch implementation behind `createDispatchOps` so cross-file helpers no
   longer need exported declarations. Merely deleting barrel re-exports is insufficient. Delete or
   colocate the loose registrars, firing functions, queue getter, error/predicate utilities, builtin
   config exports, scalar reads, and state constructors.
2. Collapse `ports.ts` to the single exported `DispatchPorts` declaration. Inline or make private
   every accessor/input/result mirror. Keep only the other four exported types named above.
3. Remove production compatibility exports from `dispatch-bindings.ts` (`startDispatch`,
   `executeAssistantRequest`, `runBuiltinRoutine`, `checkAndFireRoutine`,
   `provisionTeamRoutines`) after migrating callers to the shared bound `dispatchOps` object. A
   composition adapter may load a routine row before calling `fireRoutine`, but it is not a public
   dispatch method and must not recreate the old surface.
4. Migrate server boot, run-orchestration assistant consumption, routines/team routes,
   tool-handlers, dispatch-queue route, core-api routines facade, eval scenarios, and integration
   tests to the five object operations. Cron consumers migrate to shared.
5. Preserve never-silent assistant failure persistence, assistant first-response pinning, builtin
   routine outcomes, generic run+intent transaction, team routine seeding, task-event mirror
   ordering, copied queue snapshots, and complete lifecycle disposal.
6. Acceptance is exact census **dispatch = 1 method / 5 types**, the Stage 1 contract migrated and
   green, the new durable task-admission red test green, all callers migrated, and no wrapper,
   reservation table, guard, or census-script change.

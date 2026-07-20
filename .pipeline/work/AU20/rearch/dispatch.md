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

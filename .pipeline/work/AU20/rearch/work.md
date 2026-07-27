# `work` — Service-as-Product Re-Architecture (AU20, BOTH lenses)

**Layer:** core-api · **Substrate:** OWNED DB TABLES (5)
**Owned tables:** `bets`, `tasks`, `items`, `artifacts`, `taskPlanningSignals`
**Now:** 56 methods / 51 types · **Target:** 14 methods / ~20 types

`work` is the center of the product's process model. Bet / Task / Item / Artifact are the
nouns users and agents actually operate on; almost every other service reads or mutates
them *through* `work`. This is a genuine domain product owning five tables — **standalone**,
not table-packaging. The prior audit (`analysis/services/work.md`) designed only the
OUTSIDE (collapse the 84 call-site methods to a general read/write surface). This pass adds
the INSIDE-OUT lens: derive the floor from the tables, then justify every method above it.

---

## 1. INSIDE-OUT — substrate, floor, owned capabilities

### Substrate: OWNED DB TABLES (kind a)
Five owned tables. The floor is plain CRUD over them.

| Table | Role | CRUD needed |
|---|---|---|
| `bets` | time-boxed bet (status machine + cost + decomposition status) | C R(get/list/count/search) U(field/increment/CAS) |
| `tasks` | unit of work under a bet (state machine + notes + audit + deps) | C R(get/list/count) U(field/append-note/CAS) |
| `items` | queue/inbox item (routing + reasoning markers) | C R(get/list/find) U |
| `artifacts` | task output blob (+ preview) | C R(get/list/page) U(preview CAS) |
| `taskPlanningSignals` | `riskTier` extension of `tasks` (O2) | R(get-by-taskId) only |

**Naive floor = ~5 × 5 tables = ~25 CRUD ops.** But CRUD is *identical in shape* across
tables, so the coherent floor collapses to **5 entity-parameterized generic primitives**
that serve all four main tables — already built (`work-service.ts` Ag5b/Ag5c):

| Primitive | Shape | Covers |
|---|---|---|
| `get(exec, entity, id, {include?})` | `→ Row \| undefined` (discriminated by entity; `include` carries the owned-primary join) | every `get*ById` + `getArtifactWithTaskTitleById` |
| `list(exec, entity, filter)` | `→ Row[]` \| `number` (`count:true`) \| enriched (`include`) — filter = AND-composed `{ids, teamId, status, state, betId, ownerAgentId, threadId, threadIds, sourceAgentId, text, marker, bodyMarker, queued, createdSince, taskIds, cursor, limit, offset, count, include}` | every `list*`/`find*`/`count*`/`search*` |
| `create(exec, entity, values)` | `→ void` | all four `create*` |
| `update(exec, entity, id, patch)` | `→ void \| {id}` — patch supports `{increment}` (atomic accumulate) and `{appendNote}` (atomic CASE-concat) operators | `update*ById`, `incrementBetCost`, `appendTaskNote` |
| `transition(exec, entity, spec)` | `→ {applied, affected}` — `spec={id?, guard:{field,equals}\|{field,isNull}, patch}`; `id`-less = bulk sweep | `transitionBetStatus`, `transitionTaskState`, `claimBetDecomposition`, `resolveOrphanedBetDecompositions` (sweep), `updateBetDecompositionStatusIfRunning`, `setArtifactPreviewIfAbsent` |

`taskPlanningSignals` is a single-read extension (only `review` reads `riskTier`, via a DI
port) — not worth an entity slot in the generics; it stays one named capability read.

**Floor = 5 generic CRUD primitives + 1 extension read = 6.** (Well under the ~25 naive
anchor — the win of entity-parameterization.)

### Genuine owned capabilities beyond CRUD (things the raw tables can't express)
Each encodes an invariant / policy / propagation the tables alone cannot enforce — these are
the reason `work` is a product, not a repository:

1. **`transitionBet`** — validated bet state machine: capacity check + revision-log append +
   event emission wrapped around a guarded status CAS. The *only public door* for bet-status
   change (raw `transition("bet", {guard:status})` stays internal so no consumer skips
   validation — closes the real hazard where `policy` bypassed the machine today).
2. **`updateBetField`** — non-status bet field edit with revision-log append + event. Distinct
   from a raw `update` (audit side-effect).
3. **`transitionTask`** — validated task state machine: `VALID_TRANSITIONS` guard + audit entry
   + dispatch-attempt + event. The only public door for task-state change.
4. **`cascadeBetKill`** — downward kill propagation across a bet's tasks/sessions.
5. **`registerBetDecomposition`** — boot: wire the bet-created → decompose-into-tasks
   EventBus subscriber (owned bet→tasks algorithm).
6. **`resolveOrphanedDecompositions`** — boot crash-recovery sweep (orphaned `running`
   decompositions → blocked/failed).
7. **`routeItem`** — pure item-routing policy (where a queue item goes).
8. **`checkAndUnblockDependents`** — task dependency-graph unblock on a task completing.
9. **`getTaskRiskTier`** — `taskPlanningSignals` extension read (the 5th table's only op).

Vocabulary (not methods): `InvalidTransitionError`, `VALID_TRANSITIONS`.

**Made internal (not product surface):** raw `transitionBetStatus`/`transitionTaskState`
(consumed only inside the two state machines); `runBetDecomposition` (test/direct-trigger
seam — exercised through `registerBetDecomposition`); `findEligibleTeamAgents`,
`insertProposedBetTasks` (decomposition internals, exported today only for tests → test
through the public entry per "tests never entry points").

---

## 2. OUTSIDE-IN — real consumer demand (from service-data-23)

7 consumer services, 51 requests. The demand is overwhelmingly **generic read + a few
guarded writes**, not bespoke methods:

- **`getTaskById` requested by 4 of 7 consumers** (policy, realtime, cost, dispatch,
  session-requests, tool-handlers) → the single highest-demand op. Proves the general
  `get(entity,id)` *is* the real demand.
- `getBetById` / `getItemById` — same, all consumers → `get`.
- `listTasks`, `listQueuedItemsSince`, `listItemIdsBySourceAgent`, `findRetroItemByThreadIds`,
  `findItemByReasoningMarker` (notifications/policy/dispatch/tool-handlers) → one
  `list(entity, filter)`; each was a predicate over an owned table, not a distinct capability.
- Writes: `createItem`/`createBet`/`createTask`/`createArtifact` → `create`;
  `updateItemById`/`updateTaskById`/`updateBetById`/`incrementBetCost`/`appendTaskNote`/
  `routeItem` → `update`(+operators) & the `routeItem` capability;
  `transitionBetStatus`/`transitionTaskState` (requested by **policy**, bypassing validation)
  → must route through the validated `transitionBet`/`transitionTask` capabilities.

No consumer needs a per-use-case method. The demand collapses cleanly onto the 5 generics +
the validated-transition capabilities.

---

## 3. THE COHERENT PRODUCT API (both lenses fused)

**A. Generic repository (inside-out floor = outside-in demand) — 5 methods**

| Method | Lens | From |
|---|---|---|
| `get(exec, entity, id, {include?})` | both | tables (get floor) + `getTaskById`×4-caller demand |
| `list(exec, entity, filter)` | both | tables (list/count/search floor) + all consumer list/find demand |
| `create(exec, entity, values)` | both | tables (insert floor) + `create*` demand |
| `update(exec, entity, id, patch)` | both | tables (update floor + atomic operators) + `update*`/`increment`/`appendNote` demand |
| `transition(exec, entity, spec)` | inside-out | tables (guarded CAS floor); internal to the state machines — not a public write door |

**B. Owned domain capabilities (inside-out; each a genuine invariant) — 9 methods**
`transitionBet`, `updateBetField`, `transitionTask`, `cascadeBetKill`,
`registerBetDecomposition`, `resolveOrphanedDecompositions`, `routeItem`,
`checkAndUnblockDependents`, `getTaskRiskTier`.

**C. Vocabulary + injection (types, not methods)**
Row types `Bet`/`Task`/`Item`/`ArtifactRow`; discriminated enrichments
`ArtifactWithTaskTitle`/`ArtifactTaskSummaryRow`/`BetTaskWithLatestSessionOutcome`; generic
machinery `WorkEntity`/`WorkFilter`/`TransitionGuard`/`TransitionSpec` + operators
`IncrementOp`/`AppendNoteOp`; audit vocab `RevisionLogEntry` + `TaskAuditEntry`
(`StateTransitionAuditEntry`/`HandoffAuditEntry`); one inbound `WorkDeps` bundle (the five
injected ports — `AgentWorkIntentRecorder`, `AgentSelectionDefaults`, `CostCapChecker`,
`UserStoreReader`, `TeamCapacityReader` — wired once at the composition root; their per-op
DTOs push to `@hyperidle/shared`, they are *inbound wiring*, not product surface).

---

## 4. TARGET NUMBERS

- **targetMethods = 14** = 5 generic CRUD primitives (serving all 5 tables) + 9 genuine owned
  capabilities. **Floor (owned-tables anchor) = ~25** (5 tables × ~5). Target is *under* the
  naive floor because the generic primitives collapse per-table CRUD to 5 — leaner than the
  anchor, with every one of the 9 extras justified above by a table-level invariant.
- **targetTypes ≈ 20**: 4 row types + 3 discriminated enrichments + 4 generic-machinery types
  (`WorkEntity`/`WorkFilter`/`TransitionGuard`/`TransitionSpec`) + 2 operators + 4 audit-vocab
  + `WorkDeps` + `VALID_TRANSITIONS` type. Entity maps
  (`WorkEntityRowMap`/`CreateMap`/`UpdatePatchMap`/`TransitionPatchMap`) stay *internal* generic
  plumbing, not product surface.

### DELETED (gone, not internalized)
- ~19 read methods (`getBetById`/`getTaskById`/`getItemById`/`getArtifactById` + all
  `list*`/`find*`/`count*`/`search*`) → subsumed by `get`/`list`. The per-caller list variants
  were catering, not owned capability — **deleted**.
- ~14 write methods → subsumed by `create`/`update`/`transition` + the two validated state
  machines.
- Arg/opt types `TransitionBetStatusArgs`, `TransitionTaskStateArgs`, `ListTasksOpts`,
  `SetArtifactPreviewOutcome`, per-op patch variants — **deleted** with their methods.
- Five scattered DI-port interfaces + ~10 DTOs → **collapsed** into one `WorkDeps` bundle
  (DTOs relocated to `@hyperidle/shared`); no longer per-op product surface.

### Every current user feature still deliverable (lossy check)
- "Bets in `review` for team X since Y" → `list("bet", {teamId, status:"review", createdSince})`.
- "Global bet text search" → `list("bet", {text})`. "Count bets by team+status" →
  `list("bet", {teamId, status, count:true})`.
- "Bet-detail tasks with latest session outcome" → `list("task", {betId, include:"latestSessionOutcome"})`.
- "Queued items since cutoff" / "retro dedupe probe" / "reasoning-marker probe" → `list("item", {…})`.
- "Artifacts page for tasks" → `list("artifact", {taskIds, cursor, limit, include:"taskTitle"})`.
- "Log a task note atomically" → `update("task", id, {notes:{appendNote}})`; "accrue bet cost" →
  `update("bet", id, {costActualMinor:{increment}})`.
- "Advance a bet/task through its lifecycle" → `transitionBet`/`transitionTask` (validated).
- "Kill a bet + cascade", "decompose a new bet", "unblock dependents", "route an item",
  "read a task's risk tier" → the 9 named capabilities. Full coverage, zero fragmentation.

### Inside-out evolvability
- Table ACL preserved: the 5 tables stay private; the generics are the only door. A new
  column or filter key = one line in the shared query builder, **0 new exports**.
- New guarded write of any owned table → `transition(entity, {guard, patch})`, **0 new exports**.
- N new consumers add O(1) (usually 0) methods — they compose the generics + capabilities.

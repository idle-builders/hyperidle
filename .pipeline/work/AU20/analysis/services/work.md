# `work` — Service-as-Product Audit (AU20)

**Layer:** core-api · **Owned tables:** `bets`, `tasks`, `items`, `artifacts`, `taskPlanningSignals`
**Current public exports:** 84 · **Target:** ~32

---

## 1. Existence / Consolidation Verdict — **STANDALONE**

`work` is the literal center of the product's process model. `bets`/`tasks`/`items`/`artifacts` are the nouns users and agents actually operate on; every other service reads or mutates them *through* `work`. The data confirms the pull: **14 consumer edges (12 distinct services), 51 requests** — the highest real demand in the graph, and `getTaskById` alone is requested by **10 of 14 consumers**. This is a genuine domain product, not table-ownership packaging.

Candidate-cluster hypothesis: neighbors `[]`. Nothing to fold in, nothing to dissolve into. I affirm **standalone** — but the boundary is sound while the *surface* is not: 84 exports for four tables is textbook over-fragmentation (a bespoke method carved per call site), defended in-code by the AU13 "each genuinely different mechanic gets its own named function" lore that this audit explicitly rejects.

**Not infra.** Though consumed by many services, `work` serves the end-user-facing process domain, not other services *as a platform*. It is core-api domain, not agent-orchestration/execution. `isInfraPlatform = false`.

(Adjacent note, out of scope: the `log_task` race bug lives in `tool-handlers`, not here.)

---

## 2. The Deliberate Target Public API

The domain is four entity families (Bet, Task, Item, Artifact) + a risk-tier extension read + a set of higher-order domain operations. The 84 exports collapse into **five generic repository primitives** (entity-parameterized), **a small set of domain operations**, and **one injected-deps bundle**.

### A. Generic repository primitives (entity-keyed generics over all 4 tables)

| Interface | Shape | Subsumes | Why it's a shared capability |
|---|---|---|---|
| **`get(exec, entity, id)`** | `get<E>(exec, E, id) → RowOf<E> \| undefined` | `getBetById`, `getTaskById`, `getItemById`, `getArtifactById` (4) | Full-row by-id is the single highest-demand operation (`getTaskById` = 10 callers). One method for all four tables. |
| **`list(exec, entity, filter)`** | `list<E>(exec, E, filter) → RowOf<E>[]` — filter = AND-composed `{ids?, teamId?, status?/state?, betId?, ownerAgentId?, threadId?, sourceAgentId?, text?, dependencyPattern?, marker?, createdSince?, cursor?, limit?, count?, include?}` | `listBets`, `listBetsByIds`, `listBetsByTeamAndStatus`, `countBetsByTeamAndStatus`, `searchBetsByText`, `listTasks`, `listTasksByIds`, `listHoldTasksWithDependencyPattern`, `listBetTasksWithLatestSessionOutcome`, `listItemsByThread`, `listQueuedItemsSince`, `listItemIdsBySourceAgent`, `findItemByReasoningMarker`, `findRetroItemByThreadIds`, `listArtifactsPage`, `listArtifactSummariesByTaskIds` (16) | Every current list/find/count is one predicate over an owned table. A parameterized filter absorbs them all; `count:true` returns a count, `include:"taskTitle"`/`"latestSessionOutcome"` carries the owned-primary join enrichment. This is the north-star `list(filter)`. |
| **`create(exec, entity, values)`** | `create<E>(exec, E, values)` | `createBet`, `createTask`, `createItem`, `createArtifact` (4) | Insert is identical across tables. |
| **`update(exec, entity, id, patch)`** | `update<E>(exec, E, id, patch)` — patch supports `{increment}` for atomic accumulators | `updateBetById`, `updateTaskById`, `updateItemById`, `incrementBetCost` (4) | Plain by-id field set. `incrementBetCost`'s `coalesce(...)` becomes an internal `{costActualMinor:{increment}}` patch translation — the column ref stays private, the method disappears. |
| **`transition(exec, entity, spec)`** | `transition<E>(exec, E, {id?, guard, patch}) → {applied, affected}` — guard = `{field, equals}` \| `{field, isNull}`; `id`-less form is a bulk sweep | `transitionBetStatus`, `transitionTaskState`, `claimBetDecomposition`, `updateBetDecompositionStatusIfRunning`, `resolveOrphanedBetDecompositions`, `setArtifactPreviewIfAbsent` (6) | One guarded-CAS primitive parameterized by predicate. Callers that throw on `!applied` do so at their site (already the pattern); silent-no-op callers ignore it; the boot sweep uses the `id`-less form; artifact preview uses `{field:"previewJson", isNull:true}`. |

### B. Domain operations (genuine higher-order capabilities, kept)

| Export | Why kept |
|---|---|
| `transitionBet` / `updateBetField` | Bet state machine — validation + capacity check + revision log + event. The **public** bet-transition surface. |
| `transitionTask` | Task state machine — validation + audit entry + dispatch-attempt + event. The **public** task-transition surface. |
| `cascadeBetKill` | Downward kill propagation across tasks/sessions. |
| `runBetDecomposition` | Decomposition entry/test seam. |
| `registerBetDecomposition` | Boot event-bus subscriber wiring. |
| `resolveOrphanedDecompositions` | Boot crash-recovery sweep. |
| `routeItem` | Pure item-routing function. |
| `getTaskRiskTier` | `taskPlanningSignals` extension read (via `TaskRiskTierReader` port). |

**Made internal** (not product surface): `transitionBetStatus`/`transitionTaskState` (raw CAS — see collapse #3), `findEligibleTeamAgents`, `insertProposedBetTasks` (decomposition helpers exported only for tests — test through the public entry per the "tests never entry points" rule).

### C. Vocabulary + injection

- **Domain types (kept):** `Bet`, `Task`, `Item`, `ArtifactRow`, generic `Patch<E>` + `Filter<E>`, `RevisionLogEntry`, `TaskAuditEntry`/`StateTransitionAuditEntry`/`HandoffAuditEntry`, `InvalidTransitionError`, `VALID_TRANSITIONS`. (`TransitionBetStatusArgs`/`TransitionTaskStateArgs`/`SetArtifactPreviewOutcome`/`ListTasksOpts` disappear with their methods.)
- **Injected deps → one `WorkDeps` bundle:** `AgentWorkIntentRecorder`, `AgentSelectionDefaults`, `CostCapChecker`, `UserStoreReader`, `TeamCapacityReader` (+ their DTOs) are *inbound* wiring contracts — what `work` needs, not what it offers. Bundle into one `WorkDeps` wired once at `server-factory.ts`; push transport DTOs (`WorkSelectionCandidate`, `WorkDecompositionPlan`, cost/user rows) toward `@hyperidle/shared` where they're already shaped.

**Target export count: ~32** (≈14 functions + ≈10 domain types + ≈8 injection-contract types), down from 84. The *product* surface a caller invokes shrinks from ~48 functions to ~14.

---

## 3. Inside Lens (clean / evolvable)

- **Table ACL preserved.** `bets`/`tasks`/`items`/`artifacts`/`taskPlanningSignals` stay private; the five generic primitives are the only door. A new column or filter key is a one-line change to the shared query builder — not a new file + export + test triad (which is exactly what produced the 84).
- **One CAS primitive, two state machines.** `transitionBet`/`transitionTask` own their `VALID_TRANSITIONS` + validation and both call the single internal guarded-`transition`. Raw CAS never leaks, so no consumer can skip validation.
- **Deps in one place.** `WorkDeps` bundles the five injected ports; the composition root wires once, and the against-grain edges (`session-requests`/`agent-selection`/`cost`, ruled permanent in AU19) live behind that one seam.
- **Events stay at the domain boundary** (state machines + decomposition), not at repository primitives.

---

## 4. Scaling Argument (sub-linear)

**Test: add dozens more services and hundreds more calls — do we need hundreds more methods? No.**

- "Bets in `review` for team X since Y" → `list("bet", {teamId, status:"review", createdSince})` — **0 new exports**.
- "Items of kind Z" → add a `kind` key to `Filter` — one filter key, still **0 new methods**, and every future kind-query reuses it.
- "Claim a task for handoff" (new guarded write) → `transition("task", {id, guard:{field:"state",equals:"accepted"}, patch})` — **0 new exports**.
- New entity read/write of any of the four tables → composes from `get`/`list`/`create`/`update`/`transition` unchanged.

Contrast today's method-per-intent trajectory: each new predicate spawned `listBetsByTeamAndStatus`, then `listHoldTasksWithDependencyPattern`, then `findRetroItemByThreadIds`, then `listItemIdsBySourceAgent`… — linear method growth per use case. The parameterized `list(filter)` / `transition(guard)` absorb new use cases as *data* (occasionally a new filter key, shared by all future callers), so N new consumers add O(1) — usually zero — exports.

---

## 5. Key Collapses

1. **Reads: ~19 → 2.** Four `get*ById` + 14 `list*/find*/count*` + join reads collapse into `get(entity,id)` + `list(entity,filter)`. `getTaskById`'s 10 callers prove the general read *is* the real demand; the per-caller list variants were catering, not serving.
2. **Bet writes: 6 → folded into 2 primitives.** `updateBetById` + `incrementBetCost` + `transitionBetStatus` + `updateBetDecompositionStatusIfRunning` + `claimBetDecomposition` + `resolveOrphanedBetDecompositions` become `update` (with `{increment}` patch) + `transition` (with `{field,equals}`/`{field,isNull}`/`id`-less sweep).
3. **Raw CAS made internal; policy stops bypassing validation.** `transitionBetStatus`/`transitionTaskState` (today consumed *directly* by `policy`, skipping the state machine) become internal; the public transition surface is the validated `transitionBet`/`transitionTask`. Coherence win + two fewer exports + closes a real inside-coherence hazard.
4. **`create*`×4 → 1**; the four scattered DI ports + per-op deps → one `WorkDeps` bundle wired once.
5. **Decomposition test-only helpers internalized.** `findEligibleTeamAgents` + `insertProposedBetTasks` (exported only for tests) go internal; public decomposition = `registerBetDecomposition` + `resolveOrphanedDecompositions` + the `runBetDecomposition` seam.

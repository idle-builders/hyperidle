# work — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

| Row / artifact | Old verdict | New verdict | Ruling |
|---|---|---|---|
| `checkAndUnblockDependents` (row 4) | DELETE | **FINISH** | A6 — tasks carry a dependency tree; finishing unblocks dependents and moves them into progress. The watcher is the right machinery; the writer is what's missing. |
| `tasks.dependencies` column | DELETE (kill #1) | **KEEP** | A6 — it is the tree. Writer to be built. |
| `task_state_changed` subscriber wiring (`app.ts:527`) | DELETE (kill #1) | **KEEP** | A6 — it is the trigger of the finished feature. |
| `list` `dependencyId` branch (`work-service.ts:464`) + `WorkFilter.dependencyId` | DELETE (inside kills #1/#7) | **KEEP** | A6 — it is the watcher's pre-filter. Rows 15/16 and `WorkFilter` stay SIMPLIFY but their kill-scope shrinks by this branch. |
| `getTaskRiskTierByTaskId` (row 6) + `task_planning_signals` + review port member + gate | DELETE | **DELETE — founder-confirmed** | A2. Unchanged. |
| Phantom `item_created` emit in `updateBetField` (kill #5) | DELETE | **DELETE — survives Ruling-2 recheck** | Ruling 2 protects event types whose emission is missing. This is the inverse: an emission whose fact is missing. No items row exists for the fabricated `review-${betId}-${Date.now()}` id — on an extension surface a false announcement is worse than none, because a plugin trigger would act on an item that isn't there. The `item_created` event TYPE stays (live elsewhere); only this lying emission dies. If done-condition-change review is wanted, it is the A2-shaped ceremony the founder just confirmed dead. |
| `dependency_met` event type | (not in my surface — noted) | **KEEP, emission to be added** | Ruling 2. Where to emit: see build section below. |

**Ruling 1 recheck (shared backend):** swept every row for single-user reasoning. None of my kills rest on it. The write-only ledgers (`revisionLog`/`auditTrail`) die for zero readers — a table with no read surface is dead at any user count, and the founder said these findings stand. `teamId` scoping in `list`, `ownerAgentId` filters, and the `Bet`/`Task` row types already survive as KEEP — the work service takes identity (`teamId`, `ownerAgentId`) as data and never authenticates; OIDC lands upstream of it. No row moves.

**Ruling 3 recheck (knowledge ritual → plugin):** the only ritual-shaped traffic touching this package is retro routines reaching the generic `create` door (row 17). The ritual lives in routine/knowledge surfaces, not here; `create` is the machinery of working and stays regardless of where the retro plugin lands. **Zero PLUGIN rows in `work`.**

**Row deltas:** 1 verdict flipped (DELETE→FINISH), 3 rows keep their verdict letter with shrunken kill-scope (rows 15, 16, `WorkFilter`), 2 non-row artifacts flipped DELETE→KEEP (column, subscriber wiring), 1 DELETE founder-confirmed, 1 DELETE re-justified under Ruling 2.

### What must be built for the task dependency tree (A6 = FINISH)

The watcher body is essentially right already. What's missing is the writer, a gate, and one event emission:

1. **Tree shape.** `tasks.dependencies` (`framework/db/src/schema.ts:219`) stays a JSON text array of task ids on the *dependent* row — each child lists its parents. That edge-list is a DAG; sufficient. Keep the JSON-quoted LIKE pre-filter with `ESCAPE` (`work-service.ts:464`) — it is the reason the watcher doesn't scan the table.

2. **Writers — three doors, all currently missing the field:**
   - `POST /api/tasks` (`layers/core-api/src/routes/tasks.ts:97`): `createTaskSchema` gains optional `dependencies: string[]`; route validates every id is an existing task **in the same bet**, no self-reference, no duplicates; `work.create` writes the column.
   - `create_task` agent tool (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:605`): schema gains optional `dependencies`; flows through the same route via `ports.coreApi.createTask` — `CreateTaskRequest` on the seam gains the field. This is the primary writer: agents decomposing work is where trees come from now that bet-decomposition is gone.
   - `PATCH /api/tasks/:id` (`routes/tasks.ts:197`): `updateTaskSchema` gains `dependencies` so the tree can be rewired after creation.
   - **Cycle guard at write time:** walk the bet's tasks (bounded set) and reject a write that closes a cycle. Not paranoia — a cycle parks every member in `hold` forever with no event that can ever free them.

3. **Hold gate at accept time — the real missing half.** Today `transitionTask` dispatches on `toState === "accepted" && ownerAgentId` (`task-state-machine.ts:131`) with zero dependency check: an accepted dependent would start its agent before its dependencies finish. Build: inside the accept transition, read the dependency rows; if any is not `done`, skip the dispatch block and CAS the task on to `hold` (legal edge: `accepted → hold`). The dep-read and the hold-write must serialize against the dependency's own done-CAS (same-tx or ordered CAS) so a dependency finishing concurrently can't strand the task in `hold` with the watcher's trigger already fired.

4. **"Move into progress" against the existing state machine** (checked: `framework/domain-model/src/task-transition.ts`). The grammar has **no `hold → in_progress` edge**, and `in_progress` has exactly one production writer: the `session_started` reaction (`layers/core-api/src/services/work-session-started-reactions.ts:72`) doing `accepted → in_progress`. So "unblock and move into progress" is not a new transition — it is the existing chain: watcher does `hold → accepted` (as today, `task-state-machine.ts` dispatch fires because `ownerAgentId` is set), the accepted branch bakes a `task_run` intent, the drain dispatches, the session starts, the reaction flips `accepted → in_progress`. **For agent-owned tasks the ruling's behavior is emergent once the writer + gate exist.** For a task with no `ownerAgentId` there is no session to start: it lands in `accepted` for a human to pick up — do not fake `in_progress` with no worker attached.

5. **`dependency_met` emission (Ruling 2).** `DependencyMetEvent` (`framework/domain-model/src/events.ts:317`) is `{taskId, dependencyId}` — a per-edge fact. Emit it from `checkAndUnblockDependents`, once per candidate the pre-filter matches, **before** the all-done check: "one of your dependencies is met" happens per edge even when other edges remain open. Dispatcher case already exists (`layers/core-api/src/observability/dispatcher.ts:409`). Keep the existing `auto_unblock` ambient notification emit on the actual unblock — different fact, different event.

---

## Should this service exist?

**KEEP AS the bet/task state machines plus the sole table path for `bets`/`tasks`/`items`/`artifacts` — now including the dependency tree.**
Bets and tasks are the process primitive — this is one of the few services whose core is real, and after A6 the dependency watcher joins that core instead of dying. The core is still wrapped in ceremony: two write-only audit ledgers, a risk-tier reader over a table nothing writes (A2-confirmed dead), two error classes nothing catches, a DI bundle nothing constructs, and ~9 dead branches inside the generic primitives. The genuine shape is about eleven callables. Everything else dies.

## If written today, from scratch

Against the corrected premise — a shared backend serving a team and an organisation of teams, identity from OIDC upstream (this service takes `teamId`/`ownerAgentId` as data and never authenticates — correct as-is), and an event stream plugins hang off (every state change already emits; the one missing emission is `dependency_met`):

- `get(exec, entity, id)` / `list(exec, entity, filter)` — the read path (filter cut to keys with real doors, `dependencyId` now among them)
- `create(exec, entity, values)` / `update(exec, entity, id, patch)` — the write path (incl. atomic note append; `dependencies` becomes writable)
- `transition(exec, entity, {id, guard, patch})` — single-row CAS, four guard shapes, no sweep, no `affected`
- `transitionBet` / `transitionTask` — the two state machines: validate, CAS, emit; `transitionTask` gains the dependency hold-gate. No revision log, no audit blob.
- `checkAndUnblockDependents` — the dependency watcher: pre-filter, all-done check, `hold → accepted`, emit `dependency_met` + `auto_unblock`
- `cascadeBetKill` — kill bet → kill tasks → stop runs. No propagation-log hops.
- `resolveTaskRunRequest` — one emit-time resolver baking both `task_run` and `session_start`
- `taskDispatchAttemptStore` — the dispatch-attempt ledger (insert/get/settle/reap; no ordinal, no occasion)

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 9 |
| PLUGIN | 0 |
| FINISH | 1 |
| MERGE | 5 |
| SIMPLIFY | 14 |
| KEEP | 17 |

Surface: 16 callables (21 fn rows + 2 classes + 1 const) → 11 callables (31% callable cut); of 22 type
declarations, 6 die and 2 merge. On top of that, ~9 dead branches inside surviving functions and 6
write-only DB columns plus one whole table (`task_planning_signals`, A2-confirmed) go. `tasks.dependencies`
leaves the kill list.

KEEP looks high only because the input counts every overload row of `get`/`update`/`list` and every
one-line row-type alias (`Bet`/`Task`/`Item`) as its own row. Deduped, only four callables survive
untouched: `get`, `create`, `update`, and the artifacts-page `list` overload.

## Feature-level verdicts

1. **Task dependency tree — FINISH (was: DELETE). Founder ruling A6.**
   The first-wave diagnosis stands as fact: `tasks.dependencies` has zero production writers since
   bet-decomposition died, so `checkAndUnblockDependents` has never fired. The verdict reverses: the
   watcher, the column, the `dependencyId` pre-filter branch, and the `app.ts:527` subscriber are the
   right half of a feature whose writer half must be built. Full build spec in "What must be built for
   the task dependency tree" above. Add the missing `dependency_met` emission while in there (Ruling 2).

2. **Task risk tier is a reader over a table nothing writes — DELETE. Founder-confirmed (A2).**
   `task_planning_signals` has zero production writers; `getTaskRiskTierByTaskId` always returns `null`;
   `review`'s `session-review-creator.ts:65` gate has never passed. Kill: the function, the table,
   `review`'s `getRiskTierByTaskId` port member, and the riskTier gate in session-review-creator.
   Automatic post-session review for risky tasks HAS NEVER WORKED in production; the founder has now
   ruled the concept itself dead, so no rebuild question remains. (Distinct from `items.riskTier`, which is live.)

3. **Two write-only audit ledgers — DELETE both columns and all append machinery. Stands; not softened.**
   `bets.revisionLog` and `tasks.auditTrail` are appended to by six writers and displayed by NOTHING —
   zero reads in `applications/` or `layers/core-ui/` outside e2e assertions. Rechecked under Ruling 1:
   a multi-human team makes "who changed this" *conceivable*, but conceivable is not a reader — no UI,
   no API consumer, ~20 waves without a look. Dead is still dead. Kill both columns, `task-audit.ts`
   entirely, `RevisionLogEntry`, the parse/append helpers in `bet-state-machine.ts`, the audit block in
   `routes/tasks.ts` PATCH, and policy's two local mirror unions. The CAS transactions survive —
   racing-writer correctness, not audit. If a team ever wants change history, build a read surface
   first, then a writer.

4. **cascadeBetKill's propagation-log hops — SIMPLIFY. Stands.**
   Only reader of `status:"applied"` rows is the reaper. Kill the `policy` port member of
   `BetKillCascadeDeps` and `writeCascadeRow`. The kill cascade itself is core and stays.

5. **Phantom done_condition review emit — DELETE. Survives Ruling-2 recheck.**
   `updateBetField` emits `item_created` with a fabricated `itemId` for which no items row exists;
   both subscribers no-op on `getItemById`. Ruling 2 protects a true fact with a missing announcement;
   this is a false announcement of a fact that never happens — poison for an extension surface. The
   `item_created` TYPE stays; this emission dies. The underlying "auto-review on done-condition change"
   concept is A2-shaped ceremony the founder confirmed dead.

6. **Resolver ceremony — MERGE the two resolvers, DELETE the optional-deps theater and both error classes. Stands.**
   `resolveSessionStartRequest` is `resolveTaskRunRequest` minus the attempt lookup and contextBundle.
   One resolver, discriminated input. All five "optional" deps members are wired at every real call
   site — make them required, delete every degrade branch. Neither error class is caught anywhere —
   throw plain `Error`.

7. **Dead interior of the generic primitives — SIMPLIFY `list`/`transition`. Stands, minus one branch.**
   Confirmed-dead branches: task count, item count, item `ids`, artifact `ids`, artifact bare-`taskIds`
   plain list, bare item list, bare artifact list, the id-less bulk-sweep path of `transition()`, the
   `affected` return field, and the `isNull` guard for bet.status / task.state. **`dependencyId` leaves
   this kill list** (A6 — it is the watcher's pre-filter). `marker`/`bodyMarker`/`queued` stay — live
   doors — but each is a find-one disguised as a list; still flagged for the routine track.

8. **`WorkDeps` / `UserStoreReader` / `WorkUserRow` — DELETE. Stands.**
   Zero references outside `work/src`; consumers (bet-decomposition, agent-assignment) were deleted.
   `TeamCapacityReader` and `AgentWorkIntentRecorder` survive as the two ports real code still injects.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `cascadeBetKill` | UI:POST /api/bets/:id/kill | SIMPLIFY | Kill cascade is core; the per-hop `propagation_log` writes are audit rows only the reaper ever touches — drop `deps.policy` + `writeCascadeRow`. |
| 2 | `transitionBet` | UI:POST /api/bets/:id/commit,/ship,/kill; SCHED:lifecycle-propagation 30s | SIMPLIFY | CAS + capacity + emit is core; the revisionLog parse/append machinery feeds a column nothing displays — delete it (kill #3). |
| 3 | `updateBetField` | UI:PATCH /api/bets/:id; AGENT:edit_bet | MERGE | Same guarded-field-set mechanic exists a second time inline in `bets.ts` — fold into ONE route-side patch path; delete the revision log and the false `item_created` emit (kills #3, #5 — the emit dies as a lying announcement, not as an event-type kill; Ruling 2 rechecked). |
| 4 | `checkAndUnblockDependents` | EVENT:task_state_changed (app.ts:527) — no-op today, writer to be built | **FINISH** | **A6 reversal.** The watcher is the right half of the dependency-tree feature; build the writers (`POST /tasks`, `create_task` tool, `PATCH /tasks/:id`), the accept-time hold-gate in `transitionTask`, and add the per-edge `dependency_met` emission (Ruling 2). Full spec in the build section. Column, pre-filter branch, and subscriber wiring all KEEP. |
| 5 | `resolveSessionStartRequest` | UI:POST /api/sessions/ | MERGE | Strict subset of `resolveTaskRunRequest`; its task-existence check duplicates the route's own 404 pre-read. One resolver, discriminated input (kill #6). |
| 6 | `getTaskRiskTierByTaskId` | BOOTSTRAP:service-bootstrap.ts:439 → review port — always returns null | DELETE | **A2 founder-confirmed.** Reads `task_planning_signals`, which nothing writes in production; the sole consumer gate has never passed. Kill function + table + port member + gate (kill #2). |
| 7 | `resolveTaskRunRequest` | UI:POST /api/tasks/:id/transition,/handoff; AGENT:handoff_to; SCHED:30s tick; EVENT:task_state_changed/session_started | SIMPLIFY | Core emit-time bake; make all five deps required, delete every optional-degrade branch, throw plain `Error`, absorb session-start (kill #6). |
| 8 | `transitionTask` | UI:POST /api/tasks/:id/transition,/kill(cascade); AGENT:handoff_to; SCHED:30s; EVENT:session_ended et al. | SIMPLIFY | CAS + dispatch + emit is core; drop the auditTrail append (kill #3), replace the inline dispatch-attempt insert with `taskDispatchAttemptStore.insertAttempt`. Gains the A6 dependency hold-gate at the accept branch (build section §3) — new behavior, same function. |
| 9 | `get` (artifact+taskTitle overload, :256) | UI:GET /api/artifacts/:id | KEEP | Core door: artifact detail with its producing task's title. |
| 10 | `get` (generic overload, :263) | UI:GET /api/tasks/:id, /api/bets/:id, + ~30 sites | KEEP | The get-by-id read primitive for all four owned entities. |
| 11 | `get` (impl, :268) | same as rows 9-10 | KEEP | Four `select ... where id` arms and one join; nothing to cut. |
| 12 | `list` (count overload, :304) | UI:GET /api/teams (teams-routes.ts:137,142) | SIMPLIFY | Only bet-count is ever called; task-count and item-count arms are dead — restrict count to bets. |
| 13 | `list` (artifact taskTitle overload, :310) | UI:GET /api/artifacts | KEEP | The artifacts page: cursor-paginated join, live door, single mechanic. |
| 14 | `list` (artifact taskSummary overload, :316) | UI:GET /api/bets/:id/artifact-thread-summary | MERGE | Second projection of the same join — fold into the taskTitle include; caller projects its four fields. `ArtifactTaskSummaryRow` dies with it. |
| 15 | `list` (generic overload, :322) | UI: /api/tasks, /api/bets, /api/search, /api/threads, conversations, teams; SCHED:digest sweep; EVENT:task_state_changed (watcher pre-filter) | SIMPLIFY | Live for real key combos; prune `WorkFilter` to keys with doors. **`dependencyId` stays** — it is the watcher's pre-filter (A6). Dead count semantics still go. |
| 16 | `list` (impl, :327) | same as rows 12-15 | SIMPLIFY | Delete confirmed-dead branches: item `ids`, artifact `ids`, artifact plain-`taskIds`, bare item, bare artifact, task/item count (kill #7). **The `dependencyId` branch at :464 is KEEP** (A6). `marker`/`bodyMarker`/`queued` stay — live doors; each still a find-one disguised as a list, flagged for the routine track. |
| 17 | `create` | UI:POST /api/bets, /api/tasks, /api/artifacts, /api/conversations/items; AGENT:create_item; SCHED:retro routines | KEEP | The insert primitive; all four entities reached through real doors. Gains `dependencies` writability (A6). Retro-routine traffic through this door is fine even when the retro ritual moves to a plugin (Ruling 3) — plugins call the same doors. |
| 18 | `update` (AppendNoteOp overload, :698) | AGENT:append-note tool via PATCH /api/tasks/:id/notes | KEEP | Atomic SQL-CASE note append with no pre-read — distinct mechanic, agent door. |
| 19 | `update` (generic overload, :711) | UI:PATCH /api/bets/:id, /api/tasks/:id, conversations items; EVENT:session_ended reactions | KEEP | The set-by-id write primitive. Gains `dependencies` patchability (A6). |
| 20 | `update` (impl, :717) | same as rows 18-19 | KEEP | Plain per-entity set; audit-blob patches vanish caller-side with kill #3. |
| 21 | `transition` | UI:PATCH /api/artifacts/:id/preview; via rows 2/8; SCHED via DI | SIMPLIFY | Single-row CAS is core; delete the id-less bulk-sweep path, the `affected` field, and the never-used `isNull` guards for bet.status/task.state (keep artifact.previewJson isNull and task.updatedAt equals). |
| — | `SessionStartSourceUnavailableError` | thrown UI:POST /api/sessions/ — caught nowhere | DELETE | Zero catch sites; the route already 404s the same condition. Throw `Error`. |
| — | `TaskRunSourceUnavailableError` | thrown via rows 7/8 — caught nowhere | DELETE | Zero catch sites; the class discriminates nothing. Throw `Error`. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ArtifactRow` | KEEP | Row type of the artifact primitive; tables private so the alias is load-bearing. Fold types-only `artifact-store.ts` into `work-service.ts`. |
| `ArtifactWithTaskTitle` | KEEP | The artifacts-page row shape (rows 9/13). |
| `ArtifactTaskSummaryRow` | DELETE | Dies with row 14's merge. |
| `BetKillCascadeDeps` | SIMPLIFY | Drop the `policy` member (kill #4). |
| `RevisionLogEntry` | DELETE | Revision-log feature dies (kill #3); its only external "consumer" declares a local mirror instead of importing. |
| `WorkDeps` | DELETE | Zero constructors, zero importers (kill #8). `UserStoreReader`/`WorkUserRow` die with it. |
| `SessionStartResolverDeps` | MERGE | Into `TaskRunResolverDeps` (kill #6). |
| `BakedSessionStartRequest` | MERGE | Strict subset of `BakedTaskRunRequest`; one baked-request type. |
| `StateTransitionAuditEntry` | DELETE | auditTrail dies (kill #3). |
| `HandoffAuditEntry` | DELETE | auditTrail dies; policy's writer appends to a blob nobody reads. |
| `TaskAuditEntry` | DELETE | Union of the two above; `task-audit.ts` deleted whole. |
| `TaskRunResolverDeps` | SIMPLIFY | All five members required — one fully-wired binding serves every emit site. |
| `BakedTaskRunRequest` | KEEP | The real seam contract: the intent payload the drain dispatches with zero domain reads. |
| `TaskStateMachineDeps` | KEEP | The two genuinely injected edges `transitionTask`/`cascadeBetKill`/`checkAndUnblockDependents` need — the FINISHED watcher keeps injecting both. |
| `Bet` | KEEP | Row alias; tables private. |
| `Task` | KEEP | Row alias; tables private. |
| `Item` | KEEP | Row alias; tables private. |
| `WorkEntity` | KEEP | The discriminant of the five primitives. |
| `WorkFilter` | SIMPLIFY | Prune to keys with doors — **`dependencyId` now has one** (the watcher, A6) and stays; restrict `count` to bets; delete the key→old-function legend comment. |
| `AppendNoteOp` | KEEP | The one real patch operator (row 18). |
| `TransitionGuard` | SIMPLIFY | Narrow to the four guard shapes with callers. |
| `TransitionSpec` | SIMPLIFY | Make `id` required — the id-less sweep form is dead (row 21). |

## Const / enum

| Declaration | Verdict | Reason |
|---|---|---|
| `taskDispatchAttemptStore` | SIMPLIFY | Core ledger — all five members have doors. Cut the write-only ceremony: `ordinal`, `occasion`, `predecessorSessionId` are columns with zero readers; `reapTerminal`'s `batchSize` param lies (no LIMIT in the DELETE) — drop it or actually batch. Becomes the single insert path once row 8's inline duplicate merges in. |

## Holes this leaves

- **No bet/task change history.** revisionLog/auditTrail gone. Rechecked under Ruling 1: still zero
  readers at any user count. If a team ever wants history, build a read surface first, then a writer.
- **Session reviews for risky tasks stay uncreated** — as they always were; A2 now confirms the concept
  itself is dead, so this is no longer an open question, just a removed lie.
- ~~Task dependencies stop existing as a concept~~ — **reversed by A6.** The hole is now the opposite:
  until the writers + hold-gate land, the tree exists but nothing populates or respects it. The build
  section above is the price.
- **No propagation-log trace of bet-kill cascades.** The kill still works and returns
  `tasksKilled`/`sessionsStopped`; only forensic rows nobody queried disappear.
- **Coarser errors from the resolvers.** Plain `Error` — nothing ever discriminated on the names.
- **One projection query replaced by caller-side mapping** (artifact-thread-summary) — trivially more
  bytes per bet, bounded by the existing task fan-out guard.
- **No `done_condition`-change review item.** The false `item_created` emit dies and nothing replaces
  it — by A2's own logic, correctly so.

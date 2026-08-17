# work — destroyer verdict

## Should this service exist?

**KEEP AS the bet/task state machines plus the sole table path for `bets`/`tasks`/`items`/`artifacts`.**
Bets and tasks are the process primitive — this is one of the few services whose core is real. But
that core is wrapped in ceremony: two write-only audit ledgers, a dependency-unblock feature nothing
can trigger, a risk-tier reader over a table nothing writes, two error classes nothing catches, a DI
bundle nothing constructs, and ~10 dead branches inside the generic primitives. The genuine shape is
about ten callables. Everything else dies.

## If written today, from scratch

- `get(exec, entity, id)` / `list(exec, entity, filter)` — the read path (filter cut to keys with real doors)
- `create(exec, entity, values)` / `update(exec, entity, id, patch)` — the write path (incl. atomic note append)
- `transition(exec, entity, {id, guard, patch})` — single-row CAS, three guard shapes, no sweep, no `affected`
- `transitionBet` / `transitionTask` — the two state machines: validate, CAS, emit. No revision log, no audit blob.
- `cascadeBetKill` — kill bet → kill tasks → stop runs. No propagation-log hops.
- `resolveTaskRunRequest` — one emit-time resolver baking both `task_run` and `session_start` (they differ only by the attempt lookup and contextBundle)
- `taskDispatchAttemptStore` — the dispatch-attempt ledger (insert/get/settle/reap; no ordinal, no occasion)

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 10 |
| MERGE | 5 |
| SIMPLIFY | 14 |
| KEEP | 17 |

Surface: 16 callables (21 fn rows + 2 classes + 1 const) → 10 callables (37% callable cut); of 22 type
declarations, 6 die and 2 merge. On top of that, ~10 dead branches inside surviving functions and 6
write-only DB columns plus one whole table (`task_planning_signals`) go.

KEEP looks high only because the input counts every overload row of `get`/`update`/`list` and every
one-line row-type alias (`Bet`/`Task`/`Item`) as its own row. Deduped, only four callables survive
untouched: `get`, `create`, `update`, and the artifacts-page `list` overload.

## Feature-level kills

1. **Dependency auto-unblock is a permanent production no-op — DELETE the feature.**
   `tasks.dependencies` is written by NOTHING: not the create-task route, not the PATCH route, not any
   agent tool, not any service (`rg '\bdependencies\b'` across all four roots: only `framework/db/src/schema.ts:219`
   and the watcher's own LIKE read at `work-service.ts:464`). The writer was bet-decomposition, which
   was hard-deleted. So `checkAndUnblockDependents`' pre-filter matches zero rows forever. Kill: the
   function, the `dependencyId` branch of `list()`, the `task_state_changed` subscriber wiring in
   `layers/core-api/src/app.ts:527` that calls it, and the `tasks.dependencies` column. **Breaks:**
   nothing observable — it has never fired since decomposition died. If task dependencies ever come
   back, rebuild the watcher with a writer, or don't rebuild it.

2. **Task risk tier is a reader over a table nothing writes — DELETE the feature.**
   `task_planning_signals` has zero production writers (its own file admits it: "no production writer
   anywhere in the repo yet"; confirmed — every insert is in `__tests__`). `getTaskRiskTierByTaskId`
   therefore always returns `null`, and `review`'s `session-review-creator.ts:65`
   (`if (riskTier !== "medium" && riskTier !== "high") return;`) always returns early. Kill: the
   function, the table, `review`'s `getRiskTierByTaskId` port member, and the riskTier gate in
   session-review-creator. **Breaks — and the founder must hear this loudly:** automatic post-session
   review creation for risky tasks HAS NEVER WORKED in production. Deleting the code changes zero
   behavior; the question to answer separately is whether that review path should exist at all, and if
   yes, something must actually write risk tiers. (Distinct from `items.riskTier`, which is live.)

3. **Two write-only audit ledgers — DELETE both columns and all append machinery.**
   `bets.revisionLog` and `tasks.auditTrail` are parsed, appended to, and re-serialized by six writers
   (`transitionBet`, `updateBetField`, `bets.ts` `patchAtRisk`/description helpers,
   `lifecycle-propagation`, `transitionTask`, `handoff-protocol`) and displayed by NOTHING — zero reads
   in `applications/` or `layers/core-ui/` outside e2e assertions. This is ETHOS's named smell: an
   audit trail nobody reads. Kill both columns, `task-audit.ts` entirely, `RevisionLogEntry`, the
   parse/append helpers in `bet-state-machine.ts`, the audit block in `routes/tasks.ts` PATCH
   (outcomeVerdict), and policy's two local mirror unions. Note the CAS transactions survive — the
   compare-and-set guard is racing-writer correctness, not audit. **Breaks:** no change history for
   bets/tasks; the L14 e2e asserting `actor` in revisionLog dies with it. Nobody has looked at this
   data through ~20 waves of work.

4. **cascadeBetKill's propagation-log hops are audit rows nobody reads — SIMPLIFY.**
   The cascade writes `propagation_log` rows with `status:"applied"`. The only functional reader of
   that table selects `status = "pending_retry"` (`lifecycle-propagation.ts:622`); "applied" rows are
   only ever reaped (`:243`). Kill the `policy` port member of `BetKillCascadeDeps` and
   `writeCascadeRow`. The kill cascade itself (tasks killed, runs stopped) is core and stays.

5. **Phantom done_condition review — SIMPLIFY `updateBetField`.**
   It emits `item_created` with a fabricated `itemId: review-${betId}-${Date.now()}` for which no items
   row exists. Both subscribers (`policy-engine.ts:69`, `notifications/install.ts:1391`) do
   `getItemById(...); if (!item) return;` — guaranteed no-op. Delete the emit.

6. **Resolver ceremony — MERGE the two resolvers, DELETE the optional-deps theater and both error classes.**
   `resolveSessionStartRequest` is `resolveTaskRunRequest` minus the attempt lookup and contextBundle;
   `BakedSessionStartRequest` is a strict subset of `BakedTaskRunRequest`. One resolver serves both.
   All five "optional — absent at a call site not yet wired" deps members are wired at every real call
   site (there is exactly ONE deps object, `task-run-resolver-bindings.ts`, and `sessions-routes.ts`
   wires all three) — make them required, delete every degrade branch. Neither
   `SessionStartSourceUnavailableError` nor `TaskRunSourceUnavailableError` is caught anywhere
   (`rg` across all roots: zero imports outside this package) — throw plain `Error`.

7. **Dead interior of the generic primitives — SIMPLIFY `list`/`transition`.**
   Confirmed-dead branches (every production call site of both functions enumerated above): task count,
   item count, item `ids`, artifact `ids`, artifact bare-`taskIds` plain list, bare item list, bare
   artifact list, `dependencyId` (kill #1), the id-less bulk-sweep path of `transition()`, the
   `affected` return field (zero readers), and the `isNull` guard for bet.status / task.state. Delete
   them all. The generic entity-switch shape itself was AU20's own flagged risk: `WorkFilter` is 21
   optional keys with silent cross-entity ignore and if/else precedence the type system can't see. The
   branch cut plus per-entity key pruning is the honest fix short of re-splitting into named functions.

8. **`WorkDeps` / `UserStoreReader` / `WorkUserRow` — DELETE.**
   Zero references outside `work/src` (nothing constructs `WorkDeps`; the barrel export has no
   importer). Their consumers (bet-decomposition, agent-assignment) were deleted; the bundle outlived
   every member's purpose. `TeamCapacityReader` and `AgentWorkIntentRecorder` survive as the two ports
   real code still injects.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `cascadeBetKill` | UI:POST /api/bets/:id/kill | SIMPLIFY | Kill cascade is core; the per-hop `propagation_log` writes are audit rows only the reaper ever touches — drop `deps.policy` + `writeCascadeRow`. |
| 2 | `transitionBet` | UI:POST /api/bets/:id/commit,/ship,/kill; SCHED:lifecycle-propagation 30s | SIMPLIFY | CAS + capacity + emit is core; the revisionLog parse/append machinery feeds a column nothing displays — delete it (kill #3). |
| 3 | `updateBetField` | UI:PATCH /api/bets/:id; AGENT:edit_bet | MERGE | Same guarded-field-set mechanic exists a second time inline in `bets.ts` (`patchAtRisk` + description helper) — fold into ONE route-side patch path; delete the revision log and the phantom `item_created` emit (kills #3, #5). |
| 4 | `checkAndUnblockDependents` | EVENT:task_state_changed (app.ts:527) — permanent no-op | DELETE | `tasks.dependencies` has zero production writers since bet-decomposition died; the LIKE pre-filter matches nothing, forever. Kill function, subscriber wiring, column (kill #1). |
| 5 | `resolveSessionStartRequest` | UI:POST /api/sessions/ | MERGE | Strict subset of `resolveTaskRunRequest` (no attempt, no contextBundle); its task-existence check even duplicates the route's own 404 pre-read at `sessions-routes.ts:131`. One resolver, discriminated input (kill #6). |
| 6 | `getTaskRiskTierByTaskId` | BOOTSTRAP:service-bootstrap.ts:439 → review port — always returns null | DELETE | Reads `task_planning_signals`, which nothing writes in production; the sole consumer gate (`session-review-creator.ts:65`) has never passed. Kill function + table + port member (kill #2). |
| 7 | `resolveTaskRunRequest` | UI:POST /api/tasks/:id/transition,/handoff; AGENT:handoff_to; SCHED:30s tick; EVENT:task_state_changed/session_started | SIMPLIFY | Core emit-time bake; make all five deps required (exactly one fully-wired deps object exists), delete every optional-degrade branch, throw plain `Error`, absorb session-start (kill #6). |
| 8 | `transitionTask` | UI:POST /api/tasks/:id/transition,/kill(cascade); AGENT:handoff_to; SCHED:30s; EVENT:session_ended et al. | SIMPLIFY | CAS + dispatch + emit is core; drop the auditTrail append (kill #3) and replace the inline dispatch-attempt insert (lines 131-146) with `taskDispatchAttemptStore.insertAttempt` — it is a line-for-line duplicate in the same file. |
| 9 | `get` (artifact+taskTitle overload, :256) | UI:GET /api/artifacts/:id | KEEP | Core door: artifact detail with its producing task's title; single join, single caller shape. |
| 10 | `get` (generic overload, :263) | UI:GET /api/tasks/:id, /api/bets/:id, + ~30 sites across routes/bindings | KEEP | The get-by-id read primitive for all four owned entities — minimal honest shape. |
| 11 | `get` (impl, :268) | same as rows 9-10 | KEEP | Four `select ... where id` arms and one join; nothing to cut. |
| 12 | `list` (count overload, :304) | UI:GET /api/teams (teams-routes.ts:137,142) | SIMPLIFY | Only bet-count is ever called; the task-count and item-count arms are dead — restrict count to bets, delete the other two arms. |
| 13 | `list` (artifact taskTitle overload, :310) | UI:GET /api/artifacts | KEEP | The artifacts page: cursor-paginated join, live door, single mechanic. |
| 14 | `list` (artifact taskSummary overload, :316) | UI:GET /api/bets/:id/artifact-thread-summary | MERGE | A second projection of the same `artifacts ⋈ tasks` join — fold into the taskTitle include and let the one caller (bets.ts:1039) project its four fields. `ArtifactTaskSummaryRow` dies with it. |
| 15 | `list` (generic overload, :322) | UI: /api/tasks, /api/bets, /api/search, /api/threads, conversations, teams; SCHED:digest sweep | SIMPLIFY | Live for real key combos; prune `WorkFilter` to keys with doors (drop `dependencyId`, dead count semantics). |
| 16 | `list` (impl, :327) | same as rows 12-15 | SIMPLIFY | Delete confirmed-dead branches: item `ids`, artifact `ids`, artifact plain-`taskIds`, bare item, bare artifact, `dependencyId`, task/item count (kill #7). `marker`/`bodyMarker`/`queued` stay — live LIKE-dedup doors (conversations.ts:114, knowledge.ts:306, routine bindings:71,95, digest sweep) — but each is a find-one disguised as a list; flag for the routine track. |
| 17 | `create` | UI:POST /api/bets, /api/tasks, /api/artifacts, /api/conversations/items; AGENT:create_item; SCHED:retro routines | KEEP | The insert primitive; all four entities reached through real doors. |
| 18 | `update` (AppendNoteOp overload, :698) | AGENT:append-note tool (tool-definitions.ts:1482) via PATCH /api/tasks/:id/notes | KEEP | Atomic SQL-CASE note append with no pre-read — a genuinely distinct mechanic with an agent door. |
| 19 | `update` (generic overload, :711) | UI:PATCH /api/bets/:id, /api/tasks/:id, conversations items; EVENT:session_ended reactions | KEEP | The set-by-id write primitive for three entities. |
| 20 | `update` (impl, :717) | same as rows 18-19 | KEEP | Plain per-entity set; the audit-blob patches vanish caller-side with kill #3, impl unchanged. |
| 21 | `transition` | UI:PATCH /api/artifacts/:id/preview; via rows 2/8; SCHED via DI (`transitionBetStatus`/`transitionTaskState` bindings) | SIMPLIFY | Single-row CAS is core; every caller passes `id` and reads only `applied` — delete the id-less bulk-sweep path, the `affected` field, and the never-used `isNull` guards for bet.status/task.state (keep artifact.previewJson isNull and task.updatedAt equals — both have doors). |
| — | `SessionStartSourceUnavailableError` | thrown UI:POST /api/sessions/ — caught nowhere | DELETE | Zero catch sites in the repo; the route already 404s on the same condition before calling the resolver. Throw `Error`. |
| — | `TaskRunSourceUnavailableError` | thrown via rows 7/8 — caught nowhere | DELETE | Zero catch sites; the class discriminates nothing. Throw `Error`. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ArtifactRow` | KEEP | Row type of the artifact primitive; tables are private so the alias is load-bearing. Fold types-only `artifact-store.ts` into `work-service.ts` — the file has zero functions left. |
| `ArtifactWithTaskTitle` | KEEP | The artifacts-page row shape (rows 9/13). |
| `ArtifactTaskSummaryRow` | DELETE | Dies with row 14's merge — its one consumer projects from `ArtifactWithTaskTitle`. |
| `BetKillCascadeDeps` | SIMPLIFY | Drop the `policy` member (kill #4); shrinks to `TaskStateMachineDeps` + `runOrchestration`. |
| `RevisionLogEntry` | DELETE | The revision-log feature dies (kill #3); its only external "consumer" (lifecycle-propagation) already declares a local mirror instead of importing — the export was dead even before the kill. |
| `WorkDeps` | DELETE | Zero constructors, zero importers anywhere (kill #8). `UserStoreReader`/`WorkUserRow` inside `ports.ts` die with it. |
| `SessionStartResolverDeps` | MERGE | Into `TaskRunResolverDeps` with the resolver merge (kill #6). |
| `BakedSessionStartRequest` | MERGE | Strict subset of `BakedTaskRunRequest`; one baked-request type. |
| `StateTransitionAuditEntry` | DELETE | auditTrail dies (kill #3). |
| `HandoffAuditEntry` | DELETE | auditTrail dies; policy's writer appends to a blob nobody reads — kill its append too. |
| `TaskAuditEntry` | DELETE | Union of the two above. `task-audit.ts` deleted whole. |
| `TaskRunResolverDeps` | SIMPLIFY | All five members required — the "not yet wired" call site does not exist; one fully-wired binding serves every emit site. |
| `BakedTaskRunRequest` | KEEP | The real seam contract: the intent payload the drain dispatches with zero domain reads. Door: the whole task_run/session_start admission path. |
| `TaskStateMachineDeps` | KEEP | The two genuinely injected edges (`workIntents` — ruled-permanent same-tx port; `taskRunResolver`) that `transitionTask`/`cascadeBetKill` need. |
| `Bet` | KEEP | Row alias; tables private. |
| `Task` | KEEP | Row alias; tables private. |
| `Item` | KEEP | Row alias; tables private. |
| `WorkEntity` | KEEP | The discriminant of the five primitives. |
| `WorkFilter` | SIMPLIFY | Prune to keys with doors: drop `dependencyId` (kill #1), restrict `count` to bets, and delete the key→old-function legend comment — a filter bag that needs a translation table is documenting its own wrong altitude. |
| `AppendNoteOp` | KEEP | The one real patch operator (row 18). |
| `TransitionGuard` | SIMPLIFY | Narrow to the four guard shapes with callers: bet.status equals, task.state equals, task.updatedAt equals, artifact.previewJson isNull. |
| `TransitionSpec` | SIMPLIFY | Make `id` required — the id-less sweep form is dead (row 21). |

## Const / enum

| Declaration | Verdict | Reason |
|---|---|---|
| `taskDispatchAttemptStore` | SIMPLIFY | Core ledger — all five members have doors (`insertAttempt` AGENT:handoff_to via policy-bindings:83; `get` internal to row 7; `updateIfActive` EVENT:session_ended; `markFailed` EVENT:agent_run_admission_failed; `reapTerminal` SCHED:retention reaper). Cut the write-only ceremony: `ordinal` (the count-then-insert exists solely to compute a number nothing reads), `occasion`, and `predecessorSessionId` are columns with zero readers; `reapTerminal`'s `batchSize` param is a lie — the DELETE has no LIMIT, it deletes everything and then reports `min(count, batchSize)`. Drop the param or actually batch. Also becomes the single insert path once row 8's inline duplicate merges in. |

## Holes this leaves

- **No bet/task change history.** revisionLog/auditTrail are gone. Today nobody can see them anyway —
  no UI, no API consumer renders them. If history is ever wanted, build a read surface first, then a writer.
- **Session reviews for risky tasks stay uncreated** — but they already are: the riskTier gate has
  never passed in production. Deleting makes the truth visible instead of latent. The founder should
  decide whether the auto-review-on-risky-task concept is worth a real writer, as its own story.
- **Task dependencies stop existing as a concept.** Nothing can express "task B waits on task A"
  anymore. Nothing could trigger it before either — the writer died with bet-decomposition.
- **No propagation-log trace of bet-kill cascades.** The kill still works and returns
  `tasksKilled`/`sessionsStopped` to the route; only the forensic rows nobody queried disappear.
- **Coarser errors from the resolvers.** Plain `Error` instead of named classes — acceptable because
  nothing ever discriminated on the names.
- **One projection query replaced by caller-side mapping** (artifact-thread-summary) — trivially more
  bytes over the wire per bet, bounded by the existing task fan-out guard.

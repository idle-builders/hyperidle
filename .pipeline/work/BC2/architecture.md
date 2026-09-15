# BC2 — architecture

Technical reading of `plan.md` § How it works, `plans/reviews/LAYER-BELOW.md` §3, §4, §7, §8 and
`plans/reviews/ACTIONS.md` § Task / § plumbing / § Events. Decides nothing the plan does not; names
the contracts a builder needs. Tier: suite. **Every line citation below is against this branch's
base, `efa28dd59`** (`Track BC: one user substrate …`, #551) — the commit `feature/task-action-list`
is cut from. `routes/tasks.ts` is 736 lines there, not the 627 `plan.md:7` quotes from an older read.

Locked here: names on the wire, where the declarations live, the `changes` table, the factory on the
layer face, the single composed tool list, the three loop signatures, the lint rule's shape and its
attack case, the six re-pointed task writers, the seam test. Left to the builder: file layout inside
the task module, helper names, query shapes.

**Two seam directions survive this item**, the two `plan.md:76` names. A direction is a direction,
not a method count — which is how "those two ports are all that is left of the seam" stays true:

1. **core → orchestration: run this work, and stop it.** One direction, three verbs, all already on
   `AgentOrchestrationPort` at this base: `intents.submit` (the work intent after an accept or a
   handoff), `runs.stopForTasks(taskIds)` (`api-contract/src/agent-orchestration-port.ts:189` — the
   runs stopped when a subtree is killed) and `runs.endForHandoff(sessionId, endedAt)` (:190 — the
   predecessor's run ended when the owner changes off an agent). Start and stop are one direction:
   `edit_task` tells the executor what to run and what to stop running, and reads nothing back but
   the ids it stopped. BC6 removes the direction whole.
2. **orchestration → core: record what happened.** The session lifecycle events on the in-process
   bus, which the two core reactions (`work-session-started-reactions.ts`,
   `work-session-end-reactions.ts`) turn into an `edit_task` call and a dispatch-attempt update.

Nothing else on the seam grows and no port gains an operation in this item. In particular `open_task`
does **not** read a task's sessions — founder ruling 2026-09-13, upholding AU26 J4: the browser keeps
combining orchestration data itself.

---

## 1. Reconciliation with the code

| Plan says | Code today (`efa28dd59`) | Handled |
|---|---|---|
| 8 task routes | `routes/tasks.ts:238-735` — `GET /` (:238), `GET /:id` (:275), `GET /:id/tree` (:298), `POST /` (:335), `PATCH /:id` (:473), `POST /:id/outcome` (:652), `PATCH /:id/notes` (:682), `POST /:id/handoff` (:696) | all deleted; the `app.ts` mount removed |
| 4 task tools | `create_task` (:466), `edit_task` (:559), `handoff_to` (:256), `log_task` (:1441) in `tool-handlers/src/tool-definitions.ts`; seam methods `getTaskById · createTask · updateTaskById · appendTaskNote · handoffTask` on `CoreApiWorkPort` (`api-contract/src/core-api-port.ts:179,188,…`) | the four tools deleted; **all five** seam methods deleted — but `getTaskById` has three surviving callers that are re-pointed first (§8, B1) |
| `work` package, 14 methods | `layers/core-api/work` — also owns `items` and `taskDispatchAttempts` (`table-owners.json:15,16,41`) and exports `bakeTaskContextBundle · resolveTaskRunRequest` used by the run path | package renamed to `layers/core-api/task` (`@hyperidle/task`); all three table rows move with it; `items` keeps a surface until BC3 (`policy-engine`'s item append and the `create_item`/`get_item` seam methods still reach it); the two resolvers stay, private to the module |
| three UI hooks + one wire type | `useTaskPatch · useTaskTree · useTaskSessions`, `core-ui/src/types/task.ts` | `useTaskPatch`, `useTaskTree` and `types/task.ts` deleted. **`useTaskSessions` stays** — it calls `GET /api/agent-orchestration/runs?task_id=`, not a task route, so this item does not touch it (founder ruling 2026-09-13); BC6 owns it. Five more surfaces call the deleted routes and are re-pointed in the same step (§8, B2) |
| `audit_trail` dropped | written by `work-service.ts`, `policy/handoff-protocol.ts`, `policy/policy-engine.ts`, `policy/lifecycle-propagation.ts:41-49`; typed by `core-ui/src/types/task.ts:37`; no production reader renders it | column dropped in the migration; every writer above loses its append; `handoff-protocol.ts` is deleted outright (§8, B4); `policy-engine`'s *item* append survives until BC3. One prose edit rides along: `one-work-primitive.ts:50-53` justifies banning `revision_log` with "`audit_trail` is the one audit mechanism", which this item makes false — the `why` becomes "the `changes` table is the one audit mechanism" |
| dependencies wait then start (#550) | `task-state-machine.ts` holds a task with unmet dependencies; `done` frees dependents via `checkAndUnblockDependents` (`app.ts:429`) | "may not accept with unmet dependencies" becomes a server-side invariant inside `edit_task`; the unblock reaction keeps subscribing to `task_state_changed` but writes through `edit_task` (§6) |
| old event keeps firing | `task_state_changed` emitted at the tail of `transitionTask` (`task-state-machine.ts:384-394`); subscribers `app.ts:429`, `policy/lifecycle-propagation.ts:435` | emitted by `edit_task` after commit whenever `state` changed, same payload including the `cascade: true` flag a kill carries |
| sessions still start | `await deps.workIntents({ kind: "task_run", … })` after commit (`task-state-machine.ts:375-383`) through `AgentOrchestrationPort.intents.submit` | unchanged call, made from `edit_task` after commit. **The live dep is a callable, not `deps.workIntents.record(...)`** — the `.record` spelling survives only in the `@lore` at `task-state-machine.ts:206` |
| governance bus registry | `architecture.json` `eventBus.typesModule` = `framework/domain-model/src/events.ts` (the stale fork BC1 deletes) | BC1 repoints it; BC2 reads event names from `framework/event-bus/src/events.ts`' `EVENT_TYPES` (:637-667) |

No symbol the plan names is missing. No plan amendment needed for the target shape. One number the
founder already owns changes at the gate: §13's line count.

**One live defect this item has to fix to work at all.** `task_dispatch_attempts.requestId` and
`.sessionId` are **never written in production** at this base. The only production writes to that
table are `insertAttempt` (`work-service.ts:70-96`, which sets neither) and `markFailed` (:131-138).
`work-session-end-reactions.ts:36` finalizes an attempt with
`taskDispatchAttemptStore.updateIfActive(db, event.requestId, { status, sessionId })`, and that
update is keyed `eq(taskDispatchAttempts.requestId, requestId)` (`work-service.ts:119`) — against a
column nothing ever fills, so it matches zero rows every time. Its integration test fills
`requestId` in its own fixture, which is why the hole survived. The consequence for this item:
`status` stays `requested` forever and `sessionId` stays null, so the table cannot answer "does this
task have a live session" — the question `edit_task` step 5b has to ask (§5). The repair is one
write, named in §5 and §6 row 1.

## 2. Names on the wire — locked

Tool names must satisfy every harness. Underscore names are what the four live tools already use
(`tool-definitions.ts:256,466,559,1441`) and they feed `mcpServer.registerTool`
(`harness-registry/src/mcp/mcp-bridge.ts:141-144`); dotted names are unverified against the
Anthropic tool-name pattern. So:

| Action (sentence) | `name` | HTTP | MCP tool | UI |
|---|---|---|---|---|
| Search tasks | `search_tasks` | `POST /api/actions/search_tasks` | `search_tasks` | `call("search_tasks", …)` |
| Open a task | `open_task` | `POST /api/actions/open_task` | `open_task` | `call("open_task", …)` |
| Edit a task | `edit_task` | `POST /api/actions/edit_task` | `edit_task` | `call("edit_task", …)` |

One name, four places. Events stay dotted (`task.changed`) — they never pass a tool-name check, and
BC2 does not emit them yet (§7, the rule's event clause). Reads are POST too: one shape for the
loop, a body for filters, no query-string encoding of zod.

## 3. Declarations — `framework/domain-model/src/actions/`

`domain-model` already ships zod (`package.json:19`), has surface audience `everyone`
(`tools/governance/architecture.json`), and is what `core-ui` imports today
(`core-ui/package.json:16`). No new framework package, no `architecture.json` surface edit.

```ts
// actions/action.ts
export interface Problem { readonly code: string; readonly message: string; readonly path?: string }
export interface ActionDeclaration<I, O> {
  readonly name: string;          // wire name, [a-z_]+
  readonly sentence: string;      // what the agent reads: "Edit a task: new or existing …"
  readonly input: z.ZodType<I>;   // z.toJSONSchema-able: no Date, no transforms
  readonly output: z.ZodType<O>;
}
export type ActionResult<O> = { ok: true; data: O } | { ok: false; problems: readonly Problem[] };

// actions/task.ts
export const TASK_STATES, TaskSchema        // the row shape; replaces core-ui/src/types/task.ts
export const searchTasks: ActionDeclaration<SearchTasksInput, TaskListItem[]>
export const openTask:    ActionDeclaration<{ id: string }, TaskView>
export const editTask:    ActionDeclaration<EditTaskInput, TaskView>
export const taskInvariants: (next: Task, prev: Task | null) => Problem[]   // PURE
export const TASK_ACTIONS = { search_tasks: searchTasks, open_task: openTask, edit_task: editTask } as const
```

**`EditTaskInput`** is the union of what the eight routes accept today: `id? · parentTaskId ·
teamId · ownerAgentId · title · description · doneCondition · state · position · needsReview ·
dependencies · outcome{verdict,summary} · sourceKnowledgeItemId · appendNote? · version?`. `.strict()`.

- **Handoff is `ownerAgentId`.** Founder decision (`plan.md:100-103`). Role targeting, human
  escalation and the escalation thread/item go with `handoff-protocol.ts` (§8, B4). What does **not**
  go is the re-dispatch: setting the owner still starts the new owner's session (§5 step 5d, §8 B4).
- **`appendNote` is not a partial field.** Notes keep their atomic-append semantics: today
  `log_task` writes through one `UPDATE … CASE` with no pre-read
  (`tool-definitions.ts:1455-1457`; `work-service.ts:682-687`, the `{ notes: AppendNoteOp }`
  overload) and prefixes `[<iso> <actorId>]`. A read-modify-write would lose one of two concurrent
  notes *and its history*. So `appendNote?: string` is a separate optional input, applied through
  that same existing overload inside the transaction, with the same prefix. `notes` is not a
  writable partial field at all.
- **`version` is optional optimistic locking** compared against `prev.updatedAt`. Known limit, said
  once: `updatedAt` is a text ISO column (`framework/db/src/schema.ts:184`) with second-or-better
  resolution, so two edits inside the same tick compare equal and the later one wins. Acceptable —
  strictly better than today, where there is no version option at all.

**`SearchTasksInput`** is `work-service.ts:203-224`'s `WorkFilter` narrowed to task: `ids? ·
excludeIds? · parentTaskId? · ownerAgentId? · state? · teamId? · text? · excludeKilled? · limit?`.
`ids` and `excludeIds` are load-bearing, not decoration — `useTaskLookup` and `useAgentRunState`
batch by `ids` today (`routes/tasks.ts:320`, `work.list(db, "task", { ids: subtreeIds })`), and the
dependency picker needs `excludeIds` so the list door serves it without a second read (§8, B2).

**`TaskView`** — what `open_task` returns, and therefore what `edit_task` returns. It must carry
everything `GET /:id/tree` returns today (`routes/tasks.ts:298-329`), not only children:
`{ task, ancestors, children, tokensActualRollup, threadId, attachments }`. No `sessions` — see the
header.
`ancestors` is root-first (`WorkTaskPage.tsx:554,559-560` builds its breadcrumb from it),
`children` is the whole nested subtree (not direct children), `tokensActualRollup` is the subtree
sum. Dropping any of the three silently breaks the page.

`canTransitionTaskState` / `TASK_STATE_TRANSITIONS` (`domain-model/src/task-transition.ts`) fold
into `taskInvariants`; no second copy survives. The server-only invariants (cycle via ancestors,
team capacity at accept, owner exists, unmet dependencies at accept) are not here — they run inside
`run` and return the same `Problem` shape.

## 4. The `changes` table — `layers/core-api/changes`

A new Service package owning one table. It is the event log the plan describes, and later the source
for subscriptions and the UI stream (BC5). It is not an audit control and adds no gate.

```sql
-- 0082_changes_and_task_edit.sql   (renumber at the BC1 rebase — see §13)
CREATE TABLE changes (
  id        text PRIMARY KEY,
  object    text NOT NULL,          -- 'task' | 'thread' | 'document' | 'user'
  object_id text NOT NULL,
  kind      text NOT NULL,          -- 'created' | 'changed'
  actor     text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  before    text,                   -- JSON of the changed fields, null on created
  after     text NOT NULL,          -- JSON of the changed fields
  at        text NOT NULL
);
CREATE INDEX changes_object_idx ON changes (object, object_id, at);
CREATE INDEX changes_at_idx ON changes (at);
ALTER TABLE tasks DROP COLUMN audit_trail;
```

```ts
export async function appendChange(exec: WriteExecutor, row: NewChange): Promise<Change>  // inside the caller's tx
export async function listChanges(db, { object?, objectId?, after? }): Promise<Change[]>
```

`before`/`after` hold only the fields that differ (plus `id`), not the whole row. An `appendNote`
edit records `{ appendNote: "<the prefixed entry>" }` in `after` with no `before` for that key — the
row never re-serialises the whole notes blob. The migration is a hand-written `.sql` plus a
`meta/_journal.json` entry per `framework/db/drizzle/README.md`; no backfill, because nothing reads
`audit_trail`.

**The table registry needs five edits, not two, and one of them is a number.** `changes` also needs
its drizzle declaration in `framework/db/src/schema.ts` — `registries-honest` validates
`table-owners.json` against the live table set the census derives from the schema module
(`tools/governance/src/rules/registries-honest.ts:34-43`), so an owner row for a table the schema
does not declare fails the build. In `tools/governance/table-owners.json`:

1. `changes → "changes"`, a new owner row;
2. `tasks` (:15), `items` (:16) and `taskDispatchAttempts` (:41) move from `"work"` to `"task"`;
3. **`totals.tables` and `totals.owned` go `34 → 35`** (`table-owners.json:4-8`).
   `validateTableOwners` throws when `registry.totals.tables !== liveTables.size`
   (`tools/governance/src/lib/governance-registry.ts:165-169`), so adding the table without the
   totals fails the whole lint run with a registry error, not a finding.

## 5. The task module — `layers/core-api/task`

**The public surface is a factory, not a value.** `export const taskActions` cannot leave the layer
face: `service-values-do-not-escape-the-face` forbids a Service-imported value reaching a module's
export surface, with one positional exemption — a bare Service identifier in direct callee position
(`tools/governance/README.md`, "A layer's face"). `layers/core-api/package.json` exports only `.`,
`./app`, `./boot`, and a composition root reaches nothing deeper
(`applications/desktop/src/create-server.ts:38-48`). So:

```ts
// layers/core-api/task/src/index.ts   — the Service
export interface TaskActionsDeps {
  readonly changes: {
    appendChange(exec: WriteExecutor, row: NewChange): Promise<unknown>;
  };
  readonly agentOrchestration: {
    // one direction, three verbs — see the header. BC6 removes all three together.
    submitWorkIntent(input: AgentWorkIntentRecorderInput): Promise<void>;
    stopRunsForTasks(taskIds: readonly string[]): Promise<readonly { taskId: string; sessionId: string }[]>;
    endRunForHandoff(sessionId: string, endedAt: string): Promise<void>;
  };
  readonly org:       { getTeam(exec: WriteExecutor, q: { id: string }): Promise<Team | undefined> };
  readonly users:     { getUserById(exec: WriteExecutor, id: string): Promise<User | undefined> };
  readonly knowledge: { listItemIdsByParent(exec: WriteExecutor, q: { parentKind: "task"; parentId: string }): Promise<readonly string[]> };
}
export function createTaskActions(deps: TaskActionsDeps): readonly Action[];
```

Every dep is a sibling Service or the seam, which a nested Service may not import directly — the
same Mechanism-C injection `TaskStateMachineDeps` already uses (`task-state-machine.ts:38-47`). The
bag is bound in `layers/core-api/src/service-bootstrap.ts`, next to the equivalents at :176-177.
`stopRunsForTasks` binds to the seam method the deleted `routes/tasks.ts:54-61` binds today —
`(taskIds) => agentOrchestration.runs.stopForTasks(taskIds)` — with the dead `_exec` first parameter
dropped, since the stop is post-commit and never runs on an executor. The layer face
(`layers/core-api/src/index.ts`) exports `buildCoreActions(bindings): readonly Action[]` whose body
**calls** `createTaskActions(...)` — a bare Service identifier in direct callee position, which is
the sanctioned shape. No Service value is ever named on the face.

```ts
// layers/core-api/src/actions/action.ts — the layer's own composition code,
// next to compose-api-application.ts. Lives here, not in framework, because it carries db.
export interface ActionContext {
  readonly actor: string;
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly now: string;
}
export interface Action<I = unknown, O = unknown> {
  readonly declaration: ActionDeclaration<I, O>;
  readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}
```

`ActionContext` carries no session id and gains none. Everything step 5 needs about a running
session it reads from the task-owned `task_dispatch_attempts` table.

### `edit_task.run`, in order — the plan's paragraph as steps

**Before the transaction**

1. load `prev` by `id` (null → create; then `teamId` is required unless `parentTaskId` supplies it,
   exactly as `routes/tasks.ts:339-355` does today, including the "parent not found" and
   "sourceKnowledgeItemId must exist" checks, which become `Problem`s rather than 404/400);
2. `next = { ...prev, ...input }` minus `appendNote`/`version`; if `input.version` is set and
   `prev.updatedAt !== version` → one `Problem { code: "stale" }`;
3. `taskInvariants(next, prev)` — pure; then the server checks, each moved rather than rewritten:
   `assertNoCycle` (`task-state-machine.ts:69`), team capacity on accept-with-owner
   (`countTeamTasksInProgress` + `teams.capacity`), owner exists (`deps.users.getUserById`), unmet
   dependencies on accept (the #550 guard). Any problems → `{ ok: false, problems }`, no write;

**Inside one transaction (step 4)**

4. upsert `tasks`; apply `appendNote` through the `AppendNoteOp` overload; sibling renumber when
   `position` changed (moved from `routes/tasks.ts:442-465`); when `state === "killed"`, the kill
   cascade's **task writes** run here as module-internal code (§6 row 6) — deepest-first, terminal
   descendants skipped; auto-park to `hold` when dependencies were added to a task that can still
   reach `hold` (moved from `routes/tasks.ts:600-618`); `deps.changes.appendChange(tx, …)` once per
   task touched, so a cascade kill writes one row per killed descendant, all carrying the root
   edit's actor; and — when the edit dispatches work — **the dispatch-attempt insert and the bake,
   in this transaction**, exactly where `task-state-machine.ts:331-355` has them today. That pair
   stays in-tx on purpose: `resolveTaskRunRequest` reads the attempt row the insert just wrote
   (`@lore` AU31 §3.1 site 6, `task-state-machine.ts:353-363`). Only the seam write moves out.

   The edit dispatches work in exactly two situations — an accept and an owner change — and the
   `occasion` column says which:

   | Case | `occasion` | `predecessorSessionId` |
   |---|---|---|
   | state became `accepted` and the owner is an agent, from a non-`hold` state | `accepted` | null |
   | …from `hold` | `retry` | null |
   | `ownerAgentId` changed to an agent while the task is `accepted` or `in_progress` | `owner_handoff` | the predecessor's live session id, or null |

   The predecessor's live session id is read **once**, here, on the transaction's executor — the
   query is in 5b below, over the task-owned table. It is the `owner_handoff` attempt's
   `predecessorSessionId` and it is the argument 5b passes; the value is carried out of the
   transaction, never re-read.

   The insert is `taskDispatchAttemptStore.insertAttempt` unchanged (`work-service.ts:70-96`) with
   `predecessorSessionId` widened to optional, plus `.onConflictDoNothing()`: migration
   `0047_AU9_durable_custody.sql:45` carries a second unique index
   `(task_id, occasion, coalesce(predecessor_session_id,''), agent_id)` that `schema.ts` does not
   declare, and handing a task with no live session back and forth between the same two agents
   collides on it. A swallowed conflict means no new attempt row, and therefore no intent in 5d.

**After commit (step 5), in this order**

5. a. **stop the runs of a kill.** If this edit killed a subtree,
   `deps.agentOrchestration.stopRunsForTasks(killedIds)` with every killed id, including a `done`
   root — the `@lore` at `task-kill-cascade.ts:104-113` is why it is not pre-filtered. This moves
   from *before* the kills (where `task-kill-cascade.ts:114` has it) to *after commit*, the ordinary
   post-commit order this module uses everywhere. Its return value fed `cascadeTaskKill`'s
   `sessionsStopped`, which no caller reads once the kill is an edit; it is dropped.
   b. **end the predecessor's run of a handoff.** If `ownerAgentId` changed off an agent and step 4
   found a live session id, `deps.agentOrchestration.endRunForHandoff(sessionId, ctx.now)`. The query
   step 4 ran is over the task-owned table and nothing else:

   ```sql
   SELECT session_id FROM task_dispatch_attempts
   WHERE task_id = $1 AND session_id IS NOT NULL
     AND status IN ('requested', 'running')
   ORDER BY ordinal DESC LIMIT 1
   ```

   `status` is the column that says a run ended: `work-session-end-reactions.ts:36`'s
   `updateIfActive` writes `completed`/`failed`/`cancelled` on `agent_run_lifecycle_changed`, which
   is terminal-only (`event-bus/src/events.ts:96`). For that to be true of production rows, the
   started reaction has to fill `requestId` and `sessionId` first — §1's live defect, repaired in
   §6 row 1. No new port operation, no session id on `ActionContext`, no read of the orchestration-
   owned `sessions` table.
   **The stale-id risk is real and accepted.** `endRunForHandoff` has no CAS:
   `run-orchestration/src/end-run-for-handoff.ts:40` is a bare
   `update(sessions).set({ state: "done", endedAt }).where(eq(sessions.id, sessionId))`, and its own
   header (:14-16, :25-28) says there is no safety net — a handed-off run left `active` stays
   `active` forever, and an id that is stale by a tick closes a session that had already moved on.
   We do not add a guard in this item: the attempt row is only ever handed a session id by the
   session-started reaction and only ever keeps it while `status` is live, which is the same
   confidence the tool path had when it passed its own `sessionContext.sessionId`. That header also
   asks to be called on the caller's `tx`; the port form takes no executor
   (`agent-orchestration-port.ts:190`), so cross-layer atomicity was already relinquished at the
   seam — `handoff-protocol.ts:118` relinquished it in the other direction by calling before its own
   transaction (AU31 §3.1 site 7). Accepted as-is; BC6 owns the direction and can put the CAS where
   the write is.
   c. **emit the old event.** If `state` changed, `ctx.eventBus.emit(task_state_changed)` with
   today's payload, one emit per task whose state changed, `cascade: true` preserved on the
   descendants of a kill.
   d. **submit the work intent**, when step 4 inserted an attempt row: `deps.agentOrchestration
   .submitWorkIntent({ kind: "task_run", sourceKind: "task_dispatch_attempt", sourceId: attemptId,
   requestedBy: ownerAgentId, idempotencyKey: "task-dispatch:" + attemptId, bakedRequest })` —
   character for character what `task-state-machine.ts:375-383` submits after an accept and what
   `handoff-protocol.ts:362-371` submits after a handoff. This is the step that keeps a handoff a
   handoff: 5b ends the predecessor's run, 5d starts the new owner's.
   e. **free the dependents of anything killed.** For each killed id, the dependency reaction (§6
   row 3) runs, each dependent edited by its own `edit_task.run` call in its own transaction as
   `system:propagation`. Awaited here rather than left to an ambient subscription, preserving the
   reason `task-kill-cascade.ts:140-150` gives: a person killing a task expects the freed dependents
   to be visible in the response.
6. return `open_task.run(ctx, { id })`.

### `open_task.run`

One read model assembling what `GET /:id/tree` returns plus what the page fetches separately:
task row, root-first `ancestors` (`work.listAncestorIds` reversed), the nested `children` subtree
(`work.listSubtreeIds` + `buildChildren`), `tokensActualRollup`, `threadId`, and `attachments`
(knowledge items with `parentKind='task'` via the neighbour's existing `listItemIdsByParent`; BC4
swaps it to `open_document`).

**`sessions` is deliberately not here.** `plan.md:35-37` lists "the sessions that ran on it" among
what `open_task` returns; the founder ruled on 2026-09-13 that it does not, upholding AU26 J4 —
*"the ui can get the agent run state from the orchestration directly and combine this information in
the ui instead of in the core api service"* (`hooks/useTaskSessions.ts:6-14`). So the task page keeps
reading runs itself through `useTaskSessions` → `services/agent-runs.ts:33-42` →
`GET /api/agent-orchestration/runs?task_id=`
(`agent-orchestration/src/routes/agent-orchestration-sessions.ts:115-131`) until BC6. That keeps
`AgentOrchestrationSessionsPort` at `getById(sessionId)` only
(`api-contract/src/agent-orchestration-port.ts:64-69`), with no new port operation and no new client
method.

### `search_tasks.run`

`work-service.ts`'s `list` over `SearchTasksInput` (§3). Returns list rows, never trees. `text` keeps
its ILIKE-across-title/description/doneCondition ranking and the opt-in `excludeKilled` the picker
passes (`work-service.ts:217-224`). `excludeIds` is applied in the query, not by the caller.

Actor: `ctx.actor` is `c.get("userId")` (HTTP) or `ToolContext.agentId` (MCP). Never from the body.

## 6. Every task writer goes through `edit_task`

`edit_task` is the only write. After this item **nothing writes `tasks` outside the task module, and
nothing outside `edit_task` appends a task `changes` row.** Today six production sites call
`transitionTask`/`cascadeTaskKill` directly and would otherwise mutate state, emit
`task_state_changed`, and record nothing. Each, with what it becomes and the actor it uses:

| # | Call site today | Becomes | Actor |
|---|---|---|---|
| 1 | `core-api/src/services/work-session-started-reactions.ts:79` — session started → `in_progress` | the same reaction, calling `edit_task.run(ctx, { id: event.taskId, state: "in_progress" })` in-process; the `TaskInvalidTransitionError` swallow becomes "problems returned → log and return", because `edit_task` returns problems instead of throwing. **It gains one write**, the repair §1 names: before the transition, mark the task's latest `requested` attempt row running — `taskDispatchAttemptStore.markRunning(db, { taskId: event.taskId, requestId: event.requestId, sessionId: event.sessionId, now })`, a new store method that sets `requestId`, `sessionId` and `status: "running"` on the highest-ordinal `requested` row for the task. `SessionStartedEvent` carries all three fields (`event-bus/src/events.ts:156-168`) and `provisioner.ts:1294-1308` fills them for every request-backed session, so the row is honest from the moment a session exists. A `session_started` with no `requestId` — the legacy bare-insert path this file's own header names — marks nothing and is not an error. That is what makes step 5b's query answerable and what makes `work-session-end-reactions`' `updateIfActive` match a row for the first time | `event.agentId` — the session's own agent (`SessionStartedEvent.agentId`, `event-bus/src/events.ts:160`) |
| 2 | `core-api/task/src/dependency-watcher.ts:89` — last dependency met → `accepted` | `edit_task.run(ctx, { id, state: "accepted" })`; the accept's work-intent submit now happens once, inside `edit_task` step 5d, instead of inside `transitionTask` | `system:propagation` |
| 3 | `core-api/task/src/dependency-watcher.ts:120-166` — a dependency was killed → drop the stale id, and a dependent still waiting goes back to `proposed` | **a reaction, never part of the kill's transaction.** `handleDependencyKilled` stays a function in the watcher and is called by `edit_task` after commit (§5 step 5e), once per killed id. For each dependent it makes **its own** `edit_task.run(ctx, { id, dependencies: remaining, ...(state === "hold" ? { state: "proposed" } : {}) })` — one call, one transaction, one `changes` row per dependent, so the stale-id drop (`update(db, "task", …)` at :155-157 today) stops being a table write that records nothing. It cannot nest inside the kill's transaction: `edit_task.run` opens its own, would not see the uncommitted kills, and would commit ahead of them | `system:propagation` |
| 4 | `core-api/policy/src/lifecycle-propagation.ts:164` — session ended → task to `review` or `done` | `edit_task.run(ctx, { id: taskId, state: target })`. The file's own private `transitionTask` helper (:18-78) is **deleted** — that is "the task half" `plan.md:9` removes. Its `auditTrail` JSON append (:41-49) dies with the column; its `work.transitionTaskState` port dep (`policy/src/ports.ts:33`) goes. The two subscriptions, the sibling/ancestor decision logic, `createShipConfirmationThread` (:336) and the `propagation_applied`/`propagation_failed` emits all stay | `system:propagation` — the constant already in the file at :86, seeded unconditionally by `core-api/src/bootstrap/factory-state.ts:36-41` |
| 5 | `core-api/policy/src/lifecycle-propagation.ts:271` — ancestor rollup | same as #4, same helper, same actor | `system:propagation` |
| 6 | `core-api/task/src/task-kill-cascade.ts:138` — kill each non-terminal task in the subtree | **collateral, inside `edit_task`'s own transaction.** A kill is an edit with `state: "killed"`; the root is the decision and the descendants are collateral, never a second decision — the BB1 governance rule `one-work-primitive`'s reading. `cascadeTaskKill` stops being an exported entry point: its subtree select, its terminal filter (:97-100) and its deepest-first walk (:122-138) become a private step inside step 4, writing the task rows and one `changes` row each **in that one transaction**. Nothing re-enters `edit_task` from inside it. Its two outward calls both move **out** of the transaction: the run stop to step 5a, `handleDependencyKilled` to step 5e (row 3) | the actor who issued the edit — a human's `userId` or the calling agent. Every collateral row carries the root kill's actor; there is no second actor and no `system:propagation` here |

Rows 3 and 6 are two different mechanisms and the difference is the point. **Descendants of a killed
root are collateral**: same transaction, same actor, one `changes` row each, no separate decision.
**Dependents of a killed task are a reaction**: after commit, its own transaction per dependent,
actor `system:propagation`, and a refusal stops that dependent alone. Collapsing either into the
other is what makes `edit_task` call itself from inside its own open transaction.

Consequences a builder must not miss:

- `transitionTask` and `cascadeTaskKill` are no longer exported from the module
  (`work/src/index.ts:48,66`); `TaskStateMachineDeps` folds into `TaskActionsDeps`.
- The three reaction files (#1–#3) sit in `core-api` and `core-api/task`. A reaction in
  `layers/core-api/src/services/` receives the composed `readonly Action[]` the same way it receives
  `db` today, from `service-bootstrap.ts`. `dependency-watcher.ts` lives *inside* the task module, so
  it calls `edit_task.run` directly.
- `policy` (#4, #5) is a sibling Service and may not import `@hyperidle/task`. `edit_task` is
  injected into `LifecyclePropagationDeps` as one function — the same Mechanism-C shape the file
  already uses for `deps.work`.
- Every one of these calls is **in-process, after the caller's own commit, as the named actor** —
  `plan.md:71-76`. Never a shared transaction, never the table.
- The existing re-entrancy is preserved, not created: `lifecycle-propagation.ts:435` still subscribes
  to `task_state_changed` and its own ancestor transition still re-emits it (:205-212 documents the
  loop), terminating on `SKIP_ANCESTOR_STATES`, the all-children-terminal check and the refusal. The
  refusal changes shape — a returned problem list instead of a thrown `TaskInvalidTransitionError` —
  and stops the walk the same way.

## 7. The loops

### HTTP — `layers/core-api/src/actions/actions-router.ts`

```ts
export function createActionsRouter(actions: readonly Action[], deps: { db; eventBus }): Hono<HyperIdleEnv>
// for each: router.post(`/${a.declaration.name}`, validateBody(a.declaration.input), async c => {
//   const input = c.req.valid("json" as never);              // the cast every route here needs
//   const result = await a.run({ actor: c.get("userId"), db, eventBus, now }, input);
//   return result.ok ? c.json(result, 200) : c.json(result, 422);
// })
```

`validateBody` is `@hyperidle/domain-model/http` (`framework/domain-model/src/http.ts:100`). The
`"json" as never` cast is not optional — it is the zod-dual-version bridge every existing handler
already needs (`routes/tasks.ts:336`), and omitting it costs a typecheck round. Mounted at
`api.route("/actions", …)` in `app.ts` behind the existing auth middleware; 404 for an unknown name
falls out of Hono. `app.ts` receives `actions` from the root the same way it receives `db`.

Mounting is structural, not something to check: the loop mounts every declaration or none. That is
why the lint rule below has no "is it mounted" clause — one path over the same list cannot disagree
with itself, and the route name is a template literal the rule's scan deliberately does not see.

### MCP — `layers/core-api/src/actions/actions-as-tools.ts`

```ts
export function actionsAsTools(actions: readonly Action[]): readonly RegisteredTool<HyperIdleDb>[]
// { name, description: sentence, inputSchema: declaration.input, handler: (args, ctx) => … }
// ActionResult → ToolResult: { ok: true, data } → ok(data);
//                            { ok: false, problems } → err(problems[0].code, problems.map(p => p.message).join("; "))
```

`RegisteredTool`, `ToolResult`, `ok` and `err` come from `@hyperidle/harness-protocol`
(`framework/harness-protocol/src/harness/tool-seam.ts:72-85, 91-98`), which core-api already
depends on — import the type rather than relying on structural typing, so the shape is checked.
`ToolResult` is `{ success, data }` / `{ success: false, error, code }`; there is no `isError` on
this seam (that is MCP-SDK vocabulary). `roles` is omitted — every actor gets every action;
authorization is an invariant, not a filter (`plan.md`; ETHOS). Because `inputSchema` is a real
`z.ZodType`, the value satisfies both `RegisteredTool` (whose `inputSchema` is the structural
`AnySchema`) and the `ToolDefinition` shape `buildToolDefinitions` returns, so it is assignable
wherever either is expected.

**One composed list, built once.** The provider has two construction sites and both must see the
actions, or the tool is registered on the MCP server and refused at the CLI:
`buildToolRegistry` (`agent-orchestration/src/services/run-orchestration-composition.ts:380-387`)
builds the registry, and `toolsForRole` (:389-395) is what fills the per-session allowlist
(`run-orchestration/src/provisioner.ts:1716 → :1732 tools: allowedToolNames`), the prompt's tool
summaries (:1478) and the return-enforcement exemption (:1703). So the list is injected once,
before the provider splits:

```
create-server.ts (both roots)
  const coreApi = await bootCoreApi({ … })          // CoreApiBoot grows one field: actionTools
  await bootAgentOrchestration({ …, runtime: { …, actionTools: coreApi.actionTools } })
    → buildRunOrchestrationComposition({ …, actionTools })      (:540)
    → buildSessionLifecyclePorts(…, actionTools)                (:427)
    → buildToolProvider(coreApiTransport, returnStatusToolAdapter, actionTools)   (:375)
        buildToolRegistry: buildToolRegistryFromDefinitions([...actionTools, ...definitions], toolCtx, opts)
        toolsForRole:      [...actionTools, ...buildToolDefinitions(…)].filter(d => d.roles === undefined || d.roles.includes(role))
```

`bootCoreApi` already returns before `bootAgentOrchestration` is called in both roots
(`applications/desktop/src/create-server.ts:231,267`; `applications/remote-server/src/create-server.ts:326,382`),
so no ordering changes. There is **no second construction site**: `actionsAsTools` is called exactly
once, inside `bootCoreApi`. The MCP bridge is untouched — it iterates `registry.definitions`
(`mcp-bridge.ts:141-157`). Handlers read `ctx.db` per invocation, so the list needs no `db` at
construction, which is what lets `toolsForRole` — which has no db — carry it too.

### UI — `layers/core-ui/src/services/call.ts`

```ts
type Actions = typeof TASK_ACTIONS   // grows per item: & typeof THREAD_ACTIONS …
export async function call<N extends keyof Actions>(name: N, input: z.input<Actions[N]["input"]>):
  Promise<ActionResult<z.output<Actions[N]["output"]>>>   // apiFetch POST /api/actions/<name>
```

`core-ui` has **no `zod` dependency** today (`layers/core-ui/package.json` dependencies), and
`npm run verify` runs `deps:check` (`tools/repo-gates/src/dep-manifest-lint.ts`). Add
`"zod": "^4.3.6"` to that manifest — it is already in the bundle transitively through
`@hyperidle/domain-model`, so this is a manifest fact, not a new dependency.

### Lint — `tools/governance/src/rules/actions-projected.ts`

**There is no new file at `tools/governance/`'s root, and no `pending` map.** An earlier draft put a
registry at `tools/governance/actions.json`. It cannot exist: `no-per-file-allowances` reports every
direct child of that folder that is not one of seven declared names
(`CLOSED_SET`, `tools/governance/src/rules/no-per-file-allowances.ts:52-62`;
`isDirectChildOfGovernanceDir` :64-66; the report loop :117-126), and the census it runs over is
`git ls-files --cached --others --exclude-standard` across the repo, so a `.json` there is in scope.
Its other clause only inspects the two CLI entry points' argv comparisons (`CLI_ENTRY_POINTS`
:68-71, `DECLARED_FLAGS` :73, the check :128-147).
**A module under `src/rules/` is outside both clauses by design** — "The closed set is scoped to this
folder's own root only; `src/` is the engine's real source and grows by design"
(`tools/governance/README.md:87-91`, and the rule's own `@lore` at :29-35). So the rule carries its
own data as constants in its own file. Nothing is a registry edit, nothing is a clause
edit in `governance-model.ts`, and no founder ruling is required for the mechanism.

A path-keyed `pending` map would also have been the exact shape that rule exists to refuse — an
allowance that passes a file *because it is listed*. The three constants below are not that: they are
a **census of what exists at `efa28dd59`**, every entry required to still exist, and the entry is
deleted in the pull request that removes the thing.

The file holds six constants. Three are **vocabulary** that does not shrink — `PLUMBING_ROUTES` (the
seventeen registrations that realise `ACTIONS.md`'s sixteen plumbing doors), `OBJECT_EVENTS` (the
nine) and `PLATFORM_EVENTS` (the eight). Three are the **shrink lists**:

```ts
/** Every route registered in a production file at efa28dd59 that is neither a task action route
 *  nor one of the sixteen plumbing doors. 107 entries. Only shrinks: an entry whose route is gone
 *  is a finding, so the deletion and the row land in the same PR. */
const LEGACY_ROUTES: readonly string[] = [
  "layers/core-api/src/routes/threads.ts|POST /:id/messages",
  …
];
/** Every tool name declared in a production ToolDefinition literal that is not an action. 17. */
const LEGACY_TOOLS: readonly string[] = ["add_agent", "create_artifact", …];
/** Every EVENT_TYPES member that is neither one of the nine object events nor one of the eight
 *  platform events. 21. */
const LEGACY_EVENTS: readonly string[] = ["task_state_changed", …];
```

**Four clauses, each over a population the rule derives from the code and hard-fails at zero on.**

1. **Every action name is reachable from the UI.** Every `name` declared in
   `framework/domain-model/src/actions/*` is referenced as a string in `core-ui/src/**` (a
   `call("<name>"`). Mounting and tool registration are loops over the same list (above), so there is
   nothing to check there; the UI is the one projection a loop cannot guarantee.
2. **Every route is an action, plumbing, or legacy.** The population is derived by scanning **every
   production file** for a `.<verb>(` call whose first string-literal argument starts with `/` — the
   verb call and the literal may sit on different lines, which is why a single-line regex is wrong
   (`agent-orchestration-intake.ts` alone registers seven routes that way). At this base that scan
   yields **132** registrations. The scan must not be a `layers/*/src/routes/**` glob and must not
   require the receiver to be called `router`: `layers/core-api/src/app.ts:272` (`api.get("/health")`),
   `layers/core-api/src/routes/health.ts:7,26` (`health` / `authHealth`),
   `layers/core-api/src/routes/reviews.ts:47` (`app`), `layers/core-api/src/routes/ws.ts:92`
   (`apiApp`) and `layers/agent-orchestration/src/routes/session-stream-ws.ts:87` (`apiRouter`) all
   register on a differently-named receiver, and
   `layers/agent-execution/harness-registry/src/mcp/mcp-route.ts:82` is outside any `routes/` folder.
   A rule wired to a subset is the `au6` shape `.pipeline/rules/architecture.md:30-39` warns about.
   (`layers/core-api/src/__testing__/test-routes.ts` is a development file — a path segment starting
   with `__` — so the production predicate already excludes it, and that is the whole reason the
   predicate is "production file" rather than "file under `src/`".)
   A registration is a finding unless it is plumbing or in `LEGACY_ROUTES`; and a `LEGACY_ROUTES`
   entry the scan no longer finds is a finding too.
3. **Every tool is an action or legacy.** The population is every `name: "<snake_case>"` property in
   a production file within ten lines of an `inputSchema:` property — i.e. every hand-written
   `ToolDefinition` literal. At this base that is **21** names: the twenty in
   `tool-handlers/src/tool-definitions.ts` and `return_status` in
   `harness-registry/src/return-status-tool.ts:110`. The three action tools are built from
   declarations, not literals, so they never appear in this population — which is correct: the
   adapter is a loop. Same two directions as clause 2.
4. **Every event is classified.** The population is the compile-time-complete `EVENT_TYPES` array in
   `framework/event-bus/src/events.ts:637-667`, parsed through the injected `readFile`. Every name is
   in the nine object events, the eight platform events, or `LEGACY_EVENTS`; anything else is a
   finding, and a `LEGACY_EVENTS` name no longer in `EVENT_TYPES` is a finding. `EVENT_TYPES` is a
   superset of what is emitted — a type that can ride the bus is a type something may emit — so the
   clause cannot pass by missing an emit site, which a hand-rolled `eventBus.emit(` scan would. It is
   compile-time-enforced complete (:669-674), so a new event type cannot slip past it.

**The ratchet, and why it is a ratchet.** `misplaced-files.json` keeps a committed `resolvedFiles`
count and fails in **both** directions (`tools/governance/README.md:96-101`) — that is the discipline
being copied, and copying it needs no count here because the population is live code. A legacy entry
is a claim that something still exists; when it stops existing the rule goes red until the entry is
deleted, which forces the deletion and the row into the same pull request. A name cannot be added
back to a list without the reviewer seeing a list grow in the diff, which is exactly the two-line
diff review is expected to challenge. Nothing derives these lists for you a second time; they are
derived **once, by running the scan**, not typed out of `ACTIONS.md`.

**This is how `plan.md`'s "red for the other objects" is honoured without a red build, and the
founder hears it at the gate.** `plan.md:51-52` and the gate line at `plan.md:120-121` both say the
rule is green for task and red for every other object. A rule that is red fails `npm run lint`,
therefore `verify`, therefore the PR — and `.pipeline/rules/architecture.md:27-28` is explicit that
every architectural rule is `error` and lands with its violations cleared in the same pull request.
Both cannot be true at once. What ships instead: the three constants **are** the red. They are a
written-down, mechanically-enforced, only-shrinking list of every door, tool and event that is not
yet an action — 107 routes across 29 files, 17 tools, 21 events — and BC3–BC6 each delete their
share in the PR that lands their module. That is a plan amendment, small but real, and it is stated
to the founder at the gate rather than discovered later.

#### `LEGACY_ROUTES` — 107 entries, derived from the route files

The scan finds **132** registrations at `efa28dd59`. Seventeen are plumbing: `routes/auth.ts:55,80,107`
(`GET /me`, `POST /ws-token`, `POST /worker-token`), the three health registrations
(`app.ts:272`'s authed `/api/health`, `routes/health.ts:7`'s unauthenticated probe mounted at `/` by
both roots — `desktop/src/create-server.ts:310`, `remote-server/src/create-server.ts:432` — and
`routes/health.ts:26`'s `/api/health/auth`; `ACTIONS.md:281` counts these as two doors because
`/health` is registered twice), the ten seam registrations in `agent-orchestration-intake.ts`
(:129, :140, :159, :180, :236, :247, :254, :268, :295, :305) and
`mcp-route.ts:82`. Eight are the task routes this item deletes. The remaining **107** are the list,
by file, with each file's count. (`ACTIONS.md:114` tallies 126 routes where this scan finds 132
registrations: that tally counts doors and folds rows like `GET /health · GET /health/auth` into one
line, while a scan can only count registrations.)

| File (under `layers/`) | n | Routes |
|---|---|---|
| `agent-execution/harness-registry/src/mcp/mcp-route.ts` | 1 | `ALL /mcp/:token` |
| `agent-orchestration/run-orchestration/src/worker-ingress.ts` | 1 | `GET /ws/worker` |
| `agent-orchestration/src/routes/agent-orchestration-intake.ts` | 2 | `POST /runs/abort` · `POST /runs/stop-for-tasks` |
| `agent-orchestration/src/routes/agent-orchestration-sessions.ts` | 4 | `GET /sessions/:sessionId` · `GET /runs/active-counts` · `GET /runs/latest-outcomes` · `GET /runs` |
| `agent-orchestration/src/routes/connections.ts` | 4 | `GET /` · `POST /` · `DELETE /:id` · `POST /:id/validate` |
| `agent-orchestration/src/routes/filesystems.ts` | 6 | `POST /` · `POST /inspect-path` · `GET /` · `GET /:id` · `DELETE /:id` · `DELETE /:id/injections/:agentUserId` |
| `agent-orchestration/src/routes/session-stream-ws.ts` | 1 | `GET /agent-orchestration/ws` |
| `agent-orchestration/src/routes/sessions.ts` | 2 | `GET /` · `GET /:id/activity` |
| `core-api/src/routes/agents.ts` | 5 | `GET /:id/profile` · `GET /` · `POST /` · `PATCH /:id` · `DELETE /:id` |
| `core-api/src/routes/assistant.ts` | 1 | `GET /` |
| `core-api/src/routes/coach.ts` | 1 | `GET /` |
| `core-api/src/routes/conversations.ts` | 4 | `GET /items` · `GET /items/:id` · `PATCH /items/:id` · `POST /items` |
| `core-api/src/routes/credentials.ts` | 4 | `GET /` · `PUT /:name` · `DELETE /:name` · `POST /:name/validate` |
| `core-api/src/routes/filesystems.ts` | 1 | `POST /:id/injections` |
| `core-api/src/routes/harnesses.ts` | 2 | `GET /` · `POST /redetect` |
| `core-api/src/routes/hints.ts` | 2 | `GET /` · `POST /:hintId/dismiss` |
| `core-api/src/routes/knowledge.ts` | 15 | `GET /` · `GET /triage-count` · `GET /:id` · `POST /` · `PATCH /:id` · `POST /:id/merge` · `POST /:id/split` · `POST /:id/archive` · `GET /:id/conflicts` · `POST /:id/conflicts` · `POST /:id/promote` · `PATCH /:id/attention-score` · `POST /:id/recompute-attention` · `POST /:id/graduate` · `POST /sweep` |
| `core-api/src/routes/notifications-routes.ts` | 7 | `GET /config` · `PATCH /config` · `GET /inbox` · `POST /seen` · `POST /:id/read` · `GET /mute` · `PUT /mute/:key` |
| `core-api/src/routes/org.ts` | 10 | `GET /` · `PUT /edges` · `DELETE /edges/:id` · `GET /review-recipients` · `GET /teams/:teamId` · `GET /teams/:teamId/membership` · `GET /team-members/:teamMembersId` · `POST /teams` · `POST /scaffolded-agents` · `POST /scaffold-request` |
| `core-api/src/routes/plugins.ts` | 6 | `GET /` · `POST /` · `POST /:id/enable` · `POST /:id/disable` · `DELETE /:id` · `POST /:id/contributions/restore` |
| `core-api/src/routes/recipients.ts` | 1 | `GET /` |
| `core-api/src/routes/reviews.ts` | 1 | `GET /:reviewMessageId` |
| `core-api/src/routes/routines-routes.ts` | 7 | `GET /event-types` · `POST /` · `GET /` · `DELETE /:id` · `GET /:id` · `PATCH /:id` · `POST /:id/trigger` |
| `core-api/src/routes/search.ts` | 1 | `GET /` |
| `core-api/src/routes/settings-agent-behavior.ts` | 2 | `GET /config` · `PATCH /config/:id` |
| `core-api/src/routes/teams-routes.ts` | 4 | `GET /` · `POST /` · `PATCH /:teamId` · `GET /:teamId` |
| `core-api/src/routes/threads.ts` | 7 | `POST /direct` · `GET /inbox` · `PATCH /:id` · `GET /` · `GET /:id` · `POST /` · `POST /:id/messages` |
| `core-api/src/routes/users.ts` | 4 | `POST /` · `GET /` · `GET /:id` · `PATCH /:id` |
| `core-api/src/routes/ws.ts` | 1 | `GET /ws` |

Three groups in that table are legacy only because `ACTIONS.md`'s plumbing row does not name them,
and a builder should not read them as future actions:

- `agent-orchestration-intake.ts`'s `POST /runs/abort` and `POST /runs/stop-for-tasks` are seam
  routes, but `ACTIONS.md:241-242` files them under *stop a session*, not plumbing. BC6 decides.
- the four transports — `mcp-route.ts`'s `ALL /mcp/:token`, `worker-ingress.ts`'s `GET /ws/worker`,
  `ws.ts`'s `GET /ws` and `session-stream-ws.ts`'s `GET /agent-orchestration/ws` — are sockets and a
  protocol mount, not object doors. They leave the list by being reclassified as plumbing, the same
  way `return_status` does, not by becoming actions.
- `routes/coach.ts` and `routes/hints.ts` are on `ACTIONS.md:297-298`'s *delete outright* list. They
  are entries only so BC2 is green, and whichever item deletes those files deletes their rows in the
  same PR — which the ratchet enforces rather than hopes for.

#### `LEGACY_TOOLS` — 17 entries

`add_agent · create_artifact · create_conflict_review · create_item · create_routine · create_team ·
merge_knowledge · promote_knowledge · reply · run_knowledge_sweep · score_attention · send_message ·
split_knowledge · submit_review · update_routine · write_memory` (the sixteen left in
`tool-definitions.ts` once `create_task`, `edit_task`, `handoff_to` and `log_task` are deleted), plus
`return_status`. `return_status` is the tool twin of the `POST /mcp/:token/return-status` plumbing
route and will never become an object action; it carries an inline comment saying so, and it leaves
the list by being reclassified when BC6 gives the tool clause a plumbing set, not by being deleted.
Everything else on the list leaves by being replaced.

#### `LEGACY_EVENTS` — 21 entries

`task_state_changed · session_started · session_ended · session_not_returned · thread_created ·
thread_message_appended · thread_resolved · thread_reopened · thread_archived · item_created ·
dependency_met · knowledge_created · knowledge_updated · knowledge_archived · knowledge_accessed ·
team_created · agent_added · user_created · work_selection_requested · notification · routine_fired`
— `EVENT_TYPES`' twenty-nine names minus the eight platform events. Three of them —
`thread_archived`, `dependency_met`, `work_selection_requested` — have **no production emitter** at
this base (the only live mentions are comments in `core-api/routine/src/routine-scheduler.ts` and
`domain-model/src/work-intent.ts`). They are the cheapest first shrink; BC2 does not take it, because
the routine trigger surface still offers them as subscribable names.

The nine object events (`task.created · task.changed · thread.created · thread.message ·
thread.changed · document.created · document.changed · user.created · user.changed`) and the eight
platform events (`agent_work_intent_recorded · agent_run_admission_failed ·
agent_run_lifecycle_changed · session_handoff_completed · sandbox_writeback_changes_detected ·
tool_call_recorded · propagation_applied · propagation_failed`) are the rule's `OBJECT_EVENTS` and
`PLATFORM_EVENTS` constants — unchanging vocabulary, not a shrink list. Note that clause 4 is **satisfied by construction at this
base**: it can only go red when a new `EventType` is added without classifying it. That is a real
check — a new event must be classified — but it proves nothing about task, and the gate should hear
"the event clause ships green because nothing is unclassified", not "the event clause proves the
mechanism".

**Registration.** `minScope: 1`. Registered in **both** rule lists in
`tools/governance/src/governance-lint.ts` — `buildRules` (:104, the list `--attacks` shares) and
`runLive`'s own `RULES` (:217). Registering in one only means the rule is either break-tested but
never run, or run but never break-tested.

**Attack case — required, or the build fails.** `tools/governance/README.md` property 4: a registered
rule with no positive attack case is a build error, and every case needs a control twin
(`src/lib/governance-attacks.ts:20-31`). Add to `ATTACKS`:

- **positive** `actions-projected-unclassified-route` — `overlay`
  `layers/core-api/src/routes/attack-task-overlay.ts` containing
  `router.get("/tasks/:id/summary", …)`: a route registration that is neither plumbing nor in
  `LEGACY_ROUTES`, which is exactly how a deleted door comes back.
  `expect: { sort: "finding", file: …, ruleId: "actions-projected", messageContains: "LEGACY_ROUTES" }`.
- **control** `actions-projected-legacy-route-control` — the same act on a door that is already
  legacy, written the legal way: `mutate` `layers/core-api/src/routes/threads.ts` to change an
  existing registration's handler body without adding a registration.
  `expect: { sort: "clean", file: "layers/core-api/src/routes/threads.ts" }`. Scoped to the file, like
  every other control here.

  The control must **mutate** rather than **overlay**, and it must not add a route: `LEGACY_ROUTES` is
  keyed by file *and* route, so a brand-new registration in a legacy file is unclassified too and
  would report — the control would pass for the wrong reason. The harness's own rule 3 backs the
  mutate/overlay half: an overlay path must not already exist and a mutated path must.

One more anchor edit comes with the rename: `ATTACK_ANCHORS.serviceDir` and `.serviceBarrel` point at
`layers/core-api/work/src` and `…/work/src/index.ts` (`governance-attacks.ts:119-122`). The runner
asserts those paths exist, so renaming `work` → `task` without updating them fails the attack suite
loudly — which is the design, but it is one more edit in this PR, not a surprise.

Registry edits in this item: `table-owners.json` only (four rows and the totals block, §4), plus
`ATTACK_ANCHORS` (two paths, source, not a registry). **No new governance record file, and no clause
change in `governance-model.ts`.** A new rule is a decided rule, and it lands with its violations
cleared in the same PR — which is what the three constants make possible.

## 8. Deletions, and the callers re-pointed in the same change

Straight deletions: `routes/tasks.ts` · the four task tools and their `ToolHandlersPorts` accessors ·
`useTaskPatch · useTaskTree · core-ui/src/types/task.ts` ·
`domain-model/src/task-transition.ts` (folded into `taskInvariants`) · the `audit_trail` column and
every writer of it · `policy/src/handoff-protocol.ts` (B4 below) · `lifecycle-propagation.ts`'s
private `transitionTask` helper (:18-78) · `transitionTask`/`cascadeTaskKill` as exported entry
points. `@hyperidle/work` becomes `@hyperidle/task`: re-point every import found by
`rg -l "@hyperidle/work"` — `app.ts`, `service-bootstrap.ts`, the reaction files, `policy`, and
`run-orchestration` via the two resolvers.

### B1 — three surviving tools are re-pointed before `getTaskById` dies

`CoreApiWorkPort.getTaskById` has five call sites in `tool-definitions.ts`, and only one belongs to
a tool this item deletes. The other three belong to tools that survive, so they are re-pointed to
`open_task` **in this PR**, in step 4 of §13, before the seam method is removed. Same actor in every
case — `ctx.agentId`, which is what `getTaskById(id, actorId)` passes today.

| Tool | Call site | Becomes |
|---|---|---|
| `write_memory` (declared :189) | `:205-208` — resolve the calling task's `teamId` for the default scope | `open_task` in-process, reading `data.task.teamId` |
| `submit_review` (:699) | `:708` — load the parent task; `:773` — walk `parentTaskId` up to the root | two `open_task` calls, same loop, reading `data.task.parentTaskId` |
| `create_artifact` (:1489) | `:1536-1540` — same `teamId` resolution as `write_memory` | `open_task` in-process |
| `create_task` (:466) | `:487` — parent lookup | deleted with the tool |

**"In-process" means through a port, not an import.** Those three tools live in
`layers/agent-orchestration/tool-handlers`; `open_task` lives in `core-api`. The re-point is a new
entry on `ToolHandlersPorts`, bound at the composition root — the same shape
`tool-handlers-bindings.ts:112` uses for the seam method being deleted — and **never** an
`import "@hyperidle/core-api"` from that layer, which is the layer violation this would otherwise
become. Topologically it is sound: `remote-worker` composes `agent-execution` only, so both roots
co-boot the two layers. The gain is still real — the bound function calls the action directly
instead of dialling core over HTTP, which is the first place the new mechanism pays for itself.

Once they are moved, all five `CoreApiWorkPort` task methods and their client mirrors
(`agent-orchestration/src/services/core-api-port-composition.ts:447-449,502-504`,
`tool-handlers-bindings.ts:112,188-189`, `tool-handlers/src/ports.ts:372`) are deleted. Note the
name collision: `policy/src/ports.ts:26`, `routine/src/ports.ts:37` and `service-bootstrap.ts:176`
also declare a `getTaskById`, but those are **core-internal `(exec, id)` ports over `work.get`**,
not the seam method, and they are untouched by B1 — they die with the `work` rename instead.

### B2 — seven UI surfaces, not three

Deleting `routes/tasks.ts` breaks every one of these. All are re-pointed in step 6 of §13:

| Surface | Calls today | Becomes |
|---|---|---|
| `pages/WorkTaskPage.tsx:44-46,321,484-492` | `useTaskTree`, `useTaskPatch` | `call("open_task")` / `call("edit_task")` + `taskInvariants` on the controls |
| `pages/WorkTaskCreate.tsx:85` | `POST /api/tasks` | `call("edit_task", { … })` with no `id` |
| `hooks/useTaskLookup.ts:53` | `GET /api/tasks?ids=` | `call("search_tasks", { ids })` |
| `hooks/useTaskSearch.ts:56` | `GET /api/tasks?q=` + client-side `excludeIds` | `call("search_tasks", { text, excludeIds, excludeKilled: true })` — the exclusion moves server-side |
| `hooks/useAgentRunState.ts:77` (`fetchTaskRefs`) | `GET /api/tasks?ids=`, batched titles for `AgentProfile` and the `WorkTeam` roster | `call("search_tasks", { ids })` |
| `components/TaskDependencyField.tsx:44,50` | consumes the two hooks above | unchanged code, both hooks now on `call` |
| `pages/KnowledgeDetail.tsx:850` | `POST /api/tasks` (promote-to-task, with `sourceKnowledgeItemId`) | `call("edit_task", { … })` |

`useAgentRunState` is the one the first critique pass missed; it is why `ids` is in
`SearchTasksInput` rather than only `excludeIds`.

### B4 — handoff is an edit; `handoff-protocol.ts` is deleted; the re-dispatch survives

Founder decision, `plan.md:100-103`: *"Handoff is an edit that sets the owner: the caller names a
user, role targeting and the escalation thread go, the running session still ends through the
existing seam after commit until BC6."* So `layers/core-api/policy/src/handoff-protocol.ts` (385
lines) is deleted outright, with `buildHandoff` (`policy/src/index.ts:27`), `buildProductionHandoff`
and `buildHandoffDeps` (`core-api/src/services/policy-bindings.ts:48,54,143-147`), the
`HandoffParams`/`HandoffResult`/`HandoffMetadata` types, and the `claimTaskHandoff` CAS port
(`policy/src/ports.ts:28`, `work-service.ts`). What goes and what stays, named so the founder sees
the whole cut in one place:

- `toRole` / `toHuman` target resolution (:68-120, `users.findActiveTeammateByRole`) — **gone.** The
  caller names a user id.
- the escalation thread + escalation item (:230-259) — **gone.**
- the `session_handoff_completed` emit (:373-379) and the audit-trail `handoff` entry (:309-320) —
  **gone** with the column; a `changes` row with `before.ownerAgentId`/`after.ownerAgentId` is the
  record now.
- the CAS transaction over the task — **replaced** by `edit_task`'s optional `version`.
- `deps.runOrchestration.endRunForHandoff` (:118) — **kept**, as `edit_task` step 5b. It moves from
  *before* the transaction to *after commit*. The residue changes from "run ended, task untouched"
  to "task updated, run still live", and that second one is **not** self-repairing:
  `end-run-for-handoff.ts:25-28` says a handed-off run left `active` stays `active` forever, because
  the stale sweep only selects routine sessions. Accepted knowingly at this tier (§5 step 5b); BC6
  owns the direction.
- **the re-dispatch — kept, and it is the point of a handoff.** `handoff-protocol.ts:322-344` inserts
  a `taskDispatchAttempts` row with `occasion: "owner_handoff"` and
  `predecessorSessionId: sessionContext.sessionId`, bakes the run request in the same transaction,
  and records the work intent post-commit (:362-371) so the **new** owner's session starts. All of
  that survives as one branch of `edit_task`'s own dispatch path: step 4's third occasion row and
  step 5d. Nothing about it is new code — it is the same two calls the accept path already makes,
  reached by a second condition. Without it, changing an owner would end the old run and start
  nothing, which is a feature deletion `plan.md:100-103` does not authorise.
- `deps.sessionRequests.abort(sessionId)` (:381) — **cut.** It aborts the predecessor's in-process
  registry entry after `endRunForHandoff` has already written the session `done`; with the end call
  now post-commit and immediately before the new intent, the abort is a second stop of the same run
  with no observable effect on the task. `AgentOrchestrationRunsPort.abort`
  (`api-contract/src/agent-orchestration-port.ts:192`) keeps its other callers and is not deleted.

This answers the earlier open question about `POST /agent-orchestration/runs/end-for-handoff`
(`agent-orchestration/src/routes/agent-orchestration-intake.ts:236`): `edit_task` calls it, through
`AgentOrchestrationPort.runs.endForHandoff` (:190). It stays a plumbing seam route, as
`ACTIONS.md:286` keeps it, with exactly one caller. Note the two spellings — the port takes
`(sessionId, endedAt)` while core's current dep takes `(exec, sessionId, endedAt)`
(`handoff-protocol.ts:118`); `TaskActionsDeps` uses the port shape, so no `exec` is threaded.

`policy/src/lifecycle-propagation.ts` is **not** deleted — only its task-writing half is (§6, row 4).
That is what `plan.md:9` lists, and what an earlier draft of this document had backwards.

## 9. Failure behaviour that changes

- A refused edit is `422 { ok: false, problems }` on HTTP, and on the tool seam an
  `err(code, messages)` `ToolResult` — instead of today's mix of 400/409/422 and typed throws
  (`TaskInvalidTransitionError`, `TaskDependencyBlockedError`, `TaskDependencyKilledError`,
  `TaskDependencyNotFoundError`). Those error classes lose their throw sites; each becomes a
  `Problem` code.
- The background writers (§6) stop catching `TaskInvalidTransitionError` and start reading
  `result.ok === false`. A refused propagation is logged and dropped, exactly as the swallow does
  today — no retry, no counter.
- Two concurrent edits: last write wins unless the loser passed `version` (then `stale`). Same as
  today plus the version option.
- A crash between commit and the post-commit steps loses the *nudge*, not the record: the `changes`
  row and the task are committed, and what is skipped is an emit, a run stop, a run end or an intent.
  Each is a named residue, not a silent one — the run stop and the intent are the two the `hold` /
  re-dispatch path already repairs; the run end is the one that does not (§8 B4). Subscribers that
  need replay get it in BC5 from `listChanges`.

## 10. Security — surfaces this change reaches

- `POST /api/actions/*`: state-changing, behind the existing auth middleware; actor from the
  middleware only, never the body (`core-api/src/middleware/auth.ts:142-149`); body validated by
  zod `.strict()`. The API-key actor-override header is existing behaviour and untouched.
- MCP `edit_task`: the same `run` as the human path; identity from the session's `ToolContext`,
  never from args. Same reach as today's `edit_task` tool.
- `changes` rows hold task-field diffs. Tasks carry no credentials.
- The six background writers (§6) write as `system:propagation` or as the session's own agent — real
  seeded user ids, never a synthetic or absent actor. The `changes.actor` FK is what makes that
  mechanical.
- Not touched: credentials, sandbox, outbound requests, plugin install, artifact rendering.

No new gate, per `.pipeline/rules/security.md`.

## 11. Verification

**New seam test** — `layers/core-api/src/__tests__/task-actions.integration.test.ts` on the
`{ db, app, eventBus }` fixture. Red first. It asserts: `edit_task` create as human (API key, no
actor header) and as agent (actor header) → identical rows; a refused transition → 422 with a
`Problem`; `open_task` returns `ancestors`, the nested `children` subtree, `tokensActualRollup` and
attachments, **and no `sessions`**; `search_tasks` filters, including `ids` and `excludeIds`; a
`changes` row exists after each edit carrying the field diff; a cascade kill writes one `changes` row
per killed descendant **with the root's actor**, and one `changes` row per freed dependent **with
`system:propagation`** — the two mechanisms of §6 asserted apart; two concurrent `appendNote` calls
both survive; `task_state_changed` emits on state change; accept-with-owner inserts one dispatch
attempt and records the work intent; **an owner change on an `in_progress` task inserts a second
attempt with `occasion: "owner_handoff"` and records a second intent** (the re-dispatch, §8 B4); a
session-started event fills that attempt's `sessionId`, and an owner change off that agent then calls
`endRunForHandoff` with exactly that id; a kill calls `stopRunsForTasks` with every killed id
including a `done` root.

**New rule test** — the attack pair in `governance-attacks.ts` (§7). Demonstrate it red once by
deleting one `LEGACY_ROUTES` entry, per the build's own property-4 discipline; that also demonstrates
the ratchet's second direction, since deleting the entry while the route still exists is a finding.

**Deleted and replaced by the seam test** — fourteen route- and tool-suite files whose subject is a
door that no longer exists: `src/__tests__/tasks.integration.test.ts` ·
`src/__tests__/BB1-task-hierarchy.integration.test.ts` ·
`src/__tests__/BB1-task-sibling-ordering.integration.test.ts` ·
`src/__tests__/task-search.integration.test.ts` · `src/__tests__/create-task.integration.test.ts` ·
`src/__tests__/handoff-to.integration.test.ts` · `src/__tests__/log-task.integration.test.ts` ·
`src/__tests__/task-dependencies-agent-tools.integration.test.ts` ·
`src/routes/__tests__/tasks.AK5-promote.integration.test.ts` ·
`src/routes/__tests__/tasks.BB1-patch-kill-cascades.integration.test.ts` ·
`src/routes/__tests__/tasks.batch-ids.integration.test.ts` ·
`src/routes/__tests__/tasks.task-run-baked-emit.integration.test.ts` ·
`task/src/__tests__/append-task-note.integration.test.ts` ·
`task/src/__tests__/bb1-task-hierarchy.integration.test.ts`.
Their assertions move into the seam test; none is dropped silently.

**Re-pointed, core-api** — `AD7-search` · `agent-work-intent-production` · `api-availability` ·
`api-e2e` · `dependency-freed` · `task-dependencies` · `routes/__tests__/AF11-authz` ·
`services/__tests__/core-api-port` · `services/__tests__/core-api-port-increment2-org-routine-handoff`
(loses its handoff third) · `services/__tests__/work-session-end-reactions` (its fixture stopped being
a fixture — production now fills `requestId`, so the test asserts the real path) ·
`services/__tests__/work-session-started-reactions` · `tool-registry` · `tool-registry-role` ·
`tool-schemas` (the tool roster shrinks by four and grows by three) ·
`real-harness-return-enforcement-realbinary` · `M3-lifecycle-propagation-auth` ·
`policy-engine` · `AD4-policy-engine` · `policy/src/__tests__/BB1-recursive-propagation` ·
`task/src/__tests__/work-completeness` · `task/src/__tests__/test-fixtures.ts` ·
`task/src/__tests__/task-run-resolver` · `task/src/__tests__/task-dispatch-attempt-store` ·
`tool-handlers/src/__tests__/stub-ports.ts` ·
`tool-handlers/src/__tests__/tool-handlers-completeness-contract` ·
`tool-handlers/src/__tests__/return-actions.closure`. Plus the stub bags that name the
core-internal `getTaskById` port: `routine/src/__tests__/routine-scheduler-completeness` ·
`routine/src/__tests__/routine-transition-constraint` ·
`run-orchestration/src/__tests__/context-bundle-consumption` ·
`run-orchestration/src/__tests__/knowledge-materialisation` ·
`run-orchestration/src/__tests__/context-assembly-reused-sandbox` ·
`services/__tests__/routine-scheduler-baked-emit` · `services/__tests__/BA9c-routine-event-context` ·
`services/__tests__/routine-scheduler-relocation` ·
`services/__tests__/agent-run-admission-failed-routine-run-migration`.

**Re-pointed, core-ui** — two stories, required per `.pipeline/rules/testing.md`:
`pages/WorkTaskPage.stories.tsx` (mocks `GET /api/tasks/:id/tree` and `PATCH /api/tasks/:id` at
:99-101) and `components/TaskDependencyField.stories.tsx` (mocks `?q=` and `?ids=`). Component and
hook tests: `src/__tests__/BB1-WorkTaskPage.test.tsx` ·
`src/pages/__tests__/WorkTaskPage.BB1.test.tsx` · `hooks/__tests__/useTaskLookup.test.tsx` ·
`hooks/__tests__/useTaskSearch.test.tsx` · `hooks/__tests__/useAgentRunState.test.tsx`.
`hooks/useTaskSessions.ts` and `hooks/__tests__/useTaskSessions.test.tsx` are untouched — neither
names a task route.

**Re-pointed, e2e** — `__e2e__/fixtures.ts` is the shared route mock and moves first; then
`W3-task-detail.spec.ts` · `lifecycle-propagation.spec.ts` · `AZ16-token-profiles.spec.ts` ·
`accessibility.spec.ts` · `accessibility-K8.spec.ts` · `page-orientation.spec.ts` ·
`touch-targets.spec.ts`. E2E is local-only; run the full suite, not the affected slice, or it passes
with zero tests.

**Harness lane** (local, obligatory — the tool roster changes): `npm run test:integration:harness`
green on all four harnesses before ship. Compare against `origin/main` first; that lane has known
red on main.

**End-to-end evidence**: run the app, open a task, set a state the invariant refuses → the control
is greyed with the reason; set a valid state → the page refreshes and `SELECT * FROM changes` shows
one row with `before`/`after`. Then kill a parent with live children and show one `changes` row per
descendant. Then hand a running task to another agent and show the predecessor session `done` and a
second dispatch attempt row. Judged in the running app, not from a screenshot in the diff.

`npm run verify` green, which by definition means the new rule is **green** — it is at `error` like
every other rule, and a red rule cannot ship. What the founder sees at the gate is the red *written
down*: `LEGACY_ROUTES` (107), `LEGACY_TOOLS` (17) and `LEGACY_EVENTS` (21), the to-do list for
BC3–BC6, each entry mechanically required to still exist. §7 says why that is the honest reading of
`plan.md:51-52` and what the amendment costs.

## 12. Documentation made false

`docs/process-layer/tasks-and-sessions.md` (the `PATCH /api/tasks/:id` edit door → `edit_task`, and
the handoff protocol section, which describes a file that no longer exists);
`docs/architecture/interfaces.md` route list; `docs/agent-layer/*` tool catalogue (`create_task`,
`edit_task`, `handoff_to`, `log_task`); `docs/guides/developer/*` API examples. The builder greps
`PATCH /api/tasks`, `handoff_to` and `create_task` under `docs/` and fixes each hit in the same PR.
Prose, so it does not count toward §13.

## 13. Order of work, and what it really costs

One PR. The order is a dependency order, not a preference — each step compiles on the one before.

1. declarations (§3) + the `changes` package, its `schema.ts` declaration and the migration (§4) +
   the four `table-owners.json` rows and the totals block;
2. the dispatch-attempt repair (§1, §6 row 1): `markRunning` on the store, the started reaction
   filling `requestId`/`sessionId`, and a test that `updateIfActive` now finalizes a real production
   row. It comes before the module because step 3's step-5b query depends on it, and it depends on nothing;
3. the task module (§5) — `createTaskActions`, the three actions, the moved invariants, the dispatch
   branch and the post-commit sequence — plus the HTTP loop and the new seam test. Red first, then
   green;
4. the tools adapter and the composed list threaded through both roots (§7) + the three surviving
   tools re-pointed to `open_task` through the new `ToolHandlersPorts` entry (§8 B1) + delete the four
   tools and all five seam methods;
5. re-point the six background writers (§6) + delete `handoff-protocol.ts` and
   `lifecycle-propagation.ts`'s private helper (§8 B4);
6. the UI — `call.ts`, the `zod` manifest row, the seven surfaces (§8 B2), the two pages' invariant
   wiring — and delete the hooks and the wire type;
7. the lint rule with its three constants, the attack pair and the `ATTACK_ANCHORS` rename (§7);
   delete `routes/tasks.ts` and the `work` remnants; the `one-work-primitive` `why` edit (§1); the
   docs sweep.

### Added lines of code — honestly counted

| Area | Added |
|---|---|
| Declarations, `framework/domain-model/src/actions/` (§3) | 200 |
| `changes` package scaffolding + `schema.ts` declaration + migration + journal (§4) | 170 |
| Dispatch-attempt repair: `markRunning`, the started reaction's write (§1, §6 row 1) | 50 |
| Task module: factory, three actions, read models, moved invariants, dispatch branch, post-commit sequence (§5) | 580 |
| Six background writers re-pointed, kill cascade internalised, `handleDependencyKilled` re-pointed (§6) | 160 |
| The loops: HTTP router, tools adapter, action types, composition threading through five files, `call.ts` (§7) | 270 |
| Seven UI surfaces re-pointed, two pages on `taskInvariants` (§8 B2) | 260 |
| Governance rule + three constants (145 data lines) + attack pair + anchor rename (§7) | 320 |
| New `task-actions.integration.test.ts` (§11) | 280 |
| Re-pointed tests, stories and e2e specs (§11) | 350 |
| **Total** | **≈ 2,640** |

Honest band: **2,550–2,750**. That is **above** the 2,300–2,500 this document carried before the
second critique, and well above `plan.md:99-100`'s 1,600–1,800. The growth is not new scope: it is
the three constants written out (§7), the handoff re-dispatch that was being cut by omission
(§8 B4), the dispatch-attempt repair (§1) and the run-stop dependency (§5). The founder accepted the
principle on 2026-09-13 — *"size doesn't matter too much, we are net red cleaning up"* — and the new
number is a gate line, not a reason to stop: deletions are far larger (`work` alone is 1,814 lines,
`routes/tasks.ts` 736, `handoff-protocol.ts` 385, plus the four tool bodies and fourteen deleted test
files), so the change stays net red by a wide margin.

Splitting into two PRs would leave the old routes and the new actions both alive across a merge —
a bridge — so one PR stands.

### Known overlaps with BC1 — three, not two

`plan.md:107-110` names two. The third is the migration filename.

1. the `attention_score` column in the task read model;
2. the plumbing list in the governance rule. §7's `PLUMBING_ROUTES` is the seventeen registrations
   that realise `ACTIONS.md:276-291`'s sixteen doors, derived by running the scan rather than typed
   out; at the rebase it is cross-checked against BC1's list, which owns that vocabulary. (An earlier
   draft's hand-typed example included `/ws`, which is not one of the sixteen — the failure mode a
   derived list avoids.)
3. `0082_changes_and_task_edit.sql`. BC1 drops two tables and a column
   (`.pipeline/work/BC1/plan.md:53`), so it takes `0082` first at `framework/db/drizzle/` — the last
   entry today is `0081_drop_items_layer` (`meta/_journal.json`, `idx: 81`). **Renumber this item's
   migration and its journal entry at the BC1 rebase.**

## Confusions

1. **BC2 emits no `task.changed`** — confirmed 2026-09-13. `plan.md:54-58` says the module hands the
   change row to the bus as a wake-up; `plan.md:57-58` says the old `task_state_changed` is emitted
   from the change row until BC5. So BC2 emits **only** `task_state_changed`. `task.changed` is one of
   the rule's nine object-event names (so clause 4's vocabulary is complete) but is not a member of
   `EVENT_TYPES` and nothing emits it.
2. **`WorkTaskPage` reads attachments twice.** Once `open_task` returns `attachments`, the page's
   existing `useParentedKnowledgeItems` is a second reach at the same data. Not in scope to delete
   here; BC4 owns it.
3. **The rule ships green, and the plan's gate line says red.** §7 and §11 state the reconciliation
   plainly — the three constants are the red, written down and ratcheted. It is a plan amendment and
   the founder decides it at the gate.
4. **The size band moved to 2,550–2,750** (§13). The founder owns that number at the gate too.

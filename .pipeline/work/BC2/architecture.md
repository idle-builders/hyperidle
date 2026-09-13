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

Two seam directions survive this item and are carried to BC6, the two `plan.md:76` names:
(1) core → `AgentOrchestrationPort.intents.submit`, the work intent after an accept;
(2) core → `AgentOrchestrationPort.runs.endForHandoff`, the running session ended when an owner
changes off an agent. Nothing else on the seam grows. In particular `open_task` does **not** read a
task's sessions — founder ruling 2026-09-13, upholding AU26 J4: the browser keeps combining
orchestration data itself.

---

## 1. Reconciliation with the code

| Plan says | Code today (`efa28dd59`) | Handled |
|---|---|---|
| 8 task routes | `routes/tasks.ts:238-735` — `GET /` (:238), `GET /:id` (:275), `GET /:id/tree` (:298), `POST /` (:335), `PATCH /:id` (:473), `POST /:id/outcome` (:652), `PATCH /:id/notes` (:682), `POST /:id/handoff` (:696) | all deleted; the `app.ts` mount removed |
| 4 task tools | `create_task` (:466), `edit_task` (:559), `handoff_to` (:256), `log_task` (:1441) in `tool-handlers/src/tool-definitions.ts`; seam methods `getTaskById · createTask · updateTaskById · appendTaskNote · handoffTask` on `CoreApiWorkPort` (`api-contract/src/core-api-port.ts:179,188,…`) | the four tools deleted; **all five** seam methods deleted — but `getTaskById` has three surviving callers that are re-pointed first (§8, B1) |
| `work` package, 14 methods | `layers/core-api/work` — also owns `items` and `taskDispatchAttempts` (`table-owners.json:15,16,41`) and exports `bakeTaskContextBundle · resolveTaskRunRequest` used by the run path | package renamed to `layers/core-api/task` (`@hyperidle/task`); all three table rows move with it; `items` keeps a surface until BC3 (`policy-engine`'s item append and the `create_item`/`get_item` seam methods still reach it); the two resolvers stay, private to the module |
| three UI hooks + one wire type | `useTaskPatch · useTaskTree · useTaskSessions`, `core-ui/src/types/task.ts` | `useTaskPatch`, `useTaskTree` and `types/task.ts` deleted. **`useTaskSessions` stays** — it calls `GET /api/agent-orchestration/runs?task_id=`, not a task route, so this item does not touch it (founder ruling 2026-09-13); BC6 owns it. Five more surfaces call the deleted routes and are re-pointed in the same step (§8, B2) |
| `audit_trail` dropped | written by `work-service.ts`, `policy/handoff-protocol.ts`, `policy/policy-engine.ts`, `policy/lifecycle-propagation.ts:41-49`; typed by `core-ui/src/types/task.ts:37`; no production reader renders it | column dropped in the migration; every writer above loses its append; `handoff-protocol.ts` is deleted outright (§8, B4); `policy-engine`'s *item* append survives until BC3 |
| dependencies wait then start (#550) | `task-state-machine.ts` holds a task with unmet dependencies; `done` frees dependents via `checkAndUnblockDependents` (`app.ts:429`) | "may not accept with unmet dependencies" becomes a server-side invariant inside `edit_task`; the unblock reaction keeps subscribing to `task_state_changed` but writes through `edit_task` (§6) |
| old event keeps firing | `task_state_changed` emitted at the tail of `transitionTask` (`task-state-machine.ts:384-394`); subscribers `app.ts:429`, `policy/lifecycle-propagation.ts:435` | emitted by `edit_task` after commit whenever `state` changed, same payload including the `cascade: true` flag a kill carries |
| sessions still start | `await deps.workIntents({ kind: "task_run", … })` after commit (`task-state-machine.ts:375-383`) through `AgentOrchestrationPort.intents.submit` | unchanged call, made from `edit_task` after commit. **The live dep is a callable, not `deps.workIntents.record(...)`** — the `.record` spelling survives only in the `@lore` at `task-state-machine.ts:206` |
| governance bus registry | `architecture.json` `eventBus.typesModule` = `framework/domain-model/src/events.ts` (the stale fork BC1 deletes) | BC1 repoints it; BC2 reads event names from `framework/event-bus/src/events.ts`' `EVENT_TYPES` (:637-668) |

No symbol the plan names is missing. No plan amendment needed.

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
  escalation and the escalation thread/item go with `handoff-protocol.ts` (§8, B4).
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

**Three registry edits go with the table, not one.** `changes` also needs its drizzle declaration in
`framework/db/src/schema.ts` — `registries-honest` validates `table-owners.json` against the live
table set the census derives from the schema module
(`tools/governance/src/rules/registries-honest.ts:34-43`), so an owner row for a table the schema
does not declare fails the build. In `tools/governance/table-owners.json`: `changes → "changes"`
(new), and `tasks` (:15), `items` (:16) and `taskDispatchAttempts` (:41) move from `"work"` to
`"task"`. Three rows, not two.

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
    // seam direction 1 — the work intent after an accept (BC6 removes it)
    submitWorkIntent(input: AgentWorkIntentRecorderInput): Promise<void>;
    // seam direction 2 — the running session ended when the owner changes off an agent
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
bag is bound in `layers/core-api/src/service-bootstrap.ts`, next to the equivalents at :176-177. The
layer face (`layers/core-api/src/index.ts`) exports `buildCoreActions(bindings): readonly Action[]`
whose body **calls** `createTaskActions(...)` — a bare Service identifier in direct callee position,
which is the sanctioned shape. No Service value is ever named on the face.

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

### `edit_task.run`, in order — the plan's paragraph as steps

1. load `prev` by `id` (null → create; then `teamId` is required unless `parentTaskId` supplies it,
   exactly as `routes/tasks.ts:339-355` does today, including the "parent not found" and
   "sourceKnowledgeItemId must exist" checks, which become `Problem`s rather than 404/400);
2. `next = { ...prev, ...input }` minus `appendNote`/`version`; if `input.version` is set and
   `prev.updatedAt !== version` → one `Problem { code: "stale" }`;
3. `taskInvariants(next, prev)` — pure; then the server checks, each moved rather than rewritten:
   `assertNoCycle` (`task-state-machine.ts:69`), team capacity on accept-with-owner
   (`countTeamTasksInProgress` + `teams.capacity`), owner exists (`deps.users.getUserById`), unmet
   dependencies on accept (the #550 guard). Any problems → `{ ok: false, problems }`, no write;
4. **one transaction**: upsert `tasks`; apply `appendNote` through the `AppendNoteOp` overload;
   sibling renumber when `position` changed (moved from `routes/tasks.ts:442-465`); when
   `state === "killed"`, the kill cascade runs **inside this transaction** as module-internal code
   (§6); auto-park to `hold` when dependencies were added to a task that can still reach `hold`
   (moved from `routes/tasks.ts:600-618`); then `deps.changes.appendChange(tx, { object: "task",
   objectId, kind, actor: ctx.actor, before, after, at: ctx.now })` — **one row per task touched**,
   so a cascade kill writes one row per killed descendant;
5. after commit, in this order: if `state` changed, `ctx.eventBus.emit(task_state_changed)` with
   today's payload (`cascade: true` preserved for cascade rows); if the owner changed **off an agent
   that has a running session**, `deps.agentOrchestration.endRunForHandoff(sessionId, ctx.now)`; if
   the edit accepted a task with an agent owner, `deps.agentOrchestration.submitWorkIntent({ kind:
   "task_run", … })` exactly as `task-state-machine.ts:375-383` does today. Steps 5b and 5c are the
   two seam calls carried to BC6;
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
(`agent-orchestration/src/routes/agent-orchestration-sessions.ts:115-131`) until BC6. That keeps the
seam at the two directions `plan.md:76` names: `AgentOrchestrationSessionsPort` stays
`getById(sessionId)` only (`api-contract/src/agent-orchestration-port.ts:64-69`), with no new port
operation and no new client method.

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
| 1 | `core-api/src/services/work-session-started-reactions.ts:79` — session started → `in_progress` | the same reaction, calling `edit_task.run(ctx, { id: event.taskId, state: "in_progress" })` in-process; the `TaskInvalidTransitionError` swallow becomes "problems returned → log and return", because `edit_task` returns problems instead of throwing | `event.agentId` — the session's own agent (`SessionStartedEvent.agentId`, `event-bus/src/events.ts:160`) |
| 2 | `core-api/task/src/dependency-watcher.ts:89` — last dependency met → `accepted` | `edit_task.run(ctx, { id, state: "accepted" })`; the accept's work-intent submit now happens once, inside `edit_task` step 5c, instead of inside `transitionTask` | `system:propagation` |
| 3 | `core-api/task/src/dependency-watcher.ts:164` — a dependency was killed → dependent back to `proposed` | `edit_task.run(ctx, { id, state: "proposed" })` | `system:propagation` |
| 4 | `core-api/policy/src/lifecycle-propagation.ts:164` — session ended → task to `review` or `done` | `edit_task.run(ctx, { id: taskId, state: target })`. The file's own private `transitionTask` helper (:18-78) is **deleted** — that is "the task half" `plan.md:9` removes. Its `auditTrail` JSON append (:41-49) dies with the column; its `work.transitionTaskState` port dep (`policy/src/ports.ts:33`) goes. The two subscriptions, the sibling/ancestor decision logic, `createShipConfirmationThread` (:336) and the `propagation_applied`/`propagation_failed` emits all stay | `system:propagation` — the constant already in the file at :86, seeded unconditionally by `core-api/src/bootstrap/factory-state.ts:36-41` |
| 5 | `core-api/policy/src/lifecycle-propagation.ts:271` — ancestor rollup | same as #4, same helper, same actor | `system:propagation` |
| 6 | `core-api/task/src/task-kill-cascade.ts:138` — kill each non-terminal task in the subtree | **internal to `edit_task`.** A kill is an edit with `state: "killed"`; descendants are collateral, never a second decision — the BB1 governance rule `one-work-primitive`'s reading. `cascadeTaskKill` stops being an exported entry point and becomes a private step inside `edit_task`'s transaction (§5 step 4), writing one `changes` row per killed descendant. Its downward run-stop dep and its awaited `handleDependencyKilled` call (:145-150) move with it unchanged | whoever issued the edit — a human's `userId` or the calling agent. A cascade inherits the root kill's actor; there is no second actor |

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

Registry file `tools/governance/actions.json`, read through the census's injected `readFile` the
same way `noPerFileAllowances` reads its input:

```json
{ "plumbing": [ …the sixteen from ACTIONS.md § plumbing, derived from BC1's list, not retyped… ],
  "pending":  { "thread":   ["routes/conversations.ts", "routes/threads.ts", "routes/reviews.ts"],
                "document": ["routes/knowledge.ts", "routes/search.ts"],
                "user":     ["routes/users.ts", "routes/org.ts", "routes/teams-routes.ts",
                             "routes/agents.ts", "routes/recipients.ts", "routes/credentials.ts",
                             "routes/filesystems.ts", "routes/harnesses.ts",
                             "routes/settings-agent-behavior.ts", "routes/routines-routes.ts",
                             "routes/notifications-routes.ts", "routes/assistant.ts",
                             "routes/coach.ts", "routes/hints.ts",
                             "agent-orchestration/src/routes/connections.ts",
                             "agent-orchestration/src/routes/filesystems.ts"],
                "session":  ["agent-orchestration/src/routes/sessions.ts",
                             "agent-orchestration/src/routes/agent-orchestration-sessions.ts"],
                "platform": ["routes/plugins.ts"] },
  "events":   ["task.created","task.changed","thread.created","thread.message","thread.changed",
               "document.created","document.changed","user.created","user.changed",
               "agent_work_intent_recorded","agent_run_admission_failed","agent_run_lifecycle_changed",
               "session_handoff_completed","sandbox_writeback_changes_detected","tool_call_recorded",
               "propagation_applied","propagation_failed"],
  "legacyEvents": ["task_state_changed","session_started","session_ended","session_not_returned",
                   "thread_created","thread_message_appended","thread_resolved","thread_reopened",
                   "thread_archived","item_created","dependency_met","knowledge_created",
                   "knowledge_updated","knowledge_archived","knowledge_accessed","team_created",
                   "agent_added","user_created","work_selection_requested","notification",
                   "routine_fired"] }
```

Four clauses, each over a population the rule derives and hard-fails at zero on:

1. every `name` declared in `framework/domain-model/src/actions/*` is referenced by string in
   `core-ui/src/**` (a `call("<name>"`) — else a finding;
2. every `router.<verb>("<path>"` in a **production** file is in `plumbing`, or its file belongs to
   an object still in `pending` — else a finding. In BC2: `routes/tasks.ts` must be gone. The
   population is **derived by scanning every production file for `router.<verb>(`**, not by a
   `layers/*/src/routes/**` glob — that glob misses
   `layers/agent-execution/harness-registry/src/mcp/mcp-route.ts:82` (`POST /mcp/:token/return-status`,
   one of the sixteen plumbing entries) and `layers/core-api/src/app.ts:272` (`GET /health`,
   likewise). A rule wired to a subset is the `au6` shape `.pipeline/rules/architecture.md:30-39`
   warns about. (`layers/core-api/src/__testing__/test-routes.ts` is a development file — a path
   segment starting with `__` — so the production predicate already excludes it, and that is the
   whole reason the predicate is "production file", not "file under `src/`".)
3. every tool `name:` in `tool-definitions.ts` belongs to an object still in `pending` — else a
   finding;
4. **the event clause, and it lands in this item** — not BC5. `plan.md:48-52` puts it here and
   `plan.md:93-105` records only three carry-overs; this is not one of them. The population is the
   compile-time-complete `EVENT_TYPES` array in `framework/event-bus/src/events.ts:637-668`, parsed
   through `readFile`. Every name in it must be in `events` or in `legacyEvents`; anything in
   neither is a finding. `EVENT_TYPES` is a superset of what is actually emitted — a type that can
   ride the bus is a type something may emit — so the clause cannot pass by missing an emit site,
   which a hand-rolled `eventBus.emit(` scan would. It is also compile-time-enforced complete
   (`:669-675`), so a new event type cannot slip past it.

`legacyEvents` is the twenty-one names that are neither one of the nine nor one of the eight
platform events at `efa28dd59`. It **only shrinks**, same discipline as `misplaced-files.json`:
BC3–BC6 delete their entries in the PR that replaces them, and a name may never be added back.
Three of the twenty-one — `thread_archived`, `dependency_met`, `work_selection_requested` — are
declared on the bus with **no production emitter** at this base (verified: the only live mentions
are comments in `core-api/routine/src/routine-scheduler.ts` and `domain-model/src/work-intent.ts`).
They are the three cheapest to delete and the honest first shrink; BC2 does not delete them because
the routine trigger surface still offers them as subscribable names.

**`pending` is a map, not a list, and that is load-bearing.** Clause 2 has to answer "which object
does this route file belong to", and no scan can derive that — `routes/credentials.ts` is *edit a
user* only because `ACTIONS.md` says so. So the mapping is written down once, keyed by object, with
every live route file on exactly one key. Two properties the rule checks and the builder must not
skip: every production route file found by the scan appears under exactly one key or is `plumbing`
(an unlisted file is a finding, so a new route file cannot arrive unclassified), and every listed
path exists (a stale path is a finding, so a rename fails loudly rather than quietly exempting
nothing). `routes/coach.ts` and `routes/hints.ts` are on the *delete outright* list at
`ACTIONS.md:298-303`, not on any action — they sit under `user` here only so BC2 is green, and
whichever item deletes them removes the rows too.

`pending` only shrinks too; BC3–BC6 each delete their entry in the PR that lands the module.
`minScope: 1`. Registered in **both** rule lists in `tools/governance/src/governance-lint.ts` —
`buildRules` (:104, the list `--attacks` shares) and `runLive`'s own `RULES` (:217). Registering in
one only means the rule is either break-tested but never run, or run but never break-tested.

**Attack case — required, or the build fails.** `tools/governance/README.md` property 4: a
registered rule with no positive attack case is a build error, and every case needs a control twin
(`src/lib/governance-attacks.ts:20-31`). Add to `ATTACKS`:

- **positive** `actions-projected-unclassified-route` — `overlay`
  `layers/core-api/src/routes/attack-task-overlay.ts` containing
  `router.get("/tasks/:id/summary", …)`: a new route file on an object that is not in `pending` and
  not `plumbing`, which is exactly how a deleted door comes back.
  `expect: { sort: "finding", file: …, ruleId: "actions-projected", messageContains: "actions.json" }`.
- **control** `actions-projected-pending-route-control` — the same act on an object that *is*
  pending, written the legal way: `mutate` the existing
  `layers/core-api/src/routes/threads.ts` to add one more `router.get("/:id/summary", …)`.
  `expect: { sort: "clean", file: "layers/core-api/src/routes/threads.ts" }`. Scoped to the file,
  like every other control here.

  The control has to *mutate* rather than *overlay*, because `pending` is a map of real paths (above)
  and a brand-new overlay file is unclassified on either object — it would report, and the control
  would pass for the wrong reason. The harness's own rule 3 backs this: an overlay path must not
  already exist and a mutated path must.

One more anchor edit comes with the rename: `ATTACK_ANCHORS.serviceDir` and `.serviceBarrel` point
at `layers/core-api/work/src` and `…/work/src/index.ts` (`governance-attacks.ts:119-122`). The
runner asserts those paths exist, so renaming `work` → `task` without updating them fails the
attack suite loudly — which is the design, but it is one more edit in this PR, not a surprise.

Registry edits in this item: `table-owners.json` (four rows, §4), `actions.json` (new),
`ATTACK_ANCHORS` (two paths). **No clause change in `governance-model.ts` — no founder ruling
needed.** A new rule is a decided rule, and it lands with its violations cleared in the same PR.

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
`open_task` **in this PR**, in step 3 of §13, before the seam method is removed. Same actor in every
case — `ctx.agentId`, which is what `getTaskById(id, actorId)` passes today.

| Tool | Call site | Becomes |
|---|---|---|
| `write_memory` (declared :189) | `:205-208` — resolve the calling task's `teamId` for the default scope | `open_task` in-process, reading `data.task.teamId` |
| `submit_review` (:699) | `:708` — load the parent task; `:773` — walk `parentTaskId` up to the root | two `open_task` calls, same loop, reading `data.task.parentTaskId` |
| `create_artifact` (:1489) | `:1536-1540` — same `teamId` resolution as `write_memory` | `open_task` in-process |
| `create_task` (:466) | `:487` — parent lookup | deleted with the tool |

Because `open_task` is in the composed list these three tools already live alongside, the re-point
is an in-process call, not an HTTP hop — the first place the new mechanism pays for itself. Once
they are moved, all five `CoreApiWorkPort` task methods and their client mirrors
(`agent-orchestration/src/services/core-api-port-composition.ts:447-449,502-504`,
`tool-handlers-bindings.ts:112,188-189`, `tool-handlers/src/ports.ts:372`) are deleted. Note the
name collision: `policy/src/ports.ts:26`, `routine/src/ports.ts:37` and `service-bootstrap.ts:176`
also declare a `getTaskById`, but those are **core-internal `(exec, id)` ports over `work.get`**,
not the seam method, and they are untouched by B1 — they die with the `work` rename instead.

### B2 — seven UI surfaces, not three

Deleting `routes/tasks.ts` breaks every one of these. All are re-pointed in step 4 of §13:

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

### B4 — handoff is an edit; `handoff-protocol.ts` is deleted

Founder decision, `plan.md:100-103`: *"Handoff is an edit that sets the owner: the caller names a
user, role targeting and the escalation thread go, the running session still ends through the
existing seam after commit until BC6."* So `layers/core-api/policy/src/handoff-protocol.ts` (385
lines) is deleted outright, with `buildHandoff` (`policy/src/index.ts:27`), `buildProductionHandoff`
and `buildHandoffDeps` (`core-api/src/services/policy-bindings.ts:48,54,143-147`), the
`HandoffParams`/`HandoffResult`/`HandoffMetadata` types, and the `claimTaskHandoff` CAS port
(`policy/src/ports.ts:28`, `work-service.ts`). What goes with it, named so the founder sees the
whole cut in one place:

- `toRole` / `toHuman` target resolution (:68-120, `users.findActiveTeammateByRole`) — **gone.** The
  caller names a user id.
- the escalation thread + escalation item (:230-259) — **gone.**
- the `session_handoff_completed` emit and the audit-trail `handoff` entry — **gone** with the
  column; a `changes` row with `before.ownerAgentId`/`after.ownerAgentId` is the record now.
- `deps.runOrchestration.endRunForHandoff` (:118) — **kept**, as `edit_task` step 5b. It moves from
  *before* the transaction to *after commit*, which is the ordinary post-commit order every other
  seam call in this module uses; the named residue changes from "run ended, task untouched" to
  "task updated, run still live", which is the repairable direction.
- the CAS transaction over the task — **replaced** by `edit_task`'s optional `version`.

This answers the critique's open question about `POST /agent-orchestration/runs/end-for-handoff`
(`agent-orchestration/src/routes/agent-orchestration-intake.ts:241`): `edit_task` calls it, through
`AgentOrchestrationPort.runs.endForHandoff` (`api-contract/src/agent-orchestration-port.ts:190`).
It stays a plumbing seam route, as `ACTIONS.md:286` keeps it, with exactly one caller.

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
- A crash between commit and the post-commit emit loses the *nudge*, not the record; the `changes`
  row is there. Subscribers that need replay get it in BC5 from `listChanges`.

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
attachments, **and no `sessions`**; `search_tasks` filters, including `ids` and `excludeIds`; a `changes` row
exists after each edit carrying the field diff; a cascade kill writes one `changes` row per killed
descendant with the root's actor; two concurrent `appendNote` calls both survive; `task_state_changed`
emits on state change; accept-with-owner records the work intent; an owner change off an agent with
a running session calls `endRunForHandoff`.

**New rule test** — the attack pair in `governance-attacks.ts` (§7). Demonstrate it red once by
deleting the `pending` entry for `thread`, per the build's own property-4 discipline.

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
(loses its handoff third) · `services/__tests__/work-session-end-reactions` ·
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
descendant. Judged in the running app, not from a screenshot in the diff.

`npm run verify` green; the new rule green for task and red for nothing — `pending` and
`legacyEvents` cover the rest.

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
   the four `table-owners.json` rows;
2. the task module (§5) — `createTaskActions`, the three actions, the moved invariants — plus the
   HTTP loop and the new seam test. Red first, then green;
3. the tools adapter and the composed list threaded through both roots (§7) + the three surviving
   tools re-pointed to `open_task` (§8 B1) + delete the four tools and all five seam methods;
4. re-point the six background writers (§6) + delete `handoff-protocol.ts` and
   `lifecycle-propagation.ts`'s private helper (§8 B4);
5. the UI — `call.ts`, the `zod` manifest row, the eight surfaces (§8 B2), the two pages' invariant
   wiring — and delete the hooks and the wire type;
6. the lint rule, `actions.json`, the attack pair and the `ATTACK_ANCHORS` rename (§7); delete
   `routes/tasks.ts` and the `work` remnants; the docs sweep.

### Added lines of code — honestly counted

| Area | Added |
|---|---|
| Declarations, `framework/domain-model/src/actions/` (§3) | 200 |
| `changes` package scaffolding + `schema.ts` declaration + migration + journal (§4) | 170 |
| Task module: factory, three actions, read models, moved invariants (§5) | 510 |
| Six background writers re-pointed, kill cascade internalised (§6) | 150 |
| The loops: HTTP router, tools adapter, action types, composition threading through five files, `call.ts` (§7) | 270 |
| Seven UI surfaces re-pointed, two pages on `taskInvariants` (§8 B2) | 260 |
| Governance rule + `actions.json` + attack pair + anchor rename (§7) | 250 |
| New `task-actions.integration.test.ts` (§11) | 250 |
| Re-pointed tests, stories and e2e specs (§11) | 350 |
| **Total** | **≈ 2,410** |

Honest band: **2,300–2,500**. Deletions are larger — `work` alone is 1,814 lines, `routes/tasks.ts`
736, `handoff-protocol.ts` 385, the four tool bodies and fourteen deleted test files on top — so the
change is net red by a wide margin.

This is above the 1,600–1,800 at `plan.md:99-100`; the founder accepted the real number on
2026-09-13 — *"size doesn't matter too much, we are net red cleaning up"* — so the builder proceeds
on it rather than stopping to ask.

Splitting into two PRs would leave the old routes and the new actions both alive across a merge —
a bridge — so one PR stands.

### Known overlaps with BC1 — three, not two

`plan.md:107-110` names two. The third is the migration filename.

1. the `attention_score` column in the task read model;
2. the plumbing list in the governance rule — keep it **derived from BC1's list**, never retyped.
   (An earlier draft's example list included `/ws`, which is not one of the sixteen at
   `ACTIONS.md:274-291`. That is the failure mode a derived list avoids.)
3. `0082_changes_and_task_edit.sql`. BC1 drops two tables and a column
   (`.pipeline/work/BC1/plan.md:53`), so it takes `0082` first at `framework/db/drizzle/` — the last
   entry today is `0081_drop_items_layer` (`meta/_journal.json`, `idx: 81`). **Renumber this item's
   migration and its journal entry at the BC1 rebase.**

## Confusions

1. **BC2 emits no `task.changed`** — confirmed 2026-09-13. `plan.md:54-58` says the module hands the
   change row to the bus as a wake-up; `plan.md:57-58` says the old `task_state_changed` is emitted
   from the change row until BC5. So BC2 emits **only** `task_state_changed`. `task.changed` is
   declared in `actions.json`'s `events` (so the rule's clause is complete) but is not a member of
   `EVENT_TYPES` and nothing emits it.
2. **`WorkTaskPage` reads attachments twice.** Once `open_task` returns `attachments`, the page's
   existing `useParentedKnowledgeItems` is a second reach at the same data. Not in scope to delete
   here; BC4 owns it.

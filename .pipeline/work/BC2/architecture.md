# BC2 — architecture

Technical reading of `plan.md` § How it works, `plans/reviews/LAYER-BELOW.md` §3, §4, §7, §8 and
`plans/reviews/ACTIONS.md` § Task. Decides nothing the plan does not; names the contracts a builder
needs. Tier: mvp. Checked against `origin/main` @ `1df6da350` (2026-09-12).

Locked here: names on the wire, where the declarations live, the `changes` table, the three loop
signatures, the lint rule's shape, the seam test. Left to the builder: file layout inside the task
module, helper names, query shapes.

---

## 1. Reconciliation with the code

| Plan says | Code today | Handled |
|---|---|---|
| 8 task routes | `routes/tasks.ts:238-696` — `GET /`, `GET /:id`, `GET /:id/tree`, `POST /`, `PATCH /:id`, `POST /:id/outcome`, `PATCH /:id/notes`, `POST /:id/handoff` | all deleted; `app.ts:368` mount removed |
| 4 task tools | `create_task · edit_task · handoff_to · log_task` in `tool-handlers/src/tool-definitions.ts`; seam methods `getTaskById · createTask · updateTaskById · appendTaskNote · handoffTask` in `api-contract/src/core-api-port.ts:171` | tools deleted; the five `CoreApiWorkPort` methods and their hand-typed client mirrors (`core-api-port-composition.ts`, `tool-handlers/src/ports.ts`) deleted |
| `work` package, 14 methods | `layers/core-api/work` — also owns `items` (`table-owners.json`) and exports `bakeTaskContextBundle · resolveTaskRunRequest` used by the run path | package renamed to `layers/core-api/task` (`@hyperidle/task`); `items` ownership moves with it until BC3; the two resolvers stay, private to the module's `run` for accept |
| three UI hooks + one wire type | `useTaskPatch · useTaskTree · useTaskSessions`, `core-ui/src/types/task.ts`; `WorkTaskPage.tsx:44-46,321,484-492`, `WorkTaskCreate.tsx:85` | deleted; pages call `call()` |
| `audit_trail` dropped | written by `work-service.ts`, `policy/handoff-protocol.ts`, `policy/policy-engine.ts`, `policy/lifecycle-propagation.ts`; read by `types/task.ts`, `WorkTaskPage.stories.tsx`, `__e2e__/fixtures.ts` | column dropped in the migration; every writer above loses its append; handoff-protocol dies with handoff (it is `edit_task` now); policy-engine's item append survives until BC3 |
| dependencies wait then start (#550) | `task-state-machine.ts` + `dependency-watcher.ts`: a task with unmet dependencies is held; `done` frees dependents (`app.ts:429`) | "may not accept with unmet dependencies" becomes a server-side invariant; the unblock reaction keeps subscribing to `task_state_changed` (plan: downstream does not move) |
| old event keeps firing | `task_state_changed` emitted at `task-state-machine.ts:253`; subscribers `app.ts:429`, `policy/lifecycle-propagation.ts:434` | emitted by the module after commit whenever `state` changed, same payload |
| sessions still start | `deps.workIntents.record` after commit (`task-state-machine.ts:106,231`) through `AgentOrchestrationPort.intents.submit` | unchanged call, made from `edit_task` after commit; the port stays until BC6 |
| governance bus registry | `architecture.json` `eventBus.typesModule` = `framework/domain-model/src/events.ts` (the stale fork BC1 deletes) | BC1 repoints it; BC2 assumes `framework/event-bus/src/events.ts` |

No symbol the plan names is missing. No plan amendment needed.

## 2. Names on the wire — locked

Tool names must satisfy every harness today; underscore names already do and dotted names are
unverified against the Anthropic tool-name pattern, so:

| Action (sentence) | `name` | HTTP | MCP tool | UI |
|---|---|---|---|---|
| Search tasks | `search_tasks` | `POST /api/actions/search_tasks` | `search_tasks` | `call("search_tasks", …)` |
| Open a task | `open_task` | `POST /api/actions/open_task` | `open_task` | `call("open_task", …)` |
| Edit a task | `edit_task` | `POST /api/actions/edit_task` | `edit_task` | `call("edit_task", …)` |

One name, four places. Events stay dotted (`task.changed`) — they never pass a tool-name check.
Reads are POST too: one shape for the loop, a body for filters, no query-string encoding of zod.

## 3. Declarations — `framework/domain-model/src/actions/`

`domain-model` already ships zod, has audience `everyone`, and is what `core-ui` imports today; no
new framework package, no `architecture.json` surface edit.

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
export const TASK_STATES, TaskSchema (the row shape, replaces core-ui types/task.ts)
export const searchTasks: ActionDeclaration<SearchTasksInput, TaskListItem[]>
export const openTask:    ActionDeclaration<{ id: string }, TaskView>   // task + subtasks + sessions + thread id + attachments
export const editTask:    ActionDeclaration<EditTaskInput, TaskView>    // partial; id optional = create; optional `version`
export const taskInvariants: (next: Task, prev: Task | null) => Problem[]  // PURE: state reachable, required fields, verdict only in done/killed
export const TASK_ACTIONS = { search_tasks: searchTasks, open_task: openTask, edit_task: editTask } as const
```

`EditTaskInput` is the union of what the eight routes accept today: `id? · parentTaskId · teamId ·
ownerAgentId · title · description · doneCondition · state · position · needsReview · dependencies ·
notes · outcome{verdict,summary} · sourceKnowledgeItemId · version?`. Handoff = `ownerAgentId`.
Outcome = `outcome`. Notes = `notes`. `canTransitionTaskState` / `TASK_STATE_TRANSITIONS`
(`domain-model/src/task-transition.ts`) are folded into `taskInvariants`; no second copy survives.

The server-only invariants (cycle via ancestors, team capacity at accept, owner exists, unmet
dependencies at accept) are not here; they run inside `run` and return the same `Problem` shape.

## 4. The `changes` table — `layers/core-api/changes`

A new service package owning one table (`table-owners.json`: `changes: "changes"`). It is the event
log the plan describes, and later the source for subscriptions and the UI stream (BC5). It is not an
audit control and adds no gate.

```sql
-- 0082_changes_and_task_edit.sql
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

`before`/`after` hold only the fields that differ (plus `id`), not the whole row. Migration is a
hand-written `.sql` + `_journal.json` entry per `framework/db/drizzle/README.md`; no backfill —
nothing reads `audit_trail`.

## 5. The task module — `layers/core-api/task`

Public surface: `export const taskActions: readonly Action[]` and nothing else.

```ts
// what a module exports for the loops (lives in core-api, not framework: it carries db)
export interface ActionContext { readonly actor: string; readonly db: HyperIdleDb; readonly now: string }
export interface Action<I = unknown, O = unknown> {
  readonly declaration: ActionDeclaration<I, O>;
  readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}
```
`ActionContext`/`Action` are defined once in `layers/core-api/src/actions/` (the layer's own
composition code, next to `compose-api-application.ts`), imported by modules and loops.

`edit_task.run`, in order — this is the plan's paragraph as steps:
1. load `prev` by `id` (null → create; then `teamId` required unless `parentTaskId` gives it, as
   `routes/tasks.ts:328-333` does today);
2. `next = { ...prev, ...input }`; if `input.version` is set and `prev.updatedAt !== version` → one
   `Problem { code: "stale" }`;
3. `taskInvariants(next, prev)` — pure; then server checks: `assertNoCycle` (existing, moved),
   capacity on accept-with-owner (existing `countTeamTasksInProgress` + `teams.capacity`, moved),
   owner exists, unmet dependencies on accept (existing, moved). Any problems → `{ ok:false }`, no
   write;
4. one transaction: upsert `tasks`; sibling renumber when `position` changed (moved from
   `routes/tasks.ts:442-465`); kill cascade when `state === "killed"` (existing `cascadeTaskKill`,
   moved); `appendChange(tx, { object:"task", kind, actor, before, after })`;
5. after commit: if `state` changed, `eventBus.emit(task_state_changed)` with today's payload; if the
   edit accepted a task with an agent owner, `deps.workIntents.record(...)` exactly as
   `task-state-machine.ts:231` does today;
6. return `open_task.run(ctx, { id })`.

`open_task.run`: one read model — task row, children ordered by `position`, sessions for the task
(today `useTaskSessions` → `GET /agent-orchestration/sessions?taskId=` — in BC2 the module reads
`sessions` **through the existing `AgentOrchestrationPort.sessions`**, never the table; the port stays
until BC6), `threadId`, attachments = knowledge items with `parentKind='task'` via `@hyperidle/knowledge`
`listItemIdsByParent` (the neighbour's existing read; BC4 swaps it to `open_document`).
`search_tasks.run`: `work-service.ts`'s `list` filter (`parentTaskId · ownerAgentId · state · teamId ·
text`) preserved as the input shape; returns list rows, not trees.

Actor: `ctx.actor` is `c.get("userId")` (HTTP) or `ToolContext.agentId` (MCP). Never from the body.

## 6. The loops

**HTTP** — `layers/core-api/src/actions/actions-router.ts`:
```ts
export function createActionsRouter(actions: readonly Action[], deps: { db }): Hono<HyperIdleEnv>
// for each: router.post(`/${declaration.name}`, validateBody(declaration.input), async c =>
//   result = await run({ actor: c.get("userId"), db, now }, c.req.valid("json"))
//   result.ok ? c.json(result, 200) : c.json(result, 422))
```
Mounted at `api.route("/actions", …)` in `app.ts` behind the existing auth middleware. 404 for an
unknown name falls out of Hono. Composition: `app.ts` receives `actions` from the root the same way
it receives `db`.

**MCP** — `layers/core-api/src/actions/actions-as-tools.ts`:
```ts
export function actionsAsTools(actions: readonly Action[], db: HyperIdleDb):
  readonly { name; description; inputSchema; handler(args, ctx: { agentId: string }) }[]
```
Structurally a `RegisteredTool`; no `harness-protocol` import in core-api. The root
(`applications/*/src/create-server.ts`, both copies) builds
`[...actionsAsTools(taskActions, db), ...legacyToolDefinitions]` and hands it where
`tool-handlers-bindings` output goes today (`run-orchestration-composition.ts:380`
`buildToolRegistry(definitions, ctx, …)`). The MCP bridge is untouched: it iterates
`registry.definitions` (`mcp-bridge.ts:141-157`). `roles` is omitted — every actor gets every action;
authorization is an invariant, not a filter (plan; ETHOS).

**UI** — `layers/core-ui/src/services/call.ts`:
```ts
type Actions = typeof TASK_ACTIONS   // grows per item: & typeof THREAD_ACTIONS …
export async function call<N extends keyof Actions>(name: N, input: z.input<Actions[N]["input"]>):
  Promise<ActionResult<z.output<Actions[N]["output"]>>>   // apiFetch POST /api/actions/<name>
```
`WorkTaskPage` and `WorkTaskCreate` use `call` + `taskInvariants(next, prev)` to enable/grey each
control and show `problems[].message`; `refresh` after a successful edit as today.

**Lint** — `tools/governance/src/rules/actions-projected.ts`, registered in `governance-lint.ts`,
with a registry file `tools/governance/actions.json`:
```json
{ "plumbing": ["/auth/*", "/health", "/ws", "/mcp/:token", …16 entries from ACTIONS.md § plumbing],
  "pending": ["thread", "document", "user", "session", "platform"] }
```
Evaluate, over the census:
- every `name` in `domain-model/src/actions/*` is referenced by string in `core-ui/src/**` (a `call("<name>"`) — else finding;
- every `router.<verb>("<path>"` in `layers/*/src/routes/**` is plumbing, or its file belongs to an
  object still in `pending` — else finding (in BC2: `routes/tasks.ts` must be gone);
- every tool `name:` in `tool-definitions.ts` belongs to a `pending` object — else finding.
`pending` only shrinks; BC3–BC6 each delete their entry in the PR that lands the module. The event
clause (every emitted event is one of 9 + 8) is added in BC5 when the nine exist. `minScope: 1`.
Registry edits in this item: `table-owners.json` (`tasks`, `items` → `task`; `changes` → `changes`);
`actions.json` new. No clause change — no founder ruling needed.

## 7. Deletions (do not count toward the size check)

`layers/core-api/work` (renamed, its routes-facing exports gone) · `routes/tasks.ts` · the four tools
and their `ToolHandlersPorts` accessors · `CoreApiWorkPort` task methods + client mirrors ·
`useTaskPatch · useTaskTree · useTaskSessions · types/task.ts` · `policy/handoff-protocol.ts` ·
`audit_trail` writers · `domain-model/src/task-transition.ts` (folded into invariants).

Consumers derived from the repo, not the plan: `rg -l "@hyperidle/work"` (≈ `routes/tasks.ts`,
`app.ts`, `service-bootstrap.ts`, four reaction files, `policy`, `run-orchestration` via the two
resolvers) — each import re-pointed to `@hyperidle/task`.

## 8. Failure behaviour that changes

- A refused edit is `422 { ok:false, problems }` / a tool result `isError` with the problems' messages,
  instead of today's mix of 400/409/422 and typed throws.
- Two concurrent edits: last write wins unless the loser passed `version` (then `stale`). Same as today
  minus the version option.
- A crash between commit and the post-commit emit loses the *nudge*, not the record; the change row is
  there. Subscribers that need replay get it in BC5 from `listChanges`.

## 9. Security — surfaces this change reaches

- `POST /api/actions/*`: state-changing, behind the existing auth middleware; actor from the
  middleware only; body validated by zod `.strict()`. The API-key actor-override header is existing
  behaviour and untouched.
- MCP `edit_task`: the same `run` as the human path; identity from the session's `ToolContext`, never
  from args. Same reach as today's `edit_task` tool.
- `changes` rows hold task-field diffs. Tasks carry no credentials.
- Not touched: credentials, sandbox, outbound requests, plugin install, artifact rendering.
No new gate, per `security.md`.

## 10. Verification

- **Seam test (new)** `layers/core-api/src/__tests__/task-actions.integration.test.ts` on the
  `{ db, app, eventBus }` fixture: `edit_task` create as human (API key, no actor header) and as agent
  (actor header) → identical rows; refused transition → 422 with a `Problem`; `open_task` returns
  children + sessions + attachments; `search_tasks` filters; a `changes` row exists after each edit
  with the diff; `task_state_changed` emitted on state change; accept-with-owner records the work
  intent (assert via the existing seam fixture).
- **Existing lanes**: `core-api-port*.integration.test.ts` for the seam methods that remain;
  `task-dependencies*.integration.test.ts` (#550) re-pointed at `call`-shaped requests; component
  tests for `WorkTaskPage` asserting a control is disabled with the invariant's message.
- **Harness lane** (local, obligatory — tool definitions change): `npm run test:integration:harness`
  green on all four harnesses before ship.
- **End-to-end evidence**: run the app, open a task, set a state the invariant refuses → the control is
  greyed with the reason; set a valid state → the page refreshes and `SELECT * FROM changes` shows one
  row with `before`/`after`. Recorded as a manual check with a screenshot link in the PR.
- `npm run verify` green; the new rule green for task, red-free because `pending` covers the rest.

## 11. Documentation made false

`docs/process-layer/tasks-and-sessions.md` (the `PATCH /api/tasks/:id` edit door → `edit_task`);
`docs/architecture/interfaces.md` route list; `docs/agent-layer/*` tool catalogue (`create_task` …);
`docs/guides/developer/*` API examples. The builder greps `PATCH /api/tasks` and `create_task` under
`docs/` and fixes each hit in the same PR.

## 12. Order of work — one PR

1. declarations (§3) + `changes` package and migration (§4) + registry edits (§6);
2. task module (§5) + HTTP loop + seam test — red first, then green;
3. tools adapter + root wiring + delete the four tools and seam methods;
4. UI `call` + invariants on the two pages + delete hooks and wire type;
5. lint rule + `actions.json`; delete `routes/tasks.ts` and the `work` remnants; docs.

Added lines, estimate: declarations ~150 · changes ~120 · module ~500 (mostly moved) · loops ~150 ·
UI ~120 · rule ~120 · tests ~300. Near the 1,000-line simplicity threshold; the founder is asked at
approval rather than stopping the builder mid-item. Splitting into two PRs would leave the old routes
and the new actions both alive across a merge — a bridge — so one PR is preferred.

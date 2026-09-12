# BC2 — The action list, proven end to end on task

## What we need

**Why this exists.** The mechanism that has never existed — declare an action once, project it to a route, a tool, a UI affordance and a lint check — is what makes reach parity a property instead of an audit. Proving it on the smallest object first means BC3–BC6 copy a working pattern instead of inventing one each.

**What exists today.** `layers/core-api/work` (1,814 lines) with 14 public methods; 8 task routes in `routes/tasks.ts` (627 lines) owning validation, transactions, events and shaping; four task tools (`create_task · edit_task · handoff_to · log_task`) reaching those routes through an HTTP client seam (`CoreApiPort`); three UI hooks and one hand-copied wire type. The tool-definition shape (`name · description · inputSchema · handler · roles`) is already the action shape; only the tool registry reads it. The event bus is in-memory and unpersisted.

**Missing delta.** The action shape and `ctx` in `framework/domain-model`; the `changes` table and its append helper; the `task` module (search · open · edit, the state machine as `invariants`, one read model for the list); the HTTP mount loop, the MCP register loop (in-process, the first tool that does not use the seam), the UI client type and `call`; the governance rule (every entry mounted, registered, referenced; every route an entry or plumbing; every tool an entry; every emitted event one of 9 + 8); the task page and tree reading through `call` and `invariants`. Deletes `work`, the task routes, the four tools and their seam methods, the hooks, the wire type, and the task half of `policy/lifecycle-propagation.ts`.

**Depends on.** BC1 — the rule's plumbing list must be the real sixteen; the attention column must be gone before the read model is cut.

**Dials (provisional).** complexity: suite · ambiguity: established context · exposure: public contract

## How it works

This item builds the mechanism once and proves it on task, the smallest object. BC3–BC6 copy it.

**One list.** A task is described by one module that exports three actions — search a task, open a
task, edit a task — each as a name, the sentence an agent reads, the shape of its input, the
invariants, and what it does. Nothing else about task is public. Today the same knowledge is spread
over the work service (14 methods), eight routes, four tools, three UI hooks and a hand-copied type.

**Edit is the only write.** Edit a task takes a partial: a title, a state, an owner, an outcome,
notes, dependencies, a parent, whatever is being changed; without an id it creates. The module loads
the current task, applies the partial, and runs the invariants over the *whole resulting task*: is
this state reachable from that one, does this parent make a cycle, is the team at its in-progress
limit, does an owner exist. Any failure is returned as a list of problems with reasons — not thrown.
If there are none, the task is written and one row is appended to a new `changes` table in the same
transaction: which object, which id, who did it, what changed (before and after), when. Then the
transaction commits. That row is the event. Today three of those checks live in the state machine,
one in the route, and none is visible to the UI.

**Two reads.** Search a task is one list with filters (parent, owner, state, team, text), backed by
one query that does the joins the list screen needs. Open a task returns the task with what the
page shows: subtasks, the sessions that ran on it, its thread, its attachments — one query, not a
tree route plus a sessions route plus a thread fetch.

**The same invariants light up the UI.** The invariants are a plain function of the resulting task.
The parts that need only the task itself (state transitions, required fields) run in the browser
to enable or grey a control and say why; the parts that need the database (cycle, capacity) run on
the server and come back as the same problem list. One function, two places it is called.

**Everything else is a loop over the list.** HTTP: for each action, mount `POST /api/task/<action>`
that parses the input with the action's shape, calls it as the authenticated user, returns the
result. MCP: for each action, register a tool with the action's name, sentence and shape, calling it
in-process as the session's agent — the first tool that does not dial its own process over HTTP.
UI: a typed `call("task.edit", input)` derived from the list, replacing the hooks. Lint: a governance
rule that fails if any entry is not mounted, not registered, or not referenced from the UI, if any
route is not an entry or one of the sixteen plumbing routes, if any tool is not an entry, or if any
emitted event is not one of the nine or the eight platform events. On this item the rule is green for
task and red for every other object — that red is the to-do list for BC3–BC6.

**Events.** After commit, the module hands the change row to the in-process bus as a wake-up. What
subscribes today (the dependency unblocker, policy propagation, the session reactions) keeps
subscribing to the old `task_state_changed` shape until BC5 replaces subscriptions; in this item the
old event is emitted from the change row so nothing downstream moves yet. The `changes` table is the
record; the bus is only a nudge.

**Sessions still start.** Today accepting a task with an agent owner records a work intent through
the orchestration seam, and orchestration starts a session. That one cross-layer call stays in this
item, made from inside edit-a-task after commit — the founder's rule is that orchestration is a
request-driven executor and this is the request. BC5 replaces it with the owner's subscription; BC6
removes the seam's other direction.

**Where the declaration lives.** The three actions' names, sentences, input shapes and pure
invariants go in `framework`, because the UI cannot import `core-api` and must read the same
invariant the server runs. The task module in `core-api` implements what they do. This is what
replaces `api-contract`'s hand-mirrored types.

**Modules reach each other only through actions.** When a later item needs the task from another
module — a verdict message finishing a task, a session end recording tokens — it calls edit-a-task
after its own commit, as the same actor, in-process. Never the task table, never a shared
transaction. Ids stay ids. Orchestration's session end reaches the task through one port the
composition root binds to edit-a-task; core's accept reaches orchestration through one port bound
to *run this work*. Those two ports are all that is left of the seam.

**Screens follow, not rebuilt.** The task page and the task tree stop calling routes and call the
list. Controls read the invariants. No redesign — that is the next phase.

**Rejected.** Keeping the routes as the declaration (they would still repeat the schema three ways).
A framework for the client types (17 entries need none). Emitting the event before commit (loses
it on rollback). Deleting the orchestration request in this item (nothing else would start a
session until BC5).

**Left simple.** One transaction per edit, no optimistic locking unless a version is passed. The
`changes` row carries a JSON diff, not an event-sourcing log. `audit_trail` on the task is dropped —
the change rows are its replacement. If two people edit the same task at once, last write wins,
which is what happens today.

## How we work on this

## Confusions

## Proposed items

# Actions

*Renamed 2026-09-11 by the founder: the objects are **task · thread · document · user**. "Conversation" and "person" were working names and are not nouns we use.*

The human-readable list of what a user or an agent does in HyperIdle. This is what the
agent reads. Base `origin/main` @ `f88b71434`.

**Rule:** an action is something a user would say they're doing. A route is a fragment of
one; a god-tool is a bundle of them. Neither is on this list.

**Team is not an object.** It's an attribute on a user and a filter on the people list.
Created and seen through the actions below, never its own.

---

## The thirteen

### Task

| Action | What it does |
|---|---|
| **Search tasks** | No parameter lists them. Filter by name, by parent task, or by dependent task. |
| **Open a task** | Everything about it — content, state, assignment, subtasks, sessions that ran on it, attachments. |
| **Edit a task** | New or existing. Title, content, state, attachments, assignment (which is handoff), outcome, notes. |

### Thread

| Action | What it does |
|---|---|
| **Search threads** | With or without a parameter. |
| **Open a thread** | Every message and its parts, title, recipients, attachments, reviews. |
| **Send a message** | To a thread id, or to recipients — which starts a new thread. The message may be plain, a review, a verdict, an answer, an item, or carry a file. Sending with an existing message id overwrites that message. |
| **Adjust a thread** | Title, recipients, delete. |

### Document

| Action | What it does |
|---|---|
| **Search documents** | With or without a parameter. |
| **Open a document** | Content, meta, path, conflicts, children — everything. |
| **Edit a document** | New or existing. Title, content, type, meta, status, move, merge, split, conflicts. |

### User  *(human or agent — same actions)*

| Action | What it does |
|---|---|
| **Search people** | With or without parameters. Team is a filter. Kind (human / agent) is a filter. |
| **Open a user** | Role, team, org edges, prompt, skills, subscriptions, notifications, everything attached. |
| **Edit a user** | New or existing. Name, prompt, skills, edges, team, status, harness and model, filesystems. |

### Files

Not an action. An attachment anywhere is a file. An agent sees it in its filesystem; a
user reaches it as a file — git, S3, Drive, local.

---

## Session

Agent orchestration. Needs tooling, and it's the area rethought constantly against what the
harness itself offers — so this is the smallest surface that works today, not a design.

| Action | What it does |
|---|---|
| **See what's running** | Sessions and runs, filterable by task, by user, by state. |
| **Watch a session** | The live stream of what an agent is doing. The one genuinely stream-shaped thing in the system. |
| **Stop a session** | Abort it. Today's `POST /agent-orchestration/runs/abort`, seam-only. |

There is no *start a session*. A user doesn't start an agent — they give it work, through
*edit a task* (assign it) or *send a message* (ask it). That's already how it works.

## Plugins

The one platform thing. Everything else that used to be "setup" turned out to be an
attribute of a user — what an agent runs on, can reach, can see — and lives on *open /
edit a user*. Task, thread and document have no settings at all.

| Action | What it does |
|---|---|
| **Manage plugins** | Install, remove, enable or disable a plugin; reset a contribution to what the plugin shipped. The shared-backend key lives here too — it is the only key left. |

Defaults are plugin contributions with user overrides. The configuration layer already
models this (`builtin | plugin | user` origin); "change a default" is an override on a
contribution, not a separate thing.

## Routines — why it feels wrong, and a proposal

A routine today is **an owner + a trigger + a prompt + a state**. Under the new model the
prompt is already a document and the owner is already a user. What's left is the trigger:
"when X happens, this user runs this document."

That's not a thing. It's a **binding** — an edge between a user and a document, keyed by an
event. It feels wrong as an object because it isn't one; it's a relationship that lives on
one of its ends.

**Proposal: it lives on the user.** A user has *subscriptions*. For an agent, a
subscription says: when this event fires, run this document. For a human, the same
subscription says: when this event fires, tell me. That is your symmetry rule, made literal.

- *Open a user* shows their subscriptions.
- *Edit a user* adds, changes, pauses, removes them.
- "Run it now" is *send a message* to that user: do your X now.
- Muting a notification is the same edit on a human.

No new actions. The seven routine routes and the two mute routes land on actions that
already exist. Run history is the session log, because a run *is* a session.

*If it stays its own object:* search routines · open a routine · edit a routine · run a
routine now. Four more actions, and the human mute stays separate from it — which is the
asymmetry the model exists to remove.

## Plumbing

Internal seams, auth, health. A route, nothing else, ever. Sixteen of the 126, plus the MCP
return hook on the harness layer; none hides an action a user would say.

---

## Every current route, mapped

126 routes. `→` is where it lands.

### tasks

| Route | → |
|---|---|
| `GET /tasks` | search tasks |
| `GET /tasks/:id` | open a task |
| `GET /tasks/:id/tree` | open a task |
| `POST /tasks` | edit a task (new) |
| `PATCH /tasks/:id` | edit a task |
| `PATCH /tasks/:id/notes` | edit a task |
| `POST /tasks/:id/handoff` | edit a task |
| `POST /tasks/:id/outcome` | edit a task |

### threads

| Route | → |
|---|---|
| `GET /threads` | search threads |
| `GET /threads/:id` | open a thread |
| `POST /threads` | send a message (to recipients) |
| `POST /threads/direct` | send a message (to recipients) |
| `POST /threads/:id/messages` | send a message |
| `PATCH /threads/:id` | adjust a thread |
| `GET /threads/inbox` | **delete** — seam rollup |
| `GET /reviews/:reviewMessageId` | open a thread — a review is a message in it |
| `GET /recipients` | search people |

### conversations/items

| Route | → |
|---|---|
| `POST /conversations/items` | send a message (kind: item) |
| `GET /conversations/items/:id` | open a thread |
| `PATCH /conversations/items/:id` | send a message > resending a message with a message id overwrite the message |
| `GET /conversations/items` | **delete** — marker lookup |

### knowledge

| Route | → |
|---|---|
| `GET /knowledge` | search documents |
| `GET /knowledge/:id` | open a document |
| `GET /knowledge/:id/conflicts` | open a document |
| `POST /knowledge` | edit a document (new) |
| `PATCH /knowledge/:id` | edit a document |
| `PATCH /knowledge/:id/attention-score` | **delete** — same mechanism as recompute; goes with it |
| `POST /knowledge/:id/archive` | edit a document |
| `POST /knowledge/:id/promote` | edit a document |
| `POST /knowledge/:id/graduate` | edit a document |
| `POST /knowledge/:id/merge` | edit a document |
| `POST /knowledge/:id/split` | edit a document |
| `POST /knowledge/:id/conflicts` | edit a document |
| `POST /knowledge/:id/recompute-attention` | **delete** — the attention mechanism goes: this route, `attention-score`, the `score_attention` tool, and the engine behind them. What's proposed needs attention; nothing is scored. |
| `POST /knowledge/sweep` | **delete** — a subscription running a document does this; it is not an action |
| `GET /knowledge/triage-count` | **delete** — badge count |
| `GET /search` | search — all four objects |

### users · agents · org · teams

| Route | → |
|---|---|
| `GET /users` | search people |
| `GET /users/:id` | open a user |
| `POST /users` | edit a user (new) |
| `PATCH /users/:id` | edit a user |
| `GET /users/:id/assistant` | open a user |
| `GET /agents` | search people |
| `GET /agents/:id/profile` | open a user |
| `POST /agents` | edit a user (new) |
| `PATCH /agents/:id` | edit a user |
| `DELETE /agents/:id` | edit a user — status |
| `GET /org` | search people — people and their edges |
| `PUT /org/edges` | edit a user |
| `DELETE /org/edges/:id` | edit a user |
| `GET /teams` | search people — team is a filter |
| `GET /teams/:teamId` | search people — team is a filter |
| `POST /teams` | **delete** — a team is created by editing a user |
| `PATCH /teams/:teamId` | **delete** — team has no functionality of its own |
| `GET /org/teams/:teamId` | **delete** — seam |
| `GET /org/teams/:teamId/membership` | **delete** — seam |
| `GET /org/team-members/:id` | **delete** — seam |
| `POST /org/teams` | **delete** — seam duplicate |
| `POST /org/scaffold-request` | **delete** — moves to a plugin |
| `POST /org/scaffolded-agents` | **delete** — dead |
| `GET /org/review-recipients` | plumbing — a policy computation, not an action |

### routines

| Route | → |
|---|---|
| `GET /routines` | open a user — subscriptions are shown on the user |
| `GET /routines/:id` | open a user |
| `POST /routines` | edit a user — add a subscription |
| `PATCH /routines/:id` | edit a user — change or pause it |
| `DELETE /routines/:id` | edit a user — remove it |
| `POST /routines/:id/trigger` | send a message — "do your X now" |
| `GET /routines/event-types` | **the subscription vocabulary** — becomes the event list, read inside open a user or as reference; not a route |

### notifications

| Route | → |
|---|---|
| `GET /notifications/inbox` | open a user — yourself |
| `POST /notifications/:id/read` | edit a user — or UI-only state |
| `POST /notifications/seen` | edit a user — or UI-only state |
| `GET /notifications/mute` | open a user — subscriptions |
| `PUT /notifications/mute/:key` | edit a user — pause a subscription |
| `GET /notifications/config` | **delete** |
| `PATCH /notifications/config` | **delete** |

### sessions

| Route | → |
|---|---|
| `GET /sessions` | see what's running |
| `GET /agent-orchestration/runs` | see what's running |
| `GET /agent-orchestration/sessions/:sessionId` | see what's running |
| `GET /sessions/:id/activity` | watch a session |
| `POST /agent-orchestration/runs/abort` | stop a session |
| `POST /agent-orchestration/runs/stop-for-tasks` | stop a session |
| `GET /agent-orchestration/runs/active-counts` | **delete** |
| `GET /agent-orchestration/runs/latest-outcomes` | **delete** |

### setup — dissolved

| Route | → |
|---|---|
| `GET /credentials` | manage plugins — the one key lives there |
| `PUT /credentials/:name` | manage plugins |
| `DELETE /credentials/:name` | manage plugins |
| `POST /credentials/:name/validate` | manage plugins — validation inside |
| `GET /connections` | open a user — what this agent can reach |
| `POST /connections` | edit a user — connect a service for this agent |
| `DELETE /connections/:id` | edit a user — disconnect |
| `POST /connections/:id/validate` | edit a user — validation inside |
| `GET /filesystems` · `GET /filesystems/:id` | open a user — its folders (placeholder until the folder redesign) |
| `POST /filesystems` | edit a user — add a folder |
| `DELETE /filesystems/:id` | edit a user — remove a folder |
| `POST /filesystems/inspect-path` | edit a user — validation inside |
| `POST /filesystems/:id/injections` | edit a user — give an agent a folder |
| `DELETE /filesystems/:id/injections/:u` | edit a user — take it away |
| `GET /harnesses` | open a user — what it can run on |
| `POST /harnesses/redetect` | edit a user — look again |
| `GET /settings/agent-behavior/config` | open a user — defaults are contributions with overrides |
| `PATCH /settings/agent-behavior/config/:id` | edit a user — override a contribution |
| `GET /plugins` | manage plugins |
| `POST /plugins` | manage plugins — install |
| `DELETE /plugins/:id` | manage plugins — remove |
| `POST /plugins/:id/enable` · `disable` | manage plugins — toggle |
| `POST /plugins/:id/contributions/restore` | manage plugins — reset a contribution |

### plumbing

| Route | → |
|---|---|
| `GET /auth/me` | plumbing — session identity |
| `POST /auth/ws-token` | plumbing |
| `POST /auth/worker-token` | plumbing |
| `GET /health` · `GET /health/auth` | plumbing |
| `POST /agent-orchestration/intents` | plumbing — seam |
| `POST /agent-orchestration/review-verdicts` | plumbing — seam |
| `POST /agent-orchestration/runs/end-for-handoff` | plumbing — seam |
| `GET·PATCH /agent-orchestration/run-config/:agentId` | plumbing — seam behind edit a user |
| `POST /agent-orchestration/run-config/batch` | plumbing — seam |
| `GET /agent-orchestration/filesystems/:id/team` | plumbing — seam |
| `POST /agent-orchestration/filesystems/:id/injections/persist` | plumbing — seam |
| `POST /mcp/:token/return-status` | plumbing |

### delete outright

| Route | Why |
|---|---|
| `GET /coach` | dead |
| `GET /hints` · `POST /hints/:id/dismiss` | dead |

---

## Tally

| Lands in | Routes |
|---|---|
| the thirteen core actions | 72 |
| see what's running · watch a session · stop a session | 6 |
| manage plugins | 10 |
| plumbing | 16 |
| **delete** | 22 |
| | **126** |

**Seventeen actions.** Every route lands on one, or is plumbing, or goes.

| The seventeen | |
|---|---|
| task | search · open · edit |
| thread | search · open · send a message · adjust |
| document | search · open · edit |
| user | search · open · edit |
| session | see what's running · watch · stop |
| platform | manage plugins |

---

## Events

The other half. Same objects, and what happened to them. Symmetric with the actions — one
*edit* per object on the way in, one *changed* per object on the way out. No read events.

| Event | Today's events that fold into it |
|---|---|
| `task.created` | — |
| `task.changed` | `task_state_changed` · `session_started` · `session_ended` · `session_not_returned` — a session is part of its task |
| `thread.created` | `thread_created` |
| `thread.message` | `thread_message_appended` · `item_created` |
| `thread.changed` | `thread_resolved` · `thread_reopened` |
| `document.created` | `knowledge_created` |
| `document.changed` | `knowledge_updated` · `knowledge_archived` · (`knowledge_accessed` deleted — nobody subscribes to a read) |
| `user.created` | `user_created` · `agent_added` · `team_created` — a team is created by a user joining it |
| `user.changed` | — |

Nine events. All seventeen kept events map in or are deleted. `notification` goes — it was the human render
of every other row. `routine_fired` goes — a run is a session, and a session is `task.changed`.

A user's *subscriptions* name these. An agent's subscription runs a document; a human's
sends a notification. That is the whole event side.

**Off the surface, on the bus:** `agent_work_intent_recorded` · `agent_run_admission_failed` ·
`agent_run_lifecycle_changed` · `session_handoff_completed` · `sandbox_writeback_changes_detected` ·
`tool_call_recorded` · `propagation_applied` · `propagation_failed`.

**Delete:** `bet_revised` · `bet_state_changed` · `dependency_met` · `thread_archived` ·
`work_selection_requested` · `notification` · `routine_fired` · `knowledge_accessed`.

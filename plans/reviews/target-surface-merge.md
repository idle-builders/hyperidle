# Target surface — the merge

Your draft (13 actions, 4 objects) and the research synthesis (7 tools) tested against all
79 kept capabilities from the cull list, then the 17 kept events. Base `f88b71434`.

Verdict per row: where it lands, or **why it doesn't**.

---

## The action surface under test

**The criterion: an action is something a person would say they're doing, and the list is
what the agent reads.** A route is a fragment of an action; a god-tool with an `object`
parameter is a bundle of them. Both fail the same test. The unit is the sentence.

Your 13, per object:

| Object | Actions |
|---|---|
| **task** | search tasks · open a task · edit a task |
| **thread** | search conversations · open a conversation · send a message · adjust a conversation |
| **document** | search documents · open a document · edit a document |
| **user** | search people · open a person · edit a person |

"Edit" is new-or-existing and covers every field — for a task that includes state,
attachments and assignment; for a document it includes status, move, merge, split and
conflicts; for a person it includes prompt, skills, edges and team. "Send a message" takes a
thread id or a list of recipients, and the message may be plain, a review, a verdict, an
answer, or carry a file.

The research about tool overlap is answered by the names and descriptions being readable,
not by collapsing the list. Its own strongest finding was that prose moves outcomes ~20%
with the surface held constant.

## Test: all 79 against the 13

### Task — 8 of 8 land

| Capability | Lands in |
|---|---|
| see the tasks | search tasks |
| open a task | open a task |
| see a task's subtasks | open a task — the tree is part of the object |
| create a task | edit a task (new) |
| edit a task | edit a task |
| note something on a task | edit a task — notes are a field |
| record a task's outcome | edit a task — outcome is a field |
| hand a task to someone | edit a task — assignment is a field |

### Thread — 13 of 13 land, and three tables collapse

| Capability | Lands in |
|---|---|
| see the conversations | search conversations |
| open a conversation | open a conversation |
| start a conversation | send a message to recipients |
| message someone directly | send a message to recipients |
| post a message | send a message |
| submit a review | send a message, kind `review` |
| record a verdict | send a message, kind `verdict` |
| answer a question | send a message, kind `answer` |
| rename a conversation | adjust a conversation |
| open a review | open a conversation — a review is a message in it |
| look up a recipient | search people — **recipients are users**; `GET /recipients` disappears |
| attach a file | send a message carrying a file reference |
| raise / open / update an item | send a message, kind `item` — **`items` becomes a message kind** |

That last row is a proposal, not your ruling. But it's the only place an item lands, and it
already has a mandatory `threadId`.

### Document — 12 of 13 land

| Capability | Lands in |
|---|---|
| browse documents | search documents |
| open a document | open a document |
| write a document | edit a document (new) |
| edit a document | edit a document |
| archive · change status · graduate | edit a document — status is a field |
| merge two documents | edit a document on the target, with a merge-from |
| split a document | edit a document on the source, producing children |
| flag a conflict | edit a document — conflicts are a field |
| see the conflicts | open a document |
| score attention | edit a document — meta |
| search everything | search — across all four, or one per object; your call |
| **sweep documents** | **doesn't land** |

**Sweep is not an action a user takes on an object.** It's a batch over all documents — which
is what a routine does with search documents + edit a document. `run_knowledge_sweep` as a tool is a
routine wearing a tool's clothes. Under "one agent, one routine, all events by default," it's
the first thing that routine would do on its own.

### Users — 12 of 19 land; **team has nowhere to go**

| Capability | Lands in |
|---|---|
| see the people · see the agents | search people — `kind` is a filter |
| open a person · open an agent | open a person |
| join (first run) | edit a person (new) |
| edit your profile · edit an agent | edit a person |
| read your assistant's setup | open a person — the assistant is a user; its prompt is a document parented to it |
| add an agent | edit a person (new, kind `ai`) |
| remove an agent | edit a person — status `retired`; the docs already say "pause/retire, never delete" |
| remove a team member | edit a person — team is a field |
| **see the teams** | **doesn't land** |
| **open a team** | **doesn't land** |
| **create a team** | **doesn't land** |
| **edit a team** | **doesn't land** |
| **see the org chart** | **doesn't land** |
| **add · remove an org edge** | **doesn't land** — unless edges are a field on edit a person |
| **dissolve a team** | **doesn't land** |

**Team is a fifth object your draft doesn't have.** Seven capabilities have no home. Three
ways out, none decided:

1. **Team is an object** — search teams · open a team · edit a team. Sixteen actions.
2. **Team is a document** — a folder in the tree that users are parented to. "Create a team"
   is edit a document. The tree already allows `parentKind = 'knowledge_item'`.
3. **Team is only a property of users.** `users.teamId` exists; the "team" is the set of users
   sharing it. No create — the first user to name a team creates it. Org edges likewise live
   on edit a person, which is what your draft already says ("edges" is in the user's edit list).

Option 3 is the smallest and matches your draft literally. It gives up "a team has a name,
a phase, a lead" as first-class — those become either a document or nothing.

### Routines — 7 capabilities, deliberately open

Held for the routines discussion below. One observation now: every routine capability is
`search` / `read` / `edit` / `run now` on a thing made of **an owner (user) + a trigger
(event filter) + a prompt (document)**. Nothing in it is new material.

### Sessions — 5 capabilities, 2 land

| Capability | Lands in |
|---|---|
| see the sessions · see the runs | open a task — sessions belong to what they ran for |
| **watch a session live** | **doesn't land** — it's a stream, not a read |
| **send into a running session** | probably send a message to the session's thread |
| **stop an agent** | edit a task (stop work) or edit a person (pause) — undecided |

A session is execution, not content. Reading one is part of reading its task. Watching one
live is the one genuinely stream-shaped thing in the whole surface.

### Notifications — 5 of 5 land, all on the user

| Capability | Lands in |
|---|---|
| see your notifications | open a person (yourself) — the inbox is a property of the user |
| mark read · mark seen | edit a person — or UI-only state that never needs a tool |
| turn one off · see what's off | edit a person — **subscriptions are a field on the user** |

That last row is the one that matters. See routines.

### Platform — 15 capabilities, deliberately open

Held. One observation: nearly all of it is **a thing attached to a user or a team** — a
credential belongs to a user, a filesystem and a connection to a team. Plugins and backends
are global. If the objects hold their attachments, most of this is edit a person / edit a team
with more fields, and the rest is a global-scope edit on something that isn't an object yet.

### Tally

| | |
|---|---|
| Land cleanly | 62 |
| Land with a proposal you haven't ruled on (items → message, recipients → users) | 4 |
| Held open by you (routines, platform) | 22 |
| **Don't land** | **10** — 7 team, 1 sweep, 1 live session, 1 stop |

---

## Routines — a proposal, not a ruling

Your own symmetry rule: a person gets a notification, an agent gets a routine trigger, and
underneath it is one thing. Take that literally.

**A routine is an agent's subscription with a prompt attached.**

- A human's subscription to `document.changed` renders as a notification.
- An agent's subscription to `document.changed` renders as a session, running the attached
  prompt (which is already a document).

Then there is no routine object. There is a **subscriptions** field on every user — human or
agent — edited through edit a person. Muting a notification and disabling a routine are the
same edit. "Run a routine now" is send a message to the agent saying "do this now."

What this collapses: 7 routine capabilities, 5 notification capabilities, the
`notification_queue` recipient problem (a notification is a delivered subscription, so it has
a recipient by construction), and the two-vocabulary problem (subscriptions speak events).

What it costs: a routine's run history (`routine_runs`) needs a home — probably the
session log, since a run *is* a session. And cron-triggered routines are subscriptions to a
clock, not an event, which is fine but needs saying.

Your call. It is the one move in this document that makes the "can't tell agent from human"
test true for the event half.

---

## Events — the list

17 kept, tested against **object + what happened**:

| Today | Object | Happened |
|---|---|---|
| `task_state_changed` | task | changed |
| `session_started` · `session_ended` · `session_not_returned` | task | changed — a session is part of the task |
| `thread_created` | thread | created |
| `thread_message_appended` | thread | message |
| `thread_resolved` · `thread_reopened` | thread | changed |
| `item_created` | thread | message — if items are messages |
| `knowledge_created` | document | created |
| `knowledge_updated` · `knowledge_archived` | document | changed |
| `knowledge_accessed` | document | read |
| `user_created` · `agent_added` | user | created |
| `team_created` | team | created — or user changed, per the team decision |
| `routine_fired` | task | created — a run is a session on a task, or gone if routines fold |
| `notification` | — | delete; it's the human render of every other row |

**Proposed event surface: `<object>.created` · `<object>.changed` · `thread.message` ·
`document.read`.** That's nine or ten events depending on team, and every one of the 17
maps into it. It is exactly symmetric with the action surface — one `edit` per object on the
way in, one `changed` per object on the way out.

The 8 platform events stay on the bus, off this list. The 5 dead ones go.

---

## Validation — what it becomes

You said this is the key piece and the current shape won't survive. Agreed, and here's why
precisely.

Today validation is **per route, on the input**: `POST /agents` checks the harness/model/
provider triple; `PATCH /knowledge/:id` checks the version; `POST /knowledge/:id/promote`
checks for open conflicts. Each check lives in the one route that happens to touch it. That's
why a person validating in Triage skips the conflict check the agent's route enforces —
the check is on the wrong route.

Under one edit per object, validation is **per object, on the state**: after applying this
patch, is the object valid? Not "does this request have the right fields" but "may a user
with harness X have model Y", "may a document be validated while a conflict is open", "may a
task be done while a subtask is open" — checked on every edit, regardless of which fields
moved. Invariants, not input rules.

Two consequences:

1. **The same invariant answers "may this happen" and "is this button enabled."** The research
   piece from three days ago argues agents should be given only *currently valid affordances*.
   That's what a UI does when it greys out a button. Under object invariants, the affordance
   computation and the validation are one function. Your parity rule stops being a convention
   and becomes structural.

2. **The service layer follows.** If the interface is search / open / edit per object,
   the services underneath want the same shape — one `edit` per service that takes a patch,
   applies it, checks invariants, emits `<object>.changed`. Today's ~12 services with their
   dozens of narrow methods collapse into that. You said 100% rewrite; I'd say the same,
   and this is the shape it rewrites toward.

The one thing an upsert loses that a narrow route had: a typed, field-specific error. The
answer is that the invariant error names the field — "harness `claude-code` doesn't support
model `gpt-5`" — which is the MCP spec's own template for a tool execution error the model
can act on.

---

## Still open, in order of how much they block

1. **Team** — object, document, or property. Seven capabilities wait on it.
2. **Routines** — object, or subscriptions on the user. The event half waits on it.
3. **Platform** — attachments on user/team, or its own thing.
4. **Sessions** — the live stream, and where "stop" lives.
5. **Sweep** — confirm it's a routine and delete the tool.

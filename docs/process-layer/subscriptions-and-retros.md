# Subscriptions and Retros

<!-- @source framework/domain-model/src/actions/user.ts -->
<!-- @source layers/core-api/user/src/subscription-fire.ts -->
<!-- @source layers/core-api/user/src/subscription-clock.ts -->
<!-- @source plugins/document-management/plugin.json -->

A subscription attaches recurring work to a user: "retro every time a task closes," "weekly
knowledge sweep." It lives on the `subscriptions` table (`framework/db/src/schema.ts`), owned by
`@hyperidle/user`, and fires two ways: an event subscription wakes the moment a matching change is
recorded; a schedule subscription wakes off an in-process clock. **All subscriptions are generic** —
plugin-provided or user-created, on a human or an agent alike. There is no separate notification
mechanism: a person subscribed to an event gets an inbox row instead of a woken session, through the
identical row and the identical fire.

For the Subscription primitive's place among the four, see [The four primitives](./the-four-primitives.md).

## 1. Trigger shapes

A subscription fires on exactly one of:

- **Event** — one of the nine object-change names (`task.created`, `task.changed`,
  `thread.created`, `thread.message`, `thread.changed`, `document.created`, `document.changed`,
  `user.created`, `user.changed`). Matching subscriptions are read from the database at the moment
  the change is recorded, post commit — a subscription created, paused, edited, or removed takes
  effect on the very next matching event, with no restart.
- **Schedule** — a cron string (agent-only), parsed by the in-house matcher (`parseCron` /
  `nextCronMatch`). Note the matcher uses AND semantics when both day-of-month and day-of-week are
  restricted — deliberately non-POSIX, load-bearing for calendar-anchored crons. A tick loop (default
  every 30 seconds) fires due rows and advances `nextRunAt`.

Loops are possible and are not prevented: an agent's own actions can produce the very event its
subscription listens for, and nothing stops that agent-mediated cycle — the founder's ruling is that
this is an accepted property of a system with an agent in the loop, not a defect. The one narrow
exception: a change never wakes its own actor's subscription to that same change (no self-wake). The
control that exists is visibility and a working stop, not a gate: a subscription's prompt can tell the
agent when to stop, and pausing or removing a subscription takes effect on the very next event.

## 2. Reach

A subscription never sees more than the subscriber could already see through search. For an event
subscription, reach is company-wide, the subscriber's team (own, or its owner's for an owned agent),
or the subscriber's own — exactly the rule `search_tasks`/`search_threads`/`search_documents`/
`search_users` already apply. A user with neither a team nor an owner (a factory-scope plugin agent,
for example the document-management plugin's librarian) reaches every team.

## 3. Firing

For each matching, unpaused subscription in reach: an agent is woken through the same intent door a
mention uses, with the change as its message and the subscription's own prompt document (if any) as
its instruction. A person gets one inbox row and a live nudge on their own `user:<id>` socket topic —
no polling. Firing and reach live in `layers/core-api/user/src/subscription-fire.ts`.

## 4. Ownership and memory

A subscription's `userId` is its owner; there is no separate team column — its scope is wherever its
owner belongs, same as reach above. There is no `stateKey` or run-history table: the change row
itself, plus whatever the agent writes back to its own documents, is the record of what it noticed.

## 5. What subscriptions dropped

A routine used to carry `humanReview` and `silent` booleans and its own review-item output. Neither
exists on a subscription — there is no autonomy ladder here; trust gating lives on the agent's own
review history, see [Review primitive](../human-interface-layer/review-primitive.md). A subscription
that should stay quiet says so in its own prompt instead of a machinery flag (the document-decay
subscription below asks for nothing beyond the archive calls it makes).

Creating a subscription is ungated: `edit_user({ subscriptions: { add: [...] } })` takes effect
immediately, by a human or an agent — consistent with ETHOS §2 (trust agents; security is earned,
never preemptive). A subscription shows on its owner's profile page, not a page of its own.

## 6. Plugin-provided subscriptions

The document-management plugin (`plugins/document-management/plugin.json`) ships three, seeded on
plugin install — not special-cased in the fire or the clock:

| Subscription | Agent | Trigger |
|---|---|---|
| `document-decay` | librarian | schedule `0 3 * * 0` (Sundays 03:00 UTC) |
| `document-triage` | librarian | schedule `0 4 * * 0` (Sundays 04:00 UTC) |
| `post-task-retro` | librarian | event `task.changed` |

The librarian is a team-less, owner-less agent (`agentCategory: "individual"`), so its reach is every
team (§2). User-created subscriptions and subscriptions from other plugins are identical in
mechanism — nothing about a plugin origin is special-cased.

## 7. Retros: learning flows back up

Every closed task produces learning. The process layer's job is to capture it and route it to the
right place.

### 7.1 Task retro — every root-task completion

`post-task-retro` fires on every `task.changed` event, and its own prompt does the filtering a
routine's `transitionTo` trigger config used to: *"if this change did not move the task to done,
stop; if the task is not a root task, stop."* One harness session per task edit is the accepted cost
of moving that filter from the trigger into the prompt. When it does not stop, the Document Librarian
agent reads the completed task's notes and work, identifies one or two concrete learnings, and
creates or updates documents with `edit_document`. Because the subscription is plugin-provided and
its owner reaches every team, it fires for every team once the document-management plugin is
installed. Teams without the plugin have no automatic retro unless someone creates one manually.

This is the bottom-up signal path. Without it, the team learns in its own memory but the rest of the
team and the founder don't, and the next task repeats the same mistakes.

### 7.2 Team contribution loop — continuous, agent-driven

The biggest learning channel isn't retros — it's the continuous contribution every agent makes to its
team's knowledge. There is no meeting: agents capture findings into the tree as they work, each
landing as a `proposed` document. The librarian's weekly `document-triage` subscription reads every
`proposed` document and promotes or archives it by judgement — there is no repetition threshold or
score; its `document-decay` subscription archives ordinary tree documents unused for 90+ days. See
[Knowledge Movement](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md).

The loop closes through context assembly: the next task session's sandbox is assembled fresh from the
canonical `documents` store, so anything the team decided is simply *there* — nested under
`knowledge/` at the team's own position in the tree — with no broadcast notification needed.

Document lifecycle (`proposed` → `active`) and the two curation subscriptions are owned by
[Knowledge Movement](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md).

### 7.3 Human curation — weekly, async

Humans prune and shape what the practices produce through the Knowledge view — the recurring
counterweight to AI-only drift. Agents contribute and discuss; humans prune and shape. Surface:
[Knowledge view](../information-architecture/knowledge-view.md).

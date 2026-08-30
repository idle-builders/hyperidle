# Routines and Retros

<!-- @source framework/db/src/schema.ts -->
<!-- @source layers/core-api/routine/src/routine-scheduler.ts -->
<!-- @source plugins/knowledge-management/plugin.json -->

Routines attach recurring work to a team: "retro every time a task closes," "weekly knowledge sweep." They live in the `routines` table (`framework/db/src/schema.ts`) and fire from the in-process scheduler (`layers/core-api/routine/src/routine-scheduler.ts`). **All routines are generic** — plugin-provided or user-created. There are no built-in routines wired into core; the built-in routine mechanism (`fireBuiltinRoutine`, `provisionTeamRoutines`, `registerBuiltinRoutineHandlers`) was deleted by BA9d.

For the Routine primitive's place among the four, see [The four primitives](./the-four-primitives.md).

## 1. Trigger shapes

The scheduler handles two `triggerType` families, plus the older heartbeat/continuous interval loops:

- **Calendar** — cron expressions, parsed by the in-house matcher (`parseCron` / `nextCronMatch`). Note the matcher uses AND semantics when both day-of-month and day-of-week are restricted — deliberately non-POSIX, load-bearing for calendar-anchored crons.
- **Event** — a routine can be authored against any of the full event vocabulary (`EVENT_TYPES`, `framework/event-bus/src/events.ts`) — 34 event types, none excluded. The matching routines are read from the database at the moment the event happens: a routine created, paused, edited, or deleted takes effect on the very next matching event, with no restart. `event_type` is its own indexed column (`schema.ts`), not part of `trigger_config`. An optional `transitionTo` constraint in `trigger_config` narrows event-triggered routines to a specific target state — for example, `{ transitionTo: "done" }` fires only on transitions into `done` (BA9d D11).
- **Heartbeat** / **continuous** — low-frequency interval loops; the scheduler treats the two values identically.

Loops are possible and are not prevented: an agent's own actions can produce the very event its routine listens for, and nothing stops that agent-mediated cycle — the founder's ruling is that this is an accepted property of a system with an agent in the loop, not a defect. The one narrow exception: a routine's own run may not directly re-trigger that same routine (a machinery-level self-loop, not an agent-action loop). The control that exists is visibility and a working stop, not a gate: every firing is recorded on the routine's own page, and pausing or deleting a routine takes effect on the very next event.

## 2. Ownership, memory, delegation

A routine has a NOT-NULL owner agent (`schema.ts`); it has no team of its own — its scope is wherever its owner agent belongs. It shows up on a team's page exactly when its owner agent belongs to that team, and moves if the owner does. The owner holds the routine's thread of memory via `stateKey` (`schema.ts`): what it noticed last run, what it's watching.

## 3. Silent runs

A routine can run memory-only: `routines.silent` (`schema.ts`, policy in `layers/core-api/notifications/src/silence-policy.ts`) suppresses thread/item output so an agent stays current on context without producing anything for a human to look at. The knowledge-decay routine runs silent — a weekly sweep would otherwise flood the surface. Knowledge-promotion deliberately does **not** run silent: promotions emit `knowledge_updated` events that triage consumers need.

## 4. Human review is per-run and opt-in

Review is the `humanReview` boolean on the routine (`schema.ts`): when true, each run produces a review item alongside its session (`routine-scheduler.ts`). There is no autonomy ladder on routines — trust gating lives elsewhere, see [Review primitive](../human-interface-layer/review-primitive.md).

Creating a routine is ungated: agents create routines directly via the `create_routine` tool (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`) and `POST /routines` activates immediately. No approval step — consistent with ETHOS §2 (trust agents; security is earned, never preemptive).

Routines surface in the **Work view** (`layers/core-ui/src/pages/WorkRoutine.tsx`), with lifecycle `state` active | paused | error and soft-delete via `deletedAt` (`schema.ts`).

## 5. Plugin-provided routines

The knowledge-management plugin (`plugins/knowledge-management/plugin.json`) ships three routines. These are generic plugin routines seeded on plugin install — not special-cased in the scheduler:

| Routine | Agent | Trigger | humanReview | silent |
|---|---|---|---|---|
| `knowledge-decay` | librarian | cron `0 3 * * 0` (Sundays 03:00 UTC) | no | **yes** |
| `knowledge-promotion` | librarian | cron `0 4 * * 0` (Sundays 04:00 UTC) | no | no |
| `post-task-retro` | librarian | event `task_state_changed` → `done` | no | no |

These IDs are namespaced by the plugin install mechanism; a `builtin:` prefix still appears on seeded rows in test fixtures but is not meaningful in the plugin system.

User-created routines and routines from other plugins are identical in mechanism. The `builtin:` prefix is a legacy naming convention, not a special code path.

## 6. Retros: learning flows back up

Every closed task produces learning. The process layer's job is to capture it and route it to the right place.

### 6.1 Task retro — every completion

When a task transitions to `done`, the `post-task-retro` routine from the knowledge-management plugin fires on the `task_state_changed` event (filtered by `transitionTo: "done"`). The Knowledge Librarian agent reads the completed task's notes and work, identifies one or two concrete learnings, and creates or updates knowledge items. Because the routine is a generic event-triggered plugin routine, it fires for every team that has the knowledge-management plugin installed. Teams without the plugin simply have no retro routine unless they create one manually.

This is the bottom-up signal path. Without it, the team learns in its own memory but the practice and the founder don't, and the next task repeats the same mistakes.

### 6.2 Practice contribution loop — continuous, agent-driven

The biggest learning channel isn't retros — it's the continuous contribution every agent makes to its practice. There is no meeting: agents capture findings into their practice as they work, each landing as a provisional knowledge item. `knowledge-promotion` (librarian-owned, weekly) promotes the provisional items that meet the repetition threshold into practice knowledge (L3); `knowledge-decay` retires what has gone stale. Layer taxonomy: [The five layers](../knowledge-architecture/the-five-layers.md).

The loop closes through context assembly: the next task session's sandbox is assembled fresh from the canonical `knowledge_items` store, so anything the practice decided is simply *there* — `context/product/` and `context/practices/` — with no broadcast notification needed. See [knowledge movement](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md). Every team member is also a practice member, so the team stays current on its practice by construction.

Item lifecycle (captured → active) and the promotion pipeline are owned by [Facilitators](../knowledge-architecture/facilitators.md).

### 6.3 Human curation — weekly, async

Humans prune and shape what the practices produce through the Knowledge view — the recurring counterweight to AI-only drift. Agents contribute and discuss; humans prune and shape. Surface: [Knowledge view](../information-architecture/knowledge-view.md).

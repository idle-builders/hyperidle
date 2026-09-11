# The Cull List

Base: `origin/main` @ `f88b71434`. **126 routes · 20 agent tools · 31 events.**

**Edit the Verdict column.** Everything else is evidence.

`✓` reachable · `—` not reachable · `≠` reachable through a *different* route

**Verdicts:** `KEEP` · `FOLD→ x` merge into x · `SPLIT` one route doing several jobs ·
`DELETE` remove entirely · `PLUGIN` content the app shouldn't ship with · `?` I'm unsure

---

## What changed under me

The last 23 commits did much of this already. Corrections to my earlier reporting:

- **Bets are gone.** One work primitive; a task has subtasks. The UI creates tasks now.
- **Artifacts are documents.** `create_artifact` still exists as a tool name but produces a
  knowledge item parented to the current task or thread.
- **Documents nest as a tree.** Folders are documents. A routine's prompt and an agent's
  identity are documents. A document's role is an ordinary editable field.
- **The approval machinery was replaced.** `proposed_calls` is gone; `POST /agent-orchestration/review-verdicts`
  is the new shape. **The `void decision` bug I reported is fixed** — a verdict now records and
  re-queues the agent. That finding is dead; ignore it.
- **`query_practice` was deleted.** See the first row of the tally — this made things worse.

## Where the surface is still wrong

Against "everything is a task, a thread, or a document":

**`items` is a fourth content primitive.** The `items` table carries `title`, `body`,
`attachments`, `proposedAction`, `options`, `riskTier`, `blocking`, `reasoning`, `auditTrail`
and a mandatory `threadId`. It is a message that isn't a message. **No UI reads it.** Its only
production readers are the knowledge attention engine and the review-item factory, which use
`items.reasoning` as a dedupe marker. Either it becomes a message type on a thread, or it
becomes a document. It should not stay a third table alongside `messages`.

**Agents can no longer read anything.** `query_practice` was deleted for having only one
filter. Nothing replaced it. Of 20 tools, **zero read**. `GET /search` — the human's global
search — has no agent side at all. That is the single biggest hole in the model right now,
and it got bigger, not smaller.

---

# TASK

| Verdict | Offering | Route | UI | Tool | Scope |
|---|---|---|---|---|---|
| KEEP | See the tasks | `GET /tasks` | ✓ | — | team |
| KEEP | Open a task | `GET /tasks/:id` | ✓ | — | team |
| KEEP | See a task's subtasks | `GET /tasks/:id/tree` | ✓ | — | team |
| KEEP | Create a task | `POST /tasks` | ✓ | ✓ | team |
| KEEP | Edit a task | `PATCH /tasks/:id` | ✓ | ✓ | team |
| KEEP | Note something on a task | `PATCH /tasks/:id/notes` | — | ✓ | team |
| KEEP | Record a task's outcome | `POST /tasks/:id/outcome` | ✓ | — | team |
| KEEP | Hand a task to someone | `POST /tasks/:id/handoff` | — | ✓ | team |

# THREAD

| Verdict | Offering | Route | UI | Tool | Scope |
|---|---|---|---|---|---|
| KEEP | See the conversations | `GET /threads` | ✓ | — | user |
| KEEP | Open a conversation | `GET /threads/:id` | ✓ | — | user |
| KEEP | Start a conversation | `POST /threads` | ✓ | ✓ | user |
| KEEP | Message someone directly | `POST /threads/direct` | ✓ | ✓ | user |
| SPLIT | Post a message | `POST /threads/:id/messages` | ✓ | ✓ | user |
| SPLIT | Submit a review | *same route* | — | ✓ | user |
| SPLIT | Record a verdict | *same route* | ✓ | — | user |
| SPLIT | Answer a question | *same route* | ✓ | — | user |
| KEEP | Rename a conversation | `PATCH /threads/:id` | — | ✓ | user |
| KEEP | Open a review | `GET /reviews/:reviewMessageId` | ✓ | — | user |
| KEEP | Look up a recipient | `GET /recipients` | ✓ | — | user |
| DELETE | Inbox rollup (seam only) | `GET /threads/inbox` | — | ✓ | — |
| KEEP | Attach a file to a message | *no route* | — | — | user |
| FOLD→ message | Raise an item | `POST /conversations/items` | — | ✓ | team |
| FOLD→ message | Open an item | `GET /conversations/items/:id` | — | ✓ | team |
| FOLD→ message | Update an item | `PATCH /conversations/items/:id` | — | ✓ | team |
| DELETE | Find an item by marker | `GET /conversations/items` | — | ✓ | — |

# DOCUMENT  *(rename from "knowledge item")*

| Verdict | Offering | Route | UI | Tool | Scope |
|---|---|---|---|---|---|
| KEEP | Browse documents | `GET /knowledge` | ✓ | — | global |
| KEEP | Open a document | `GET /knowledge/:id` | ✓ | — | global |
| KEEP | Write a document | `POST /knowledge` | ✓ | ✓ | global |
| KEEP | Edit a document | `PATCH /knowledge/:id` | ✓ | ✓ | global |
| FOLD→ edit | Archive a document | `POST /knowledge/:id/archive` | ✓ | — | global |
| FOLD→ edit | Change its status | `POST /knowledge/:id/promote` | — | ✓ | global |
| FOLD→ edit | Graduate a document | `POST /knowledge/:id/graduate` | ? | — | global |
| KEEP | Merge two documents | `POST /knowledge/:id/merge` | — | ✓ | global |
| KEEP | Split a document | `POST /knowledge/:id/split` | — | ✓ | global |
| KEEP | Flag a conflict | `POST /knowledge/:id/conflicts` | — | ✓ | global |
| KEEP | See the conflicts | `GET /knowledge/:id/conflicts` | — | — | global |
| KEEP | Score attention | `PATCH /knowledge/:id/attention-score` | — | ✓ | global |
| FOLD→ score | Recompute attention | `POST /knowledge/:id/recompute-attention` | — | ✓ | global |
| KEEP | Sweep documents | `POST /knowledge/sweep` | — | ✓ | global |
| DELETE | Triage badge count | `GET /knowledge/triage-count` | ✓ | — | — |
| **KEEP** | **Search everything** | `GET /search` | ✓ | **—** | global |

The last row is the hole. A person searches; an agent cannot.

# USERS AND ORG

| Verdict | Offering | Route | UI | Tool | Scope |
|---|---|---|---|---|---|
| KEEP | See the people | `GET /users` | ✓ | ✓ | global |
| KEEP | Open a person | `GET /users/:id` | ✓ | ✓ | global |
| KEEP | Join (first run) | `POST /users` | ✓ | — | global |
| KEEP | Edit your profile | `PATCH /users/:id` | ✓ | — | user |
| KEEP | Read your assistant's setup | `GET /users/:id/assistant` | ✓ | — | user |
| KEEP | See the agents | `GET /agents` | ✓ | — | team |
| KEEP | Open an agent | `GET /agents/:id/profile` | ✓ | — | team |
| KEEP | Add an agent | `POST /agents` | ✓ | ≠ | team |
| KEEP | Edit an agent | `PATCH /agents/:id` | ✓ | — | team |
| KEEP | Remove an agent | `DELETE /agents/:id` | ✓ | — | team |
| KEEP | See the teams | `GET /teams` | ✓ | — | global |
| KEEP | Open a team | `GET /teams/:teamId` | ✓ | — | team |
| KEEP | Create a team | `POST /teams` | ✓ | ≠ | global |
| KEEP | Edit a team | `PATCH /teams/:teamId` | ✓ | ✓ | team |
| KEEP | See the org chart | `GET /org` | ✓ | — | global |
| KEEP | Add an org edge | `PUT /org/edges` | ✓ | — | global |
| KEEP | Remove an org edge | `DELETE /org/edges/:id` | ✓ | — | global |
| KEEP | Remove a team member | *no route* | — | — | team |
| KEEP | Dissolve a team | *no route* | — | — | team |
| DELETE | Create a team (seam copy) | `POST /org/teams` | — | ✓ | — |
| PLUGIN | Scaffold a roster | `POST /org/scaffold-request` | — | ✓ | — |
| DELETE | Persist scaffolded agents | `POST /org/scaffolded-agents` | — | — | — |
| DELETE | Team lookup (seam) | `GET /org/teams/:teamId` | — | ✓ | — |
| DELETE | Membership lookup (seam) | `GET /org/teams/:teamId/membership` | — | ✓ | — |
| DELETE | Team-members lookup (seam) | `GET /org/team-members/:id` | — | ✓ | — |
| ? | Resolve review recipients | `GET /org/review-recipients` | — | ✓ | — |

# ROUTINES  *(a subscription; its prompt is a document)*

| Verdict | Offering | Route | UI | Tool | Scope |
|---|---|---|---|---|---|
| KEEP | See the routines | `GET /routines` | ✓ | — | team |
| KEEP | Open a routine | `GET /routines/:id` | ✓ | — | team |
| KEEP | Create a routine | `POST /routines` | ✓ | ✓ | team |
| KEEP | Edit a routine | `PATCH /routines/:id` | ✓ | ✓ | team |
| KEEP | Delete a routine | `DELETE /routines/:id` | ✓ | — | team |
| KEEP | Run a routine now | `POST /routines/:id/trigger` | ✓ | — | team |
| ? | The trigger vocabulary | `GET /routines/event-types` | ✓ | — | global |

# SESSIONS

| Verdict | Offering | Route | UI | Tool | Scope |
|---|---|---|---|---|---|
| KEEP | See the sessions | `GET /sessions` | ✓ | — | team |
| KEEP | Watch a session | `GET /sessions/:id/activity` | ✓ | — | team |
| KEEP | See the runs | `GET /agent-orchestration/runs` | ✓ | — | team |
| DELETE | Active run counts | `.../runs/active-counts` | ✓ | — | — |
| DELETE | Latest run outcomes | `.../runs/latest-outcomes` | ✓ | — | — |
| DELETE | Session lookup (seam) | `.../sessions/:sessionId` | — | — | — |
| KEEP | Send into a running session | *no route* | — | — | team |
| KEEP | Stop an agent | *no route* | — | — | team |

# NOTIFICATIONS

| Verdict | Offering | Route | UI | Tool | Scope |
|---|---|---|---|---|---|
| KEEP | See your notifications | `GET /notifications/inbox` | ✓ | — | user |
| KEEP | Mark one read | `POST /notifications/:id/read` | ✓ | — | user |
| KEEP | Mark them seen | `POST /notifications/seen` | ✓ | — | user |
| KEEP | Turn one off | `PUT /notifications/mute/:key` | ✓ | — | user |
| KEEP | See what's off | `GET /notifications/mute` | ✓ | — | user |
| DELETE | Delivery config | `GET·PATCH /notifications/config` | — | — | — |

Every row is per-user in the target model. Today the mute list is a global singleton and
`notification_queue` has **no recipient column at all** — a schema change, not a settings change.

# PLATFORM

| Verdict | Offering | Route | UI | Tool | Scope |
|---|---|---|---|---|---|
| KEEP | Manage provider keys | `GET·PUT·DELETE /credentials/:name` | ✓ | — | global |
| KEEP | Check a provider key | `POST /credentials/:name/validate` | ✓ | — | global |
| KEEP | Manage connections | `GET·POST·DELETE /connections` | ✓ | — | team |
| KEEP | Check a connection | `POST /connections/:id/validate` | ✓ | — | team |
| KEEP | Manage filesystems | `GET·POST·DELETE /filesystems` | ✓ | — | team |
| KEEP | Check a path | `POST /filesystems/inspect-path` | ✓ | — | team |
| KEEP | Give an agent a filesystem | `POST /filesystems/:id/injections` | ✓ | — | team |
| KEEP | Take it away | `DELETE /filesystems/:id/injections/:u` | ✓ | — | team |
| KEEP | See the agent backends | `GET /harnesses` | ✓ | — | global |
| KEEP | Re-detect backends | `POST /harnesses/redetect` | ✓ | — | global |
| KEEP | Tune agent behavior | `GET·PATCH /settings/agent-behavior/config` | ✓ | — | global |
| KEEP | Manage plugins | `GET·POST·DELETE /plugins` | ✓ | — | global |
| KEEP | Enable/disable a plugin | `POST /plugins/:id/enable·disable` | ✓ | — | global |
| KEEP | Reset a contribution | `POST /plugins/:id/contributions/restore` | ✓ | — | global |
| KEEP | Know who you are | `GET /auth/me` | ✓ | — | user |
| DELETE | Onboarding hints | `GET /hints`, `POST /hints/:id/dismiss` | ✓ | — | — |
| DELETE | Coach thread | `GET /coach` | ✓ | — | — |
| DELETE | Assistant read (superseded) | `GET /assistant` | ? | — | — |

# NOT USER-FACING — plumbing, off the surface

`POST /auth/ws-token` · `POST /auth/worker-token` · `GET /health` · `GET /health/auth` ·
`POST /agent-orchestration/intents` · `POST /agent-orchestration/review-verdicts` ·
`GET .../requests/pending-intents` · `POST .../requests/explicit-starts/:id/fail` ·
`GET·POST .../run-config/:agentId` · `POST .../run-config/batch` ·
`GET .../filesystems/:id/team`

---

# EVENTS — 31 declared

## Delete — orphaned (5)

| Event | Why |
|---|---|
| `bet_revised` | **bets no longer exist** — nothing emits or consumes it |
| `bet_state_changed` | **bets no longer exist** — survives only in a `TRANSITION_EVENTS` set in `routines-routes.ts:263` |
| `dependency_met` | never emitted, never consumed |
| `thread_archived` | never emitted |
| `work_selection_requested` | never emitted, never consumed |

All five are still handed to agents by `GET /routines/event-types`. An agent can subscribe to
two events about a primitive that was deleted.

## Not offerings — keep on the bus, off the surface (8)

`agent_work_intent_recorded` · `agent_run_admission_failed` · `agent_run_lifecycle_changed` ·
`session_handoff_completed` · `sandbox_writeback_changes_detected` · `tool_call_recorded` ·
`propagation_applied` · `propagation_failed`

## Keep — 17

| Verdict | Event | Plain words | Scope |
|---|---|---|---|
| KEEP | `task_state_changed` | a task moved | team |
| KEEP | `session_started` | an agent started working | team |
| KEEP | `session_ended` | an agent finished working | team |
| KEEP | `session_not_returned` | an agent's turn ended without answering | user |
| KEEP | `thread_created` | a new conversation started | user |
| KEEP | `thread_message_appended` | someone posted a message | user |
| KEEP | `thread_resolved` | a conversation was resolved | user |
| KEEP | `thread_reopened` | a conversation was reopened | user |
| KEEP | `item_created` | something needs a decision | team |
| KEEP | `knowledge_created` | a document was created | global |
| KEEP | `knowledge_updated` | a document changed | global |
| KEEP | `knowledge_archived` | a document was archived | global |
| KEEP | `knowledge_accessed` | someone read a document | user |
| KEEP | `team_created` | a new team was set up | global |
| KEEP | `agent_added` | an agent joined a team | team |
| KEEP | `user_created` | a person joined | global |
| KEEP | `routine_fired` | a routine ran | user |
| DELETE | `notification` | a wrapper that exists only because people have no event vocabulary | — |

---

# SHIPS WITH OPINIONS — move to a plugin

| What | Where |
|---|---|
| 16-role catalog | `framework/domain-model/src/agent-roles.ts` |
| System prompt templates | `layers/core-api/org/src/system-prompt-templates.ts` |
| `APP_ASSISTANT_SYSTEM_PROMPT` | `layers/core-api/org/src/resolve-scaffold-specs.ts` |
| `POST /teams` defaulting to development+product, 400 on empty roster | `layers/core-api/src/routes/teams-routes.ts` |

# DEAD UI — delete regardless

Re-verify these against the rebase before acting; they were found on the old base.

| What | Where |
|---|---|
| "+ Add filesystem" — no `onClick` | `settings/SettingsFilesystems.tsx` |
| "Approve all except flagged" / "Hold" | `pages/review/ReviewBatch.tsx` |
| "Open preview in a new tab" — `preventDefault()` | `pages/review/ReviewBrowserPreview.tsx` |
| Composer Insert menu — 6 inert items | `components/ConversationSurface.tsx` |
| Session composer Insert | `components/SessionView.tsx` |
| `⌘L` copy block permalink — no caller | `ds/Block.tsx` |
| `BlockHandle` — never rendered | `ds/BlockHandle.tsx` |
| Approve/reject on 3 review canvases — props undeclared | `pages/review/review-artifact.ts` |
| Per-field approve — mutates a `Set` nothing reads | `pages/review/ReviewFieldChangeSet.tsx` |
| `navigate-settings` CustomEvent — nothing listens | `shell/AssistantOverlay.tsx` |
| Conversations filter — clearable, never set | `components/ThreadSections.tsx` |
| No shortcut help surface, ~12 undiscoverable keys | shell-wide |

---

# TALLY

| | |
|---|---|
| KEEP | 79 capabilities · 17 events |
| — with no route yet | 5 |
| — with no agent tool | 48 |
| — with no UI | 12 |
| FOLD | 7 |
| SPLIT | 1 route → 4 |
| DELETE | 17 capabilities · 6 events |
| PLUGIN | 1 route + 4 content items |
| Plumbing, off the surface | 11 routes · 8 events |
| Dead UI | 12 |

**48 of 79 kept capabilities have no agent tool. Zero of 20 tools read anything.**
That is the gap, stated as one number.

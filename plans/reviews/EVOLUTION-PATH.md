# Evolution path — draft

How the codebase gets from 126 routes / 20 tools / 31 events to 17 actions / 9 events.
Order and safety of each step. Not a design of the actions — `ACTIONS.md` is that.

Checked against code on 2026-09-11 at `origin/main` @ `f88b71434`. Each step: what it
deletes, what it builds, what must already be true, how it is verified, what it unblocks.
Decision points are marked **?** — those are the questions to settle one at a time.

Repo constraints that shape every step: migrations full and destructive, no compat layer, no
dual-write; validation before implementation; under 1,000 lines added per change or stop
and ask; deletions never count.

---

## 0. Where the declaration already half-exists

Three things in the code today are the pieces of "declare an action once":

| Piece | Where | Shape |
|---|---|---|
| Tool definition | `tool-handlers/src/tool-types.ts` | `name · description · inputSchema (zod) · handler · roles?` |
| Route validation | every route file | `validateBody(zodSchema)` on a Hono router |
| UI object kinds | `core-ui/src/services/object-presentation.ts` | `ProductObjectKind` (8 kinds) × `OpenIntent` navigate/inspect/act |

The tool definition is already the sentence-shaped thing: a name, a description the agent
reads, a schema, a handler. Nothing reads it except the tool registry. The route repeats the
schema by hand; the UI repeats it a third time in a hook per route (`useTaskPatch` etc.).

Tool = route is already a **tested** property, not a compiler one: the
`core-api-port*.integration.test.ts` files dial the real routes through the seam. That is the
verification pattern each object step reuses.

---

## 1. Delete first

Pure reduction, lands alone, one PR.

**Deletes**
- 22 routes (`ACTIONS.md` § delete): coach, hints, inbox rollup, items marker lookup,
  attention-score, recompute-attention, sweep, triage-count, 8 team/org seams,
  notifications config ×2, active-counts, latest-outcomes.
- The attention engine: `knowledge/src/attention-service.ts` (418), `attention-scoring.ts`
  (317), `attention-classifier.ts`, the attention half of `scoring-config.ts`, the
  `score_attention` tool, the `attention_score` projection column (migration).
- 8 events. **Five of them have no emitter today** — they exist only in the type unions:
  `bet_revised · dependency_met · thread_archived · work_selection_requested`, and
  `bet_state_changed` survives as a string in `routines-routes.ts`. Three are live:
  `knowledge_accessed` (emitted in `routes/knowledge.ts`), `routine_fired` (scheduler),
  `notification` (policy-engine, dependency-watcher).
- `framework/domain-model/src/events.ts` (583 lines). Only `SessionOutcome` is still
  exported from it. **`tools/trace/trace-lib.ts` reads this file as its event source** —
  the trace tool's event graph is fed by the stale fork. Repoint to `event-bus`.
- Dead UI controls (`census/ui-actions.md`): ReviewBatch "approve all except flagged" /
  "hold", session composer Insert, `⌘L`, and the decorative verdicts.
- The `items` reasoning-marker path (`GET /conversations/items`).

**Not pure:** the attention weight is one of four factors in the relevance formula of the
context assembler (`session-knowledge-assembler.ts:160-170`, weight 0.1), and
`promotion-pipeline.ts` calls `recomputeAttention` before promoting. Removing it touches
context assembly — a keep — by deleting one term and one call. Small, but say so.

**Must already be true:** nothing. **Verified by:** suite green with less in it; no route,
tool, or event name from the delete list appears in production (a governance rule, same
shape as `artifact-is-not-a-storage-concept.ts`). **Unblocks:** every later step has 22
fewer routes to reason about, and step 6 has no attention scores to migrate.

**?** `notification` the event is deleted here, but the notification *queue* keeps running
until step 6. The listener in `notifications/src/install.ts` subscribes to that one event.
Either the listener subscribes to the real events directly for now, or step 1 leaves this
one event alive and step 6 takes it. Recommendation: leave it; delete with step 6.

---

## 2. The declaration

The mechanism that has never existed: declare an action once, project it to a route, a tool,
a UI affordance, and a lint check. Small. Every later step is built on its shape, so it goes
before any object.

**Builds**
- One module per object holding its actions. Each action is the tool-definition shape
  (name · description · input schema · handler · who may call it) plus the object's
  invariants — the function that answers both "may this happen" and "is this button enabled".
- The tool registry consumes these directly (it already takes a list of that shape).
- A route is a thin mount of an action. Hand-written, as today, but nothing in it that the
  action does not declare.
- The UI imports the action's schema and invariant. No per-route hook.
- A governance rule (`tools/governance/src/rules/`): every declared action has a route
  mount, is in the tool list, and is referenced from the UI; every route is an action mount
  or on the 16-route plumbing list; every tool is an action; every emitted event is one of
  the 9 or the 8 platform events.

**Deletes:** nothing yet. Proven on one action in step 3.

**Must already be true:** step 1 (so the rule's plumbing list is the real 16).
**Verified by:** the rule runs red on today's tree and names the gap; green needs step 3.
**Unblocks:** everything.

**?** The declaration shape is the first decision. Options grounded in code:
- (a) the tool definition, moved next to the object's service, is the declaration. Route
  and UI read from it. Least new code — the registry already eats this shape.
- (b) the route stays the declaration with metadata; tool and UI derive from it. Keeps
  "routes by hand" literal but makes REST the master, which was the doubt.
- (c) a new schema format (JSON/YAML) that generates all three. Most machinery.
Recommendation: (a).

**?** Where invariants live: on the action, or one function per object that every action of
that object calls. Recommendation: per object — one `edit` per object means one invariant set.

---

## 3. One object end to end — task

Three actions: search · open · edit. One service `edit` with invariants. One tool each. UI
follows. Proves the pattern on the smallest object.

Size today: 8 routes, 627 lines in `routes/tasks.ts`; tools `create_task · edit_task ·
handoff_to · log_task`; state machine in `work/src/task-state-machine.ts`.

**Deletes:** the 8 task routes, 4 tools, `useTaskPatch`/`useTaskTree`/`useTaskSessions`
and the task pages' own fetch calls; the per-route validation.
**Builds:** `task` action module; `work` service collapses to search/open/edit; the task
state machine becomes the invariant set; the UI's task page reads affordances from it.
`task.created` / `task.changed` emitted from the one edit.
**Must already be true:** step 2.
**Verified by:** integration test drives all three actions through the seam as agent and as
human and gets the same answer; the governance rule is green for task; visual proof of the
page with a greyed-out control matching a failed invariant.
**Unblocks:** the pattern; steps 4–6 copy it.

---

## 4. Conversation

Four actions: search · open · send a message · adjust. Includes `items` → message kind and
the message-overwrite rule (send with an existing id replaces).

Size today: the **biggest code**, not the most routes — `routes/threads.ts` is 1,651 lines
plus `threads-schema.ts` 333, `conversations.ts`, `assistant.ts`, `reviews.ts`. Tools
`send_message · reply · create_item · submit_review`.

**Deletes:** the thread/conversation/item/assistant/review routes, the `items` table
(migration folds rows into `messages`), 4 tools, the thread hooks.
**Builds:** `conversation` action module; message kinds `plain · verdict · item`; invariants
(who may post where — the AU27 reply-to-caller rule becomes an invariant, not a tool).
`conversation.created · .message · .changed`.
**Must already be true:** step 3.
**Verified by:** same shape as 3; plus: resend with an id overwrites, proven both ways.

---

## 5. Document

Three actions: search · open · edit. Includes the rename knowledge item → document, the
tree, and merge/split/status/promote as fields of edit.

Size today: the **most routes** — 15 in `routes/knowledge.ts` (1,053 lines) plus `search.ts`.
Tools `promote_knowledge · create_conflict_review · merge_knowledge · split_knowledge ·
run_knowledge_sweep · create_artifact · write_memory`.

**Deletes:** the knowledge routes, 7 tools, `knowledge-conflicts.ts` as a separate path
(conflict = a document with a status), `useKnowledgeItem` and friends.
**Builds:** `document` action module; the tree and parent kinds stay; status transitions
are invariants. `document.created · .changed`.
**Must already be true:** step 3. Independent of 4.
**Verified by:** same shape.

**?** The rename: with this step (touch the 1,053-line file once) or first (every plan
says "document" from day one, but renames code step 5 deletes anyway).
Recommendation: with this step.

**?** `GET /search` — one cross-object search or four. Decides whether "search" is one
action module or a field on each. Not blocking until here.

---

## 6. Person, and subscriptions

Three actions: search · open · edit. The biggest structural change: routines and
notifications become one thing.

What exists today, and it is already two halves of one mechanism:
- `routines` row: `ownerAgentId · triggerType · triggerConfig · eventType`; the scheduler
  does `eventBus.on(eventType, …)` per event routine (`routine-scheduler.ts:676`).
- `notification_queue` row: `eventType · subjectId · severity · title · body · status` —
  **no recipient**; one global listener enqueues; mute is a global singleton.

**Deletes:** the `routines` table and 7 routes and `create_routine · update_routine`
tools; `notifications-routes.ts` (7 routes) and the mute singleton; `GET /recipients`;
the setup pages (`SetupFlow`, `Settings*` except plugins); `teams-routes.ts`/`org.ts`
(team → attribute + filter); `create_team · add_agent` tools; the scaffold routes.
**Builds:** `person` action module; a `subscriptions` shape on the person
(`personId · eventType · documentId | null · paused`): document set → run it (the
scheduler); null → enqueue a notification **with a recipient**. Cron stays a trigger kind.
Team becomes a column + filter. Connections, folders, backends, defaults become person
attributes; plugin-contributed defaults with user overrides via the existing
`plugin-contributions` mechanism. `person.created · .changed`.
**Must already be true:** steps 3–5 (a subscription names the 9 events, which only exist
once each object emits them). Step 1's `notification` event dies here.
**Verified by:** one subscription row, two kinds of person, both fire: the agent runs the
document, the human gets a queue row addressed to them. Mute = paused, both kinds.

**?** Notification read/seen: an attribute on the person's subscription, or UI-only state.
Not blocking until here.

---

## 7. Session and plugins

Session: see what's running · watch · stop — 6 routes in `agent-orchestration/src/routes/`,
already close to the shape. Plugins: manage plugins — 6 routes in `routes/plugins.ts` plus
the one surviving key. Both small; both are mounts of an action module like the others.

**Must already be true:** step 2. Can run any time after it.

---

## 8. Move the opinions out

Role catalog, prompt templates, team scaffolding, the assistant's baked behaviour → a
plugin. Default install: one agent, one subscription to everything, empty prompts.
The config layer already models `builtin | plugin | user` origin and `BUILTIN_PLUGIN_ID`.

**Must already be true:** steps 6 and 7. **Verified by:** a fresh install with no plugin
boots, shows the four empty lists, and one agent with one subscription.

---

## Order, summarised

```
1 delete ──► 2 declare ──► 3 task ──► 4 conversation ──┐
                                  └──► 5 document ─────┼──► 6 person+subscriptions ──► 8 opinions out
                                                        │
                             2 ────────────────────────► 7 session+plugins ──────────┘
```

4 and 5 are independent of each other. 7 needs only 2. 6 needs 3–5. 8 needs 6 and 7.

**?** UI per object (each step ships both surfaces, proving parity per step) or after all
four (four backend steps, then one UI rewrite). Recommendation: per object — it is the only
way each step can be verified as "same answer for agent and human".

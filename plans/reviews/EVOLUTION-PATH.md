# Evolution path

From 126 routes / 20 tools / 31 events / 10 services to 17 actions / 9 events / 6 modules.
Shape: `LAYER-BELOW.md`. Contract: `ACTIONS.md`. Code facts: `census/`. Checked 2026-09-11
at `origin/main` @ `f88b71434`.

Rules from the repo: migrations full and destructive, no compat layer, no dual-write, no dead
code left; validation before implementation; under 1,000 added lines per change or stop and
ask (deletions never count). Each step is one PR that leaves `verify` green and the app
usable. Every step is verified the same way: the action gives the same answer to an agent
and a human through the seam test, the governance rule is green for what the step claims,
and the screen is looked at.

---

## 1. Delete

Pure reduction. No new shape yet.

**Deletes:** 22 routes (`ACTIONS.md` § delete); the attention engine (`attention-service`,
`attention-scoring`, `attention-classifier`, the attention half of `scoring-config`, the
`score_attention` tool, the `attention_score` projection column, the one weight term in the
context assembler); 8 events — five already have no emitter, three are live
(`knowledge_accessed` in `routes/knowledge.ts`, `routine_fired` in the scheduler,
`notification` — leave `notification` alive until step 6 because the queue still listens);
`framework/domain-model/src/events.ts` and repoint `tools/trace/trace-lib.ts` to the
event-bus file it should read; dead UI controls (`census/ui-actions.md`); the items
reasoning-marker path; `work-state-push-gateway.ts` (broadcasts to nobody).

**Verified by:** suite green; a governance rule that names every deleted route, tool, and
event and fails if one returns. **Unblocks:** every later step has less to move.

## 2. The list, proven on task

The mechanism that has never existed, built once and proven on the smallest object.

**Builds**
- The action shape (`name · description · input · invariants · run`) and `ctx`
  (`actor · db · changes`) in `framework/domain-model`.
- The `changes` table + migration + the one append helper. Written inside the edit's
  transaction.
- The `task` module: `task.search · task.open · task.edit`. The task state machine
  (`VALID_TRANSITIONS`, `assertNoCycle`, capacity) becomes `invariants(next)`. One read
  model for the task list. `task.created` / `task.changed` come from the change row.
- The three loops: HTTP mount (`POST /api/task/edit` …), MCP `registerTool`, UI client
  type + `call`. The MCP loop registers in-process — the first tool that does not go through
  the seam.
- The governance rule: every list entry is mounted, registered, referenced; every route is
  an entry or plumbing; every tool is an entry; every emitted event is one of 9 + 8.
- The task page and the task-tree reading through `call` and `invariants`.

**Deletes:** `layers/core-api/work` (1,814), the 8 task routes in `routes/tasks.ts` (627),
`create_task · edit_task · handoff_to · log_task` tools and their `CoreApiPort` methods,
`useTaskPatch · useTaskTree · useTaskSessions`, `types/task.ts`, `policy/lifecycle-
propagation.ts`'s task half (now an invariant).

**Must already be true:** step 1. **Verified by:** the seam test runs all three actions as
agent and as human and gets identical results; a failed invariant greys the same control it
refuses on the wire, with the reason; the rule is green for task and red for everything else
(that red is the to-do list for steps 3–6). **Unblocks:** the pattern; 3–6 copy it.

## 3. Thread

`thread.search · open · send a message · adjust`. `items` folds into messages as a
kind; sending with an existing id overwrites; the reply-to-caller rule and who-may-post-where
become invariants; verdicts are a message kind (already are).

**Deletes:** `layers/core-api/conversation` (755), `routes/threads.ts` (1,651) +
`threads-schema.ts` + `conversations.ts` + `assistant.ts` + `reviews.ts`, the `items` table,
`send_message · reply · create_item · submit_review`, `useThreadDetail · useAssistantThread ·
useConversationsThreads · useHostThread`, the two hand-pushed WS sites (the stream from the
`changes` table replaces them), `policy-engine.ts` (the `item_created` adjudication becomes
an invariant on the message).

**Must already be true:** 2. Independent of 4.

## 4. Document

`document.search · open · edit`. Rename knowledge item → document in this step (touch the
1,053-line file once). Tree and parent kinds stay. Merge, split, status, promote, conflict
are fields of edit with invariants. Versions and `knowledge_edit_log` fold into `changes`.

**Deletes:** `layers/core-api/knowledge` (4,441 — the largest), `routes/knowledge.ts` +
`search.ts`, seven tools, `useKnowledgeItem · useParentedKnowledgeItems`, the knowledge
pages' own fetches.

**Must already be true:** 2. Independent of 3. **Note:** context assembly
(`session-knowledge-assembler.ts`) is a keep; it becomes the `document.search` read model
the session baker calls, not a separate path.

## 5. User and subscriptions

`user.search · open · edit`. The biggest structural change: routines and notifications
become subscriptions on the user; team becomes an attribute + filter; connections,
folders, backends, defaults become attributes with plugin-contributed defaults.

**Builds:** the `user` module; `subscriptions` (`userId · event · documentId | null ·
paused`) — document set → the scheduler runs it; null → a notification row *with a
recipient*; cron stays a trigger kind; the one event stream for the UI, per-user filtered.

**Deletes:** `users` (802) + `org` (675) + `routine` (2,176) + `notifications` (1,093) +
`credentials` (385) as packages; `routines` table and 7 routes; `notifications-routes.ts`
and the mute singleton; `teams-routes.ts` + `org.ts`; `recipients.ts`; `create_team ·
add_agent · create_routine · update_routine`; the setup pages and `Settings*` except
plugins; the `notification` event (step 1 left it alive for this).

**Must already be true:** 2, 3, 4 (a subscription names the 9 events, which exist once each
object emits them).

## 6. Session and platform

`session.see what's running · watch · stop` — orchestration's module, 6 routes today,
already near the shape; the session WS becomes part of the one stream. `platform.manage
plugins` — settings' module, 6 routes plus the one key. Both are list entries mounted by
the same loops.

**Must already be true:** 2. Can land any time after it.

## 7. Opinions out

Role catalog, prompt templates, team scaffolding, baked assistant behaviour → a plugin.
Fresh install: one agent, one subscription to everything, empty prompts.

**Must already be true:** 5, 6. **Verified by:** a fresh install with no plugin boots to
four empty lists and one agent with one subscription.

---

```
1 delete → 2 list + task → 3 thread ─┐
                         → 4 document ─────┼→ 5 user + subscriptions → 7 opinions out
                         → 6 session + platform ──────────────────────┘
```

3, 4, 6 are independent of each other. 5 needs 3 and 4. 7 needs 5 and 6.

## What is left when it is done

Six modules, one list, five loops, one `changes` table, sixteen plumbing routes. The
`core-ui` rebuild and the agent workspace are the next phase and are not in this path —
each step here only re-points the existing screens at `call` and `invariants`.

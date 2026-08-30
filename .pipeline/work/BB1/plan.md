# BB1 — Everything is a task, and a task has subtasks

**Track:** BB (One Work Primitive) · **Type:** backend + frontend · **Registered:** 2026-08-30

---

## 1. The outcome

One work primitive. A task has a goal and may have subtasks, to any depth. The `bets` table, its
routes, its state machine, its page and its agent tools are gone — not wrapped, not aliased, not
shimmed. Every bet in an existing database becomes a root task in the same change.

One editing door. `PATCH /tasks/:id` is the only way to change a task, and humans and agents both go
through it with the same field set and no gate between them.

---

## 2. Founder decisions

Settled in conversation, 2026-08-30. These are not open.

| Question | Ruling |
|---|---|
| Commit ceremony + WIP limit | **Keep the WIP limit, drop the ceremony.** Cap concurrent `in_progress` tasks per team. No commit step; no `activeBets` counter. |
| `hypothesis` | **Cut**, with the retro form. |
| Outcome verdict vocabulary | **Keep the task vocabulary** (`met \| met_with_rework \| partially_met \| not_met`). The bet vocabulary dies. |
| Human bet retro form | **Cut.** *"makes no sense."* The plugin skill `post-task-retro` is the retro. |
| Agent/human edit split | **Delete it.** Both edit, same door, no approval gate, no role gate, no draft-only gate. |

---

## 3. The merged task

```
tasks
  id
  parent_task_id     -- NEW: nullable self-FK. NULL = root task. Replaces bet_id (NOT NULL).
  team_id
  owner_agent_id
  title              -- real column; the derived-from-first-line title is deleted
  description
  done_condition     -- "the goal"
  state              -- the 8 task states, now the only work vocabulary
  dependencies
  artifacts
  thread_id
  notes
  audit_trail        -- the only audit mechanism; revision_log is deleted
  outcome_verdict    -- met | met_with_rework | partially_met | not_met
  outcome_summary
  outcome_recorded_at
  outcome_recorded_by
  tokens_actual_json      -- MOVED from bets; per-task, rolled up on read
  source_knowledge_item_id -- MOVED from bets (AK5 provenance)
  created_at
  updated_at
  completed_at       -- MOVED from bets
```

Deleted outright: the `bets` table and every column on it not listed above.

---

## 4. Acceptance criteria and how each is verified

CLAUDE.md: runtime behaviour → automated test; static codebase property → lint rule or the type
system; UI → the rendered DOM described in prose. No screenshots, ever.

| # | Acceptance criterion | Verification |
|---|---|---|
| AC1 | A task can be created with a `parentTaskId`, and that task can itself parent another, to at least 4 levels. Reading a root returns its full subtree. | Integration test (`*.integration.test.ts`, real DB): build a 4-deep chain, assert the tree read returns all of it in the right shape. |
| AC2 | A task cannot be its own parent, and cannot be reparented under one of its own descendants. Both are rejected at write time with a domain error, not a DB constraint failure. | Integration test: assert the self-parent case and the deep-descendant case each throw the cycle error and leave the row unchanged. |
| AC3 | When every child of a task reaches a terminal state (`done` or `killed`), the parent transitions — at any depth, not just one hop. A 3-level tree completes from the leaves up. | Integration test: complete the leaves, assert the middle then the root transition, and assert `propagation_log` records each hop. |
| AC4 | Killing a task kills its entire subtree, at any depth. | Integration test on a 3-level tree; assert every descendant reaches `killed` and none is missed. |
| AC5 | Token usage recorded against a leaf session is visible on every ancestor's read, summed over the subtree. Nothing writes a rollup column. | Integration test: end a session on a leaf, read the root, assert the summed figure. Assert no ancestor row was written. |
| AC6 | A team cannot exceed its capacity of concurrently `in_progress` tasks. The limit counts tasks at every depth. | Integration test: fill to capacity, assert the next transition to `in_progress` is refused with the capacity error, then assert it succeeds after one completes. |
| AC7 | `PATCH /tasks/:id` edits title, description, done condition, owner and dependencies. The identical request succeeds whether the actor is a human or an agent. No status gate, no role gate, no approval gate. | Integration test: the same PATCH body issued as a human actor and as an agent actor, both 200, both persisted. Assert an agent may edit a task in a non-`proposed` state. |
| AC8 | The cut list is gone from production code: no `bets` table, no `appetite`, `at_risk`, `hypothesis`, `revision_log`, bet status vocabulary, bet outcome vocabulary, retro endpoint, commit endpoint, or derived-title helper. | Governance lint rule over the production world — a static property, so not a test. The rule hard-fails if its scan matches zero files (CLAUDE.md: a guard that silently matches nothing reads as passing forever). |
| AC9 | Existing data survives: every bet becomes a root task, its tasks become that root's children, and `knowledge_items` rows scoped `bet` are re-scoped to the new root task id. | Migration test against a populated database: seed bets + tasks + bet-scoped knowledge, migrate, assert counts and parentage, assert zero orphans. |
| AC10 | One recursive task surface. The bet page, `BetCard`, `useBet`, the bet types and the bet create page are deleted. A task's subtasks render on the task page, and a task's fields are editable there. | The rendered DOM, described in prose: navigate to a nested task in the running app, and state what the tree, the breadcrumb and the edit controls actually render. Component tests cover the recursive render and the edit submit. |
| AC11 | The five primitives are four. `docs/process-layer/` no longer describes bets, the commit ceremony, or the builtin retro routines (already stale — those were deleted by BA9d and the docs still document them). | Read the docs; assert no surviving reference to a deleted mechanism. |

---

## 5. Build order

Each increment lands green on its own.

1. **Schema + data migration.** `parent_task_id`, the moved columns, the bet→root-task backfill,
   knowledge re-scoping, `bets` dropped. AC9.
2. **Work service + propagation.** Recursive rollup, recursive kill cascade, cycle rejection,
   read-time token rollup, WIP on concurrent `in_progress`. Bet state machine deleted. AC2–AC6.
3. **Routes.** `PATCH /tasks/:id`, tree read, create-with-parent. The whole bets route file deleted.
   AC1, AC7.
4. **Agent tools.** `create_bet`/`edit_bet` deleted; `create_task` takes a parent; `edit_task` added,
   ungated. AC7.
5. **UI.** One recursive task page; bet page, create page, card, hooks and types deleted. AC10.
6. **Governance + docs.** The AC8 lint rule; `docs/process-layer/` rewritten. AC8, AC11.

---

## 6. Known traps

- **The docs are already wrong before this starts.** `routines-and-retros.md` §5–§6.1 documents "the
  four builtins" and `builtin:post-bet-retro` firing on `bet_state_changed`. BA9d deleted that
  mechanism entirely (`routine/src/index.ts`: *"fireBuiltinRoutine, provisionTeamRoutines,
  registerBuiltinRoutineHandlers are deleted — the built-in routine mechanism is gone"*). Do not
  preserve behaviour described there; it does not exist.
- **A stale vocabulary entry.** `ITEM_KINDS` in `tool-handlers/src/tool-definitions.ts` still carries
  `"post-bet-retro"`, left behind by that deletion. It goes with this package.
- **`TRACK-AD.md` claims handoff "creates subtasks."** It does not — `handoff-protocol.ts` contains no
  task insert; handoff transfers ownership of the same task. Do not build against that sentence.
- **Two cycle risks, one check.** `parent_task_id` and `dependencies` can each form a cycle. See the
  BB track file's dependency note on BA6 — one check, extended, never two parallel ones.
- **Deletion-heavy, and that is the point.** Roughly 3,000 lines come out (the 900-line bets route,
  the 1,422-line bet page, the bet state machine, the card, the hooks, the types) against materially
  less going in. Per CLAUDE.md deletions never trigger the simplicity stop; the added surface is one
  migration, one recursive service pass, one route file and one page.

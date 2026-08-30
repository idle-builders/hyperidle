# Track BB: One Work Primitive

Work in HyperIdle is modelled as two primitives that turn out to be almost the same row. A **bet** and
a **task** both belong to a team, both carry a description, a done condition, a status and an outcome
verdict, and both are timestamped. The bet does not even have a title — the API derives a display
string from the first line of its description. What separates them is not their shape but their
**position**: a bet is the thing at the top, a task is the thing underneath it, and the relationship
is hardcoded to exactly two levels, from the foreign key (`tasks.bet_id`, NOT NULL) to the URL
(`/work/bet/:betId/task/:taskId`).

That fixed depth is the real defect. Work does not come in two sizes. A piece of work contains
smaller pieces of work, which contain smaller pieces still, and where the tree bottoms out is a
property of the work, not of the schema.

This track replaces the two primitives with **one recursive task**. A task has a goal, and a task may
have subtasks, to any depth. The five primitives become four.

**Founder framing (2026-08-30).** *"I want everything to be a task but a task can have subtasks and
that subtask again subtasks and so on. Each task always has a goal."* And, on the machinery that
accumulated around bets: *"that human bet retro form any how makes no sense... the bet has couple
overengineered stuff thats not really needed."*

**The second half of the same ruling: one editing surface, not two.** Today the ability to change work
is split by *who you are* and it is incoherent in both directions. A human can edit a bet at any
status through `PATCH /bets/:id`; an agent can edit one only in `draft`, only if it is the assistant,
and only behind a "HIGH RISK: requires human approval" gate. Meanwhile **nobody can edit a task at
all** — there is no `PATCH /tasks/:id` in the repository and the web app never writes a task row. An
agent may create a task and append a note to it; after that its title, goal, owner and dependencies
are frozen for everyone. This track deletes the role gate, the draft-only gate and the approval gate,
and builds the single edit door that both humans and agents go through. Per ETHOS, **Trust Agents and
Humans**: a gate is earned from a real learning, never built preemptively.

---

## What is cut, and why

The audit behind this track traced every bet-only field to a writer and a reader. Most have neither.

| Field | Verdict | Evidence |
|---|---|---|
| `appetite` | **cut** | Already dead. Rejected at the API boundary with a 400; the column survives only for rollback. |
| `at_risk` | **cut** | Never written to true anywhere in production. Read, normalised to a boolean, passed to a `BetCard` prop that is therefore always false. |
| `hypothesis` | **cut** (founder call) | Its only consumer is the retro form, which is also cut. A task has a goal; belief-shaped prose goes in the description, which is free markdown. |
| `revision_log` | **cut** | Tasks already carry `audit_trail`. Two audit mechanisms for one primitive. |
| bet `status` (4 states) | **cut** | Absorbed by the task's 8 states, which are a superset in meaning: `draft`→`proposed`, `active`→`in_progress`, `completed`→`done`, `killed`→`killed`. A root task gains `hold`, `blocked` and `review`, which bets could never enter. |
| bet outcome vocabulary | **cut** (founder call) | `validated\|refuted\|partial\|inconclusive` dies with the retro form. One vocabulary survives: the task's `met \| met_with_rework \| partially_met \| not_met` — "did the goal get met?" — which reads correctly at every depth. |
| human bet retro (`POST /bets/:id/retro` + form) | **cut** (founder call) | The automated retro already left core: BA9d deleted the builtin-routine mechanism, and `plugins/knowledge-management/skills/post-task-retro/` re-provides it — already scoped to a **task**, firing on transition to `done`. The core form is a second, human-only retro of a different shape. |
| commit ceremony (`POST /bets/:id/commit`, draft→active) | **cut** (founder call) | A ritual around starting work. Tasks start when they start. |
| derived bet title | **cut** | A task has a real `title` column. |
| `tokens_actual_json` | **kept, moved** | Genuinely written, by `work-session-end-reactions.ts`, from real session usage. Moves onto the task and rolls up the subtree at read time. |
| `source_knowledge_item_id` | **kept, moved** | AK5 promote-from-knowledge is a live feature; a forward provenance FK costs nothing. |

**The WIP limit survives, with a new anchor (founder call).** Today `activeBets` vs `capacity` is
checked in exactly one place — the commit ceremony being cut. The limit itself is worth keeping, but
as a guardrail on *execution* rather than a toll on *commitment*: a team caps how many tasks may be
`in_progress` at once. This is a strictly better anchor. It bounds what is actually consuming agents,
it applies at every depth, and it cannot be bypassed by starting work without committing it — which
today's check cannot say anything about at all.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| BB1 | Everything is a task, and a task has subtasks | backend + frontend | L | — | **planned — registered 2026-08-30.** Full destructive merge of `bets` into `tasks` with a self-referencing `parent_task_id`, the cut list above applied, recursive rollup / kill-cascade / token accumulation replacing the single two-level hop, WIP re-anchored to concurrent `in_progress`, one `PATCH /tasks/:id` open to humans and agents alike, and one recursive task surface replacing the bet page and the task page. See `work/BB1/plan.md`. |

## What this track changed outside itself

**Track BA8 loses one of its five events.** BA8 ("Things that happen announce themselves") is
registered against five event types that are "defined and dispatcher-cased with no emitter anywhere",
one of which is **bet revised**. BB1 deletes it, along with `bet_state_changed`, taking the event
vocabulary from 34 types to 32.

Neither deletion costs a capability, and the reasoning differs for each:

- `bet_revised` never fired. It is dead vocabulary, and BA8's own row is the evidence. Deleting it
  makes BA8 smaller, not harder — four events to wire instead of five.
- `bet_state_changed` is genuinely covered by `task_state_changed`, because a bet IS a root task now.

One honest consequence, recorded so nobody rediscovers it as a bug: a routine could previously say
declaratively "wake me when a BET changes state". It must now subscribe to `task_state_changed` and
decide for itself whether the task is a root (`parentTaskId === null`). The event surface is not
narrower — every fact still announces itself — but that one distinction moved from the subscription
to the subscriber. If that turns out to matter in practice, the fix is a filter on the subscription,
not a second event type.

## Dependency graph

- `BB1` → nothing. It is the substrate.
- **`BA6` ("Tasks wait for the tasks they depend on") shares ground with this package and must not
  duplicate it.** BA6 owns `tasks.dependencies` and is registered as requiring **cycle rejection** —
  "an accepted cycle parks its members forever". BB1 introduces a *second* way to build a cycle, in
  `parent_task_id`, and must reject those at write time. Whichever package lands first owns the cycle
  check; the second extends it rather than adding a parallel one. BB1 additionally settles a question
  BA6's row leaves open: whether a dependency may cross subtrees, and whether a parent may depend on
  its own child (it may not — containment already orders them).

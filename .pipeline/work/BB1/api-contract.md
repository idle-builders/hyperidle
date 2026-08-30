# BB1 — the task API, as every track must implement and consume it

This file is the single source of truth for the HTTP surface after the merge.
The routes track builds exactly this; the UI track consumes exactly this; the
tools track reaches it through `CoreApiPort`. Nobody invents a variant.

Everything under `/api/bets` is **deleted**. There is no redirect, no alias, no
compatibility route.

---

## The task row on the wire

```ts
{
  id: string
  parentTaskId: string | null      // null = root task
  teamId: string
  ownerAgentId: string | null
  title: string
  description: string | null
  doneCondition: string | null     // "the goal"
  state: "proposed" | "accepted" | "hold" | "in_progress" | "blocked" | "review" | "done" | "killed"
  dependencies: string | null      // JSON array of task ids
  artifacts: string | null
  threadId: string | null
  notes: string | null
  auditTrail: string | null
  outcomeVerdict: "met" | "met_with_rework" | "partially_met" | "not_met" | null
  outcomeSummary: string | null
  outcomeRecordedAt: string | null
  outcomeRecordedBy: string | null
  tokensActualJson: string | null  // THIS task's own sessions only
  sourceKnowledgeItemId: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}
```

---

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/tasks` | Filters: `?ids=a,b,c` · `?parent_id=<id>` · `?parent_id=root` (roots only) · `?team_id=` · `?state=` · `?owner=` · `?q=` (text over title/description/doneCondition). `ids` wins over the others, as today. |
| `GET` | `/api/tasks/:id` | The bare row. |
| `GET` | `/api/tasks/:id/tree` | `{ task, ancestors: Task[], children: TaskNode[] }` — `ancestors` root-first for the breadcrumb, `children` nested recursively. Plus `tokensActualRollup` (see below). |
| `POST` | `/api/tasks` | Body: `{ parentTaskId?, teamId, title, description?, doneCondition?, ownerAgentId? }`. `teamId` may be omitted when `parentTaskId` is given — it is inherited from the parent. Starts in `proposed`. |
| `PATCH` | `/api/tasks/:id` | **The one edit door.** See below. |
| `POST` | `/api/tasks/:id/kill` | Body `{ reason }`. Recursive: `cascadeTaskKill`. |
| `PATCH` | `/api/tasks/:id/notes` | Unchanged — atomic append. |
| `POST` | `/api/tasks/:id/handoff` | Unchanged. |
| `POST` | `/api/tasks/:id/outcome` | Body `{ verdict, summary? }`. Records the outcome. This is the surviving half of the deleted bet retro — the *learning* half is the `post-task-retro` plugin skill, not core. |

## `PATCH /api/tasks/:id` — the one edit door

Accepts any subset of:

```ts
{ title?, description?, doneCondition?, ownerAgentId?, dependencies?, parentTaskId?, state? }
```

Rules, all of which the routes track must enforce and the UI track may rely on:

1. **No actor gate.** A human and an agent send the identical request and get the
   identical result. There is no role check, no draft-only check, and no
   approval interception. This is the point of the change — do not reintroduce
   one "just for state" or "just for reparenting".
2. **`state` routes through `transitionTask`**, never a bare column write, so the
   transition guard, the WIP limit, the audit trail, the dispatch attempt and the
   `task_state_changed` event all still fire. An illegal transition is a `409`.
3. **`parentTaskId` calls `assertNoCycle` inside the same transaction as the
   write.** Two concurrent reparents can otherwise each see an acyclic tree and
   together produce a cycle. A cycle is `409`.
4. **Everything else is a plain field write** plus `updatedAt`.
5. Unknown keys are rejected (`400`), as elsewhere in this codebase.

## Error codes

| Situation | Status | Code |
|---|---|---|
| Task not found | 404 | `NOT_FOUND` |
| Illegal state transition | 409 | `INVALID_TRANSITION` |
| Parent link would form a cycle | 409 | `TASK_CYCLE` |
| Team already at its WIP limit | 409 | `CAPACITY_EXCEEDED` |
| Bad body | 400 | `INVALID_INPUT` |

## Token rollup

`tokensActualJson` on a row is **that task's own** session usage. A subtree total
is computed at read time by `GET /api/tasks/:id/tree`, returned as
`tokensActualRollup`. Nothing writes a rollup onto an ancestor — there is no
denormalised total to drift.

---

## URLs (UI track)

| Old | New |
|---|---|
| `/work/bet/:betId` | `/work/task/:taskId` |
| `/work/bet/:betId/task/:taskId` | `/work/task/:taskId` |
| `/work/bet/new` | `/work/task/new` |

One route, one page, any depth. The breadcrumb is built from `ancestors`, so it
is as deep as the task is.

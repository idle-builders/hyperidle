# Work View

**Purpose:** Planning and tracking — the Linear/Jira surface of the app.

Structure and layout only. Task lifecycle semantics live in [tasks-and-sessions](../process-layer/tasks-and-sessions.md); edges into other views in [cross-view-navigation-map](cross-view-navigation-map.md).

> **BB1 (2026-08-30):** The bet/task two-level drill is replaced by a recursive task tree at any depth. The bet page (`WorkBet`), bet create page (`WorkBetCreate`), and the bet-scoped task route are gone. One page — `WorkTask` — renders a task, its subtask tree, and its edit controls, regardless of whether the task is a root or a leaf.

## 1. Routes

Work drills from team list → team → task → subtask → … to any depth. Routes (BB1 update to `layers/core-ui/src/router.tsx`):

| Route | Page | Level |
|---|---|---|
| `/work` | WorkOverview — team list | 1 |
| `/work/team/:teamId` | WorkTeam | 2 |
| `/work/task/new` | WorkTaskCreate — full-page create | — |
| `/work/task/:taskId` | WorkTask — task detail (root or subtask, any depth) | 3+ |
| `/work/routine/:routineId` | WorkRoutine | — |

Legacy redirects: `/work/portfolio` → `/work` (unconditional), `/work/product/:productId` → `/work/team/:teamId` (U6 rename; Product = Team 1:1).

## 2. Work Overview (Level 1, `/work`)

Landing screen. Flat list of all teams; each row carries the at-a-glance triage signals (`layers/core-ui/src/pages/WorkOverview.tsx`).

| Component | Information | Actions |
|---|---|---|
| **Header** | Title "Teams" + "{n} teams" count line | — |
| **New task button** | `Button variant="primary" size="sm"` in header right | Click → `/work/task/new` |
| **Team row** (× N) | Team name (single line, truncated) + in-progress task count (numeric end cell) + `StatusChip` (healthy/behind/blocked) | Click row → `/work/team/:id` |
| **Loading state** | `SkeletonList rows={4}`, aria-label "Loading teams" | — |
| **Empty state** | `EmptyState` "No teams yet" | Action → `/setup` |
| **Error state** | `ErrorState` "Couldn't load teams" | Retry |

**Attention sort:** `blocked` → `behind` → `healthy`; within a rank, name ascending (`sortTeamsByAttention`, `layers/core-ui/src/pages/work/sortTeamsByAttention.ts:27`).

**1-team short-circuit (AD3/AD9):** exactly one team → `WorkOverview` immediately redirects to `/work/team/:id`; the 1-row list is never shown. All entry paths (sidebar, post-setup landing, bookmarked `/work`, the `/work/portfolio` redirect) collapse through this single chokepoint.

**Retired:** the cross-team portfolio grid is gone; `/work/portfolio` redirects to `/work`.

## 3. Team View (Level 2, `/work/team/:teamId`)

Stacked single column (L13, `layers/core-ui/src/pages/WorkTeam.tsx`), top to bottom:

| Section | Information | Actions |
|---|---|---|
| **Team header** | Breadcrumb + name + status + phase + lead | — |
| **Team summary** (`team-burn-vs-cap`) | Stat strip: Capacity (in-progress tasks / capacity) + Status (derives from roster) | — |
| **Active tasks** (`team-active-tasks`) | Root task rows + "+ New task" button | Task click → `/work/task/:id`; New task → `/work/task/new` |
| **Routines** (`team-routines`) | Routine rows + create dialog (AA1/AA2) | Routine click → `/work/routine/:id` — see [routines-and-retros](../process-layer/routines-and-retros.md) |
| **Team agents** (`team-agents`) | Flat `AgentRow` roster (AB2) | Add an agent |
| **Artifacts** | `ArtifactSection` | Open artifact |

The Capacity/Status stat strip lives here — not in the sidebar. It carries the WIP capacity tile only (`TeamBurn`, `framework/domain-model/src/team.ts`), backed by the `teams.capacity` column (`framework/db/src/schema.ts`). Capacity counts tasks `in_progress` at every depth — not just root tasks. The rationale for bounding concurrency is owned by [wip-and-cost-limits](../process-layer/wip-and-cost-limits.md).

## 4. Task create (`/work/task/new`)

Full page, not a dialog: bordered header (breadcrumb + title input + Cancel/Create) over a body — `BodyEditor` for description and done condition, team selector aside (single team auto-resolves, multiple teams show a `Select`). An optional `parentTaskId` query param pre-selects the parent task when creating a subtask from within a task page.

- **Promote-from-knowledge (AK5):** `?fromKnowledge=<id>` pre-fills the form; the created task carries a provenance backlink.

## 5. Task Detail (`/work/task/:taskId`)

Reached from a task row in Team View or from the subtask list on a parent task. This is the same page whether the task is a root or a leaf at any depth (`layers/core-ui/src/pages/WorkTask.tsx`).

| Component | Information | Actions |
|---|---|---|
| **Breadcrumb** | Work → [team] → [ancestor tasks…] → [this task title] | Navigate up the ancestor chain |
| **Overflow menu** | — | "Kill" |
| **State chip** | Current task state | — |
| **Stat cards row** | Progress (subtasks done/total) + Team (avatar + name) | — |
| **Provenance link** | Shown when promoted from a knowledge item (AK5) | Open source item |
| **Outcome section** | Record verdict + summary; AI retro draft; saving captures a knowledge item | Edit / save |
| **Description / Done condition** | Task body rendered as Blocks — `deriveBlocks(description, { kind: "task", id: taskId })` → `<Block />`. Spec: [docs/blocks/](../blocks/index.md) | Inline edit with save indicator |
| **Edit controls** | Title, description, done condition, owner, dependencies — `PATCH /api/tasks/:id` | Submit |
| **Subtasks** | Recursive task rows — title + owner/state/relative-time meta line, outcome verdict badge, `StatusChip` per state + `LiveDot` (pulsing) when `in_progress` | Click row → `/work/task/:subtaskId`; "+ Add subtask" → `/work/task/new?parentTaskId=:id` |
| **Artifacts** | `ArtifactSection` | Open artifact |
| **Discussion** | `HostThreadSection` chronological thread, "Write a message…" composer | Reply |

**States:** `proposed | accepted | hold | in_progress | blocked | review | done | killed`. One vocabulary at every depth — a root task is `in_progress`, not "active". Lifecycle authority: [tasks-and-sessions](../process-layer/tasks-and-sessions.md).

**Kill:** `ConsequencePreviewDialog` — the reason field is required; empty reason disables the confirm button. Killing a task kills its entire subtree. Pause/resume were removed (AD5) — kill is the only terminal action from the overflow menu.

**Edit gate:** none. `PATCH /api/tasks/:id` accepts the same body from a human actor and an agent actor; there is no draft-only gate, no role gate, and no approval gate. This matches ETHOS §2.

# Work View

**Purpose:** Planning and tracking — the Linear/Jira surface of the app.

Structure and layout only. Bet lifecycle semantics live in [bets-shape-commit-change-ship](../process-layer/bets-shape-commit-change-ship.md); task/session semantics in [tasks-and-sessions](../process-layer/tasks-and-sessions.md); edges into other views in [cross-view-navigation-map](cross-view-navigation-map.md).

## 1. Routes — the three-level drill

Work is a three-level drill: team list → team → bet, extended by task/review/routine sub-pages. The sidebar fast-nav lists teams (`packages/web/src/shell/Sidebar.tsx:65-93`); the main pane drills down. Routes (`packages/web/src/router.tsx:75-88`):

| Route | Page | Level |
|---|---|---|
| `/work` | WorkOverview — team list | 1 |
| `/work/team/:teamId` | WorkTeam | 2 |
| `/work/bet/new` | WorkBetCreate — full-page create | — |
| `/work/bet/:betId` | WorkBet — bet detail | 3 |
| `/work/bet/:betId/task/:taskId` | WorkTask | 4 |
| `/work/bet/:betId/review/:reviewId` | ReviewPage (decision UI lives here — see [review-primitive](../human-interface-layer/review-primitive.md)) | 4 |
| `/work/routine/:routineId` | WorkRoutine | — |

Legacy redirects: `/work/portfolio` → `/work` (unconditional), `/work/product/:productId` → `/work/team/:teamId` (U6 rename; Product = Team 1:1).

## 2. Work Overview (Level 1, `/work`)

Landing screen. Flat list of all teams; each row carries the at-a-glance triage signals (`packages/web/src/pages/WorkOverview.tsx`).

| Component | Information | Actions |
|---|---|---|
| **Header** | Title "Teams" + "{n} teams" count line | — |
| **New bet button** | `Button variant="primary" size="sm"` in header right | Click → `/work/bet/new` |
| **Team row** (× N) | Team name (single line, truncated) + active-bet count (numeric end cell) + `StatusChip` (healthy/behind/blocked) | Click row → `/work/team/:id` |
| **Loading state** | `SkeletonList rows={4}`, aria-label "Loading teams" | — |
| **Empty state** | `EmptyState` "No teams yet" | Action → `/setup` |
| **Error state** | `ErrorState` "Couldn't load teams" | Retry |

**Attention sort:** `blocked` → `behind` → `healthy`; within a rank, name ascending (`packages/web/src/pages/work/sortTeamsByAttention.ts:14-33`).

**1-team short-circuit (AD3/AD9):** exactly one team → `WorkOverview` immediately redirects to `/work/team/:id`; the 1-row list is never shown. All entry paths (sidebar, post-setup landing, bookmarked `/work`, the `/work/portfolio` redirect) collapse through this single chokepoint (`WorkOverview.tsx:195-198`).

**Retired:** the cross-team portfolio grid is gone; `/work/portfolio` redirects to `/work`. Cross-team bet browsing is deferred until a multi-team dashboard is warranted.

## 3. Team View (Level 2, `/work/team/:teamId`)

Stacked single column (L13, `packages/web/src/pages/WorkTeam.tsx`), top to bottom:

| Section | Information | Actions |
|---|---|---|
| **Team header** | Breadcrumb + name + status + phase + lead | — |
| **Team summary** (`team-burn-vs-cap`) | Burn vs cap stat strip — actual cost vs cost cap, % of cap used | — |
| **Active bets** (`team-active-bets`) | Bet rows + "+ New bet" button | Bet click → `/work/bet/:id`; New bet → `/work/bet/new` |
| **Routines** (`team-routines`) | Routine rows + create dialog (AA1/AA2) | Routine click → `/work/routine/:id` — see [routines-and-retros](../process-layer/routines-and-retros.md) |
| **Team agents** (`team-agents`) | Flat `AgentRow` roster (AB2) | Add an agent |
| **Artifacts** | `ArtifactSection` | Open artifact |

Team burn vs cap lives here — not in the sidebar. The WIP cap is backed by the `teams.capacity` column (`packages/db/src/schema.ts:107`). Cap grammar is owned by [wip-and-cost-limits](../process-layer/wip-and-cost-limits.md).

## 4. Bet create (`/work/bet/new`)

Full page, not a dialog (`packages/web/src/pages/WorkBetCreate.tsx`): bordered header (breadcrumb + derived-title preview + Cancel/Create) over a two-column body — `BodyEditor` left, commitments aside right (team + appetite; AG3). Empty appetite amount ⇒ field omitted ⇒ uncapped bet.

- **Appetite** is structured money — `costAppetiteMinor` + `costAppetiteCurrency` (`packages/db/src/schema.ts:151-153`) — plus an optional token budget (`tokenAppetite`, `packages/server/src/schemas/bet.schema.ts:77`). Grammar: [wip-and-cost-limits](../process-layer/wip-and-cost-limits.md).
- **Promote-from-knowledge (AK5):** `?fromKnowledge=<id>` pre-fills the form; the created bet carries a provenance backlink. Edge semantics: [bets-shape-commit-change-ship](../process-layer/bets-shape-commit-change-ship.md).

## 5. Bet Detail (Level 3, `/work/bet/:betId`)

Reached from a bet row in Team View (`packages/web/src/pages/WorkBet.tsx`).

| Component | Information | Actions |
|---|---|---|
| **Breadcrumb** | Work → [team] → [bet title]; team segment links to `/work` (`WorkBet.tsx:927-932`) | Navigate |
| **Overflow menu** | — | "Activate bet" (draft → active), "Kill" |
| **Stat cards row** | Progress (tasks done/total, `bet-progress-bar`) + Cost ("of {appetite} appetite") | Appetite adjust via `AppetiteDialog` (amount + required reason, L14) |
| **Provenance link** | Shown when the bet was promoted from a knowledge item (AK5) | Open source item |
| **Outcome section** | Record verdict + summary + learnings; AI retro draft; saving creates a retro knowledge item | Edit / save |
| **Description** | Bet body rendered as Blocks with per-block anchored discussion — `deriveBlocks(description, { kind: "bet", id: betId })` → `<Block />` (`WorkBet.tsx:202-205`). Spec: [docs/blocks/](../blocks/index.md) | Inline edit with save indicator |
| **Tasks** | Sortable rows — title / status / owner / costActual / outcome (`WorkBet.tsx:81`); `StatusChip` per state + `LiveDot` (pulsing) only when `in_progress` | Click row → `/work/bet/:betId/task/:taskId` |
| **Artifacts** | `ArtifactSection` (bet axis, before the thread) | Open artifact |
| **Discussion** | `HostThreadSection` chronological thread, "Write a message…" composer | Reply |

**Statuses:** `draft | active | completed | killed` (`packages/shared/src/types.ts:92`), plus separate outcome verdicts mapped via `betOutcomeVerdictToStatus`. Lifecycle authority: [bets-shape-commit-change-ship](../process-layer/bets-shape-commit-change-ship.md).

**Kill:** `ConsequencePreviewDialog` — the reason field is required; empty reason disables the confirm button (`WorkBet.tsx:271-342`). Pause/resume were removed (AD5) — kill is the only terminal action.

DESIGN-CLASS: novel  ref=Sidebar.tsx+ItemList/Row  pattern=Conversations/KnowledgeList-overview

# AD9 Design Brief — Uniform Section Navigation & Work Overview as Team List

## Why this is `novel` despite a strong reuse base

The *rendering* is routine — the Work overview is pure `ItemList`/`Row` composition, and Conversations/Knowledge are the working analog. But the **interaction grammar of the global shell** is the genuinely contested decision: today each section header *deep-links* (Conversations → `/conversations`; Work → first team OR `/work/portfolio`; Knowledge → `/knowledge`). AD9 reshapes the header into a *section switch that surfaces an overview*. That grammar shapes every section, every day — it is the novel part and gets 3 variants. The team-row column set is settled as a sub-decision within whichever variant wins.

## Concept (fixed input — `plans/AD9/concept.md`)

- Header click = select section (switch sidebar quick-nav list + surface overview in `<main>`). Item click = navigate into item.
- Work overview = a list of teams (one Row per team) with runtime status from `TeamListItem`. NOT a bet grid, NOT a filter surface, NOT a dashboard.
- AD3 exception preserved: 1 team → Work header lands directly on that team (no overview, no 1-item list).
- `/work/portfolio` retired as a path. BetCard preserved (team detail). No data-model / endpoint change — `useTeams()` already returns everything.
- Do NOT regress Conversations/Knowledge.

## Phase 0b — Reuse inventory (hard gate)

| Element needed | Existing component | Status |
|---|---|---|
| Section header (sidebar) | `Sidebar.tsx` `SectionHeader` (raw button) | EXTEND (behavior, not shape) |
| Section quick-nav sub-item list | `Sidebar.tsx` raw `<li><button>` (threads/teams) | EXTEND (uniform across sections) |
| Overview list container | `ItemList` (variant="flush") | REUSE |
| Team row | `Row` (`title`, `subtitle`, `cells[]`, `lead`, `actions`, `onClick`) | REUSE |
| Team status pill | `StatusChip` (status `healthy\|behind\|blocked` = `TeamStatus` 1:1) | REUSE |
| Phase / agent tag | `Tag` | REUSE |
| Progress signal | numeric `RowCell` (done/total) — or `Progress` if a bar is wanted | REUSE |
| Attention dot | `RowDot` / inline dot (already used in portfolio header) | REUSE |
| Empty / loading / error | `EmptyState` / `SkeletonList` / `ErrorState` | REUSE |
| "New bet" action | `Button` (primary, sm) | REUSE |

**NEW shapes: zero.** Every variant ships inside the existing component budget. The team row is `Row` composition; the only question is which signals occupy the cells.

## Team-row signal candidates (from `TeamListItem`, all server-derived)

`status` (healthy/behind/blocked), `phase` (shape/build/cool-down), `activeBets` (count), `progress {done,total}`, `agentCount`, `activeAgentCount`, `agentHealthWarning` (bool), `routineCount`, `shipped`, `shipRate`, `leadAgentId`.

Most decision-useful for "which team needs me": **status**, **active bets**, **agents active / total + health warning**. Least useful at a glance: shipRate, shipped (history, not attention), routineCount (ambient).

## Phase 0 — Interrogated decisions (resolved from concept + code, no open probes)

- **Who / what decision:** A founder opening Work decides *which team to enter*. With 1 team that decision is trivial → skip the overview (AD3). With 2+, the overview must answer "which team needs attention" in one scan.
- **Smallest surface:** A list of teams. No filters, no metrics bar, no cross-team aggregation.
- **Primary state:** populated (2+ teams) for multi-team; the 1-team founder never sees it. Empty state (0 teams) is a setup edge — should route to /setup before this renders, but handle defensively.
- **Uniformity question (the variant axis):** does "header surfaces overview" apply identically to all three sections, and what does Work's overview look like? → the three variants below.

## The three variants (spread on the contested axis: nav grammar + Work main-view)

- **A — Switch-and-Overview (uniform, symmetric).** Header selects section: switches the sidebar quick-nav list AND surfaces that section's overview in main. All three sections behave identically. Work overview = team list. The honest, literal reading of the concept.
- **B — Overview-as-default-with-persistent-quicknav.** Same grammar, but the sidebar quick-nav list for the selected section is *always* shown (not just on a second click), and the overview main-view leads with a compact "needs attention" ordering. Optimizes for the power user who lives in one section.
- **C — Active-team-spotlight.** Work overview is not a flat equal list — it surfaces the team(s) with non-healthy status / active work at the top with a denser row, and demotes quiet teams. Borrows Linear's "active vs backlog" sectioning. Challenges the "uniform flat list" reading.

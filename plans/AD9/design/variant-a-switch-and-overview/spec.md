# Variant A — Switch-and-Overview (uniform, symmetric)

**User task.** A founder clicks a section header to move between Conversations / Work / Knowledge; the sidebar list below switches to that section's items and the main view shows that section's overview. Clicking an item enters it.

## Nav grammar (the signature)

Every section header behaves **identically**:
1. Click header → `handleViewChange(view)`.
2. Sidebar: the quick-nav sub-list under that header switches to show *that section's items* (threads / teams / —). The other two sections collapse to just their header.
3. Main: navigates to that section's **overview route** (`/conversations`, the Work overview, `/knowledge`).
4. Clicking a sub-list item OR an overview row → navigates into the item (`/conversations/:id`, `/work/team/:id`, `/knowledge/:id`).

**AD3 exception (preserved, documented):** Work with exactly 1 team → header skips the overview and lands on `/work/team/:onlyId`; the Work quick-nav list stays suppressed (a 1-item list is noise).

This is the literal concept reading — symmetric, predictable, nothing clever.

## Work overview — team list

Reuses the exact page frame of Conversations/Knowledge: fixed header (`shrink-0`, 20px/600 title + border-bottom) + `flex-1 overflow-y-auto` body, `max-w-[800px] mx-auto` list column.

- **Header:** `Teams` title (left) + `New bet` Button (primary, sm, right). No filters, no tabs, no metrics spans.
- **Body:** `ItemList variant="flush"` of team `Row`s.

### Team Row composition

```
Row
  title    = team.name
  subtitle = `${activeBets} active bet${s}` · phase (e.g. "build")   ← tertiary line
  cells    = [
    { content: StatusChip(status), align:"end" },                    ← healthy/behind/blocked
    { content: `${activeAgentCount}/${agentCount}`, numeric, tone: agentHealthWarning?"warning":"info", data-testid:"team-agents" },
    { content: relative-ish phase or progress `${done}/${total}`, numeric }   (hideBelow 640)
  ]
  onClick  = navigate(`/work/team/${id}`)
```

Status order is unchanged (server order); A does NOT reorder. Eye lands first on **team name** (left), status pill is the right-anchored scan column.

## States

- **empty (0 teams):** `EmptyState` — title "No teams yet", description "Teams group your agents and bets. Create your first team in setup.", action `Button` → `/setup`. (Defensive — FirstRunRedirect normally prevents reaching here with 0 teams.)
- **loading:** `SkeletonList rows={4}` inside the body.
- **error:** `ErrorState` title "Couldn't load teams" + retry.
- **populated:** the team list.
- **overflow:** long team names truncate (`Row` title is `flex-1 truncate`); cells `shrink-0`.

## Behavior / motion / keyboard

- Header hover: existing `hover:bg-[rgba(44,36,26,0.04)]` (unchanged).
- Active section header: bold 600 + primary text (unchanged token treatment).
- Row hover/selected: inherited from `Row`/`ItemList`.
- `⌘1/2/3` switch sections (existing `useNavShortcuts` → `handleViewChange`) — now lands on the overview uniformly.
- No new keyboard verbs (founder rejection list).
- Motion: section switch is route nav (no custom transition); sidebar list swap uses existing fast background transition only.

## Mobile

Three-tab layout: each tab = a section overview. Tapping the Work tab shows the team list (same Rows, full-width, cells `hideBelow` drops the progress column). Item tap → detail. The sidebar quick-nav list concept collapses into the tab + overview on mobile (no persistent sub-list).

## Signature

**Perfect symmetry.** All three headers do the same thing; there is exactly one rule to learn. The Work overview is visually a sibling of the Conversations and Knowledge overviews — same frame, same Row rhythm.

## Trade-offs (what A is bad at)

- A flat equal-weight list does not itself surface "which team needs me" — the user reads status pills column-by-column. Fine for 2-4 teams, weaker at 6+.
- The second-click-to-overview is implicit: for the section you're already in, clicking the header just re-lands on the overview (a no-op-ish nav). Predictable but not "smart".

# AD9 — Approved Design

**Chosen:** Variant A (Switch-and-Overview) base + Variant B's attention-sort default ordering.
**Class:** novel (nav grammar). Render evidence: `comparison-board.png` (Variant A row + B's sort applied = the top list in that board, re-ordered).
**Founder design-review decision (post-render):** layout confirmed (flat, attention-sorted list — A frame + B sort). Team row simplified to ONLY a status chip + the active-bet count; the `active agents (X/Y)` cell and the `task progress (done/total)` cell are dropped entirely. Section 2 reflects this.
**Concept (fixed input):** `plans/AD9/concept.md`.

---

## 1. Nav grammar (the global shell change)

All three section headers (Conversations, Work, Knowledge) behave **identically**:

1. **Header click → select section.** The sidebar quick-nav sub-list under that header shows *that section's items* (threads under Conversations; teams under Work; Knowledge has no sub-list today — unchanged). The other two sections show only their header.
2. **Header click → surface the section overview in `<main>`.** Conversations → `/conversations` (its overview), Work → the Work overview (team list), Knowledge → `/knowledge` (its overview).
3. **Item click → navigate into the item.** Sidebar sub-item OR overview row → `/conversations/:id`, `/work/team/:id`, `/knowledge/:id`.
4. A header click **never** lands on a specific item — **one documented exception:** Work with exactly 1 team lands directly on `/work/team/:onlyId` and keeps the Work sub-list suppressed (AD3 AC-1, preserved).

**What changes vs today:** only the Work header destination. Today Work → `/work/portfolio` (2+ teams). After AD9 → the Work overview (team list). Conversations and Knowledge headers already surface their overviews — they are NOT regressed; the grammar simply becomes the explicit, uniform rule.

**Sidebar reveal model unchanged:** the active section reveals its sub-list (existing behavior). AD9 does not add a second-click reveal step.

---

## 2. Work overview — team list (the new main surface)

Replaces the `WorkPortfolio` bet grid as the Work landing. Frame is identical to Conversations/Knowledge overviews: `flex flex-col h-full` → fixed `<header>` (`shrink-0`, `px-[24px] py-[18px]`, border-bottom, 20px/600 title) + `flex-1 overflow-y-auto` body → `max-w-[800px] mx-auto w-full` list column.

### Header
- Title `Teams` (left, `text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]`).
- Optional count sub-line `${n} teams` (`text-[13px] text-[var(--text-tertiary)]`), shown only when teams exist (mirrors Conversations' optional count).
- `New bet` `Button variant="primary" size="sm"` (right, `ml-auto`) → `navigate("/work/bet/new")`. Preserved from portfolio; the only action that survives.
- **No** status/verdict/team filter pills, **no** tabs, **no** routine/agent summary spans. All retired with the grid.

### Body — `ItemList variant="flush" as="ul"` of team `Row`s

**Ordering (from B):** attention-sort client-side — `blocked` (0) → `behind` (1) → `healthy` (2); within a rank, tie-break `name` asc. Pure function over `TeamListItem[]` so it can be unit-tested directly. (The former `agentHealthWarning`-first intra-rank tie-break is removed: it depended on the agents signal, which the row no longer surfaces — see "Simplified row" below.)

**Team Row composition (per team) — simplified row:** the row carries ONLY two signals: the **active-bet count** (as the subtitle) and the **status** (as the single end cell). No agents cell, no progress cell.

```
Row
  as       = "li"
  data-testid = "team-row"
  title    = team.name                                                       (primary, flex-1 truncate)
  subtitle = `${activeBets} active bet${activeBets===1?"":"s"}`              (tertiary; the active-bet count)
  cells    = [
    { content: <StatusChip status={status} />, align: "end" },              // healthy|behind|blocked → 1:1 TeamStatus
  ]
  onClick  = () => navigate(`/work/team/${encodeURIComponent(team.id)}`)
```

**Why subtitle (not a numeric cell) for the bet count.** Knowledge Rows already use `subtitle` for the row's secondary descriptor (`KnowledgeList.tsx` L467: `subtitle={item.body?.slice(0, 120)}`). Carrying the bet count in the subtitle keeps the Work overview consistent with the Conversations/Knowledge Row grammar, reads as plain language (`3 active bets`), and avoids a lone near-empty numeric cell competing with the StatusChip. The status is the only end cell.

All data from `TeamListItem` (already returned by `useTeams()` → `GET /api/teams`): `status` (inherited from `TeamSummary`) and `activeBets: number` (the active-bet count, directly on `TeamListItem`). No new fields, no new endpoint, no data-model change.

---

## 3. All states (with copy)

| State | Surface | Copy |
|---|---|---|
| **loading** | `SkeletonList rows={4}` inside body | aria-label "Loading teams" |
| **error** | `ErrorState` | title "Couldn't load teams"; retry → refetch |
| **empty (0 teams)** | `EmptyState` (defensive — FirstRunRedirect normally routes 0-team users to /setup) | title "No teams yet"; description "Teams group your agents and bets. Finish setup to create your first team."; action `Button` → `/setup` |
| **populated** | the attention-sorted team list | — |
| **1 team** | overview NOT shown — collapses to `/work/team/:onlyId` (AD3) | — |

> **1-team reach-of-`/work` (resolves design-critique WARNING).** The AD3 skip is enforced at a single chokepoint: `WorkOverview` itself redirects (`<Navigate to="/work/team/:id" replace>`) whenever `useTeams` resolves to exactly one team. So a 1-team user reaching `/work` by *any* route — sidebar header (`handleViewChange`), post-setup landing, breadcrumb, or a bookmarked `/work`/`/work/portfolio` — never sees a 1-row list; they land on the team page. The visual contract for the overview therefore applies only to the 2+-team case. See `architecture.md` §"The 1-team short-circuit" + AC11.
| **overflow** | team name truncates (Row title `flex-1 truncate`); the StatusChip cell is `shrink-0` | — |

---

## 4. Behavior / motion / keyboard

- Header hover/active: unchanged existing `Sidebar.SectionHeader` treatment (hover bg, active 600/primary).
- Row hover/selected: inherited from `Row`/`ItemList`.
- `⌘1/2/3`: existing `useNavShortcuts` → `handleViewChange` — now lands on overviews uniformly.
- No new keyboard verbs (founder rejection list).
- Motion: section switch is route navigation (no custom transition); no new motion introduced.

---

## 5. Mobile

Three-tab layout. The Work tab renders the team list full-width (same Rows). The row is already minimal (title + active-bet subtitle + StatusChip), so it renders identically at all widths — nothing to drop responsively. Row tap → `/work/team/:id`. No persistent sidebar sub-list on mobile (tab + overview replace it).

---

## 6. Component mapping (zero new shapes)

| Slot | Component | Notes |
|---|---|---|
| Page frame | raw `<div>/<header>` per existing overview pattern | matches Conversations/Knowledge |
| List | `ItemList` `variant="flush" as="ul"` | reuse |
| Team row | `Row` (`title`, `subtitle`, `cells`, `onClick`, `as="li"`) | reuse |
| Status | `StatusChip` (`status` ∈ healthy/behind/blocked) | reuse; `TeamStatus` 1:1; the single end cell |
| Active-bet count | `Row` `subtitle` (plain language) | reuse; no numeric cell |
| New bet | `Button` primary sm | reuse |
| Empty/Loading/Error | `EmptyState` / `SkeletonList` / `ErrorState` | reuse |

---

## 7. Rejected (do not re-litigate)

- Sectioned overview (Variant C: NEEDS ATTENTION / ACTIVE / QUIET) — breaks uniformity with Knowledge's flat list; only pays off at 4+ mixed-health teams (the deferred multi-team dashboard).
- Leading status RowDot (Variant B) — redundant with right-anchored StatusChip.
- Any filter/verdict/team pills, tabs, metrics/summary spans on the Work overview — retired with the portfolio grid.
- The `active agents (X/Y)` cell and the `task progress (done/total)` cell on the team row (founder design-review decision) — the row carries only status + active-bet count. The `agentHealthWarning` intra-rank sort tie-break went with the agents signal; tie-break is now `name` asc only.
- Cross-team bet browsing / a flat all-bets list — deferred per spec out-of-scope.
- A second-click-to-reveal sidebar sub-list step — reveal model unchanged.

---

## 8. Open questions for `/architecture`

1. **Work landing route shape.** Two options to resolve: (a) a dedicated `/work` (or `/work/teams`) route rendering the new team-list overview component, with `handleViewChange("work")` navigating there for 2+ teams; OR (b) keep no standalone overview route and render the team list at the former `/work/portfolio` path renamed. Constraint from concept: the path string "portfolio" must NOT survive in any user-facing route. Recommend (a): a clean `/work` overview route.
2. **`/work/portfolio` disposition.** Redirect `/work/portfolio` → the new Work overview route (preserve old bookmarks/links) vs 404. Recommend redirect (graceful), consistent with how legacy routes are handled elsewhere.
3. **`parentPathFor` + breadcrumbs + post-setup landing + `NotFound` fallback + `WorkBet`/`WorkTask`/`WorkBetCreate`/`WorkRoutine` "Work" links** — all currently point at `/work/portfolio`; architecture enumerates and repoints them to the new Work overview route (or, where structurally correct, to the specific team).
4. **`useBets` / `WorkPortfolio.tsx` / `portfolioFilters.ts` disposition** — architecture decides deletion vs retention based on remaining consumers. `BetCard` stays (team detail).
5. **Component placement** — new `WorkOverview` (team-list) page component lives in `packages/web/src/pages/`; the attention-sort is a pure helper (testable) likely beside it.

The visual contract above (frame, Row composition, status set, states, copy, ordering) is locked. Architecture decides routes, file paths, and wiring — not hierarchy, component vocabulary, or interaction grammar.

---

## Cleanup note

The 3-variant TSX sketch used to produce `comparison-board.png` lived briefly at `packages/design-system/src/AD9WorkOverview.stories.tsx` and has been **removed from the catalog** (it must not ship — it would add a stray story to the snapshot enumeration baseline). A reference copy is kept as a non-catalog design artifact at `plans/AD9/design/variant-sketches.stories.tsx`. `/write-code` should NOT re-add it; the real deliverable is a `WorkOverview` page component + its own `.stories.tsx` rendering the empty/loading/error/populated states.

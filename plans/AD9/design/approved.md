# AD9 — Approved Design

**Chosen:** Variant A (Switch-and-Overview) base + Variant B's attention-sort default ordering.
**Class:** novel (nav grammar). Render evidence: `comparison-board.png` (Variant A row + B's sort applied = the top list in that board, re-ordered).
**Founder design-review decision (post-render):** layout confirmed (flat, attention-sorted list — A frame + B sort). Team row simplified to ONLY a status chip + the active-bet count; the `active agents (X/Y)` cell and the `task progress (done/total)` cell are dropped entirely. Section 2 reflects this.
**STATUS: HUMAN-APPROVED** (founder /human-design-review, 2026-06-15). The two surfaces below — the Work overview team list and the redesigned shell sidebar (§1, SidebarV2) — are the locked design. Build phase implements them; see "Build handoff" at the end.

**Founder /human-design-review decisions (post-render) — supersede earlier passes where in conflict:**
  1. **Single-line team row.** The team name takes the full row height as one vertically-centered line. The active-bet count moved OUT of the subtitle to a right-side end cell (numeric, tabular-nums) placed before the StatusChip. Row reads `[name .......... N active bets] [StatusChip]`. **Supersedes §2's "subtitle (not a numeric cell)" decision** (see §2 + §7).
  2. **Loading gap.** Top gap above the first skeleton bar so it clears the header border-b. Founder annotated 16px; 16 is off the Hearth 6px grid → **18px (`--space-6`, on-grid, AQ-001)** on the loading body wrapper.
  3. **Sidebar redesigned — SidebarV2 (replaces the earlier "header reveals a sub-list" grammar entirely).** New layout, top→bottom: (a) **search field at the very top**, with an **Assistant icon button (robot glyph) immediately to its right** on the same row; (b) three **selectable** top-level items **Conversations / Work / Knowledge**; (c) a **separator**; (d) a single **shared fast-nav list** below the separator showing the head ("top X that fit") of the **active** section's items — threads / teams / knowledge items — that **swaps** when a different top-level item is selected; (e) a **Settings** entry pinned at the **bottom** (gear + label). Full spec in §1. Render evidence: `sidebar-live/` + the SidebarV2 story (`Shell/SidebarV2 (AD9 new)`).
**Render evidence:** `work-overview-live/populated-single-line-rows.png`, `work-overview-live/loading-skeleton-gap.png`, `work-overview-live/row-hover-canonical.png` + `row-hover-fixed.png` (Row hover target — see §4), `sidebar-live/sidebarv2-conversations-active.png` + `sidebar-live/sidebarv2-work-active.png` (section-swap: threads vs teams in the shared fast-nav).
**Design source of truth (stories):** `packages/web/src/shell/SidebarV2.stories.tsx` (the approved sidebar — presentational, fixture-driven, 4 variants) + `packages/web/src/pages/WorkOverview.stories.tsx` (the team-list states).
**Concept (fixed input):** `plans/AD9/concept.md`.

---

## 1. Shell sidebar — SidebarV2 (the global shell change)

The approved sidebar, top → bottom:

1. **Search row (very top).** A `SearchField` spanning the sidebar width, with the **Assistant icon button** (a **robot** glyph, 32×32, `--r-default`) **immediately to its right on the same flex row**. The ⌘K hint pill inside the search field carries a touch more horizontal padding so it isn't crammed against its rounded corners.
2. **Three selectable top-level items: Conversations / Work / Knowledge** (in that order). Exactly one is active at a time; the active item gets the elevated surface treatment. **The active item's icon is `--text-primary`** (NOT the accent green — green clashed with the elevated surface; founder call), so the active row reads as one solid dark weight (icon + label). Inactive icons are `--text-tertiary`.
3. **A separator** (`<hr>`, `--border-subtle`).
4. **One shared "fast-nav" list** below the separator (`ItemList variant="flush" as="ul"` of `Row as="li"`). It renders the **head ("top X that fit")** of the **currently-active** section's list — threads for Conversations, teams for Work, knowledge items for Knowledge — and **swaps its contents when a different top-level item is selected**. It is a single shared region, not three stacked lists.
5. **Settings** pinned at the **bottom** (gear icon + "Settings" label), separator above, same active/hover grammar as the top-level items.

**Interaction grammar:**
- **Selecting a top-level item** → (a) marks it active, (b) swaps the fast-nav list below the separator to that section's items, and (c) **navigates `<main>` to that section's OVERVIEW page** (Conversations → `/conversations`; Work → the Work overview team list, §2; Knowledge → `/knowledge`).
- **Clicking a fast-nav item** → navigates directly to that specific subpage (`/conversations/:id`, `/work/team/:id`, `/knowledge/:id`).
- **One documented exception (AD3 AC-1, preserved):** Work with exactly 1 team lands directly on `/work/team/:onlyId` (the Work overview short-circuits — §3 1-team note).

**Hover uniformity (founder call):** the top-level items and the fast-nav `Row`s must share ONE hover treatment — the accent-tinted `color-mix(in_oklab, var(--accent-primary) 4%, var(--surface-elevated))` that `Row`/`clickableProps` already uses. They must not hover differently.

**Design source of truth:** `packages/web/src/shell/SidebarV2.stories.tsx` — presentational `SidebarV2`, fixture-driven, local-state-interactive (4 variants: `Interactive`, `ConversationsActive`, `WorkActive`, `KnowledgeActive`). Evidence: `sidebar-live/sidebarv2-conversations-active.png` (threads) + `sidebar-live/sidebarv2-work-active.png` (teams).

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

**Team Row composition (per team) — single-line row (2nd-pass /human-design-review):** the row carries ONLY two signals: the **active-bet count** and the **status**, BOTH as right-side end cells. The team name takes the full row height as one vertically-centered line — **no subtitle stack**. No agents cell, no progress cell.

```
Row
  as       = "li"
  data-testid = "team-row"
  title    = team.name                                                       (primary, flex-1 truncate, single-line full-height)
  cells    = [
    { content: `${activeBets} active bet${activeBets===1?"":"s"}`,           // active-bet count
      align: "end", numeric: true, "data-testid": "team-active-bets" },      //   numeric → tabular-nums (AQ-006)
    { content: <StatusChip status={status} />, align: "end" },               // healthy|behind|blocked → 1:1 TeamStatus
  ]
  onClick  = () => navigate(`/work/team/${encodeURIComponent(team.id)}`)
```

**Why the count is now a right-side end cell, not a subtitle (supersedes the prior decision).** Founder /human-design-review directive: each team row must read as ONE line. With no `subtitle` prop, `Row`'s title fills the full row height vertically-centered (the second text line only renders when `subtitle` is present). The count moves to a numeric end cell placed *before* the StatusChip, so the row reads `[name .......... N active bets] [StatusChip]`. `numeric: true` gives tabular-nums (AQ-006). This denser one-line read was the founder's explicit call; it replaces the earlier "subtitle keeps Conversations/Knowledge Row grammar" rationale (a count is a metric, not a descriptive secondary line — the end-cell placement reads it as the meta it is, beside the status it pairs with).

All data from `TeamListItem` (already returned by `useTeams()` → `GET /api/teams`): `status` (inherited from `TeamSummary`) and `activeBets: number` (the active-bet count, directly on `TeamListItem`). No new fields, no new endpoint, no data-model change.

---

## 3. All states (with copy)

| State | Surface | Copy |
|---|---|---|
| **loading** | `SkeletonList rows={4}` inside body, body wrapper carries `pt-[18px]` (`--space-6`) so the first bar clears the header border-b (2nd-pass /human-design-review) | aria-label "Loading teams" |
| **error** | `ErrorState` | title "Couldn't load teams"; retry → refetch |
| **empty (0 teams)** | `EmptyState` (defensive — FirstRunRedirect normally routes 0-team users to /setup) | title "No teams yet"; description "Teams group your agents and bets. Finish setup to create your first team."; action `Button` → `/setup` |
| **populated** | the attention-sorted team list | — |
| **1 team** | overview NOT shown — collapses to `/work/team/:onlyId` (AD3) | — |

> **1-team reach-of-`/work` (resolves design-critique WARNING).** The AD3 skip is enforced at a single chokepoint: `WorkOverview` itself redirects (`<Navigate to="/work/team/:id" replace>`) whenever `useTeams` resolves to exactly one team. So a 1-team user reaching `/work` by *any* route — sidebar header (`handleViewChange`), post-setup landing, breadcrumb, or a bookmarked `/work`/`/work/portfolio` — never sees a 1-row list; they land on the team page. The visual contract for the overview therefore applies only to the 2+-team case. See `architecture.md` §"The 1-team short-circuit" + AC11.
| **overflow** | team name truncates (Row title `flex-1 truncate`); the StatusChip cell is `shrink-0` | — |

---

## 4. Behavior / motion / keyboard

- Sidebar item hover/active: one uniform hover (accent-tinted `color-mix`) across top-level items AND fast-nav rows (§1). Active top-level item → elevated surface, icon `--text-primary`.
- Row hover/selected: inherited from `Row`/`ItemList`. **Build requirement (founder flagged):** the canonical `Row` `as="li"` branch currently applies the hover background to an inner `div` nested INSIDE the `<li>`'s `px-[24px]`, so the highlight is **inset** instead of filling the row — it must hover **edge-to-edge**, matching the `<button>` branch (move layout + padding + hover surface onto a `w-full` inner div; keep the separator + listitem role on the `<li>`). Target shown in `work-overview-live/row-hover-fixed.png` vs `row-hover-canonical.png`. This is a shared-primitive fix (also corrects KnowledgeList/WorkTeam li-rows) for the **builder's green phase** — NOT done in the design commit.
- `⌘1/2/3`: existing `useNavShortcuts` → `handleViewChange` — now lands on overviews uniformly.
- No new keyboard verbs (founder rejection list).
- Motion: section switch is route navigation (no custom transition); no new motion introduced.

---

## 5. Mobile

Three-tab layout. The Work tab renders the team list full-width (same Rows). The row is already minimal (single-line title + active-bet end cell + StatusChip), so it renders identically at all widths — nothing to drop responsively. Row tap → `/work/team/:id`. No persistent sidebar sub-list on mobile (tab + overview replace it).

---

## 6. Component mapping (zero new shapes)

| Slot | Component | Notes |
|---|---|---|
| Page frame | raw `<div>/<header>` per existing overview pattern | matches Conversations/Knowledge |
| List | `ItemList` `variant="flush" as="ul"` | reuse |
| Team row | `Row` (`title`, `subtitle`, `cells`, `onClick`, `as="li"`) | reuse |
| Status | `StatusChip` (`status` ∈ healthy/behind/blocked) | reuse; `TeamStatus` 1:1; the last (rightmost) end cell |
| Active-bet count | `Row` `cells[]` end cell, `numeric: true` (tabular-nums) | reuse; placed before the StatusChip — NOT a subtitle (2nd-pass review) |
| New bet | `Button` primary sm | reuse |
| Empty/Loading/Error | `EmptyState` / `SkeletonList` / `ErrorState` | reuse |

---

## 7. Rejected (do not re-litigate)

- Sectioned overview (Variant C: NEEDS ATTENTION / ACTIVE / QUIET) — breaks uniformity with Knowledge's flat list; only pays off at 4+ mixed-health teams (the deferred multi-team dashboard).
- Leading status RowDot (Variant B) — redundant with right-anchored StatusChip.
- Any filter/verdict/team pills, tabs, metrics/summary spans on the Work overview — retired with the portfolio grid.
- The `active agents (X/Y)` cell and the `task progress (done/total)` cell on the team row (founder design-review decision) — the row carries only status + active-bet count. The `agentHealthWarning` intra-rank sort tie-break went with the agents signal; tie-break is now `name` asc only.
- ~~The bet count as a `subtitle` (1st-pass decision)~~ — **SUPERSEDED by the 2nd-pass /human-design-review.** The count is now a numeric right-side end cell before the StatusChip; the row is single-line (name full-height, no subtitle). See §2.
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

---

## Build handoff (green phase)

This design commit contains ONLY design artifacts (stories, screenshots), the workpackage/progress update, and the skill/agent-doc edits. Per the designer-scope rule, **no production code, tests, or snapshots were committed** here — the builder implements all of the following in the green phase and runs the full verify suite:

1. **WorkOverview team list** — implement the single-line `Row` (name full-height, active-bet count as a numeric end cell before the StatusChip, no subtitle; §2) and the `pt-[18px]` loading gap (§3). The `WorkOverview` page component + `sortTeamsByAttention` helper already exist on the branch from the red phase; reconcile them to this approved spec.
2. **SidebarV2 integration** — `SidebarV2.stories.tsx` is a **presentational story only; it is NOT wired into the real app `Sidebar.tsx`.** The builder integrates the approved SidebarV2 layout + interaction grammar (§1) into the production shell sidebar, with real routing (section select → overview nav + fast-nav swap; fast-nav item → subpage) and the real data sources for the fast-nav lists.
3. **Row edge-to-edge hover fix** — the shared-primitive fix described in §4 (li-branch hover must fill the row, not inset). Affects WorkOverview / KnowledgeList / WorkTeam li-rows. Re-bless the DOM-snapshot net **after reviewing the diff** (it will show the li-branch class restructure).
4. Then `npm run check` + `npm run lint` + `npm run test:all` green, and `/ship`.

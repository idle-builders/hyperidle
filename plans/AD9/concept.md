# AD9 — Concept: Uniform Section Navigation & Work Overview as Team List

**Level:** Per-workpackage concept. Inherits the existing app-shell three-section model (`docs/information-architecture/`) as fixed input.

**Founder decision (2026-06-15):** Kill the consolidated "All bets" / portfolio grid as a destination — it confuses more than it helps. Make navigation uniform across the three sections. The Work overview becomes a list of teams, mirroring the Conversations and Knowledge overviews.

---

## Required reading (downstream `/architecture`, `/design`)

- `.pipeline/work-packages/TRACK-AD.md` → §"AD9 — Remove Portfolio Page" (the respecced outcome).
- `packages/web/src/shell/Sidebar.tsx` — section headers + active-section sub-item reveal. The surface that changes most.
- `packages/web/src/layouts/AppShell.tsx` → `handleViewChange` (~L305) — current deep-link-on-header behavior.
- `packages/web/src/pages/WorkPortfolio.tsx` — the page being retired as a destination.
- `packages/web/src/pages/Conversations.tsx`, `packages/web/src/pages/KnowledgeList.tsx` — the reference overview-list pattern Work converges onto.
- `packages/web/src/router.tsx` — `/work/portfolio` route + redirects.
- `packages/web/src/navigation/parentPathFor.ts`, `FirstRunRedirect.tsx`, `SetupFlow.tsx`, `WorkBet.tsx`, `WorkTask.tsx`, `WorkBetCreate.tsx`, `WorkRoutine.tsx`, `NotFound.tsx` — every `/work/portfolio` reference (landing, parent, breadcrumb, fallback).
- `packages/shared/src/team.ts` → `TeamListItem` / `TeamListResponse` — the wire shape that already carries every runtime status signal a team row needs.
- `packages/web/src/components/ThreadSections.tsx` — Conversations overview list (Row pattern reference).

---

## Phase 0 — Nouns

| Noun | Class | One-line working definition |
|---|---|---|
| **Section overview** | Reshaped (clarified) | The main-view content a section header surfaces when its section is selected — the list landing for that section, NOT a deep-linked detail. |
| **Work overview** | Reshaped | Was the portfolio/all-bets grid; becomes the team-list overview — the Work section's landing list. |
| **Portfolio / All bets** | **Retired** | A consolidated cross-team bet grid at `/work/portfolio`. Retired as a destination noun. |
| **Section quick-nav list** | Reshaped (clarified) | The sidebar sub-item list shown under the *selected* section header (threads / teams / — for knowledge). |
| Team, Thread, Knowledge item, BetCard, `TeamListItem` | Stable inputs | Used as-is. No concept work. |

**Contract scan result (the spec's explicit ask).** No `docs/concept/` folder and no `SHARED.md` exist. "Portfolio"/"All bets"/"all-bets" appears **only** as: (a) prose in `docs/` (mostly `archive/`, `requirements/`, `guides/user/`); (b) route strings and component/hook names in `packages/web`. There is **no shared type, wire contract, or primitive named portfolio / all-bets** in `packages/shared`. `useBets` (the flat all-team bet list) exists solely to feed `WorkPortfolio`. **Conclusion: no shared contract depends on an all-bets primitive. Retiring the noun is contract-safe.**

---

## Phase 1 — Probe the essence (the two reshaped nouns)

### Section overview

1. **Identity.** A *section overview* is the landing list-view for a section — a navigable list of that section's primary items, rendered in `<main>`. It is the destination of clicking a section header; it is not a detail surface and not a dashboard. My read: it is a **list**, the same kind of thing for all three sections.
2. **Essential properties.** Every section overview: (a) renders a list of the section's primary items using the shared `ItemList`/`Row`/`EmptyState`/`SkeletonList` rhythm; (b) handles all four states (empty / loading / error / populated); (c) item click navigates into the item; (d) the header that surfaces it is the section's *switch* control, not an item link.
3. **Rejection list.** A section overview is **not** a detail page (it lists, it does not show one entity's internals); **not** a dashboard/metrics summary (no hero numbers, no cross-section aggregation); **not** an intermediate index you must click *through* (for Work-with-1-team it is skipped — see below). See Phase 2.
4. **Composition.** Hosts a list of {Thread | Team | Knowledge item} rows; each row carries the item's identity + a small set of at-a-glance signals; the row's primary action is "navigate into".
5. **Lifecycle.** Stateless surface. Transitions are pure navigation: header-click → show overview + switch sidebar list; item-click → navigate into item.
6. **Authority.** Owned by the Human Interface layer. The list content is server-derived (threads API, teams API, knowledge API); the UI does not mutate it from the overview except where an existing section already allows it (knowledge triage validate/reject — out of AD9 scope, unchanged).
7. **Vocabulary collision.** "Overview" is not used elsewhere as a primitive. It clarifies, not collides. The retired "Portfolio" is the only collision and it is being removed.

### Work overview (the team-list overview)

1. **Identity.** The Work section's overview is a **list of teams** — one row per team — exactly parallel to Conversations' list of threads and Knowledge's list of items.
2. **Essential properties.** (a) One row per team; (b) each row shows runtime-derived status signals already present on `TeamListItem` (status healthy/behind/blocked, phase, active-bet count, progress, agent count/active/health-warning, routine count); (c) row click → `/work/team/:teamId`; (d) all four states; (e) "New bet" remains reachable (header action, preserved from portfolio).
3. **Rejection list.** Not a bet grid (bets live inside a team); not a portfolio dashboard (no cross-team verdict/status/team filter pills — those retire with the grid); not an intermediate click-through for the 1-team founder (AD3 already skips it — header navigates straight to the single team). See Phase 2.
4. **Composition.** Hosts team rows from `GET /api/teams` (`useTeams` → `TeamListItem[]`). Each row carries derived status from that item. No new endpoint, no new query, no data-model change.
5. **Lifecycle.** Stateless list. The only transition is row-click → team detail.
6. **Authority.** Human Interface layer; team list + derived status served by the existing `/api/teams` route (server already derives `status`, counts, warnings into `TeamListItem`).
7. **Vocabulary collision.** Replaces "Portfolio"/"All bets". The page noun is **Work overview** (rendered list of teams). The route is the Work landing (see contracts). No collision with "Team detail" (`/work/team/:id`) which remains the per-team surface.

---

## Phase 2 — Rejection list (with reasons)

**Section overview is NOT:**
- **A deep-link target masquerading as navigation.** Today clicking a section header *navigates*. After AD9, clicking a header *selects the section* — surfaces its overview in main AND switches the sidebar quick-nav list — but the act of selection is the navigation to the overview; only clicking an *item* drills in. Reason: one uniform grammar across all three sections; the header is a section switch, the item is the drill-in.
- **An obligatory click-through.** For Work with exactly 1 team, the overview is skipped — the header lands directly on the single team (AD3 AC-1, preserved). Reason: a 1-item list is noise; every click must land somewhere useful (AD9's stated why).
- **A dashboard.** No hero numbers, no cross-section rollups, no metrics bar. Reason: Hearth density + "humans validate, agents execute"; the overview is a list to scan and enter, not a report.

**Work overview (team list) is NOT:**
- **The portfolio bet grid.** The flat cross-team bet grid is removed. Reason (founder): it is a click-through that adds no unique data — everything is derived from teams and bets, and for 1-2 team founders it is an extra step.
- **A filter surface.** Status / verdict / team filter pills retire with the grid. Reason: a team list has no cross-team bet vocabulary to filter; filters there were portfolio-only.
- **A cross-team aggregation.** The team-level summary spans (total routines/agents across all teams) that lived in the portfolio header do not move to the team-list overview; if a row needs a signal it reads it from its own `TeamListItem`. Reason: keep the overview a per-item list, not a rollup.

**Portfolio / All bets is being retired as a noun** — not relocated. Cross-team bet browsing is deferred (per spec out-of-scope: "Cross-team portfolio dashboard, deferred until 3+ team users exist"). Reason: it was never a contract, only a convenience grid; its data is reachable per-team.

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Section overview** | The list landing surfaced in `<main>` when a section header is selected. | landing page, index, dashboard, home |
| **Work overview** | The Work section overview — a list of teams with per-row runtime status. | portfolio, all bets, bet grid, team gallery |
| **Section quick-nav list** | The sidebar sub-item list under the selected section header. | submenu, rail (dead), sub-nav, drawer |
| **Section header** | The clickable section label in the sidebar; selects the section (switches the quick-nav list + surfaces the overview). | tab, view button |
| **Team row** | One row in the Work overview, representing a team. | team card, product card, portfolio card |

"Portfolio" and "All bets" are **retired**. Remove from UI copy, route paths, component names, page titles. (Code symbol cleanup scope is the architecture's call; the *noun* is dead either way.)

---

## Phase 4 — Contracts

- **Cardinality.** Exactly one overview per section (3 sections → 3 overviews). Exactly one Work overview; it lists 0..N teams (one row each).
- **Selection invariant.** At most one section is "selected" at a time; the selected section's quick-nav list is the only sub-list rendered. (Today only the active section reveals sub-items — this invariant already holds; AD9 makes it uniform: selecting a section both switches the list AND surfaces the overview, rather than deep-linking.)
- **Navigation contract (the core reshape).** Clicking a **section header** surfaces that section's overview and switches the sidebar quick-nav list to that section's items. Clicking an **item** (thread / team / knowledge entry) navigates into the item. A header click never lands on a specific item — EXCEPT the AD3 1-team Work shortcut (1 team → header lands on that team; preserved, documented as the single exception).
- **Closure.** The set of sections is closed at three (Conversations, Work, Knowledge). AD9 does not add a section.
- **Data contract.** The Work overview reads `GET /api/teams` only (`TeamListItem`). **No new endpoint, no new query, no data-model change.** All status signals are already on `TeamListItem` (server-derived).
- **Reuse contract.** The Work overview is built from the catalogued list primitives (`ItemList`, `Row`, `EmptyState`, `SkeletonList`) — the same primitives Conversations and Knowledge overviews use. No new list component unless it earns its place per the component budget.
- **Non-regression hard rule.** Converge Work onto the Conversations/Knowledge pattern; do NOT regress those two. Their list interaction, states, and visual rhythm are the reference and must remain intact.
- **Identity.** Routes are the identity of each overview. `/work/portfolio` is retired: it redirects to the Work landing (or 404 if no landing target). The Work landing route is the architecture's decision (redirect to first team for 1-team, vs a dedicated overview route for 2+ teams) — but the *destination noun* "portfolio" must not survive in any user-facing path.
- **Preservation hard rule.** `BetCard` is NOT deleted — it is reused in the team detail view. `useBets` may be retired only if nothing else consumes it (architecture's call). No bet *data* is lost; it is all reachable per-team.

---

## Phase 5 — Ground-truth doc updates (deferred to `/write-docs`)

This concept reshapes `docs/guides/user/three-core-views.md` (§"Portfolio") and `docs/guides/user/getting-started.md` (the "Work — your portfolio…" line). Those are user-facing prose edits owned by `/write-docs` at the end of the pipeline, not part of the AD9 code change. Flag for `/write-docs`: replace "Portfolio" descriptions with "Work overview = team list" and the uniform section-nav behavior.

No `docs/<topic>/canonical-shapes.md` or contract file needs updating — no contract was named portfolio/all-bets.

---

## Phase 6 — Self-critique

- **Rejection list distinct?** Yes — three genuinely different confusions for Section overview (deep-link, click-through, dashboard) and three for Work overview (bet grid, filter surface, aggregation). Not flavors of one.
- **Vocabulary collision verified?** Grepped: "portfolio"/"all bets" exist only as prose + code symbols + route strings, never as a shared contract type. The new term "overview" does not collide with any existing primitive.
- **Contracts complete?** Cardinality, selection invariant, navigation, closure, data, reuse, non-regression, identity, preservation all pinned. The one deliberately-deferred decision (exact Work landing route shape) is explicitly handed to `/architecture` with the hard constraint that "portfolio" must not survive in any path.
- **Rationale concrete?** Yes — cites the founder decision (2026-06-15: portfolio confuses more than helps), AD3's 1-team shortcut (preserved), and the spec's deferral of cross-team browsing.
- **Right files touched?** Concept is per-WP; ground-truth edits correctly deferred to `/write-docs` (user-guide prose). No premature doc churn.

**Open tension handed to design + architecture (not a concept question):** what the main view shows for the Work overview when 2+ teams exist vs the 1-team shortcut, and whether the uniform "header surfaces overview" applies to Conversations/Knowledge identically (they already land on their overview today) — design resolves the interaction shape; architecture resolves the route + `handleViewChange` mechanics.

**Concept is locked.**

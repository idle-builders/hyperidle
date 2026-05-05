# L13 — Design (approved)

## Surfaces in scope

| Surface | Classification | Reason |
|---|---|---|
| Product page (level 2 of the Work drill-down) | **novel** | First non-Portfolio team-level page. Three regions to compose (product facet, team facet, active bets) plus a slot for L12's artifact aggregation. Layout, drill-down affordance, and empty-state are open. |
| Drill-down navigation (Portfolio card → Product page) | **novel** | First time a Work card mints a level-2 URL. URL shape, back-affordance, and breadcrumb-vs-not need a call. |
| Submenu under Work (with one product page mounted) | routine | Reuse the existing Submenu shell. The only change is that the Work submenu loses its "Team Board" entry. |
| Removal of `/work/team` route | routine | Replace the route with a redirect to `/work/portfolio`. |
| Empty-state for zero active bets | routine | Reuse `EmptyState` (the established component). The copy and the affordance are the only design call. |

The novel surfaces (Product page + drill-down nav) get 2-3 variants and 9-dim rubric scores in-session. Routine surfaces get a single decision plus considered-and-rejected notes.

---

## Novel surface A — Product page layout (3 variants)

### Shared invariants across all variants

- Page lives at `/work/product/:productId`. The id is the product id, never a team id (per concept §1).
- Page renders four content regions:
  - **R1 — Product header.** Product name, status (`StatusChip`), phase (`KeyValue`), lead avatar.
  - **R2 — Active bets.** A list of bets attached to this product team where status ∈ `committed` | `in_progress`. Each row reuses the existing `BetCard` (the same component used on the Portfolio cycle stripe and on the Canvas, in its compact configuration). Rows are clickable and route to `/work/bet/:betId`.
  - **R3 — Roster.** The agent group attached to the team. Lead first, then members. Each row: avatar (initials), name, role.
  - **R4 — Team burn vs cap.** Cost actual vs cost cap. Reuses the existing tabular-numerals `KeyValue` rows + the bare `<progress>` element (already used on the Portfolio cycle stripe).
- A **slot for L12's artifact aggregation** is a labeled placeholder region that the Product page lays out but does not fill. L13 ships an empty placeholder with a `data-testid="product-artifact-slot"` hook. L12 will fill it without re-touching the page layout.
- All four regions consume `--density-page-gutter`, `--density-card-pad`, `--density-gap` per the K11 token ladder. No raw px.
- Empty states (no active bets, no roster, no cap configured) all render `EmptyState`.
- The page DOES NOT render a Kanban (tasks-across-bets). Tasks live on the Bet detail. This is the v3 "humans act at the bet level, not the task level" rule.
- The page is a 1-column layout on mobile (single-tab fold). Multi-column variants apply only at the `lg` breakpoint upward.

### Variant V1 — Stacked single column

```
┌────────────────────────────────────────────────────┐
│  R1 — Product header (name • status • phase • lead)│
├────────────────────────────────────────────────────┤
│  R4 — Team burn vs cap (one strip, full width)     │
├────────────────────────────────────────────────────┤
│  R2 — Active bets (list of BetCard rows)           │
├────────────────────────────────────────────────────┤
│  R3 — Roster (list of agent rows)                  │
├────────────────────────────────────────────────────┤
│  Artifact slot (placeholder, L12)                  │
└────────────────────────────────────────────────────┘
```

A vertical stack. Header → burn → bets → roster → artifact slot. Reads top-to-bottom, identical mobile and desktop. The first thing the eye lands on after the header is the cost gauge (a glance answer to "is this team burning healthily?"); the bets are the second answer ("what is it doing?"); the roster is the third ("who"). The artifact slot is at the bottom because L12 is not in this workpackage.

### Variant V2 — Two-column at `lg` (header + burn full width; bets + roster side-by-side)

```
┌────────────────────────────────────────────────────┐
│  R1 — Product header                               │
├────────────────────────────────────────────────────┤
│  R4 — Team burn vs cap                             │
├──────────────────────────┬─────────────────────────┤
│  R2 — Active bets        │  R3 — Roster            │
│  (2/3 width)             │  (1/3 width)            │
│                          │                         │
│                          │  ─────────────────      │
│                          │  Artifact slot          │
│                          │  (under roster)         │
└──────────────────────────┴─────────────────────────┘
```

Bets on the left as the primary "what" column; roster on the right as the secondary "who" column. The artifact slot lives in the right column under the roster (when L12 fills it, it sits next to bets — symmetric with how the Bet detail page surfaces aggregated artifacts). On mobile / `< lg`, collapses to V1's stack.

### Variant V3 — Three-column dashboard (header + burn full; bets / roster / artifacts as peer columns)

```
┌────────────────────────────────────────────────────┐
│  R1 — Product header                               │
├────────────────────────────────────────────────────┤
│  R4 — Team burn vs cap                             │
├──────────────┬──────────────┬──────────────────────┤
│  R2 — Bets   │  R3 — Roster │  Artifact slot       │
│  (1/3)       │  (1/3)       │  (1/3, placeholder)  │
└──────────────┴──────────────┴──────────────────────┘
```

Three peer columns at `lg`+. Reads as a dashboard: each column an equal lens on the team. On mobile, stacks vertically.

### 9-dim rubric (0-10)

| Dim | V1 — Stacked | V2 — 2-col | V3 — 3-col |
|---|---|---|---|
| Information hierarchy (what's the subject?) | 9 (burn → bets → roster reads as a clear story) | 9 (bets dominate left, roster right; visual priority is correct) | 6 (three peers — no clear subject) |
| Spacing / density (8-12px default) | 9 (single column, predictable rhythm) | 8 (gutters between columns add visual cost) | 6 (1/3 columns force narrow content; bets row truncates) |
| Typography fit | 9 (BetCard renders at full width as designed) | 8 (BetCard at 2/3 width still readable) | 6 (BetCard at 1/3 truncates title + meta lines) |
| Color / status surfacing (status chip on header + per-bet) | 9 | 9 | 8 |
| Coherence with rest of app (Portfolio is also stacked card list) | 9 (matches Portfolio, Bet detail, Knowledge detail patterns) | 8 (introduces a bet|roster split that no other detail page does) | 5 (3-col dashboard is the AI-aesthetic anti-pattern AQ-108) |
| Mobile parity (one form factor) | 10 (identical desktop and mobile) | 7 (collapses, but the desktop story differs from mobile) | 6 (collapses; desktop and mobile diverge significantly) |
| Component budget (19-component ceiling) | 9 (no new components — BetCard, KeyValue, StatusChip, EmptyState only) | 9 (same set; adds a column container which is plain divs, not a component) | 8 (same set; risks a "Card" frame creeping in to make 3 peers visually parse) |
| Empty-state grace (zero bets, zero roster) | 9 (each region is its own block, EmptyState fits) | 8 (empty bets in a 2/3 column looks lopsided) | 7 (empty bets in a 1/3 column looks broken) |
| Reach to the artifact aggregation slot (L12 follow-up) | 9 (clear bottom slot; L12 fills inline) | 7 (slot lives under roster — L12 may want full width later) | 6 (slot is locked into 1/3; L12 cannot grow it) |
| **Total** | **82** | **73** | **58** |

### Decision: V1 — Stacked single column

V1 wins on hierarchy, mobile parity, coherence with the rest of the app, and L12 reach. V3 fails the AI-aesthetic check (AQ-108: "no 3-column identical card grid outside known dashboard contexts") and forces narrow content. V2 is reasonable but introduces a bet/roster split that no other detail page in the app uses — coherence-cost without payoff.

The stacked layout reads as a single narrative: cost gauge first ("is this healthy?"), then active bets ("what's it doing?"), then roster ("who's doing it"), then artifact slot. It scales identically on mobile (single tab) — the v3 "one app, two form factors" doctrine.

**Did we consider?**
- *A "Tasks across this product" Kanban region (mirroring legacy `WorkTeam`)?* Rejected. Per v3 + L15: humans act at the bet level, not the task level. A Kanban here would be regression.
- *A combined Roster-as-cards (one card per agent)?* Rejected. Roster is a 3-7 row list, not a 4-column card grid. Cards would force whitespace AQ-103. Rows match the dense-list aesthetic.
- *Pulling in the cycle stripe from Portfolio?* Rejected. The cycle is portfolio-level metadata; surfacing it on the Product page would either duplicate the Portfolio's stripe or imply per-product cycles (which v3 does not have).

---

## Novel surface B — Drill-down navigation (3 variants)

How does the user navigate Portfolio → Product, and how do they get back?

### Shared invariants

- Click a `data-testid="product-card"` on the Portfolio page → router pushes `/work/product/:productId`.
- Card hover state matches the existing Portfolio card hover (no new affordance).
- The card's existing keyboard nav stays — keyboard users tab to the card and Enter triggers the same navigation. (Per the constraint "no keyboard shortcuts": no new shortcuts; existing tab/Enter Web semantics are not "shortcuts".)
- The Submenu loses its "Team Board" item (already orphaned by the legacy route's removal). Submenu's Work entry list reduces to `[ Portfolio ]`.

### Variant N1 — Breadcrumb chip on the Product page header

The page header (R1 in the Product page layout) carries a small breadcrumb above the product name:

```
[ ← Portfolio ]   Product Name              [STATUS_CHIP]
                  Phase: build • Lead: Aviv
```

The `[ ← Portfolio ]` is a `Link` rendered as a small ghost button (`btn btn-ghost btn-xs`) using the back-arrow glyph from the existing icon set. It points to `/work/portfolio`. Tab-reachable; click navigates.

### Variant N2 — Submenu "Back to Portfolio" link

The Submenu, while on a Product page, prepends a "← Back to Portfolio" item above its existing list. The page header carries no breadcrumb. The Submenu's existing item style (NavItem) is reused.

### Variant N3 — IconRail re-click only (no explicit back-affordance)

When on a Product page, the Work icon in the IconRail is "active". Clicking it returns to `/work/portfolio` (the existing handleViewChange behaviour). No breadcrumb, no Submenu link. The user's mental model is "I'm in Work; click Work to reset".

### 9-dim rubric (0-10)

| Dim | N1 — breadcrumb | N2 — submenu | N3 — IconRail |
|---|---|---|---|
| Discoverability (can a new user find back?) | 9 (breadcrumb on the page itself) | 8 (left-rail link, common pattern) | 5 (relies on user knowing IconRail re-click resets) |
| Visual cost (chrome added) | 9 (one ghost button, minimal) | 8 (one Submenu item, minimal) | 10 (zero) |
| Consistency with Bet detail (which is level 3 and has its own breadcrumb in the IA spec) | 10 (matches §3.4 Bet Detail breadcrumb pattern) | 7 (Bet detail uses an in-page breadcrumb; submenu link would be a second pattern) | 5 (Bet detail uses breadcrumb; N3 omits it) |
| Mobile parity | 9 (page-header chrome works on mobile) | 6 (Submenu collapses; "Back to Portfolio" hides) | 8 (IconRail visible on mobile) |
| Component budget | 9 (no new component; reuses btn-ghost) | 9 (no new component; reuses NavItem) | 10 (zero new chrome) |
| Friction to invoke | 9 (page-level, in the user's eye-line) | 8 (submenu is in eye-line on desktop) | 6 (the user has to "remember" the IconRail toggle) |
| Predictability of route on click | 10 (always returns to /work/portfolio) | 10 | 9 (returns to /work/portfolio via the same handler) |
| Robustness (works under direct-URL entry — e.g. shared link) | 9 (breadcrumb is always rendered) | 9 (Submenu always rendered) | 8 (works, but the user with no Portfolio history may be confused) |
| Coherence with information-architecture/cross-view-navigation-map.md row "Bet Detail → Team View" | 10 (the IA spec explicitly says "Click breadcrumb") | 7 | 5 |
| **Total** | **84** | **72** | **66** |

### Decision: N1 — Breadcrumb chip on the Product page header

N1 wins decisively. The IA spec (`docs/information-architecture/cross-view-navigation-map.md`) already establishes the breadcrumb pattern for level-3 (Bet Detail → Team View) and N1 brings level-2 in line with it. It is the most discoverable and the most consistent.

The breadcrumb is **not** a multi-segment trail (`Work / Portfolio / Product`) — it is a single back-affordance. A multi-segment trail at level 2 would be aspirational chrome ("Work" is implicit because the user is in the Work view). Single segment, single tap.

**Did we consider?**
- *A multi-segment breadcrumb `Portfolio / Product Name`?* Rejected for level 2 — the product name is already the page H1; repeating it in the breadcrumb is redundant. (At level 3 Bet Detail, the multi-segment makes sense because the breadcrumb shows context that's not in the page header.)
- *Browser back-button only?* Rejected. Direct-URL entry (e.g. opening a shared product link) has no browser-back history; the affordance must be in-page.

---

## Routine surface 1 — Submenu under Work

**Decision.** The Work submenu in `AppShell.tsx` SUBMENU_CONFIG.work loses its `Team Board` entry. The remaining list is `[ Portfolio ]`. When the user is on `/work/product/:productId`, the active Submenu item is still "Portfolio" (no per-product entries are surfaced — that would be a side-navigation tree, which the founder explicitly rejected).

**Did we consider?**
- *Surface the active product as a Submenu item while on a Product page (a "you are here" indicator).* Rejected — even a single dynamic item starts to look like a tree. The breadcrumb on the page (N1) is the "you are here".

---

## Routine surface 2 — Legacy `/work/team` redirect

**Decision.** The route `/work/team` is removed from `router.tsx` and replaced with `<Navigate to="/work/portfolio" replace />`. The replace is intentional — the user did not "ask" to see Team Board; the URL is a vestige. They go to Portfolio so they can pick a product.

**Did we consider?**
- *Redirect to `/work/product/<first-product-id>`.* Rejected — picking the first product is arbitrary. The user might not want that product. Portfolio is the legitimate landing.
- *Render a 404 / NotFound.* Rejected — bookmarks and pre-existing logs may carry `/work/team`. A redirect is friendlier and costs one route entry.

---

## Routine surface 3 — Empty state for zero active bets

**Decision.** When the bets fetch resolves with zero `committed` | `in_progress` rows for the product, the bets region renders `EmptyState`:

- **Title:** "No active bets"
- **Description:** "This product team has no bets in flight."
- `data-testid="product-active-bets-empty"`

The composition uses the existing `EmptyState` component as it appears on the Portfolio page. No fake bet card. No fallback shipped bet. Zero is zero.

**Phase 2 critique fix.** Earlier draft copy read "Shape a pitch on the team's Canvas to commit one." The Product page does NOT mount a Canvas — pitch authorship is L17's territory and lives on a different surface. Naming an affordance that does not exist on this page would mislead the user. The corrected copy is descriptive only: it tells the user *what* the state is, not what to do next, because the next-action surface is not in L13's scope.

**Did we consider?**
- *A CTA button "Shape a Pitch" wired into the empty state.* Rejected for L13 scope — pitch authorship is L17's territory. No CTA is rendered until L17 places the affordance on a real surface.
- *A skeleton row to fake activity.* Rejected — fakes erode trust (the v3 trust principle: surface decisions clearly).
- *Leave the region absent (don't render anything).* Rejected — the user needs the negative confirmation. "No bets" is information.
- *Copy that names the affordance ("Shape a pitch on the team's Canvas").* Rejected — that affordance does not exist on the Product page surface. Naming it would lie about the layout.

The roster region's empty-state ("Roster not configured") and the burn-vs-cap region's empty-state ("Cost cap not set") follow the same pattern. They are unlikely in production but are specified so the page never falls back to skeleton or `undefined`.

---

## States, transitions, keyboard, focus

### States

| Region | Empty | Loading | Error | Populated |
|---|---|---|---|---|
| R1 Header | n/a (always populated when product exists; if product 404s the page itself shows NotFound) | `SkeletonCard` placeholder for header strip | `ErrorState` "Failed to load product" with retry | Name + status chip + phase + lead avatar |
| R2 Active bets | `EmptyState` "No active bets" | `SkeletonCard rows={3}` | `ErrorState` with retry | List of `BetCard` rows; click → `/work/bet/:betId` |
| R3 Roster | `EmptyState` "Roster not configured" | `SkeletonCard rows={3}` | inline error inside the region | List of agent rows: avatar, name, role |
| R4 Burn vs cap | `EmptyState` "Cost cap not set" | `SkeletonCard rows={1}` | inline error inside the region | `KeyValue` rows + `<progress>` |
| Artifact slot | placeholder text "Artifacts aggregation lands in L12" | n/a | n/a | n/a (L12 fills) |
| 404 (product not found) | full-page `EmptyState` "Product not found" with link back to Portfolio | n/a | n/a | n/a |

### Transitions

- Click product card on `/work/portfolio` → `navigate(/work/product/:id)` (replace=false, so the user can browser-back).
- Click `[ ← Portfolio ]` on the Product page header → `navigate(/work/portfolio)` (replace=false).
- Click a BetCard row in R2 → `navigate(/work/bet/:betId)`.
- Direct URL entry to `/work/product/:id` for an unknown id → page renders the 404 empty state (after the GET 404).

### Keyboard

- Tab order top-to-bottom, region-by-region: breadcrumb → header → burn region → each bet row → each roster row → artifact slot anchor.
- Enter on a focused bet row navigates to that bet detail (existing `BetCard` affordance).
- Enter on the breadcrumb returns to Portfolio.
- No new keyboard shortcuts (per the founder demotion).

### Focus management

- On navigation to a Product page, focus moves to the page H1 (the product name) for screen-reader users — implemented via `tabIndex={-1}` + ref focus, the existing pattern in `WorkBet.tsx`.
- On navigation back to Portfolio via the breadcrumb, focus moves to the originating product card. (Implemented via `useNavigate` returning to the route; the Portfolio page restores card focus from `location.state` if provided. If not provided, focus falls back to the page H1.) **Designer-call:** if the focus-restore is judged out-of-scope for L13, document the simpler "focus the page H1 on return" path; either is acceptable.

---

## Component budget impact

L13 introduces **zero new custom components**. The Product page composes:
- `BetCard` (existing, used in 3 contexts already: Portfolio cycle stripe, Canvas, …)
- `KeyValue` (existing)
- `StatusChip` (existing)
- `EmptyState` (existing)
- `SkeletonCard` (existing)
- `ErrorState` (existing)
- DaisyUI `<progress>` (already used on Portfolio)
- DaisyUI `btn btn-ghost btn-xs` for the breadcrumb chip
- `<NavItem>` for the Submenu (existing)

No new component file is created in `packages/design-system/src/`. The Product page itself is a `pages/WorkProduct.tsx` file (a page-level composition, not a custom component).

---

## Anti-AI-aesthetic checklist (the screenshot rubric)

For the chosen V1 + N1 combination:

- [x] No `rounded-2xl` / `rounded-3xl` (cards use the `--r2`/`--r1` from existing components).
- [x] No purple/indigo/violet gradients.
- [x] No `p-8` / `p-12` oversized padding (uses `--density-card-pad`).
- [x] No hero section. Header is a single bar.
- [x] No emoji as iconography.
- [x] No center-aligned body content.
- [x] No backdrop-blur.
- [x] No 3-column identical card grid (V3 was rejected for this exact reason).
- [x] No marketing superlatives ("seamless", "powerful", etc.) in copy.
- [x] No gradient-on-text headings.

---

## Mobile (single-tab fold)

The Product page on mobile is the same vertical stack: header → burn → bets → roster → artifact slot. The breadcrumb chip stays at the top of the page header. The IconRail collapses to a tab bar at the bottom (per existing AppShell behaviour at `≤ 768px`); the Submenu auto-collapses. The page is reachable from the Work tab → tap a product card → drill in. Tap the back-arrow (breadcrumb chip) to return.

No mobile-specific layout. No accordions, no carousels — vertical scroll all the way down, matching the existing Portfolio + Bet detail mobile behaviour.

---

## Acceptance hooks (test-IDs the build uses)

| Hook | Surface |
|---|---|
| `data-testid="work-product-page"` | Product page root |
| `data-testid="product-card"` | Portfolio card (already exists; verify `onClick` routes to `/work/product/:id`) |
| `data-testid="product-breadcrumb-back"` | Breadcrumb chip on the Product page header |
| `data-testid="product-active-bets"` | R2 region |
| `data-testid="product-active-bets-empty"` | R2 empty state |
| `data-testid="product-roster"` | R3 region |
| `data-testid="product-roster-row"` | One agent in R3 |
| `data-testid="product-burn-vs-cap"` | R4 region |
| `data-testid="product-artifact-slot"` | L12 placeholder |
| `data-testid="product-not-found"` | 404 empty state |

These hooks back the Playwright e2e specified in the architecture. Names match the existing testid conventions on Portfolio (`work-portfolio-page`, `product-card`, `cycle-stripe`).

---

## Approved configuration

- **Layout:** V1 — Stacked single column.
- **Drill-down:** N1 — Breadcrumb chip on the Product page header.
- **Submenu:** Drop "Team Board"; keep `[ Portfolio ]` only.
- **Legacy route:** `/work/team` → `<Navigate to="/work/portfolio" replace />`.
- **Empty state:** `EmptyState` with explicit copy, no fake card, no CTA wired (out of L13 scope).
- **New components:** none.
- **Artifact slot:** placeholder `<section data-testid="product-artifact-slot">` with copy "Artifacts aggregation lands in L12". L12 fills it later without re-touching the page layout.

Proceed to architecture.

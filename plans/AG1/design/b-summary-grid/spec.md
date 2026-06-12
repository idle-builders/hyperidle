# Variant B — "Summary header + content column"

**Constraint:** optimise the single most common task — the morning health scan. Lift the answer to "is this team healthy?" into a horizontal **summary bar** of stat tiles directly under the team identity, so it's read first without scrolling. Everything else stacks in a capped column below.
**Thesis:** density and a summary-first read beat a uniform reading column. The vitals a founder scans for (burn, cap, capacity, team status) deserve a glance-able instrument strip, not a vertical KeyValue list buried mid-page.

## User task
Glance: identity + the four tiles that say "healthy / not" (burn, cap, capacity, status). Then drill into bets / routines / agents.

## Composition
Root: `flex-1 overflow-y-auto` wrapping `max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]`. 960px (matching WorkPortfolio/KnowledgeDetail) gives the stat strip room for 4 tiles across at desktop.

1. **Team header** — breadcrumb, name + StatusChip, phase/lead subline. Unchanged.
2. **Summary bar** — a `flex gap-[12px]` strip of **stat tiles** (`flex-1` each), replacing the vertical KeyValue list as the burn presentation. Each tile is `--surface-container` rounded `--r-subtle` `p-[18px]`, label-over-value (label `text-[11px]` mono uppercase tertiary; value `text-[20px]` semibold primary, tabular-nums):
   - **Burn** — total cost actual.
   - **Cap** — cost cap (or "—").
   - **Capacity** — `activeBets / capacity`.
   - **Status** — `"Healthy"` / `"Attention"` (text) + idle-agent count, derived from `roster[].healthLevel` / `operationalStatus`; empty roster → `"—"` / `"No agents"`. (This is the locked 4th tile per `approved.md` §2 — it answers the morning "is this team healthy?" read. The bet-vs-routine cost breakdown lives in the **Burn** tile's sublabel, not as its own tile.)
   The capacity progress bar spans full width *below* the tile row. At ≤960px the tiles wrap 2×2; on mobile they stack. **This pairs every metric label tightly above its value — the founder's "opposite edges" problem is structurally impossible here** because label and value share one narrow tile.
3. **Active bets** — section title, bet rows.
4. **Routines** — title + action, list card.
5. **Agents** — title + action, list card.
6. **Artifacts** — ArtifactSection.

## Information hierarchy
1. Team name + status.
2. **Summary bar** — the four tiles (burn, cap, capacity, status), read in one horizontal sweep. This is where the eye lands second and longest.
3. Active bets (primary work).
4. Routines / Agents.
5. Artifacts.

## States
- **Empty team:** summary bar still renders all 4 tiles (Burn $0 / Cap "—" or value / Capacity 0/N / Status "—" + "No agents") so the page always has its instrument strip — an empty team looks *measured*, not abandoned. Bets/routines/agents show their EmptyStates in the column below; section actions ("+ New routine", "+ Add agent") and hints render in place. Full composition: see `approved.md` §4a.
- **Loading:** skeleton row of 4 stat-tile-shaped SkeletonCards across the top, then list skeletons — matches the loaded shape.
- **Error / 404:** centered ErrorState/EmptyState in the column.
- **Overflow:** money values are short; tabular-nums keeps them aligned. Names truncate as today. Below the tile min-width, tiles wrap rather than squeeze.

## Behavior
- Tiles are non-interactive (display only) — no new affordance, no behavior change.
- Rows, dialogs, hints, navigation: unchanged.
- Motion: none added beyond existing progress bar.

## Mobile adaptation
Tiles stack vertically (`flex-wrap`, each `min-w` forces wrap), column goes full-width with `p-[18px]`. Reads as a stacked summary then the existing lists. No behavior change.

## Signature
A **dashboard summary bar** of stat tiles — the team's vitals read in a single horizontal sweep before any scrolling.

## Trade-offs
- Replaces the KeyValue burn list with tiles — a presentation change to the burn block (still same data, same `formatMoney`, no functional change, but more diff than Variant A). Risk: a 4-tile strip is the most "dashboard-like" shape and must be styled carefully to avoid AQ-108 (3-col identical card grid) — mitigated by 4 tiles of *differing* content, not an identical `.map`, and not in a hero context. The Status tile carries the morning health read and is mandatory (no 3-tile fallback) — it is variant B's reason for winning.

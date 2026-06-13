# AG1 — Approved design (input contract to /architecture)

**Chosen:** Variant B — Summary header + content column, built on Variant A's scroll/gutter/max-width wrapper.
**Scope:** spatial recomposition of `packages/web/src/pages/WorkTeam.tsx` only. No AppShell change, no `KeyValue` change, no new design-system primitive, no data/behavior change.

---

## 1. The load-bearing structural fix (root cause)

Today WorkTeam's root is `flex flex-col gap-[12px] h-full` — no scroll, no width cap, no gutter, rendered flush inside AppShell's padding-less `overflow-hidden` `<main>`. This causes all four founder symptoms (full-bleed boxes, opposite-edge label/value, clipped headers, no gutter).

Replace the root container in **every** branch (loading, error, 404, null, populated) with the convention every sibling Work/Knowledge page already uses:

```
<div className="flex-1 overflow-y-auto" data-testid="work-team-page">   // scroll body
  <div className="max-w-[960px] mx-auto w-full p-[24px] flex flex-col gap-[24px]">  // capped centered column
    … sections …
  </div>
</div>
```

- `data-testid="work-team-page"` MUST stay on the outer element (tests assert it across all states).
- `max-w-[960px]` matches WorkPortfolio / KnowledgeDetail (readable-measure ceiling for the Work view).
- `gap-[24px]` (was `gap-[12px]`) for desktop section rhythm; on-grid.
- Loading/error/404/null branches use the **same wrapper** so skeletons and empty states are gutter-padded and centered, never full-bleed. (Loading skeletons: keep SkeletonCard stack inside the wrapper.)

## 2. The summary bar (replaces the burn-vs-cap KeyValue list as the burn presentation)

Directly under the team header, render the burn block as a horizontal strip of 4 **stat tiles** (label-over-value), followed by the capacity label + progress bar full-width below:

```
<section aria-label="Team summary" data-testid="team-burn-vs-cap">
  <div className="flex gap-[12px] flex-wrap">
    {tile "Burn"     value=formatMoney(burn.costActual)      sub="bets … · routines …/mo"}
    {tile "Cap"      value=formatMoney(burn.costCap) | "—"   sub="{pct}% used" | "no cap"}
    {tile "Capacity" value=`${burn.activeBets} / ${burn.capacity}` sub="active bets"}
    {tile "Status"   value="Healthy"/"Attention"/"—" (text)  sub="{n} idle agents" | "No agents"}  // derive from existing roster data only; no new field
  </div>
  <div className="mt-[12px]"> capacity label + <progress> (existing element, unchanged logic) </div>
</section>
```

Each tile:
```
<div className="flex-1 min-w-[180px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px] flex flex-col gap-[6px]">
  <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]">{label}</span>
  <span className="text-[20px] font-semibold text-[var(--text-primary)] tabular-nums">{value}</span>
  <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">{sub}</span>
</div>
```

- `data-testid="team-burn-vs-cap"` MUST remain on the section (existing test anchor).
- Keep the existing progress-bar logic verbatim (`capPercent`, the two `<progress>` branches for cap-set / cap-null).
- All values come from the **existing** `burn` object via the **existing** `formatMoney` — no new data, no calc. **The "Status" tile is mandatory — 4 tiles always.** It is the reason variant B won (the morning health read answered before scroll). It derives from data already present — `roster[].healthLevel` + `operationalStatus`, confirmed present and already consumed by AgentRow — so the derivation is cheap and there is no 3-tile fallback. Status tile value is text + paired sub-label (never color alone):
  - **Non-empty roster:** value `"Healthy"` (all members healthy) or `"Attention"` (any member `warning`/`critical`); sub `"{n} idle agents"` (n = members with `operationalStatus` idle). Color accent (forest for Healthy, `--status-warning` amber for Attention) is paired with the text label, never color-alone (AQ-010).
  - **Empty roster (`roster.length === 0`):** value `"—"`, sub `"No agents"`. An agentless team MUST NOT read "Healthy" — there is nothing to be healthy. `"—"` is a neutral, non-signaling value; `"No agents"` carries the state, matching the existing agentless phrasing on this page (the Agents `EmptyState title="No agents"`).
- `flex` + `flex-wrap` (NOT `grid-cols-N`) to stay clear of AQ-108. At ≤960px tiles wrap; on mobile they stack.

## 3. Sections below (unchanged content, now inside the column)

In order, each as a `<section>` inside the capped column, content identical to today:
1. **Team header** — breadcrumb chip, `h1` name + StatusChip, phase/lead subline. (Section `aria-label="Team header"` preserved.)
2. **Summary bar** (§2).
3. **Active Bets** — `data-testid="team-active-bets"`; section title; BetRow cards stacked `gap-[6px]`; EmptyState + `create-bet` hint when empty (existing logic + testids).
4. **Routines** — `data-testid="team-routines"`; `flex items-center` header with title + "+ New routine" `Button` (paired); list-container card with RoutineRows or EmptyState. Existing testids (`new-routine-btn`, `routine-row`, `team-routines-empty`).
5. **Agents** — `data-testid="team-agents"`; title + "+ Add agent"; `review-agents` hint; list-container card with AgentRows or EmptyState. Existing testids (`add-agent-btn`, `agent-row`, `agent-customize-btn`, `agent-status`, `agent-context`, `agent-card-category`).
6. **Artifacts** — ArtifactSection, unchanged (`skipArtifacts` prop preserved).

Section title pattern unchanged: `text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)]`. The `mb-2` margins are superseded by the column's `gap-[24px]` for inter-section spacing; intra-section header→content spacing stays as-is.

## 4. States (all inside the §1 wrapper)

| State | Composition |
|---|---|
| Populated | header → summary bar → bets → routines → agents → artifacts |
| Empty team | Full composition spec below (§4a). Reads as measured, not abandoned. |
| Loading | SkeletonCard stack inside the wrapper (header, summary, bets, roster shapes) |
| Error | ErrorState centered in wrapper |
| 404 / null / malformed | EmptyState "Team not found" (`team-not-found`) centered in wrapper |
| Overflow | names keep `truncate`; money values tabular-nums never truncate; vertical scroll only |

### 4a. Empty-team composition (the concrete AC-3 target)

A freshly-created team (`activeBets:[]`, `routines:[]`, `roster:[]`, `burn` zeroed) renders the **same section skeleton as populated** inside the §1 capped column — the page's structure is what makes it look intentional, not abandoned. Top-to-bottom:

1. **Team header** — breadcrumb chip, `h1` name, StatusChip (team-level `status` from the payload, unchanged), phase/lead subline. Lead subline shows the no-lead phrasing already in the page when `leadAgentId` is null. Full-width, unchanged.
2. **Summary bar (always renders — this is the anchor that makes empty look measured)** — all **4 tiles** present:
   - Burn → `formatMoney(0)` (e.g. `$0`), sub `bets $0 · routines $0/mo`.
   - Cap → the team's `costCap` if set, else `"—"`; sub `"0% used"` or `"no cap"`.
   - Capacity → `0 / {capacity}` (capacity is a team field, present even with no agents); sub `"active bets"`.
   - Status → `"—"`, sub `"No agents"` (per §2 — never "Healthy" on an empty roster).
   - The capacity `<progress>` renders below at 0% (existing logic), full-width.
   The strip occupies its normal row height, so the top third of the page reads as a real instrument panel, not blank space.
3. **Active Bets** — section title + `team-active-bets` section; `EmptyState` ("No active bets" — existing copy) inside the list card; the `hint-create-bet` first-run hint renders in place directly below/within the empty state (existing logic — do not relocate). The section title is still present, so the slot is legible as "this is where bets go."
4. **Routines** — `flex items-center` header: title + `"+ New routine"` Button (`new-routine-btn`, present and clickable even when empty); list card shows `team-routines-empty` EmptyState. The action button gives the empty section a clear next step.
5. **Agents** — header: title + `"+ Add agent"` Button (`add-agent-btn`, present); the `hint-review-agents` hint and the `EmptyState title="No agents"` render in the list card. Again the action button anchors the empty slot.
6. **Artifacts** — ArtifactSection in its empty state (unchanged; respects `skipArtifacts`).

**Spatial result:** every section header + its action/hint is present and on the 960px column, separated by the column's `gap-[24px]`. Nothing collapses to zero height — each empty section is a labelled, gutter-padded card with an EmptyState and (where applicable) a primary action, so the empty team reads as a *set up but not yet started* workspace, not a broken or blank page. The E2E (architecture T1) captures this frame at 1280/2000/2560px as `AG1-NN-empty-*.png` for the reviewer's visual approval; the Status tile reading `"—" / "No agents"` (not "Healthy") is the explicit assertion that proves the empty state is intentional.

## 5. Behavior / motion / keyboard
- No new interactive elements. Tiles are display-only.
- All dialogs (RoutineCreateDialog, AgentAddDialog, AgentEditDialog), hints, breadcrumb, row navigation, focus rings, hover states: **unchanged**, same handlers, same testids.
- No new motion. Existing row hover `--motion-fast` and progress bar remain.
- `prefers-reduced-motion` honored by inherited tokens.

## 6. Mobile adaptation
At ≤768px AppShell renders the mobile branch; the `max-w-[960px]` column is wider than the viewport so `mx-auto` is a no-op and `w-full` governs → existing single-column stack. Summary tiles `flex-wrap` to a vertical stack. Gutter `p-[24px]` (acceptable on mobile; architect may drop to `p-[18px]` at `max-md` if a test requires, but the existing page has no mobile-specific gutter so default is fine). Behavior byte-for-byte identical to today.

## 7. Component mapping
- Existing design-system components reused as-is: `StatusChip`, `Button`, `EmptyState`, `ErrorState`, `SkeletonCard`, `Avatar`, `Tag`, `Progress`/`<progress>`.
- `KeyValue`: **removed from the burn block** (replaced by tiles). Confirm no remaining `KeyValue` import is unused after the change (knip will flag it) — drop the import if so.
- Stat tile, BetRow, RoutineRow, AgentRow: local to WorkTeam.tsx (tile is a small local helper or inline; rows unchanged).

## 8. Open questions for the architect
- **Status tile derivation (RESOLVED — 4 tiles, mandatory):** `roster[].healthLevel` + `operationalStatus` are confirmed present in the payload and already consumed by AgentRow, so the cheap derivation exists. Ship 4 tiles always — no 3-tile fallback (dropping Status removes variant B's reason for winning). Empty roster → `"—"` / `"No agents"`. Do NOT add a data field (out of scope).
- **Hint placement after recomposition:** keep `create-bet` hint inside the Active Bets section and `review-agents` inside Agents, exactly as today (no relocation).
- **Visual proof plan:** Playwright `*.spec.ts` capturing populated + empty-team at 1280 / 2000 / 2560 px (per ACs). Architecture owns the test plan.

## 9. AC traceability
- AC-1 (every section visible 1280–2560, no clipped text, readable measure) → §1 capped 960px column + gutter; §2 tiles cap value width.
- AC-2 (related values read paired) → §2 label-over-value tiles; section title+action in one `flex items-center` header.
- AC-3 (empty looks intentional) → §4a full empty-team composition: all 4 tiles render (Status = "—"/"No agents", never "Healthy"), every section header + action/hint present on the 960px column, no zero-height collapse. E2E captures `AG1-NN-empty-*.png` and asserts the Status value.
- AC-4 (narrow + all behaviors unchanged) → §5/§6; all testids/handlers preserved.
- AC-5 (Playwright visual proof, zero AQ violations) → §8; Hearth tokens only throughout (flex not grid → AQ-108 clear; tabular-nums → AQ-006; on-grid spacing → AQ-001).

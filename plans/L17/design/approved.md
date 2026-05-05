# L17 Approved Design -- Cost + Tokens in Work Surfaces

DESIGN-CLASS: routine

## Variant: Inline Money values via existing KeyValue + progressive token disclosure

### User task

Founder scans cost posture across factory (Rail), product (WorkProduct), bet (BetCard/BetDetail), and task (TaskCard). The primary decision: "are we spending within bounds?" Secondary question (only at bet/task detail level): "is token consumption aligned with model tier expectations?"

### Design principle

Money is ALWAYS visible. Tokens are progressive disclosure -- shown on detail surfaces (bet detail, Rail expanded), hidden on summary cards (BetCard, TaskCard, PitchCard). This follows D3 (progressive disclosure over upfront density) and S1 (not every element deserves equal polish -- token breakdown is secondary metadata).

---

## Surface-by-surface specification

### 1. Rail Cost Section (expanded, 360px width)

**Current:** 4 KeyValue rows with string values ("$12.40", "$50.00", "$84.20", "$350.00").

**New:** Same 4 KeyValue rows but with formatted Money values from the server. Values use `formatMoney()` from shared. `font-variant-numeric: tabular-nums` on the value spans (AQ-006).

```
COST (section header)
Today         $12.40
Today Cap     $50.00
Week          $84.20
Week Cap      $350.00
```

**Token display in Rail:** Add a 5th KeyValue row "Tokens" showing aggregated token count in the compact format (e.g., "42.3k") when factory-level token usage is available. This is a single aggregate number, not a per-tier breakdown. Per-tier is for detail surfaces.

**CostInfo type change:**
```typescript
// Before
interface CostInfo {
  todaySpend: string;
  todayBudget: string;
  weekSpend: string;
  weekBudget: string;
}

// After
interface CostInfo {
  todaySpend: Money | null;
  todayCap: Money | null;
  weekSpend: Money | null;
  weekCap: Money | null;
  weekTokens: number | null;  // aggregate token count, null when unavailable
}
```

**States:**
- Populated: formatted Money values.
- Null cap: KeyValue value shows "--" (the dash-as-absent pattern from L5/L22).
- Null spend: shows "$0.00" (zero spend is a real value, not absent data).
- Loading: SkeletonList rows (existing pattern).

**Naming:** "Budget" renamed to "Cap" throughout -- "budget" collides with the Shape Up vocabulary we are deliberately replacing. "Cap" is precise and matches the concept doc.

**Collapsed Rail:** No change. The collapsed Rail shows semantic pills (BLK/REV/PSD), not cost data. Cost is an expanded-Rail concern.

### 2. BetCard (Tier 2 -- Canvas, Portfolio, GlobalSearch)

**Current:** `<KeyValue label="Appetite" value={appetite} />` where appetite is "2 weeks".

**New:** `<KeyValue label="Appetite" value={formatMoney(costAppetite)} />` where costAppetite is a Money value. When null (uncapped bet): value shows "--".

```
Appetite    $500.00
```

**No token display on BetCard.** The card is a summary surface; tokens are detail-level data. Showing both axes on a card that appears 3-10x on a canvas page violates density-first.

**BetCardProps change:**
```typescript
// Before
appetite: string;

// After
appetite: string;  // formatted Money string from formatMoney(), or "--" when null
```

Note: BetCard stays string-typed because it is a design-system component that receives pre-formatted display values. The caller (page code) calls `formatMoney()` and passes the result. This keeps the design-system component format-agnostic.

### 3. Bet Detail (WorkBet page)

**Current:** BetCard with appetite "2 weeks". Task table with string cost column.

**New -- bet header area:**
The BetCard in the detail header shows the Money appetite as before. ADDITIONALLY, below the BetCard, a new section shows spend-vs-cap on both axes using KeyValue rows:

```
SPEND vs CAP (section, uses existing heading style)
Money         $214.30 / $500.00
Tokens        42.3k / --
```

The Money line shows `spend / cap`. If cap is null: `$214.30 / --`.
The Tokens line shows aggregate tokens / token cap. If no token cap: `42.3k / --`. If no token data yet: `-- / --`.

**Per-tier token breakdown (progressive disclosure):**
Below the summary, when token data exists, show the per-tier breakdown as a compact secondary row using `text-[var(--text-lo)]` for the tier-level detail:

```
  reasoning 800   workhorse 38.2k   fast 3.1k
```

This is one line of inline `font-mono text-[11px] text-[var(--text-lo)]` spans separated by 12px gap. Only tiers with non-zero usage appear. This line uses no new components -- it is a flex row of plain spans.

**States:**
- No spend yet: "$0.00 / $500.00" (zero is a real value).
- No cap set: "$214.30 / --" (dash signals uncapped).
- No token data: "-- / --" on the tokens line.
- No tiers used: the per-tier line does not render.

**Task table cost column:**
Currently `cost: string` on each task row. Becomes formatted Money from `formatMoney()`. The column header stays "Cost". Each cell is a right-aligned monospace value:

```
| Task               | Owner    | Status      | Cost    |
|---------------------|----------|-------------|---------|
| Set up CI           | Builder  | done        |   $4.20 |
| Write tests         | Builder  | in_progress |  $12.30 |
| Deploy staging      | Builder  | proposed    |      -- |
```

Tasks with no cost yet show "--". Monospace + tabular-nums + right-align for the cost column (AQ-006).

### 4. TaskCard (Tier 2 -- Kanban)

**Current:** Optional `<KeyValue label="Cost" value={cost} />` where cost is a string.

**New:** Same KeyValue, value is pre-formatted Money string from `formatMoney()`. When cost is null/zero: omit the KeyValue entirely (the card shows cost only when there is spend to report).

```
Cost    $4.20
```

No tokens on TaskCard. Summary card -- density-first.

### 5. PitchCard (Tier 2 -- PitchSelector)

**Current:** `<KeyValue label="Appetite" value={appetite} />` where appetite is "2 weeks".

**New:** Same KeyValue, value is pre-formatted Money string. When appetite is null (uncapped): shows "--".

```
Appetite    $500.00
```

The PitchSelector detail pane also shows appetite via a stacked KeyValue. Same treatment.

### 6. WorkProduct (ProductBurn section)

**Current:** `costActual: number` (cents), `costCap: number | null` displayed as raw numbers.

**New:** Format via `formatMoney()`. Show as KeyValue rows in the burn section:

```
TEAM BURN (section)
Spend     $840.00
Cap       $2,000.00
```

When cap is null: "Cap    --".

**ProductBurn type change:**
```typescript
// Before
interface ProductBurn {
  costActual: number;
  costCap: number | null;
  capacity: number;
  activeBets: number;
}

// After
interface ProductBurn {
  costActual: Money | null;
  costCap: Money | null;
  capacity: number;
  activeBets: number;
}
```

---

## The formatMoney function (shared formatter)

Single function in `packages/shared`. Called by every surface that renders Money.

```typescript
function formatMoney(money: Money | null): string
```

- Null input: returns "--".
- USD/EUR/GBP: `$1,234.56` / `1.234,56 EUR` / `1,234.56 GBP` (v1: use USD symbol prefix, EUR/GBP suffix).
- JPY: `1,234 JPY` (scale=0, no decimal).
- Uses Intl.NumberFormat under the hood for locale-appropriate grouping (thousands separators). V1 uses 'en-US' locale hardcoded.
- Never returns a bare number. Always returns a formatted string with currency indicator.

**Compact token formatter:**
```typescript
function formatTokenCount(count: bigint | number | null): string
```

- Null input: returns "--".
- < 1,000: "800".
- >= 1,000: "42.3k" (one decimal).
- >= 1,000,000: "1.2M" (one decimal).

Both formatters live in `packages/shared/src/format/money.ts`. The existing `packages/shared/src/format/artifact-cost.ts` is replaced (its `formatMoney` becomes the shared one; its `formatArtifactCost` is rewritten to consume the shared formatter).

---

## Rejected directions

1. **Token sparklines on BetCard.** Considered adding a tiny inline sparkline (like the progress bar) showing token consumption by tier. Rejected: (a) adds visual complexity to a summary card, (b) sparklines on BetCard are already used for progress -- two different sparkline semantics on one card is confusing, (c) violates D3 progressive disclosure.

2. **Dual-axis KeyValue (money + tokens on one line).** Considered a compound KeyValue like `Appetite $500 | 100k tok`. Rejected: (a) overloads the KeyValue primitive which is designed for one label + one value, (b) the "|" separator is a new visual grammar that doesn't exist elsewhere, (c) money is the primary signal -- cramming tokens alongside dilutes it.

3. **Color-coded spend-vs-cap bars.** Considered a fill bar that turns from green to yellow to red as spend approaches cap. Rejected: (a) violates the monochrome status philosophy -- only danger is red, (b) introduces chromatic color on a non-status element, (c) the numeric "spend / cap" format is precise and sufficient for a power-user audience.

4. **Token pie chart or donut by tier.** Rejected: data visualization components are not in the component budget. A single line of mono text with tier labels is denser and more informative.

5. **Separate "Token" tab or panel.** Considered a togglable token detail panel on bet detail. Rejected: over-engineering for a secondary axis. The inline per-tier breakdown below the summary is sufficient.

6. **Removing appetite from BetCard entirely.** Since appetite is now a Money cap rather than a duration t-shirt size, considered removing it from the card and only showing it in detail. Rejected: the cap is the single most important piece of context when scanning bets -- "how much is this worth?" The founder needs to see it at scan level.

---

## Component mapping

| Component | Prop changes | What changes visually |
|---|---|---|
| BetCard | `appetite: string` (unchanged, receives formatted value) | "2 weeks" becomes "$500.00" or "--" |
| TaskCard | `cost?: string` (unchanged, receives formatted value) | String cost becomes formatted Money or omitted when null |
| PitchCard | `appetite: string` (unchanged, receives formatted value) | "2 weeks" becomes "$500.00" or "--" |
| KeyValue | No changes | Unchanged -- it already renders any string |
| Rail | `cost: CostInfo` type changes (strings become Money or null) | Values become formatted Money; "Budget" label becomes "Cap"; optional tokens row |
| WorkBet | Internal: spend-vs-cap section added below BetCard | New KeyValue rows for spend/cap + per-tier mono text |
| WorkProduct | `ProductBurn` type changes | costActual/costCap rendered via formatMoney |

**Component budget impact: 0 new components.** All changes compose existing primitives.

---

## All states

| Surface | Empty | Loading | Error | Populated | Overflow |
|---|---|---|---|---|---|
| Rail cost | All "--" | Skeleton rows | "Failed to load cost" ErrorState | Formatted Money values | N/A (values don't overflow) |
| BetCard appetite | "--" (uncapped) | N/A (parent loading) | N/A (parent error) | "$500.00" | N/A |
| Bet detail spend | "$0.00 / --" | Skeleton | ErrorState | "$214 / $500" + tier breakdown | N/A |
| Task cost column | "--" (no sessions) | Skeleton | N/A (parent error) | "$4.20" right-aligned mono | N/A |
| Product burn | "--" / "--" | Skeleton | ErrorState | "$840 / $2,000" | N/A |

---

## Behavior and motion

No new motion. All values are static text rendered by KeyValue. No hover, focus, or keyboard changes on cost displays. The Rail's existing expand/collapse animation continues unchanged.

Tabular numerals (`font-variant-numeric: tabular-nums`) required on all numeric cost and token values per AQ-006. This ensures column alignment in the task table.

---

## Mobile adaptation

On mobile (three-tab layout, viewport <= 1024px, comfortable density auto-switch):

- Rail is not visible on mobile. Cost posture would surface on a future mobile dashboard tab (out of scope for L17).
- BetCard appetite shows the same formatted Money value at comfortable density. KeyValue scales per density tokens.
- Bet detail shows the same layout; the per-tier breakdown line wraps naturally on narrow screens (flex-wrap).
- Task table: the cost column may be hidden on very narrow viewports (< 400px) via a responsive `hidden` class. This is a progressive-disclosure decision, not a data-loss decision.

---

## Open questions for the architect

1. **Wire format for CostInfo:** Does the Rail cost data come from a dedicated endpoint or piggyback on an existing factory/settings endpoint? The architect picks the endpoint shape.
2. **Appetite migration default:** When migrating "2 weeks" to Money, the concept doc says null (uncapped). Confirm in the architecture plan.
3. **Token aggregation:** Are weekly tokens summed server-side or client-side? The architect decides.
4. **ArtifactCostFromSession:** The concept doc says replace string-typed cost with structured Money. The architect specifies the new type shape and migration path for existing artifact cost data.

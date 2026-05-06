# L22 Approved Design — Knowledge Signal Columns + Sort Controls

## Variant: "Inline signal triad"

One variant (routine classification). Signal values render inline in the KnowledgeRow as a compact triad to the left of the timestamp, replacing the opaque whyNow caption. Sort controls render above the Triage list as a small button group.

## User task (1 sentence)

A founder scanning the Knowledge list sees at a glance how fresh, how popular, and whether cited each item is, and can re-sort the Triage view by any signal.

---

## 1. KnowledgeRow changes

### New props

```
signals?: {
  recency?: string | null;     // e.g. "2d", "3h", "1mo" — relative time since last activity
  frequency?: number | null;   // e.g. 3 — access count in trailing 30d window
  citation?: number | null;    // null while staged; integer when shipped
}
```

`signals` is optional so existing consumers (Curated tab, topic groups) can omit it and the row renders exactly as today. When provided, the signal triad renders in the row.

### Layout

The row keeps its existing flex layout. The signal triad sits between the row body (title + tags) and the timestamp:

```
[title] [layer] [kind] [status] [version?]
[caption?]
                              [signal-triad]  [timestamp]
```

The signal triad is a flex row of three small labeled values:

```
recency 2d  |  freq 3  |  impact ---
```

Each value:
- Label: `text-[11px] font-[var(--mono)] text-[var(--text-lo)] uppercase tracking-[var(--tracking-caps)]`
- Value: `text-[12px] font-[var(--mono)] text-[var(--text-mid)] tabular-nums` for numbers/times, or `text-[var(--text-lo)]` for dash
- Separator: a 1px vertical border `border-r border-[var(--border-subtle)]` between items, or `gap-[8px]` with no separator if the visual weight of separators crowds the row

The dash character for absent signals is a literal em dash `---` (the standard absent-data marker in the Lucid system), rendered in `text-[var(--text-lo)]` so it visually recedes.

### Signal rendering rules

| Signal | Present | Absent (null) |
|---|---|---|
| Recency | Relative time string: "2h", "3d", "1w", "2mo" | `---` |
| Frequency | Integer: "0", "1", "5" | `---` |
| Citation/Impact | Integer (when shipped) | `---` (while staged, always) |

The recency value is derived from `max(lastValidatedAt, lastEditedAt, lastAccessedAt)`. The formatter produces the most compact relative time: hours, days, weeks, months. This is the "freshness" indicator, not the existing `timestamp` prop (which shows when the item was created/last modified in a different sense).

### Information hierarchy

1. **Title** (primary) — `--density-text` size, `--text-hi`, truncates
2. **Tags + Status** (secondary) — Tag and StatusChip components, existing rendering
3. **Signal triad** (tertiary) — 11-12px mono, `--text-lo` / `--text-mid`, compact
4. **Timestamp** (quaternary) — 12px, `--text-lo`, existing rendering

The signal triad is deliberately low in the hierarchy. The user's eye should land on the title first, then the status, then the signals for comparison when scanning vertically. The signals earn their weight through consistency across rows (vertical alignment for scanability), not through size.

### Caption interaction

The existing `caption` prop (used for whyNow strings) is retained for backward compatibility but is NOT rendered when `signals` is provided. The signals replace the caption on the Triage tab. The Curated tab does not pass signals, so it renders as today (no caption there either currently).

### Density behavior

Signal triad elements consume density tokens:
- Gap between signals: `var(--density-gap)` (same as the row's internal gap)
- Font size: stays at literal 11/12px (these are caption-tier, below the density text floor, matching the existing caption and timestamp treatment)
- The row height naturally accommodates the triad because it sits in the same flex line as the timestamp, not on a second line

### States

- **All signals present:** Three labeled values with data
- **Mixed (common):** Some signals show values, others show dash. The triad still renders all three slots so the layout is stable.
- **All signals absent:** Three dashes. The triad still renders (it communicates "no data yet" explicitly).
- **Signals not provided:** When the `signals` prop is omitted, the triad does not render. Row looks exactly like today.

### Tabular alignment

For vertical scanning across a list of rows, the signal triad should have consistent width. Using `font-variant-numeric: tabular-nums` on the value part ensures numbers align. The label-value pairs have fixed labels ("recency", "freq", "impact") so the widths are naturally consistent.

---

## 2. Sort controls on Triage tab

### Placement

A small sort-selection control renders above the Triage item list, below the Triage/Curated tabs. It is part of the `KnowledgeList` page component, not the KnowledgeRow or a DS component.

### Implementation

A row of DaisyUI `btn btn-xs` buttons (the same pattern as the existing Triage/Curated tab buttons):

```
Sort by:  [Relevance]  [Recency]  [Frequency]
```

- Active sort: `btn btn-xs btn-neutral` (filled, same as active tab)
- Inactive: `btn btn-xs btn-ghost` (ghost, same as inactive tab)
- "Sort by:" label: `text-[11px] text-[var(--text-lo)] uppercase tracking-[var(--tracking-caps)] font-[var(--mono)]`

The sort options are:
- **Relevance** (default) — sorts by the composite `relevanceScore` descending
- **Recency** — sorts by `max(lastValidatedAt, lastEditedAt, lastAccessedAt)` descending (freshest first)
- **Frequency** — sorts by `accessCount30d` descending (most accessed first)

### URL state

The active sort is reflected in the URL search params: `?sort=relevance` (default, omitted from URL), `?sort=recency`, `?sort=frequency`.

When scope changes, the sort resets to relevance (same pattern as the existing tab reset on scope change).

The existing `?scope=practice` param coexists: `?scope=product&sort=recency`.

### Sort on the Curated tab

The Curated tab does NOT get sort controls. It groups by topic, and the topic groups are not sorted by relevance signals. This avoids confusing the two views.

---

## 3. Rejected directions

- **Signal columns as a data table.** Considered rendering signals as separate columns in a proper table layout (like a spreadsheet). Rejected because: KnowledgeRow is a flex row, not a table cell; the Knowledge list mixes Triage (flat) and Curated (grouped by topic) views so a table layout would not work for both; the density would be excessive for a list that also carries tags + status chips.

- **Signal sparklines / mini charts.** Considered tiny inline charts showing access trends over time. Rejected because: no precedent in the DS, requires a new component (budget), adds visual noise to a dense list, and the raw numbers are more honest (a sparkline suggests trend analysis that we are not actually providing).

- **Dropdown sort selector.** Considered a DaisyUI dropdown/select for sort choice. Rejected because: with only 3 options, a button group is faster (one click vs two), more visible (all options are always visible), and consistent with the existing tab button pattern.

- **Sort direction toggle.** Considered adding ascending/descending toggle per sort. Rejected because: the natural order for each signal is clear (fresher first for recency, more accessed first for frequency, higher relevance first for composite). Adding a direction toggle doubles the interaction surface for a feature that 95% of users would never use. If needed later, it can be added as a shift-click behavior.

- **Signal-specific absent states with explanatory tooltip.** Considered showing "No access data yet" tooltips on absent signals. Rejected because: the dash is self-explanatory per the L5 anti-pattern rule, tooltips on every row add interaction weight, and the system should normalize absent data as a natural state, not an exception requiring explanation.

---

## 4. Component mapping

| Component | Where | Props change |
|---|---|---|
| `KnowledgeRow` (DS, Tier 2) | Each row in the Triage list | New optional `signals` prop |
| `KnowledgeList` (page) | Triage tab gets sort controls + signal data | Sort state from URL params, signals from API |
| DaisyUI `btn btn-xs` | Sort button group | Existing pattern, no wrapper |
| `SkeletonList` (DS) | Loading state | Unchanged |
| `EmptyState` (DS) | Empty state | Unchanged |
| `ErrorState` (DS) | Error state | Unchanged |

No new custom components. Component budget: 0 new / 0 retired.

### KnowledgeRow HTML reference update

The `KnowledgeRow.html` file must be updated to include the signal triad variant. This is a mandatory deliverable per the visual-parity rule (HTML is the design reference, TSX matches it).

---

## 5. Behavior

- **Click:** Row click navigates to detail page (unchanged).
- **Hover:** Row hover shows `--surface-4` background (unchanged).
- **Focus:** Focus ring on row (unchanged). Sort buttons have standard `btn` focus behavior.
- **Sort change:** Clicking a sort button updates URL params. The list re-sorts with no loading state (the data is already loaded; sort is client-side). Transition: none (instant re-order). Animate-on-reorder would be distracting in a list this dense.
- **Keyboard:** Tab navigates between rows and sort buttons. Enter/Space activates. No custom keyboard shortcuts (founder demoted).

---

## 6. Mobile adaptation

On mobile (three-tab layout), the Knowledge view is one of the three tabs. The signal triad may need to stack or abbreviate:
- At viewport < 640px: the signal triad could move to a second line below the title, or abbreviate labels ("rec", "frq", "imp"). The architect decides the breakpoint behavior.
- Sort controls stay as a button row; they are compact enough for mobile.

---

## 7. Open questions for the architect

1. **Signal data source on the list endpoint.** The current list endpoint returns items with `attentionScore`. L22 needs to return `relevanceScore`, `lastValidatedAt`, `lastEditedAt`, `lastAccessedAt`, `accessCount30d`, `citationCount` (nullable) per item. Is this a new endpoint, an extension of the existing one, or computed client-side from existing data?

2. **Relative time formatter.** Where does the "2d ago" / "3h ago" formatter live? Shared utility in `packages/shared` or client-side only in `packages/web`? The server should return ISO timestamps; the client formats them.

3. **Sort state persistence across tabs.** When the user switches from Triage to Curated and back, should the sort reset to relevance or remember the last choice? Recommendation: reset (simple, matches the existing tab-reset pattern).

4. **KnowledgeRow HTML reference.** The builder must update `KnowledgeRow.html` to include the signal triad variant alongside the existing variants, per the visual-parity rule.

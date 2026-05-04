# L10 — Submenu filter chips actually filter — APPROVED design

**Story:** TRACK-L L10 (lines 345–371). **Status:** approved input contract for `/architecture`.

**Chosen variant:** **A — Pure axis (3 chips)**, with C's *intent* of always-visible recovery realized as an inline `× Clear` text-button in the chip row, and B's chip-specific empty-filter description copy.

**Mockup:** `variant-a-pure-axis/mockup.html` + `screenshot.png`. The synthesis adds an inline `× Clear` text-button to the chip row when the filter is non-default — see §3 below for placement and behavior. (The mockup does not yet render the inline `× Clear`; the architect implements it per §3.)

**Critique score:** 8.6/10 (A) — synthesis additions strengthen the score; final approved score recorded in `critique-approved.md`. Threshold (≥7) cleared.

---

## 1. User contract

A founder lands on Conversations. The Submenu shows the live thread list grouped into Blocking / Active / Resolved · 24h (L8 contract). The chip row above the list now carries one axis of filtering — `All / Blocking / Async` — that maps 1:1 to the founder's stated `blocking ↔ non-blocking` (`sync ↔ async`) classification. Picking a chip narrows the rendered list to threads matching that side of the axis. Clearing returns to the full grouped list.

The user asks one question at a time:
- *"Just show me what's blocking right now."* → `Blocking` chip → only the Blocking section renders.
- *"Show me everything that doesn't need me right now — the long tail."* → `Async` chip → Blocking section silently absent; Active and Resolved · 24h render.
- *"Show me everything."* → `All` chip (default) → all three sections render per L8.

When a chip narrows the list to zero rows, an EmptyState with chip-specific copy and a single `Clear filter` button replaces the section list. When a chip narrows the list to non-zero, the chip row shows an inline `× Clear` affordance so recovery is one click during long scrolls without needing to click `All`.

The chip resets to `All` on view change (existing AppShell behavior at AppShell.tsx:409–412 — preserved).

---

## 2. Chip vocabulary (closed)

The J2-locked `SUBMENU_FILTERS.conversations` array at `AppShell.tsx:75-87` is **superseded** by the following:

| Index | Chip id | Label | Filter predicate over `ThreadItem` |
|---|---|---|---|
| 0 | `all` | `All` | (no filter) |
| 1 | `blocking` | `Blocking` | `thread.blocking === true` |
| 2 | `async` | `Async` | `thread.blocking === false` |

> The deprecated chip ids (`needs-review`, `chats`, `resolved`) on `SubmenuFilter` (at `Submenu.tsx:9`) are removed by L10. Architect updates the union type and any test fixtures referring to them. Search the repo for `needs-review`, `chats`, `resolved` filter usages and replace per L10.

**Rendering:**
- Existing `Submenu.tsx` chip rendering (lines 106–127) is unchanged structurally — the array driving it changes.
- Active chip: `btn btn-xs btn-neutral` (carries `aria-selected="true"`).
- Inactive chip: `btn btn-xs btn-ghost`.
- Tab order: `All`, `Blocking`, `Async` — left to right.

---

## 3. Inline `× Clear` affordance

**Placement.** Right edge of the chip row, in the same flex row as the chips. The chip row's parent already has `flex flex-wrap gap-1` (Submenu.tsx:106). The clear control sits *outside* the `tablist` (it is not a tab), so it must NOT carry `role="tab"`. Use a flex spacer or `ml-auto` on the clear button to push it to the right edge.

**Visibility.** Renders ONLY when `activeFilter !== "all"`. When `activeFilter === "all"`, the clear control is unmounted (not just hidden) so it leaves zero footprint.

**Shape.**
- `<button type="button">` element.
- DOM content: a unicode `×` glyph (text content, NOT an emoji or SVG) followed by a single space and the word `Clear`.
- Visible text label: `× Clear` (no longer copy — the chip row context makes the verb obvious).
- Class: `btn btn-xs btn-ghost text-[var(--text-lo)] font-mono` — matches chip row register, sits visually quieter than the chip pair.
- ARIA: `aria-label="Clear filter"` on the button itself.
- `data-testid="submenu-filter-clear"`.

**Behavior.**
- Click → `onFilterChange?.("all")`.
- Keyboard: focusable in normal tab order after the chips. `Enter`/`Space` activate.
- Hover: existing `btn-ghost` `--surface-3` background fade. `--motion-fast`.

**Why inline and not a pill above the list:** vertical chrome budget. Variant C's pill row was strong on permanence but cost a second chrome row. Folding the affordance into the existing chip row delivers the same recovery permanence at zero added vertical footprint.

**Why the `×` glyph is text, not an emoji or SVG:** AQ-105 forbids emoji as iconography on buttons. SVG would add markup weight for a single-glyph affordance; the unicode `×` is rendered by the system font and reads consistently in Lucid Dark and Lucid Light.

---

## 4. Filter × sectioning interaction

The filter applies **before** sectioning. Sections render per L8 §5.5 with empty-section rules:

| `activeFilter` | Blocking section | Active section | Resolved · 24h section |
|---|---|---|---|
| `all` (default) | renders if non-empty (silently absent if empty) | renders header + rows OR header + `Quiet — nothing in flight.` | renders if non-empty (silently absent if empty) |
| `blocking` | renders if non-empty (else falls into filter-empty state) | silently absent (no rows can match — they're not blocking) | silently absent |
| `async` | silently absent | renders header + rows OR header + `Quiet — nothing in flight.` | renders if non-empty |

**Sticky-Blocking-header rule** (L8 §5.6) is preserved under `all` and `blocking`. Under `async` the Blocking section is absent so stickiness is moot.

**Selected-thread state** (L8 §5.7) is preserved unchanged. If the selected thread is filtered out, the row simply does not render; the Main pane keeps showing the thread.

---

## 5. States

### 5.1 Default (no filter)
Chip row renders all three chips with `All` active. Inline clear control unmounted. List renders per L8 §5.4.

### 5.2 Filter active, populated
Chip row: active chip dark, others ghost, inline `× Clear` visible at right edge. List renders only the sections that have matching rows per §4. Total count badge in title bar shows the post-filter count.

### 5.3 Filter active, empty
Chip row: active chip dark, others ghost, inline `× Clear` visible at right edge. List slot renders an `EmptyState` component:

| Active filter | Title | Description |
|---|---|---|
| `blocking` | `No threads match this filter` | `No blocking threads right now.` |
| `async` | `No threads match this filter` | `No async conversations.` |

**Action button:** primary text-button labeled `Clear filter` (uses `--primary` color via `btn-primary`), `aria-label="Clear filter"`, click → `onFilterChange?.("all")`.

**`dataTestId`:** `thread-sections-filter-empty`.

The whole-list-empty case (server returned zero threads, regardless of filter) keeps the L8 EmptyState (`No threads yet` / `Conversations with agents will appear here once started.`) and ignores the filter chip — there is nothing to recover.

### 5.4 Loading
Same as L8 §5.2 — the existing `SkeletonList` renders. The chip row remains visible; chip clicks during loading queue into the lifted state and apply when threads resolve.

### 5.5 Error
Same as L8 §5.3 — `ErrorState` renders. The chip row remains visible but inert (chip clicks do nothing while in error state; the user must `Retry` first). Architect implementation note: pass `disabled` on chips while `status === "error"`.

---

## 6. Total count under filter

Per L8 §3 the total count badge in the Submenu title bar (`Conversations 9`) derives from the rendered list length. Under L10 it derives from the **post-filter** length:

```
total = threads.filter(predicate(activeFilter)).length
```

When `total === 0` and the filter is non-`all`, the count badge shows `0` (does not hide). The user sees `Conversations 0` + the filter-active chip → the empty filtered list is unambiguous.

---

## 7. Behavior

| Event | Result |
|---|---|
| Click chip `All` | `onFilterChange("all")`. Inline `× Clear` unmounts. List restores. |
| Click chip `Blocking` | `onFilterChange("blocking")`. Inline `× Clear` mounts. List narrows. |
| Click chip `Async` | `onFilterChange("async")`. Inline `× Clear` mounts. List narrows. |
| Click inline `× Clear` | `onFilterChange("all")`. Inline `× Clear` unmounts. List restores. |
| Click `Clear filter` button in EmptyState | `onFilterChange("all")`. Returns to default state with full list. |
| Tab / Shift-Tab through chip row | Order: `All` → `Blocking` → `Async` → `× Clear` (when present) → first list row. |
| Enter / Space on focused chip | Activates chip (same as click). |
| Enter / Space on focused `× Clear` | Activates clear (same as click). |
| Switch IconRail view away and back | Filter resets to `all` per existing AppShell behavior (AppShell.tsx:409–412 — keep). |
| Selected thread filtered out | Row does not render in Submenu; Main pane unaffected. |

**No keyboard verb shortcuts.** No `b` for Blocking, no `a` for Async, no `Escape` clears (Escape is owned by Submenu collapse — Submenu.tsx:65).

**Motion:**
- Chip selection state change: `--motion-fast` (80 ms) opacity/background fade.
- List re-rendering on filter change: no explicit transition — React reconciliation. (List does not animate row entry/exit; preserves the L8 visual contract.)
- Inline `× Clear` mount/unmount: no transition (instant). The chip-row state change carries the signal.

---

## 8. Mobile adaptation

- Three chips + `× Clear` fit at 360 px viewport width with the existing `flex flex-wrap gap-1` (Submenu.tsx:106). On the rare double-row wrap, the `× Clear` flows to the right edge of whichever row it lands on.
- Chip row carries the auto-density tier bump (`comfortable`) at viewport ≤1024 — chip touch targets reach the AQ-015 44 px minimum without code change.
- Empty-filter `EmptyState` renders inside the mobile Submenu page (no IconRail / Submenu split on mobile per HUMAN_INTERFACE_LAYER.md).
- Sticky Blocking header on mobile (L8 §7) is preserved; it only matters under `all` and `blocking` filters.

---

## 9. Accessibility

- Chip row remains a `role="tablist"` (existing). Each chip is `role="tab"` with `aria-selected={selected}` (existing). The inline `× Clear` button is **NOT** in the tablist — it is a sibling button with its own `aria-label="Clear filter"`. Architect refactors the markup so the tablist contains only the three tabs; the clear button sits in the same flex row outside the tablist.
- `EmptyState` carries `role="status"` (existing component default). The `Clear filter` button is `<button>` with `aria-label="Clear filter"`.
- All filter state changes announce via the post-filter count change in the title bar (already a live region in AppShell, or architect adds `aria-live="polite"` if not).
- Color is not the only signal: chip active state uses background fill (`--surface-4`) AND `aria-selected="true"`. Empty-filter state has explicit textual description.

---

## 10. Component composition map

| Surface | Component | Source | Notes |
|---|---|---|---|
| Submenu chrome (title, count, collapse) | `Submenu` | `packages/web/src/shell/Submenu.tsx` | unchanged |
| Chip row | `Submenu` (inline) | same | filter array changes; markup gains inline `× Clear` button outside the tablist |
| Inline `× Clear` button | `<button>` (DaisyUI `btn btn-xs btn-ghost`) | DaisyUI | NEW affordance — no new custom component |
| List slot | `ThreadSections` (extended) | `packages/web/src/components/ThreadSections.tsx` | accepts `activeFilter` prop; applies predicate before grouping |
| EmptyState (filter-empty) | `EmptyState` | `@hyperidle/design-system` | reused; pass chip-specific `description` and a `Clear filter` action |
| EmptyState (whole-list empty) | `EmptyState` | `@hyperidle/design-system` | reused, unchanged from L8 |

**Component budget impact:** zero new custom components. Tier 1/2/3 budget unchanged.

---

## 11. Founder filter — verification

- [x] One axis (`blocking ↔ non-blocking`) — bijective chip mapping.
- [x] No customizable filter sets, no presets — filter resets on view change.
- [x] No emojis — `×` is unicode text, not an emoji.
- [x] No keyboard verb shortcuts.
- [x] No drag-reorder.
- [x] No purple/indigo gradient. Density tokens consumed. Closed radius scale.
- [x] Counts derive from list length (post-filter).
- [x] Selection state is independent of filter state (L8 §5.7 preserved).
- [x] No hero, no 3-column card grid, no rounded-2xl.
- [x] Component budget unchanged.

---

## 12. Open questions for the architect

1. **Filter state location.** Local `useState` in `AppShell` (existing), URL search param (`?filter=blocking`), or context? Visual contract works with all three. **Recommend: keep local `useState` in `AppShell` for L10.** The chip's reset-on-view-change behavior is already implemented locally; URL persistence is a separate decision (open the door later if/when deep-linking from notifications becomes necessary).
2. **Predicate location.** Apply the filter predicate inside `ThreadSections` (consumer) or pre-filter the `threads` array in `AppShell` and pass the narrowed array down? **Recommend: pass the unfiltered `threads` + the `activeFilter` prop down to `ThreadSections` and let it filter before grouping.** This keeps the title-bar total count and the list count consistent because both derive from the same filter-applied array, and it keeps `AppShell`'s concerns at "what view + what filter".
3. **Removing `needs-review` / `chats` / `resolved` from `SubmenuFilter` union.** Search-and-replace across `Submenu.tsx`, `Submenu.stories.tsx`, `AppShell.tsx`, `__tests__/AppShell.filter-reset.test.tsx`, `Submenu` test fixtures. The architect identifies every reference and either renames or removes; L10 owns the breakage.
4. **`SUBMENU_FILTERS.knowledge`.** Knowledge currently uses `[All, Needs review]` (AppShell.tsx:82–85). L10 only changes the Conversations filter set; Knowledge's `needs-review` chip stays. Implication: `SubmenuFilter` cannot simply be replaced wholesale — its union must accommodate both Conversations chips (`all | blocking | async`) AND Knowledge chips (`all | needs-review`). Architect picks: one union with all values, or per-view typed unions. Either is fine.
5. **EmptyState `Clear filter` button styling.** L8 used a generic `EmptyState` action prop. Confirm the button is rendered as `btn btn-primary btn-sm` (the existing EmptyState action default) — `--primary` color + sentence case + appropriate touch target. If `EmptyState` does not currently expose a primary action prop, the architect extends it (one prop addition, not a new component).
6. **Disabled chip state during error.** When `status === "error"`, chips become inert (per §5.5). Architect picks the visual: `aria-disabled="true"` + `pointer-events: none` + `opacity: 0.5`, OR full `disabled` attribute. **Recommend: `aria-disabled` + reduced opacity, not `disabled`** — the chip text remains readable to screen readers; the user just can't activate them until retry succeeds.

---

## 13. Acceptance-criteria mapping (TRACK-L L10)

| AC (TRACK-L lines 351–357) | Where in this design |
|---|---|
| Submenu filter state consumed by thread list (closes "set but never read" bug) | §1, §10, §12 Q2 |
| Real filter axis is blocking vs non-blocking | §2 — the chip vocabulary IS the axis |
| Empty filtered states show clear empty state with clear-filter affordance | §5.3 — `EmptyState` with chip-specific description + `Clear filter` button; §3 — inline `× Clear` is the parallel populated-state affordance |
| Vitest: each filter narrows correctly; clearing restores | §2 (predicates) + §7 (events) — provides contract; architect writes tests |
| Playwright e2e: click filter → list narrows → clear → list restored | §7 — events specified; e2e is straightforward |
| `bun run check` + `bun run lint` + `bun run test` green | architect verifies |
| One axis (sync = blocking, async = non-blocking) | §2 — bijective mapping |
| No customizable filter sets, no saved presets | §11 |
| No emojis | §3 (`×` is unicode text), §11 |

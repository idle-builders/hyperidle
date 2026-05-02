# L10 Variant A — Pure axis (3 chips) — SPEC

## Signature
The chip labels **are** the axis. `All / Blocking / Async` is a verbatim transcription of the founder's stated classification (blocking ↔ non-blocking). Zero translation cost between the spoken filter and the underlying flag. The simplest possible filter UI for a one-day story — three chips, one row, no second axis hidden inside friendly synonyms.

## User story
As a founder triaging Conversations, I read three chips that name the only axis I think in — `Blocking` for "needs me now", `Async` for the long tail, `All` for everything — and I trust that clicking a chip narrows the list to exactly what the label says.

## Component composition map
| Surface | Component | Source | Change vs. L8 |
|---|---|---|---|
| Submenu chrome (title, total count, collapse) | `Submenu` | `packages/web/src/shell/Submenu.tsx` | unchanged |
| Filter chip row | `Submenu` `filters` prop (3-element vocabulary) | same | vocabulary changes from `[All, Needs review, Chats, Resolved]` to `[All, Blocking, Async]`. Styling unchanged: `btn btn-xs btn-ghost` (inactive) / `btn btn-xs btn-neutral` (active). |
| List slot | `ThreadSections` (extended) | `packages/web/src/components/ThreadSections.tsx` | reads `submenuFilter` prop and applies the filter rule below before sectioning. |
| Section header | inline JSX inside `ThreadSections` | — | unchanged from L8 |
| Row | `ThreadRow` | `packages/design-system/src/ThreadRow.tsx` | unchanged from L8 |
| Filter-empty state | `EmptyState` | design-system | NEW use site (rendered inside the list slot when filter narrows to zero). Title + description + `Clear filter` action. `dataTestId="thread-sections-filter-empty"`. |
| Whole-list empty / error / loading | `EmptyState` / `ErrorState` / `Skeleton` | design-system | unchanged from L8 (out of L10 scope) |

**Component budget impact:** zero new components. Reuses the `Submenu` chip row, the L8-extended `ThreadSections`, and the existing `EmptyState`. No new props.

## Information hierarchy (top to bottom of the Submenu)
1. **Title bar** — `Conversations` + total count (count derived from filtered list length, never literal).
2. **Filter chip row** — exactly three chips, in fixed render order: `All` · `Blocking` · `Async`. Always visible (chip row never hides — the only recovery affordance from the empty-filter state is also the chip row itself, plus a redundant `Clear filter` button inside the empty state).
3. **List slot** — sections under the active filter (see filter rules below) OR the filter-empty `EmptyState`, never both.

## Filter rules (formal)
| Chip | Filter rule | Sections that can render |
|---|---|---|
| `All` (default) | no filter | Blocking, Active, Resolved · 24h (per L8 §2) |
| `Blocking` | `thread.blocking === true` | Blocking only. Active and Resolved · 24h are silently absent (consistent with L8 §5.5 where empty sections silently absent). |
| `Async` | `thread.blocking === false` | Active and Resolved · 24h. Blocking is silently absent (it is empty by construction under this filter). |

**Total count semantics.** The Submenu title bar's total count reflects the *filtered* row count, not the unfiltered list length. The user clicks `Blocking`, the title reads `Conversations 2`. This is the L8 contract (§3) carried forward unchanged.

**Sticky Blocking header.** Under `Blocking` the section header is the only thing rendering and it remains sticky (per L8 §5.6). Under `Async` the Blocking section is absent so stickiness has nothing to anchor — the Active and Resolved headers are not sticky (also per L8 §5.6).

**Selection across filter changes.** If the lifted selected-thread id no longer matches any rendered row, no row carries `aria-current="true"`; the Main pane keeps showing the thread (L8 §5.7 contract preserved).

## States

### populated-no-filter (`All`)
Defer to L8 §5.4 entirely. Sections render in fixed order Blocking → Active → Resolved · 24h.

### populated-with-filter (NEW)
The active chip carries `btn btn-xs btn-neutral`; the other two carry `btn btn-xs btn-ghost`. The list slot renders only the sections allowed under the filter rule. Section headers and counts behave per L8.

### filter-empty (NEW)
Triggered when the active chip narrows the list to zero rows. The list slot renders an `EmptyState` (no section headers, no skeleton rows):

- **title:** `No threads match this filter`
- **description:**
  - When `Blocking` is active: `No blocking threads right now.`
  - When `Async` is active: `No async conversations.`
- **action:** primary text-button labeled `Clear filter`. Click sets the active chip back to `All`. Visual: matches the existing `EmptyState` action slot (a `<span>` styled `font-size: 12px; color: var(--primary); cursor: pointer;` per `EmptyState.html` reference).
- **dataTestId:** `thread-sections-filter-empty`.

The chip row remains visible above the empty state. Two equivalent recovery paths: click `All` chip, or click `Clear filter` button. Both call the same `onFilterChange("all")` handler.

The whole-list empty case (`All` selected, server returned zero threads) is the L8 §5.1 state — out of L10 scope.

### empty-list (whole list, server returned zero, regardless of filter)
Defer to L8 §5.1.

### loading
Defer to L8 §5.2. The chip row remains visible during loading; chips are not interactive while skeleton rows render.

### error
Defer to L8 §5.3.

## Behavior

### Chip click
- Click chip → `onFilterChange(chipId)`. The chip transitions from `btn-ghost` to `btn-neutral` over `var(--motion-fast)` (80ms surface change).
- The list slot re-renders with the new filter applied. No layout transitions on rows.
- The selected-thread id is unchanged. If the selected row is no longer visible, that's expected (L8 §5.7).

### Keyboard
- **Tab** moves focus through the chips in render order (`All` → `Blocking` → `Async`), then into the list. Each chip is a native `<button>` so default focus order Just Works.
- **Enter / Space** on a focused chip activates it (DaisyUI `btn` default — no custom handler needed).
- **No verb shortcuts** (founder filter — explicit non-goal in L10 brief). No `b` for Blocking, no `a` for Async, no number-key shortcuts.
- **Up/Down arrow inside the list** continues to navigate rows (L8 §8). Arrow keys on a focused chip do nothing custom.
- **Esc on a focused chip** does nothing (no popovers to dismiss). Founder cut: no clear-via-keyboard shortcut — `Clear filter` requires either clicking the `All` chip or, in the empty state, clicking the `Clear filter` button.

### Focus management
- Clicking a chip retains focus on that chip (default browser behavior). The screen reader announces the new `aria-selected="true"` state.
- When the filter narrows the list to zero, focus does NOT auto-move to the `Clear filter` button. Auto-focus would steal screen-reader context. The user reaches `Clear filter` via Tab from the active chip.
- The chip row uses `role="tablist"` with `aria-label="Filter Conversations"` (existing `Submenu` pattern). Each chip is `role="tab"` with `aria-selected={chipId === activeFilter}`.

### Active-filter visual signal
- Single source: the chip itself in `btn-neutral` styling. No additional pill above the list, no inline "Filtered: Blocking" banner. The chip row is short enough (3 chips at 240px) that the selected chip is always visible.
- The total count in the title bar updating to the filtered count is the secondary signal. (E.g., `Conversations 9` becomes `Conversations 2` under `Blocking`.)

## Mobile adaptation
- Three chips at 360px width fit on a single row with comfortable gap (each chip ≈ 60-80px including padding). No `flex-wrap` activation.
- All density tokens auto-tier to `comfortable` at viewport ≤1024px (existing AppShell behavior, L8 §7).
- Touch targets: each chip is `btn btn-xs` which at comfortable density meets the 44px minimum (AQ-015) via the `comfortable` row-height token.
- Sticky Blocking header on mobile: still applies under the `Blocking` filter (the only section visible) — anchors the danger-tinted header at the top of the viewport on long blocking-list scrolls. Under `Async`, Blocking is absent and stickiness has nothing to anchor.

## What this variant is good at (its signature, restated)
- **Vocabulary fidelity.** A founder who said "I want to filter by blocking-vs-non-blocking" gets exactly that. No translation, no synonym expansion, no four chips that secretly mean two axes.
- **Visual economy.** Three chips is the minimum to express a tri-state filter (off / one side / other side). Density principle honored.
- **Cheap to wire.** The classifier already knows `thread.blocking`. The filter rule is a one-line predicate on each chip. One-day story sized correctly.
- **Sticky-Blocking under filter.** When `Blocking` is selected, the only thing on screen is exactly what the user asked for, with the existing red sticky header doing the work. No new chrome.

## Trade-offs (what this variant is bad at)
- **`Async` is jargon.** A founder used to the J2 vocabulary (`Needs review / Chats / Resolved`) sees `Async` and may read it as "asynchronous code execution" before reading it as "non-blocking conversations". Variant B avoids this by keeping J2 labels. Variant C hides it behind a segmented control where the pairing `Blocking | Async` reads as a binary by visual shape alone.
- **Loses J2-locked vocabulary.** The chips `Needs review / Chats / Resolved` were already user-tested vocabulary from J2. Replacing them with `Blocking / Async` is a vocabulary regression in exchange for axis fidelity. The brief says the J2 chips were never wired, so the regression is theoretical, not actual — but it's still a vocabulary the founder has seen on screen.
- **No `Resolved`-only filter.** The `Resolved · 24h` section is reachable only inside `All` and `Async`. A founder who wants "show me what shipped today" must scroll past Active to find it. (Mitigation: under `Async` the Resolved section sits directly under Active, exactly where L8 §2 puts it. The "show me Resolved only" use case is rare enough to not justify a fourth chip — and the brief explicitly forbids two-axis filtering.)
- **`All` is a tautology.** "Filter by all" is a degenerate filter. Three chips include one chip that does nothing. Honest but slightly wasteful. Variant C dodges this by removing `All` and using a segmented binary plus a clear pill.
- **No active-filter pill above the list.** Variant C has a persistent `× Showing blocking only — clear` pill. This variant relies on the chip's own dark state to convey "filter active". On a long scroll where the chip row scrolls out of view (the chip row sits above the scrollable list slot, so it does NOT scroll with the list — but the title bar might), the user could lose the filter signal. Mitigation: the chip row is sticky-positioned within the Submenu chrome, not inside the scrollable list slot.

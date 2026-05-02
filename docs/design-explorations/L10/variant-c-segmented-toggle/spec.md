# L10 Variant C — Segmented binary toggle + persistent clear pill

## Signature
The chip row collapses into a **single binary segmented control** — `[ Blocking | Async ]` — that physically *looks like one component*. There is no "All" segment; the **shape** of a two-segment control encodes the single axis the founder named (blocking ↔ non-blocking) before the eye reaches a label. When a side is engaged, a persistent inline `× Showing blocking only — clear` pill appears between the control and the list, so recovery is always one click away regardless of scroll position or how the user got into the filtered state.

The substrate is the L8-approved Variant C Submenu (Blocking / Active / Resolved · 24h). Only the chip-row region changes.

## User story
As a founder triaging Conversations, I see the axis encoded in the control's shape: two segments, one axis, one decision. I tap `Blocking` and the list narrows; a small `× clear` pill appears immediately below the control as a permanent recovery affordance. I tap the pill (or the active segment again) to return to the full list. I never have to scroll, hunt, or re-enter the chip row to undo a filter.

## Component composition map
| Surface | Component | Source | Notes |
|---|---|---|---|
| Submenu chrome (title, total count, collapse) | `Submenu` | `packages/web/src/shell/Submenu.tsx` | unchanged |
| Filter control | DaisyUI `join` + `btn` × 2 | DaisyUI primitive | **No new custom component.** The existing chip `<button>` markup is replaced by a `.join` wrapper around two `.btn.btn-xs` children. |
| Active-segment styling | `btn-neutral` modifier | DaisyUI primitive | inactive segments use `btn-ghost`; active uses `btn-neutral` |
| Clear pill (filtered state only) | DaisyUI `badge.badge-ghost` (button element) | DaisyUI primitive | inline `×` glyph (unicode `×` U+00D7, **not** an emoji) + label |
| List slot | `ThreadSections` (extended) | `packages/web/src/components/ThreadSections.tsx` | reads filter prop; classifier from L8 unchanged |
| Filter-empty state | `EmptyState` (terse mode — title only) | design-system | dataTestId `thread-sections-filter-empty` |

**Component budget impact: zero new custom components.** This variant flags as a budget *win* — the chip row footprint shrinks (4 buttons → 1 joined control) and recovery moves into a DaisyUI `badge`, both reused primitives.

## Information hierarchy
1. **Submenu title bar** — `Conversations` + total count (existing).
2. **Segmented control** — single row, joined `[ Blocking | Async ]`. Visually one unit (shared 1px `var(--surface-3)` border, no gap between children, only first/last child rounded).
3. **Clear pill** (conditional — renders only when a segment is active). `× Showing blocking only — clear` / `× Showing async only — clear`. Small mono badge sitting between the control and the list.
4. **List** — sections per L8 contract.

The total count in the title bar continues to reflect the *visible* count after filtering, per L8 §3.

## Filter rules (formal)

| Control state | Predicate | Sections that may render | Pill visible? | Pill copy |
|---|---|---|---|---|
| Both segments inactive (default) | none | Blocking, Active, Resolved | no | — |
| `Blocking` segment active | `thread.blocking === true` | Blocking only (Active + Resolved silently absent) | yes | `× Showing blocking only — clear` |
| `Async` segment active | `thread.blocking === false` | Active, Resolved (Blocking silently absent) | yes | `× Showing async only — clear` |

Mutually exclusive. The control cannot have both segments active.

## States

### Default — no filter (defer to L8)
Both segments render `btn-ghost` (no fill, ghost foreground). No pill. Sections per L8 §5.4.

### Loading / Error / Empty (whole list)
Defer to L8 §5.1, §5.2, §5.3. The segmented control remains visible (it is chrome, not content). Pill is absent (no filter is active during loading; it would re-appear if the filter survives a refetch).

### Populated — filter active (primary mockup state)
- The active segment is `btn-neutral` (inverted fill, high contrast). The inactive segment stays `btn-ghost`.
- The clear pill renders directly below the control with `4px` top margin, before the list.
- Sections silently absent per the filter-rules table.

### Filter-empty — segmented control narrows to zero rows
- Segmented control unchanged (active segment still `btn-neutral`).
- Clear pill **remains** above the list — it is the recovery affordance.
- List slot renders a terse `EmptyState`:
  - **title:** chip-specific — `No blocking threads.` / `No async threads.`
  - **description:** *omitted* (the pill is the recovery affordance; the EmptyState body stays terse).
  - **action:** *none in the body* — the persistent pill above the list is the single, always-reachable recovery surface. **Defense:** giving the EmptyState its own `Clear filter` button would create two affordances for the same action one screen apart, doubling the action surface and forcing the user to learn two recovery paths. The pill is closer to the cause (the segmented control) and persistent (always present whenever a filter is active, not only during empty results), so it teaches one location for one verb. AQ-113-adjacent: don't render two affordances when one is sufficient.
  - **dataTestId:** `thread-sections-filter-empty`.

### Selected-thread persistence across filter change
Per L8 §5.7 and the L10 brief. Not relitigated here.

## Behavior

### Segment click
- Click an inactive segment → it becomes active; the other segment stays inactive; pill renders.
- Click the **active** segment → toggles OFF; pill disappears; sections return to default.

### Pill click
- Click the pill (any part — the `×` glyph and the label are one button) → clears the filter; pill disappears; segmented control returns to both-inactive.

### Keyboard (ARIA `tablist` semantics)
The joined segmented control adopts `role="tablist"` with each segment as `role="tab"` and `aria-selected={isActive}`. Standard WAI-ARIA tablist navigation:
- **Tab** — focus enters the segmented control on the active segment, or on the first segment if none is active.
- **Left arrow / Right arrow** — moves focus between segments. Roving tabindex (only the focused segment is `tabindex={0}`; the other is `tabindex={-1}`).
- **Enter / Space** — activates the focused segment (or toggles it off if already active).
- **Escape** — clears the filter (returns to both-inactive). This is the keyboard equivalent of clicking the pill. Defined here even though L8 added no keyboard verbs — `Escape to clear` is an a11y-standard recovery key, not a verb shortcut.
- The clear pill is reachable by **Tab** after the segmented control (it is the next interactive element).

### Hover / focus
- Segments: existing DaisyUI `btn` hover treatments (subtle surface lift on `btn-ghost`; no change on `btn-neutral` active).
- Pill: existing DaisyUI `badge-ghost` hover (slight surface lift). Focus ring is the standard `outline` from `_tokens.css`.

### Motion
- Segment activation: `var(--motion-fast)` (80ms) cross-fade of background + foreground. No layout shift.
- Pill enter / exit: `var(--motion-medium)` (150ms) opacity + 2px translate Y. Honors `prefers-reduced-motion`.

## Mobile adaptation
- At 360px Submenu width:
  - Segmented control: `[ Blocking | Async ]` is two short labels — fits with comfortable breathing room. Each segment ≥ 44 CSS px tall at viewport ≤ 1024 px (touch target rule AQ-015), per density auto-tier to `comfortable`.
  - Clear pill: ~24px tall by ~200px wide. Fits inline easily.
- Sticky Blocking header per L8 §5.6 is unaffected.

## The signature — why this shape
- **Two segments encode "one axis."** A binary segmented control is the universal UI shape for *toggling a single axis between its two values*. The user reads the axis from the geometry (one capsule, two halves) before reading the labels. Three loose chips never communicate this.
- **Maximum density.** One row, one component. The chip row went from 4 buttons + a wrap-risk to 1 joined control.
- **Recovery is one click, always.** The pill is the recovery affordance; the EmptyState stays terse. There is exactly one place to undo a filter, and it's always above the list when a filter is active.

## Trade-offs

### What this is good at
- **Single-axis legibility.** The control's shape encodes the axis; users learn "this is one decision" from geometry alone.
- **Density.** One row, one component. No `flex-wrap` risk at 240px Submenu width.
- **Recovery surface is permanent.** Whether the filter narrowed to many rows or zero, the pill is in the same place. The user doesn't have to find a different button when results go empty.
- **Component-budget win.** Zero new custom components. Reuses DaisyUI `join` + `badge` primitives that exist for exactly this kind of composition.
- **Linear-precedent comfort.** Power users who use Linear, Raycast, or Things 3 already read segmented filters as "pick one of two."

### What this is bad at
- **Toggle-by-clicking-active is a learned interaction.** Users from Gmail/Slack who expect chips will not intuit that clicking the *same* segment twice clears the filter. **Mitigation:** the persistent clear pill is the discoverable recovery — it shows the user "the filter is on, here is the off button," and it works on the first attempt without requiring the user to learn the toggle gesture. The toggle remains as a power-user shortcut once discovered.
- **Doubled action surface.** Two ways to clear the filter (pill click + active-segment click) is, narrowly, more surface than one chip with a single `All` chip would provide. **Defense:** the surfaces serve different mental models — the pill is for "I see the filter is on, undo it," the active-segment toggle is for "I changed my mind on the same control." The cost is real; the offset is that recovery is always visible above the list, not buried back in the chip row.
- **No "All" affordance.** The default-no-filter state is communicated by *both segments looking inactive* rather than by a positively-selected `All` segment. A founder who expects an explicit `All` will look for one and not find it. **Mitigation:** the L8 substrate's *full* list is the visual default; the segmented control is the deviation surface. The Submenu's existing total-count badge in the title bar continues to confirm "you are seeing all N threads" when no filter is active.
- **Vocabulary register.** `Async` is more technical than J2's `Chats`. **Mitigation:** the brief explicitly calls this out as an open question to be answered by mockup; the segmented control's geometry compensates by communicating the axis without relying on the label warmth.

## Anti-aesthetic-AI checks
- **AQ-008 / AQ-009:** uses `var(--surface-*)`, `var(--text-*)`, `var(--danger)` only. No hex outside the token sheet. No pure black.
- **AQ-011:** corners follow the closed radius scale — `var(--r1)` for the joined control, `var(--r-pill)` for the badge.
- **AQ-013:** all motion via `var(--motion-fast|medium)`.
- **AQ-101:** no `rounded-2xl` / `rounded-3xl`. The pill uses `--r-pill` (allowed for pills).
- **AQ-102:** no purple/indigo gradient anywhere — flat surface tokens only.
- **AQ-105:** the `×` glyph is unicode U+00D7, rendered as text — not an emoji.
- **AQ-110:** no marketing copy. Pill copy is `Showing blocking only — clear` (terse, accurate, verb-final).
- **AQ-113:** the segments do not render placeholder icons when no `icon` is provided.

# Variant C — "Layered slots"

**Constraint:** a base layer that always renders (alignment, separator, hover, focus, touch target) + named slots consumers fill (`lead`, `main`, `trailing`). The React children-as-slot pattern.
**Thesis:** the base owns the *chrome*; named slots own the *content*. More structure than A, less prescription than B — slots are nodes, not a data DSL.

## User task
Fill three named slots; the base layer guarantees the row chrome and the list container chrome.

## Shape
```tsx
<ItemList empty={…} loading={…} error={…}>
  <Row
    onClick={…}
    selected={…}
    lead={<RowDot tone="success" />}
    trailing={<><Row.Meta numeric>$240</Row.Meta><Tag label="Strategy" /></>}
  >
    {/* default children = the `main` slot */}
    <Row.Title>Atlas</Row.Title>
    <Row.Subtitle>Reviewing migration plan</Row.Subtitle>
  </Row>
</ItemList>
```
- `Row` base: flex line + chrome. Slots: `lead?` (prop), `children` = main, `trailing?` (prop), `actions?` (prop, flips wrapper).
- `Row.Title`, `Row.Subtitle`, `Row.Meta`, `RowDot` — namespaced sub-components enforcing the three text levels + the dot. `Row.Meta numeric` → tabular-nums.

## Component composition
- `ItemList` — container + empty/loading/error (same as B).
- `Row` — base + slots.
- `Row.Title` (primary), `Row.Subtitle` (tertiary), `Row.Meta` (mono tertiary cell), `RowDot` (status dot).
- Consumers compose `Avatar`/`StatusChip`/`Tag` into slots freely.

## Information hierarchy
Enforced by sub-components: `Row.Title` is the only primary; `Row.Subtitle`/`Row.Meta` are tertiary. Squint test passes because the levels are typed.

## States
Same as B — `ItemList` owns empty/loading/error; `Row selected` owns the selected treatment.

## Behavior
Same chrome as B (hover/focus/keyboard/44px/nested-button auto-wrapper).

## Mobile
`Row.Meta hideBelow={…}` per-cell hide. Slots reflow naturally.

## Signature
**Typed sub-components carry the hierarchy.** A consumer literally cannot put two primary titles in a row or forget tabular-nums on a numeric cell — the sub-component does it. Reads like JSX, not config.

## Trade-offs (bad at)
- Larger surface area (5 exported names: Row, Row.Title, Row.Subtitle, Row.Meta, RowDot). Component-budget cost.
- Compound-component pattern (`Row.Title`) is slightly more "magic" than a flat prop API — boring-technology principle prefers B's plain props. Still well-understood (DaisyUI, Radix use it), but it's more moving parts than the budget wants.
- `trailing` as a free node re-opens the divergence risk that B's `cells: RowCell[]` closes.

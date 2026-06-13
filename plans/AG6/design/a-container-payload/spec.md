# Variant A — "Container with payload"

**Constraint:** the primitive is a thin container; the payload (children) does the work. Minimal API surface.
**Thesis:** alignment, separator, hover, focus, touch-target are the *only* things every list shares — own exactly those and nothing else.

## User task
Compose any list row by dropping arbitrary children into a `Row`; wrap rows in an `ItemList` that owns separators + container chrome.

## Shape
```tsx
<ItemList>            // owns rounded-subtle + bg-surface-container + p-[12px] + empty/loading/error
  <Row onClick={…}>   // owns flex/align/gap, hover, focus ring, 44px min-h, separator
    {/* consumer freely arranges children */}
    <span className="dot…" />
    <Avatar … />
    <span className="flex-1 truncate">Atlas</span>
    <span className="mono tertiary">2d ago</span>
    <button>Customize</button>
  </Row>
</ItemList>
```
`Row` renders one flex line. Consumer supplies *all* content as children. `Row` injects: `flex items-center gap-[12px]`, `min-h-[44px]`, hover `bg-[rgba(44,36,26,0.02)]`, focus-visible ring, separator (`border-b border-subtle last:border-b-0`), and the correct wrapper element.

## Component composition
- `ItemList` — wrapper. Props: `children`, optional `empty` / `loading` / `error` render via `EmptyState` / `SkeletonList` / `ErrorState`. Owns container surface.
- `Row` — flex line. Props: `onClick?`, `selected?`, `hasInnerActions?` (picks `div role=button` vs `<button>`), `children`.
- Inside: consumer uses `Avatar`, `StatusChip`, `Tag` directly.

## Information hierarchy
1. Title — consumer marks it `flex-1 truncate` (NOT enforced).
2. Meta — consumer styles trailing cells.
3. Indicator/actions — consumer places.

## States
- Populated: rows.
- Empty/Loading/Error: `ItemList` switches to companion when given the flag.

## Behavior
Hover, focus ring, 44px target, keyboard (Enter/Space) — all on `Row`. Nested-button: `hasInnerActions` flag flips wrapper.

## Mobile
Same row; consumer responsible for hiding cells at narrow widths.

## Signature
**Maximum freedom, minimum enforcement.** `Row` is ~30 lines.

## Trade-offs (bad at)
- Does NOT enforce hierarchy, cell alignment, mono/tabular meta, or which child is the title. Two consumers will still diverge on column widths and text scale — the exact bug AG6 exists to kill. Consistency depends on consumer discipline, which is what failed today.
- AQ-006 tabular-nums, AQ-113 (icon optional, no placeholder) not enforceable.
- "Adding a new list requires composing the primitive" → true, but the row's *internals* are still hand-rolled per call site. Weak on AC-4.

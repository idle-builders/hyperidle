# Variant B — "Self-contained block (column-config)"

**Constraint:** the primitive owns its layout, states, alignment, and meta-cell styling. Consumers parameterise via a typed column model; they don't recompose internals.
**Thesis:** consistency comes from the primitive controlling the anatomy. A consumer describes *what* a row contains (lead, title, subtitle, cells, actions); the primitive decides *how* it looks. This is the AG6 mandate taken literally — "a thin column config, not a hand-rolled row."

## User task
Render any list by giving `ItemList` an array of typed `Row` descriptors. The primitive guarantees identical alignment, hairline separators, hover, focus, 44px target, mono/tabular trailing cells.

## Shape — the row model
```ts
interface RowCell {            // a fixed-width trailing meta cell
  content: ReactNode;          // string or node
  width?: number;              // px; default auto
  align?: "start" | "end";     // default "end"
  numeric?: boolean;           // → tabular-nums (AQ-006)
  tone?: "default" | "tertiary" | "success" | "warning" | "error";
}
interface RowProps {
  lead?: ReactNode;            // status dot | Avatar | icon circle — null renders NO placeholder (AQ-113)
  title: ReactNode;            // primary, flex-1, truncate — REQUIRED
  subtitle?: ReactNode;        // secondary line under title, truncate
  cells?: RowCell[];           // trailing meta cells, fixed-width, mono tertiary
  actions?: ReactNode;         // trailing buttons; presence flips wrapper to div role=button
  onClick?: () => void;
  selected?: boolean;
  "data-testid"?: string;
}
```
`Row` lays out: `[lead?] [title+subtitle: flex-1 min-w-0] [cells: shrink-0 mono] [actions: shrink-0]`. The primitive owns padding, gap, separator, hover, focus, touch target, and applies `tabular-nums` to `numeric` cells. `lead` omitted → no spacer, no placeholder.

## Component composition
- `ItemList` — owns `rounded-subtle bg-surface-container` container, separators between rows, and `empty`/`loading`/`error` states (renders `EmptyState`/`SkeletonList`/`ErrorState`). Renders `Row[]` from a `rows` prop OR `children` of `<Row>`.
- `Row` — the self-contained line above.
- `RowDot` — tiny exported helper for the 6px status dot (5+ consumers). `tone` → color.
- Inside cells/lead, consumers still pass `Avatar`, `StatusChip`, `Tag`.

## Information hierarchy
1. **Title** — `text-[13–15px]`, primary, weight 500, `flex-1 truncate`. One per row.
2. **Subtitle** — `text-[12–13px]` tertiary, truncate.
3. **Cells** — `text-[11–12px]` mono tertiary, fixed-width, right-aligned, tabular when numeric.
4. **Lead / actions** — flank, never shrink.

## States (owned by ItemList)
- **Populated:** rows with hairline separators, last has none.
- **Empty:** `EmptyState` (title + description), centered in container.
- **Loading:** `SkeletonList rows={n}` matching row height.
- **Error:** `ErrorState` (title + description + retry).
- **Selected row:** `aria-current` + elevated bg + left accent border (ThreadRow's `selected` treatment generalized).

## Behavior
- Hover `bg-[rgba(44,36,26,0.02)]`, `--motion-fast`.
- Focus-visible: 1px accent outline, `-outline-offset-1`.
- Keyboard: row activates on Enter/Space when `onClick`.
- **Nested-button (HARD):** if `actions` is present, wrapper = `div role="button"` + tabIndex + onKeyDown; else `<button>`. Primitive decides — consumer can't get it wrong.
- Touch target: `min-h-[44px]` always (AQ-015).

## Mobile
`ItemList` accepts `hideCellsBelow?: number` — cells with `width` collapse at narrow viewports; title + lead + actions persist. Default: cells stay (desktop-first), but the prop exists for mobile tabs.

## Signature
**You describe a row as data; the primitive renders it identically every time.** Column widths, mono meta, tabular numerals, separators, touch target — all centralized. Adding a list = writing a `RowCell[]` config.

## Trade-offs (bad at)
- Heavier API than A. A genuinely odd row (ThreadRow's overlapping avatar group + presence dots + host pill + count badge) doesn't map cleanly to `lead/title/cells` — it would need an escape hatch or stay distinct.
- `cells: RowCell[]` is a small DSL; risk of consumers overusing `content: <complex node>` and re-diverging. Mitigated by keeping cells deliberately dumb (mono tertiary only).

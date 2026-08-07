# `design/require-ds-attribute`

**Severity (K6):** `warn`.
**Maps to:** K2 marker contract (`framework/design-system/src/ds-attrs.ts`).

## Why

Every Tier 1+2 design-system component must mark its outermost JSX element
with `data-ds-component`, `data-ds-tier`, `data-ds-source`. This contract
powers the K4 inspector, the K6 visual reports, and the visual-regression
sync check. The recommended way is to spread `dsProps("Name", "1" | "2")`
or `dsShellProps("Name")` (Tier 3 shells).

This rule fires only inside `framework/design-system/src/*.tsx` (a one-level
glob that matches the design-system primitive files; deeper nested
sub-files are not Tier 1+2 surfaces).

## Incorrect

```tsx
// framework/design-system/src/Foo.tsx
export default function Foo() {
  return <div>{/* ... */}</div>;       // outermost JSX is unmarked
}
```

## Correct

```tsx
// framework/design-system/src/Foo.tsx
import { dsProps } from "./ds-attrs";

export default function Foo() {
  return <div {...dsProps("Foo", "1")}>{/* ... */}</div>;
}
```

## Cross-link

See `framework/design-system/src/ds-attrs.ts` for the marker helper, and
`docs/work-packages/TRACK-K.md` § K2 for the full contract.

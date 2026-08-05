# `design/require-stories-sibling`

**Severity (K6):** `warn` (intentionally noisy at first; opt out per-file).
**Maps to:** `.claude/rules/design-system.md` — "Every custom component must have a `.stories.tsx` file".

## Why

Stories are the single demonstrable artifact for a component. Every component
file under `framework/design-system/src/` and `layers/web/src/components/`
must have a sibling `<Name>.stories.tsx`. The story is the design artifact
rendered by the pipeline design-review tooling and covered by the catalog
DOM-snapshot net (`framework/design-system/src/__tests__/catalog-snapshot.test.tsx`).

## Opt-out

If a file genuinely has no story representation (e.g. an internal helper
component or a barrel-only re-export wrapper), add a top-of-file directive:

```tsx
// design-lint-disable require-stories-sibling
export const Internal = () => null;
```

## Incorrect

`framework/design-system/src/Foo.tsx` exists; `Foo.stories.tsx` does not.

## Correct

`framework/design-system/src/Foo.tsx` AND `framework/design-system/src/Foo.stories.tsx` both exist.

## Cross-link

See `.claude/rules/design-system.md` for the full design-system contract.

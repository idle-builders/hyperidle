# `design/require-stories-sibling`

**Severity (K6):** `warn` (intentionally noisy at first; opt out per-file).
**Maps to:** `.claude/rules/design-system.md` — "Every custom component must have a `.stories.tsx` file".

## Why

Stories are the single demonstrable artifact for a component. Every component
file under `packages/design-system/src/` and `packages/web/src/components/`
must have a sibling `<Name>.stories.tsx`. The stories are the design artifact
discovered and rendered by the design-review viewer.

## Opt-out

If a file genuinely has no story representation (e.g. an internal helper
component or a barrel-only re-export wrapper), add a top-of-file directive:

```tsx
// design-lint-disable require-stories-sibling
export const Internal = () => null;
```

## Incorrect

`packages/design-system/src/Foo.tsx` exists; `Foo.stories.tsx` does not.

## Correct

`packages/design-system/src/Foo.tsx` AND `packages/design-system/src/Foo.stories.tsx` both exist.

## Cross-link

See `.claude/rules/design-system.md` for the full design-system contract.

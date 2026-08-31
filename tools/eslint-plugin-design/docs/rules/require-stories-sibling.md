# `design/require-stories-sibling`

**Severity (K6):** `warn` (intentionally noisy at first; opt out per-file).
**Maps to:** `.claude/rules/design-system.md` — "Every custom component must have a `.stories.tsx` file".

## Why

Stories are the single demonstrable artifact for a component. Every component
file under the directories in `TARGET_DIRS`
must have a sibling `<Name>.stories.tsx`. The story is the design artifact
rendered by the pipeline design-review tooling and covered by the catalog
design review that renders the story.

## Opt-out

If a file genuinely has no story representation (e.g. an internal helper
component or a barrel-only re-export wrapper), add a top-of-file directive:

```tsx
// design-lint-disable require-stories-sibling
export const Internal = () => null;
```

## Incorrect

`layers/core-ui/src/components/Foo.tsx` exists; `Foo.stories.tsx` does not.

## Correct

`layers/core-ui/src/components/Foo.tsx` AND `layers/core-ui/src/components/Foo.stories.tsx` both exist.

## Cross-link

See `.claude/rules/design-system.md` for the full design-system contract.

## Known gap

`TARGET_DIRS` is `framework/design-system/src/` (deleted) and `layers/core-ui/src/components/`. It does
not include `layers/core-ui/src/ds/`, where the design system now lives, so the rule does not enforce a
story for any of those components — 18 of 74 have none. Correcting the target directories is a
deliberate change: it surfaces those 18 at once.

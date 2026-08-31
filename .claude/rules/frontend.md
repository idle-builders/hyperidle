---
paths:
  - "layers/core-ui/**/*.tsx"
  - "layers/core-ui/**/*.ts"
---

# Frontend

- **Design-system components first.** The live inventory is `layers/core-ui/src/ds/index.ts` — read it
  before writing a component. Use DaisyUI primitives directly only where the design system
  deliberately does not own the shape; never wrap them, never hand-roll an equivalent of something
  that already exists.
- **Spacing** uses the numeric vocabulary `{0, 3, 6, 9, 12, 18, 24, 36, 48}` px, spelled as a
  `--space-*` token or a supported Tailwind alias. Card padding `--space-6` (18px); small element
  padding `--space-4` (12px).
- **States.** A shipping implementation handles empty, loading, error and populated. A *design* does
  not: an initial design renders the populated real state only — no skeletons, no error variants
  invented before the real one is agreed.
- **Never fabricate the data.** An empty list renders an honest empty state, never sample rows.
- **Routes.** Each layer hosts its own Hono app and owns its routes under `<layer>/src/routes/`.
  RESTful naming, consistent error shape. Read the existing routes in that layer before adding one.
- **Every custom component has a `.stories.tsx`** next to it rendering its key states.
- **Avoid the AI aesthetic** — no arbitrary purple/indigo palettes, no gradient chrome, no oversized
  `p-8`/`p-12` padding, no stock 3-column card grids, no hero sections in the work pages, no
  decorative icon on every element. Note 16px IS the default card radius — do not avoid it, but spell
  it `rounded-[var(--r-default)]`, never `rounded-2xl`. The full catalogue and what the linter
  actually blocks: `.claude/rules/aesthetic-quality.md`.
- **Palette.** Crème Lemon on Hearth geometry: warm lemon-cream surfaces, lemon-drop fill accent
  (`--accent-primary`), cocoa text accent (`--accent-deep`), system fonts. No forest green — the earlier palette
  is gone. Dense, purposeful, distinctive.

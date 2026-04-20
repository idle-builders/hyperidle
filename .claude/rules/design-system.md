---
paths:
  - "packages/web/src/components/*.stories.tsx"
  - "packages/web/src/shell/*.stories.tsx"
  - "packages/web/src/designsystem/**"
---

# Design System

Story format: default export `{ title: "Name" }`, named exports are React components each rendering one variant. Auto-discovered via `import.meta.glob` from `components/` and `shell/` — drop a `.stories.tsx` next to the component and it appears at `/designsystem`.

The design system catalogs **reusable components only** (Tier 1 primitives, Tier 2 blocks, Tier 3 regions). Pages and layouts are full compositions — they are tested via Playwright E2E, not the design system.

Every custom component must have a `.stories.tsx` file. Stories are a required deliverable, not optional documentation.

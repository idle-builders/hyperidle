---
paths:
  - "packages/design-system/src/**"
  - "packages/design-system/html/**"
  - "packages/web/src/shell/*.stories.tsx"
  - "packages/web/src/designsystem/**"
---

# Design System

Components live in `packages/design-system` (Tier 1 primitives + Tier 2 blocks). Shell/region components (Tier 3) stay in `packages/web/src/shell/`.

**Dual representation:** Each component has a `.tsx` (production, Tailwind) and `.html` (Claude Design editable, plain CSS + CDN React). The `.html` files are self-contained and served on `:8098` via `bun run ds:serve`.

**Story format:** default export `{ title: "Name" }`, named exports are React components each rendering one variant. Auto-discovered via `import.meta.glob` — stories in `packages/design-system/src/`, `packages/web/src/components/`, and `packages/web/src/shell/` all appear at `/designsystem`.

**Data attributes on HTML components:** `data-component`, `data-tier`, `data-uses`, `data-daisyui`, `data-used-by` on outermost element. Inner sub-components also carry `data-component` + `data-tier`.

**Token source of truth:** `packages/design-system/DESIGN.md` and `packages/design-system/src/tokens.css`.

**Sync check:** `bun run ds:sync` compares HTML vs TSX rendering via Playwright + pixelmatch.

Every custom component must have a `.stories.tsx` file. Stories are a required deliverable, not optional documentation.

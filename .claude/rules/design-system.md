---
paths:
  - "packages/design-system/src/**"
  - "packages/design-system/html/**"
  - "packages/web/src/shell/*.stories.tsx"
  - "packages/web/src/designsystem/**"
---

# Design System

Components live in `packages/design-system` (Tier 1 primitives + Tier 2 blocks). Shell/region components (Tier 3) stay in `packages/web/src/shell/`.

**Dual representation:** Each component has a `.tsx` (production, Tailwind) and `.html` (Claude Design editable, plain CSS + CDN React). The `.html` files are self-contained and served on `:8098` via `npm run ds:serve`.

**Story format:** default export `{ title: "Name" }`, named exports are React components each rendering one variant. Auto-discovered via `import.meta.glob` — stories in `packages/design-system/src/`, `packages/web/src/components/`, and `packages/web/src/shell/` all appear at `/designsystem`.

**Data attributes on HTML components:** `data-component`, `data-tier`, `data-uses`, `data-daisyui`, `data-used-by` on outermost element. Inner sub-components also carry `data-component` + `data-tier`.

**Token source of truth:** `packages/design-system/DESIGN.md` and `packages/design-system/src/tokens.css`.

**Design principles:** `packages/design-system/PRINCIPLES.md` — seven universals + surprise principles from world-class design systems.

**Theme variants:** Two theme modes: Lucid Dark + Lucid Light, in `html/themes/` (`lucid-dark.css`, `lucid-light.css`). See `THEMES.md`. All HTML component pages have a theme switcher in the top-right corner.

**Design critique:** runs in-session inside `/design` (Phase 2) — evaluates components on 9 dimensions (hierarchy, spacing, typography, color, coherence, states, a11y, anti-slop, premium polish) with a 0-10 score. The previously separate `/design-critique` skill was collapsed into `/design` in block-1b.

**Visual feedback:** Three options for giving Claude browser-based visual feedback — see `FEEDBACK.md`. Bookmarklet at `http://localhost:8098/feedback.js`, Vibe Annotations (Chrome extension + MCP), or MCP Pointer.

**Sync check:** `npm run ds:sync` compares HTML vs TSX rendering via Playwright + pixelmatch.

Every custom component must have a `.stories.tsx` file. Stories are a required deliverable, not optional documentation.

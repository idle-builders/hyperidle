---
paths:
  - "packages/design-system/src/**"
  - "packages/web/src/shell/*.stories.tsx"
  - "packages/web/src/designsystem/**"
---

# Design System

Components live in `packages/design-system` (Tier 1 primitives + Tier 2 blocks). Shell/region components (Tier 3) stay in `packages/web/src/shell/`.

**Single source of truth:** Each component has exactly one `.tsx` (production, Tailwind). TSX is the design source of truth — there are no `.html` reference files. The `.tsx` story IS the design artifact. (AJ1 inverted HTML-as-truth; the `html/` tree was deleted.)

**Story format:** default export `{ title: "Name" }`, named exports are React components each rendering one variant. Auto-discovered via `import.meta.glob` — stories in `packages/design-system/src/`, `packages/web/src/components/`, and `packages/web/src/shell/` all appear in the viewer at `:8098`.

**Data attributes on components:** `data-ds-component`, `data-ds-shell` (Tier 3 shells use `data-ds-shell` instead of `data-ds-component`), `data-tier`, `data-uses`, `data-daisyui`, `data-used-by` on outermost element. Inner sub-components also carry `data-ds-component` + `data-tier`.

**Token source of truth:** `packages/design-system/DESIGN.md` and `packages/design-system/src/tokens.css`.

**Design principles:** `packages/design-system/PRINCIPLES.md` — seven universals + surprise principles from world-class design systems.

**Theme variants:** Two theme modes: Hearth Dark + Hearth Light. Theme tokens live in `packages/design-system/src/tokens.css`. The viewer at `:8098` has a Dark/Light toggle in the toolbar. Hearth is light-first: default is `hearth-light`.

**Design critique:** runs in-session inside `/design` (Phase 2) — evaluates components on 9 dimensions (hierarchy, spacing, typography, color, coherence, states, a11y, anti-slop, premium polish) with a 0-10 score. The previously separate `/design-critique` skill was collapsed into `/design` in block-1b.

**Visual feedback:** The live TSX viewer at `:8098` is the primary feedback surface. Run `npm run ds:serve` to start it. The **first-party annotation overlay** (AJ5) is now the primary feedback tool — it lives in the bottom-left corner of every component page in the viewer. Click "Select", click an element, write a note, Save. Notes land in `.annotations/annotations.json` (canonical) and `.annotations/annotations.md` (agent-readable). "New iteration" starts a new review round. Fallback: bookmarklet at `http://localhost:8098/feedback.js`, Vibe Annotations (Chrome extension + MCP), or MCP Pointer.

**Visual regression gate:** The vitest DOM-snapshot net (`packages/design-system/src/__tests__/catalog-snapshot.test.tsx`, runs in `npm run test`) renders every catalogued story and snapshots normalized DOM+class text. An intended component change → review the text diff → re-bless with `vitest -u` (or `npm run ds:bless`). See `.claude/rules/visual-regression.md`.

Every custom component must have a `.stories.tsx` file. Stories are a required deliverable, not optional documentation.

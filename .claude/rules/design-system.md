---
paths:
  - "packages/design-system/src/**"
  - "packages/web/src/shell/*.stories.tsx"
  - "packages/web/src/designsystem/**"
---

# Design System

Components live in `packages/design-system` (Foundation/Primitives/Blocks). Shell/region components stay in `packages/web/src/shell/`.

**Single source of truth:** Each component has exactly one `.tsx` (production, Tailwind). TSX is the design source of truth — there are no `.html` reference files. The `.tsx` story IS the design artifact. (AJ1 inverted HTML-as-truth; the `html/` tree was deleted.)

**Story format:** default export `{ title: "Name", group?: GroupName }`, named exports are React components each rendering one variant. `group` is optional — most stories are classified automatically from their path; use it only for area-less page stories that have no folder signal (e.g. `group: "Work"`). Auto-discovered via `import.meta.glob` — stories in `packages/design-system/src/` (including `src/kinds/`), `packages/web/src/components/`, `packages/web/src/shell/`, `packages/web/src/pages/` (flat + nested), `packages/web/src/settings/`, and `packages/web/src/layouts/` all appear in the viewer at `:8098`.

**Catalog groups (AJ6):** the viewer organizes stories into two axes — **Tier groups** (Foundation, Primitives, Blocks — domain-agnostic reuse vocabulary) then **Domain groups** (Work, Knowledge, Conversations, Artifacts, Settings, System — product areas). Classification is derived from the story's source path; the central `DS_COMPONENT_GROUPS` registry in `discovery.ts` handles the flat `design-system/src/` root where path carries no axis signal. A `group` field in the story's default export is the escape hatch for area-less stories that can't be derived from path or title. See `packages/design-system/viewer/discovery.ts`.

**Data attributes on components:** `data-ds-component`, `data-ds-shell` (shell components use `data-ds-shell` instead of `data-ds-component`), `data-ds-tier`, `data-uses`, `data-daisyui`, `data-used-by` on outermost element. Inner sub-components also carry `data-ds-component` + `data-ds-tier`. These DOM markers are a separate component-identity concern from catalog grouping — they drive the AJ5 annotation overlay and the visual regression snapshot net.

**Token source of truth:** `packages/design-system/DESIGN.md` and `packages/design-system/src/tokens.css`.

**Design principles:** `packages/design-system/PRINCIPLES.md` — seven universals + surprise principles from world-class design systems.

**Theme variants:** Two theme modes: Hearth Dark + Hearth Light. Theme tokens live in `packages/design-system/src/tokens.css`. The viewer at `:8098` has a Dark/Light toggle in the toolbar. Hearth is light-first: default is `hearth-light`.

**Design critique:** runs in-session inside `/design` (Phase 2) — evaluates components on 9 dimensions (hierarchy, spacing, typography, color, coherence, states, a11y, anti-slop, premium polish) with a 0-10 score. The previously separate `/design-critique` skill was collapsed into `/design` in block-1b.

**Visual feedback:** The live TSX viewer at `:8098` is the primary feedback surface. Run `npm run ds:serve` to start it. The **first-party annotation overlay** (AJ7 devtools-style inspector) is the primary feedback tool — a rail docked at the right edge of every component page. Click "Inspect", hover the canvas (each element highlights with a tracked overlay box), click to select, refine via the ancestor breadcrumb, write a note, Save (`Cmd/Ctrl+Enter`). Saved notes list in the rail; hover a note row to re-highlight its element. Notes land in `.annotations/annotations.json` (canonical, rounds + per-note anchors) and `.annotations/annotations.md` (agent-readable). "New iteration" starts a new review round. The inspector never mutates the inspected DOM and never ships in a production bundle. Fallback: bookmarklet at `http://localhost:8098/feedback.js`, Vibe Annotations (Chrome extension + MCP), or MCP Pointer.

**Visual regression gate:** The vitest DOM-snapshot net (`packages/design-system/src/__tests__/catalog-snapshot.test.tsx`, runs in `npm run test`) renders every catalogued story and snapshots normalized DOM+class text. An intended component change → review the text diff → re-bless with `vitest -u` (or `npm run ds:bless`). See `.claude/rules/visual-regression.md`.

Every custom component must have a `.stories.tsx` file. Stories are a required deliverable, not optional documentation.

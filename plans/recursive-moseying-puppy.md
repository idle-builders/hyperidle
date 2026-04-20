# Plan: Extract Design System to `packages/design-system`

## Context

The UI components loosely resemble the Claude Design mockups in `docs/concept/design-synthesis/` but have never been pixel-compared or aesthetically refined. To close this gap, we need Claude Design to redesign each component — but Claude Design works with HTML files, not TSX.

The plan: extract the design system into its own package with dual representations (.tsx for production, .html for Claude Design), a canonical DESIGN.md for tokens, and sync tooling to detect drift between the two.

---

## What Moves vs What Stays

**Moves to `packages/design-system/src/`:**
- 5 Tier 1 primitives: `StatusChip`, `Tag`, `KeyValue`, `NavItem`, `SearchField`
- 6 Tier 2 blocks: `ThreadRow`, `BetCard`, `PitchCard`, `TaskCard`, `KnowledgeRow`, `NotificationRow`
- 3 utility components: `EmptyState`, `ErrorState`, `Skeleton`
- Support modules: `clickable.ts`, `status-mapping.ts`, `tag-kinds.tsx`
- Co-located `.stories.tsx` files (move with their component)
- Design tokens (extracted from `packages/web/src/index.css`)

**Stays in `packages/web/`:**
- 8 Tier 3 shell/region components (IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector) — app-specific compositions
- DesignSystem page (`src/designsystem/`) — catalog viewer (rewired to import from new package)
- ErrorBoundary, SettingsPanel, GlobalSearchPanel, ReasoningBlock, CurationSuggestionCard, KnowledgeTopicGroup, ThreadSections — app-specific, not design primitives
- Pages, layouts, router, hooks

**Dependency direction:** `packages/web` → `@hyperidle/design-system` → `@hyperidle/shared`

---

## Phase 1: Scaffold Package

### 1.1 Create package structure

```
packages/design-system/
  package.json          (@hyperidle/design-system)
  tsconfig.json         (extends root, references shared)
  DESIGN.md             (token documentation)
  src/
    index.ts            (barrel export)
    tokens.css          (CSS custom properties)
  html/
    _tokens.css         (self-contained CSS for HTML files)
    _catalog.html       (index page)
  scripts/
    serve.ts            (Bun static file server on :8098)
    sync-check.ts       (pixelmatch HTML vs TSX drift detection)
    sync-map.ts         (component → URL mapping)
```

### 1.2 package.json

```json
{
  "name": "@hyperidle/design-system",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./src/tokens.css"
  },
  "scripts": {
    "check": "tsc --noEmit",
    "serve": "bun run scripts/serve.ts",
    "sync-check": "bun run scripts/sync-check.ts"
  },
  "dependencies": {
    "@hyperidle/shared": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

### 1.3 tsconfig.json

Extends root. Adds `"jsx": "react-jsx"`. References `../shared`.

### 1.4 Root config updates

- `tsconfig.json`: Add path `"@hyperidle/design-system": ["./packages/design-system/src"]` and reference `{ "path": "packages/design-system" }`
- Workspaces already cover `packages/*` — no change needed

---

## Phase 2: DESIGN.md + Tokens

### 2.1 Write DESIGN.md

Single authoritative document covering:

- **Color** — Surface palette (--surface-0..6, --surface-ghost), accent colors (primary #adc6ff, warn #d58f24, ok #bbffb3, danger #ee7d77), text levels (hi/mid/lo)
- **Typography** — Inter (UI: 400/500/600), Space Grotesk (data/mono: 400/500). Size scale: 11/12/13/14/18/24px
- **Spacing** — 4px baseline grid. Density presets (default/compact/comfortable) with pad-x, pad-y, gap, row-h, text values
- **Radii** — 0/2px/4px/8px/999px (pill). Buttons: 2px. Cards: 4px
- **Motion** — fast 120ms, medium 200ms, slow 320ms. Single ease curve
- **Shadows** — Float only: `0 0 32px rgba(173,198,255,0.08)`
- **Grid** — Shell: 48px (IconRail) | 240px (Submenu) | 1fr (Main) | auto (Rail 56px/360px)

### 2.2 Create `src/tokens.css`

Extract the `:root` and `[data-density]` blocks from `packages/web/src/index.css`. Add the missing tokens from the reference (--primary-dim, --primary-hover, --float, radius vars). Also keep the tag-tint component classes.

### 2.3 Create `html/_tokens.css`

Same variables as `src/tokens.css` plus:
- Box-sizing reset
- Body styles (background, color, font-family)
- Font imports (Inter, Space Grotesk via Google Fonts)

This makes each .html file self-contained when it `<link>`s `_tokens.css`.

### 2.4 Update `packages/web/src/index.css`

Replace token definitions with: `@import "@hyperidle/design-system/tokens.css";`
Keep only the `@tailwind` directives and any web-app-specific styles.

---

## Phase 3: Move Components

### 3.1 Move files

Move these from `packages/web/src/components/` to `packages/design-system/src/`:

| File | Type |
|------|------|
| StatusChip.tsx + .stories.tsx | Tier 1 |
| Tag.tsx + .stories.tsx | Tier 1 |
| KeyValue.tsx + .stories.tsx | Tier 1 |
| NavItem.tsx + .stories.tsx | Tier 1 |
| SearchField.tsx + .stories.tsx | Tier 1 |
| ThreadRow.tsx + .stories.tsx | Tier 2 |
| BetCard.tsx + .stories.tsx | Tier 2 |
| PitchCard.tsx + .stories.tsx | Tier 2 |
| TaskCard.tsx + .stories.tsx | Tier 2 |
| KnowledgeRow.tsx + .stories.tsx | Tier 2 |
| NotificationRow.tsx + .stories.tsx | Tier 2 |
| EmptyState.tsx + .stories.tsx | Utility |
| ErrorState.tsx + .stories.tsx | Utility |
| Skeleton.tsx + .stories.tsx | Utility |
| clickable.ts | Support |
| status-mapping.ts | Support |
| tag-kinds.tsx | Support |

### 3.2 Create barrel export `src/index.ts`

Export all components, their Props types, the Status type, TagKind, clickableProps, and status mapping functions.

### 3.3 Update `packages/web`

- Add `"@hyperidle/design-system": "workspace:*"` to package.json dependencies
- Add tsconfig reference to `../design-system`
- Rewrite all imports in `packages/web/src/` that referenced moved files:
  - `from "../components/StatusChip"` → `from "@hyperidle/design-system"`
  - `from "../components/clickable"` → `from "@hyperidle/design-system"`
  - etc.
- Shell components (Rail, Submenu, Canvas, Kanban, etc.) all import from `../components/` — these all change to `@hyperidle/design-system`

### 3.4 Rewire DesignSystem catalog

Update `packages/web/src/designsystem/DesignSystem.tsx`:
- Change `import.meta.glob("../components/*.stories.tsx")` → glob from `../../../design-system/src/*.stories.tsx` (or add a Vite resolve alias)
- Keep the shell story glob as-is (shell stays in web)

### 3.5 Update Tailwind content paths

In `packages/web/tailwind.config.ts`, add `"../design-system/src/**/*.{ts,tsx}"` to the content array so Tailwind scans the new package for class names.

---

## Phase 4: HTML Component Files

### 4.1 Template

Each .html file follows the Claude Design reference pattern:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{ComponentName} — HyperIdle Design System</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="_tokens.css" />
  <style>/* component-specific CSS */</style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
  <script type="text/babel">
    // Component + all variants rendered in a grid
    ReactDOM.createRoot(document.getElementById('root')).render(<Demo />);
  </script>
</body>
</html>
```

### 4.2 Component composition metadata via data attributes

Composition metadata lives directly on DOM elements using `data-*` attributes — visible in the inspector, no hidden JSON blocks. Every component's outermost element carries:

```html
<!-- The component wrapper -->
<div data-component="BetCard" data-tier="2" data-uses="StatusChip,Tag,KeyValue" data-daisyui="badge" data-used-by="Canvas">
  <!-- Inner sub-components also tagged at their root -->
  <span data-component="StatusChip" data-tier="1" data-daisyui="badge">...</span>
  <span data-component="Tag" data-tier="1">...</span>
  <div data-component="KeyValue" data-tier="1">...</div>
</div>
```

Attributes:
- `data-component` — component name (PascalCase, matches .tsx export)
- `data-tier` — 1 (primitive), 2 (block), or 3 (region)
- `data-uses` — comma-separated design system components this one consumes
- `data-daisyui` — comma-separated DaisyUI classes/components the TSX version uses
- `data-used-by` — comma-separated higher-tier consumers

This makes the composition tree directly inspectable in DevTools. Claude Design sees exactly which pieces are primitives vs blocks vs raw HTML when editing any component.

### 4.3 Create 14 component .html files

Each renders all variants/states matching what the .stories.tsx shows. Uses plain CSS classes (not Tailwind) — this is what Claude Design edits. Each includes the composition metadata block from 4.2.

### 4.4 Create `_catalog.html`

Index page with links to each component, organized by tier. Shows the composition graph (which components use which) derived from the metadata blocks. Simple grid layout.

---

## Phase 5: Display Server + Sync Check

### 5.1 `scripts/serve.ts`

Minimal Bun HTTP server on :8098 serving `packages/design-system/html/`. Root serves `_catalog.html`.

### 5.2 `scripts/sync-map.ts`

Array mapping each component to:
- `htmlUrl`: path on :8098 (e.g., `/StatusChip.html`)
- `storyHash`: path on :5173 (e.g., `/designsystem#StatusChip`)

### 5.3 `scripts/sync-check.ts`

Reuses the Playwright + pixelmatch pattern from `packages/web/scripts/visual-compare.ts`:
1. Start display server on :8098
2. For each component: screenshot .html on :8098, screenshot story on :5173
3. Pixelmatch diff → `sync-reports/<name>/html.png`, `tsx.png`, `diff.png`, `report.json`

### 5.4 Root scripts

Add to root package.json:
- `"ds:serve": "bun --filter @hyperidle/design-system serve"`
- `"ds:sync": "bun --filter @hyperidle/design-system sync-check"`

---

## Phase 6: Validation

1. `bun run check` — zero type errors across all packages
2. `bun run lint` — zero lint errors
3. `bun run test` — all existing tests pass
4. `bun dev` — app loads, navigate to `/designsystem`, verify all components render
5. `bun run visual:compare all` — existing visual comparison still works (not broken by the move)
6. `bun run ds:serve` — HTML catalog loads on :8098, each component renders correctly

---

## Critical Files

| Purpose | Path |
|---------|------|
| Token source (current) | `packages/web/src/index.css` |
| Tailwind config | `packages/web/tailwind.config.ts` |
| Design catalog | `packages/web/src/designsystem/DesignSystem.tsx` |
| Root tsconfig | `tsconfig.json` |
| Reference CSS | `docs/concept/design-synthesis/styles.css` |
| Reference components | `docs/concept/design-synthesis/components.jsx` |
| Visual compare pattern | `packages/web/scripts/visual-compare.ts` |
| Component with most deps | `packages/web/src/components/BetCard.tsx` |
| Shell importing components | `packages/web/src/shell/Rail.tsx` |

---

## Implementation Order

1. **Phase 1** (scaffold) — purely additive, no breakage
2. **Phase 2** (tokens) — extract tokens.css, update web's index.css import
3. **Phase 3** (move components) — big bang: move all files + update all imports in one commit. Run `bun run check && bun run test` immediately after
4. **Phase 4** (HTML files) — independent of phases 1-3 completion
5. **Phase 5** (server + sync) — depends on phases 3+4
6. **Phase 6** (validation) — final verification pass

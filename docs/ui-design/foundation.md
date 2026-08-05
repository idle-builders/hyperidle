# Foundation

The UI stack and theme authority. Token *values* live in code — this doc owns only the stack facts and the theme names.

## Stack

- **Tailwind CSS 4 + DaisyUI 5** (`packages/web/package.json` — `tailwindcss ^4.3.1`, `daisyui ^5.6.3`, `@tailwindcss/vite`).
- **Behavior gaps**: `focus-trap-react` (focus trap in modals), `@floating-ui/dom` (collision-aware positioning), `tippy.js`.
- **Editor**: Tiptap 3 suite (+ `tiptap-markdown`, `lowlight`), `dompurify` for sanitization.
- **Routing**: `react-router-dom`.

## Themes

Two DaisyUI 5 themes, defined as `@plugin "daisyui/theme"` blocks in `packages/web/src/index.css`:

- **`hearth-light`** — default (`default: true`)
- **`hearth-dark`** — dark (`prefersdark: true`)

Theme preference (`light | dark | system`) persists in `localStorage["hyperidle-theme"]` and resolves to `data-theme="hearth-light" / "hearth-dark"` on `<html>` (`packages/web/src/hooks/useTheme.ts`). `system` follows `prefers-color-scheme` at runtime without a reload; a boot script in `index.html` paints the initial theme before React mounts.

Theme wiring facts (values stay in code): surfaces map to `--color-base-100/200/300`; semantic colors via `--color-primary/secondary/accent/info/success/warning/error`; radius `--radius-box` / `--radius-field` = 16px, `--radius-selector` = 9999px.

## Tokens

**Canonical sources:** `packages/design-system/DESIGN.md` (full reference) and `packages/design-system/src/tokens.css` (implementation). Never duplicate token values in docs — read them there.

`packages/design-system/src/Tokens.stories.tsx` renders live token values (colors, spacing, radius, type scale, motion, shadows, borders) via inline `var(--x)`. Gotcha: `getComputedStyle` returns empty in jsdom — any story test must read tokens via inline `var(--x)`, not computed styles.

## Boundaries

- `packages/design-system/src` never imports `@hyperidle/core-ui` — an import there creates a cycle (web → design-system → web). Enforced by ESLint `no-restricted-imports` (AJ6 AC8, `eslint.config.ts:792-811`).
- TSX is the single design source of truth: never fork a design copy of a production component; the production `.tsx` + its `.stories.tsx` ARE the design artifact. See `.claude/rules/visual-regression.md`.

Component tiers and DaisyUI usage: [Our components](./our-components.md). Layout contracts: [Page anatomy](./page-anatomy.md).

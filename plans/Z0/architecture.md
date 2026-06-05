# Z0 Architecture Plan: Documentation Site (VitePress)

## Summary

Install VitePress alongside the existing `docs/product/` markdown files. The VitePress config directory (`.vitepress/`) lives inside `docs/product/` so the docs site is self-contained. Two root scripts (`docs:dev`, `docs:build`) wire through to VitePress CLI commands. The site uses VitePress's built-in local search, a dark-mode-forced appearance with Hearth color overrides, and a sidebar derived from the `index.md` structure.

No new packages, no npm workspaces entry, no custom Vue components. VitePress is a root devDependency.

---

## 1. File Layout

```
docs/product/
  .vitepress/
    config.ts          # VitePress site config
    theme/
      index.ts         # extends default theme, imports custom.css
      custom.css       # Hearth color overrides via CSS variables
  index.md             # (existing, becomes the landing page)
  what-is-hyperidle.md
  how-work-flows.md
  human-ai-collaboration.md
  how-knowledge-compounds.md
```

VitePress convention: the `.vitepress/` directory sits inside the content root (`srcDir`). Since `srcDir` defaults to the directory containing the config, placing `.vitepress/` inside `docs/product/` means the markdown files in that same directory are the content source. No `srcDir` override needed.

Reference: https://vitepress.dev/reference/site-config#srcdir

---

## 2. VitePress Configuration

**File:** `docs/product/.vitepress/config.ts`

```ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'HyperIdle',
  description: 'Product documentation for HyperIdle',
  appearance: 'force-dark',

  outDir: '../../dist/docs',

  themeConfig: {
    sidebar: [
      {
        text: 'Product Documentation',
        items: [
          { text: 'What is HyperIdle?', link: '/what-is-hyperidle' },
          { text: 'How Work Flows', link: '/how-work-flows' },
          { text: 'Human + AI Collaboration', link: '/human-ai-collaboration' },
          { text: 'How Knowledge Compounds', link: '/how-knowledge-compounds' },
        ],
      },
    ],

    search: {
      provider: 'local',
    },

    outline: { level: [2, 3] },
  },
})
```

### Key decisions

| Decision | Rationale |
|---|---|
| `appearance: 'force-dark'` | HyperIdle is a dark-theme-first product. Users never need light mode in the docs. Eliminates theme toggle. |
| `outDir: '../../dist/docs'` | Builds to `<repo-root>/dist/docs/`. The root `.gitignore` already ignores `dist/`. Keeps build output at repo root level alongside `packages/web/dist`. |
| No `srcDir` | Config is inside `docs/product/.vitepress/`, so VitePress treats `docs/product/` as the source directory by default. |
| `outline: { level: [2, 3] }` | Show h2 and h3 in the right-side table of contents. The product docs use h2 sections with h3 subsections. |
| Local search, not Algolia | Zero external dependencies. Built-in minisearch runs in-browser. Sufficient for 5 pages. |
| Sidebar is static, not auto-generated | Five pages. Auto-generation adds complexity for no benefit. The order matches `index.md` reading order. |

---

## 3. Theme Customization

**File:** `docs/product/.vitepress/theme/index.ts`

```ts
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './custom.css'

export default {
  extends: DefaultTheme,
} satisfies Theme
```

**File:** `docs/product/.vitepress/theme/custom.css`

Maps VitePress CSS variables to the Hearth dark palette. The Hearth dark theme colors (from `packages/web/tailwind.config.ts`, `hearth-dark` theme):

| Hearth token | Value | Maps to VitePress variable |
|---|---|---|
| base-100 | `#1a1510` | `--vp-c-bg` |
| base-200 | `#231e16` | `--vp-c-bg-alt`, `--vp-c-bg-soft` |
| base-300 | `#3d342a` | `--vp-c-bg-elv` |
| base-content | `#ede5d8` | `--vp-c-text-1` |
| neutral-content | `#ede5d8` | (same as base-content) |
| primary | `#2eaa7a` | `--vp-c-brand-1` |
| primary (lighter) | `#3ec08e` | `--vp-c-brand-2` (computed lighter variant) |
| primary (darker) | `#258f66` | `--vp-c-brand-3` (computed darker variant) |
| accent | `#a89880` | `--vp-c-text-2` |
| error | `#ee6a5a` | `--vp-c-danger-1` |
| warning | `#d97706` | `--vp-c-warning-1` |

```css
:root {
  /* Brand — Hearth forest green */
  --vp-c-brand-1: #2eaa7a;
  --vp-c-brand-2: #3ec08e;
  --vp-c-brand-3: #258f66;

  /* Tip callouts use brand color */
  --vp-c-tip-1: #2eaa7a;
  --vp-c-tip-2: #3ec08e;
  --vp-c-tip-3: #258f66;

  /* Warning — Hearth secondary */
  --vp-c-warning-1: #f9b44e;
  --vp-c-warning-2: #d97706;
  --vp-c-warning-3: #a46a0a;

  /* Danger — Hearth error */
  --vp-c-danger-1: #ee6a5a;
  --vp-c-danger-2: #dc4a3a;
  --vp-c-danger-3: #b62a3c;
}

/* Dark mode overrides (force-dark means .dark is always active) */
.dark {
  /* Backgrounds — warm earth tones, not cool grays */
  --vp-c-bg: #1a1510;
  --vp-c-bg-alt: #231e16;
  --vp-c-bg-elv: #3d342a;
  --vp-c-bg-soft: #231e16;

  /* Text — warm cream, not cool white */
  --vp-c-text-1: #ede5d8;
  --vp-c-text-2: #a89880;
  --vp-c-text-3: #6b5d4d;

  /* Borders — warm tan */
  --vp-c-border: #3d342a;
  --vp-c-divider: #2d261e;

  /* Neutral defaults — warm */
  --vp-c-default-1: #6b5d4d;
  --vp-c-default-2: #3d342a;
  --vp-c-default-3: #2d261e;
  --vp-c-default-soft: rgba(107, 93, 77, 0.16);

  /* Brand */
  --vp-c-brand-1: #2eaa7a;
  --vp-c-brand-2: #3ec08e;
  --vp-c-brand-3: #258f66;

  /* Tip */
  --vp-c-tip-1: #2eaa7a;
  --vp-c-tip-2: #3ec08e;
  --vp-c-tip-3: #258f66;

  /* Warning */
  --vp-c-warning-1: #f9b44e;
  --vp-c-warning-2: #d97706;
  --vp-c-warning-3: #a46a0a;

  /* Danger */
  --vp-c-danger-1: #ee6a5a;
  --vp-c-danger-2: #dc4a3a;
  --vp-c-danger-3: #b62a3c;
}
```

No warm-gray fallback needed in `:root` outside `.dark` because `appearance: 'force-dark'` means `.dark` is always active. The `:root` block sets brand colors that both modes share; the `.dark` block overrides backgrounds/text/borders.

Reference: https://github.com/vuejs/vitepress/blob/main/src/client/theme-default/styles/vars.css

---

## 4. Root Package Scripts

Add to `package.json` scripts:

```json
{
  "docs:dev": "vitepress dev docs/product",
  "docs:build": "vitepress build docs/product"
}
```

VitePress CLI accepts the docs directory as a positional argument. The `dev` command starts a local server (default port 5173, but VitePress auto-increments if occupied — since the web dev server also uses 5173, VitePress will find an open port automatically). The `build` command produces static output in the configured `outDir`.

---

## 5. Dependency Installation

VitePress is a root `devDependency`:

```
npm install -D vitepress
```

VitePress pulls in Vue as a dependency. This is fine — Vue is scoped to the docs build and does not leak into the React application. The monorepo uses npm workspaces with `packages/*`, and VitePress is a root dependency, so there is no workspace conflict.

---

## 6. Tooling Isolation (verify passes)

VitePress introduces `.vitepress/` (cache, temp files) and Vue/VitePress TypeScript files into the repo. These must not interfere with existing check/lint/test/build/knip tooling.

### TypeScript (`npm run check`)

The root `tsconfig.json` has `"include": []` — it includes nothing directly and only uses `references` to specific packages. The VitePress config files in `docs/product/.vitepress/` are not referenced and will not be checked. No change needed.

### Biome (`npm run lint:biome`)

Biome's `files.includes` list is an allowlist. The `docs/` directory is not in the allowlist already (biome includes `**` but explicitly excludes various dirs). The VitePress `.ts` files in `docs/product/.vitepress/` will be picked up by the `**` glob. However, these are simple config files with no violations.

If VitePress's generated cache files (`.vitepress/cache/`, `.vitepress/dist/`) cause lint noise, add an exclusion:

```json
"!docs/product/.vitepress/cache",
"!docs/product/.vitepress/dist"
```

The builder should verify this during implementation and add exclusions only if needed.

### ESLint (`npm run lint:eslint`)

ESLint config targets `packages/web/src/**`, `packages/server/src/**`, etc. by explicit `files` globs. Nothing targets `docs/`. No change needed.

### Vitest (`npm run test`)

Vitest config uses explicit `projects` pointing to `packages/*`. No change needed.

### Knip (`npm run knip`)

Knip workspaces are explicit (`packages/*` entries). VitePress is a root devDependency used by root scripts (`docs:dev`, `docs:build`), so knip will see it as used. No change needed — the root workspace entry `"entry": ["scripts/*.ts"]` may not cover the docs scripts, but knip recognizes `package.json` scripts automatically.

### Build (`npm run build`)

The existing `build` script builds `@hyperidle/web`. Unchanged.

### `.gitignore`

`dist/` is already in `.gitignore`. The VitePress build output at `dist/docs/` is covered. The `.vitepress/cache/` directory should be added to `.gitignore`:

```
docs/product/.vitepress/cache
```

---

## 7. index.md Adaptation

The existing `docs/product/index.md` uses relative markdown links (`./what-is-hyperidle.md`). VitePress handles these natively — relative `.md` links are converted to router links automatically. No changes to the markdown content needed.

However, VitePress uses YAML frontmatter for page configuration. The existing `index.md` starts with `# Product Documentation` as a heading. For the landing page, we can optionally add minimal frontmatter, but it is not required — VitePress will render it as a standard doc page, which is appropriate for a documentation index.

---

## 8. Verification Methods per AC

| AC | Criterion | Verification |
|---|---|---|
| 1 | VitePress installed and configured | `npx vitepress --version` succeeds; config file exists at `docs/product/.vitepress/config.ts` |
| 2 | `npm run docs:dev` starts local site | Run command, verify it binds to a port (check stdout for local URL) |
| 3 | `npm run docs:build` produces static build | Run command, verify `dist/docs/index.html` exists |
| 4 | All product docs render with navigation | After build: verify all 5 HTML files exist in `dist/docs/`; spot-check links |
| 5 | Sidebar matches index.md structure | Visual inspection of dev server; verify config matches the 4 sidebar items |
| 6 | Search works | Visual inspection: search modal opens, returns results for a term like "Teams" |
| 7 | Dark theme with Hearth palette | Visual inspection: backgrounds are warm earth tones, brand color is forest green |
| 8 | `npm run verify` passes | Run `npm run verify` — zero failures |

ACs 1-4 and 8 are build-output verifiable. ACs 5-7 require visual inspection of the running dev server. No automated tests needed — this is tooling configuration, not application logic. The acceptance criteria describe static properties (files exist, commands succeed, config shape) and visual properties (theme colors, sidebar structure).

---

## 9. Ordered Implementation Tasks

### Task 1: Install VitePress

```
npm install -D vitepress
```

Verify: `npx vitepress --version` returns a version string.

### Task 2: Create VitePress config

Create `docs/product/.vitepress/config.ts` with the configuration from Section 2.

### Task 3: Create theme override

Create `docs/product/.vitepress/theme/index.ts` and `docs/product/.vitepress/theme/custom.css` from Section 3.

### Task 4: Add root scripts

Add `docs:dev` and `docs:build` to root `package.json` scripts (Section 4).

### Task 5: Update .gitignore

Add `.vitepress/cache` exclusion.

### Task 6: Verify docs:build

Run `npm run docs:build`. Confirm `dist/docs/index.html` exists. Confirm all 4 content pages have corresponding HTML files.

### Task 7: Verify docs:dev

Run `npm run docs:dev` in background. Verify the server starts and pages are accessible. Check sidebar, search, dark theme visually.

### Task 8: Verify existing tooling

Run `npm run verify`. All tools must pass. If Biome or knip complain about VitePress files, add targeted exclusions (Section 6).

### Task 9: Commit and ship

Single commit with all VitePress configuration. Branch: `docs/Z0-vitepress-docs-site`.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| VitePress dev server port conflicts with web dev server (both default 5173) | Medium | VitePress auto-detects occupied ports and increments. No action needed unless both are run simultaneously as part of `npm run dev`. They are separate commands. |
| Biome lints VitePress cache/temp files | Low | Add cache dir to biome excludes if it happens. |
| `vue` dependency version conflict with existing packages | Very low | Vue is scoped to VitePress. The monorepo has no other Vue dependency. npm hoists it to root `node_modules`. |
| Knip reports VitePress or Vue as unused | Low | Root scripts reference VitePress. If knip still flags it, add to `ignoreDependencies` in root workspace config. |
| VitePress TypeScript config conflicts with root tsconfig | None | Root tsconfig has `"include": []` — only references matter, and docs are not referenced. |

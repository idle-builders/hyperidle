# Z9 — Architecture: marketing landing page on a static-site foundation

Status: approved for build. Plan.md owns outcomes/ACs; design/design.md owns the visual language.
This document locks the stack, the monorepo contracts, the content seam, and the evidence plan.

**The builder starts from the feasibility probe already in this worktree** — it IS the intended
package skeleton (see feasibility.md). Nothing in it is throwaway except `src/pages/index.astro`
(placeholder the landing page replaces).

---

## 1. Stack decision: Astro 7

**Astro `^7.2.0`** (+ `@astrojs/markdown-remark@^7.2.2` for the remark link-rewriter).

Why Astro (ETHOS §4 — search before building; the supported primitive for exactly this shape):

- **Zero-runtime-JS default** — `.astro` templates emit plain HTML; `<script>` tags bundle to
  static files; no framework runtime unless islands are added (none are). Matches the AC
  "HTML + CSS + minimal JS" and "requires no server-side rendering or runtime API calls".
- **Markdown ingestion is built in** — content collections + the `glob` loader read markdown
  from anywhere on disk (proven with `base` pointing at the repo root), render it through the
  configured markdown processor at build time, and emit static HTML. This is the exact seam the
  follow-up docs WP needs (~20 guide files with relative cross-links).
- **Landing-page expressiveness** — concept.html is bespoke HTML/CSS/JS; `.astro` components are
  HTML-first templates with scoped CSS, so the port is structural, not a rewrite into a component
  framework.
- **Base path is a config value** (`base:`) with build-time env injection (proven for `/` and
  `/hyperidle/` — every emitted href/asset URL rewritten).
- **Proven monorepo coexistence** — every gate passes with the package wired in (feasibility.md §6).

Rejected alternatives:

- **VitePress** (already a root devDependency from legacy Z0): docs-shaped tool; the bespoke
  marketing page would be a custom Vue theme, and every page would ship the Vue hydration runtime
  — the opposite of "minimal JS". The legacy `docs:dev`/`docs:build` scripts stay untouched
  (out of scope).
- **Custom vite + markdown plugin / plain scripts**: hand-rolling frontmatter handling, page
  emission, link rewriting, and (for the docs WP) nav/siblings is reinventing a static-site
  generator — the thing §4 says not to build when a maintained one fits.

---

## 2. Package + monorepo contracts

**Package: `applications/website`, npm name `@hyperidle/website`.** Domain name (the public
site: landing now, docs later), not a WP id. `applications/*` is the shipping root; governance
role `application` already exists in `architecture.json` — **no governance registry changes**.

Root config changes (all proven; diffs in the worktree):

| File | Change | Why |
|---|---|---|
| `package.json` (root) | none (workspaces `applications/*` already covers it) | — |
| `biome.json` | `files.includes`: add `!**/.astro`, `!**/*.astro` | `.astro/` = generated types; biome parses `.astro` frontmatter without the template → false `noUnusedVariables` errors |
| `eslint.config.ts` | global ignores: add `**/.astro/**` | generated files |
| `knip.json` | ignore `applications/website/.astro/**`; workspace entry: `"entry": ["src/lib/*.ts!"]`, `"ignoreDependencies": ["cookie"]` | knip's Astro plugin registers `astro.config.ts`/`content.config.ts` as **dev-only** entries, so the `--production` lane never reaches the lib modules they import; cookie is a resolution shim (below) |
| `scripts/dep-manifest-lint.ts` | `barePackageName`: strip colon-namespaced virtual-module suffix (`astro:content` → `astro`), guarded by `!specifier.includes("//")` so URLs pass through | deps:check otherwise reports `astro:content` as an undeclared package |
| `scripts/lib/dep-manifest-verdict.ts` | `JUSTIFIED_UNUSED` += `(@hyperidle/website, cookie)` | the cookie shim is declared, never imported (same shape as desktop's pglite precedent) |
| `vitest.config.ts` (root) | projects += `applications/website` | test lane |
| `.gitignore` | `applications/website/.astro/` | generated types (`dist/` already ignored globally) |
| `governance/architecture.json`, typecheck-debt.json, ci.yml, verify chain | **unchanged** | plan constraint: existing tooling and `npm run verify` unaffected |

**Typecheck:** `applications/website/tsconfig.json` extends `astro/tsconfigs/strict` +
`"types": ["astro/client", "node"]`, includes `astro.config.ts` + `src/**/*.ts`. Discovered
automatically by typecheck-gate (tsconfig scan); passes with 0 errors under the repo's TS 6.
`.astro` template frontmatter is not tsc-checked (no astro-check in the gate — accepted at mvp
tier; all real logic lives in `src/lib/*.ts`, which is fully checked + tested).

**cookie resolution shim (locked, non-obvious):** astro's emitted prerender entry
(`dist/.prerender/*.mjs`) imports `{ parseCookie } from "cookie"` (cookie@2 API). The monorepo
hoists `cookie@0.7.2` (express@5 via the MCP SDK) to the root `node_modules`, and Node resolving
upward from `dist/.prerender/` hits the CJS 0.7.x → build crash. Declaring `cookie@^2` in the
website package nests it at `applications/website/node_modules/cookie`, where upward resolution
finds it first. Documented in package knip.json + JUSTIFIED_UNUSED + `@lore` in astro.config.ts.

**Known gap (accepted):** nothing in verify/CI builds the site (verify chain and ci.yml are
deliberately unchanged per the plan constraint). TS errors are still gated (typecheck-gate),
lint is gated, but a broken astro build only surfaces when someone runs the site build. Wiring
site build/deploy into CI belongs to the hosting decision (out of scope here).

---

## 3. Content pipeline

### This WP

- **Landing page** — hand-authored `.astro` sections porting `design/concept.html` (the approved
  visual source of truth), marketing tokens as CSS custom properties in site source (WP-owned;
  never `framework/design-system`).
- **Markdown ingestion proof** — the `docs` content collection ingests **`docs/product/*.md`**
  (all 6 Z1 product-story files — plan's out-of-scope wording excludes `docs/guides`, not
  `docs/product`), rendered under `/docs/product/**`:
  - loader: `glob({ pattern: "docs/product/*.md", base: "../../" })` — `base` resolves against
    the package root, i.e. the repo root; markdown is read in place, never copied;
  - `generateId: docEntryId` (`src/lib/docs-loader.ts`, unit-tested): strips `docs/` + `.md`,
    collapses `<dir>/index.md` onto the directory → `docs/product/index.md` renders at
    `/docs/product/`, siblings at `/docs/product/<id>/`;
  - route: `src/pages/docs/[...slug].astro` (slug = entry id) inside the marketing layout;
  - `/docs/` hub: `src/pages/docs/index.astro` linking `${base}docs/product/`.
- **Cross-link rewriting** — docs cross-link with `./sibling.md`. `remarkDocLinks`
  (`src/lib/doc-links.ts`, registered via `markdown.processor: unified({ remarkPlugins: [[…]] })`
  from `@astrojs/markdown-remark` — required because Astro 7's default Satteri processor does not
  run legacy `markdown.remarkPlugins` without it) maps sibling `.md` hrefs to
  `<base>docs/product/<id>/`. Cross-directory links (`../knowledge-architecture/…`) pass through
  and resolve relatively to their future site URLs — they 404 until the docs WP ingests those
  trees. That is the same accepted-placeholder pattern design.md §7 already applies to
  `/docs/user/` and `/docs/developer/` (teaser links stay placeholders).

### The follow-up seam (named, not built)

The docs WP widens the glob pattern to `docs/guides/**` (and the rest of `docs/`), extends
`docEntryId`/link mapping to nested trees, and adds nav/sibling chrome in the layout. No new
machinery — loader shape, id mapping, route, and link rewriting are all in place and proven.

---

## 4. Base-path contract (hosting-agnostic)

- Build-time env: `HYPERIDLE_SITE_BASE` (default `/`). `normalizeBase` (`src/lib/base-path.ts`,
  unit-tested) enforces leading `/`, appends trailing `/`, **fails the build** on empty or
  leading-slash-less values (a malformed base ships broken asset URLs at every host).
- `astro.config.ts` sets `base: normalizeBase(process.env.HYPERIDLE_SITE_BASE ?? "/")`.
- Template hrefs: always `${import.meta.env.BASE_URL}…` (never hardcoded `/…`).
- Markdown sibling links: base injected by `remarkDocLinks` (config passes `base` to the plugin).
- Fonts/assets: woff2 live in `src/assets/fonts/`, referenced by relative `url()` in
  `src/styles/fonts.css` → Vite bundles them with hashed names and base-rewritten URLs.
  **Never `public/` for anything URL-referenced** — public assets are copied verbatim and not
  rewritten (proven failure mode). `public/` holds only the OFL license file.
- Proven: `HYPERIDLE_SITE_BASE=/hyperidle/ npm run build -w @hyperidle/website` rewrites every
  emitted href, font URL, and doc link (feasibility.md §4).

---

## 5. Fonts (self-hosted, locked)

Space Grotesk 400/500/700 + Space Mono 400/700, **latin woff2 committed** in
`src/assets/fonts/` (~77KB total, taken from the `@fontsource` npm tarballs; OFL license at
`public/OFL-LICENSE.txt`). `@font-face` in `src/styles/fonts.css`: `font-display: swap`,
`unicode-range` latin subset (values in the probe file). Committed > downloaded-at-build:
offline-safe, reproducible, zero build-time network. No Google hotlinking anywhere (design.md
open question 2 — closed). Page must render acceptably on the fallback stacks alone.

---

## 6. Motion / JS budget

Plain inline `<script>` in `.astro` components — Astro bundles/minifies them; **no framework
islands, no runtime framework**. Four behaviors from concept.html, all guarded by
`matchMedia("(prefers-reduced-motion: reduce)")`:

1. **Hero terminal typing** — transcript is real DOM text (full content with JS off — AC); JS
   replays type-on only when motion is allowed; click completes instantly.
2. **Scroll reveals — VISIBLE-FIRST (critique finding):** content is visible by default in CSS;
   only when JS runs AND motion is allowed does JS add the pre-hide state and observe. No-JS and
   reduced-motion users see everything immediately.
3. **Mobile menu — focus containment (critique finding):** open → focus close button; close (Esc,
   link tap, close button) → focus returns to burger; `aria-expanded`/`aria-hidden` toggled;
   body scroll locked while open.
4. **Copy button** — `COPY` → `COPIED ✓` 1.6s; commands remain selectable text.

CSS: one `prefers-reduced-motion: reduce` block disables every animation/transition (AC).

**Critique findings → build contract** (all five): (1) dim-text `#767C94` keeps ≥ 4.5:1 on panel
surfaces — verify against `--bg-panel`/`--bg-raised`, not just page bg; (2) visible-first reveals
above; (3) focus containment above; (4) nav touch targets ≥ 44px (links padded; CTAs 48px);
(5) design.md↔prototype alignment — port concept.html as the visual truth, then apply design.md's
token/copy/accessibility amendments on top; where the two diverge on a visual detail, the
prototype wins, where they diverge on a critique-driven rule, design.md wins.

---

## 7. Security

Surfaces this change touches: none that matter to the threat model — no user input, no
state-changing endpoint, no credentials, no runtime outbound request (fonts vendored). Build-time
surfaces: one env var (validated by `normalizeBase`, fail-fast) and fs reads confined to a fixed
repo-relative directory in `content.config.ts` (no user-controlled paths). The governance model
classifies the package's files production-by-location; it imports nothing from the monorepo, so
no boundary crossings are added. Surfaces NOT touched: the app, the design system, the DB, the
agent layer, auth.

---

## 8. AC → evidence mapping

Repo rule: tests import code and assert behavior; file-reading assertions are build checks;
visual correctness is visual evidence. Classified accordingly:

| AC | Evidence | Kind |
|---|---|---|
| Static artifact from sources incl. markdown, servable by any static host | `npm run build -w @hyperidle/website` → dist of HTML/CSS/woff2/bundled JS only; `npx serve dist` + curl: `/`, `/docs/`, `/docs/product/`, `/docs/product/what-is-hyperidle/` all 200; grep dist HTML for `fetch(`/`XMLHttpRequest` = 0 | build check + scripted run (recorded in PR) |
| Markdown ingestion proven (docs WP unblocked) | 6 real `docs/product/*.md` files render under `/docs/product/**` with cross-links rewritten (curl + grep emitted hrefs) | build check |
| Base path configurable | rebuild with `HYPERIDLE_SITE_BASE=/hyperidle/`; grep emitted hrefs/font URLs for the prefix | build check |
| First-viewport message, defining properties, visible docs path, identity | visual review of the served page against design.md §4 structure + concept.html; screenshots at desktop/tablet/mobile | visual/manual evidence (Proof&DoD) |
| Cyberpunk identity consistent, distinct from Hearth | visual comparison (design.md §1–§3 tokens in site CSS; zero Hearth/DaisyUI classes) | visual evidence |
| Mobile/tablet/desktop usable; motion respects reduced-motion | visual check at 3 viewports (no horizontal overflow, menu works, 44px targets) + OS/browser reduced-motion toggle shows static page | visual evidence |
| `npm run verify` passes | full run recorded: exit 0 (feasibility.md §6) | gate |

**Automated tests (vitest, 16 in the probe):** `normalizeBase`, `mapDocHref`, `docEntryId` —
the package's real logic. Registered as vitest project `website`; runs in the affected slice
(`npm run test` proven to pick them up). **No Playwright for this WP** — proportionate at mvp
tier for one static page whose interactive surface is four small guarded behaviors with
visible-without-JS defaults; e2e machinery lives in core-ui and adding a second Playwright site
is out of proportion.

---

## 9. Build tasks (one builder, sequential)

The probe skeleton (package, configs, seam, fonts, tests, root diffs) is already in the worktree
and gate-green. Tasks continue from it:

1. **Landing page port.** Replace `src/pages/index.astro` placeholder with the full page:
   concept.html → `.astro` layout + section components (nav, hero terminal, crew, loop, views,
   ethos, knowledge, docs teaser, self-host, footer); tokens from design.md §2 into
   `src/styles/` (site-owned); the four JS behaviors per §6 with the critique contracts
   (visible-first reveals, focus containment, 44px targets, dim-text contrast on panels);
   responsive per design.md §5; `prefers-reduced-motion` block. Copy exactly per design.md §4
   (doc-grounded; placeholder `/docs/user/` `/docs/developer/` teaser links kept).
2. **Docs seam polish.** Marketing layout + markdown typography for `/docs/**` pages (the probe
   renders bare HTML); `/docs/` hub copy; verify all `docs/product` cross-links resolve inside
   dist.
3. **Evidence + ship prep.** Run the §8 build checks for `/` and `/hyperidle/` builds and record
   outputs; visual evidence at 3 viewports + reduced motion; `npm run verify` green; commits per
   repo git rules (worktree/branch already exist).

No parallel split — one package, one owner, tasks 2–3 depend on 1's layout.

## 10. Lore to carry (non-obvious, lives in code comments)

- cookie shim (astro.config.ts + knip.json + JUSTIFIED_UNUSED) — §2.
- `base: "../../"` is repo-root-relative, two levels from `applications/website` (content.config.ts).
- Astro 7: remark plugins need `@astrojs/markdown-remark`'s `unified()` processor; plugin entries
  are `[attacher, options]` tuples; `getStaticPaths` must return `props` (not bare fields).
- knip production lane needs explicit `src/lib/*.ts!` entries (plugin configs are dev-tagged).
- `public/` assets are not base-rewritten — URL-referenced assets belong in `src/assets/`.

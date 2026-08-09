# Z9 — Feasibility evidence

All probes ran in the worktree `.worktrees/marketing-site` (branch `feat/marketing-landing-site`),
Node v24.18.0 / npm 11.16.0. The probe was structured AS the intended package skeleton
(`applications/website`) — nothing here is scratch; the builder continues from it. Commands below
were executed verbatim; outputs are observed, not projected.

## 1. Static build + markdown ingestion

```
npm install -w @hyperidle/website astro@^7.2.0 @astrojs/markdown-remark@^7.2.2
npm run build -w @hyperidle/website
```

Observed: `8 page(s) built in ~2s` — `/index.html`, `/docs/index.html`, `/docs/product/index.html`
(the rendered `docs/product/index.md`, collapsed onto the directory URL), and 5 sibling docs at
`/docs/product/<id>/index.html`. dist contains only HTML, bundled woff2 (hashed under `_astro/`),
and inline/bundled JS. Rendered HTML verified: `<h1 id="what-is-hyperidle">What is HyperIdle?</h1>`.

Cross-link rewriting verified in emitted HTML:

```
grep -o 'href="[^"]*"' dist/docs/product/index.html
→ href="/docs/product/how-work-flows/"   (source: […](./how-work-flows.md))
→ href="../knowledge-architecture/"      (non-.md href passes through, resolves relatively)
```

Loader shape proven: `glob({ pattern: "docs/product/*.md", base: "../../" })` — `base` resolves
against the package root → repo root. Pitfall found and fixed: `base` was tried at `"../../../"`
first → loader warning `No files found matching … in directory "../../.."`; repo root is TWO
levels up from `applications/website`.

## 2. cookie hoisting conflict (the one real coexistence risk — found, fixed, proven)

Symptom: `astro build` crashed —
`Named export 'parseCookie' not found. The requested module 'cookie' is a CommonJS module` at
`astro/dist/core/build/default-prerenderer.js`.

Diagnosis (observed):

```
npm ls cookie
├─ react-router@7.18.1 → cookie@1.1.1 (nested)
├─ express@5.2.1 (via @modelcontextprotocol/sdk) → cookie@0.7.2 (HOISTED to root)
└─ astro@7.2.0 → cookie@2.0.1 (nested under astro)
```

Astro's emitted prerender entry (`dist/.prerender/prerender-entry.*.mjs`, verified via
`grep 'from "cookie"'` → `parseCookie` x2) is imported by Node at generate time; resolution walks
up from `dist/.prerender/` → root `node_modules/cookie@0.7.2` (CJS, no `parseCookie`) → crash.
Attempted `vite.ssr.noExternal: ["cookie"]` first — same crash (astro controls its SSR externals;
the import stays in the emitted chunk, observed).

Fix proven: declare `cookie@^2.0.1` in `applications/website` devDependencies → npm nests it at
`applications/website/node_modules/cookie` (verified: `nested cookie 2.0.1`) → build green.
Carried as JUSTIFIED_UNUSED (dep-manifest-lint) + knip `ignoreDependencies` + `@lore`.

## 3. Astro 7 API shape corrections (source-verified against installed dist, not memory)

- Custom loader array-return + `entry.body` (Astro-5 shape I assumed) renders EMPTY — entries
  kept `id,data` only. Store-based `load({ store })` also left `entry.rendered` unset (renderEntry
  reads `entry.rendered.html`). The **glob loader** is the supported path: it calls the content
  type's render function and stores `rendered` (observed in `node_modules/astro/dist/content/loaders/glob.js`).
- Remark plugins: `markdown.remarkPlugins` errors unless `@astrojs/markdown-remark` is installed
  (Astro 7 default processor is "Sätteri"); supported form is
  `markdown: { processor: unified({ remarkPlugins: [[attacher, options]] }) }`. A factory passed
  bare is called as an attacher with no args → `Cannot read properties of undefined (reading 'type')`
  (observed) — tuple form fixed it.
- `getStaticPaths` must return `{ params, props: { entry } }` — bare `{ params, entry }` →
  `render-undefined-entry-error` (observed).
- `render(entry)` returns `{ Content }` component; there is no render-to-HTML-string API
  (`RenderResult` verified in `astro/dist/content/runtime.d.ts`) — hence link rewriting lives in
  the remark plugin, not post-render string surgery.

## 4. Base path (hosting-agnostic)

```
HYPERIDLE_SITE_BASE=/hyperidle/ npm run build -w @hyperidle/website
```

Observed in dist: template href `href="/hyperidle/docs/"`; bundled font URLs
`url(/hyperidle/_astro/space-grotesk-400.CJ-V5oYT.woff2)`; remark-rewritten doc links
`href="/hyperidle/docs/product/<id>/"`. Default build (`/`) emits the same shapes unprefixed.

Pitfall found and fixed: fonts first lived in `public/fonts/` with `url(/fonts/…)` — public assets
are copied verbatim and NOT base-rewritten (observed: `url(/fonts/…)` under subpath build). Moved
to `src/assets/fonts/` with relative `url()` → Vite asset pipeline rewrites with base (observed).

## 5. Fonts self-hosted

woff2 taken from `@fontsource/space-grotesk@5.3.0` / `space-mono@5.3.0` npm tarballs
(`npm pack`), latin subset, 5 files, 77KB total, committed to `src/assets/fonts/`; OFL license at
`public/OFL-LICENSE.txt`. `font-display: swap` + latin `unicode-range` in `src/styles/fonts.css`.
Served with correct MIME (below). No hotlinking.

## 6. Monorepo gates — all observed green with the package wired in

| Gate | Command | Observed |
|---|---|---|
| typecheck | `npm run check` | `applications/website 0 PASS` — 36 packages, gate PASS (tsconfig extends `astro/tsconfigs/strict`, TS 6.0.3 + astro/client types clean) |
| lint | `npm run lint` | exit 0 (biome + eslint + governance fixtures/attacks/live; `3392 tracked files … 19 rules` PASS). First run had 24 biome errors — all from the new package: generated `.astro/` linted + `.astro` frontmatter false positives → excluded via biome.json/eslint ignores; rest fixed by `biome check --write` |
| knip | `npm run knip` | exit 0 after `ignoreDependencies: ["cookie"]` (only issue reported) |
| knip production | `npm run knip:production` | exit 1 first: 3 lib files `Unused files` — debug showed knip's Astro plugin registers the config files as dev-only entries, so production mode never traces their imports. Fixed with `"entry": ["src/lib/*.ts!"]` → exit 0 |
| deps:check | `npm run deps:check` | exit 1 first: `needs astro:content` (virtual module parsed as package name) + `drop @types/node`. Fixed: barePackageName colon handling; explicit `import process from "node:process"` in astro.config.ts → `35 packages, imports and manifests agree (2 justified exceptions)` |
| mock-inventory | `npm run mock-inventory:check` | `inventory.json is up to date` exit 0 (gate scans core-ui/server only — unaffected as expected) |
| tests | `npx vitest run --project website` / `npm run test` | 16/16 pass; affected slice picks the project up (32 tests across 4 changed files) |
| **verify** | `npm run verify` | **exit 0** — full chain incl. web build, desktop build, attestation (`status=passed`). Warning "working tree is dirty" expected pre-commit |

Governance census: `.astro` files classify production-by-location under `applications/`
(no registry change — `applications/*` role exists); floors-tight absorbed the added files (lint PASS).

## 7. End-to-end: plain static server

```
npx serve -l 4787 applications/website/dist
GET /                                    → 200 (1921B)
GET /docs/                               → 200
GET /docs/product/                       → 200
GET /docs/product/what-is-hyperidle/     → 200
GET /_astro/space-grotesk-400.*.woff2    → 200 (font/woff2)
grep 'fetch(|XMLHttpRequest|api/' dist/index.html → 0 matches
```

## 8. Residuals (non-blocking, documented in architecture.md)

- Cross-directory doc links (`../knowledge-architecture/…` in product docs) 404 until the docs WP
  ingests those trees — accepted forward links, same class as design.md's `/docs/user/` placeholders.
- CI/verify does not build the site (verify chain deliberately unchanged per plan constraint).
- Biome/ESLint skip `.astro` template syntax (generated-type + frontmatter false positives);
  package logic lives in linted+typechecked+tested `.ts`.

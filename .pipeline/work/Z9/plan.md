# Z9 — Marketing landing page on a static-site foundation

## Work package

**Outcome.** A first-time visitor opening HyperIdle's public site sees a marketing landing page in a cyberpunk marketing identity — what HyperIdle is, who it is for, how humans and agents work together, and how to self-host — and a maintainer can deploy the built site as plain static files to any static host.

**Why this matters.** HyperIdle has no public-facing surface. The product story (`docs/product/`, shipped via Z1), the user and developer guides, and ETHOS exist only as markdown in the repo, which signals "internal notes" and gives evaluators nothing to land on. Cost of not doing it: zero discovery funnel — a product that cannot be found and evaluated does not exist in the market. The founder also had a catchy cyberpunk design exploration ("deep borders as shadows, neon yellow accents") that was lost; it was too aggressive for the application but is exactly right for marketing, and this WP rebuilds it as a deliberate marketing-only identity.

**What exists today.** `docs/product/` (the Z1 product-story funnel: what-is-hyperidle, how-work-flows, human-ai-collaboration, how-knowledge-compounds, product-decisions), `docs/guides/user/` + `docs/guides/developer/`, `ETHOS.md`, and the Hearth app design system (warm/approachable — deliberately the opposite of the marketing identity wanted here). Legacy Z0 (VitePress docs site) is registered but never built and predates the docs restructure; legacy Z1 content shipped. No static-site pipeline exists in the repo.

**Missing delta.** A static-site build pipeline (sources + markdown → static HTML/CSS at build time, no server runtime) and the landing page itself: cyberpunk marketing identity rebuilt from the founder's description plus web research, and marketing sections grounded in the real product docs.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp — public-facing marketing surface, static output, no user data, no runtime service. (Note: `pipeline.config.yml` declares no project-level `engineering.tier`; this is a WP-level assignment.)

**Pre-build.** Design required — the WP introduces a new user-facing surface with a visual language (cyberpunk marketing) that no approved pattern determines; it is explicitly distinct from the Hearth app design system. Refinement not required — outcome, audience, and content sources are settled.

**Constraints.**
- Static-only: the build emits plain HTML/CSS/minimal JS from sources that include markdown content; no server runtime, no build-time assumption of a specific host. Hosting stays open (GitHub Pages / Cloudflare Pages / own infra are all viable targets); base-path must be configurable.
- Marketing identity (founder-approved direction): near-black dark base, neon yellow `#FCEE0A` as the single accent, depth expressed through borders and hard offset shadows rather than blur shadows, angular/clipped geometry, monospace typography for labels/terminal elements. Marketing-only — must not leak into the Hearth app design system or the app.
- Content grounded in existing docs (`docs/product/`, `docs/guides/`, `ETHOS.md`); describes features as they exist today; no invented capabilities.
- Additive to the monorepo; existing tooling and `npm run verify` unaffected.
- Landing page first; rendering the full documentation set is a follow-up work package built on this foundation.

**Out of scope.**
- Rendering the full docs/guides documentation set (follow-up WP on the same foundation).
- Hosting decision, custom domain, and CI deploy wiring.
- Any change to the Hearth design system or the running application.
- Blog/changelog system, analytics, newsletter forms, CMS/dynamic content.

## Acceptance criteria

- A first-time visitor understands from the initial viewport what HyperIdle is (an agentic operating system where flat teams of humans and AI agents run work together), who it is for (fast-moving small teams/founders, explicitly not enterprise), and the primary next step (self-host quickstart or read the docs).
- The landing page presents the product's defining properties — human+AI flat teams with a named agent roster, work shaped as time-boxed bets flowing through tasks and sessions, knowledge that compounds, and self-hosting across laptop/VPS/cloud — each grounded in real product documentation, with a visible path to the docs.
- The site build produces a fully static artifact (HTML + CSS + minimal JS) from sources that include markdown, servable by any plain static file server, deployable unchanged to any static host.
- The site applies the cyberpunk marketing identity consistently across all sections: near-black base, `#FCEE0A` neon accent used sparingly, depth from borders/hard shadows (no blur-shadow elevation), angular/clipped geometry, monospace accents — visually distinct from the Hearth app theme.
- All sections are usable on mobile, tablet, and desktop viewports; any motion respects `prefers-reduced-motion`.
- `npm run verify` passes with the site added to the monorepo.

## Validation scenarios

- Given a clean checkout, when the site build runs, then a directory of static files is produced that renders the complete landing page when served by a plain static file server (no application server, no API).
- Given a visitor on a phone viewport, when they open the landing page, then every section is readable and the navigation and CTAs work without horizontal overflow.
- Given the built landing page HTML, when inspected, then it requires no server-side rendering or runtime API calls to display.
- Given a visual review of the built page, when compared against the Hearth app theme, then the page reads as the cyberpunk marketing identity (dark, neon-yellow accent, hard borders/shadows), not Hearth.
- Given a maintainer pointing the build output at a different static host (different base path), when rebuilt with the configured base path, then all internal links and assets resolve.

## Shipped — as-built decisions (consolidated from design + architecture + feasibility, 2026-08-09)

**Stack & placement.** Astro 7 in `applications/website` (`@hyperidle/website`). Zero-runtime-JS static output by default; markdown via content collections with an external-base glob loader over the repo tree (markdown read in place, never copied). Rejected: VitePress (Vue runtime, docs-shaped), custom vite+markdown-it, plain scripts — they reinvent what a maintained primitive provides.

**Base path.** `HYPERIDLE_SITE_BASE` env → fail-fast `normalizeBase` validation → astro `base`; template hrefs via `import.meta.env.BASE_URL`, markdown cross-links via a remark plugin, assets through the Vite pipeline (nothing URL-referenced lives in `public/`). Proven for `/` and `/hyperidle/`; invalid values fail the build.

**Content seam.** This WP ingests `docs/product/*.md` (6 pages at `/docs/product/**`) as the markdown-proof + hub. The follow-up docs WP widens the glob pattern to `docs/guides/**` — no new machinery. `docEntryId` collapses `index.md` onto directory URLs; `mapDocHref` rewrites sibling `.md` links to route URLs.

**Fonts.** Space Grotesk 400/500/700 + Space Mono 400/700 latin woff2 committed under `src/assets/fonts/` (OFL shipped), `font-display: swap`, no hotlinking.

**Marketing identity.** PIVOT (2026-08-10, founder-directed): the dark neon-noir direction was
rejected after review; the shipping identity is **light neo-brutal** per
`.pipeline/work/Z9/proposals/b-neo-brutal.html` (the `proposals/` folder holds the explorations).
Paper `#FFFDF5` base, white cards, black ink, `#FCEE0A` as fill only (black text on yellow, never
yellow text on white), 3px solid black borders, zero-blur hard offset shadows in 3/5/8px tiers,
hover lift −2px / active press +3px, sticker rotations. Type: Archivo Black display + Space
Grotesk body + Space Mono labels, all self-hosted (OFL). The four guarded JS behaviors,
visible-first reveals, reduced-motion fallbacks, and the 4.5:1 contrast floor carried over
unchanged from the dark iteration; copy is verbatim.

**Motion & JS.** Four guarded plain-JS behaviors, no islands: hero terminal typing (full transcript in DOM without JS; click-to-skip), visible-first reveals (`html.js-reveal` opt-in — content fully visible with JS disabled), mobile menu with focus containment + Esc + scroll lock, copy button. All motion disabled under `prefers-reduced-motion`.

**Evidence.** 17 unit tests (normalizeBase/mapDocHref/docEntryId/barePackageName) + scripted build checks (static dist, serve+curl 200s for both base paths, zero runtime fetch/XHR) + visual captures at 3 viewports + reduced-motion + no-JS under `.pipeline/work/Z9/evidence/`. Review verdict DONE, all 6 ACs pass (see review record / git history).

**Deferrals & known limitations (outlive this run):**
- `/docs/user/` and `/docs/developer/` teaser + footer links are accepted placeholders — they 404 until the follow-up docs-rendering WP (registered in `.pipeline/Z.md` dependency graph).
- `npm run verify` / CI deliberately do NOT build the site in this WP; the site builds via its own package scripts. Wiring a CI build leg is a later decision.
- Hosting remains open (GitHub Pages / Cloudflare Pages / own infra); deploy wiring is separate work.
- Two non-blocking biome `!important` warnings in the reduced-motion block (intentional universal disable).
- The e2e snapshot net rewrites stale `plans/AI3|AI4/proof/*.png` during verify runs (pre-existing behavior, unrelated to this WP) — revert before committing.

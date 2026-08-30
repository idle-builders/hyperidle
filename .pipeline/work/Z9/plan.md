# Z9 — Marketing landing page on a static-site foundation

## What we need

HyperIdle had no public-facing surface. The product story, the user and developer guides and
ETHOS existed only as markdown in the repo, which signals "internal notes" and gives an evaluator
nothing to land on. Without a discovery funnel the product cannot be found or evaluated.

So: a marketing landing page that tells a first-time visitor, from the initial viewport, what
HyperIdle is (an agentic operating system where flat teams of humans and AI agents run work
together), who it is for (fast-moving small teams and founders, explicitly not enterprise), and
what to do next (self-host quickstart, or read the docs). The page presents the product's
defining properties — human+AI flat teams with a named agent roster, work shaped as time-boxed
bets flowing through tasks and sessions, knowledge that compounds, self-hosting across
laptop/VPS/cloud — each grounded in the real documentation, with a visible path into it. Nothing
invented: capabilities are described as they exist today.

Under it, a static-site build. The site comes out as plain HTML, CSS and minimal JS from sources
that include the repo's markdown; it is servable by any plain static file server, deployable
unchanged to any static host, with a configurable base path. No server runtime, no rendering at
request time, no build-time assumption about the host. Every section works on mobile, tablet and
desktop without horizontal overflow, and any motion respects `prefers-reduced-motion`. The site
is additive to the monorepo: existing tooling and `npm run verify` are unaffected.

The founder also wanted a lost cyberpunk design exploration rebuilt — too aggressive for the
application, exactly right for marketing. That identity is marketing-only and must not leak into
the Hearth app design system or the running app; the built page has to read as clearly not-Hearth.

Boundary: the landing page only. Rendering the full docs and guides set is a follow-up work
package on this same foundation. Hosting choice, custom domain and CI deploy wiring are out, as
is any change to Hearth or the app, and any blog, changelog, analytics, newsletter or CMS.

## How it works

The site is an Astro 7 package, `@hyperidle/website`, at `applications/website`, emitting static
output with zero runtime JS by default. Markdown is ingested through content collections using an
external-base glob loader that reads the repo's markdown in place — it is never copied into the
package. VitePress, a hand-rolled vite+markdown-it pipeline and plain build scripts were all
rejected: they reinvent what a maintained static-site primitive already provides.

Base path is a build input. `HYPERIDLE_SITE_BASE` passes through a fail-fast `normalizeBase`
check into Astro's `base`; templates emit hrefs via `import.meta.env.BASE_URL`, markdown
cross-links are rewritten by a remark plugin, and assets go through the Vite pipeline so nothing
URL-referenced sits in `public/`. `/` and `/hyperidle/` both build and serve clean; an invalid
base fails the build rather than producing broken links.

This work package ingests `docs/product/*.md` as six pages under `/docs/product/**` plus a hub —
enough to prove the markdown seam. The follow-up docs work package only widens the glob to
`docs/guides/**`; no new machinery. `docEntryId` collapses `index.md` onto its directory URL and
`mapDocHref` rewrites sibling `.md` links to route URLs.

The shipping visual identity is **light neo-brutal**, arrived at by pivot: the dark neon-noir
direction was built first and rejected by the founder after review. Three light-cyberpunk
explorations were made (2077 Ops, Neo-Brutal, Clean Circuit) and Neo-Brutal was chosen. It is
paper `#FFFDF5` base, white cards, black ink, `#FCEE0A` as fill only (black text on yellow, never
yellow text on white), 3px solid black borders, zero-blur hard offset shadows in 3/5/8px tiers,
hover lift -2px and active press +3px, sticker rotations. Type is Archivo Black for display,
Space Grotesk for body and Space Mono for labels — all self-hosted woff2 under
`src/assets/fonts/` with `font-display: swap` and their OFL licences, no hotlinking. Copy came
through the pivot verbatim, as did the behaviors, the reduced-motion fallbacks and the 4.5:1
contrast floor.

Interactivity is four guarded plain-JS behaviors, no framework islands: the hero terminal typing
effect (whose full transcript is in the DOM without JS, and is click-to-skip), visible-first
reveals gated on an `html.js-reveal` opt-in so content is fully visible with JS off, a mobile
menu with focus containment, Esc and scroll lock, and a copy button. All motion is disabled under
`prefers-reduced-motion`.

Evidence at ship: 17 unit tests over `normalizeBase`, `mapDocHref`, `docEntryId` and
`barePackageName`; scripted build checks asserting static output, serve-and-curl 200s for both
base paths and zero runtime fetch/XHR; visual captures at three viewports plus reduced-motion and
no-JS. Review verdict DONE with all six acceptance criteria passing.

## How we work on this

- The `/docs/user/` and `/docs/developer/` teaser and footer links are accepted placeholders.
  They 404 until the follow-up docs-rendering work package lands.
- `npm run verify` and CI deliberately do not build the site here; it builds through its own
  package scripts. Adding a CI build leg is a later decision.
- Hosting is still open — GitHub Pages, Cloudflare Pages and own infra are all viable; deploy
  wiring is separate work.
- Two non-blocking biome `!important` warnings remain in the reduced-motion block; the universal
  disable there is intentional.
- Verify runs rewrite stale `plans/AI3|AI4/proof/*.png` snapshots. This is pre-existing
  snapshot-net behavior unrelated to this work, but every worktree run must revert that churn
  before committing.

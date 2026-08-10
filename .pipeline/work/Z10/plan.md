# Z10 — Site content architecture: marketing landing, useful docs

## Work package

**Outcome.** A visitor landing on the site meets a focused marketing instrument (what it is, a glance at it working, capabilities, who it's for, what it isn't, one next step) and a visitor who wants to use the product finds a docs area with top-level Installation and side-navigated usage guides — instead of today's single page that mixes marketing filler with a quickstart block.

**Why this matters.** The founder reviewed the shipped page and scrapped ~90% of its content: the crew-roster/loop/three-views/ethos-manifesto/knowledge sections are marketing filler that buries the product. Landing and docs are different instruments — the landing sells, the docs make it useful — and today both jobs are done badly by one page. Cost of not doing it: the site keeps misrepresenting the product and leaking the evaluators it was built to catch.

**What exists today.** The static foundation and neo-brutal identity shipped (Astro package, markdown seam ingesting `docs/product/*.md` at `/docs/product/**`, base-path contract). Landing carries eight sections of filler + quickstart. `docs/guides/user/` (9 files), `docs/guides/developer/` (8 files), `docs/deployment/` (5 files) exist as markdown, unrendered. Research done (374-page dev-landing analysis + Linear/Vercel/Stripe/PostHog teardowns) and founder-approved section structure.

**Missing delta.** (1) Landing rebuilt to the approved marketing structure with honest copy. (2) Docs seam widened to the guides + deployment docs with a side navigation that mirrors the docs' own structure, top-level Installation entry. (3) Quickstart moves out of the landing into Installation.

**Depends on.** None (foundation shipped to main).

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required — the visual identity is approved (neo-brutal sheet is the style authority) and the section structure is founder-approved from research; docs navigation follows the docs' existing index structure.

**Constraints.**
- Landing section structure (founder-approved): hero (headline says what it is in the first words, ≤12 words, no superlatives), video slot (designed placeholder until a real recording exists — never fake), features as plain-language capabilities, who it's for, honest "what HyperIdle is not" grounded in ETHOS.md, final CTA into docs. No quickstart on the landing.
- Docs area: Installation top-level (first-run + deployment profiles), then User Guide and Developer Guide; side navigation through all sections, usable on mobile; markdown read in place, never copied.
- Content honesty: only capabilities that exist today; the "early and shipping" honesty stance stays; no invented testimonials, numbers, or logos.
- Neo-brutal identity consistent across landing and docs; static output, base-path contract, reduced-motion and no-JS visibility preserved.

**Out of scope.**
- Recording the actual demo video (the slot ships as placeholder).
- Writing new documentation content — render what exists; genuine gaps are noted, not filled.
- `docs/product/**` re-architecture (already rendered; may be re-linked as concepts).
- Hosting/deploy wiring.

## Acceptance criteria

- The landing page consists of exactly the approved marketing structure — hero, video slot, capabilities, who-it's-for, what-it-is-not, final CTA — with the quickstart and all previously scrapped sections gone, and every claim traceable to existing product documentation or ETHOS.md.
- The docs area renders Installation (top-level), the full User Guide, and the full Developer Guide from the repo markdown with a side navigation reflecting the docs' structure, working on mobile, with sibling cross-links resolving to rendered routes.
- A reader can go from the landing's final CTA to Installation and from Installation through the usage guides without dead links.
- Landing and docs share the neo-brutal identity; the site remains a fully static artifact servable by any static file host for both base-path variants.
- Responsive behavior, prefers-reduced-motion, and no-JS content visibility hold across landing and docs; `npm run verify` passes.

## Validation scenarios

- Given a visitor on the landing, when they scroll, then they pass through hero → video slot → capabilities → who-it's-for → what-it-is-not → final CTA, and no quickstart block or scrapped section appears.
- Given a visitor opening the docs, when they use the side navigation, then every Installation, User Guide, and Developer Guide page is reachable and cross-links between pages resolve.
- Given the built site, when served statically at `/` and at a subpath, then all pages, nav links, and assets resolve.
- Given JS disabled, when any page loads, then all content is visible.

## Shipped — as-built decisions (consolidated 2026-08-09)

**Landing.** Exactly six components: Hero (headline "The agentic operating system for AI-first teams." + subhead + CTA into docs), VideoSlot (honest placeholder frame — no fake player/duration, swappable for a real `<video>` without layout change), Capabilities (5 asymmetric blocks grounded in agents.md / deployment / human-ai-collaboration), Audience, NotThis (ETHOS §1–2 disqualifiers incl. the n8n/Zapier workflow-tool distinction from what-is-hyperidle.md), final CTA ("ten minutes" framing from getting-started.md). Deleted: crew roster, loop schematic, three-views mocks, ethos manifesto, knowledge section, quickstart block, docs teaser cards. Footer keeps the "EARLY AND SHIPPING" honesty line.

**Docs area.** Seam widened in place (never copied) to `docs/guides/user/**` (9), `docs/guides/developer/**` (8), `docs/deployment/**` (5) alongside `docs/product/**` (6); 28 doc pages + hub, index.md collapsed to directory URLs. Sidebar sections Installation → User Guide → Developer Guide → Concepts via a nav config; mobile drawer is native `<details>` (keyboard-usable, works no-JS). Link mapping generalized: in-set sibling `.md` links → site routes; out-of-set links → GitHub `blob|tree/main/...` URLs (unit-tested incl. root-escape and tree-vs-blob). Tables wrapped scrollable.

**Evidence.** 41 unit tests across 5 website test files; build checks for `/` and `/hyperidle/` with a zero-dead-internal-link sweep (35 internal links, 0 dead on both bases); 10 visual captures under `evidence/` (landing + docs at 1440/768/390). Review verdict DONE, all 5 ACs pass.

**Deferrals & known limitations (outlive this run):**
- Demo video does not exist yet — the slot is a placeholder by design; recording is separate work.
- Docs hub cards rotate ±0.4deg causing a 2px overflow at ≤768px, clipped by `overflow-x:hidden` (cosmetic, accepted).
- Installation assembles deployment docs in a slightly different order than `docs/deployment/index.md` (assembly, not mirror).
- Hosting/deploy wiring still open (GitHub Pages / Cloudflare Pages / own infra).

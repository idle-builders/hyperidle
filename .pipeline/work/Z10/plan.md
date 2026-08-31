# Z10 — Site content architecture: marketing landing, useful docs

## What we need

The founder reviewed the shipped landing page and scrapped roughly 90% of its content. The crew
roster, the loop schematic, the three-views mocks, the ethos manifesto and the knowledge section
were marketing filler that buried the product, and a quickstart block sat on the landing doing a
docs job. Landing and docs are different instruments — the landing sells, the docs make the
product useful — and one page was doing both badly. Left alone, the site keeps misrepresenting
the product and leaking the evaluators it was built to catch.

So: rebuild the landing to a focused marketing structure (hero, a glance at the product working,
capabilities, who it is for, what it is not, one next step) with honest copy, and open a real
docs area with Installation at the top level and side-navigated usage guides. The quickstart
moves off the landing into Installation.

The landing structure is founder-approved from research: the hero headline says what the product
is in its first words, at most twelve of them, no superlatives; the video slot is a designed
placeholder until a real recording exists and must never fake a player; features are plain-
language capabilities; the "what HyperIdle is not" section is grounded in ETHOS.md; the final CTA
goes into the docs. The docs area leads with Installation (first-run plus deployment profiles),
then the User Guide and the Developer Guide, with side navigation through every section that is
usable on mobile. Markdown is read in place, never copied.

Only capabilities that exist today may be claimed. The "early and shipping" honesty stance stays.
No invented testimonials, numbers or logos. The neo-brutal identity from the foundation applies
across both landing and docs, and the static output, base-path contract, reduced-motion behavior
and no-JS content visibility all carry through unchanged.

Boundary: recording the actual demo video is separate work. No new documentation is written here
— what exists is rendered, and genuine gaps are noted rather than filled. `docs/product/**` is
not re-architected, only possibly re-linked as concepts. Hosting and deploy wiring stay out.

## How it works

The landing is exactly six components. Hero carries the headline "The agentic operating system
for AI-first teams." with a subhead and a CTA into the docs. VideoSlot is an honest placeholder
frame — no fake player, no fake duration — sized so a real `<video>` can replace it without a
layout change. Capabilities is five asymmetric blocks grounded in the agents, deployment and
human-AI-collaboration docs. Audience states who it is for. NotThis carries the ETHOS §1-2
disqualifiers, including the distinction from workflow tools like n8n and Zapier taken from
what-is-hyperidle.md. The final CTA uses the "ten minutes" framing from getting-started.md. The
footer keeps the "EARLY AND SHIPPING" honesty line.

The docs area reuses the foundation's markdown seam, widened in place rather than by copying:
`docs/guides/user/**` (9 files), `docs/guides/developer/**` (8) and `docs/deployment/**` (5) join
the existing `docs/product/**` (6), giving 28 doc pages plus a hub, with `index.md` collapsed
onto its directory URL. A nav config drives sidebar sections in the order Installation → User
Guide → Developer Guide → Concepts. The mobile drawer is a native `<details>` element, so it is
keyboard-usable and works with JS off. Link mapping is generalized: sibling `.md` links inside
the rendered set become site routes, while links pointing outside it become GitHub
`blob|tree/main/...` URLs — unit-tested including the root-escape and tree-vs-blob cases. Tables
are wrapped in scrollable containers.

Evidence at ship: 41 unit tests across five website test files; build checks for `/` and
`/hyperidle/` including a dead-internal-link sweep that found 35 internal links and zero dead on
both bases; visual captures of landing and docs at 1440, 768 and 390. Review passed in one round
with all five acceptance criteria met.

## How we work on this

- The demo video does not exist yet. The slot is a placeholder by design; recording it is
  separate work.
- Docs hub cards rotate ±0.4deg, which causes a 2px overflow at 768px and below. It is clipped by
  `overflow-x: hidden` and accepted as cosmetic.
- Installation assembles the deployment docs in a slightly different order than
  `docs/deployment/index.md` — it is an assembly, not a mirror of that index.
- Hosting and deploy wiring are still open: GitHub Pages, Cloudflare Pages and own infra all
  remain viable.

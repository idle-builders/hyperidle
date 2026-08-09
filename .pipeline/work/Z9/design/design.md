# Z9 — Design: marketing landing page + marketing design language

Status: proposed for critique. Scope: the landing page surface only. This document defines a
WP-owned **marketing design language** (the plan mandates it is deliberately distinct from the
Hearth app design system and must not leak back into `framework/design-system`). Hearth rules
scanned for awareness only; where Hearth says warm/light/system-fonts/rounded, this language says
cool/dark/webfont/angular — that inversion is the point (plan.md constraint, founder-approved).

Prototype: `concept.html` next to this file — self-contained render of the full page, the thing a
reviewer judges visually.

---

## 1. Identity in one paragraph

Clean-but-cool cyberpunk: a near-black stage, one neon accent used like a scalpel, depth from
borders and hard offset shadows instead of blur, angular clipped geometry, terminal typography.
The mood is HUD/schematic, not dystopian grime — no glitch storms, no busy grunge, no multi-neon
rainbow. Darkness dominates; yellow is the exception that earns attention. This rebuilds the
founder's lost prototype ("deep borders as shadows, neon yellow accents") with restraint learned
from the 2026 cyberpunk-UI research the maintainer supplied.

**Rejected directions (do not re-litigate):**
- *Hearth-derived dark theme* — plan explicitly requires a distinct marketing identity.
- *Multi-accent cyberpunk (cyan + magenta + yellow)* — founder directive: single accent; research
  (Neon Noir) says constrain to 2–3 max; one is stronger.
- *Blur-shadow elevation / glassmorphism* — founder directive: depth from borders + hard shadows;
  glassmorphism is a catalogued AI-aesthetic tell (`__research__/ai-aesthetic.md`).
- *Centered symmetric hero, 3-identical-card grids* — AI-aesthetic tells; Neon Noir research
  prescribes asymmetric layouts. Sections vary panel sizes instead.
- *Chakra Petch display face* — reads as costume cyberpunk, weaker at body sizes; Space Grotesk is
  cleaner and still technical (decision below).
- *Animated glitch text* — busy/gritty; against "clean-but-cool". Glitch semantics survive only as
  the hard-offset hover shadow (a static, controlled echo of glitch).

---

## 2. Tokens

All values are WP-owned. They live in the site source (CSS custom properties), never in
`framework/design-system/src/tokens.css`.

### 2.1 Color

Base canvas is near-black with a slight blue tint; a four-step surface ladder above it. One accent.

| Token | Value | Role |
|---|---|---|
| `--bg-page` | `#0A0A0F` | page canvas (the StyleKit/cyberpunk canonical near-black) |
| `--bg-raised` | `#0E0F15` | nav bar, table header bars, code-block chrome |
| `--bg-panel` | `#12141C` | cards, panels, frames |
| `--bg-inset` | `#07070B` | terminal body — darker than the page so it reads as a hole, not a slab |
| `--border-hairline` | `#1C1F2B` | default 1px borders |
| `--border-strong` | `#2B3040` | emphasized borders, frame wrappers, connectors |
| `--text-primary` | `#E9EBF2` | headings, key content (~17:1 on page) |
| `--text-secondary` | `#A0A5B8` | body copy (~7.9:1) |
| `--text-dim` | `#767C94` | mono labels, meta, system lines (~4.8:1 — floor kept ≥ 4.5:1) |
| `--accent` | `#FCEE0A` | the single accent (Cyberpunk 2077 canonical yellow) |
| `--accent-ink` | `#0A0A0F` | text on accent fills (~17:1) |
| `--accent-tint` | `rgba(252,238,10,0.08)` | rare accent surface fills (L3 layer row, active pill) |
| `--accent-border` | `rgba(252,238,10,0.45)` | accent hairlines |
| `--glow` | `rgba(252,238,10,0.30)` | glow shadows/text-shadow, accent elements only |

Rules:
- **No second hue.** No semantic green/red/blue. Terminal "success" is a `✓` glyph in accent or
  primary text, never a new color. Status is carried by words and glyphs, not palette.
- Yellow is budgeted: hero accent phrase, eyebrows, section numerals, primary CTAs, hover states,
  caret, one highlighted knowledge layer. Nothing else. If a screenshot is > ~5% yellow, something
  is wrong.
- No pure `#000` backgrounds (hard shadows use `#040409`, canvas stays `#0A0A0F`).

### 2.2 Typography

Two families, decided (not a menu):

| Role | Family | Weights | Why |
|---|---|---|---|
| Display + body | **Space Grotesk** | 400 / 500 / 700 | Geometric grotesque with a technical edge; modern without cosplay; holds up from 13px body to 68px hero; pairs natively with a mono. Google Fonts, OFL. |
| Labels / data / terminal | **Space Mono** | 400 / 700 | Same lineage as Grotesk (coherent pair), more character than JetBrains Mono; at marketing sizes its quirks are an asset. |

Fallback stacks: `"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif` and
`"Space Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace`. Page must render
acceptably on fallbacks alone (webfonts are progressive enhancement; `font-display: swap`).

Note: Hearth's AQ-019 "system fonts only, no Google Fonts" is scoped to the app (`framework/design-system`,
`layers/core-ui`); the marketing site deliberately loads two webfonts — a marketing-only exception
consistent with the plan's identity separation.

Type scale (rem at 16px root):

| Step | Spec | Use |
|---|---|---|
| Display / H1 | Grotesk 700, `clamp(2.5rem, 5.5vw, 4.25rem)`, lh 1.05, tracking −0.02em | hero headline |
| H2 | Grotesk 700, `clamp(1.875rem, 3.5vw, 2.75rem)`, lh 1.1, tracking −0.01em | section titles |
| H3 / card title | Grotesk 500, 1.125rem, lh 1.3 | panel + crew titles |
| Body | Grotesk 400, 1.0625rem (17px), lh 1.65 | leads, copy |
| Body small | Grotesk 400, 0.9375rem (15px), lh 1.6 | card dossiers |
| Eyebrow | Space Mono 700, 0.6875rem (11px), uppercase, tracking 0.18em | `[ // SECTION LABEL ]` |
| Mono label / meta | Space Mono 400/700, 0.75rem (12px), tracking 0.06–0.12em | codes, tags, nav links |
| Terminal | Space Mono 400, 0.8125rem (13px), lh 1.9 | hero transcript, quickstart block |
| Big numeral | Space Mono 700, 1.5rem, accent | ethos `01–04`, section indices |

### 2.3 Spacing & layout

- Base unit 4px; rhythm 8px. (Hearth's 6px grid is app-scoped and not reused.)
- Section vertical padding: 120px desktop / 88px ≤1024px / 64px ≤640px.
- Container: max-width 1140px, inline padding 24px (20px mobile).
- Grids: 12-col desktop; gap 20px. Crew grid 4-col → 2-col ≤1024px → 1-col ≤640px.
- Copy measure: leads ≤ 62ch.

### 2.4 Radius & geometry

- Corner radius is **0** everywhere except micro-chips (2px). No rounded-lg+ at all.
- **Notch** = 45° corner cuts via `clip-path`, two sizes: `--notch` 14px (panels, terminal, docs
  cards), `--notch-sm` 8px (code blocks). Cut corners: top-right + bottom-left (asymmetric).
- Notched panels with visible border use the wrapper technique: outer element bg =
  `--border-strong`, clip-path, `padding: 1px`; inner element bg = panel color, same clip-path.
  (clip-path clips borders, so the wrapper *is* the border.)
- **HUD corner brackets**: accent L-brackets (10×10px, 1px) on `.corners ::before/::after`,
  top-left + bottom-right, opacity 0 → 1 on hover. Decorative (`aria-hidden`), never the only
  affordance.

### 2.5 Depth: borders + hard shadows (the founder rule)

No `box-shadow` blur for elevation. Depth vocabulary, in order of use:

1. **Hairline border** — every panel gets 1px `--border-hairline`. This is the default depth.
2. **Double frame** — hero terminal + knowledge ladder: 1px `--border-strong` border +
   `outline: 1px solid var(--border-hairline); outline-offset: 5px`. The "deep border" look.
3. **Hard offset shadow** — interactive hover only:
   `--shadow-hard: 5px 5px 0 0 #040409` and `--shadow-hard-accent: 4px 4px 0 0 var(--accent)`.
   The shadow lives on a `::after` pseudo-element; hover animates the pseudo's **opacity** 0→1
   while the element translates `(-2px, -2px)` — only transform/opacity animate (research rule).
   Primary CTA, ghost CTA, crew cards, docs cards get it; static panels don't.
4. **Glow** — accent elements only: focus ring and primary-button hover
   `box-shadow: 0 0 0 1px var(--accent), 0 0 16px var(--glow)`; text-shadow
   `0 0 18px var(--glow)` on the hero's accent phrase and ethos numerals. Static (not animated),
   ≤ 2 elements per viewport.

### 2.6 Motion

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | entries, hovers |
| `--dur-hover` | 150ms | hover translate/shadow-in |
| `--dur-entry` | 540ms | section/card reveal (research: ~540ms fade+translateY) |
| `--dur-sweep` | 700ms | scan-sweep hover line |
| caret blink | 1.06s `steps(1)` infinite | terminal cursor |

- **Entry reveal**: `.reveal` starts `opacity: 0; translateY(14px)`; IntersectionObserver adds
  `.in` → animates to rest. Stagger max 4 items, 70ms apart (inline `transition-delay`).
- **Hero typing**: transcript is real text in the DOM (renders fully with JS off — AC: no runtime
  calls needed to display). With JS + motion allowed, lines re-play sequentially (per-line type-on
  with a trailing block caret), ~6s total; clicking the terminal completes it instantly.
- **Scan-sweep hover** (feature panels): a 1px translucent line translates top→bottom once per
  hover-enter, transform-only.
- **Atmosphere**: one static scanline overlay (`repeating-linear-gradient`, ~2% white, fixed,
  `pointer-events: none`) + a faint 48px schematic grid behind the hero only. No animated drift.
- **`prefers-reduced-motion: reduce`**: every animation/transition disabled in one media block;
  typing effect never starts (JS checks `matchMedia`); reveals are visible by default; caret is
  static. This is an AC (plan line 40).

### 2.7 Accessibility floor

- Contrast: all text tokens ≥ 4.5:1 on their surfaces (values chosen above; dim floor verified).
- Focus: `:focus-visible` = 1px accent outline, 2px offset + glow ring. Never removed.
- Touch targets ≥ 44px (nav links get padding to reach it; CTAs are 48px tall).
- Semantics: one `h1`; sections `aria-labelledby` their `h2`; terminal transcript is plain text in
  a labelled region (typing is `aria-hidden` duplication-free — JS types into the same nodes, it
  does not duplicate content); decorative brackets/scanlines `aria-hidden`.
- Skip link as first focusable element.

---

## 3. Component recipes

**Button — primary.** `bg: accent; color: accent-ink; border: 1px solid accent; radius: 0;`
Space Mono 700 13px uppercase tracking 0.12em; padding 15px 24px (48px tall). Hover: translate
(−2px,−2px), `::after` accent hard shadow fades in, faint glow ring. Active: translate back to
rest, shadow out. Focus-visible ring per 2.7.

**Button — ghost.** transparent bg, 1px `--border-strong`, text primary. Hover: border + text →
accent, translate + hard accent shadow as above.

**Eyebrow.** Space Mono 700 11px uppercase, accent, wrapped in brackets: `[ // THE LOOP ]`.

**Section header.** Grid: left = eyebrow + H2 + lead (secondary, ≤62ch); right = `SEC.0N` mono dim
index (desktop only). Left-aligned always — no centered headers.

**Panel (base).** `bg-panel`, 1px hairline, radius 0, padding 24px. Variants: `.frame-double`
(2.5.2), `.notch` (2.4), `.corners` (hover brackets).

**Crew dossier card.** Panel base, padding 20px, min-height ~170px. Content stack: role code
(`TEAM/BLD`, mono 11px dim) → name (Grotesk 500 18px) → dossier (15px secondary) → category tag
(mono 10px, 1px border, 2px radius, dim). Hover: corners in, translate + hard shadow. Wide cards
(PM, Facilitators, Strategy) span 2 grid columns and the grid closes with a dashed wide
"assemble your crew → self-host" CTA tile — uneven by construction.

**Terminal window.** `.frame-double` + notch. Title bar: `bg-raised`, bottom hairline, mono 12px —
left `hyperidle://session/0427 — builder@acme`, right `LIVE` + blinking block caret. Body
`bg-inset`, mono 13px/1.9, padding 24px. Line classes: `.t-sys` (dim, `▸` prefix), `.t-name`
(primary 700 + timestamp dim, right-floated), `.t-you` (same, `YOU`), `.t-ok` (accent `✓` line).

**Loop node.** Panel base; mono step `01` (accent), name (Grotesk 500), description (15px).
Connector: 1px `--border-strong` line with `▸` midpoint; horizontal desktop, vertical mobile.

**Code block (quickstart).** `bg-inset`, 1px hairline, notch-sm, mono 13px/2; line numbers dim;
COPY button top-right (ghost, mono 11px) → swaps to `COPIED ✓` for 1.6s. Commands are selectable
text; the button is a convenience, not the only path.

**Nav.** Sticky, `bg-page` solid (no translucency/blur), bottom hairline, 60px tall. Left:
wordmark `HYPERIDLE` Space Mono 700 14px tracking 0.2em + accent block `▮`. Center/right: mono
11px uppercase links (dim → accent on hover), SELF-HOST ghost button. ≤860px: burger → full-screen
`bg-page` overlay, large mono links, same CTA; `Esc` and link-tap close.

**Footer.** Top hairline. 3 columns: brand + tagline "Agents execute. Humans validate. Knowledge
compounds."; doc links; repo links. Bottom bar mono 11px dim: © line + honesty note.

---

## 4. Page structure & copy

Voice: direct, opinionated, factual (Track Z rule: humans and agents collaborate as equals; AI
amplifies human judgment — never "zero-human companies"). No banned superlatives
(seamless/effortless/unleash/powerful/stunning), no lorem ipsum. Every claim below traces to a
doc; claims the docs mark as partial stay partial on the page.

### 4.0 Nav
Links: CREW · LOOP · VIEWS · ETHOS · KNOWLEDGE · DOCS. CTA: SELF-HOST. Wordmark links to top.

### 4.1 Hero — live terminal (AC: first viewport explains what/who/next-step)
Asymmetric 12-col: left 6 = eyebrow `[ AGENTIC OPERATING SYSTEM ]`; H1 **"The operating system
for AI-first companies."** with the accent phrase glowing; sub: *"HyperIdle runs flat teams of
humans and AI agents. You shape the work, agents execute, you validate — and everything they learn
compounds into knowledge the next bet starts with."*; CTAs SELF-HOST QUICKSTART (primary) / READ
THE DOCS (ghost); mono strip `AGENTS EXECUTE · HUMANS VALIDATE · KNOWLEDGE COMPOUNDS`.
Right 6 = terminal window typing the Mika story (real example from
`docs/product/human-ai-collaboration.md` + `how-work-flows.md`):

```
▸ bet activated — payments-beta
▸ task assigned — implement stripe webhook handler
MIKA / BUILDER                                    09:12
Picking up the webhook task. Done condition:
endpoint returns 200 for all test events.
MIKA / BUILDER                                    09:41
Product question before I close this out —
all 27 Stripe event types, or the 4 checkout needs?
▸ handoff → founder
YOU                                               09:44
The 4 for checkout.
MIKA / BUILDER                                    09:47
Shipping. Session notes written back to the store.
✓ review approved — artifact merged
▸ knowledge captured → practice/webhooks
▮
```

Mobile: headline stack first, terminal below.

### 4.2 Character select — the crew (AC: named agent roster)
Eyebrow `[ // CHARACTER SELECT ]`; H2 **"Pick your crew."**; lead: *"A team is agents bound to a
product — not to a task. The roster flexes with what you're building, and every member keeps what
it learns across sessions."* Source: `docs/guides/user/agents.md` (full catalog + categories).

Cards (code · name · dossier — all grounded):
- `TEAM/PM` Product Manager (wide) — "Team lead. Shapes bets, coordinates handoffs, runs the retros. Integrates and unblocks — does not micromanage."
- `TEAM/BLD` Builder — "Shipped auth in January, ships payments in March. Keeps every lesson."
- `TEAM/DSN` Designer — "Owns what the product looks like — inside the system, not around it."
- `TEAM/QA` QA Engineer — "Holds the done condition honest. Tests what the team ships."
- `TEAM/GRW` Growth — "Watches the numbers weekly. Flags the 15% drop before it becomes a quarter."
- `TEAM/BRV` Brand Voice — "Reviews everything that ships publicly against the brand voice."
- `TEAM/OPS` Ops — "Keeps the infrastructure and the process running."
- `TEAM/SUP` Support — "Answers when users hit a wall. Feeds what breaks back to the team."
- `TEAM/SLS` Sales — "Talks to the people who might buy. Brings the signal home."
- `TEAM/CNT` Content Writer — "Writes what the product needs to say."
- `TEAM/DAT` Data Analyst — "Reads the data the product produces. Turns it into decisions."
- `STRATEGY/FAC` Facilitators (wide) — "Five, one per community — build, product, growth, ops, facilitation. They merge what agents learn into knowledge and surface what needs your eyes."
- `STRATEGY` Scout · Infra · Platform (wide) — "Market analysis, shared infrastructure, shared tooling. The background detachment."
- `INDIVIDUAL` Assistant — "One per human. A persistent thread scoped to you — sees what you see, acts on your behalf."
- CTA tile (wide, dashed) — "ASSEMBLE YOUR CREW →" with `git clone · npm install · npm run dev` sub-line, links to #self-host.

Grid: 4-col with the wide cards spanning 2 (uneven by construction). Category tag on each.

### 4.3 The loop (AC: bets → tasks → sessions → review)
Eyebrow `[ // THE LOOP ]`; H2 **"Work flows as bets."**; lead: *"No workflows, no DAGs, no central
planner. Sequences emerge from task dependencies."* Source: `docs/product/how-work-flows.md`.
Four nodes + connectors:
- `01 BET` — "Shaped work with an explicit done condition. draft → active → completed or killed."
- `02 TASK` — "One agent's unit of work. Dependencies unlock the next step — nobody pre-wires the graph."
- `03 SESSION` — "One bounded run on a task. Ends at the context window; notes carry the next one forward."
- `04 REVIEW` — "Where human judgment lands: approve, request changes, edit, reject."
Footnote strip: `ROUTINES — recurring work with persistent memory · calendar / event / heartbeat`.

### 4.4 Three views (AC: defining properties, grounded)
Eyebrow `[ // ONE WINDOW ]`; H2 **"Three views. One window."**; lead: *"A macOS app for human
oversight — everything you do lives in one of three views."* Source:
`docs/guides/user/three-core-views.md`, `what-is-hyperidle.md`. **Deliberately unequal panels:**
- **Conversations** (span 7, tallest): mock thread — Mika's review request chip + `OPEN REVIEW`,
  founder reply, `✓ APPROVED BY YOU` echo. Caption: *"Where you spend most of your time. Humans and
  agents are equal participants; verdicts happen on the review page, not in chat."*
- **Work** (span 5): mock team header `ACME — ACTIVE BETS 2 · HEALTHY` + bet rows with status
  chips. Caption: *"Bets planned and tracked — what every agent is doing and what is blocked."*
- **Knowledge** (span 12, flat table shape): scope pills ALL/SHARED/TEAM/PRIVATE + item rows +
  topic-health meta. Caption: *"One store humans and agents read and write — filtered by scope,
  curated by you."*

### 4.5 Ethos manifesto (anti-enterprise positioning)
Eyebrow `[ // ETHOS ]`; H2 **"Built against the enterprise default."**; lead: *"Four principles
decide what we build and what we cut. They ship in the box."* Source: `ETHOS.md`. Full-width rows,
hairline dividers, accent mono numerals:
- `01 BUILD FOR THE FAST, NOT THE ENTERPRISE` — "No approval chains, no permission matrices, no governance theater. If a feature exists to reassure a risk-averse buyer who isn't ours, it gets cut."
- `02 TRUST AGENTS AND HUMANS` — "Agents act by default. Gates are earned from real outcomes, never built first — security is a learning, not a wall."
- `03 BOIL THE LAKE` — "AI makes completeness cheap. Test every path, read every doc — then stop at the edge of the task. Oceans aren't boilable."
- `04 SEARCH BEFORE BUILDING` — "First principles over familiar patterns. Ask what the user actually needs before adding anything."

### 4.6 Knowledge compounding (the differentiator)
Eyebrow `[ // THE COMPOUND ]`; H2 **"The tenth bet is faster than the first."**; lead: *"What one
agent learns on one product becomes available to every agent in the same practice. Nine bets of
accumulated context are present at session start."* Source:
`docs/product/how-knowledge-compounds.md`, `the-five-layers.md`.
Left: copy + comparison table (typical agent memory vs HyperIdle knowledge — the doc's four rows:
structure / cross-product / curation / human oversight). Right: layer ladder L4 FACTORY → L3
PRACTICE (accent-highlighted, tag `SHARED ACROSS ALL PRODUCTS`) → L2 PRODUCT → L1 TASK → L0
SESSION, each with its cadence (monthly / weekly / per cycle / per task / minutes) and side rails
`PROMOTION ↑ / LOADING ↓`.

### 4.7 Docs teaser (AC: visible path to docs)
Eyebrow `[ // DOCUMENTATION ]`; H2 **"Read the docs."** Two unequal cards (user guide wider):
- **USER GUIDE** — meta list: getting started · the interface · three core views · agents · running your team · deployment → `/docs/user/` (placeholder target per plan; rendered docs are a later WP).
- **DEVELOPER GUIDE** — meta list: getting started · commands · testing · linting · work packages → `/docs/developer/`.

### 4.8 Self-host CTA + footer (AC: self-hosting across laptop/VPS/cloud)
Eyebrow `[ // SELF-HOST ]`; H2 **"Run it yourself."**; lead: *"Your machine, your keys, your data.
HyperIdle self-hosts from a laptop to a cluster."*
- Code block, the real five-command quickstart (`docs/guides/developer/getting-started.md:13-19`):
  `git clone … && cd hyperidle / npm install / npm run setup -- --profile laptop / npm run dev`
  with COPY affordance. (Note: README's local-dev variant is 4 commands without clone; the
  clone-to-run 5-command block is the canonical first-run path — flagged in open questions.)
- Deployment profiles, three rows: **LAPTOP** — embedded PGlite, zero infrastructure; **VPS** —
  Postgres + Docker Compose on your own box; **CLOUD** — managed Postgres, same code path.
  (Source: `docs/deployment/index.md`.)
- Side note: desktop app exists — signed macOS build via DMG or
  `brew tap ambrovia/homebrew-tap && brew install --cask hyperidle` (same source).
- Closing line above footer: **"Agents execute. Humans validate. Knowledge compounds."**
- Footer per §3 + honesty line: "Early and shipping — the rough edges are documented."

---

## 5. Responsive behavior

| Breakpoint | Changes |
|---|---|
| >1024 | 12-col grids, hero 6/6, crew 4-col, loop horizontal |
| ≤1024 | crew 2-col, hero stacks (copy then terminal), section padding 88px, `SEC.0N` hidden |
| ≤860 | nav collapses to burger overlay |
| ≤640 | everything 1-col, loop vertical with vertical connectors, views stack, padding 64px, type at clamp floors |

No horizontal overflow at any width (AC validation scenario). Terminal font drops to 12px ≤640px;
long commands in the quickstart wrap with `white-space: pre-wrap`.

## 6. States this surface has

Static marketing page — state space is small and complete: link/button hover, focus-visible,
active (pressed), copy-button feedback (`COPY` → `COPIED ✓` → back), typing complete, mobile menu
open/closed, reduced-motion variant of all of the above. No loading/error/empty data states exist
(no runtime data). Form factors: the page is the only page in this WP.

## 7. Honesty rules applied

- Only doc-grounded claims (every section cites its source above).
- "Early and shipping" footer line + documented-rough-edges note carry the early-product truth;
  no capability is claimed beyond the docs (e.g. no "autonomous company" framing — collaboration
  model is equals + human judgment per Track Z).
- Docs links are placeholders (`/docs/...`) by plan; the teaser does not promise rendered docs now.

## 8. Open questions / risks for critique

1. **Quickstart variant** — README shows a 4-command local-dev block; the 5-command clone-to-run
   block lives in the developer guide. Design uses the 5-command one (matches maintainer's "5
   commands"). If the maintainer wants the README variant verbatim, swap is one code block.
2. **Webfonts** — two Google Fonts (privacy + self-hosting optics for a self-host product).
   Mitigation: `font-display: swap`, system fallbacks render fine; builder should self-host the
   woff2 files in the site package rather than hotlink Google if feasible (architecture call).
3. **Scanline overlay** — kept at ~2% opacity; if critique finds it noisy it is a one-line delete
   (marked optional polish, not load-bearing).
4. **Terminal typing on mobile** — 13px mono + typing is fine, but if review finds it distracting
   the fallback is instant-render (already the reduced-motion path).
5. **`concept.html` uses placeholder `/docs/` hrefs** — real targets land with the docs-render WP.

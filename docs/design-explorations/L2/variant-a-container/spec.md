# L2 Block — Variant A: Container with payload

> Phase 1 / Variant A. Smallest possible component count. The Block is a thin
> tagged container; the payload does the work. Anchor lives in an ultra-thin
> 16px gutter (4px dot at `--text-lo`, lit on hover/focus). No per-kind chrome
> (no copy buttons on code, no scroll affordances on tables, no expand on
> blockquote). Native HTML elements + DS tokens carry every BlockKind.

## 1. User story

As a founder reading a bet pitch or a knowledge body, I want every markdown
body to render as styled prose with quiet per-block anchors I can grab to drop
a comment, link, or hover preview — without the page turning into a wall of
buttons, language pills, and copy chrome that competes with the writing.

## 2. Component composition

The variant adds **zero new design-system primitives.** The renderer is a
single React component (`BlockView`) plus a content slot whose markup is the
native HTML element for the BlockKind.

| Slot | Element | Tokens consumed |
|---|---|---|
| Block container | `<article class="blockview">` | grid: `16px / minmax(0,1fr)`, `column-gap: 8px` |
| Anchor gutter | `<div class="blockview__gutter">` | `padding-top: 0.5em` (baseline-aligned), `gap: 4px` |
| Anchor dot | `<button class="blockview__anchor">` (4 px circle) | `--text-lo` (idle hover-revealed), `--text-mid` (hover), `--text-hi` (focus); ring `--primary`; transition `--motion-fast` `--motion-ease` |
| Thread-count chip | `<span class="blockview__threadcount">` | `--surface-ghost` bg, `--text-mid` fg, `--mono` font, `11px`, `--r-pill` |
| Heading payload | `<h1>`/`<h2>`/`<h3>`/`<h4..6>` | `--density-text-h1` / `--density-text-h2` / `16px` / `--density-text`; `--leading-heading-lg` (h1) `--leading-heading` (h2..h6); `--fw-emphasis`; `--text-hi` |
| Paragraph payload | `<p>` | `--density-text`, `--leading-body`, `--text-hi` |
| Inline code | `<code>` | `--mono`, `--surface-ghost`, `--border-subtle`, `--r1` |
| Inline link | `<a>` | `--primary`, focus ring `--primary` |
| List payload | `<ul>` / `<ol>` (nested up to 3 levels with native disc/circle/square cycle) | `padding-left: 20px`, `--text-hi`, intra-item gap `2px` |
| Blockquote payload | `<blockquote>` | left rule `--border-emphasis`, `--text-mid` |
| Code block payload | `<pre><code>` | `--surface-2` bg, `--border-subtle`, `--r2`, `--mono`, `13px`, `1.5` lh |
| Table payload | `<table>` | `--density-text`, `tabular-nums`, `--border-subtle` row rule, `--border-default` header rule |
| Divider payload | `<hr>` | `--border-subtle` |
| Image payload | `<img>` | `--r2`, `--border-subtle` |
| Sanitised HTML payload | `<details>` (the GFM-permissible HTML subset) | `--surface-2` bg, `--border-subtle`, `--r2`, summary `--text-hi`, marker `--text-lo`, `transform` rotate `--motion-fast` |
| Unknown sentinel | `<p>` inside a `.blockview--unknown` modifier (dotted underline cue + native `title` tooltip) | `--text-mid`, dotted `--border-emphasis` |
| Block-deleted indicator | `.blockview--deleted` modifier (same shell, no separate component) | left rule `--danger`, bg `color-mix(--danger 8%, transparent)`, label `--danger` mono caps, quote `--text-mid` italic |
| Knowledge meta strip (composed once above the body, NOT per-block) | re-uses Tag + StatusChip pill geometry (2px 8px / `--r-pill` / `--mono` 11px) directly — these primitives already exist | `--surface-ghost`, `--ok` for status, `--text-mid` / `--text-lo` |

DaisyUI: none used. Existing custom components touched: none modified. The
KnowledgeDetail meta strip is **not a new component** — it reuses the literal
chip geometry from `StatusChip` and `Tag`. Replacing the strip with the
existing `<StatusChip>` / `<Tag>` React components is a straight swap at
implementation time.

## 3. Information hierarchy

Per block, top-to-bottom inside the container:

1. **Anchor + thread chip** (gutter, 16 px column, recedes by default).
2. **Payload** (the heading, paragraph, list, table, etc. — full visual weight).

Per surface, top-to-bottom on the page:

1. **Breadcrumb** (`crumb` mono caps).
2. **Meta strip** (Knowledge only — pills) OR **BetCard summary** (Bet only,
   already present upstream of this renderer).
3. **Block stream** — `BlockView`s rendered in document order, separated by an
   8 px vertical gap (no rule, no card chrome between them).

## 4. States

| State | Behaviour |
|---|---|
| **Empty body** | Renderer emits no `BlockView`s; the parent surface shows the existing `EmptyState` ("No content yet"). The renderer never renders an empty `.blockview` shell. |
| **Loading** | Surface shows the existing `Skeleton` block (3-row stub mirroring h2 + paragraph + list); renderer is not mounted until the body resolves. |
| **Error parsing one block** | The bad block is emitted as a single `unknown` (sentinel) — never throws, never blocks neighbours. The dotted-underline + `title` tooltip surfaces "unsupported syntax". The rest of the body renders normally. |
| **Populated** | Default — see screenshot. Anchors hidden until per-block hover/focus; thread-count chips visible whenever the L1 query returns >0 attached threads for the block id. |
| **Very long body (overflow)** | No artificial truncation. Code blocks scroll horizontally inside their `<pre>` (native `overflow:auto`); tables scroll horizontally inside the surface's overflow context (designer trade-off — see §8). Lists wrap normally. |
| **Block with attached thread** | The gutter renders a `blockview__threadcount` chip showing the count beneath the anchor dot. Click target is the chip; click opens the thread (delegated by the parent surface, not by the renderer). |
| **Block deleted** (anchored thread points at a missing blockId) | Renderer emits a `.blockview--deleted` shell at the next-best location with the original anchor text quoted inline (italic) and a mono "BLOCK DELETED" label in `--danger`. Thread count chip in the gutter retains the orphan-thread count; chip background switches to a `--danger` ghost tint. |

## 5. Behaviour

| Concern | Spec |
|---|---|
| Hover (block) | `:hover` on `.blockview` → anchor dot fades to opacity 1 over `--motion-fast`. No layout shift; only `opacity` and `background` animate. |
| Hover (anchor) | `:hover` on `.blockview__anchor` → dot brightens from `--text-lo` to `--text-mid`; gutter cell gains `--surface-ghost` background. |
| Focus | Anchor is a real `<button>` and joins the page tab order. `:focus-visible` paints a 1 px `--primary` outline at offset 1; dot brightens to `--text-hi` and stays visible. |
| Focus (whole block) | `:focus-within` on `.blockview` reveals the anchor dot — same opacity-1 state as hover. Lets keyboard users see "I'm on a block" without first tabbing to the dot. |
| Click (anchor) | Copies the deep-link URL `?block=<blockId>` to clipboard (handled by the wrapping React component, not the CSS). The button's `aria-label` is `Copy link to <kind>`. |
| Click (thread chip) | Delegated upward via `onClick` to open the thread side panel. |
| Keyboard nav | `Tab` walks anchors in document order. The renderer does NOT introduce J/K bigrams or vim-style nav — that conflicts with global app shortcuts and would force a new shortcut surface. The architect can layer a `useArrowNav` hook around `BlockView`s if a power-user request lands, without changing the primitive. |
| Reduced motion | Inherits `tokens.css`'s media block — every `--motion-*` collapses to 1 ms. The dot reveal becomes an instant cut, the `<details>` chevron rotation is instant. No explicit code in the variant; the tokens carry it. |
| Transitions named | `opacity` (anchor reveal) — `--motion-fast` `--motion-ease`; `background` (anchor hover ring + gutter ghost) — `--motion-fast`; `transform` (`<details>` summary chevron rotate) — `--motion-fast`. Nothing slow; nothing animates layout properties. |

## 6. Mobile adaptation (≤640 px)

- The 16 px gutter collapses to 0 px width. The anchor moves into an absolute
  position on the left edge of the block (`left: -2px`) so it can still be
  tapped without stealing horizontal real estate.
- The anchor dot is hidden by default (no `:hover` on touch). It reveals on
  `:focus-within` — i.e. after the user taps the block. This stands in for
  long-press without registering a custom gesture: tapping a block focuses it,
  the dot appears, second tap copies the link.
- The thread-count chip moves to the top-right corner of the block content
  (`position: absolute; right: 4px; top: 0`), and content grows a `24 px`
  right padding so the chip never overlaps text.
- The two side-by-side surfaces collapse to a single column.
- `--density-pad-y` and `--density-text` already auto-flip to `comfortable`
  at viewport ≤ 1024 px (per AESTHETICS.md § Mobile & Touch). The variant
  inherits that flip — no per-component override needed.

## 7. Signature

A 16 px gutter with a 4 px dot at `--text-lo` opacity that lights up only on
hover or focus. No per-kind chrome anywhere — the markdown is the content,
the block is invisible scaffolding. If you remove the gutter, the page is
indistinguishable from a static markdown render.

## 8. Trade-offs

- **No per-kind affordances.** Code blocks have no copy button, tables have no
  scroll affordance hint, blockquotes don't expand. Power users can still
  select-all-copy, but discoverability is lower than a chromed approach.
- **Anchor discoverability.** The 4 px dot is invisible until hover/focus —
  by design (deference, restraint), but a first-time user may not realise
  per-block anchors exist until they hover. Mitigation: the existing
  product onboarding surface introduces the anchor; not the renderer's job.
- **Tables can overflow.** With no scroll-shadow / scroll-hint chrome, a
  wide table on a narrow surface scrolls horizontally without telegraphing
  it. Mitigation: GFM tables in HyperIdle are typically ≤ 4 columns; if a
  pathological case lands, the architect can add an `overflow-x: auto`
  wrapper *outside* the renderer (page-level), which is still composition,
  not new chrome.
- **No language label on code.** Loses information. The variant accepts this:
  the code itself usually telegraphs the language; if not, the writer can
  add a sentence above the fence.
- **No drag affordance** for re-ordering blocks. The L2 story names "drag" as
  a per-block affordance; this variant deliberately omits it (drag-and-drop
  on a markdown body would require either re-writing the source markdown or
  storing per-block order separately, which violates §8.5/1). Re-ordering
  is the writer's job, in their editor of choice.
- **Single flat reading rhythm.** Every BlockKind sits at the same visual
  weight (no card boundaries, no kind-specific padding). Cleanest possible
  reading flow; weakest possible visual scan if the body is long.

## 9. Open questions for the architect

1. **Markdown parser choice.** `remark + remark-gfm` is the obvious fit
   (deterministic, GFM-faithful, runs in both Node and browser); the variant
   doesn't depend on the choice but the architect should confirm pure
   determinism (no plugin pulls in time/random).
2. **Sanitiser policy for `html` blocks.** GFM permits a subset of inline +
   block HTML. The variant assumes `<details>`, `<summary>`, `<kbd>`,
   `<sub>`, `<sup>` survive. Anything stripped by the sanitiser falls back
   to a paragraph showing the original source (per §6 of BLOCKS.md). The
   exact allowlist is an architect call.
3. **Code-block syntax highlighting.** The variant ships **no** highlighter.
   If the architect adds one (Shiki, Prism), it should run server-side at
   render time (not in the cold path of the React tree) and emit the same
   inert `<pre><code>` shell with token spans. The CSS in the variant does
   not assume highlight markup; adding highlights does not require renderer
   changes.
4. **Cache placement.** Per BLOCKS.md §10, derivation lives in
   `packages/shared`. The variant is renderer-side; cache placement
   (in-memory per process / `block_cache` table / React Query cache) is a
   pure architect call and does not affect the markup.
5. **Thread-count derivation.** The chip count needs to come from a query
   that joins the block ids of a body to L1 threads with
   `attachedTo.kind = "block"`. Can this run as a single batched lookup
   (one query per body returning a `Map<blockId, count>`), or does each
   block fetch its own count? The variant assumes the batched lookup; the
   architect can confirm.
6. **`unknown` tooltip surface.** The variant uses the native `title`
   attribute for the "unsupported syntax" cue. A richer popover would
   require introducing a new tooltip primitive, which the variant
   explicitly avoids. If the team later ships a shared tooltip primitive
   for the design system, the renderer can adopt it without spec change.
7. **Front-matter rendering.** Per BLOCKS.md §6, body metadata rides as a
   sibling field, not a Block. The variant does not render metadata —
   consumers (Knowledge index, diagnostics panel) read it directly. The
   architect should confirm we never need to render metadata inside the
   block stream.

## 10. Verification — how this variant proves L2's acceptance criteria

| Criterion | Variant proves it via |
|---|---|
| "no literal markdown syntax visible" (Playwright e2e) | Native HTML elements per BlockKind. Screenshot has zero `#` / `*` / `>` / fence backticks visible. |
| "block ids stable" | Variant doesn't compute ids — that's the derivation function. The renderer accepts the id as a `data-block-id` attribute and never derives or mutates it. |
| "lossless round-trip" | Variant doesn't lossy-format anything. Inline marks render as native `<strong>`/`<em>`/`<code>`/`<a>`. Code blocks preserve verbatim text. Image alt-text is preserved on the `<img>`. |
| "block-anchor is the primitive's own affordance" | The `data-block-id` + visible dot **is** the anchor. No separate linking primitive is touched. |
| "DS quality" | Every spacing, color, radius, and motion value comes from `tokens.css`. Off-grid spacing zero. Off-scale font sizes zero. AI-aesthetic anti-patterns: zero (verified against AQ-101..AQ-113). |

## 11. Self-critique (run against `screenshot.png`)

| Dimension | Score | Note |
|---|---|---|
| 1. Visual hierarchy | 8 | Heading sizes step cleanly; `--text-mid` recedes for blockquote and meta strip; the meta strip's status pill is the only `--ok` colour on the page. Body type weight differential between heading (600) and paragraph (400) carries the scan. Could be 9 if the H1 had slightly more breathing room above. |
| 2. Spacing | 8 | All padding / gap values are token-bound: 8/12/16 grid. Inter-block gap is 8 px (intentional — power-user density). The `--density-pad-*` ladder is honoured by both surfaces. Could push to 9 by tuning meta-strip → first-block gap (currently 12 px, feels right but margin-collapse with `<h1>` is borderline). |
| 3. Color | 9 | Lucid Dark monochrome surface ladder, single accent `--primary` for links and focus rings, `--ok` only on the validated status pill, `--danger` only on the deleted-block indicator. No purple gradients, no decorative tint. |
| 4. Typography | 8 | Geist UI for prose, Geist Mono for code/labels/IDs, hierarchy via size + weight. H1 gets `letter-spacing: -0.005em` (tightening for display sizes — in token-allowed range). Tabular-nums on the table. The literal `13px` font-size on `<pre>` is on the allowlist {11,12,13,14,15,16,18,20,24}. Could be 9 with explicit `font-feature-settings` on the mono blocks. |
| 5. Density | 9 | Inter-block gap 8 px, list line gap 2 px, table row pad 6 px / 8 px. The whole body packs more information per scroll-screen than the existing `<pre>` fallback while still being legible. Variant's defining trait. |
| 6. Aesthetic coherence | 9 | One container shape, one anchor pattern, no per-kind chrome. The deleted-block indicator and unknown sentinel both reuse the same `.blockview` shell with a modifier. Reads as one primitive, not eleven. |
| 7. State coverage | 8 | Hover, focus, populated, with-thread, deleted, unknown — all painted in the mockup. Empty + loading punted to existing `EmptyState` / `Skeleton` (correct composition; not a gap). Error parsing punted to the `unknown` sentinel (correct). |
| 8. Premium polish | 7 | Quiet confidence — anchors recede, no shouting chrome. Loses a point on missing micro-detail: no scroll-shadow on `<pre>`, no caret/cursor preview on `<a>` hover. Acceptable trade-off given the "smallest possible component count" thesis. |
| 9. Accessibility | 9 | All anchors are real `<button>`s with `aria-label`, in the tab order, with visible `:focus-visible` rings (`--primary`, 1 px, offset 1). Headings are semantic `<h1..h6>`. Tables use `<thead>`/`<tbody>`/`<th>`/`<td>`. `<blockquote>` and `<details>` semantics preserved. `prefers-reduced-motion` honoured via tokens. Image carries `alt`. Touch targets: anchor button is 16 × 16 — **below** AQ-015's 44 px mobile floor. **Mitigation**: on mobile (`≤ 640 px`), the entire block surface becomes the focus-within target via tap, which IS ≥ 44 px tall for any non-empty block; the dot itself becomes a visual cue, not the touch target. The architect should verify the implemented React component sets a 44 px hit area on the anchor at the mobile breakpoint (e.g. `::before` pseudo expanding the click region) before ship. |

**Total: 75 / 90.**

Lowest: Premium polish (7) — accepted trade-off for the variant's thesis.
Mitigation noted above for accessibility's mobile touch-target sub-concern.

---

## Appendix — design-lint mental check

| Rule | Pass? | Note |
|---|---|---|
| AQ-001 off-grid spacing | ✓ | All paddings on 4 px grid; the `0.5em` baseline-align on the gutter is a relative offset, not a layout token. |
| AQ-002 density tokens | ✓ | `--density-pad-x`, `--density-text`, `--density-text-h*` consumed. |
| AQ-004 closed type scale | ✓ | All sizes in the {11,12,13,14,15,16,18,20,24,26,28} allowlist. |
| AQ-006 tabular-nums | ✓ | Applied on tables. |
| AQ-007 caps tracking | ✓ | All uppercase mono labels carry `--tracking-caps`. |
| AQ-008 no hardcoded colors | ✓ | Zero hex / raw Tailwind palette in CSS. `color-mix(...)` only over tokens. |
| AQ-009 no pure black | ✓ | Background `--surface-0` (`#111113`). |
| AQ-011 closed radius scale | ✓ | `--r1`, `--r2`, `--r-pill` only. No `rounded-2xl`. |
| AQ-012 shadow restraint | ✓ | No card shadows; surface ladder only. |
| AQ-013 motion tokens | ✓ | `--motion-fast` + `--motion-ease`. |
| AQ-014 reduced-motion | ✓ | Inherits tokens.css media block. |
| AQ-101 no rounded-2xl | ✓ |  |
| AQ-102 no purple gradients | ✓ | Zero gradients. |
| AQ-103 no oversized padding | ✓ | Max card pad 16 px. |
| AQ-104 no hero | ✓ |  |
| AQ-105 no emoji icons | ✓ | Zero emojis (also a hard rule per L2 contracts). |
| AQ-107 no glass morphism | ✓ |  |
| AQ-108 no 3-col card grid | ✓ | Two-column layout; no decorative grid. |
| AQ-109 no Lorem | ✓ | All copy is realistic intake-latency / routing content. |
| AQ-110 no marketing superlatives | ✓ |  |
| AQ-113 no over-iconification | ✓ | Zero icons. |

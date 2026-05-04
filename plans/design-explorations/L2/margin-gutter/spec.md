# L2 Block primitive — Variant A: `margin-gutter`

> Anchor affordances live in a fixed left margin gutter alongside the body. Body is clean prose; the gutter is the single surface where you engage. Notion / Google Docs comment-gutter shape, restated for HyperIdle.

## Signature

The eye lands on **clean prose** in a centered body column; a fixed-width **gutter on the left** carries the per-block affordance: a discussion bubble icon revealed on hover for empty blocks, and a persistent cluster (count + stacked sender avatars) for blocks that already carry anchored discussion. Spatial separation is the design language — the body is the gift, the gutter is where you act. The page reads like a document; the gutter is the only surface that admits "this is a system, not just text."

## User story

A founder reading a knowledge body — Stripe webhook signing — wants to read uninterrupted prose, then react to a specific paragraph or list-item by anchoring a discussion to it; the affordance is one mouse-flick to the left of the line they were reading on, and blocks with existing discussion advertise themselves passively in the same gutter so wayfinding never costs a hover.

## Component composition

`MarkdownBlockView` (region) renders the body. `BlockGutter` (block) renders the per-block anchor surface. They are visually adjacent, structurally decoupled — the body component does not know about anchors; it surfaces a focusable per-block target that the gutter aligns with vertically.

| Component | Tier | Slot / props | Composes |
|---|---|---|---|
| `MarkdownBlockView` | 3 (region) | `{ host, blocks, anchors? }`. `host` carries `{ kind: "knowledge_item" \| "bet", id }`. `blocks` is the derived block list (server-computed). `anchors` is the optional `Map<block_id, AnchorCluster>` passed by the consumer (L26 binds it; L23 mounts without anchors as a fallback). Renders the body as a CSS grid: a fixed gutter column on the left, a body column on the right. Owns the column geometry and the per-block row alignment. | `MarkdownBlockRow` (internal), `BlockGutter`, `BlockAnchorLost` |
| `MarkdownBlockRow` | (internal — not a separately exported primitive) | One row of the grid: a `BlockGutter` cell on the left, a per-kind block renderer on the right. Aligns vertically by sharing a CSS subgrid row. Carries `data-block-id`, `data-block-kind`, `data-anchor-state` for the gutter to read via aria/sibling-selector — not via prop drilling into the body renderer. | one of `HeadingBlock`, `ParagraphBlock`, `ListBlock`, `CodeBlock`, `QuoteBlock`, `TableBlock`, `HrBlock`, `ImageBlock` |
| `BlockGutter` | 2 (block) | `{ blockId, kind, anchor: AnchorState }` where `AnchorState = "none" \| { count, senders: Sender[3], unread: boolean }`. Renders one of: nothing (default for `kind="hr"`), a transparent slot that materialises a `Bubble` icon on hover (`anchor: "none"`), a persistent **cluster indicator** (`anchor: { count, … }`). Click target opens an anchored thread input (the input itself is L26's surface; this primitive only emits the anchor coordinate `(host_id, block_id)`). | inline SVG `Bubble` glyph, inline `Avatar` discs (24×24 max 3 stack + `+N`) |
| `BlockAnchorLost` | 2 (block) | `{ messages: AnchorLostMessage[] }`. Foot section under the body. Single header row in the gutter style + a stacked list of orphaned messages, each with one mono-sm `anchor lost` indicator and the message body. No "deleted" vs. "edited" distinction (per BLOCKS.md §6.1). | `Tag` (kind=`pattern` 12% tint for the indicator) |

`MarkdownBlockView` and `BlockGutter` are the two L2-specific exports. `BlockAnchorLost` is a sibling primitive in this family but not part of the per-block grid — it lives outside the grid as a single bottom region.

## Information hierarchy

Reading order, left-to-right, top-to-bottom:

1. **Body column (center)** — the prose. The user reads this first and last. H1 dominates the top; paragraphs flow at `--leading-body`; H2 sectionals break rhythm; lists, code, quote interleave.
2. **Gutter column (left)** — silent for empty blocks; visually present (a count + 1-3 stacked 16 px avatar discs) for blocks with discussion. The eye picks up the cluster at the periphery while reading the body — wayfinding for "what's been discussed."
3. **On hover anywhere in a row** — the gutter materialises a single `Bubble` glyph at the row's height, fading in over `--motion-fast` (80 ms) with a 2 px right-translate. Click → anchored thread input opens (L26 binds; this spec only emits the coordinate).
4. **Anchor-lost foot section** — appears only when at least one anchor lost message exists, rendered as a single horizontal rule + a row of orphaned messages indented to the gutter width. Reads after the body, never inside it.

## Per-kind block rendering rules

Tokens drive everything; no raw px outside the inline avatar size and the gutter width (which are designer-call gutter constants documented in this section).

- **`heading`**
  - H1 (level 1): `font-size: var(--density-text-h1)`, `font-weight: var(--fw-emphasis)` (600), `line-height: var(--leading-heading-lg)` (1.2), `color: var(--text-hi)`, top margin `0` (it is the title), bottom margin `var(--density-gap)`.
  - H2: `font-size: var(--density-text-h2)`, `font-weight: var(--fw-emphasis)`, `line-height: var(--leading-heading)` (1.25), `color: var(--text-hi)`, top margin `calc(var(--density-gap) * 2)`, bottom margin `var(--density-gap)`.
  - H3-H6: each one step smaller via the inline emphasis ladder: H3 = `var(--density-text)` × 1.125 (`--fw-emphasis`), H4-H6 = `var(--density-text)` (`--fw-medium`). Level scaled by weight + tracking, not by tinting (no rainbow heading tree).
  - Anchor target: yes. Anchor cluster on H1 looks visually identical to one on a paragraph — no special treatment.

- **`paragraph`**
  - `font-size: var(--density-text)` (15 px default), `line-height: var(--leading-body)` (1.55 default), `color: var(--text-hi)`, vertical rhythm = `var(--density-gap)` between paragraphs.
  - Inlines:
    - **bold** = `font-weight: var(--fw-emphasis)`.
    - *italic* = `font-style: italic`, `color: var(--text-hi)` (no tint).
    - `inline code` = `font-family: var(--mono)`, `font-size: 0.875em`, `background: var(--surface-ghost)`, `padding: 1px 4px`, `border-radius: var(--r1)`, `color: var(--text-hi)`.
    - `[link text](href)` = `color: var(--primary)`, no underline at rest, underlined on `:hover` and `:focus-visible`. (Lucid Dark `--primary` is paper-blue `#e0e7ff`.)
  - Anchor target: yes. The most common anchor host.

- **`list`** (`ordered` and unordered)
  - Outer `list` block has `padding-left: 0` — the marker indent lives entirely inside `list_item`. This keeps the body column edge crisp.
  - Vertical gap between siblings: `var(--density-card-gap)` (8 px default).
  - Tight lists (no blank line between items in source) collapse the gap to 4 px (compact tier `--density-card-gap`).
  - Nested lists indent by `var(--density-pad-x)` (16 px default).
  - Anchor target: yes for the list block; per-item anchoring is on the `list_item`.

- **`list_item`**
  - Marker (`•` for unordered, `1.` `2.` `3.` for ordered, all rendered as the canonical glyph; ordered uses `font-variant-numeric: tabular-nums` so the index column stays vertical).
  - Marker `color: var(--text-mid)`, body `color: var(--text-hi)`.
  - Marker indent: `1.5em` from the list-item edge so multi-line wrap aligns under the body (not under the marker).
  - Anchor target: yes — list items are first-class blocks. This is load-bearing because the brief's example anchors a 3-message discussion on item #2 of an ordered list.

- **`code`** (fenced, with language)
  - Container: `background: var(--surface-2)`, `border: 1px solid var(--border-subtle)`, `border-radius: var(--r2)` (8 px), `padding: var(--density-pad-y) var(--density-pad-x)`.
  - Language tag: top-right, `font-family: var(--mono)`, `font-size: 11px`, `color: var(--text-lo)`, `letter-spacing: var(--tracking-caps)`, uppercase. No background — sits on the code surface.
  - Code text: `font-family: var(--mono)`, `font-size: 13px` (one notch under body for density), `line-height: 1.5`, `color: var(--text-hi)`. No syntax highlighting in this primitive (out of scope; downstream `CodePreview` may layer it on later).
  - **Overflow:** the code element has `overflow-x: auto`. Long lines do **not** wrap; they horizontally scroll inside the code block's own surface. The body column width never expands. Scroll bar is the standard 8 px Lucid track (`--surface-5` thumb on `transparent` track per `_tokens.css`).
  - Anchor target: yes.

- **`quote`**
  - Container: `border-left: 2px solid var(--surface-5)`, `padding-left: calc(var(--density-pad-x) - 2px)`, `color: var(--text-mid)` (de-emphasised — quotes are someone else's voice, not the author's).
  - Inner blocks (a quote can wrap arbitrary structure per BLOCKS.md §5.2) inherit the de-emphasised color via the parent rule; bold/italic still apply via inline weight.
  - Anchor target: yes. The brief's example anchors 1 unread message on the quote.

- **`table`**
  - Container: `width: 100%`, `border-collapse: collapse`, `font-size: var(--density-text)`. `font-variant-numeric: tabular-nums` on every cell (per AQ-006).
  - Header row: `background: var(--surface-2)`, `text-align: left`, `font-weight: var(--fw-medium)`, bottom border `1px solid var(--border-default)`.
  - Body rows: bottom border `1px solid var(--border-subtle)` between rows, no row hover treatment (read-only prose, not an interactive list).
  - Cell padding: `calc(var(--density-pad-y) / 2) var(--density-pad-x)`.
  - **Overflow:** if the table is wider than the body column, wrap the `<table>` in `overflow-x: auto`. Body column width never expands.
  - Anchor target: yes for the `table` block. `table_row` is also a valid anchor target per the closed kind enum (so a discussion can scope to one row).

- **`hr`**
  - Single hairline rule: `border: 0`, `border-top: 1px solid var(--surface-3)`, `margin: calc(var(--density-gap) * 2) 0`.
  - **Not anchorable** — the gutter cell renders as fully empty for `hr`. No bubble on hover, no cluster ever. (Per BLOCKS.md §6, `hr` is not a valid anchor target.)

- **`image`**
  - `max-width: 100%`, `height: auto`, `border-radius: var(--r2)`, `border: 1px solid var(--border-subtle)` (subtle frame so light images don't bleed into `--surface-1`).
  - `alt` text reads to assistive tech via the native `<img alt>` attribute; no caption rendering in this primitive (markdown grammar gives us `alt`, `src`, `title` and we use exactly those).
  - Anchor target: yes.

## All states

### Empty body
A knowledge item whose `body` is `""`. The grid still renders so the gutter does not vanish layout-wise, but the body column carries a single centered `EmptyState` row with mono-sm copy `no body yet — start typing to begin` in `--text-lo`. The gutter shows nothing (no anchor possible without a block). On `EditorMode` (out of scope for L2), the editor takes over the body column.

### Populated body
The Stripe webhook content renders as: 1 H1 → 4 paragraphs → 1 H2 → 1 paragraph → 1 ordered list (3 items) → 1 code (TS, fenced) → 1 H2 → 1 unordered list (2 items) → 1 quote. Mockup demonstrates this shape verbatim.

### Hover (block-with-no-anchors)
The user moves the cursor anywhere within a row (gutter cell + body cell are siblings of the same grid row). The gutter cell's `Bubble` glyph fades from `opacity: 0` to `opacity: 0.6`, with `transform: translateX(2px)` in the same `var(--motion-fast)` `var(--motion-ease)` transition. The body itself does **not** receive a hover treatment — no background tint, no chrome on the prose. The gutter is the only surface that reacts.

On `:focus-visible` of the row's keyboard entry point, the same `Bubble` reveals at `opacity: 1` (fully present, since focus is an explicit declaration of intent). Founder filter rules out keyboard verb shortcuts, but the row itself is still tab-stoppable for assistive tech.

Click on the bubble (or on the same gutter slot when it's already showing a cluster) → emits `(host_id, block_id)` → opens the anchored thread input (L26 surface; not rendered in L2).

### Block-with-1-anchored-message (gutter cluster, persistent)
The gutter cell renders **always-on**: a single 16 px `Bubble` glyph + `1` count in `mono-sm` (`var(--text-mid)`) + 1 sender avatar disc (16 px, monogrammed initial, `--surface-5` background, `--surface-2` ring 1.5 px). If the message is unread, the avatar disc carries a 4 px outer ring in `--primary` (Lucid Dark indigo-paper). Spacing inside the cell: `gap: 4px` (sub-grid 2 px / 4 px is allowed under AESTHETICS.md for chip internals; here it's an icon-cluster internal).

### Block-with-N-message-discussion (gutter cluster + count + avatar stack)
Cluster shape: `Bubble` glyph + `count` (`mono-sm`) + up to 3 stacked sender avatars (each 16 px, overlapping by 4 px). If `count > 3`, a `+N` chip replaces the 3rd avatar (`--surface-4` background, `mono-sm`, e.g., `+5`). All avatars are monogrammed initials (no decorative icon, no emoji). The cluster reads as a single visual unit — the user knows by glance how busy a block is.

The brief's exemplar: ordered-list item #2 carries a 3-message resolved discussion → cluster shows `Bubble + 3 + 3-avatar stack`. The fact that the discussion is resolved is **not** badged in the gutter — the gutter is for wayfinding, not state. Resolution chrome belongs in L26's expanded thread surface.

### Anchor lost (foot of body)
After the last block, a single hairline rule. Below it, a `BlockAnchorLost` region:
- A single header row indented to the body column: `mono-sm` `ANCHOR LOST · 1 message` in `--text-lo`.
- One row per orphaned message, each row carries:
  - left side (gutter-aligned): a small `pattern`-tint `Tag` reading `anchor lost`.
  - body side: sender + role tag + 1-line body of the message + relative timestamp (`--text-lo`).
- No "Re-anchor" affordance in this primitive — that's L26 too. L2 surfaces honestly.

The brief's exemplar: `Builder: "Added the timestamp check; tests pass"` with `anchor lost`.

### Long code overflow
The code block in the populated body deliberately includes one line wider than the body column (the `stripe.webhooks.constructEvent(rawBody, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET, …additionalArgsForReplayProtection)` form). The block's inner `<pre>` scrolls horizontally; the body column width is unchanged; the gutter cell stays aligned with the code block's first visual row.

### Narrow viewport (graceful degradation)
The knowledge body is desktop-only per HIL §4.4. But under 768 px viewport width:
- The gutter **does not disappear** — the affordance is non-negotiable. It collapses from 56 px to 32 px wide.
- Cluster indicators in the narrow gutter render as `count`-only (no avatar stack — there's no horizontal room). The hover bubble still reveals.
- The body column gets every remaining horizontal pixel.
- The anchor-lost foot wraps gracefully — the gutter-aligned `anchor lost` tag stays in line, the message body wraps below if cramped.

This is not a "mobile experience"; it is a "narrow-window-on-a-laptop" graceful degradation. Mobile users do not visit knowledge bodies (HIL §4.4).

## Behavior + motion

- **Hover reveal.** Bubble glyph fades and translates: `opacity 0 → 0.6` and `translateX(0 → 2px)` simultaneously over `var(--motion-fast)` (80 ms) with `var(--motion-ease)`. Animates only `opacity` and `transform` (per AQ-014). On row leave, reverses over `var(--motion-fast)` directly.
- **Cluster pop-in.** Newly-anchored messages cause the gutter cluster to render — for the lifetime of L2 the cluster simply appears (no dramatic motion); a future enrichment may add a 150 ms `opacity` fade-in on the first paint. Not load-bearing for the spec.
- **Click target.** The entire gutter cell (`min-width: 56 px` × the row's height) is the click target — not just the bubble pixel. This satisfies AQ-015's 44 px touch-target floor on every row at desktop density.
- **Focus management.** Each block is a `tabindex="0"` element via the inner per-kind renderer. `:focus-visible` outline = `1px solid var(--primary)` with `outline-offset: -1px`. The gutter glyph reveals on focus, mirroring hover behavior.
- **No keyboard verb shortcuts.** Founder filter — the L2 brief explicitly rules these out. (No `c` to comment, no `r` to anchor.)
- **Reduced motion.** `prefers-reduced-motion: reduce` collapses all transitions to 1 ms (handled by the global `_tokens.css` block; this primitive does not need its own override).

## Mobile adaptation

Knowledge body is desktop-only per HIL §4.4. The bet pitch body **is** seen on mobile (Work view). Both surfaces should degrade gracefully under narrow viewports — see "Narrow viewport" above. The gutter never disappears; it always carries the affordance.

The mobile bet-pitch surface is governed by the Work view's three-tab mobile layout. The pitch body renders inside that tab's main scroll region; the L2 grid keeps a 32 px gutter on the left and consumes the rest for the body. No mobile-specific rendering is invented here.

## Trade-offs (what this variant is bad at)

- **Persistent left gutter eats horizontal real estate.** On narrow / windowed views, 56 px is real. We collapse to 32 px under 768 px width but cannot drop to zero without losing the affordance. Variant B (inline-reveal) reclaims this entire column.
- **Discussion density not visible mid-prose.** A reader scanning the body sees clusters in the periphery but won't read the cluster *count* without flicking the eye left. Variant C's right-rail makes density a heat map at the body's edge.
- **Hover-only reveal punishes touchpad-light users.** A user who navigates by trackpad without hovering rarely sees the bubble until they happen to mouse over a block. The persistent-cluster strategy mitigates this for blocks with discussion, but empty blocks remain hover-gated.
- **Stacked avatars at 16 px lose detail fast.** Three discs of 16 px with 4 px overlap is 40 px; recognising who's who requires monograms; first-name visibility is gated on hovering the cluster (out of scope for L2 to render hover-tooltips). Power users who care about *who* is in a discussion will tap through.
- **Anchor-lost row grouping is single-region.** All orphaned messages aggregate into one foot section. If a body has 12 anchor losses, it's a long foot. We do not paginate it in L2 — that's a future enrichment.

## Anti-convergence audit (vs. B and C)

| Axis | This variant (margin-gutter) | B (inline-reveal) | C (always-on-rail) |
|---|---|---|---|
| Hierarchy | prose dominates; gutter is peripheral | prose flows then anchor sits at block trailing edge | prose center, persistent right rail with badges |
| Density | clean (body has zero chrome) | medium (inline action chrome at block end) | max (persistent badge per block) |
| State strategy | hover for empty, persistent for anchored | hover-only for both | always-on for both |
| Action surface | left margin gutter | inline trailing edge of block | right vertical rail |
| Composition | 2 components (`MarkdownBlockView` + `BlockGutter`) | 1 component (renderer carries inline affordance) | 3 components (renderer + `BlockRail` + `RailExpander`) |

This variant differs from B on **density / state strategy / action surface / composition** (4 axes) and from C on **density / state strategy / action surface / composition** (4 axes). Both pairs clear the 3-axis anti-convergence floor.

## Tokens & rules audit

- All paddings consume density tokens (`--density-pad-*`, `--density-card-pad`, `--density-card-gap`, `--density-page-gutter`). Gutter width is the only designer-call literal: 56 px default, 32 px under 768 px viewport — both rounded to the 4 px grid (AQ-001).
- All colors are semantic tokens — `--surface-{0..6}`, `--text-{hi,mid,lo}`, `--border-*`, `--primary`. No hardcoded hex.
- All radii on the closed scale: `--r1` (4 px) for chips/inline-code, `--r2` (8 px) for code blocks/images, `--r-pill` for the `+N` chip and avatar discs. No `rounded-2xl` / `rounded-3xl` (AQ-101).
- No purple/indigo gradients (AQ-102) — `--primary` is the only accent and is used flat (avatar unread ring).
- No emoji as iconography (AQ-105) — the bubble glyph is an inline SVG path, not a 💬 codepoint.
- Spacing on the 4 px grid; the only off-grid value is the 4 px avatar overlap inside the cluster (allowed sub-grid per AESTHETICS.md for chip/icon internals).
- Motion via `var(--motion-fast)` + `var(--motion-ease)` only. No bare `duration-[Nms]`. Only `opacity` and `transform` are animated (AQ-014).
- No keyboard verb shortcuts (founder filter).
- No optimistic-UI bragging — anchor clusters appear without dramatic motion.
- No drag-reorder of blocks (founder filter).
- No new markdown dialect, no visible block ids in copy (`data-block-id` only on DOM for scroll anchors).
- Lucid Dark is the canonical screenshot; the file renders correctly in Lucid Light via the same tokens.

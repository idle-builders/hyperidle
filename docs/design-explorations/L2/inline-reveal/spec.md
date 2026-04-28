# L2 Block primitive — Variant B: `inline-reveal`

> No gutter. No rail. The body is its own affordance surface — hover a block and a single "discuss" affordance fades in at the trailing edge of the reading line. Anchored discussions render as thin attached strips flush below the block, so the conversation is part of the block's vertical extent. Density-first; no margin tax.

## Signature

The eye lands on **prose**. Affordances are absent at rest unless a discussion is already attached. On hover, a single `discuss` affordance fades in *exactly where the reader's eye finishes the block* — at the trailing edge of the last visual line. Anchored messages render as thin attached strips directly below the parent block, sharing its left edge and content width, so reading flow goes block → its discussion → next block, never lateral hop to a margin.

## User story

A founder reads a knowledge body of structured prose, lands on a paragraph that needs clarification, hovers and clicks the `discuss` affordance that materialises at the end of that paragraph, drops a message in a thread scoped to the block — without ever moving the eye out of the column.

## Component composition

`MarkdownBlockView` is the **single** top-level renderer. There is no separate `BlockGutter`, no `BlockRail`. Per-kind block renderers own their own hover state and their own trailing-edge affordance position, because the right answer for a paragraph (end of last text line) is not the right answer for a code block (top-right of code surface) or a quote (end of last quoted line). The discussion strip is rendered conditionally by the parent renderer when the block has anchored messages.

| Component | Tier | Slot / props | Composes |
|---|---|---|---|
| `MarkdownBlockView` | 3 (region) | `{ host: { kind, id }, blocks, anchorsByBlockId, lostAnchors, onDiscuss(blockId), onOpenStrip(blockId) }`. The single mount point. Walks `blocks` in order, dispatches each to the per-kind renderer, conditionally renders `BlockDiscussionStrip` underneath each block whose id has anchored messages. Renders `LostAnchorsFoot` at the body's trailing edge. | per-kind renderers, `BlockDiscussionStrip`, `LostAnchorsFoot`, `EmptyState` |
| `HeadingBlock` | 1 (per-kind) | `{ block: { id, kind: "heading", level, content }, hasAnchors, onDiscuss }`. Renders `<h1>`–`<h6>` typographically; trailing-edge affordance sits inline at the end of the heading's last visual line. | `BlockDiscussAffordance` |
| `ParagraphBlock` | 1 (per-kind) | `{ block: { id, kind: "paragraph", content }, hasAnchors, onDiscuss }`. Renders prose `<p>`; affordance is positioned at end of the last text line via an inline-flex trailing wrapper. | `BlockDiscussAffordance` |
| `ListBlock` | 1 (per-kind) | `{ block: { id, kind: "list", ordered, tight, items }, anchorsByItemId, onDiscussItem }`. Renders `<ol>` / `<ul>`; the trailing-edge affordance is per-`list_item`, NOT on the wrapping list. The list itself is not anchorable; its items are. | `ListItemBlock` |
| `ListItemBlock` | 1 (per-kind) | `{ block: { id, kind: "list_item", content, children }, hasAnchors, onDiscuss }`. Affordance at end of the item's last line. Nested lists / paragraphs render under the item. | `BlockDiscussAffordance` |
| `CodeBlock` | 1 (per-kind) | `{ block: { id, kind: "code", text, language }, hasAnchors, onDiscuss }`. Renders mono-font code in a soft surface block with a language tag in the top-right. The trailing-edge affordance sits in the block's top-right header area (NOT after the last code line — code lines are pre-formatted and adding inline UI to them would shift columns). The language tag and the affordance share the chrome row. | `BlockDiscussAffordance` |
| `QuoteBlock` | 1 (per-kind) | `{ block: { id, kind: "quote", children }, hasAnchors, onDiscuss }`. Left-border quote treatment; affordance at the end of the last quoted text line. The quote itself owns the anchor — child blocks inside the quote are not separately anchorable in this variant (they share the quote's anchor coordinate). | `BlockDiscussAffordance` |
| `TableBlock` | 1 (per-kind) | `{ block: { id, kind: "table", header, rows }, hasAnchors, onDiscuss }`. Renders the GFM table as `<table>`; the table itself owns the anchor (NOT individual `table_row`s — rows under the same header context are part of one anchorable structure for L26). Affordance lives in a flush chrome row above the table on hover, top-right. Horizontal scroll preserved. | `BlockDiscussAffordance` |
| `HrBlock` | 1 (per-kind) | `{ block: { id, kind: "hr" } }`. Renders a hairline rule. **Not anchorable.** No hover affordance. | — |
| `ImageBlock` | 1 (per-kind) | `{ block: { id, kind: "image", alt, src, title }, hasAnchors, onDiscuss }`. Renders the image with `object-fit: contain` capped at the column width. Affordance at the bottom-right corner of the image on hover (overlaid; semitransparent surface chrome). | `BlockDiscussAffordance` |
| `BlockDiscussAffordance` | 1 (primitive, new) | `{ blockId, onDiscuss, position: "trailing-inline" \| "chrome-top-right" \| "image-overlay" }`. The discuss affordance itself: a thin bubble glyph + a `discuss` label that fades in at `--motion-fast` with a 4px x-translate. Opacity 0 at rest, 1 on parent block hover or focus-within. | (none — leaf primitive) |
| `BlockDiscussionStrip` | 2 (block, new) | `{ messages, leadSender, replyCount, onOpen, state: "single" \| "thread" \| "lost" }`. The thin attached strip directly below the parent block: shares left edge, slightly inset by `--density-card-gap`, soft surface. Single message renders sender chip + 1-line excerpt. Thread of N messages collapses to `lead + 2 others · N replies — open`. | `StatusChip` (for `unread`/`resolved`/`lost` state), avatar, `Tag` |
| `LostAnchorsFoot` | 2 (block, new) | `{ messages }`. A foot region under the body that groups any anchored messages whose block-id no longer corresponds to a current block. Quiet `mono-sm` header `lost anchors (N)`, then one `BlockDiscussionStrip` per orphaned message in `state="lost"`. | `BlockDiscussionStrip` |
| `EmptyState` | 1 (existing) | Reused. Renders for `body: ""`. | — |

`MarkdownBlockView` is the only component a consumer mounts. The per-kind renderers and the strip live behind it. The trade is deliberate: more per-kind specialisation than Variant A (which can use a single uniform gutter pattern), in exchange for affordances that sit *exactly* where the reader's eye finishes each kind.

## Information hierarchy

Numbered in landing order — what the eye is meant to find first:

1. **The prose itself.** Unstyled-feeling structural prose at full column width. No left margin, no right rail, no chrome competing for attention.
2. **Discussion strips on already-anchored blocks.** A thin attached strip directly below the parent paragraph or list-item is the only persistent evidence of conversation. No badges, no counts in margins.
3. **The affordance on hover.** When (and only when) a block is hovered or focused, a single `discuss` affordance fades in at the trailing edge of that block's last visual line.
4. **Lost-anchors foot.** A quiet section at the very bottom under a `lost anchors (N)` mono caps header — surfaces messages whose blocks no longer exist without dragging them up into the body's reading flow.

The body's words-per-screen is the **highest** of the three variants. Whitespace is earned: it appears between blocks in the form of normal paragraph spacing, and as the inset gap between a block and its discussion strip — never as reserved-but-empty gutter chrome.

## Per-kind block rendering rules

| Kind | Typography / surface | Affordance position |
|---|---|---|
| `heading` (level 1) | `--density-text-h1` (1.625rem), weight 600, `--text-hi`, `letter-spacing: -0.01em`, line-height 1.2; bottom margin `--density-gap`. | Inline at end of last visual line. Anchored heading rare in practice; supported for completeness. |
| `heading` (level 2) | `--density-text-h2` (1.25rem), weight 600, `--text-hi`, line-height 1.25; top margin `--density-gap` × 1.5, bottom margin `--density-card-gap`. | Inline at end of last visual line. |
| `heading` (levels 3–6) | One step down per level via system scale (1.0625rem → 0.875rem); weight 600 to 500; `--text-hi`. | Inline at end of last visual line. |
| `paragraph` | `--density-text` (0.9375rem), `--text-mid` body, `line-height: var(--leading-body)` (1.55), bottom margin `--density-gap`. Inline emphasis: `<strong>` → weight 600 + `--text-hi`; `<em>` → italic + `--text-hi`; inline code → `--mono` 0.875em on `--surface-3` chip, `--r1`. | Inline at end of last visual line, separated by a thin space. |
| `list` (ordered, tight) | `<ol>` with mono-style numerals via `font-variant-numeric: tabular-nums`; left padding `1.75rem`; gap between items `--density-card-gap`. | None — list not anchorable as a whole; affordances live on `list_item`. |
| `list` (unordered, tight) | `<ul>` with hairline disc bullets in `--text-lo`; left padding `1.5rem`. | None. |
| `list_item` | Item text in `--text-mid`, `<strong>` → `--text-hi`. Body text wraps with hanging indent under the marker. | Inline at end of last line of the item's primary content. Affordance in `list_item` does NOT extend to nested children — nested paragraphs / lists carry their own affordances. |
| `code` | Surface `--surface-2`, border `--border-subtle`, radius `--r2`. Header chrome row at top: language tag (mono caps, `--text-lo`) on the left, `discuss` affordance on the right. Code body: `--mono` 0.8125rem, line-height 1.5, padding `--density-card-pad`, horizontal scroll preserved (`overflow-x: auto`, never `overflow: hidden`). | Top-right of the chrome row (not after the last line — preserves column alignment). |
| `quote` | Left border 2px `--surface-5` (NOT primary — quotes are de-emphasised, not accented). Inset padding-left `--density-card-pad`. Body italic, `--text-mid`. | Inline at end of last visual line of the quote's last child block. |
| `table` | `<table>` with `--surface-2` row stripe alternation, `--border-subtle` row dividers, mono caps header row, `font-variant-numeric: tabular-nums` on cells. Wrapped in `overflow-x: auto`. | Top-right chrome row above the table on hover. Table is anchored as a whole; rows do not carry their own affordances. |
| `hr` | Hairline `--border-subtle`, top and bottom margin `--density-gap` × 2. | **None.** `hr` is not anchorable. |
| `image` | `<img>` capped at `max-width: 100%`, `object-fit: contain`, alt-text fallback. Light caption underneath in `--text-lo` mono-sm if `title` present. | Bottom-right corner of the image on hover, overlaid on a semitransparent `--surface-2` chip with `--r1`. |

Inline elements (links, autolinks) follow standard prose treatment: `--primary` color, `text-decoration-skip-ink: auto`, no underline at rest, hairline underline on hover. Inline code is the chip described under `paragraph`.

## All states

### Empty body
A knowledge item with `body: ""` renders the existing `EmptyState` primitive inside `MarkdownBlockView`'s frame: title `Empty body`, copy `This knowledge item has no content yet. Edit to add prose.`, no CTA (consumer adds one).

### Loading
The body region renders three Skeleton block placeholders: a heading-shape (60% width), a paragraph-shape (3 lines), a list-shape (3 short rows). No spinner. Affordances do not render in loading state.

### Error
`ErrorState` replaces the block list. Copy: `Couldn't load this body. [Retry]`. Lost-anchors foot does not render (it depends on the block list being available).

### Populated body — clean (no anchors)
All blocks render. Strips do not render. Hovering a block reveals the trailing-edge affordance at `--motion-fast` (80ms) with opacity 0 → 1 and a 4px x-translate. Un-hover fades it back at the same duration.

### Populated body — block with one anchored message
The strip renders persistently directly below the parent block: shares the parent's left edge, inset slightly by `--density-card-gap`, soft `--surface-2` background, `--r1` corners, hairline `--border-subtle` top border (zero — the strip is *flush*, no gap above), small visual lifted-shadow disabled (cards use the surface ladder). Strip contents: 16 px sender avatar + sender name + 1-line message excerpt (clamped) + relative timestamp + (if unread) a `1 unread` `StatusChip` in `--primary` tint. The whole strip is clickable; hovering it raises background to `--surface-3`.

### Populated body — block with a 3-message thread
Strip collapses the thread to the **lead sender** avatar + label `Builder + 2 others · 3 replies` + the latest message timestamp + (if resolved) a `done` `StatusChip` in `--ok` tint or (if unresolved) a `1 unread` chip. The latest message excerpt is NOT shown when N > 1 — the lead-line + reply count is enough wayfinding; the eye gets the rest by clicking.

### Populated body — anchor lost foot
At the very bottom of the body (after the last block, before any consumer-supplied chrome), a quiet `mono-sm` header reads `lost anchors (N)` followed by N strips in `state="lost"`. Each lost strip uses the same shape as a regular strip but tinted by `--surface-ghost` and with a `lost` `StatusChip` in `--text-lo` (not `--danger` — the system is honest, not alarming; the message is preserved, not destroyed). The strip carries the message body as a single line (clamped) and a relative timestamp; the `discuss` action opens the message in the host's thread where the user can re-anchor it.

### Long code overflow
The code block's body scrolls horizontally inside its own surface (`overflow-x: auto`) — the affordance, anchored in the chrome row top-right, stays reachable regardless of horizontal scroll position. The chrome row does not horizontally scroll. The body's vertical extent is unconstrained by default (a 200-line code block is 200 lines tall); the consumer can pass an optional `maxHeight` prop if it cares. The default is to render the full block — knowledge bodies favour readability over fold management.

### Narrow viewport (≤ 768 px wide)
On narrow viewports the trailing-edge affordance becomes **always-visible** instead of hover-revealed (touch devices have no hover state). It still sits at the trailing edge of the block, but at lower visual weight — `--text-lo` color, no `discuss` text label, only the bubble glyph in a 24×24 tap target. The strip layout is unchanged. Anchored strips that contain a thread collapse summary degrade gracefully on narrow column widths.

## Behavior + motion

### Hover reveal
- The affordance fades in at `opacity: 0 → 1` over `var(--motion-fast)` (80 ms).
- Concurrent `transform: translateX(4px) → translateX(0)` over the same duration to give the affordance the feeling of *settling into place* at the end of the block, not popping in.
- `transition: opacity var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease);`
- The trigger is `:hover` OR `:focus-within` on the parent block, so keyboard tab traversal also reveals the affordance.
- Un-hover fades back out at the same duration. No delay.

### Strip mount
- A newly-attached strip (when a thread message was just submitted with an anchor) animates in via `--motion-medium` (150 ms) opacity + 4 px upward translate.
- An existing strip on first paint does NOT animate — it renders settled.

### Strip click
- Single click on a strip opens the underlying thread surface (L26 binding). The strip itself does not carry inline reply UI — reply lives in the L1 thread renderer the strip points at.

### Affordance click
- Click opens an inline composer scoped to `(host_id, block_id)`. The inline composer is *L1's Composer primitive* (re-used), mounted in a thin row at the trailing edge slot, replacing the affordance for the duration of the compose. On submit, the message lands as the first anchored message on the block; the strip renders flush below the block at `--motion-medium`.
- On `Esc` or click-outside without text: the composer dismisses, the affordance returns.

### Focus management
- Tab order: blocks render their own affordances as buttons in document order. Inside a list, each `list_item`'s affordance is its own tab stop. The strip below a block, when present, is a single tab stop after the block's affordance and before the next block.
- `:focus-visible` outline on every interactive element: 1px `--primary` outline, offset `-1px` (matches L1 conventions).

### Keyboard
- **No keyboard verb shortcuts** (founder filter / TRACK-L scope). The affordance is reached via Tab and activated via Enter / Space; that is all.

### Anchors persist on edit
- When the body is edited and re-derived, blocks whose ids changed lose their strips and the messages migrate to the lost-anchors foot at `--motion-medium`. The transition is opacity-only — the strip does not slide from its old location to the foot (that would dramatize a structural event the user already understands from the lost-anchors header).

## Mobile adaptation

Knowledge view is desktop-only per HIL §4.4. The bet pitch body (L16) does render on mobile, however, and this variant must degrade gracefully:

- **Always-visible trailing affordance** — touch devices have no hover state. The affordance renders at `--text-lo` weight at all times, glyph-only (no `discuss` label), at the trailing edge of each block. The 4 px translate is dropped (no transform on always-visible).
- **Strip stacks vertically** unchanged. Strip text wraps to two lines max on narrow widths; the relative timestamp drops to a second line beneath the sender label.
- **Code block** keeps horizontal scroll; the chrome row stays sticky-right inside its parent so the affordance is always reachable without scrolling the body.
- **Tap targets** for the affordance and the strip are ≥ 44 CSS px (AQ-015) on viewports ≤ 1024 px, achieved by inflating the affordance's invisible hit area beyond the visible glyph.

## The signature

> Affordances live *inline at the trailing edge of the reader's eye*; anchored discussions live as thin attached strips flush beneath the block — so reading flow goes block → its discussion → next block, with zero margin tax.

## Trade-offs (what this variant is bad at)

- **Discoverability before hover.** A clean block looks completely clean. New users may not realise that hovering reveals an affordance at all — the variant pays a one-time onboarding cost. Variant C (always-on-rail) wins this axis. We accept the cost: the reader's job is to *read*, and the variant's worst frame is "dense quiet prose," which is fine.
- **Heavy-discussion bodies feel chopped.** A body where every paragraph is anchored renders strip-after-block-after-strip, doubling the vertical extent. The variant degrades from "dense" to "interleaved." Variant A (margin-gutter) keeps the body visually pure regardless of discussion density.
- **Per-kind specialisation cost.** The trailing-edge affordance position differs by block kind (paragraph end-of-line vs code top-right vs image overlay). Variant A's uniform gutter has only one position to design and test. We accept it: every other choice in this variant is "stay in the body," and uniform-everywhere would compromise that for kinds (code, image) where end-of-line is wrong.
- **Strip vs. multi-paragraph quote ambiguity.** A quote that wraps multiple paragraphs has its affordance at the end of the last paragraph; the strip mounts under the *whole quote* surface, not under the last paragraph. This requires the quote renderer to be aware of its own anchor scope — minor extra complexity vs. paragraph-by-paragraph anchoring.
- **Sticky horizontally-scrolling code chrome on mobile.** Pinning the chrome row to the top of a horizontally-scrolling code block is a small implementation hazard (sticky inside overflow:auto has known browser quirks). Variant A's gutter sits outside the code block and never has this problem.

## Anti-convergence audit (vs. A `margin-gutter` and C `always-on-rail`)

| Axis | This variant (`inline-reveal`) | A (`margin-gutter`) | C (`always-on-rail`) |
|---|---|---|---|
| Hierarchy | prose first; affordance reveals on hover at trailing edge | prose first; affordance lives in left margin gutter | prose + persistent right-rail badges |
| Density | maximum (no gutter, no rail) | medium (left gutter is reserved chrome) | medium (right rail is reserved chrome) |
| State strategy | only-on-hover (clean block) + persistent strip flush below (anchored) | only-on-hover (in margin) + clustered margin indicators (anchored) | always-on (count badges in rail) |
| Action surface | inline at block trailing edge | reserved left margin gutter | persistent right rail |
| Composition | 1-component (`MarkdownBlockView`) + per-kind renderers | 2-components (`MarkdownBlockView` + `BlockGutter`) | 3-components (`MarkdownBlockView` + per-kind renderers + `BlockRail`) |
| Reading flow | vertical: block → strip → next block | lateral: body → margin glance → body | lateral: body → rail glance → body |

Differs from A on **action surface / state strategy / composition / reading flow / density** (5 axes). Differs from C on **density / state strategy / action surface / composition / reading flow** (5 axes). Both pairs clear the 3-axis floor.

## Tokens & rules audit

- All paddings consume density tokens (`--density-pad-*`, `--density-card-pad`, `--density-card-gap`, `--density-page-gutter`, `--density-gap`). No raw `p-[Npx]`.
- All colors are semantic tokens — `--surface-{0..6}`, `--text-{hi,mid,lo}`, `--ok`, `--warn`, `--danger`, `--primary`. No hardcoded hex.
- All radii on the closed scale: `--r1` (4 px) for chips and code chrome, `--r2` (8 px) for code blocks and image surface, `--r-pill` for status chips.
- No `rounded-2xl` / `rounded-3xl` (AQ-101).
- No purple/indigo gradients (AQ-102) — `--primary` is the only accent and is used flat.
- No emoji as iconography (AQ-105) — the discuss glyph is a thin lucide-style bubble outline rendered as an inline SVG.
- Spacing on the 4 px grid; the only off-grid value is the `StatusChip` internal 2 px (allowed sub-grid per AESTHETICS.md).
- No keyboard verb shortcuts (founder filter).
- No drag-reorder of blocks (founder filter).
- No emoji reactions on strips (founder filter).
- No persistent block-id text anywhere in the rendered body.
- No "anchor lost" with two indicators — exactly one indicator, one piece of copy, honest.
- Lucid Dark is the canonical screenshot; the file renders correctly in Lucid Light via the same tokens.

# L2 Block primitive — Variant C: always-on-rail

> A persistent right-side rail rendered alongside every body. Blocks with anchored discussion light a small numeric badge in the rail at their vertical position; blocks with no discussion leave the rail empty at that line. The rail is sparse on purpose — it is a discussion **density map** the eye can read at a glance.

## Signature

A reader scanning a knowledge body sees, in their peripheral vision, a thin column of small numeric chips floating to the right of the prose — one per anchored block, none for the rest. Hot blocks light up; quiet blocks stay dark. Click a badge and the rail expands inline beside that block to show the messages flush-right, body shifted left in place. The wayfinding is instant; no hover required.

## User story

A founder reviewing a long Stripe-webhook knowledge body wants to know — before reading line-by-line — which sections already have unresolved discussion, jump to one, read the messages flush-right of the block they belong to, and reply or move on, all without leaving the document.

## Component composition

Three components, each with a precise scope. The body knows nothing about discussion; the rail knows nothing about prose; the badges are pure atoms synced by vertical position.

| Component | Tier | Slot / props | Composes |
|---|---|---|---|
| `MarkdownBlockView` | 3 (region) | `{ host, blocks, anchorIndex, expandedBlockId, onExpand, onAnchor }`. The body renderer. Walks `blocks`, dispatches each to its kind-renderer, attaches `data-block-id` for rail vertical sync. Receives `anchorIndex: Map<block_id, AnchoredMessage[]>` so the rail knows counts; never renders messages itself. | per-kind renderers (heading / paragraph / list / list_item / code / quote / table / table_row / image), `EmptyState` |
| `BlockRail` | 3 (region) | `{ blocks, anchorIndex, expandedBlockId, lostAnchors, onBadgeClick, onAnchorRequest }`. The persistent right column. Renders one `RailBadge` per block that has 1+ anchored message; renders empty space (no badge, no shadow) for clean blocks. Renders the lost-anchors footer accordion. Owns expansion state visually (widens to `--rail-w-expanded` for the active block; messages render as flush-right strips beside the block). | `RailBadge`, `MessageRow` (from L1's CommentRow family — slot, not invented here), `EmptyState` |
| `RailBadge` | 1 (primitive, new) | `{ count, unread, blockId, onClick, onAnchorRequest }`. A bare numeric chip — `Tag`-shaped, mono numerals, no chat-bubble, no emoji. `unread` toggles a `--primary` tint; otherwise neutral surface. Hover surfaces a tiny "discuss" affordance only on rail-side (not in the body). | `Tag` |

`MarkdownBlockView` is the consumer-facing mount; L23 (knowledge body) and L16 (bet pitch) both render `MarkdownBlockView` and pass it the host's `anchorIndex` from L18's thread query. `BlockRail` and `RailBadge` are L2's contribution to the design system; they are not re-used outside L2 (they exist *for* L2's signature).

## Information hierarchy

Numbered in landing order:

1. **Body title (H1)** — the document's name.
2. **Body prose** — paragraphs, lists, code, quotes, tables. The reader's primary surface.
3. **Rail badges** — sparse numeric chips floating right, vertically aligned to the **first line of each anchored block**. Visible without focus, ignorable.
4. **Hover affordance (rail-side, on hover only)** — when the cursor enters a clean block's row, a faint `+ discuss` ghost chip appears in the rail at that block's position. Disappears on mouse-leave.
5. **Expanded rail messages** — when a badge is clicked, the rail widens; the messages render in a flush-right column beside the block, with a faint connector line tying badge to block.
6. **Lost-anchors accordion** — at the body's foot, body-aligned, in the rail's footer area: a single collapsed row `Lost anchors (1)`. Expanding inlines the orphaned message below, with the `anchor lost` indicator.

The rail's persistent thinness is the whole point. Body width does not move when no badges are present; the rail is a fixed gutter. When the rail expands, the body **shifts left** (not the rail overlaying the body) — it is an in-place re-layout, not a popover.

## Per-kind block rendering rules

All measurements use density tokens; no raw px on the spacing axis.

| Kind | Typography | Spacing | Anchor target |
|---|---|---|---|
| `heading` H1 | `font-size: var(--density-text-h1)` (26px default), `font-weight: 600`, `letter-spacing: -0.01em`, `color: var(--text-hi)`. Sets the doc title. | `padding-bottom: var(--density-pad-y)`, `border-bottom: 1px solid var(--surface-3)`. | Anchorable; rail badge top-aligns to baseline. |
| `heading` H2 | `font-size: var(--density-text-h2)` (20px default), weight 600, `--text-hi`. | `margin-top: calc(var(--density-pad-y) * 2)`, `margin-bottom: var(--density-gap)`. | Anchorable. |
| `heading` H3-H6 | H3: 16px / 600 / `--text-hi`; H4-H6: 14px / 500 / `--text-mid` (uppercase H6). | tighter margin. | Anchorable. |
| `paragraph` | `font-size: var(--density-text)` (15px), `line-height: var(--leading-body)` (1.55), color `--text-mid`. Inline `<strong>` raises to `--text-hi`, `<em>` keeps `--text-mid`. | `margin: 0 0 var(--density-gap) 0`. Inline `<code>` inside paragraphs uses `font-family: var(--mono)`, `font-size: 0.875em`, `background: var(--surface-ghost)`, `border-radius: var(--r1)`, `padding: 1px 5px`. | Anchorable; rail badge top-aligns to first line. |
| `list` (ordered/unordered) | Same prose color/size as paragraphs. | `padding-left: 24px`. Markers: ordered = mono numerals `var(--text-lo)`; unordered = `•` `var(--text-lo)`. | The `list` itself is **not** the anchor target; each `list_item` is. |
| `list_item` | Inline-formatted text, color `--text-mid`. `<strong>` lifts to `--text-hi`. | `margin-bottom: 4px`. | Anchorable; rail badge top-aligns to the item's first line. |
| `code` (fenced) | `font-family: var(--mono)`, `font-size: 12.5px`, `line-height: 1.55`, `color: var(--text-hi)`. Language tag is a small `Tag` chip in the top-right of the code surface, mono uppercase, color `--text-mid`. | `background: var(--surface-2)`, `border: 1px solid var(--border-subtle)`, `border-radius: var(--r2)`, `padding: var(--density-pad-y) var(--density-pad-x)`. **Horizontal scroll** preserved (`overflow-x: auto`); never wraps. | Anchorable; rail badge top-aligns to the fence's top edge. |
| `quote` | Same prose size as paragraphs but italic-disabled (it is a citation, not affect). Color `--text-mid`. | `border-left: 2px solid var(--surface-5)`, `padding: 4px 0 4px var(--density-pad-x)`, `background: transparent`. The left border is the only chrome — no surface tint. | Anchorable. |
| `table` | `font-size: 13px`, `--text-mid`. Header row: weight 600, color `--text-hi`, `background: var(--surface-2)`. Cells: `padding: 6px 10px`. | `border: 1px solid var(--border-subtle)`, `border-radius: var(--r2)`, `overflow: auto` (horizontal scroll on overflow). Row separators: `border-top: 1px solid var(--border-subtle)`. | Anchorable. |
| `table_row` | Cell text inherits from `table`. | n/a (rendered inside `table`). | Anchorable per row; rail badge top-aligns to row top. |
| `hr` | Single 1px line, `background: var(--surface-3)`. | `margin: var(--density-gap) 0`. | **NOT anchorable** (per concept §6). Rail leaves an empty position. |
| `image` | `max-width: 100%`, `border-radius: var(--r2)`, `background: var(--surface-2)`. Caption (alt) below in `--text-lo`, mono small. | `margin: var(--density-gap) 0`. | Anchorable. |

Inline formatting (bold, italic, links, inline code) lives inside a block's content payload; never its own block.

## Rail alignment — how badges sync with multi-line blocks

The badge **top-aligns to the block's first text baseline**. This is the safe call:

- For paragraphs and list items, the badge sits flush with the first line of prose.
- For headings, the badge sits at the heading's baseline.
- For code blocks, the badge sits at the top edge of the code surface (just below the language tag).
- For quotes, the badge sits at the top of the left border.

We rejected center-alignment because long paragraphs would float the badge into the middle of the prose, breaking the "scan top-of-block" rhythm. Top-alignment lets the eye sweep down the rail and read each badge as the entry-point to a block, not a midpoint marker.

## All states

### Empty body (host has `body: ""`)
- Rail still renders at full thin width — its persistence is non-negotiable.
- Body shows an `EmptyState`: copy `No content yet.` (one line, `--text-lo`, mono).
- Rail is entirely empty (no badges, no footer accordion).
- The visual: a thin empty column on the right, an empty body on the left. Honest.

### Loading
- Body renders 4 paragraph skeletons (`background: var(--surface-2)`, `border-radius: var(--r1)`, varying widths 100% / 80% / 95% / 60%).
- Rail renders no badges (we don't speculatively shimmer; counts are deterministic from `anchorIndex` and arrive together with blocks).

### Error
- Body shows `ErrorState` with copy `Couldn't load this body. [Retry]`.
- Rail is empty.

### Populated body, sparse rail
- Body renders the full `MarkdownBlockView` content (Stripe webhook body in the mockup).
- Rail shows badges only for the 3 anchored blocks: paragraph #1 (count `1`, unread tint), ordered-list-item #2 (count `3`, neutral / resolved), quote (count `1`, unread tint).
- Every other block's rail position is empty — no shadow, no border, no hover affordance shown at rest.

### Hover on a clean block (no anchored messages)
- Cursor enters the block's vertical band.
- A faint ghost chip appears **only in the rail** at that block's first-line position: `+` glyph in mono, `--text-lo`, `surface-ghost` background, `--r1` corner. Tooltip on the chip itself: `Discuss this block`.
- No inline affordance in the body. No left gutter. No trailing-edge reveal. Only the rail.
- On mouse-leave: chip fades out at `var(--motion-fast)` (80ms opacity). At-rest, the rail position is empty again.
- Click (or tap) opens the L1 composer scoped to `(host_id, block_id)`. The composer's surface is L1's affair; this variant only emits the open-event with the scope coordinate.

### Block with one anchored message
- Rail shows a `RailBadge` count `1`. Badge color: unread tint when message has `read=false` for the current user (`--primary-dim` background, `--primary` text); resolved/neutral when read (`surface-3` background, `--text-mid`).
- Hover on the badge raises it to `--primary-hover` tint (`var(--motion-fast)` background transition). Tooltip: `1 message`.
- Click: rail expands; messages render as flush-right strips beside the block.

### Block with a 3-message discussion (resolved)
- Badge count `3`, neutral tint (`surface-3` background, `--text-mid`).
- Same expansion behaviour. The expanded panel renders three sender / first-line / timestamp rows, oldest at top.

### Expanded badge (rail widens, messages render beside the block)
- The rail temporarily widens from `--rail-w-rest` (about 56px) to `--rail-w-expanded` (about 360px) — `var(--motion-medium)` (150ms) width transition.
- Body shifts left in place — no overlay (rejected: overlays obscure the prose the discussion refers to). The body re-layouts; reader sees the same prose just narrower.
- The expanded rail panel contains:
  - A connector — a thin 1px horizontal line from the badge to the block's top-right corner (`--surface-5`, `--motion-fast` opacity in).
  - A small mono caption above the messages: `discussion · 3 messages · resolved` (or `· unread` when unread).
  - The message strips: each row carries 24px avatar, sender name (`--text-hi`, weight 500), 1-line body snippet (`--text-mid`, clamp at 2 lines), timestamp (`--text-lo`, 11px). This is `CommentRow`-shaped — L2 renders the L1 family here, not a new comment primitive.
  - A tertiary `[Reply]` action at the foot of the strip column, opening the L1 composer scoped to the anchor.
- A close affordance — a small `×` glyph at the rail's top-right of the expanded panel — collapses the rail back to rest. Clicking outside the rail / pressing `Esc` also collapses.

### Anchor-lost foot accordion
- At the body's bottom, the rail's footer area renders a single row body-aligned (not flush-right but full body width) under a thin `--surface-3` divider:
  ```
  Lost anchors (1)              [▾]
  ```
  - Mono caption, `--text-mid`, `var(--density-pad-y)` padding.
  - Click expands inline: each lost message renders as a `CommentRow`-shape with a small `Tag` chip `anchor lost` (mono, `--warn` tinted `surface-ghost`).
  - The accordion sits at the bottom of the body region — body-aligned (full width below the rail), so even users who never click a badge see the orphan count without scanning the rail.
- The system does NOT distinguish "block deleted" vs. "block edited" — single indicator, per concept §6.1.

### Long code overflow
- Fenced code block: `overflow-x: auto`. Lines wider than the column scroll horizontally; the language tag stays in the top-right (sticky to the surface).
- The `code` block's height is its natural height (not capped); a `100+ line` block scrolls with the page. The rail badge remains top-aligned to the fence's top — once the badge scrolls off-screen, no follower; the user finds the discussion by scrolling back, same as for any block.
- Horizontal scrollbar is the Lucid Dark token-styled thumb (`--surface-5`).

## Behavior + motion

| Trigger | Effect | Token |
|---|---|---|
| Rest | Rail at `--rail-w-rest`, badges visible only on anchored blocks. | — |
| Hover on clean block | Ghost `+` chip fades into the rail at the block's top. | `var(--motion-fast)` opacity |
| Hover on a badge | Badge raises to hover tint. | `var(--motion-fast)` background |
| Click a badge | Rail widens to `--rail-w-expanded`; body shifts left; messages and connector fade in. | `var(--motion-medium)` width + `var(--motion-fast)` opacity for the messages |
| Click outside / `×` / `Esc` | Rail collapses to `--rail-w-rest`. | `var(--motion-medium)` width |
| Click hover-affordance `+` | Opens L1 composer scoped to `(host_id, block_id)`. | (handled by L1) |
| Anchor-lost accordion toggle | Inline expand. | `var(--motion-medium)` height (or no transition; `details` element semantics) |

Easing: `cubic-bezier(0.2, 0, 0, 1)` (the project standard). Honor `prefers-reduced-motion` — the width transition collapses to instant; opacity fades stay (transform/opacity are reduced-motion-safe per AESTHETICS.md).

**No keyboard verb shortcuts** (founder filter). The rail is mouse / touch-driven; tab order moves through visible badges left-to-right by document order, then to the lost-anchors accordion. Focus-visible rings: 1px `--primary` outline, offset `−1px`.

## Mobile adaptation

Knowledge view is desktop-only per HIL §4.4, but the variant must still **degrade gracefully** on narrow viewports.

- At viewport ≤ 720 px: the rail collapses to a fold-out. A single body-edge handle (a thin vertical `1px` strip at the right edge of the body, with a hairline `var(--surface-5)` line and the count of total anchored blocks shown vertically as small mono text) sits flush against the body. Tapping the handle slides the rail in from the right at `--rail-w-expanded`; the body does not shift (mobile overlays the rail — the body is already narrow). Tapping outside or the close `×` slides it back out.
- The expanded state on mobile is a **full-screen modal** with the message stream — same component, larger surface. The body block the messages refer to is shown as a small "context tile" at the top of the modal: kind glyph (mono caption like `paragraph` or `list-item-2`) plus the first line of the block's content, clamped. This is wayfinding for the user inside the modal.
- The handle never disappears. The rail is never absent — even when the body has zero discussion, the handle is present (showing `0`) so the user knows where the rail lives. (This is the only state where the rail's persistence is honoured by a bar that is otherwise empty — the rail's character is its always-thereness.)

Bet-pitch bodies (the L16 case) appear on mobile via the Work surface; the same mobile rules apply.

## The signature in one sentence

A persistent thin right-side rail that lights up sparse numeric badges next to anchored blocks — discussion density readable from a glance — and widens in place to inline messages flush-right of the block they belong to.

## Trade-offs (be honest)

- **The rail can feel decorative on quiet docs.** A document with zero anchored messages renders an empty rail column the entire page height — a thin slice of unused real estate that the body can't reclaim. The discipline of "no badge for zero" is what keeps it from being a constant nag, but the column itself is always there. Acceptable cost for the wayfinding it gives on hot docs; honest about the visual quiet.
- **Expanding the rail re-layouts the body.** Body shifting left under expansion is jarring if the user is mid-scroll or mid-read; we mitigate with a 150ms transition but cannot fully remove the displacement. (We rejected the overlay alternative because overlaying the prose obscures the very thing the discussion refers to — the trade-off was: re-layout vs. obscure, and re-layout won.)
- **Hover-only `+` discovery on clean blocks is invisible at rest.** A first-time user who never hovers will not discover that any block can be discussed — they only see badges where discussions already exist. Mitigation: the empty rail being persistent is itself a hint, but the affordance for *starting* a discussion is concealed until hover. Not a regression versus the other variants, but worth flagging.
- **Mobile parity is awkward.** A persistent rail does not translate cleanly to a 375px viewport; we degraded to a fold-out handle, which is a different interaction grammar from desktop's always-on rail. Founders working from phone get a slightly different mental model than from desktop.
- **No way to scan multiple discussions at once.** The expanded state is per-block — opening the second discussion closes the first. A user who wants to compare two discussions side-by-side must collapse, scroll, and re-expand. This variant trades parallelism for simplicity.

## Anti-convergence audit (vs. A and B)

| Axis | This variant (always-on-rail) | A (margin-gutter) | B (inline-reveal) |
|---|---|---|---|
| Hierarchy | prose center + rail right; eye finds badges peripherally | prose center; gutter left, badges clustered there on hover | pure prose; affordance only at trailing edge on hover |
| Density | medium-high (persistent badges) | medium (left gutter, on-hover indicators) | high (no extra space at rest) |
| State strategy | always-on for anchored, hover for clean | only-on-hover for both | only-on-hover for both |
| Action surface | persistent right rail | margin gutter left of body | trailing edge of block, inline |
| Composition | 3 components (body + rail + badge) | 2 components (body + gutter) | 1 component (body with inline affordance) |

Five axes differ vs. A; five axes differ vs. B. Anti-convergence floor (3) cleared in both pairs.

## Tokens & rules audit

- All paddings consume density tokens. No raw `p-[Npx]` outside the badge atom's 2px chip-internal (allowed sub-grid per AESTHETICS.md).
- Rail widths use named CSS custom properties (`--rail-w-rest`, `--rail-w-expanded`) defined relative to the page max-width; no magic px elsewhere.
- All colors are semantic tokens — `--surface-{0..6}`, `--text-{hi,mid,lo}`, `--primary`, `--primary-dim`, `--primary-hover`, `--warn`, `--ok`, `--danger`. No hex.
- Radii on the closed scale: `--r1` (4px) for badges and chips, `--r2` (8px) for code surfaces, `--r-pill` for pill-shaped status chips. No `rounded-2xl` / `rounded-3xl` (AQ-101).
- Motion durations from `--motion-fast` / `--motion-medium`; no bare `duration-Nms`.
- No purple/indigo gradients; the only accent is `--primary`, used flat. No glass morphism. No emoji. No chat-bubble icon on badges (founder filter — comment-count chips OK; `💬 5` not).
- Mono numerals on the badge: `font-family: var(--mono)`, `font-variant-numeric: tabular-nums` — counts align in a column.
- No keyboard verb shortcuts; tab order natural.
- Lucid Dark is canonical.

# L2 Block primitive — approved design

> Phase 5 of `/design L2`. **This document is the input contract to
> `/architecture L2`.** The architect plans against this; the adversary
> uses it to reject re-litigation of settled questions.

## Chosen base + pulled-in elements

**Base: Variant C (Layered with slots).** A single `Block` renderer with
named slot props; per-kind payload renderers nested inside. A
hover-revealed left-side **`BlockHandle`** aggregates every per-block
action; the handle opens a **`BlockActionsPopover`** anchored via
`@floating-ui/react`. Surfaces (WorkBet, KnowledgeDetail) compose the
popover's items — the renderer does not own the action set.

**Pulled in:**
- From **A**: the "calm prose" outer-shell thesis — handle is invisible
  on desktop until hover/focus; modifier classes for `unknown` and
  `block-deleted` on the same `Block` shell instead of new components;
  `StatusChip` composed for the deleted-block strip.
- From **B**: per-kind payload scaffolding — `.table-wrap` with sticky
  header + right-edge scroll fade for `table`; 20-line collapse +
  language label (no leading dot) for `code`; image-zoom indicator
  overlay (visual hint only, lightbox is host-side); copy-success
  transient with `aria-live="polite"` on the popover's `Copy
  permalink`.

**Iconography fix:** the handle's glyph is a single 12×12 inline SVG
**chevron-right** (`>`), rotating 90° to chevron-down when the popover
is open. Replaces variant C's 6-dot grip to remove the drag-reorder
implication.

## Rejected list

The architect refuses re-introduction of any of these:

1. A's "no per-kind chrome anywhere" — payload renderers MUST scaffold
   their kind (table → wrap+scroll, code → mono+collapse,
   image → figure+alt, html → sanitised container, unknown → warn
   stripe).
2. B's "kind-specific corner buttons always visible on every block" —
   actions live on the handle's popover, not on the body.
3. C's 6-dot grip iconography — replaced by chevron-right (rationale in
   synthesis).
4. The leading `--ok` status dot on the code language pill — removed
   (color drift).
5. J/K keyboard shortcuts — only `↑` / `↓` for block stepping, plus
   Enter/Space (open popover), Esc (close), ⌘L (copy permalink).
6. New top-level `/permalink/<id>` routes — fragment-based
   (`#blk-<blockId>`) per BLOCKS.md §8.4.
7. Any `block_comments` table or per-block primary key — concept §8.5
   rule 4 forbids.
8. Auto-timed handle reveal ("discoverability tail" 3 s) — replaced by
   one-shot session onboarding cue (first block's handle at
   `opacity: 0.4` until first hover).
9. Inline `[[id]]` linking — L24 deferred; synthesis uses the
   `BlockAnchor` directly.
10. Drag-reorder of blocks — Track L scope rejects.

## Component composition

### Renderer surface

One Tier-2 component **`Block`** with a kind-discriminated switch over
ten payload renderers. The `Block` carries the outer shell (gutter,
handle slot, focus ring, modifier classes) and renders the appropriate
payload renderer based on `kind`.

```tsx
// Conceptual API — architect finalises types.
<Block
  id={block.id}                       // BlockId hex (data-block-id)
  kind={block.kind}                   // BlockKind discriminator
  payload={block.payload}             // BlockKind-specific payload
  threadCount={threadCount}           // 0 = no chip
  surface={surface}                   // 'work-bet' | 'knowledge-detail' (slot context)
  slots={{
    gutterLeading: <BlockHandle … />,
    overlay: <BlockActionsPopover items={surfaceActions} />,
    // gutterTrailing + inlineAfterPayload reserved for future stories
  }}
/>
```

The `Block` component carries `data-ds-component="block"` and
`data-ds-kind="{kind}"` for K2's DOM-marker contract (see §
"Component data attributes" below).

### Per-kind payload renderers (10 internal)

Internal to `Block`, **NOT** counted as Tier-2 components per the
rule from the brief:

| Renderer | Renders | Notes |
|---|---|---|
| `HeadingPayload` | `<h1>`/`<h2>`/`<h3>`/`<h4..6>` | Sizes per `--density-text-h1`/`--density-text-h2`/16/14. Letter-spacing −0.005 em on h1. |
| `ParagraphPayload` | `<p>` | Inline marks: `<strong>`, `<em>`, `<code>`, `<a>`. |
| `ListPayload` | `<ul>` / `<ol>` (nested ≤ 3, native marker cycle) | Indent 20 px, item gap 2 px. |
| `QuotePayload` | `<blockquote>` | 2 px `--border-emphasis` left rule, `--text-mid`. |
| `CodePayload` | `<pre><code>` + language label + collapse toggle | 12 px mono, 1.5 lh, tab-size 2. > 20 lines → collapse with "Show N more lines" affordance. |
| `TablePayload` | `<table>` inside `.table-wrap` | Sticky header `--surface-3`, mono caps column labels, tabular-nums on body, right-edge scroll fade. |
| `DividerPayload` | `<hr>` | `--border-subtle` rule, 12 px top/bottom margin. |
| `ImagePayload` | `<figure><img>...<figcaption>` + zoom indicator | `--r2`, `--border-subtle`, alt text preserved. Zoom indicator 28×28 button with `--surface-0/75 %` overlay (host wires lightbox). |
| `HtmlPayload` | sanitised HTML (DOMPurify) inside `--surface-2` shell | If sanitiser strips, fall back to `UnknownPayload` with raw source preview. |
| `UnknownPayload` | `<p>` with leading 2 px `--warn` stripe + `<StatusChip status="unknown" label="unknown" />` prefix + node-kind hint | Always copyable, never throws. |

### Handle / action affordance

- **`BlockHandle`** (Tier-2 contribution from L2): the gutter-leading
  slot content. Renders a chevron-right glyph (12×12 inline SVG) +
  thread-count chip when `threadCount > 0`. Owns its `aria-expanded`
  state. Has `data-ds-component="block-handle"` for DOM markers.
- **`BlockActionsPopover`** (Tier-2 contribution from L2): the overlay
  slot content. Receives a closed action enum + per-item
  enabled/disabled state. Positioning via `@floating-ui/react` with
  `placement: 'right-start'` + `flip()` + `shift({ padding: 8 })`.
  Has `data-ds-component="block-actions-popover"`.

**Total new components added to the design system: 3** (`Block`,
`BlockHandle`, `BlockActionsPopover`). Per-kind payload renderers are
internal to `Block` and do NOT count.

### Existing components composed

- `StatusChip` — used in `UnknownPayload` ("unknown" label) and the
  block-deleted strip ("DELETED" status `error`).
- `Tag` — reserved for surface-side use (e.g. metadata strip above the
  body); not used inside `Block` in L2.
- `@floating-ui/react` `Popover` (existing dep per the canonical-shapes contracts under docs/ UI Stack)
  — drives `BlockActionsPopover` positioning.
- `Skeleton` — host surfaces use `Skeleton` for body-loading state;
  the renderer is not mounted until the body resolves.
- `EmptyState` — host surfaces show `EmptyState` for empty-body case;
  the renderer is not mounted.
- `ErrorState` — host surfaces show `ErrorState` if derivation
  itself fails (which it shouldn't, per BLOCKS.md §3 — `unknown` is
  the safety valve; this is a defensive-only path).

## All states with copy

| State | UI | Copy |
|---|---|---|
| **Empty body** | Renderer outputs zero blocks. Host renders `EmptyState`. | `"This body is empty."` |
| **Loading** | Host renders `Skeleton` (3 paragraph bars + 1 heading bar). Renderer not mounted. | (no copy) |
| **Error parsing one block** | Affected block falls into `UnknownPayload` (warn stripe + StatusChip + raw-source preview); rest of body renders. | `"Unsupported block — raw source preserved."` |
| **Error parsing whole body** (defensive) | Host renders `ErrorState`. | title `"Could not render this body."` description `"The markdown contains a structure we don't recognise. The raw text is preserved on disk."` action `"Show source"` |
| **Populated** | Default. Handles invisible until hover/focus. | (n/a) |
| **Hovered (block)** | Block bg shifts to `--surface-ghost` over `--motion-fast`. Handle fades in (`opacity 0 → 1`). | (n/a) |
| **Focused (block)** | 1 px solid `--primary` outline, `outline-offset: -1px`. Handle visible (focus-within). | (n/a) |
| **Popover open** | Handle pinned visible. Chevron rotates 90°. `aria-expanded="true"` on handle. | (popover items per surface; canonical: `Copy permalink` `⌘L`, `View N threads` `↵`, `Suggest edit` `⌘E`) |
| **Copy-success transient** | Popover item label rotates from `Copy permalink` → `Copied` for 1500 ms. Color: `--ok`. `aria-live="polite"` announces. Returns to label, popover closes. | `"Copied"` (transient) |
| **Suggest-edit disabled** (WorkBet) | Item is muted, cursor `not-allowed`, hint replaced by `read-only`. Tooltip: `"Bet pitches are read-only — edit through the bet workflow."` | `"read-only"` (item hint) |
| **Block with attached thread** | Thread-count chip visible beside chevron (primary-tinted: `--primary-dim` bg, `--primary` text). Mono digit + comment-bubble glyph. Click chip → opens threads view directly (skip popover). | (chip carries digit only) |
| **Block deleted** (anchored thread → missing blockId) | Modifier `Block--deleted` shell: dashed `--danger` border, `<StatusChip status="error" label="DELETED" />` pill, original anchor text quoted inline (`<s>` strikethrough, italic, `--text-mid`), thread-count chip retained with `--danger` ghost tint. | `"Block deleted — anchor preserved."` and `"This block referenced N thread(s)."` |
| **Unknown block** | `UnknownPayload`: warn stripe (2 px `--warn` left edge), `<StatusChip>` "unknown" prefix, raw source preview in `--surface-3` mono. | `"Unsupported block"` (StatusChip label) and `"Original source preserved below."` |
| **Overflow — table** | Wrapped in `.table-wrap` with `overflow-x: auto`. Sticky header on `--surface-3`. Right-edge gradient fade signals more columns. Vertical cap 260 px. | (no copy) |
| **Overflow — code** | > 20 lines: collapsed body capped at `20 × 1.5em`, gradient fade at bottom, "Show N more lines" affordance using `--mono` `--text-mid`. Toggles to expanded. | `"Show {N} more lines"` / `"Show fewer lines"` |
| **Overflow — list deep nesting** | Native disc/circle/square cycle for 3 levels; no clamp. Indent 20 px per level. | (no copy) |
| **Reduced motion** | Handle does not fade — always visible at `opacity: 0.4`. Popover open transition collapses to instant. Chevron rotation collapses to instant. Block-bg-on-hover transition collapses to instant. | (n/a) |

Empty-body host copy is approved as **"This body is empty."** —
neutral, no superlatives, no marketing tone, ≤ 6 words.

## Behavior + motion + keyboard

### Focus stops

- Tab order: `body container → Block(0) → Block(1) → … → Block(N-1)`.
- Each block is `tabindex="0"` and exposes a focus ring on the block,
  not on the handle. The handle is reachable via the focused block's
  `Enter` / `Space`, not via Tab — this avoids doubling tab stops on
  every block (matches Notion's pattern).

### Keyboard

| Key | Behavior |
|---|---|
| `↓` | Focus next block (document order). Wraps at bottom. |
| `↑` | Focus previous block. Wraps at top. |
| `Enter` | When a block is focused: open the popover anchored to its handle. Focus moves to first popover item. |
| `Space` | Same as Enter (alternative open gesture). |
| `Esc` | When the popover is open: close it; return focus to the handle. When a block is focused without an open popover: blur the block. |
| `⌘L` / `Ctrl-L` | Copy permalink of the focused block (regardless of popover state). Triggers the same copy-success transient as the popover item. |
| `⌘E` / `Ctrl-E` | When focused on a block on an edit-capable surface (KnowledgeDetail): trigger Suggest edit. No-op on read-only surfaces (WorkBet). |
| `↑` / `↓` (popover open) | Step between popover items. |
| `↵` (popover open) | Invoke focused popover item. |
| `Tab` (popover open) | Trap-cycles within popover items. |
| `Shift+Tab` (popover open) | Reverse trap-cycle. |

**No J/K bigrams.** No vim-style. Architect may layer arrow-step
hooks externally; the renderer is shipped without them.

### Transitions (named per tokens)

| Transition | Property | Token | Curve |
|---|---|---|---|
| Block bg on hover | `background` | `--motion-fast` (80 ms) | `--motion-ease` |
| Handle reveal | `opacity` | `--motion-fast` (80 ms) | `--motion-ease` |
| Chevron rotate (closed → open) | `transform` (rotate 0 → 90 deg) | `--motion-fast` (80 ms) | `--motion-ease` |
| Popover open | `opacity` + `transform: translateY(4px → 0)` | `--motion-medium` (150 ms) | `--motion-ease` |
| Popover close | `opacity` | `--motion-fast` (80 ms) | `--motion-ease` |
| Code expand/collapse | `display` swap (no animated `height` per AQ-014); affordance fades over `--motion-fast` | `--motion-fast` | `--motion-ease` |
| Copy-success label rotate | `color` to `--ok`, label swap, then revert | `--motion-fast` | `--motion-ease` |

All animated properties are `transform`, `opacity`, `background`,
`color` — no animated layout properties (AQ-014 compliant).

### Reduced-motion fallback

Inherits the `tokens.css` `prefers-reduced-motion: reduce` block:
every `--motion-*` collapses to 1 ms. The handle does NOT fade — it
sits at `opacity: 0.4` permanently so the affordance is discoverable.
The chevron rotation, popover open/close, copy-success label rotate
and code-collapse affordance fade all become instant cuts.

## Mobile adaptation (≤ 640 px)

- The two-column desktop layout collapses to single-column.
- The 32 px gutter shrinks to **28 px**. The handle is **always
  visible at `opacity: 1`** — no hover gesture exists on touch.
- Single tap on the handle opens the popover; the popover renders
  as a bottom sheet (anchored to the handle but expanding to ~80 %
  of viewport width via `@floating-ui/react` shift+flip middleware).
- Tap outside the popover closes it.
- Thread-count chip is rendered slightly larger (18×18 instead of
  16×16) to clear the 44 px touch-target floor (AQ-015) when combined
  with the chevron's hit area; the gutter cell (28 × min-44 px) is
  the actual hit target.
- All `⌘L` / `⌘E` shortcut hints are suppressed on mobile (no
  modifier keys).
- Code language label remains visible. Code collapse (> 20 lines)
  remains visible. Table sticky header + right-edge scroll fade
  remain.
- Image zoom indicator remains visible at the same 28×28 size.
- Auto-density flips to `comfortable` at viewport ≤ 1024 px (per
  AQ-016) — touch targets clear AQ-015.
- Long paragraphs do NOT clamp. (B's clamp-to-5 is rejected for L2;
  if a future story requests it, it composes outside `Block`.)

## Open questions for the architect

These are concept-shaped or implementation-shaped questions the
architect resolves in `/architecture L2`. Each is recorded so the
architect knows the design has not pre-decided them.

1. **Markdown parser choice.** `remark` + `remark-gfm`, `micromark`,
   `markdown-it`, or other? Contract is GFM-faithful, deterministic,
   pure. Designer recommendation: `remark` + `remark-gfm` (deterministic,
   shared between server + client, pluggable AST). Architect call.
2. **Cache placement.** In-memory per-process, dedicated `block_cache`
   table keyed by `(body_sha, parser_version)`, or React-Query-only?
   BLOCKS.md §10 says derivation lives in `packages/shared`; placement
   is open.
3. **Server-side vs. client-side derivation.** BLOCKS.md §10 fixes
   that derivation runs on both. Architect picks the proxy/source-of-
   truth strategy (single source vs. independent derivation with
   parser-version negotiation).
4. **Slot-prop typing.** Discriminated union by surface
   (`{ surface: 'work-bet' } | { surface: 'knowledge-detail' }`) vs.
   flat `Partial<{...}>` shape. Designer recommendation: flat shape;
   over-passing collapses harmlessly to nothing.
5. **Popover positioning collision strategy.** Proposed
   `placement: 'right-start'` + `flip()` + `shift({ padding: 8 })`.
   Architect verifies via `@floating-ui/react` middleware tests on
   narrow viewports (Submenu + Rail open → ≤ 720 px body column).
6. **Permalink URL format.** Designer-recommended fragment shape:
   `#blk-<blockId-hex>` on the surface's existing route. Architect
   confirms the host route doesn't already use `#` for something else.
7. **Syntax-highlighter scope.** Variant proposed a 5-class monochrome
   highlight set. Designer says: ship without highlighting in L2;
   architect decides whether to add Shiki / Prism in L2 or defer to a
   follow-up. Either way, BlockId derivation does NOT include
   highlighter markup (highlights are renderer-only).
8. **Sanitiser policy for `html` blocks.** DOMPurify is the codebase
   precedent (`KnowledgeDetail` uses it). Variants assume `<details>`,
   `<summary>`, `<kbd>`, `<sub>`, `<sup>` survive. Architect approves
   the allowlist.
9. **Thread-count batched query shape.** The chip count needs a query
   that joins block ids of a body to L1 threads with
   `attachedTo.kind = "block"`. Designer assumes a single batched
   lookup per body returning `Map<blockId, count>`. Architect
   confirms the query plan + index strategy.
10. **Single-popover invariant placement.** "Only one popover open at
    a time" rule lives in `BlockHandle` (each subscribes to a
    body-level signal) or in a `BlockBody` wrapper that owns the
    open-popover-id state. Designer recommends body-level wrapper.
11. **Suggest-edit gating with L25.** Designer recommends:
    `Suggest edit` is the L25 entry point; clicking it transitions
    the body into edit mode with the cursor pre-positioned on this
    block. Architect confirms with L25's edit-gating model.
12. **Front-matter / `BodyMetadata` rendering.** Per BLOCKS.md §6,
    `metadata` rides as a sibling field. Designer says: not rendered
    inside the block stream. Architect confirms surface-level
    chrome (Knowledge body header, diagnostics panel) consumes
    metadata directly, not through `Block`.

## Component data attributes

Per K2's DOM-marker contract:

- The `Block` shell carries `data-ds-component="block"` and
  `data-ds-kind="{kind}"` (one of `heading|paragraph|list|quote|code|
  table|divider|image|html|unknown`).
- `BlockHandle` carries `data-ds-component="block-handle"`.
- `BlockActionsPopover` carries `data-ds-component="block-actions-popover"`.
- The block id is exposed as `data-block-id="{blockIdHex}"` on the
  `Block` shell — used by deep-link scrolling (`#blk-<id>`) and by
  Playwright tests.
- Modifier states use `data-state`:
  - `data-state="default"` (unset / default)
  - `data-state="hovered"`
  - `data-state="focused"`
  - `data-state="popover-open"` (handle pinned)
  - `data-state="deleted"` (block-deleted shell)
  - `data-state="unknown"` (unknown block)

The architect chooses whether modifier classes (`Block--deleted`,
`Block--unknown`) double the data attributes (BEM + data) or replace
them; both forms are acceptable.

## Accessibility commitments

- **Semantic HTML mapping per kind**: `<h1..h6>` for headings,
  `<p>` for paragraphs, `<ul>`/`<ol>`/`<li>` for lists,
  `<blockquote>` for quotes, `<pre><code>` for code blocks,
  `<table>`/`<thead>`/`<tbody>`/`<th>`/`<td>` for tables, `<hr>`
  for dividers, `<figure>`/`<img>`/`<figcaption>` for images,
  sanitised HTML rendered as itself (with ARIA preserved by the
  sanitiser policy).
- **Focus rings.** `Block`'s outer shell uses `:focus-visible` with
  the `--focus-ring` token (1 px solid `--primary`,
  `outline-offset: -1px`). Handle inherits the same on its own
  `:focus-visible`. Popover items use the same.
- **Contrast.** Inline marks (`<strong>`, `<em>`, `<a>`, inline
  `<code>`) maintain ≥ 4.5 : 1 against `--surface-0` / `--surface-1` /
  `--surface-ghost`. Per K8 a11y baseline. The `--text-lo` for the
  resting handle (`opacity: 0.4` under reduced motion) meets the
  3 : 1 large-text floor for non-text affordances; the chevron is
  decorative-but-not-essential under WAI-ARIA so 4.5 : 1 is not
  required.
- **Handle `aria-label`.** `aria-label="Open block actions"` on the
  handle button. `aria-expanded` toggles. `aria-controls` references
  the popover id when open.
- **Popover `aria` semantics.** `role="menu"`; items are
  `role="menuitem"`; disabled items carry `aria-disabled="true"` and
  the textual hint ("read-only").
- **`role="region"` + `aria-labelledby`** for blocks that nest a
  heading (the heading is the labelling element). `Block` of
  `kind: heading` does not nest itself; `Block` of any other kind
  does NOT auto-promote to `role="region"` unless the surface
  explicitly groups it.
- **Image alt text** preserved verbatim from markdown
  `![alt](url)`. Empty-alt images render with `alt=""` (decorative).
- **Reduced motion** honoured via tokens (`prefers-reduced-motion:
  reduce` collapses every `--motion-*` to 1 ms).
- **Touch target floor.** The handle's hit area is the full 28 ×
  44 px gutter cell on mobile (AQ-015 compliant). On desktop, the
  handle's hit area is the full 32 px gutter column at the block's
  height (rarely < 24 px tall for any populated kind, but the
  block container itself extends the focus-within target zone).
- **Copy-success announcement.** `aria-live="polite"` region inside
  `BlockActionsPopover` announces "Copied" when the permalink is
  written to clipboard.

## Final critique score (against this approved.md as a spec)

Scored 0-10 across the nine /design-critique dimensions, treating
this document as the spec the architect inherits.

| Dimension | Score | Notes |
|---|---|---|
| 1. Visual hierarchy | 8 | Body reads as prose; handle recedes; popover surfaces actions on demand. The 32 px gutter is the only chrome the reader sees at rest. |
| 2. Spacing | 8 | All values from tokens (8/12/16, gap 2 px on lists, table row pad 6/8). 4 px grid honored. |
| 3. Color | 9 | Single `--primary` accent; `--ok` only on copy-success transient; `--danger` only on deleted-block strip; `--warn` only on `unknown` stripe. No drift. |
| 4. Typography | 8 | Geist body / Geist Mono code; H1/H2 from `--density-text-h*`; tabular-nums on tables; tracking-caps on uppercase labels. |
| 5. Density | 8 | High density (32 px gutter is action-zone, not visual rule); body padding from `--density-card-pad`; inter-block gap from `--density-card-gap`. |
| 6. Aesthetic coherence | 8 | One outer shell + slots; per-kind payload scaffolding stays inside the payload renderers; modifier classes for unknown/deleted. Chevron iconography neutral. |
| 7. State coverage | 9 | Empty / loading / one-block error / whole-body error / populated / hovered / focused / popover-open / copy-success / suggest-edit-disabled / threaded / deleted / unknown / table-overflow / code-overflow / list-overflow / reduced-motion — all spec'd with copy. |
| 8. Premium polish | 8 | Tabular-nums on tables, tracking-caps on uppercase, motion tokens with reduced-motion fallback, focus ring on `--primary`, halation guard (no pure black). Copy-success transient with `aria-live`. |
| 9. Accessibility | 9 | Semantic HTML per kind, focus-visible rings, ARIA on handle + popover, copy announcement, touch-target floor on mobile, alt text preserved, role="region" rule explicit. Keyboard parity covers every action. |

**Total: 75 / 90 → average 8.3 / 9.** Threshold (≥ 7 average): **PASS.**

No iteration required.

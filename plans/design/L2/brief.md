# L2 (Block primitive) — design brief

> Phase 0 of `/design L2`. Interrogated brief that fixes the design problem before
> any variant is generated. Variants explore the *visual / interaction* shape; they
> do not redefine the concept (see `docs/concept/BLOCKS.md`).

## Story (one sentence)

A reader (founder, agent reviewer, contributor) opens a bet pitch or a knowledge
body and reads, scans, deep-links, and discusses individual blocks of structured
prose without the renderer ever exposing the underlying markdown source.

## What surfaces does this ship into?

1. **`WorkBet`** (`packages/web/src/pages/WorkBet.tsx:262-267`) — the `<pre>` fallback
   for the bet pitch markdown is replaced. Reading density: prose-heavy, wider column.
2. **`KnowledgeDetail`** (`packages/web/src/pages/KnowledgeDetail.tsx:301-307`) — the
   `<pre>` knowledge body is replaced. Reading density: denser, narrower column,
   metadata strip above.
3. (Later, downstream) Future structured-prose surfaces — task notes, retros, etc.

Conversations does NOT consume Blocks (chat messages are not blocks; concept §3 #2).

## Who's reading? What are they doing?

Three primary tasks per `HUMAN_INTERFACE_LAYER.md` and the L2 / L23 / L26 stories:

- **Scan** — the founder reads the body top-to-bottom or jumps to a section. Headings
  and visual hierarchy matter. Block boundaries should never *fight* the reading flow.
- **Discuss** — the founder (or agent) anchors a thread to a specific block (per L26).
  Every block needs an attachable anchor. The anchor shape is `{ blockId }` per
  `BLOCKS.md` §4.
- **Deep-link** — the founder copies a permalink to a block to mention in a thread or
  hand to a teammate. The permalink is `host/...#blk-{blockId}` (concept §8.4).

Secondary tasks:

- **Copy code** — the body has a `code` block worth copying.
- **Open image** — the body has a `block-level image` worth viewing larger.
- **Read tables** — wide tables overflow the column; need a scroll affordance.

## What's the smallest UI surface that delivers the user's outcome?

A vertical list of rendered blocks, with each block addressable, anchorable, and
visually identifiable as one of nine content kinds + an `unknown` sentinel.
Per-kind chrome (copy, expand, lightbox, etc.) is the variant axis being explored
in /design — not a fixed input.

## What's the primary state?

Populated. A bet pitch and a knowledge body almost always have ≥ 5 blocks. The
empty state (`body === ''`) is rare in real use but must render *something*
graceful. The most common edge state is "very long body with one or two long
code blocks" — variants must handle this without scroll-jacking the page.

## New primitive or extending an existing one?

**New primitive.** Shape is open per `/design` SKILL: variants explore *what the
block looks like and how the reader interacts with it*. The concept fixes the data
shape (`{ id, kind, source, payload, anchor, order }` per `BLOCKS.md` §2); design
fixes the visual contract.

## What gets overflowed, truncated, or hidden when content is dense?

- **Wide tables** — variants must pick a strategy (horizontal scroll inside the
  block, sticky header, font-size reduction, or none).
- **Long code blocks** — variants pick: no collapse / collapse beyond N lines /
  always-show with internal scroll.
- **Long lists** — list payloads can be deep-nested; depth ≥ 4 is rare but legal.
  Variants pick spacing per nesting level.
- **Block-level images** — variants pick max-height / lightbox / inline only.

## What existing components / DaisyUI primitives compose into this?

- Tier 1: `StatusChip` (for the `unknown` block's "unsupported" pill or the
  block-deleted indicator), `KeyValue` (in surrounding metadata strips, not
  inside Block), `Tag` (for block kind labels in `unknown`).
- Tier 3: `ArtifactView`'s metadata strip pattern (for the `KnowledgeDetail`
  context block — Block does not own this strip; the surrounding page does).
- DaisyUI: nothing block-specific. Tokens come from `packages/design-system/src/tokens.css`.
- Behavior: `@floating-ui/react` (per SHARED.md UI Stack) — relevant to variants
  that float a popover / lightbox.
- Iconography: inline SVG via `tag-kinds.tsx` precedent — no `lucide-react`.

## Anti-convergence axes — variants must differ on ≥ 3 of these per pair

- **Hierarchy** — where the eye lands first. Reading flow vs. action surface.
- **Density** — how much per row. Minimal scaffold vs. self-contained vs. layered.
- **State strategy** — one canonical layout vs. distinct shapes per kind vs.
  base-plus-slots.
- **Action surface** — gutter / corner / hover-handle.
- **Composition** — one component vs. many small components vs. base + slot props.
- **Discovery affordance** — anchor visible by default vs. hover-revealed vs.
  always-visible-on-mobile.

## Hard rejects — these are NOT variant axes (already settled)

- Drag-reorder of blocks. (Track L scope rules; concept §1 — derived view, not
  editable structure.)
- Keyboard verb shortcuts beyond what the journey doc names. (Project-wide rule.)
- Optimistic UI bragging ("Saved!"). (Project-wide rule.)
- Emoji reactions on blocks. (Project-wide rule.)
- AI-aesthetic patterns: purple gradients, decorative icons, oversized padding,
  generic 3-column hero, rounded-pill-everywhere. (`AESTHETICS.md` AQ-101..AQ-113.)
- A new on-disk markdown dialect. (Concept §3 #1; founder reframe.)
- A separate per-block-comment data primitive. (Concept §8.5 rule 4 — uses L1
  Thread.)
- Inline `[[id]]` linking. (L24 deferred; the anchor is the primitive's own
  affordance.)

## Mobile constraint

The factory layout collapses to a three-tab mobile (per `HUMAN_INTERFACE_LAYER.md`
§ 3.4). Block rendering must remain readable in the narrow column; per-block
chrome must collapse gracefully (variants pick: hide / show on focus-within /
single overflow button).

## Founder filter (autonomous-mode picker, when /design Phase 4 chooses)

If two variants score within 1 point of each other on `/design-critique`, prefer:

1. The variant with the lowest component-budget cost (fewer new shapes).
2. The variant whose chrome stays out of the reading flow (scan is the most common
   task).
3. The variant whose mobile collapse is graceful (matches the three-tab mobile
   layout).

## Open questions parked for the architect (post-design)

- Markdown parser choice (`remark` + `remark-gfm` vs. `micromark` vs. `markdown-it`)
  — concept §13 architect call.
- Cache placement (in-memory / `block_cache` table / React-Query-only) — concept §13
  architect call.
- Whether `code` block syntax-highlighting ships in L2 or is a follow-up — design
  variants must render `code` legibly without highlighter, but may suggest one.
- Sanitiser policy for `html` blocks — DOMPurify is the codebase precedent
  (`KnowledgeDetail` uses it).

## Variant brief — handed to designer sub-agents

Three variants explore the new-primitive shape per /design SKILL Phase 1:

- **Variant A — "Container with payload"** (minimal scaffold).
  Smallest component count. Reuse existing primitives. Anchor is a 4px gutter dot.
  No per-kind chrome.

- **Variant B — "Self-contained block"** (power-density rethink).
  Each kind owns its own micro-layout including kind-specific chrome (copy on
  code, scroll on table, anchor-permalink on heading). Persistent corner-button
  group is the variant's chrome.

- **Variant C — "Layered with slots"** (reference-borrowed: Notion's block-handle).
  Hover-revealed left-side handle aggregates all per-block actions in one consistent
  position. Slot API lets surfaces extend without re-implementing.

Each variant produces `spec.md` + `mockup.html` + `screenshot.png` in its own
`docs/design-explorations/L2/<variant-slug>/` subdirectory and self-critiques
across the nine `/design-critique` dimensions.

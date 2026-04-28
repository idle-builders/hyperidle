# L2 Block primitive — synthesis

> Phase 4 of `/design L2`. Selects the strongest base, pulls forward the
> most useful elements from the other variants, and fixes the rejected
> set so the architect cannot re-litigate.

## Strongest base — Variant C

Variant C scored highest on the canonical 9-dimension critique (78/90)
and wins on every founder-filter axis:

1. **Component-budget cost** — adds 2 new components (`Block`,
   `BlockHandle`), at most a third (`BlockActionsPopover`) which the
   spec already reserves. A's "0 components" is technically lighter,
   but A delivers no popover, no surface-composed actions, no
   discoverability path — picking A would force the design to grow
   sub-components anyway when L26 lands. C front-loads the right
   abstractions so L26 (per-block discussion), L23 (knowledge body),
   and L16 (bet pitch) inherit them for free.
2. **Chrome-out-of-reading-flow** — C's handle is invisible by default
   on desktop and animates in `--motion-fast` on hover. The body reads
   as prose. B fails this criterion outright (per-kind chrome
   always-visible).
3. **Mobile graceful collapse** — C makes the handle always-visible on
   mobile, which is the right gesture for touch. B collapses to a
   single overflow button (also fine). A's mobile story is the weakest
   (16 px tap target requires after-the-fact mitigation).

C is the base. Architecture work proceeds against C's component
composition with the synthesis adjustments below.

## Pulled-in elements

From **Variant A**, pulled into the C base:

- **The "calm prose" thesis.** C's handle must stay opacity 0 by default
  on desktop (matching C's spec) and not push the body content right
  with a permanent gutter rule. The 32 px gutter is the action *zone*,
  not a visible column. This is A's reading-flow priority adapted to C's
  layout.
- **Modifier-class approach for `unknown` and `block-deleted`.** A's
  "same shell, modifier class" pattern reads as one primitive instead of
  two bolted-on shapes. C already proposes this (warn stripe + dashed
  deleted strip); the synthesis confirms both are modifiers on the same
  `Block` shell, not new components.
- **`StatusChip`-shape for the deleted indicator.** A's spec composes a
  `StatusChip` for the deleted-block strip's "DELETED" pill (status
  `error`, mono caps). C's deleted strip is a generic dashed band.
  **Pull A's StatusChip composition into C** so the deleted indicator
  uses an existing primitive instead of inventing one.

From **Variant B**, pulled into the C base:

- **Per-kind scroll fade on tables.** B's table renderer wraps in
  `.table-wrap` with a right-edge gradient fade signalling "more
  columns to the right" and a `position: sticky` header on
  `--surface-3`. C is silent on table overflow. **Pull B's
  `.table-wrap` + sticky-header pattern into C's `TablePayload`
  renderer** — no new component, just per-kind scaffolding inside the
  payload renderer.
- **Code block collapse beyond 20 lines.** B caps `code` at 20 lines and
  shows a "+ Show N more lines" affordance. **Pull this into C's
  `CodePayload` renderer.** Toggle is local state on the payload
  renderer; no slot API change required.
- **Code block language label.** B shows the language tag as a small
  `--text-mid` mono caption above the `<pre>`. **Pull this in** —
  language label only, no copy button (the popover's `Copy permalink`
  + future "Copy contents" is the surface-composed alternative; or B's
  pattern of selection-then-copy is acceptable for L2).
- **Image zoom indicator.** B paints a 28×28 zoom button on `--surface-0/75 %`
  overlay top-right of the figure. The implementation is host-side
  (lightbox is not L2's scope). **Pull in the indicator only** as a
  visual hint that the image is interactable; the lightbox itself is
  a future story (probably L23).
- **Copy-success transient + `aria-live`** when the popover's `Copy
  permalink` is invoked. B specifies a label rotate from "permalink"
  to "copied" with `--ok` color and `aria-live="polite"`.
  **Pull this into C's `BlockActionsPopover`** so the popover item
  speaks success to screen-reader users.

## Explicitly rejected

The architect inherits this list and refuses re-litigation.

1. **Reject A's "no per-kind chrome anywhere".** Reason: tables overflow,
   code blocks need legibility (mono font, language tag), sanitised HTML
   needs `<details>` chrome — the bare minimum is still per-kind. A's
   thesis is correct for the *outer* shell (every block shares the same
   container, handle, focus ring, modifier classes) but wrong for the
   *payload* (kinds need kind-appropriate scaffolding).

2. **Reject B's "kind-specific corner buttons on every block".** Reason:
   per-kind chrome that's always-visible competes with prose (per-block
   independent re-score: hierarchy 7 / coherence 7 / density 8). The
   consistent-handle model in C is more discoverable and stays out of
   the reading flow. The popover absorbs the actions B's strip carries
   (permalink, thread chip → popover items).

3. **Reject C's 6-dot drag-grip iconography.** Reason: 6 dots ≡ Notion's
   *drag* handle by user expectation, but Track L scope rejects
   drag-reorder of block content. The synthesis replaces the 6-dot grip
   with a **single chevron-right glyph (`>`)**. Rationale:
   - Chevron-right is the conventional "expand/disclose" affordance —
     matches the popover-on-click semantics exactly (opens additional
     content / actions).
   - Chevron carries no drag-handle meaning in any reference UI.
   - Single 12 px stroke icon is lighter visual weight than a 2×3 dot
     grid — better deference to prose.
   - When the popover is open, the chevron rotates 90° (`--motion-fast`,
     `transform: rotate(90deg)`) to point down, signalling open state
     in the icon itself (not just `aria-expanded`).
   The chevron is rendered as inline 12×12 SVG per the project's
   `tag-kinds.tsx` precedent (no `lucide-react`).

4. **Reject the "single accent dot" decoration on the code language pill.**
   B paints a leading 6 px `--ok` dot before the language tag. Reason:
   `--ok` is a status color. Decorative use bleaches its meaning. The
   synthesis's `code` language label is mono `--text-mid` only, no
   leading dot.

5. **Reject the J/K keyboard sequence at the renderer level.** Variant B
   defines J/K as block-stepping shortcuts. Variant C defines J/K *and*
   ↑/↓. Reason: J/K is a vim-style shortcut that conflicts with the
   project-wide rule against keyboard-verb shortcuts. The synthesis
   keeps **arrow-key block stepping** (`↑` / `↓`) only. The architect
   may layer a J/K hook outside the renderer if a power-user request
   lands; the renderer ships without it.

6. **Reject any new top-level routes for permalinks.** Two variants
   propose `/permalink/<blockId>`-style routes. Reason: BLOCKS.md §8.4
   documents the permalink as a fragment on the host route
   (`#blk-<blockId>`); the surface infers the host from the URL it
   already has. Synthesis follows the concept doc.

7. **Reject any variant element that requires a `block_comments` table
   or any per-block primary key.** Concept §8.5 rule 4 + concept §3 rule
   3 forbid this. None of the three variants violated this; the
   rejection is recorded so the architect cannot reintroduce it.

8. **Reject the "discoverability tail" auto-show after 3 s** from C's
   spec. Reason: timed motion that a user did not request is a
   notification anti-pattern. The synthesis instead pulls A's
   approach: the handle is always faintly visible at `opacity: 0.4`
   under `prefers-reduced-motion` (which C already specifies) — and
   on the first session-load of any block-rendering page, the first
   block's handle stays at `opacity: 0.4` until the user has hovered
   any block once. Not a timed reveal; a one-shot onboarding cue.

## Founder filter conformance

Walking through the rejection list in `brief.md` § "Hard rejects":

| Rule | Synthesis verdict |
|---|---|
| No drag-reorder | The handle is a chevron, not a drag-grip. Cursor is `pointer`, not `grab`. Tooltip says "Open block actions" or similar. |
| No keyboard verb shortcuts beyond what the journey doc names | Arrow-key block stepping + Enter/Space to open popover + Esc to close + ⌘L for permalink. No J/K. ⌘L is the project's documented permalink shortcut. |
| No optimistic UI bragging | The copy-success transient is `aria-live="polite"` for SR users only; visual is a label rotate to "copied" for 1500 ms — that is feedback, not a "Saved!" toast. |
| No emoji reactions on blocks | Zero emojis anywhere. The popover uses inline SVG glyphs only (chevron, link, comment-bubble, edit). |
| No AI-aesthetic patterns | No purple gradients (single `--primary` from tokens). No rounded-2xl (radii from `--r1/--r2`). No oversized padding (8/12/16 only). No hero. No 3-column card grid. |
| No on-disk markdown dialect | Synthesis is read-side only. Zero impact on the file watcher or the writeback path. |
| No separate per-block-comment data primitive | Per-block discussion (L26) attaches via L1 thread `attachedTo = { kind: "block", blockId, hostKind, hostId }`. Synthesis adds no new table. |
| No inline `[[id]]` linking | Synthesis uses the BlockAnchor (`{ blockId }`) directly as the permalink; no `[[id]]` parsing introduced. |

All conformance: **pass**.

## Address gaps from Phase 2 critiques

Each variant had findings the synthesis must close:

- **Variant A's table overflow gap** — closed by pulling B's `.table-wrap`
  sticky-header + scroll-fade pattern into the synthesis's
  `TablePayload`.
- **Variant A's premium-polish gap on `code`** — closed by pulling B's
  language label + 20-line collapse pattern into the synthesis's
  `CodePayload`.
- **Variant A's 16 px tap-target gap** — closed by adopting C's 32 px
  gutter (the handle's hit area is the gutter cell).
- **Variant B's hierarchy/coherence drift** — closed by inverting the
  chrome model: pull-in B's per-kind payload chrome but suppress B's
  always-visible corner-strip; the action surface is C's hover-revealed
  handle instead.
- **Variant B's color drift** (`--ok` dot on every code block) — closed
  by removing the dot; language label is mono `--text-mid` only.
- **Variant C's drag-grip ambiguity** — closed by replacing the 6-dot
  grip with a chevron-right glyph that rotates 90° when the popover
  opens.
- **Variant C's gutter cost** — accepted, with the mitigation that the
  gutter is action zone only (no border, no rule, no visible column);
  the body padding-left is the gutter width plus `--density-card-pad`.
  On mobile, the gutter shrinks to 28 px and the handle is always
  visible.

No dimension scored < 5 in Phase 2; no outstanding adversary risk.

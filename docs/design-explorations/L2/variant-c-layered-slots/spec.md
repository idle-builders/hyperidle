# L2 Block primitive — Variant C: Layered with slots

**Reference borrowed.** Notion's block-handle model — stripped of decorative chrome, retuned to factory-dark, drag explicitly rejected.

**Thesis.** A proven interaction grammar shortens the user's learning curve. Notion users land and instantly know how to interact with prose. Slots let surfaces extend the base block without re-implementing the renderer.

---

## 1. User story

As a founder reading a bet pitch on `WorkBet` or a knowledge body on `KnowledgeDetail`, I want every block in the prose to expose a single, consistently-positioned hover-revealed handle on its left edge — one place that aggregates *every* per-block action (permalink, view threads, suggest edit) — so I learn the location once and never have to scan a block looking for what I can do with it.

The handle is silent until I move the cursor near a block. When I hover, it fades in (motion-fast); when I focus a block by keyboard, it appears with a focus ring on the block itself. Click the 6-dot grip and a popover opens anchored to the handle, listing the actions available *in this surface*. The action set is composed by the surface, not by the block — `WorkBet` shows `Copy permalink` + `View threads`; `KnowledgeDetail` adds `Suggest edit`.

---

## 2. Component composition

### 2.1 Slot API

The block renderer is one component with named slot props. Surfaces compose by passing JSX into the slot they want to fill. Empty slots collapse to nothing.

```tsx
// Conceptual API — TSX implementation is the architect's call.
<Block
  id={block.id}
  kind={block.kind}
  payload={block.payload}
  slots={{
    gutterLeading: <BlockHandle blockId={block.id} threadCount={threads} onOpen={openPopover} />,
    gutterTrailing: undefined,                                        // unused in MVP
    inlineAfterPayload: undefined,                                    // reserved for future per-kind chrome
    overlay: <BlockActionsPopover items={actionsForSurface} />,       // rendered via @floating-ui/react portal
  }}
/>
```

The four named slots are the contract:

| Slot | Where it renders | Use today |
|---|---|---|
| `gutterLeading` | Left gutter, vertically aligned with the first line of the payload | `<BlockHandle />` (grip + thread-count chip) |
| `gutterTrailing` | Right gutter, decorative-only | Unused (reserved for kind-specific chrome a future story may need) |
| `inlineAfterPayload` | Inline immediately after the payload, before the trailing gutter | Reserved (e.g. a copy-code button on `code` blocks could go here in a future story) |
| `overlay` | Absolutely-positioned, anchored to `gutterLeading` via `@floating-ui/react` | `<BlockActionsPopover />` when the user opens the handle |

### 2.2 Sub-components introduced

Three new pieces, all internal to the L2 implementation. None need to be promoted to the canonical 19-component budget — they are *parts of* the Block primitive (which is itself the renderer for the L2 content primitive, distinct from the Tier 2 Blocks tier per BLOCKS.md §7).

- **`BlockView`** — the slotted base. One file, ~10 kind-specific render branches. Source-of-truth for spacing, focus ring, hover state.
- **`BlockHandle`** — the gutter-leading content. Renders the 6-dot grip (always) and the thread-count chip (when `threadCount > 0`). Owns its `aria-expanded` / popover toggle.
- **`BlockActionsPopover`** — the overlay content. Receives a closed enum of action items + their enabled/disabled state. Positioning is delegated to `@floating-ui/react` (existing dep per SHARED.md UI Stack); collision strategy: `flip` to the right side of the block when the page-left edge would clip the popover.

Each kind's payload (`HeadingBlockView`, `ParagraphBlockView`, …) is rendered *inside* `BlockView`'s payload slot — they are not stand-alone in the slot API. This matches BLOCKS.md §7's `*BlockView` naming convention.

### 2.3 Why slots, not props

Three reasons:

1. **Surfaces compose differently.** WorkBet wants 2 actions, KnowledgeDetail wants 3, a future review surface might add `Flag` or `Copy as quote`. A flat `actions={[…]}` prop would force every consumer to know the action shape. A slot lets the surface render whatever it wants — including bespoke chrome — without the base block knowing.
2. **Tree-shake the unused.** A surface that fills only `gutterLeading` doesn't import `BlockActionsPopover`. The slot API gives architects control over the React subtree.
3. **No prop explosion.** Without slots, `BlockView` would grow `onCopyPermalink`, `onOpenThreads`, `onSuggestEdit`, `threadCount`, `permalinkEnabled`, `suggestEditEnabled`, … each tied to one surface. Slots collapse all of that into one `slots` prop with a typed shape.

---

## 3. Information hierarchy

In any block row, in left-to-right reading order:

1. **Gutter-leading slot** (32 px column on desktop, 28 px on mobile). Visually absent until hover/focus. Lowest visual weight when present (text-lo dot fill).
2. **Payload** (the only thing on screen at rest). Full text-hi weight. The reader's attention lives here.
3. **Gutter-trailing slot** (8 px column). Absent in MVP.

Within the handle itself, in reading order:

1. **6-dot grip** — flat icon, 16×16, two-column dot grid. text-lo at rest, text-mid on hover. Tooltip "Click for actions" forestalls the Notion-drag assumption.
2. **Thread-count chip** — only present when `threadCount > 0`. Mono-numeric digit + chat-bubble glyph, 16 px tall, primary tint (`--primary-dim` background, `--primary` text). Click jumps directly to threads view (skip popover).

Within the popover, in reading order:

1. `Copy permalink` (always present, always enabled)
2. `View N threads` (present only when `threadCount > 0`; `N` is a literal number from the chip)
3. (divider — separates "navigate" from "modify")
4. `Suggest edit` (present only on edit-capable surfaces; disabled on `WorkBet` per L25 edit-mode gating)

Each item carries a mono-typed shortcut hint on the right (`⌘L`, `↵`, `⌘E`).

---

## 4. All states

| State | Visual | Notes |
|---|---|---|
| Empty body | The body container renders nothing — no "0 blocks" copy, no skeleton placeholder. | Matches Notion / Linear: an empty surface speaks for itself. |
| Loading | Skeleton lines matching the rough shape (3 paragraph-height bars + 1 heading bar). No spinner. | Re-uses the existing Skeleton primitive. Skeleton blocks have no handle. |
| Error parsing | `ErrorState` primitive at body-level with `title="Could not render this body"`, `description="The markdown contains a structure we don't recognise. The raw text is preserved on disk."`, action: "Show source" toggle. | Per-block kind-specific errors (e.g. malformed table) render the affected block as `unknown` with the warn marker — the rest of the body stays valid. |
| Populated (default) | Every block renders. Handles invisible until hover. | Default reading state. |
| Hovered | Block bg `--surface-ghost`. Handle fades in over `--motion-fast` (80 ms). | Motion: opacity only. AQ-014 compliant. |
| Focused (keyboard) | 1 px solid `--primary` outline, offset -1, on the block itself. Handle is also visible (focus-within). | AQ-007 / AQ-010 compliant. |
| Popover-open | Handle stays visible (`is-pinned`); popover anchored to handle; `aria-expanded="true"` on grip. Outside click / Escape closes. | Popover uses `@floating-ui/react` `flip` middleware to bounce off the page-left edge. |
| Suggest-edit disabled | Item is muted (`text-lo`), cursor `not-allowed`, hint replaced with "read-only", `aria-disabled="true"`. Tooltip on hover: "Bet pitches are read-only — edit through the bet workflow." | Active on `WorkBet`. |
| Very long body | Each block's payload handles its own overflow (code → horizontal scroll; table → horizontal scroll; list → no clamp). The block as a whole never collapses. | Per BLOCKS.md §13 designer call: no special collapse. |
| Block-with-attached-thread | Thread-count chip appears beside the grip. Click chip → jump to threads. Click grip → popover with `View N threads` item. | Two paths to the same destination — the cheap path (chip) and the discoverable path (popover). |
| Block-deleted indicator | Replaces the missing block with a dashed-border strip in the body: `[deleted] Block referenced by N thread(s) is no longer in the body. Re-anchor on edit.` text-lo, mono. | The L26 thread points at the block-id; this strip exists so the thread has a visual home. |
| Unknown block | Payload renders as paragraph; left edge of payload carries a 2 px `--warn`-coloured stripe; an `unknown` chip prefixes the text. | The safety valve. Not an error — derivation succeeded. |

---

## 5. Behavior

### 5.1 Mouse

- **Hover block** → bg `--surface-ghost`, handle opacity 0 → 1 over `--motion-fast` (80 ms, `--motion-ease`).
- **Click grip** → popover opens, anchored to grip via `@floating-ui/react`. Outside click closes. Escape closes and returns focus to grip.
- **Click thread-count chip** → opens threads view directly (skip popover).
- **Click `Copy permalink`** → writes `<host>/blockId` to clipboard, popover closes, transient confirmation surfaces in the existing toast slot (out of scope here).
- **Click `Suggest edit`** (KnowledgeDetail) → enters L25 edit mode scoped to this block. Disabled in `WorkBet` (see §4).

### 5.2 Keyboard

- `J` / `K` (or `↓` / `↑`) — step block-by-block. The focused block carries the focus ring; its handle is visible.
- `Enter` on focused block — opens the popover (same as click on grip). Focus moves to the first popover item.
- `Space` on focused block — alternative popover-open (matches Notion).
- `Esc` on open popover — close popover; focus returns to the grip.
- `↑` / `↓` inside popover — step between items.
- `↵` inside popover — invoke the focused item.
- `⌘L` from any focused block — Copy permalink (popover not required).
- `⌘E` from any focused block on an edit-capable surface — Suggest edit. No-op on read-only surfaces.

Tab order: `body → block(0) → block(1) → … → block(N-1)`. The handle is *not* in the tab sequence — it is reachable only via the focused block's `Space` / `Enter`, which is consistent with Notion and avoids doubling tab stops on every block.

### 5.3 Reduced motion

When `prefers-reduced-motion: reduce`:

- The handle does not fade — it is always visible at `opacity: 0.6` so power users on macOS / Windows reduced-motion settings still discover it.
- On hover/focus, opacity jumps to 1 instantly (no transition).
- The popover open transition collapses to instant per the existing `--motion-*` reduced-motion media block in `tokens.css`.

### 5.4 Transitions (named per tokens)

| Transition | Property | Duration | Easing |
|---|---|---|---|
| Block bg on hover | `background` | `--motion-fast` (80 ms) | `--motion-ease` |
| Handle reveal | `opacity` | `--motion-fast` (80 ms) | `--motion-ease` |
| Popover open | `opacity`, `transform` (translateY 4 → 0) | `--motion-medium` (150 ms) | `--motion-ease` |
| Popover close | `opacity` | `--motion-fast` (80 ms) | `--motion-ease` |

All transitions animate `transform` / `opacity` only (AQ-014).

### 5.5 Focus management

- Opening the popover moves focus to the first item.
- Closing the popover (outside click, Escape, action invoked) returns focus to the grip — *not* to the block, so the user can immediately reopen the popover with `Enter` if they hit the wrong action.
- The popover traps `Tab` cycling — `Tab` on the last item moves focus back to the first; `Shift+Tab` on the first item moves to the last.

---

## 6. Mobile adaptation

Below the 640 px breakpoint:

- The grid shifts to a single column; the gutter-leading column shrinks from 32 → 28 px.
- The handle is **always visible** at full opacity — no hover gesture exists, so the affordance must be permanent.
- Single tap on the grip toggles the popover.
- Tap outside the popover closes it.
- The popover anchors below the grip and grows to ~80 % of the viewport width if needed (still uses `@floating-ui/react` flip middleware).
- The thread-count chip is rendered slightly larger (18 × 18 instead of 16 × 16) to clear the 44 CSS-px touch-target floor (AQ-015) when combined with the grip's hit area.
- All shortcuts collapse — no `⌘L` / `⌘E` hints rendered on mobile.

The Mobile shell's three-tab layout (per HUMAN_INTERFACE_LAYER §3) is unaffected: the Block primitive is a *content* primitive that renders inside whichever view (Work, Knowledge) is currently active. The handle sits inside the surface, not the shell.

---

## 7. Signature

> Every block has a left-side handle. One position, one grammar, every action. You learn it once.

Visually: a column of invisible-until-hover 6-dot grips down the left edge of every prose surface, with a primary-tinted thread-count chip beside the grip when threads exist. Everything else stays out of the way.

---

## 8. Trade-offs — what this variant is bad at

1. **Slot API adds complexity for consumers.** A surface using only the default actions still has to wire up the `slots` object. Mitigation: ship a `<Block>` convenience wrapper in `packages/design-system/src/Block.tsx` that defaults the slots for the canonical WorkBet / KnowledgeDetail cases. Surfaces that want to extend reach for the slotted base.

2. **Popover may collide with chat panes / Submenu / Rail.** On a 1280-px laptop with Submenu (240 px) + Rail (320 px) open, the body column is ~720 px. A popover anchored to the *left* gutter sits ~16 px from the page-left edge — in the worst case it could clip the Submenu boundary. Mitigation: `@floating-ui/react`'s `flip` middleware pushes the popover to the right side of the block when the page-left edge would clip; the connector arrow flips with it. Tested in the architect spike.

3. **Users unfamiliar with Notion may not discover the handle.** Power users (Notion, Linear, Roam) recognise the pattern instantly. Founders coming from product-management tools (Asana, Linear without prose, Jira) may not. Mitigation: on first hover of any block in a session, the handle stays visible for ~3 s after the mouse leaves (a "discoverability tail") so the user notices the affordance even if they only briefly hovered. After the first popover-open, the tail is disabled session-wide.

4. **The 6-dot icon hints at drag-reorder.** This is real. Notion's grip *is* draggable. We explicitly REJECT drag-reorder of block content (TRACK-L scope rule: blocks are derived from markdown, not editable in place — re-ordering blocks is editing the underlying markdown, which is a different surface). Mitigation: tooltip on the grip says **"Click for actions"** (not the more truthful but less useful "Drag is not supported"). The tooltip lands inside the first 500 ms of hover. The cursor on the grip is `pointer`, not `grab` — a user trying to drag will quickly see no drag-preview emerges. Pragmatically: 6 dots is the strongest single-glyph signal for "this is interactive in a per-block way" in any productivity tool today; the marginal user confusion is worth the strong affordance signal.

5. **Iconography is borrowed.** This variant explicitly trades originality for learnability. If we want a HyperIdle-distinct prose-handle iconography in v2 (a single dot, a corner-bracket, a margin-rule tick), variant A or B's territory is the right place to invent it. C says: don't.

6. **Two open popovers are possible if the user clicks two grips quickly.** Mitigation: a body-level controller closes any open popover before opening a new one (single-popover invariant). The architect specifies this in the L2 plan.

---

## 9. Open questions for the architect

These are concept-shaped — the design above answers all designer calls in BLOCKS.md §13 except the architect-call rows. They are listed here so the architect picks them up in `/architecture L2`.

1. **Slot prop typing.** Should the `slots` prop be a discriminated union keyed by surface (`{ surface: "work-bet"; slots: WorkBetSlots } | { surface: "knowledge-detail"; slots: KnowledgeDetailSlots }`) or a flat shape with all slots optional (`Partial<{ gutterLeading, gutterTrailing, inlineAfterPayload, overlay }>`)? The flat shape is simpler; the discriminated union prevents a consumer from accidentally passing `gutterTrailing` on a surface that doesn't render it. **Designer recommendation:** flat with optional slots — accidental over-passing is harmless (slot collapses to nothing) and the discriminated union locks future surfaces out of slot reuse.

2. **Popover positioning collision strategy.** On a narrow viewport with Submenu + Rail open, the body column may be < 600 px. Default `placement: 'right-start'` (popover sits to the right of the grip) avoids the page-left clip but pushes into the payload. Default `placement: 'bottom-start'` (popover hangs below the grip) keeps the payload visible but may clip the next block. **Designer recommendation:** `placement: 'right-start'` with `flip()` + `shift({ padding: 8 })` — the popover prefers right of the grip, flips to bottom-start if right would clip the page edge, and shifts to stay 8 px inside the page gutter. The architect verifies via `@floating-ui/react` middleware tests.

3. **Server-side render of the handle.** Is the handle rendered server-side (so the body painted during SSR already shows the handle markup, just hidden) or client-only (added during hydration)? **Designer recommendation:** server-side. The handle is structural, not interactive — opacity 0 until hover is a CSS rule, not a JS toggle. Hydration only attaches event handlers to the already-rendered grip.

4. **Suggest-edit gating with L25.** L25 introduces edit-mode for knowledge bodies. How does `Suggest edit` from the popover interact with L25's edit affordance? Two options: (a) `Suggest edit` opens an L25 edit session scoped to the block; (b) `Suggest edit` is the L25 entry point and clicking it transitions the entire body into edit mode with the cursor pre-positioned on this block. **Designer recommendation:** (b) — one edit mode for the body, with deep-link to the block. Simpler mental model, and L25's edit gating model already treats edit as a body-level state.

5. **Permalink format.** The `Copy permalink` action writes a URL containing the BlockId. Format `?<surface>=<hostId>#blk-<blockId>` (existing routing) or a dedicated `/permalink/<blockId>` route? **Designer recommendation:** the existing fragment-based form (`#blk-<id>`) — works inside both WorkBet and KnowledgeDetail without new routes; the surface infers the host from the URL it already has.

6. **Single-popover invariant placement.** Should the "only one popover open at a time" rule live in `BlockHandle` (each handle subscribes to a body-level signal) or in a `BlockBody` wrapper that renders all children + owns the open-popover-id state? **Designer recommendation:** body-level wrapper — fewer subscriptions, simpler reasoning, matches Notion's implementation.

---

## 10. Self-critique — score table

Scored 0-10 on each dimension. Sum is /90.

| Dimension | Score | Notes |
|---|---|---|
| Clarity (do the states + interactions read at a glance?) | 9 | The slot API + the four named slots are the load-bearing concept; the table in §2.1 makes them concrete. |
| Density (is there visual breathing without waste?) | 9 | 32 px gutter is the only chrome; the payload column owns the rest. Tokens-only spacing. |
| Aesthetic-quality compliance (AQ-101..AQ-113, no AI tells) | 9 | No purple gradients (only `--primary` which is the system token); no rounded-2xl; no oversized padding; no glass-morphism; flat surface ladder; only `var(--float)` shadow on the popover (AQ-012 compliant — popover is overlay). 6-dot icon is functional, not decorative. |
| Reuse / composability (does it shorten downstream stories?) | 10 | Slot API drops the per-surface duplication that variants A and B tend toward. L26 (per-block discussion) reaches for `gutterLeading`'s thread-count chip without re-implementing anything. |
| Mobile fitness | 8 | Handle always-visible on mobile; popover sized for thumb; touch-target floor cleared. The 28-px gutter takes screen real estate from the payload — accepted trade-off, but it is a real cost on a 360-px phone. |
| Keyboard parity (everything mouse-do-able is keyboard-do-able) | 9 | `J`/`K`/`Enter`/`Space`/`Esc` + `⌘L`/`⌘E` shortcuts cover all actions. Focus return-to-grip on close is the right call. |
| State coverage (every state from §4 is specified) | 9 | Empty / loading / error / populated / hovered / focused / popover-open / disabled / overflow / threaded / deleted / unknown — all covered. |
| Trade-off honesty | 9 | The drag-affordance ambiguity is named; the slot-API complexity is named; the discoverability gap for non-Notion users is named with a mitigation. |
| Reference-borrowing discipline (variant brief: Notion-borrowed, factory-dark) | 10 | Iconography matches Notion; chrome is stripped; tokens are factory-dark; drag is rejected explicitly. The mockup looks like neither Notion nor a generic AI dashboard — it looks like HyperIdle. |

**Total: 82 / 90.**

No dimension < 5. No fixes required.

Two minor follow-ups for the architect (already in §9):
- popover collision strategy proof on a narrow viewport
- single-popover invariant placement

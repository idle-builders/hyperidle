# Variant B — "Portal stack" (self-contained block)

**Composition:** the primitive owns its layout, scrim, focus, guard, sizing, and layer.
Consumers parameterise via flags but never recompose. One fat, opinionated component.

## Thesis
Abandon the native `<dialog>` top-layer entirely — it's the source of the *fourth, invisible*
layer mechanism and it can't be ordered relative to `fixed` overlays. Instead render **every**
overlay through one React portal into a single `#overlay-root` node, and govern stacking with
**one documented z-layer scale defined as design tokens**. The primitive owns everything: a
`<DialogStack>`-managed scrim, `focus-trap-react` (already a dependency), the
`isDirty`-driven guard, responsive sizing, and a `layer` prop that resolves to a token. The
behavior matrix collapses to one row because there is exactly one implementation and the
layer is a typed enum, not an accidental number. This is the "boring technology" answer:
one well-understood pattern (portal + token scale + focus-trap lib) over the platform's
clever-but-rigid top-layer.

## The z-layer scale (the deliverable the spec demands)
Defined once in `tokens.css` (flagged for AI1 overlap), consumed by name:
```
--z-base:        0     /* app content */
--z-sticky:      10    /* sticky headers, in-flow popover anchors */
--z-drawer:      30    /* TaskSheet, mobile nav drawer (non-modal slide-ins) */
--z-overlay:     40    /* AssistantOverlay, NotificationPopover (anchored non-modal) */
--z-scrim:       50    /* the modal scrim */
--z-dialog:      60    /* modal dialogs + global search (sit on their own scrim) */
--z-toast:       70    /* toasts — always on top, never blocked */
```
Eleven surfaces → seven named layers, each owning its band, **no two competing**. A `Dialog`
with two simultaneously-open instances stacks by mount order within `--z-dialog` via the
portal's append order — deterministic regardless of source DOM position because both render
into `#overlay-root`, not their call site.

## Component composition
- **One component:** `<Dialog>` — props: `open`, `onClose`, `title`, `isDirty`,
  `modal` (default true), `layer` (default `"dialog"`), `size` (`sm|md|lg`), `footer`,
  `children`.
- Internals: a `<Scrim>` (rendered only when `modal`), a `<FocusTrap>` from focus-trap-react,
  the chrome (header + ✕, body, footer), and the guard's confirm sub-strip.
- Uses DS `Button` for guard actions. The header/footer chrome is the Agent pair's, promoted.

## Information hierarchy
Identical to A's (title 15/600, body 18px pad, footer divider) — the *chrome* is the same
across all variants; B differs in the *machinery* behind it.

## All states
- **clean → Esc/backdrop/✕**: `onClose()` fires immediately.
- **dirty (`isDirty===true`) → Esc/backdrop/✕**: the primitive intercepts, enters
  `guarding` sub-state, swaps the footer for the confirm strip ("Discard changes? · Keep
  editing · Discard"). The consumer never writes guard logic — it passes one boolean.
- **`modal={false}`**: no scrim, no backdrop-dismiss, focus moves in but trap is "soft"
  (`allowOutsideClick`), page stays interactive. Layer defaults to `--z-overlay`. Assistant.
- **content states** (loading/empty/error): the consumer's body. Chrome unchanged.

## Behavior
- **Focus**: `focus-trap-react` traps on open; `returnFocusOnDeactivate` restores to the
  trigger on close — uniform across all surfaces (replaces TaskSheet's snapshot hack and
  Assistant's querySelector hack with one well-tested lib path).
- **Keyboard**: Esc → dismissal intent (guarded). Tab trapped. Shift-Tab wraps.
- **Motion**: scrim opacity `--motion-fast`; box `translateY(8px)→0` + opacity `--motion-fast`;
  guard strip cross-fades.
- **Scroll-lock**: the primitive locks `body` scroll while any modal is open.

## Mobile adaptation
`size` resolves to `max-width` desktop; at ≤480px every dialog becomes full-width-minus-gutter
bottom-sheet with `max-height:85vh` + internal scroll, regardless of `size`. One responsive
rule, owned by the primitive — no consumer touches it. Maps to three-tab mobile as a portal
above the active tab.

## Signature
**One `#overlay-root`, one z-token scale.** Inspect the DOM: every overlay in the app is a
sibling under one portal node, ordered top-to-bottom by a named layer. There is exactly one
place layering is decided, and it's a CSS variable file you can read in ten seconds.

## Trade-offs (what B is bad at)
- **More machinery than A**: we re-implement scrim, focus-into, inert/scroll-lock that native
  `<dialog>` gives free. More code in the primitive (justified: it's written *once*).
- **`focus-trap-react` quirks**: needs `tabbableOptions.displayCheck:"none"` in JSDOM (already
  a known lore in two files) — that workaround moves into the primitive.
- **Scrim accessibility**: must manually set `aria-modal` + inert the background (native
  dialog does this free); we add `inert` on `#root` siblings while a modal is open.
- **Token coordination with AI1**: adds 7 z-tokens + a `--scrim` color to tokens.css while AI1
  is editing that file — merge-risk, must be flagged.

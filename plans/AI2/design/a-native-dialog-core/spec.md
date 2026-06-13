# Variant A — "Native dialog core" (container with payload)

**Composition:** thin container; payload (children) does the work. Minimal API surface.

## Thesis
The platform already ships a dialog primitive: `<dialog>`. It gives backdrop, top-layer
painting, Esc-to-cancel, focus-into, and inert-the-rest for free. The Agent pair already
proves it works here. The job isn't to build a dialog engine — it's to wrap `<dialog>` once,
move the pasted boilerplate into that one wrapper, intercept the native `cancel` event to
implement the guard, and delete the duplication. The z-layer problem mostly *dissolves*:
native dialogs live in the browser top-layer, stacked by open-order, above all `fixed`
overlays — so we make **every** modal surface a native dialog and the four competing layer
mechanisms collapse to one (the top-layer), with `z-index` reserved only for the handful of
non-modal `fixed` overlays (Assistant, Notifications) which get a documented 2-step scale.

## Component composition
- **One component:** `<Dialog>` (design-system). Renders a `<dialog>` element + a `modal-box`
  chrome wrapper. Owns: open/close sync (the ~25-line boilerplate, once), the JSDOM
  `showModal` fallback (once), `cancel`-event interception for the guard, the discard-confirm
  sub-overlay, mobile sizing, heading slot.
- Consumers pass `title`, `children` (the form/confirmation body), `footer` (action buttons),
  and behavior flags. The Agent pair's chrome (header row, ✕, footer divider) becomes the
  default chrome — it is the reference implementation, promoted verbatim.
- `Button` (DS) used for the discard-confirm sub-overlay actions ("Discard" / "Keep editing").

## Information hierarchy
1. **Title** — `--text-primary`, 15px / 600 (the Hearth heading scale, fixing the off-scale
   14px + undefined `font-heading` in the knowledge/bet dialogs). Left-aligned. Sits in a
   header row with the ✕ close on the right.
2. **Body** (children) — the consumer's form or confirmation. Padding `--space-6` (18px) on
   desktop, `--space-4` (12px) phone.
3. **Footer** — right-aligned action pair, separated by a 1px `--border-subtle` rule + 18px
   top margin (the Agent pair's footer, generalized).
The discard guard, when it fires, **replaces the footer region** with an inline confirm strip
("Discard changes? · Keep editing · Discard") rather than stacking a second dialog — A
deliberately avoids 2-deep stacking (out of scope).

## All states
- **empty/loading/error**: not the dialog's concern — the body is whatever the consumer
  renders. The chrome is identical in every state.
- **clean → dismissal intent (Esc / backdrop / ✕)**: closes immediately. Native `cancel`
  fires, we let it proceed.
- **dirty → dismissal intent**: native `cancel` fires; we `preventDefault()` it and flip an
  internal `guarding` state → footer becomes the confirm strip. Second Esc on the confirm
  strip = "Keep editing" (the safe default); explicit "Discard" closes.
- **non-modal (`modal={false}`)**: renders a `fixed` div instead of a `<dialog>` (no top-layer,
  no scrim, page interactive) at a documented z-layer. This is the one branch — Assistant.

## Behavior
- **Focus**: native `<dialog showModal>` moves focus in and inert-locks the rest for free;
  on close the browser restores focus to the opener. Non-modal branch hand-rolls focus-in
  (no trap) like AssistantOverlay does today.
- **Keyboard**: Esc → dismissal intent (guarded). Tab cycles within (native). Enter in a
  single-field confirm submits.
- **Motion**: backdrop fades `--motion-fast`; box scales 0.98→1 `--motion-fast`. Discard strip
  swaps with a `--motion-fast` opacity cross-fade.
- **Mobile**: at ≤480px the `modal-box` pins to the bottom (`margin-top:auto`), full-width
  minus a 12px gutter, `max-height: 85vh`, internal scroll — generalizing TaskSheet's sheet.

## Mobile adaptation
Bottom-sheet on phone, centered box on desktop — one CSS branch in the wrapper. Maps cleanly
to the three-tab mobile layout: the dialog is a top-layer surface over the active tab.

## Signature
The dialog **is** a native `<dialog>` — open Devtools and you see one `<dialog open>` element,
not a portal soup. No z-index on modals at all; the platform stacks them.

## Trade-offs (what A is bad at)
- **Mixing models is fragile**: top-layer dialogs always paint above `fixed` overlays, so the
  spec's scenario "TaskSheet + NotificationPopover open together, stack predictably" forces
  TaskSheet to *also* become a native dialog — but TaskSheet is a non-modal drawer that must
  let users see content behind it... native `<dialog>` (modal) inerts the background. So
  TaskSheet/Assistant/Notifications stay `fixed` and live *below* every native dialog
  unconditionally. That's a documented rule but a rigid one: a confirm dialog will always
  cover an open TaskSheet, never the reverse.
- **JSDOM gap persists**: the `showModal` fallback boilerplate moves into the wrapper but
  doesn't disappear — tests still touch the `open` attribute path.
- **Guard-in-cancel-event is browser-quirky**: backdrop-click fires `cancel` in Chrome/Safari
  but the contract is subtle; the L14 lore already documents the fragility.
- **Two code paths** (modal `<dialog>` vs non-modal `fixed`) inside one component — the flag
  forks the render tree, not just styles.

# AJ7 — Synthesis

## Strongest base: Variant A (Devtools rail) — 8.5/10

A is the closest to the founder's stated model ("browser-devtools element picker") *and* the best fit
for the locked concept. The rail is a stable home for the inspector: notes are always visible (no
toggle), re-highlight is one hover away, the breadcrumb gives devtools "select parent," and every
state renders in one predictable layout — which is exactly what makes the keyboard/focus story clean.
Its concept-fit is perfect: the comment input and the notes never touch the canvas, so the
no-DOM-mutation hard rule and the re-highlight-not-pins model fall out naturally.

## Pull in from B (Floating editor)
- **Lowest-chrome instinct.** A's rail is heavier than AJ5. Pull B's discipline: the rail should be
  *quiet* when idle (just the arm button + round/count), not a busy panel. The selected-element block
  and breadcrumb appear only on selection.
- **The "card comes to the element" insight is rejected for editing** (it occludes the element under
  review — AJ5's lesson) **but kept for feedback:** the **held selection box stays on the element**
  while you type in the rail, so you still see *what* you're commenting on without the editor covering it.

## Pull in from C (Inspector strip)
- **At-a-glance round.** C's chips prove the founder wants the whole round visible at once. A already
  does this (notes always in the rail) — keep it; do not hide notes behind a toggle (that's B's weak point).
- **Sticky positioning.** Borrow C's sticky behavior for the rail so it stays in view on tall stories.

## Explicitly rejected (do not re-litigate)
- **Persistent in-canvas pins** (concept rejection #1) — drift. Re-highlight-on-hover only.
- **Mutating the inspected element's outline/classList** (AJ5 `.anno-hover/.anno-selected/.anno-saved`,
  concept hard-rule #1) — replaced by the separate `pointer-events:none` overlay layer.
- **Floating comment card as the primary editor** (Variant B core) — occludes the element under review;
  fragile positioning. The editor docks in the rail; the held box stays on the element instead.
- **Notes behind a toggle** (Variant B) — the founder reviews the round; notes stay visible.
- **Bottom strip** (Variant C) — eats vertical space, worse for tall page-level stories than the rail's
  horizontal cost (page stories are tall, not extra-wide).
- **Multi-select / batch comment** (concept rejection #5).
- **Chrome extension / bookmarklet** (concept rejection #3) — in-page, same-origin.

## Chosen direction
**Variant A as the base, made quieter (B's chrome discipline) with notes always-visible and a sticky
rail (C's at-a-glance + persistence), and the held selection box kept on the element while editing.**
This is written up in `approved.md`.

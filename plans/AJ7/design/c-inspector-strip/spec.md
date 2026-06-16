# Variant C — "Inspector strip"

**Constraint:** a docked bottom strip spanning the width; left = live target + breadcrumb + comment input, right = notes as horizontally-scrolling chips with re-highlight; one unified surface, always present. **Reference:** Linear bottom command bar / browser console drawer.
**Thesis:** one wide horizontal surface keeps the full canvas width *and* shows the whole round at a glance — comment and notes coexist without occluding the canvas.

## User task
The founder works the canvas above and the inspector strip below: pick an element, comment on the left, see all notes as chips on the right — never losing canvas width.

## Composition (reuse inventory mapping)
- Canvas: `SampleCanvas` (full width, above the strip).
- Strip (`.aj7-strip`, NEW dev-chrome, sticky bottom, 2-col grid):
  - Left (`.aj7-strip-left`): arm button + (on selection) breadcrumb + shared `.aj7-comment` field; else hint.
  - Right (`.aj7-strip-right`): round/count label + notes as chips (`.aj7-chip`, extends AJ5 list into a wrap-flow) with per-chip re-highlight.
- Highlight overlay: same NEW layer.

## Information hierarchy
1. Canvas (top, full width).
2. Strip-left — arm + active comment (where action happens).
3. Strip-right — all current-round notes as chips (the at-a-glance round view).

## States
- **Idle:** strip shows arm button + hint "Press Inspect to begin." + empty chips area.
- **Armed:** crosshair; hint "Hover + click an element to comment."
- **Hover-highlight:** solid box + label.
- **Selected (comment-input):** held dashed box; strip-left shows breadcrumb + target echo + autofocused textarea + Save/Cancel.
- **Saved:** chip appended to the right; selection clears.
- **Notes populated:** chips wrap/scroll on the right.
- **Re-highlight:** hovering a chip draws the box fresh ("not visible" if not found).
- **Overflow:** chips wrap then scroll (`max-height`); chip text truncates with ellipsis.

## Behavior / motion / keyboard
- Cmd/Ctrl+Enter save, Esc cancel.
- Strip is sticky to the viewport bottom (always visible while scrolling a tall story).
- Motion: default fade; overlay box instant.

## Mobile adaptation
Desktop-only. Strip → stacked sheet on narrow widths; out of scope.

## Signature
The **full-width bottom strip** — canvas keeps its width, and the entire round is visible as chips without a toggle.

## Trade-offs (what it's bad at)
- Eats vertical space at the bottom permanently → shorter canvas viewport for tall stories (the inverse of A's horizontal cost).
- Two-column strip can feel cramped on smaller laptops (comment input + chips competing for one row of height).
- Comment input is far from the element (canvas top → strip bottom) — same eye-travel cost as A, vertically.
- Chips truncate hard; long notes need a hover/expand the prototype doesn't show.

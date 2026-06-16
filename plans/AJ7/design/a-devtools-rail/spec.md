# Variant A — "Devtools rail"

**Constraint:** persistent right-hand inspector rail; one chrome region; comment input docked in the rail; ancestor breadcrumb included. **Reference:** Chrome / React DevTools elements panel.
**Thesis:** a stable, always-present inspector surface is fastest for a focused review session — the founder's eye returns to the same place every time; nothing chases the cursor.

## User task
One sentence: the founder inspects a story, comments on elements, and walks their notes — all from a fixed rail beside the canvas.

## Composition (reuse inventory mapping)
- Canvas: `SampleCanvas` (real build = the live story in `.demo-grid`).
- Rail (`.aj7-rail`): NEW dev-chrome container (sticky right column). Houses:
  - Arm button (`.aj7-arm`, AJ5 `.toolbar-btn` lineage) + round/count readout (`.aj7-round`).
  - On selection: breadcrumb (`.aj7-crumbs`, NEW) + docked comment field (`.aj7-comment` = AJ5 `.anno-target` + textarea + Save/Cancel, re-housed).
  - Notes list (`.aj7-notes`, extends AJ5 `.anno-list`) with row-hover re-highlight.
- Highlight overlay (`.aj7-hl-box` + `.aj7-hl-label`, NEW layer): live hover (solid outline) / held selection (dashed) / note re-highlight (dashed).

## Information hierarchy
1. Canvas (left, dominant) — the thing under review.
2. Rail header — arm state + round/count (where the founder confirms "am I picking?").
3. Selected-element block — breadcrumb + target echo + comment input (only when a selection exists).
4. Notes list — current round, scannable, re-highlight on hover.

## States
- **Idle (not armed):** rail shows arm button + hint "Press Inspect, then hover + click any element." Notes list (empty or populated).
- **Armed:** canvas cursor → crosshair; hint "Hover the canvas — click an element to comment."
- **Hover-highlight:** solid `--accent-primary` box + mono label `Component · element` follows pointer over canvas.
- **Selected (comment-input):** held dashed box on the element; rail shows breadcrumb + target echo + autofocused textarea + Save/Cancel.
- **Saved:** note appended to list; selection clears; box clears.
- **Notes populated:** list of `Component` + note text rows.
- **Re-highlight:** hovering a note row draws the dashed box + label over its element, fresh. If the element isn't found → row shows "not visible" (real build; prototype always finds it).
- **Overflow:** notes list scrolls (`max-height`); long target echo truncates with ellipsis + title tooltip.

## Behavior / motion / keyboard
- Cmd/Ctrl+Enter saves; Esc cancels selection / disarms (AJ5 parity).
- Re-highlight on `mouseenter`, clears on `mouseleave`.
- Motion: overlay box appears instantly (no transition — it tracks pointer); rail uses default fade. Respects `prefers-reduced-motion`.
- Breadcrumb crumb click re-points selection to that ancestor (held box + target echo update).

## Mobile adaptation
Dev tool — desktop only. Rail would collapse to a bottom sheet on narrow widths, but `/human-design-review` is a desktop activity; mobile is out of scope.

## Signature
The **always-present right rail** — the founder never hunts for the inspector; it's anchored like a real devtools panel.

## Trade-offs (what it's bad at)
- Eats ~320px of horizontal space permanently → the canvas is narrower, which matters for wide page-level stories.
- The comment input is *far* from the element being commented on (eye travels canvas→rail), unlike a floating editor.
- More chrome than AJ5; heavier visual footprint.

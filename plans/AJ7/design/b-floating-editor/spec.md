# Variant B — "Floating editor"

**Constraint:** minimal bottom-left pill (AJ5 lineage) for arm/round/count; on select, a small comment card *floats next to the selected element*, anchored to the highlight box; notes are a separate bottom-left popup; no breadcrumb (deferred). **Reference:** v0 / Lovable / Figma pin-less comment.
**Thesis:** the comment belongs *at* the element — minimal standing chrome, maximum canvas, the editor appears where you're looking and disappears when done.

## User task
The founder clicks an element and a comment card pops up right beside it; they type, save, and it's gone — the canvas stays uncluttered.

## Composition (reuse inventory mapping)
- Canvas: `SampleCanvas` (full width).
- Pill (`.aj7-pill`, AJ5 `.anno-pill` lineage, restyled): arm button + round label + notes-count toggle button.
- Floating comment card (`.aj7-floater`, NEW positioner): wraps the shared `.aj7-comment` field; positioned next to the selected element's rect, flips above/below based on room.
- Notes popup (`.aj7-notes-pop`, AJ5 `.anno-list-panel` lineage): toggled from the count button; rows re-highlight on hover.
- Highlight overlay: same NEW layer as A.

## Information hierarchy
1. Canvas (full width, dominant).
2. Floating comment card (only on selection) — appears at the focal element.
3. Pill (bottom-left, quiet, always there) — arm + round + count.
4. Notes popup (on demand).

## States
- **Idle:** just the pill ("Inspect · Round 1 · N notes"). Canvas full width.
- **Armed:** crosshair cursor.
- **Hover-highlight:** solid box + label over hovered element.
- **Selected (comment-input):** held dashed box + a floating card next to the element with target echo, autofocused textarea, Save/Cancel.
- **Saved:** card disappears; count increments.
- **Notes populated:** count button shows "N notes"; clicking opens the popup list.
- **Re-highlight:** hovering a popup row draws the box fresh over its element ("not visible" if not found).
- **Overflow:** popup scrolls; floating card flips above the element when no room below.

## Behavior / motion / keyboard
- Cmd/Ctrl+Enter save, Esc cancel (closes the floating card).
- Floating card re-positions via `useLayoutEffect` on the selection rect.
- Motion: card fades/translates in (AJ5 `anno-popover-in` lineage); overlay box instant.

## Mobile adaptation
Desktop-only dev tool. On narrow widths the floating card would dock to the bottom; out of scope.

## Signature
The **comment card glued to the element you clicked** — the editor comes to the work, devtools-edit feel, near-zero standing chrome.

## Trade-offs (what it's bad at)
- The floating card can **cover** the element it's about (or its neighbors) while you type — the very thing AJ5's fixed popover avoided. Mitigated by flip-above, but on dense stories it still occludes.
- Notes live behind a toggle (one more click to see the round at a glance).
- No breadcrumb → can't widen selection to a parent without re-clicking precisely.
- Floating-position math is the most fragile piece (scroll/resize/flip edge cases) — most builder risk.

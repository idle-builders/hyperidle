# Synthesis — AJ5 annotation overlay

Single-variant routine design — no cross-variant synthesis needed. The "Review pill" is the only embodied direction; the alternatives are recorded in `rejected.md` as one-liners (not regenerated).

**Strongest base:** "Review pill" (the only variant). Composite Phase-2 critique 8.2/10, no dimension below 5 → routine classification confirmed, no low-confidence fallback to a 2nd variant.

**Pulled in from prior art (`feedback-overlay.js`), kept:** the arm → hover-outline → click-select → note grammar; the count indicator; the realistic-content note copy.

**Pulled in, deliberately changed:** one-shot arm (not always-on sticky); fixed-to-pill popover (not draggable floating window, not element-anchored bubble); `viewer.css` `.anno-*` chrome (not a built-from-DS-components panel); intent-only notes (no live CSS tweak sliders).

**Explicitly rejected (see rejected.md):** floating draggable window · element-anchored popover · sticky select mode · folding into the top-right Toolbar · catalogued-DS-component construction · CSS tweak sliders · per-component annotation UI.

**Embodiment:** `annotation-overlay/preview.html` + `screenshot.png` (looked-at critique artifact, file://-rendered, NOT a regression baseline and NOT globbed by the snapshot net or the viewer story discovery). The build-phase overlay TSX (`packages/design-system/viewer/annotations/annotation-overlay.tsx`, mounted in `App` chrome) is the production embodiment — it stays out of `src/*.stories.tsx`, so AC10 (no `.snap` change) holds by construction.

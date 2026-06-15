DESIGN-CLASS: routine  ref=Toolbar(viewer-chrome)  pattern=feedback-overlay.js

# AJ5 — Annotation overlay UX — design brief

## Surface

The in-viewer annotation overlay: developer-only chrome the founder uses inside the live TSX viewer at `:8098`. Not a product surface a HyperIdle end-user ever sees; not a catalogued Tier 0/1/2/3 design-system primitive. It is the third piece of viewer chrome after the `Toolbar` (theme/density pills) and the catalog/component pages.

## Classification — why routine (1 variant)

Both Phase 0a axes match:
1. **Existing component reference** — the viewer already ships chrome of exactly this kind: `Toolbar` (a fixed-position pill cluster, `viewer.css` `.toolbar` / `.toolbar-pill` / `.toolbar-btn`). The overlay is a sibling chrome control mounted in the same `App`.
2. **Pattern match** — `packages/design-system/scripts/feedback-overlay.js` is a 427-line embodiment of click-to-annotate (arm → hover highlight → click select → note textarea → indicator count → collect). The interaction grammar is known and in-repo.

It is also explicitly NOT a product L1/L2/L3 primitive, so the "L-track primitives are always novel" hard rule does not apply. A `novel` classification here would be inflation — and would park the workpackage in this autonomous run for no design reason. Honest call: `routine`.

## Reuse inventory (Phase 0b)

The hard constraint that drives every reuse decision: **the overlay must not add a catalogued story to the 56-story DOM-snapshot net, and must not render any element that the founder could mistake for an annotation target.** The catalogued DS components (`Button`, `Input`, `Badge`, `Popover`, …) each stamp `data-ds-component` and resolve to a real component name under fiber walking — if the overlay were built from them, arming select-mode and clicking the overlay's own Save button would resolve to `Button`, and the chrome would pollute the annotation surface. The existing `Toolbar` already made exactly this decision: it is plain `<div>` + `.toolbar-btn`, never `<Button>`. The overlay follows suit.

| Visual element overlay needs | Rendered by | New shape? |
|---|---|---|
| Fixed pill cluster (arm toggle, round label, count, "New iteration") | `viewer.css` `.toolbar` / `.toolbar-pill` / `.toolbar-btn` pattern — extend with an `.anno-*` sibling class set in `viewer.css` | NO — same chrome language as `Toolbar`, one new class namespace, zero catalogued components |
| Hover affordance on a rendered element | a single applied class (`.anno-hover`) — outline via tokens, mirrors `feedback-overlay.js` `__ds-hover-highlight` | NO — one class, prior art |
| Selected affordance | `.anno-selected` outline class | NO — one class, prior art |
| Note-entry popover (label + textarea + Save/Cancel) | a fixed/anchored `.anno-popover` panel built from plain divs + a bare `<textarea>` + `.toolbar-btn`-styled buttons | NO catalogued component — must stay outside the annotation surface and the snapshot net |
| "Annotations exist" indicator | a count in the pill (`.anno-count`) + the `.anno-saved` outline re-applied to annotated elements on load | NO — text + class |
| Empty / current-round state | the pill's idle copy (`Round N · 0 notes`) | NO — copy only |

Net: **zero catalogued components, zero new snapshot-net entries, one new CSS class namespace (`.anno-*`) inside `viewer.css`.** The overlay's TSX lives in `packages/design-system/viewer/annotations/annotation-overlay.tsx` and mounts in `App` chrome — invisible to `catalog-snapshot.test.tsx` (which renders `v.render()` per variant, never `App`).

Why `.anno-*` and not reuse `.toolbar-*` directly: the pill cluster shares the toolbar's visual language but carries an armed/disarmed state and an accent treatment the theme/density pills never need. A parallel class namespace keeps the toolbar's snapshot/behavior untouched while the two read as siblings.

## Interrogation (Phase 0)

Unsettled questions for this surface, with my read. Architecture already fixes the data contract, so these are purely the interaction shape.

1. **Where does the arm/round/count control live — alongside the Toolbar (top-right) or its own corner?**
   My read: a **second pill cluster anchored bottom-left**, mirroring the toolbar's top-right pill geometry but on the opposite corner so it never collides with the theme/density pills and reads as a distinct "review" mode. `feedback-overlay.js` chose bottom-right; bottom-left keeps clear of the toolbar and of right-edge scrollbars. Confirm.

2. **Modal arm, or a persistent toggle?**
   My read: a **persistent toggle** (`Select` button in the pill) that arms a one-shot capture — arm → next click in the story area selects + opens the popover → after Save or Cancel, disarm. Not a sticky mode that keeps eating clicks (that traps the founder; `feedback-overlay.js`'s always-on listener is the prior art's worst trait). One-shot is the smallest surface that delivers the outcome. Confirm.

3. **Popover anchored to the clicked element, or fixed near the pill?**
   My read: **fixed panel rising from the bottom-left pill** (not element-anchored). Element-anchored popovers fight with dense story layouts and viewport edges; a fixed panel is predictable, never clipped, and shows the resolved target name as text so the founder still knows what they clicked. This also sidesteps re-positioning math entirely. Confirm.

4. **Does the overlay show the list of notes in the current round, or just a count?**
   My read: **count by default, expandable list on demand.** The pill shows `Round N · 3 notes`; clicking the count expands a compact read-only list of this round's notes (target + first line). The agent reads the file; the founder rarely needs to re-read mid-pass, so the list is secondary/collapsed. Confirm.

5. **What does "New iteration" feel like — a button always present, or only after ≥1 note?**
   My read: **always present but quiet** (ghost `.toolbar-btn`), enabled only when the current round has ≥1 note (closing an empty round is a no-op the founder shouldn't be invited to do). Confirm.

## Primary state

The **armed-and-selecting** moment is the heartbeat: founder clicked Select, is hovering elements, the hover outline tracks the cursor, the pill reads `Selecting…`. Everything else (idle pill, saved-note indicators, expanded list) is secondary. Empty state (round 1, zero notes) is the literal first-run state and must read as "ready", not "broken".

## Architecture deltas

None that contradict `plans/AJ5/architecture.md`. The design honors every fixed contract: client-stateless-over-rounds (count + list come from `GET /__annotations`), Save → `POST /__annotations`, New iteration → `POST /__annotations/round`, best-effort re-highlight of saved elements (architecture §Risks "Element highlight matching … best-effort cosmetic; must never block Save" — the design treats `.anno-saved` re-application as decorative and non-blocking, matching that note exactly).

Two design observations the architect/builder should carry (refinements, not contradictions):

- **Arm semantics (one-shot, not sticky).** Architecture §task 5 says "intercepts the next click in the story area" — the design reads this as one-shot capture (arm disarms after Save/Cancel), which matches "the next click" literally. Calling it out so the builder does not implement `feedback-overlay.js`'s always-on `document.addEventListener('click', …, true)` sticky listener (the prior art's trap). The listener attaches on arm and detaches on capture/cancel.
- **Popover is fixed, not element-anchored.** Architecture §task 5 says "opens a small note popover" without specifying anchoring. The design fixes it to the pill cluster (bottom-left) rather than the clicked element — no positioning math, never clipped, robust against StrictMode double-invoke. The captured `AnnotationTarget` (component name + element descriptor) is shown as text in the popover header, so the founder retains the "what did I click" context without an element-anchored bubble.

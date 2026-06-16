# AJ7 — Approved design: Annotator v2 (Devtools rail, quieted)

DESIGN-CLASS: novel  (→ triggers /human-design-review after /design-critique; founder annotates the
rendered story in the viewer before build. In an autonomous run this parks for the founder.)

> **STATUS: review gate CLEARED.** This doc is the single source of truth, updated with the founder's
> locked decisions (below) and the cold-critique resolutions. Where it now contradicts the original
> prototype, the locked decision wins — superseding notes are inline and flagged **SUPERSEDES PROTOTYPE**.

## Founder's binding principle
**The annotator must never get in the way of seeing the components, and must let them do the review job.**
Every locked decision below serves this principle.

## LOCKED decisions (founder-delegated; resolve the cold critique)
1. **Variant A "Devtools rail" is the chosen design.** The comment editor is **docked in the side rail —
   it NEVER floats over / occludes the canvas.** The rail is **collapsible** (chevron → thin armed-only
   strip) so wide stories reclaim width; collapsed-by-default is acceptable as long as arm/expand is one
   click. *(Resolves critique WARNING "rail eats 320px on wide stories".)*
2. **Highlight + selected outline are a separate `pointer-events:none` overlay layer** — never mutate the
   inspected element's classList. AJ5's `.anno-hover`/`.anno-selected`/`.anno-saved` element-mutating
   classes are **RETIRED**.
3. **The selected-element box LIVE-TRACKS.** **SUPERSEDES PROTOTYPE:** the prototype froze `selected.rect`
   at click time (`usePicker`, line 191) and rendered it verbatim — that is drift. The held box (and the
   re-highlight box) MUST re-measure on window `scroll` (capture phase) + `resize` while shown, via a
   shared rAF-throttled `useElementRect` hook. A frozen rect is a hard FAIL. *(Resolves critique CRITICAL #1.)*
4. **Re-highlight scrolls into view first.** When a note's resolved element is outside the viewport,
   `scrollIntoView({ block: "center" })` THEN draw the box. Distinguish **in-DOM-but-off-screen** (scroll
   to it) from **not-in-DOM** (show a quiet "not visible" state). *(Resolves critique CRITICAL #2.)*
5. **Ancestor breadcrumb INCLUDED but DEDUPED.** Consecutive crumbs that resolve to the same component name
   collapse, OR fall back to the element/tag descriptor, so you never see `unknown › BetCard › BetCard ›
   BetCard`. Clicking a crumb re-selects that ancestor. *(Resolves critique WARNING "duplicate-crumb fiber
   issue". The breadcrumb ships in v1 because the dedupe lands — it is no longer deferred.)*
6. **Notes always-visible**, with `max-height` + scroll so a long round never pushes the comment block
   off-screen. *(Resolves critique NICE-TO-HAVE "20-note round".)*
7. **AJ5 parity kept:** `Saving…` + inline error states on the real POST (`/__annotations`); Esc
   closes/returns focus to the arm button; note rows keyboard-reachable (focusable buttons, not mouse-only).
   *(Resolves critique WARNINGs "no save/loading state" + "mouse-only a11y".)*

**Chosen base:** Variant A — Devtools rail, with three pulled-in refinements (see synthesis):
1. **Quiet when idle** (from B): the rail shows only arm + round/count until an element is selected.
2. **Notes always visible + sticky rail** (from C): the round is visible at a glance; the rail stays in view on tall stories. No notes-behind-a-toggle.
3. **Held selection box stays on the element while editing** (B's "feedback at the element" without B's occluding editor): the comment input is docked in the rail, but the dashed highlight box remains on the selected element so the founder always sees *what* they are commenting on. **It live-tracks (decision 3) — not frozen.**

The embodied prototype is `packages/design-system/src/AnnotatorV2.stories.tsx`, export
`VariantADevtoolsRail` (the first/lead variant). It is genuinely interactive in the viewer.
The technical plan that supersedes the prototype's stand-ins is `plans/AJ7/architecture.md`.

---

## Interaction model (end to end)

1. **Idle.** Rail beside the canvas shows the arm button ("Inspect") + `Round N · M notes` + the notes list (empty state or populated). Canvas at full rail-minus width.
2. **Arm.** Click Inspect → armed; canvas cursor becomes crosshair; rail hint: "Hover the canvas — click an element to comment."
3. **Hover-highlight.** Pointer over a canvas element → the **highlight overlay** (separate `pointer-events:none` layer) draws a solid `--accent-primary` box matching the element's `getBoundingClientRect()` + a mono floating label `Component · element-descriptor`. Re-derived every `mousemove`. The inspected element's DOM/classList is **never touched** (hard rule).
4. **Select.** Click → selection commits to that element; armed turns off; the box switches to the *held* dashed-outline tone and stays on the element. Hover-highlighting stops.
5. **Comment.** Rail's selected-element block appears: **ancestor breadcrumb** (widen/narrow) + target echo (`Component · element`, verbatim incl. "unknown") + autofocused textarea ("What should change about this element?") + Save / Cancel. The held box remains on the element the whole time.
6. **Save.** Cmd/Ctrl+Enter or Save → annotation appended to the current round (POST `/__annotations`, AJ5 handler, now carrying the additive `anchor`); selection + held box clear; note appears in the rail list; count increments.
7. **Re-highlight.** Hover any notes-list row → re-resolve that note's element from its `anchor` and draw the **same overlay box + label** over it, fresh. Leave the row → box clears. If the element can't be re-found → the row shows a quiet "not visible" affordance (never an error).
8. **Round.** "New iteration" (AJ5 round model) closes the round and opens the next; the rail list scopes to the current round.
9. **Breadcrumb (optional, see open questions).** Each crumb is an ancestor (story-root-bounded). Clicking re-points the selection (held box + target echo update) to that ancestor.

## Visual states (all enumerated, with copy)

| State | What renders | Copy |
|---|---|---|
| Idle (not armed), empty | rail: arm + `Round 1 · 0 notes` + empty notes | "No notes yet. Inspect an element, then comment." |
| Idle, populated | rail: arm + count + notes list | — |
| Rail collapsed | thin strip: chevron + arm + count only; canvas full-width | — |
| Armed | crosshair cursor; rail hint | "Hover the canvas — click an element to comment." |
| Hover-highlight | solid `--accent-primary` overlay box + mono label | label = `Component · tag.class "text"` |
| Selected (comment-input) | held dashed box **live-tracking** the element; rail: breadcrumb + target echo + autofocused textarea + Save/Cancel | placeholder "What should change about this element?" |
| Saving | Save button shows "Saving…" + disabled (AJ5 parity) | "Saving…" |
| Save error | inline `.anno-error` under textarea; Save re-enabled | "Couldn't save — the viewer middleware may be down. Retry?" |
| Saved | note row added to rail; box + selection cleared | — |
| Re-highlight (in view) | dashed box + label drawn fresh, live-tracking the note's element | label = `Component · element` |
| Re-highlight (off-screen) | `scrollIntoView({ block:"center" })` first, then draw the box | — |
| Re-highlight, not in DOM | notes row shows muted "not visible"; no box | "not visible" |
| Overflow | notes list scrolls (`max-height`); target echo truncates w/ ellipsis + `title` | — |

## Where each piece of UI lives
- **Overlay layer** — a fixed, `pointer-events:none`, top-`z-index` layer over the whole viewport; renders the hover box, the held-selection box, or the re-highlight box (mutually exclusive). Boxes **live-track** via `useElementRect` (decision 3). NEVER inside the inspected element.
- **Rail** — sticky right column beside the canvas, **collapsible** to a thin armed-only strip (decision 1). Dev-chrome; only on a component page, never in a story render → stays out of the snapshot net, AJ5 AC10.
- **Comment input** — docked in the rail's selected block. **NEVER floats over the canvas** (rejected; occludes — the founder's binding principle).
- **Notes list** — always present in the rail with `max-height` + scroll (decision 6). NOT a toggle popup.
- **Breadcrumb** — top of the rail's selected block; **deduped** (decision 5). Ships in v1.

## Component / class mapping (reuse vs change vs new)
- **Reuse (AJ5):** `resolveComponentTarget` (fiber walk), `annotation-store`, `request-handler`, round model, `.toolbar-btn`/`--active` arm button, `.anno-target`/`-component`/`-element` echo, `.anno-popover textarea`/`.anno-save` field, `.anno-list` (extended into the rail), Hearth tokens (`--accent-primary`, `--surface-elevated`, `--shadow-elevated`, `--border-default`, `--text-*`, `--r-subtle`, `--font-mono`, `--motion-fast`, `--motion-ease`).
- **Change:** AJ5 fixed-to-pill popover → docked rail block. AJ5 element-mutating `.anno-hover/.anno-selected/.anno-saved` outline classes → **retired**, replaced by the overlay layer.
- **NEW dev-chrome shapes:** `.anno-hl-box` + `.anno-hl-label` (overlay layer; 3 contexts → earns budget), `.anno-rail` (container), `.anno-crumbs`/`.anno-crumb` (breadcrumb, optional). Prototype uses `aj7-` prefixes; the builder maps these to the production `.anno-*` namespace.

## Behavior / motion / keyboard
- Cmd/Ctrl+Enter saves; Esc cancels selection then disarms (AJ5 parity); focus returns to the arm button on cancel.
- Overlay box: no transition (it tracks the pointer / appears instantly). Rail blocks: `--motion-fast` fade. Respect `prefers-reduced-motion`.
- Re-highlight: `mouseenter`/`mouseleave` on notes rows.
- The capturing one-shot click pattern (AJ5 lore) is preserved — listeners scoped to the story root, detached after one pick.

## Mobile adaptation
Dev-only tool; `/human-design-review` is desktop. No mobile layout in scope.

## Rejected (do not re-litigate — see synthesis.md)
Pins; DOM-mutation outline classes; floating editor as primary; notes behind a toggle; bottom strip; multi-select; chrome extension.

## Open questions for /architecture (and the founder at the review gate)
1. **Breadcrumb in v1 or defer?** It's the founder's named "nice-to-have." It adds ancestor-chain resolution + crumb re-point. Recommend: **include v1** — it's cheap (DOM `parentElement` walk bounded by story root) and is the devtools-defining feature. Founder to confirm at the gate.
2. **Comment-input placement: docked-to-rail (chosen) vs floating-near-element.** Chosen docked (avoids occlusion + fragile positioning). The held box-on-element gives the "at the element" feedback without the editor occluding. Founder to confirm at the gate.
3. **The `anchor` shape** (architecture): a re-resolvable descriptor from the story root — recommend a structural path (child-index chain) + component name + element descriptor, resolved best-effort, degrading to "not visible." Additive optional field on `AnnotationTarget`; back-compat with AJ5 annotations that have none.
4. **Wiring fix:** `main.tsx` must pass the story root via callback-ref → state (not `ref.current` at mount, which is null) so the overlay re-renders once the root exists. Mechanical; flagged in concept.
5. **Overlay-layer host:** does the overlay layer mount in the viewer document body (fixed) or inside the component-page wrapper? Recommend viewer body so `getBoundingClientRect` (viewport coords) maps directly to `position:fixed`. Architecture to confirm vs. scroll containers.

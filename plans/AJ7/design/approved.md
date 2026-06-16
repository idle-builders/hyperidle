# AJ7 — Approved design: Annotator v2 (Devtools rail, quieted)

DESIGN-CLASS: novel  (→ triggers /human-design-review after /design-critique; founder annotates the
rendered story in the viewer before build. In an autonomous run this parks for the founder.)

**Chosen base:** Variant A — Devtools rail (8.5/10), with three pulled-in refinements (see synthesis):
1. **Quiet when idle** (from B): the rail shows only arm + round/count until an element is selected.
2. **Notes always visible + sticky rail** (from C): the round is visible at a glance; the rail stays in view on tall stories. No notes-behind-a-toggle.
3. **Held selection box stays on the element while editing** (B's "feedback at the element" without B's occluding editor): the comment input is docked in the rail, but the dashed highlight box remains on the selected element so the founder always sees *what* they are commenting on.

The embodied prototype is `packages/design-system/src/AnnotatorV2.stories.tsx`, export
`VariantADevtoolsRail` (the first/lead variant). It is genuinely interactive in the viewer.

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
| Armed | crosshair cursor; rail hint | "Hover the canvas — click an element to comment." |
| Hover-highlight | solid `--accent-primary` overlay box + mono label | label = `Component · tag.class "text"` |
| Selected (comment-input) | held dashed box on element; rail: breadcrumb + target echo + autofocused textarea + Save/Cancel | placeholder "What should change about this element?" |
| Saved | note row added to rail; box + selection cleared | — |
| Re-highlight | dashed box + label drawn fresh over the note's element | label = `Component · element` |
| Re-highlight, not found | notes row shows muted "not visible"; no box | "not visible" |
| Overflow | notes list scrolls (`max-height`); target echo truncates w/ ellipsis + `title` | — |

## Where each piece of UI lives
- **Overlay layer** — a fixed, `pointer-events:none`, top-`z-index` layer over the whole viewport; renders the hover box, the held-selection box, or the re-highlight box (mutually exclusive). NEVER inside the inspected element.
- **Rail** — sticky right column beside the canvas (dev-chrome; only on a component page, never in a story render → stays out of the snapshot net, AJ5 AC10).
- **Comment input** — docked in the rail's selected block (NOT floating over the canvas — rejected, occludes).
- **Notes list** — always present in the rail (NOT a toggle popup — rejected).
- **Breadcrumb** — top of the rail's selected block (optional in v1).

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

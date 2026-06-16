DESIGN-CLASS: novel  ref=AnnotationOverlay(AJ5)  pattern=none

# AJ7 — Annotator v2 design brief

## User task

The founder is reviewing a design-system story in the `:8098` viewer during `/human-design-review`.
They want to point at *specific rendered elements* ("this button's padding is wrong", "this label
should move here") and leave a note bound to that element — like inspecting in browser devtools —
then walk their notes and have each one re-show *which* element it was about. The decision they are
making: "is this element right, and if not, what should change?" The thing that would waste their
time: a fixed popover that never tells them which element a note refers to (the AJ5 problem), or
pins that drift off their target on scroll/re-render.

## Concept (fixed input)

`plans/AJ7/concept.md`. No new domain primitive. New interaction concepts: **highlight overlay**
(transient box + label, separate `pointer-events:none` layer, never mutates the inspected DOM),
**selection** (one committed element), **notes panel** (current-round annotations, row-hover
re-highlights), optional **ancestor breadcrumb**. Persisted store (Annotation/Round/Target) reused
verbatim; one additive optional `anchor` field on the target.

## Reuse inventory (hard gate)

The annotator is **dev-tool viewer chrome**, NOT a product surface. AJ5 deliberately did NOT use
`@hyperidle/design-system` product components here — pulling `Button`/`Breadcrumb`/`Dialog` into the
viewer chrome would (a) drag product components into a dev-only tool and (b) risk the snapshot net.
The budget for this surface is the AJ5 `.anno-*` / `.toolbar-*` CSS vocabulary + the Hearth tokens
in `tokens.css`. "Reuse" here means reuse the AJ5 CSS classes and the resolver/store/handler modules.

| Visual element needed | Reuse / extend / NEW | Note |
|---|---|---|
| Armed-state control ("Select") | **reuse** `.toolbar-pill` + `.toolbar-btn` + `--active` | AJ5 pill button, unchanged |
| Round label + note count | **reuse** `.anno-round`, `.anno-count` | unchanged |
| Comment textarea + Save/Cancel | **reuse** `.anno-popover textarea`, `.anno-save`, action row | re-housed, not restyled |
| Target echo (component · element) | **reuse** `.anno-target`, `-component`, `-element` | now also used in the overlay label |
| Notes list | **extend** `.anno-list*` | add row-hover affordance + "not visible" state |
| Highlight overlay box + label | **NEW** `.anno-hl-box`, `.anno-hl-label` | Why NEW: AJ5 mutated the *element's own* `outline` (`.anno-hover`/`.anno-selected`/`.anno-saved`) — concept hard-rule #1 forbids touching the inspected DOM. A separate `pointer-events:none` layer is structurally a different thing, not a prop tweak. Used in 3 contexts (live hover, held selection, note re-highlight) → clears the 2-context budget bar. |
| Ancestor breadcrumb | **NEW** `.anno-crumbs`, `.anno-crumb` | Why NEW: no breadcrumb-over-canvas pattern exists in the viewer chrome; the product `Breadcrumb` component is route-segment-shaped, wrong semantics, and would pull a product component into dev chrome. Optional / deferrable. |
| Tokens | reuse | `--accent-primary`, `--surface-elevated`, `--shadow-elevated`, `--border-default`, `--text-*`, `--r-subtle`, `--font-mono`, `--motion-fast`, `--motion-ease` |

Net NEW shapes: **highlight overlay layer** (load-bearing, the whole point) + **breadcrumb** (optional).
Everything else is AJ5 reuse, re-housed.

## Settled (not asking)

- Re-highlight-on-hover beats pins — founder already decided (concept rejection #1).
- In-page, no extension — concept rejection #3.
- One note per element per save — concept rejection #5.
- Current-round scope for the panel — concept rejection #6.
- Must fix `storyRoot=null` wiring (callback-ref → state) — concept Rationale. This is mechanical, same in all variants.

## Open forks the variants explore (the real decision)

1. **Where does the comment-writing surface live?** Floating near the selected element (devtools-edit feel) vs docked to a panel (stable, predictable) vs inline in the notes panel (one place for everything).
2. **Where does the notes panel live and how present is it?** Bottom-left pop-up (AJ5 lineage) vs a persistent right-hand inspector rail (devtools lineage) vs a collapsible bottom strip.
3. **Is the ancestor breadcrumb in v1 or deferred?** Each variant takes a position.

## Anti-convergence axes (variants differ on ≥3)

hierarchy (where eye lands), action surface (where comment input lives), density (rail vs pill),
composition (count of chrome regions), state strategy (floating-per-element vs one-docked-surface).

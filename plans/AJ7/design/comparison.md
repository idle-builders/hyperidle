# AJ7 — Variant comparison

All three prototypes are genuinely interactive in the viewer (proven via Playwright drive:
hover-overlay / comment-field / saved-note / re-highlight all `true` for A, B, C). Screenshots
live in each variant folder. The chrome is dev-tool viewer chrome (AJ5 `.anno-*` lineage + Hearth
tokens), not product design-system components — see brief.md reuse inventory.

| Dimension | A — Devtools rail | B — Floating editor | C — Inspector strip |
|---|---|---|---|
| Signature (one tell) | Always-present right rail | Comment card glued to the clicked element | Full-width bottom strip |
| Chrome regions | 1 (rail) | 3 (pill + floating card + notes popup) | 1 (strip) |
| Comment input location | docked in rail | floating near element | docked in strip-left |
| Notes presence | always visible in rail | behind a toggle popup | always visible as chips |
| Breadcrumb | yes | no (deferred) | yes |
| Canvas cost | −320px width | none (full canvas) | −~120px height |
| Density | medium | lowest standing | medium-high |
| State strategy | one stable surface, slots fill | per-element floater + popups | one stable surface, slots fill |
| Motion budget | low (fade) | medium (card flip+fade) | low (fade) |
| Best at | focused, repeatable review; notes always in view | uncluttered canvas; devtools-edit feel | full canvas width + whole round at a glance |
| Worst at | eats horizontal space; input far from element | card occludes the element; notes hidden; fragile positioning | eats vertical space; cramped on small laptops |

## 9-dimension rubric scores (in-session, /1.0 each → /10)

Dimensions: Hierarchy, Density, Anti-slop, States, Composition (reuse/budget), Interaction grammar,
Motion/finishing, A11y/keyboard, Concept-fit (re-highlight model + no-DOM-mutation).

| Dimension | A | B | C |
|---|---|---|---|
| Hierarchy (eye lands right) | 0.9 | 0.7 | 0.8 |
| Density (Hearth, earned) | 0.8 | 0.9 | 0.7 |
| Anti-slop (distinctive, not AI-dashboard) | 0.8 | 0.9 | 0.7 |
| States (all 8 covered cleanly) | 0.9 | 0.7 | 0.8 |
| Composition (reuse / budget) | 0.9 | 0.8 | 0.8 |
| Interaction grammar (devtools-true) | 0.9 | 0.8 | 0.8 |
| Motion / finishing | 0.8 | 0.7 | 0.8 |
| A11y / keyboard | 0.9 | 0.7 | 0.8 |
| Concept-fit (re-highlight, no DOM mutation) | 1.0 | 0.8 | 0.9 |
| **Total** | **8.5/10** | **7.6/10** | **7.7/10** |

### Why the scores land where they do
- **A wins Hierarchy + States + A11y:** the rail is one predictable place, so empty/armed/selected/
  saved/notes/re-highlight all render in a stable layout the eye and the focus order can rely on.
  Concept-fit is perfect — notes are always visible, re-highlight is one hover away, zero DOM mutation.
- **B wins Density + Anti-slop:** lowest standing chrome, full canvas, and the floating-card feel is
  the most "vibe-annotation-tool" distinctive. But it loses Hierarchy/States/A11y: the card **occludes
  the element under review** (the exact failure AJ5's fixed popover was built to avoid), notes hide
  behind a toggle, and floating-position is the most fragile code (most builder risk).
- **C is the balanced middle:** keeps full canvas width and shows the whole round as chips, but the
  bottom strip eats vertical space (bad for tall page-level stories) and the comment input sits far
  from the element, same eye-travel cost as A but vertically, with a more cramped two-column layout.

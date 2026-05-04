# L15 — Comparison

| Dimension | Variant A — Kebab | Variant B — Body opens thread | Variant C — Inline verb row |
|---|---|---|---|
| Signature | One kebab; one menu; everything inside | Card body is the click target; bottom strip carries Request button + thread summary | Always-on verb row: Thread + 1-2 state verbs + overflow |
| Component count | 1 new affordance (kebab + menu) | 2 new affordances (card-as-link + bottom strip) | 1 new region (verb row of N buttons) |
| Density | Tightest — same TaskCard footprint as today | Adds ~24 px bottom strip per card | Adds ~36 px verb row per card |
| Primary action surface | Kebab → menu | Card body (thread); Request button (state) | First verb pill (varies); state verbs visible |
| State strategy | One menu structure for all states; menu items disable when stale | Strip + menu both common across states; thread-summary varies | State-aware verb selection per card; overflow always present |
| Motion budget | Menu fade `--motion-fast` only | Body hover-tint + menu fade — both `--motion-fast` | Verb hover + menu fade — both `--motion-fast` |
| Best at | Density; extensibility (just add menu items) | Discovery via pointer-cursor convention; thread is the dominant action and gets the dominant target | Discoverability; one-click intent for common requests |
| Worst at | First-time discovery | Two grammars compete; bottom border is borders-as-hierarchy | Density tax; stock SaaS look risk |
| Component budget cost | TaskCard.actions slot used (already present) | TaskCard.actions slot + outer wrapper becomes button | TaskCard.actions slot used + verb-row layout |
| /design-critique score | **8/10** | **7/10** | **8/10** |

## Screenshots

- Variant A: `plans/L15/design/variant-a-kebab/screenshot.png`
- Variant B: `plans/L15/design/variant-b-body-thread/screenshot.png`
- Variant C: `plans/L15/design/variant-c-verb-row/screenshot.png`

## Anti-convergence verification

| Axis | A | B | C |
|---|---|---|---|
| Where the eye lands first | Title | Title (hover-tint sweeps) | Title competes with verb row |
| Density | Highest | Mid | Lowest |
| Action surface | Single (kebab) | Dual (body + button) | Plural (4 buttons) |
| Composition | 1 element | Card-as-button + 1 element | Row of N buttons |
| Discovery cost | High | Low (Linear convention) | None |
| Copy register | Terse menu items (verb + target) | Mixed (mono strip + menu) | Spelled-out verb labels |
| Motion | Single fade | Hover-tint + fade | Hover-tint + fade per verb |

Variants differ on **all 7 axes**, exceeding the "differ on 3+" requirement. No regen needed.

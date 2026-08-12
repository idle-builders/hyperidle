# AZ15 controlled spacing comparisons

## Method

`index.html` reconstructs two real production structures using Hearth colors, type scale, borders, row shapes, controls, and content:

- dense stacked Settings (forms, row lists, toggles);
- sparse Agent detail (identity, configuration, capabilities, activity).

Each image holds content, typography, borders, padding, shadows, and the other two relationship gaps constant. Only the named candidate changes. `render-spacing-comparisons.mjs` captures the six cases and records computed variables and content spans in `metrics.json`.

```sh
node .pipeline/work/AZ15/measurement/scripts/render-spacing-comparisons.mjs
```

These are isolated, non-production renders. They do not edit the application.

## Comparison index and findings

| Pair | Paint | Measured content-span cost | Finding |
| --- | --- | ---: | --- |
| Dense section 24/36, desktop | [PNG](section-dense-desktop.png) | 626 → 662 (+36) | 24 stays dense and boundaries remain clear because heading/divider/surface cues are strong; 36 adds repeated air without new information. |
| Sparse section 24/36, desktop | [PNG](section-sparse-desktop.png) | 468 → 504 (+36) | 36 makes independent regions unmistakable; 24 is still usable because panels/dividers help. Reserve 36 for weak-cue or phase-level separation. |
| Dense group 12/18, desktop | [PNG](group-dense-desktop.png) | 626 → 638 (+12) | 12 keeps pairs of form fields cohesive. 18 is useful only when those fields are separate clusters, not merely consecutive controls. |
| Sparse group 12/18, narrow | [PNG](group-sparse-narrow.png) | 654 → 672 (+18) | 18 helps multiline stats/copy breathe after reflow; 12 remains better for compact single-line groups. |
| Dense close 6/9, narrow | [PNG](close-dense-narrow.png) | 626 → 650 (+24) | Repeated 9px label/control gaps add visible page length; 6 more strongly pairs compact labels and inputs. |
| Sparse close 6/9, desktop | [PNG](close-sparse-desktop.png) | 468 → 480 (+12) | 9 better connects a small-caps label to a larger card/list without crowding; the difference is subtle when a divider is present. |

## Candidate systems considered

1. **Compact exact ladder:** close 6, groups 12, sections 24. Strong on dense forms; under-expresses sparse/phase transitions.
2. **Roomy exact ladder:** close 9, groups 18, sections 36. Clear on sparse details; compounds scroll cost and detaches related controls on dense surfaces.
3. **Guidance ranges (selected):** close 6–9, groups 12–18, sections 24–36, with boundary cues/density deciding within each range. It explains both surfaces without inventing a token or making one context pay for the other.

The existing token scale is adequate. Its unequal increments are useful at larger hierarchy levels: a 3px difference is perceptible for close relations; a 6/12px difference is needed for group/section hierarchy. A mathematically regular scale would not improve either rendered surface. `48px` remains a rare major phase/empty-state option; no new token is justified.

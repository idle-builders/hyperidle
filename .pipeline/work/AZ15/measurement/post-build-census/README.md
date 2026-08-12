# AZ15 post-build census

This is the baseline census rerun after the approved composition migrations. Reproduce without overwriting planning evidence:

```sh
AZ15_CENSUS_OUTPUT=.pipeline/work/AZ15/measurement/post-build-census node .pipeline/work/AZ15/measurement/scripts/spacing-census.mjs
```

The heuristic reports 18 off-vocabulary “composition” occurrences after the build. Source inspection reclassifies all 18 into approved narrow exclusions:

| Reclassification | Count | Evidence |
|---|---:|---|
| Scanner matches inside documentation comments | 2 | `Skeleton.tsx` lines 24–25 describe legacy examples; they are not authored classes. |
| Compact control/pill internals | 5 | Recipient and session badges, review pills, and the Assistant prefill chip use tightly coupled internal glyph/text gaps. |
| Optical alignment offsets | 11 | 1/2/7px top offsets align fixed glyphs, dots, and status text to adjacent line boxes; they do not separate content regions. |

The remaining actual composition population is entirely on vocabulary. `npm run lint:design` independently confirms zero `design/no-off-grid-spacing` and `design/shadow-token-only` errors over shipping Core UI and design-system TSX. The census still records padding, geometry, coordinates, overlap, reset, and subject-authored values for visibility; AZ15 does not claim those are composition.

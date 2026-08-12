# AZ15 measurement evidence index

## Reproduce

From `/Users/tg/Development/hyperidle/.worktrees/AZ15`:

```sh
node .pipeline/work/AZ15/measurement/scripts/spacing-census.mjs
AZ15_CENSUS_OUTPUT=.pipeline/work/AZ15/measurement/post-build-census node .pipeline/work/AZ15/measurement/scripts/spacing-census.mjs
node .pipeline/work/AZ15/measurement/scripts/render-spacing-comparisons.mjs
node .pipeline/work/AZ15/measurement/scripts/capture-real-spacing-instances.mjs
AZ15_APP_URL=http://127.0.0.1:5185 node .pipeline/work/AZ15/measurement/scripts/capture-post-build-paint.mjs
```

The real-instance and post-build paint commands expect a seeded app; override their defaults with `AZ15_APP_URL`.

## Read in this order

1. [`census/README.md`](census/README.md) — shipped authored-usage counts, scope, and classification limits.
2. [`instances/README.md`](instances/README.md) — real instance/rung review across lists, forms, details, Settings, and overlay behavior.
3. [`comparisons/SPEC.md`](comparisons/SPEC.md) — controlled 24/36, 12/18, and 6/9 visual comparisons and the selected range model.
4. `runtime-layout-1440x900.json` and `runtime-populated-summary.json` — computed baseline route measurements.
5. `off-grid-findings.json` and `shadow-sites.json` — earlier lint/shadow baselines.
6. `post-build-census/` — the same source census after the approved composition migrations; compare its summary with the baseline without overwriting planning evidence.

## Evidence boundaries

- Census semantic labels are heuristic and confidence-marked; rendered review decides relationships.
- Isolated comparisons use real production structures/styles but are not the production app.
- Existing baseline screenshots and Global Search captures are real rendered app output.
- Measurement scripts/results are planning evidence only. They do not modify production code or pipeline state.

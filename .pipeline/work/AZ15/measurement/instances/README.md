# Representative shipped-instance review

The static census was checked against real seeded-app paint, existing baseline screenshots, and the cited production source. The in-app browser became unavailable during this revision; the real app and isolated comparisons were therefore captured with the repository's Playwright runtime. This is a screenshot fallback, not an annotation/approval substitute.

## Reproduce real overlay paint

With the seeded app running (default `http://localhost:5173`):

```sh
node .pipeline/work/AZ15/measurement/scripts/capture-real-spacing-instances.mjs
```

Set `AZ15_APP_URL` to use another local URL. `runtime.json` records computed panel gap, padding, size, and shadow.

## Rung review

| Rung | Representative current instances | What works | What fails / caution |
| ---: | --- | --- | --- |
| 0 | Contiguous Knowledge/Conversation/task rows with dividers | Fast list scanning; shape/divider supplies grouping | Census cannot infer an absent gap, so row continuity is rendered/component evidence, not the single authored `0` count |
| 3 | `PageHeader` subtitle; comment/meta micro stacks; value/unit pairs | Clear within-one-typographic-unit cue | Too small for separate controls/groups; several pill uses are control internals |
| 6 | Key/value and icon/text pairs; Work/Review close content; compact field support | Most common rung; works vertically and horizontally without airiness | Can make a small-caps label and a large panel look crowded when no other boundary cue exists |
| 9 | `SectionLabel` to content; row/action clusters; Review metadata | Strong default close relation; survives multiline content better than 6 | Can be unnecessarily loose for a one-line label directly above a compact input |
| 12 | Row title/action spacing, field stacks, panel internals | Dominant medium rung; good for dense forms and inline peers | Agent Profile and Routine use 12 between top-level peer regions, where it collapses section hierarchy |
| 18 | Settings field groups, Review content groups, Empty/Error state phases | Useful when content is multiline or boundary cues are weak | Current Settings title-to-card use feels detached; 18 is not a universal label gap |
| 24 | Work Team/Bet/Task outer stacks, Knowledge main column, Settings peer sections | Consistent dense-page section rhythm when labels/dividers/surfaces already mark boundaries | Not always enough for a major phase change on a sparse unbordered surface |
| 36 | Review Composition outer phase stack; Setup prose break | Suitable for rare workflow/chapter breaks | Only two likely composition uses; too costly as every-section default on dense pages |
| 48 | No shipped true-composition instance | Existing vocabulary provides an upper escape hatch | Do not infer a normal use from token existence; repeated 48px gaps would violate product density |

## Surface/problem review

- **Dense Settings/form:** 24px between peer sections works because every section has a small-caps heading and divider. The current 18px heading-to-error-card distance visually detaches the label from what it names.
- **Sparse detail:** Agent/Routine outer 12px stacks make configuration, capabilities, and activity read as one undifferentiated group. They need the major-section range, not a global exact value.
- **Lists:** Knowledge and Work rows need no inter-row whitespace. Insets and 44px row height are AZ7/AZ11-adjacent contracts, not evidence for composition gaps.
- **Horizontal composition:** 6–12px dominates icon/text, title/status, and inline action groups. 18–24px works only for visibly separate stat/column clusters; it is excessive for ordinary icon-label pairs.
- **Overlay:** `GlobalSearchPanel` paints well at desktop and 760px with its current 8px internal gap, 12px padding, and elevated shadow. `8px` is off vocabulary; the controlled difference to 9px is negligible, so 9px is the least disruptive correction. The fixed 640px narrow width is geometry, not AZ15 rhythm.
- **Off-vocabulary 4/8:** Some are genuine legacy composition (`gap-2`, `mb-2`) and should move to the nearest relationship-appropriate rung. Others are pill/badge/control parts and require AZ7 exceptions. A global nearest-number replacement would be wrong.
- **1/2/7 optical values:** Icon/dot baseline offsets are optical positioning. Vertical 2px list gaps are actual composition and need design review. Classification and reason must precede migration.
- **Canvas/negative/geometry:** Review line offsets, visual-diff coordinates, rich-message indentation, and negative transforms establish alignment or overlap. They must not be counted as relational whitespace.
- **Authored artifacts:** Inline email/web-preview spacing belongs to the subject under review. Hearth preview chrome remains governed.

Reviewed paint is in `../screenshots/`, this directory's Global Search captures, and `../comparisons/`.

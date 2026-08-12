# AZ15 painted proof

Reproduce against the AZ15 Vite app:

```sh
AZ15_APP_URL=http://127.0.0.1:5185 node .pipeline/work/AZ15/measurement/scripts/capture-post-build-paint.mjs
```

## Inspected evidence

| Family | Files | Result |
|---|---|---|
| Dense Settings/form | `settings-desktop.png`, `settings-narrow.png` | Section titles remain attached to named content at computed 9px; peer sections remain 24px. Desktop density is efficient; narrow content reflows without introducing whitespace inflation. |
| Sparse Agent detail | `agent-desktop.png` | Computed 24px top-level section rhythm is distinct but not airy because container fills provide a strong cue. |
| Routine detail/form | `routine-narrow.png` | Computed 24px top-level rhythm survives the narrow viewport; label/control stacks remain close and the long form stays scannable. |
| Work list/detail | `work-team-desktop.png`, `work-task-desktop.png` | Flush rows remain contiguous; section boundaries are legible and horizontal metadata/action spacing does not disrupt scanning. |
| Knowledge detail | `knowledge-detail-desktop.png` | Content, discussion, metadata, and backlinks retain clear grouping without page-level whitespace expansion. |
| Overlay | `global-search-narrow.png` | Computed 9px internal composition and the warm `--shadow-elevated` value distinguish the transient panel at the narrow viewport. |

All eight PNGs were inspected directly after capture. No clipping, unexpected wrap, hierarchy inversion, or raw/cool elevation shadow was observed.

## Honest limits

- Review is covered by source census, design lint, and existing focused Review tests, but not by a new populated screenshot: no seeded review message ID is exposed through the visible demo navigation. The legacy `/conversations/review` path redirects to Conversations and is explicitly not accepted as Review proof; its misleading capture was removed.
- TaskSheet's changed elevation is covered by the error-level `shadow-token-only` rule and `TaskSheet.thread.test.tsx`, which renders the real component and asserts `shadow-[var(--shadow-elevated)]`. The seeded WorkBet row currently navigates to the full task route rather than opening the sheet, so no production-route TaskSheet PNG is claimed. Global Search supplies the required real overlay paint.
- Computed browser shadow strings include framework reset layers and state rings. `metrics.json` records them verbatim; vocabulary compliance is asserted at the authored chrome seam rather than pretending every computed layer is an elevation token.

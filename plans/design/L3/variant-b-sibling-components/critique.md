# Design Critique — Variant B (four sibling components)

**Reviewed:** `mockup.html`, screenshot at `screenshot.png`.

## Score: 7.6 / 10

(H:8 S:8 T:8 C:8 Co:9 St:6 A:7 AS:9 PP:6)

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Visual Hierarchy | 8 | Same hierarchy strategy as A. The gallery card's title row is slightly heavier here because the cost-chip + thread-pill split into discrete tokens reads cleaner. |
| 2 | Spacing & Density | 8 | Same density-token discipline as A. The thread-pill (a discrete `--surface-3` chip in the footer) adds a beat of structure that A misses. |
| 3 | Typography | 8 | Same scale, same families. The verification-card "228 / 230 passing" line at 14px mono pulls attention because of size and weight, which is correct — verification is the load-bearing kind to scan for. |
| 4 | Color Usage | 8 | Same monochrome + danger discipline. Verification preview adds a `--ok` `228` and `--danger` `2 fail` — color carries information here, on the only kind that has a binary outcome. |
| 5 | Coherence | 9 | The four sibling components reuse four named sub-primitives. Same kind-badge + cost-chip + timestamp render in every layout. The embed enforces "no chrome" by being a separate component — variant A and C rely on a layout switch inside one component to express the same constraint. Higher-confidence enforcement. |
| 6 | States | 6 | Mockup shows populated + no-preview placeholder per layout. Loading and error are not rendered. |
| 7 | Accessibility | 7 | Same a11y level as A. The `→` arrow is now a separate `.ae-arrow` span — easier to add `role="button" aria-label="…"` later but missing in the mockup. |
| 8 | Anti-Slop | 9 | Same discipline as A. Six kinds in the gallery; one placeholder. The dashboard kpi row's tabular-nums alignment is satisfying. |
| 9 | Premium Polish | 6 | Tabular-nums on cost/timestamps. Letter-spacing on uppercase labels. The thread-count pill (`2 threads`) is a tasteful "earn the chip" — only renders when count > 0. But the small-screen dropoff for the right cluster is described in spec, not demonstrated. |

### CRITICAL

- **States demonstration missing.** Same gap as A — no loading skeleton, no error state in the mockup. The spec promises four state matrices.

### WARNING

- **Stack-item's `2` thread pill is non-pluralized.** When count = 1, "1" reads ambiguously. Consider `2 threads` (gallery) and `2` (stack — width-constrained) only when there's real width pressure. The mockup currently does the latter; that's fine, but document it.
- **Verification card's `<span class="ok">228</span> / 230 passing · <span class="fail">2 fail</span>`** uses semantic ok/danger tokens, which is correct — but visually the green "228" is the loudest element on the entire gallery grid. AQ-008 (color = meaning) is satisfied; the question is whether verification deserves to be the loudest kind. Designer call. Could tone the green to `--text-hi` and reserve color for the failure count alone.
- **Embed's `→` arrow tight against the timestamp** when content overflows — the strip wraps, the arrow stays pinned. Looks correct but verify on narrow viewports.

### SUGGESTION

- **Cost-chip on stack rows shows `$0.42` (no token count)** while gallery shows `$0.42 · 3.2k`. This is correct (stack = denser, drops the secondary), but should be a documented sub-primitive variant: `<ArtifactCostChip variant="full|compact" />`.
- **The four sibling components increase the import surface** — `import { ArtifactGalleryCard, ArtifactStackItem, ArtifactPreview, ArtifactEmbed } from '@design-system'`. Consider a barrel namespace: `import { Artifact } from '@design-system'` then `Artifact.GalleryCard`, etc. Pure DX polish, not blocking.
- **Discussion sidebar in single_full_preview shows real thread content** ("Confirmed against the contracts spec…") which is excellent — it grounds the integration with L1 without inventing a thread component.

### What's Working Well

- **Sub-primitive discipline.** ArtifactKindBadge, ArtifactCostChip, ArtifactTimestamp, ArtifactPreviewSurface as a small, focused inner toolkit. Single source of truth for the kind-renderer switch (PreviewSurface) prevents drift across the three layouts that have a preview.
- **Embed's enforcement.** Putting the embed in its own component file means a lint rule can guard "no background, no border, no padding" forever. Variant A relies on a switch inside one file; variant C relies on a variant prop. B is the structurally safest.
- **Verification-kind preview surface.** "228 / 230 passing" with a tabular-num `--ok` count is the most information-dense single line in the entire mockup set. This is what premium dense UI looks like.
- **Thread-pill rendering.** A discrete `--surface-3` chip in the footer reads better than variant A's separator-text approach.

### Iteration plan (max 1 round)

Same blocker as A — states need to render in the mockup. Otherwise, the architecture-level wins (sub-primitives + per-layout enforcement) make this the highest structural score so far.

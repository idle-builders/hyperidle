# Review primitive (AL2)

A review canvas is the purpose-built surface that renders one artifact in a review Subject. It is selected by the artifact’s `kind`, so a reviewer sees a proof-family layout for that output — not raw JSON or a generic preview. The underlying data is still the [`Artifact` primitive](../process-layer/artifact-primitive.md); canvases only own the review-time presentation layer.

## Review canvas families

AL2 ships nine families. `getReviewCanvas(kind)` returns the matching component; unknown kinds fall back to a safe header + JSON dump.

| Kind | Canvas | What it shows |
|---|---|---|
| `outcome_summary` | `ReviewOutcomeSummary` | Frame lead: agent result, done conditions, needs-you items, cost. |
| `field_change_set` | `ReviewFieldChangeSet` | Record fields that changed, with provenance and unchanged count. |
| `action_operation` | `ReviewActionOperation` | Staged action receipt: verb, amount, blast radius, receipt fields. |
| `rendered_in_context` | `ReviewRenderedInContext` | Email or document rendered in its inbox context. |
| `metrics_moved` | `ReviewMetricsMoved` | Period metrics, roll-forward table, exceptions. |
| `visual_diff` | `ReviewVisualDiff` | Before/after regions for UI assets. |
| `code_diff` | `ReviewCodeDiff` | Relevance-ranked diff: logic files, test files, collapsed trivia. |
| `batch` | `ReviewBatch` | Per-item rollup with flagged items surfaced first. |
| `browser_preview` | `ReviewBrowserPreview` | Basic browser view of a deployed or preview URL. |

## Tool grounding and safety

Every canvas carries its source tool via `ToolLogo` and a jump-off link via `CanvasSourceHeader`. `isSafeSourceHref` blocks non-HTTP(S) schemes such as `javascript:`, so agent-authored `sourceHref` values cannot become a click-through XSS vector. Unknown kinds render `ReviewUnknownCanvas`: source header, kind label, and a capped JSON preview — never a blank screen or crash.

## Where it lives

The registry, types, and canvases are in `packages/web/src/pages/review/`. `ReviewPage` at `/work/bet/:betId/review/:reviewId` exercises the registry for the AL2 integration scaffold; the full dual-anchor composition (intent, rationale, conversation, verdict) is owned by AL3.

Next: [`Artifact` primitive](../process-layer/artifact-primitive.md) for the canonical data shape, or [`Thread` primitive](./thread-primitive.md) for the conversation container.

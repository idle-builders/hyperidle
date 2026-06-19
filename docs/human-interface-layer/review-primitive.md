# Review primitive

A review is a single surface where a human judges one **Subject** — the output of a task or bet — and casts one **verdict**. It is dual-anchored: it shows *what was asked* (the intent / prompt) and *what was produced* (the Subject), so the verdict answers both “did it do the right thing?” and “is the output sound?”. The underlying data is still the [`Artifact` primitive](../process-layer/artifact-primitive.md); the review layer only owns presentation.

## Review canvas families

AL2 ships nine proof-family canvases. Each artifact renders through the canvas selected by its `kind` via `getReviewCanvas(kind)`; unknown kinds fall back to a safe header + JSON dump.

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

## Composition surface (AL3)

The `ReviewComposition` component at `/work/bet/:betId/review/:reviewId` wraps the canvas families into a coherent review page:

```
ReviewComposition
├─ Frame header    (bet › task, agent → reviewer, cost, five verdicts)
├─ The task        (the real prompt + source link)
├─ Result          (outcome, KPIs, visible proof, intent met-line)
├─ Needs you       (risks, each jump-linked to its artifact)
├─ Artifacts       (thin opener rows; click opens the pane)
├─ Conversation    (one global thread; inline anchored comments bind to artifact blocks/lines)
└─ Right pane      (selected artifact rendered by its AL2 family canvas)
```

Clicking an artifact opens it at full size in a right pane without leaving the review. Press `Esc` or click ✕ to close the pane and return to the whole Subject. One verdict resolves the whole Subject; there are no per-artifact verdicts.

## Anchored comments (AL4)

Comments in a review are plain messages in the Subject's single global Thread. Each comment can optionally carry an `AnchorRef` (`artifactId` + `blockId` + optional `spotLabel`). When a comment is anchored, it renders directly next to the spot it addresses: a code-diff line, a paragraph inside an email body, etc. The spot label (`src/billing/promo-webhook.ts:118`, `Solo plan launch — $19/mo`) gives readers a readable handle, but the real binding is block identity, not coordinates or line numbers. That means the comment follows the content across edits; if the addressed block disappears, the comment becomes an orphan rather than silently reattaching.

In the global conversation, anchored comments show the spot label as a clickable chip; clicking it opens the owning artifact in the right pane. New anchored comments are created by hovering the relevant line or block and using the inline composer; replies attach to the same anchor and appear both inline and in the global thread.

## Tool grounding and safety

Every canvas carries its source tool via `ToolLogo` and a jump-off link via `CanvasSourceHeader`. `isSafeSourceHref` blocks non-HTTP(S) schemes such as `javascript:`, so agent-authored `sourceHref` values cannot become a click-through XSS vector. Unknown kinds render `ReviewUnknownCanvas`: source header, kind label, and a capped JSON preview — never a blank screen or crash.

## Where it lives

The registry, types, canvases, and composition component are in `packages/web/src/pages/review/`. `ReviewPage` at `/work/bet/:betId/review/:reviewId` renders `ReviewComposition`. The server exposes `GET /api/reviews/:reviewId` as the Subject loader stub; the route is mounted in `packages/server/src/app.ts`.

Next: [`Artifact` primitive](../process-layer/artifact-primitive.md) for the canonical data shape, or [`Thread` primitive](./thread-primitive.md) for the conversation container.

# Reviews

## How a review works

An agent sends a message of type `review` when it needs a human decision. The session ends. The human opens the review page (`/reviews/:reviewId`), reads the canvas, and casts a verdict. The agent's session resumes with it.

No review is auto-approved.

## The review page

Each review has one or more review artifacts. Each artifact renders in a canvas component chosen by its `kind`. Unknown kinds fall back to `ReviewUnknownCanvas`, which shows a source header and a JSON preview so the surface never breaks.

### Canvas kinds (closed)

| Kind | Purpose |
|---|---|
| `outcome_summary` | Frame lead — what the agent accomplished |
| `field_change_set` | Record/field changes |
| `action_operation` | Staged action or operation receipt |
| `rendered_in_context` | Email or document rendered in place |
| `metrics_moved` | Metrics or data diff |
| `visual_diff` | Visual before/after |
| `code_diff` | Code diff |
| `batch` | Per-item container |
| `browser_preview` | Basic browser view |

## Comments

Anchored comments attach to a `blockId` inside a canvas. A `spotLabel` anchors to a named spot on canvases that don't use blocks.

## Source link guard

Every canvas shows a source link (`sourceHref`). `isSafeSourceHref` validates the URL before rendering it — only allowlisted schemes are followed.

## Verdicts

One verdict per review subject: **Approve** or **Reject**. A reject must say why — the reason goes back to the agent. To ask for a change, comment instead of giving a verdict. Either verdict resumes the review's associated session.

# AL4 — Inline anchored review comments

Shipped. `layers/core-ui/src/pages/review/review-canvas.tsx` and `ReviewCodeDiff.tsx`.

## How it works

Anchored comments render inline, at the block they address. A persistent side rail listing threads,
with source-line highlight, was built as variant B and rejected: it is a third pane inside a pane,
and it makes code-line-level precision indirect. Inline's known cost — vertical clutter on
comment-heavy artifacts — is accepted because the global thread already carries every comment; the
inline view is the focused lens, not the system of record.

# AL1 — The review surface

Shipped. `layers/core-ui/src/pages/review/ReviewComposition.tsx` over nine per-family canvases.

## How it works

Three alternative compositions were built, compared and rejected on the merits. The tree holds only
the winner, so none of this is legible from the code — do not re-litigate them:

- **Pinned/floating verdict bar** — the verdict lives in the header instead; a sticky bar competes
  with the result for attention.
- **Result-burying sidebar** — the result and the ask must lead the page, not a rail.
- **One-at-a-time focused examine** — loses the whole; the reviewer must see the Subject as a set.

Also rejected: per-artifact verdicts (one verdict covers the whole Subject — per-file verdicts are
the review fatigue that kills adoption), dual per-artifact plus global conversations (one thread,
with reference chips), and a diff-first layout (code is one drill-down family, not the lead).

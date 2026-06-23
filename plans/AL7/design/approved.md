# AL7 — Review execution loop · Approved design

**DESIGN-CLASS: routine** — extends the existing `action_operation` review canvas; no new base
primitive, no human design review (per WP spec + concept Phase 0 forecast).

## Approved variant

**The Operation Outcome band** — a status-keyed band appended to `ReviewActionOperation`
(`packages/web/src/pages/review/ReviewActionOperation.tsx`), between the receipt `<dl>` (L2) and
the L3 toggle. Driven by two new optional props on the canvas: `status` and `outcome`.

- `pending` → no band (AL2 canvas unchanged — staged op un-executed).
- `executed` (`outcome.status === "ok"`) → calm success band: forest-green accent
  (`--accent-primary`), filled check, "Executed", `executedAt`, and the tool's return identity
  (`receipt`) as the proof the side-effect landed.
- `failed` (`outcome.status === "failed"`) → loud failure band: `--status-error` border +
  `--status-error-dim` fill (same family as the irreversibility warning), "Execution failed",
  `executedAt`, and the tool's `error` rendered **verbatim**. Persistent on the canvas — never a
  toast (concept hard rule #8; survives re-open).

The band lives **inside the same card**, directly under the receipt it describes, so the reviewer
reads "what I approved → what happened" in one vertical scan. The idempotency key already shown in
L2 is the visible anchor tying the pre-commit receipt to the post-commit outcome.

The commit trigger remains the Subject's existing five-verdict bar in `ReviewComposition` — the
canvas does **not** add a second approve button (concept hard rule #7; grammar unchanged).

## Rendered states (story)

`packages/web/src/pages/review/ReviewActionOperationOutcome.stories.tsx` — three exports:
`Executed`, `Failed`, `PendingUnchanged`. Populated terminal states only (no skeleton/loading —
build concern). Verified: `tsc -p packages/web` clean on the changed files; story renders.

## Composition rubric self-score (in-session)

| Dimension | Score | Note |
|---|---|---|
| Component budget | 5/5 | Zero new components; markup + tokens inside an existing canvas + 2 optional props. |
| One interaction grammar | 5/5 | Verdict bar unchanged; canvas renders state, owns no verdict. |
| Density | 5/5 | 9–12px padding; band reuses the existing receipt rhythm. |
| Humans validate / agents execute | 5/5 | Reviewer reads the outcome; Kernel executed. No agent work asked of the human. |
| Avoid AI aesthetic | 5/5 | Hearth tokens only; no gradient/hero/decorative icon; failure uses the existing error family. |
| Failure surfacing (concept rule #8) | 5/5 | Failure is the loudest post-amount element, persistent, error verbatim. |
| Re-open correctness | 5/5 | Terminal band re-renders on re-open; no re-prompt. |

## Rejected alternatives

See `plans/AL7/brief.md` "Did we consider X / Y / Z" — toast (transient, fails rule #8), dedicated
`operation_outcome` kind (budget violation), baked-in executing spinner (build concern), a
canvas-local execute button (second authority path).

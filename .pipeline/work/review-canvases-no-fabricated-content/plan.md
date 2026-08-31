# Review canvases: no fabricated content

## What was wrong

Every review screen in the product — all nine canvases plus the shared `ReviewComposition` frame and
`CommentRow` — put strings and numbers on screen that the review's own payload never supplied. Found
by rendering each canvas with marked payloads and listing every token that reached the DOM without
coming from the data:

- **`ReviewBrowserPreview`** — a `Solo` pricing tier and `$19/mo` invented wholesale, a fixed nav bar,
  and `previewBody` rendered twice.
- **`ReviewFieldChangeSet`** / **`ReviewRenderedInContext`** — every field's provenance mark hardcoded
  to `salesforce` / `mailchimp` regardless of the real source tool.
- **`ReviewCodeDiff`** — a hardcoded `coverage +0.4%` on every diff, and `"All checks passed"` under a
  green check for every check, even though `CodeDiffPayload.checks` carries only names, no state.
- **`ReviewActionOperation`** — an `IrreversibleBadge` and section title rendered unconditionally,
  contradicting the reversibility sentence beside them that already read the real flag; and an
  `"Approve refund"` button labelling every operation.
- **`ReviewMetricsMoved`** — an invented narrative with fixed month names and a bank-tie claim no field
  backs; every number forced into USD though the payload carries no currency.
- **`ReviewBatch`** — sentiment, a flag category, and a drafted-reply fallback, none of which
  `BatchPayload.flagged[]` carries.
- **`ReviewOutcomeSummary`** — a token count defaulted to `0 tok`.
- **`ReviewVisualDiff`** — a fully fabricated signup screen drawn as *both* before and after evidence
  panes, though `VisualDiffPayload` carries no image data at all.
- **`ReviewComposition`** — a fake checkout card (`SPRING24`, `$120.00`, an expiry line) inside every
  review regardless of subject, plus two controls that did nothing when clicked.
- **`CommentRow`** — a review message on a host thread with no rich slot rendered a blank row. A
  distinct gap (nothing shown, rather than something invented) fixed with a plain-text title fallback.

## Two traps this class of bug hides behind

1. **The default DOM is not the whole DOM.** Two fabrications (`ReviewCodeDiff`'s trivia file list,
   `ReviewFieldChangeSet`'s unchanged-field names) were behind collapsed disclosures and only visible
   once expanded.
2. **A guard passing does not mean a field is present.** `ReviewOutcomeSummary`'s payload guard never
   checked `tokens`, so a well-formed payload omitting it still took the success path and rendered a
   fabricated `0 tok`. The fix is conditional rendering
   (`tokens !== undefined ? <TokensChip .../> : null`), never a different default.

## The property that now prevents it

Not a banned-string list — a property: **no string or number may reach the DOM that the payload did not
supply, except fixed interface chrome, which names a region rather than asserting a value.** "Blast
radius" and "Needs you" are chrome — they label a slot. `$19/mo` and `coverage +0.4%` are claims about
the world that nothing here verified.

Enforced per canvas by a `*.no-fabrication.test.tsx` that renders the component with a **marked
payload** — every string value in the payload is a unique, greppable token — and asserts every text
node in the DOM is either traceable to a payload value or on an explicit per-canvas chrome allow-list
(headings, static labels, button verbs). The shared assertion lives in one helper,
`layers/core-ui/src/pages/review/__tests__/no-fabrication.ts` (`assertNoFabrication`), so all nine
tests apply one rule and the *next* fabrication trips the same test instead of needing a new banned
string somewhere.

Each canvas also has a guard-failure test: a payload failing the type guard renders
`ReviewUnknownCanvas` — an honest "can't render this" state — never a hardcoded demo fixture. Nine
demo fixture constants were deleted outright, along with two dead no-op controls and one unreachable
component (`ProposedCallArgsPanel`, confirmed unreachable because nothing populates
`artifact.proposedCall`).

Two pre-existing tests had asserted the exact fabricated strings this change removes ("All checks
passed", "ties to bank"). They encoded the defect and were corrected to assert honest behaviour, not
weakened.

## Explicitly out of scope

This piece touches only the nine canvases, `ReviewComposition.tsx`, `CommentRow.tsx` and the
design-token census. Two known fabrications are deliberately left:

- **`layers/core-api/src/routes/reviews.ts`** still serves a hardcoded `FIXTURE_REVIEW` for
  `reviewMessageId === "rev-1"`. That route belongs to the review-reachability piece, which reworks it
  to `/reviews/:reviewId`, adds `threadId`, and has its own backend integration tests. Touching it here
  would duplicate that work or leave the route half-migrated.
- Backend and routing changes generally — thread-id plumbing, artifact-reference resolution, the action
  gate — belong to other pieces of the same original work package.

## Census note

Deleting rendered chrome moved `tools/repo-gates/src/design-profile-census.ts`'s expected counts:
`typography.label` −5, `metadata` −10, `small` −8, `control` −2, `lead` −1, `data` −6, `border.thin`
−13. Every delta was attributed to the specific deleted site by diffing each affected file
individually — the census is reconciled to this diff, not bulk-rebaselined.

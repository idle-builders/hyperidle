# Review canvases: no fabricated content

## What was wrong

Every review screen in the product (all nine review canvases, plus the shared
`ReviewComposition` frame and `CommentRow`) put strings and numbers on screen
that the review's own payload never supplied. Found by rendering each canvas
with marked payloads and listing every token that reached the DOM without
coming from the data:

- **`ReviewBrowserPreview`** — a `Solo` pricing tier and `$19/mo` invented
  wholesale, plus a fixed nav bar (`Product · Pricing · Docs · Changelog`) and
  a `previewBody` value rendered twice (once as subhead, once as footer).
- **`ReviewFieldChangeSet`** / **`ReviewRenderedInContext`** — every field's
  provenance mark hardcoded to `salesforce` / `mailchimp` regardless of the
  real source tool.
- **`ReviewCodeDiff`** — a hardcoded `coverage +0.4%` on every diff, and
  `"All checks passed"` rendered under a green checkmark for every check even
  though `CodeDiffPayload.checks` carries only check *names*, no pass/fail
  state at all.
- **`ReviewActionOperation`** — an `IrreversibleBadge` and an "Irreversible"
  section title rendered unconditionally, contradicting the reversibility
  sentence right beside them which already read the real `irreversible` flag.
  An `"Approve refund"` button labelled every operation, not only a refund.
- **`ReviewMetricsMoved`** — an invented narrative ("closed... up from April...
  ties to bank...") with fixed month names and a bank-tie claim no payload
  field backs; every number forced into USD even though the payload carries
  no currency.
- **`ReviewBatch`** — sentiment (`angry`/`frustrated`/`neutral`), a flag
  category, and a drafted-reply fallback sentence, none of which
  `BatchPayload.flagged[]` actually carries.
- **`ReviewOutcomeSummary`** — a token count defaulted to `0 tok` when the
  payload's guard never even checks for a `tokens` field.
- **`ReviewVisualDiff`** — a fully fabricated signup screen ("Create your
  account", `you@company.com`, a "Create account" CTA) drawn as *both* the
  before and after evidence panes, even though `VisualDiffPayload` carries no
  image data at all — the canvas literally has nothing to render an image
  from.
- **`ReviewComposition`** — a fake checkout card (`SPRING24`, `$120.00`, an
  expiry line) rendered inside every review regardless of what was under
  review, plus two controls (`ExaminePane`'s "Comment on this", `TaskSection`'s
  breadcrumb button) that did nothing when clicked.
- **`CommentRow`** — a review message on a host thread with no rich slot
  rendered a blank row (a related but distinct gap: nothing to show, not
  something invented — fixed with a plain-text title fallback).

Two traps recorded during the fix and respected here:
1. **The default DOM is not the whole DOM.** Two of the fabrications
   (`ReviewCodeDiff`'s trivia file list, `ReviewFieldChangeSet`'s unchanged-
   field names) were hidden behind collapsed disclosures and only visible
   once expanded.
2. **A guard passing does not mean a field is present.** `ReviewOutcomeSummary`'s
   payload guard never checked `tokens` — so a well-formed payload omitting it
   still hit the "success" path and rendered a fabricated `0 tok`. The fix is
   conditional rendering (`tokens !== undefined ? <TokensChip .../> : null`),
   not a different default.

## The property that now prevents it

Not a banned-string list — a property: **no string or number may reach the
DOM that the payload did not supply, except fixed interface chrome, which
names a region rather than asserting a value.** "Blast radius" and "Needs
you" are chrome (they label a slot); `$19/mo` and `coverage +0.4%` are claims
about the world nothing here verified.

Enforced per canvas by a `*.no-fabrication.test.tsx` that renders the
component with a **marked payload** (every string value in the payload is a
unique, greppable token) and asserts that every text node in the rendered DOM
is either:
- traceable back to a value that came from the payload, or
- on an explicit per-canvas chrome allow-list (headings, static labels like
  "Design" / "Build", button verbs like "Approve" / "Reject").

The shared assertion lives in one helper
(`layers/core-ui/src/pages/review/__tests__/no-fabrication.ts`,
`assertNoFabrication`) so all nine tests apply the same rule instead of nine
independent ad-hoc checks, and so the *next* fabrication trips the same test
rather than requiring a new banned string to be added somewhere.

Each canvas also gets a guard-failure test: a payload that fails the type
guard now renders `ReviewUnknownCanvas` (an honest "can't render this" state),
never a hardcoded demo fixture. Nine demo fixture constants (`FIXTURE`,
`REFUND`, etc.) are deleted outright, along with two dead no-op controls and
one unreachable component (`ProposedCallArgsPanel`, confirmed unreachable in
production because nothing populates `artifact.proposedCall`).

## What is explicitly out of scope

This piece only touches the nine canvases, `ReviewComposition.tsx`,
`CommentRow.tsx`, and the design-token census. Two known fabrication findings
from the original sweep are **not** fixed here because fixing them requires
files and tests this piece does not own:

- **`layers/core-api/src/routes/reviews.ts`** still serves a hardcoded
  `FIXTURE_REVIEW` for `reviewMessageId === "rev-1"`. This route is owned by
  the review-reachability piece (the one that reworks the route to
  `/reviews/:reviewId`, adds `threadId`, and has its own backend integration
  tests) — touching it here would require either duplicating that piece's
  routing changes or leaving the route in a half-migrated state.
- Backend/routing changes generally (thread-id plumbing, artifact-reference
  resolution, the action gate) belong to other pieces of the same original
  work package and are not part of this diff.

## How it was proven

1. **Red first.** The nine `*.no-fabrication.test.tsx` files were written
   against the *old* (fabricating) components and confirmed failing before
   any production code changed.
2. **Green.** Each canvas's mapper and view were rewritten to only pass
   through values the payload actually supplies, with `ReviewUnknownCanvas`
   as the guard-failure fallback. `npm run check`, the full core-ui component
   suite (`layers/core-ui`, 351 files / 3504 tests), and `npm run lint`
   (Biome + ESLint + design-token lint + governance-lint) all pass clean.
3. **Two pre-existing tests corrected, not weakened.** `ReviewCodeDiff.test.tsx`
   and `ReviewMetricsMoved.test.tsx` had asserted the exact fabricated strings
   ("All checks passed", "ties to bank") this change removes — corrected to
   assert the honest behavior instead, because they encoded the defect.
4. **Design-token census reconciled to this diff only.** Deleting rendered
   chrome moved `tools/repo-gates/src/design-profile-census.ts`'s expected
   typography/border counts. Every delta below is attributed to the specific
   site deleted, verified by diffing each affected file individually and
   re-running `npm run lint:design-profiles`:
   - `typography.label` 118→113 (−5)
   - `typography.metadata` 231→221 (−10)
   - `typography.small` 227→219 (−8)
   - `typography.control` 97→95 (−2)
   - `typography.lead` 9→8 (−1)
   - `typography.data` 89→83 (−6)
   - `border.thin` 207→194 (−13)
5. **Restore-and-reprove.** `ReviewCodeDiff.tsx`'s `CiRow` was temporarily
   reverted to its old fabricating form (the "All checks passed" banner + the
   `+0.4%` coverage span). This reddened
   `ReviewCodeDiff.no-fabrication.test.tsx` (2 failures — the direct assertion
   and the aggregate `assertNoFabrication` scan) and
   `ReviewCodeDiff.test.tsx`'s corrected assertion (2 failures), exactly the
   tests that should catch this class of regression. Reverted; the file is
   byte-identical to before the experiment (verified by MD5), and both test
   files pass again.

# AL7 — Design critique (reviewer, Phase 2)

DESIGN-CLASS: **routine** — the Operation Outcome band extends the existing `action_operation`
canvas; no new base component, no human design review. Scored as routine: one variant against the
rubric, with extra weight on the concept's load-bearing surfacing rule (#8).

The variant is already implemented in `packages/web/src/pages/review/ReviewActionOperation.tsx`
(the `OutcomeBand` + the two new optional props `status`/`outcome`). I scored the rendered code,
not just the prose.

## Findings

### 1. WARNING — Success band reuses the irreversibility *warning* fill token, not a success fill
`OutcomeBand` (ReviewActionOperation.tsx:298) sets the OK background to `--accent-secondary-dim`.
`--accent-secondary-dim` is the **same fill the amount block and the IrreversibleBadge use** for the
money/irreversibility warning (lines 142–143, 356). The OK border is `--accent-primary` (forest
green) but the fill is the warning family. Result: a *succeeded* op renders in the warning fill, the
same dim background the canvas uses to say "danger / money / irreversible." The brief explicitly
says success should read in the "good/done" forest-green family and be "calm, because a
reversible-once-done refund is now just history." The fill contradicts that intent and muddies the
success/failure color semantics the whole canvas leans on.
**Fix:** use a dedicated success-dim fill token (e.g. an `--accent-primary-dim` / `--status-success-dim`
if one exists) for the OK band background, not `--accent-secondary-dim`. If no success-dim token
exists in Hearth, raise it to the design-system owner rather than borrowing the warning fill. Verify
against `packages/design-system/DESIGN.md` token list during build.

### 2. WARNING — `executedAt` rendered as a raw string; no humanization or format contract
The band prints `outcome.executedAt` verbatim (line 338). The dispatcher writes
`new Date().toISOString()` (architecture §4), so the reviewer will see `2026-06-23T14:02:31.118Z`
in a tabular-nums slot sized for a short timestamp. Every other time on the review surface
("9 min ago", `producedAgo` in reviews.ts) is humanized. A raw ISO string with milliseconds and a
`Z` is an AI/dev tell and breaks the surface's time-rendering consistency.
**Fix:** format `executedAt` to the review surface's relative/short-time convention at the
render boundary; keep the ISO string in the data layer. Decide the format in the build task, not
ad hoc.

### 3. WARNING — Failure error rendered in a single `truncate` line; verbatim surfacing rule is undercut
Concept rule #8 and the brief both insist the failure error renders **verbatim** and is
"impossible to miss." But the band renders `outcome.error` in a single-line `truncate`
mono paragraph (line 341). A real tool error (a Stripe `card_declined` body, a GitHub merge-conflict
message, a stack-ish API error) will be clipped at one line with an ellipsis — the opposite of
verbatim and impossible-to-miss. "Verbatim but visually truncated" is a contradiction the design
must resolve.
**Fix:** for the `failed` branch, drop `truncate` and allow the error to wrap (clamp to N lines with
a reveal, or full wrap). The OK `receipt` can stay single-line (it is a short identity); the error
must not be clipped. This is the spine of the design per the brief — get it right.

### 4. NIT — `pending`/`executing`/`held` all collapse to "no band" with no visible distinction
The props type includes `executing` and `held` (line 82), but the render only switches on
`executed`/`failed` (lines 192–193); everything else shows no band. The design doc says the
`executing` spinner is a deliberate build concern — fine. But `held` (non-approving verdict, op
parked) producing the identical "AL2 canvas, no band" as `pending` means a reviewer who
requested-changes sees no signal that the op is explicitly held vs simply never staged. Per the
architecture the column never even becomes `held` (it stays `pending`), so this is consistent — but
the design should state that `held` and `pending` are intentionally visually identical so the
builder doesn't invent a band for it.
**Fix:** add one line to `approved.md`: "`held` renders identically to `pending` (no band) by
design — the parked state needs no affordance; re-open + approve re-enters from the same canvas."

### 5. NIT — Story coverage does not include the failure-with-long-error case
`approved.md` lists three story exports (`Executed`, `Failed`, `PendingUnchanged`). The `Failed`
export should specifically carry a realistic multi-line error to prove finding #3 in the
DOM-snapshot net — a one-word error story will pass while the truncation bug ships.
**Fix:** make the `Failed` story's `outcome.error` a realistic long, multi-line tool error so the
snapshot captures the wrapping behavior.

## What the design gets right
- No second approve button — verdict bar stays in `ReviewComposition` (concept rule #7). Correct.
- Band lives inside the same card, under the receipt — "what I approved → what happened" in one scan.
  Faithful to the concept's "surfaced where the staged op's canvas rendered."
- Failure is persistent canvas, not a toast (rule #8 honored at the structural level; finding #3 is
  about the *fidelity* of that surfacing, not its persistence).
- Zero new component, two optional props — composition budget respected (5/5 self-score is fair).
- Idempotency key already shown in L2 ties pre-commit receipt to post-commit outcome — a genuinely
  nice anchor.

## Score: 7.5 / 10
Routine extension, structurally sound, concept-faithful on the load-bearing no-toast/persistence
point. No CRITICAL. Three WARNINGs are all token/format/truncation fidelity issues that undercut the
*surfacing* quality the brief makes the spine of the design — fixable in the build task, none require
a redesign. Build-ready **once findings 1–3 are folded into the build task**; finding #3 (verbatim
error must not truncate) is the one a careless build will ship wrong.

---

# Round 2 addendum (revised design @ d599ccda)

Verified against the actual TSX (`packages/web/src/pages/review/ReviewActionOperation.tsx`), not the
prose.

- **#1 (success fill) — RESOLVED.** `OutcomeBand` OK background is now `var(--accent-primary-dim)`
  (line 306), border `--accent-primary`. The warning fill `--accent-secondary-dim` is confined to the
  amount block + IrreversibleBadge (147, 376). A succeeded op no longer reads in the money/danger
  family. `approved.md` documents the token decision.
- **#2 (executedAt humanization) — RESOLVED.** `executedAt` is contracted as a pre-humanized display
  string the component renders as-is (88-96, 346); the reviews loader humanizes the stored ISO at the
  response boundary (architecture §7, matching `producedAgo`). No raw ISO reaches the band.
- **#3 (verbatim error must not truncate) — RESOLVED.** The failed branch renders the error with
  `whitespace-pre-wrap break-words` (line 360), preserving the tool's own newlines and wrapping long
  tokens. The OK `receipt` stays single-line `truncate` (351) — exactly the asymmetric split this
  finding asked for. This was the one a careless build would have shipped wrong; it is now explicit in
  both the TSX and `approved.md`.
- **#4 (held == pending) — RESOLVED.** `approved.md` states `held` renders identically to `pending`
  (no band) by design and the builder must not invent a band; consistent with the architecture never
  storing a `held` column value.
- **#5 (failure story long error) — RESOLVED.** `ReviewActionOperationOutcome.stories.tsx` exists;
  `approved.md` mandates the `Failed` export carry a realistic multi-line error so the DOM-snapshot
  net captures the wrapping (a one-word error would let the truncation bug ship green).

**Open build item (NIT, not a design defect):** the inline `type StagedOperationStatus` union is
still present at TSX line 82. Architecture §7a/N2 correctly defers replacing it with the
shared-tuple-derived type to the builder so the canvas and dispatcher cannot drift — verify this
landed during build, not in design.

## Score (round 2): 9 / 10
All three WARNINGs and both NITs are genuinely folded into the TSX + `approved.md`, verified against
the rendered code. The spine of the design — verbatim, un-truncated, impossible-to-miss failure
surfacing — is correct. No CRITICAL, no remaining WARNING. **Build-ready.** Only carry-forward is the
shared-status-tuple swap (an architecture build task, not a design change).

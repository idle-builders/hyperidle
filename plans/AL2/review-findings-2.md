# AL2 Re-Review Findings

**Branch:** `feat/AL2-proof-family-canvases`  
**Worktree:** `/Users/tg/hyperidle/.worktrees/AL2-review`  
**Reviewer:** cold `/review` re-review pass  
**Previous verdict:** `NOT DONE` (findings in `plans/AL2/review-findings.md`)  
**Validation run:** `npm run verify` passed; attestation `.verify-attestations/953ffbcdddfbc916953f30704cf668db858693d2.json` written.

---

## Executive summary

All six fix requests from the previous `NOT DONE` review are resolved. `ReviewCodeDiff` now preserves and renders real `added`/`removed` counts and diff hunks from the canonical `ReviewArtifact` payload. `ReviewBrowserPreview` guards its payload URL through `isSafeSourceHref`. `ReviewCodeDiff.test.tsx` proves AC-4: relevance ordering, PR summary, CI checks row, collapsed trivia, and expanded logic-file hunks. `protectedTests` is backfilled in `plans/AL2/architecture.md`. Lint is clean on the new review files. The branch is green.

---

## Lens 1 — Architecture

### CRITICAL

None.

### WARNINGS

- **`ReviewOutcomeSummary` fallback cast.** `ReviewOutcomeSummary.tsx:365` uses `({} as Partial<OutcomeSummaryPayload>)` when the payload guard fails, then spreads with `??` defaults. The cast hides that every field below has a fallback; a typed `EMPTY_OUTCOME` constant would remove the cast and fail closed if a new required field is added.

### OBSERVATIONS

- Layer integrity preserved: the review canvas registry lives in `packages/web/src/pages/review/` and does not leak upward into `packages/design-system/`.
- `protectedTests` is populated with 13 files in `plans/AL2/architecture.md:320-339`.
- `sharedFiles` and **Risks / ambiguities** §7 explicitly document the AL3 overlap on `ReviewPage.tsx` and the `/work/bet/:betId/review/:reviewId` route.
- Route is registered at `packages/web/src/router.tsx:91`.

---

## Lens 2 — Design

### CRITICAL

None.

### WARNINGS

- **Visual verification not re-run.** The previous review used design-system viewer screenshots. This re-review relies on the strengthened component tests and the green `npm run verify` run. No new screenshots were captured.

### OBSERVATIONS

- Token discipline holds: review canvases use `var(--*)` tokens; raw hex is limited to `ToolLogo.tsx` (documented exemption) and the neutral artifact bodies (email/browser page) with `@lore` justification.
- Each canvas retains L1/L2/L3 structure.
- Stories exist for all 9 canvases.

---

## Lens 3 — Security

### CRITICAL

None.

### WARNINGS

None.

### OBSERVATIONS

- `ReviewBrowserPreview.tsx:396-418` now applies `isSafeSourceHref` to the payload URL before rendering the chrome "Open" link; an unsafe URL renders as a disabled span with `aria-disabled`.
- `ReviewBrowserPreview.test.tsx:45-53` asserts the unsafe-span behavior for `javascript:alert(1)`.
- `CanvasSourceHeader` continues to guard `artifact.sourceHref`.
- `ReviewUnknownCanvas` still stringifies the entire payload into a `<pre>` text node; capped at `max-h-[320px]` with `overflow-auto`.
- No `eval`, `Function`, `dangerouslySetInnerHTML`, or `innerHTML` found in the review canvases.

---

## Lens 4 — Adversarial

### CRITICAL

None.

### WARNINGS

- **Payload mappers still degrade for thin payloads.** `ReviewRenderedInContext.mapRenderedPayload`, `ReviewMetricsMoved.mapMetricsPayload`, and `ReviewBatch.mapBatchPayload` fall back to minimal local fixtures when the artifact payload lacks the rich story fields. This is safe (no crash) but means the production route only shows the full design when the fixture-shaped payload is supplied. This was an optional fix and does not block ACs.
- **`ReviewOutcomeSummary` empty cast.** Same as Lens 1 warning; bypasses the type checker for the invalid-payload path.

### OBSERVATIONS

- Runtime payload guards are in place for every canvas (`is*Payload` in each file).
- Tests now assert behavior, not just presence: ordering, collapse state, counts, hunks, flagged-before-routine, exception surfacing, per-field provenance.

---

## Lens 5 — Simplification

### WARNINGS

- **`ReviewEmailBody` basic variant.** Exported from `ReviewRenderedInContext.tsx` and used only by its story. It is documented as a deliberate low-fidelity sibling, so it is not dead code, but it adds ~70 lines to an already large file.

### OBSERVATIONS

- No commented-out code or TODO markers in changed files.

---

## Lens 6 — AI Slop

### WARNINGS

- **Remaining `as` casts.** A handful of const assertions and runtime-guard casts remain. None hide behavior; the only weak one is the empty-object cast in `ReviewOutcomeSummary`.

### OBSERVATIONS

- No placeholder markers, no "simplified version" / "for now" comments.
- Tests are now canvas-specific rather than a uniform shallow pattern.

---

## AC completeness audit

| AC | Verdict | Evidence | Gap (if FAIL) |
|---|---|---|---|
| **AC-1** Each artifact kind renders through its purpose-built family canvas | PASS | `canvas-registry.test.ts` asserts all 9 `ReviewCanvasKind` → components. `ReviewPage.test.tsx` renders all 9 fixture artifact titles. | — |
| **AC-2** Every canvas shows source tool and link back | PASS | Each `*.test.tsx` asserts tool logo (`getByTitle(app)`) and `Open in <app>` link with `href=sourceHref`; `javascript:` hrefs render as disabled text in `ReviewUnknownCanvas.test.tsx` and `ReviewBrowserPreview.test.tsx`. | — |
| **AC-3** Three-layer drill-down, relevance ordering, trivia collapsed | PASS | Per-canvas tests assert L1/L2/L3 affordances. `ReviewCodeDiff.test.tsx:34-42` asserts logic files precede test files; `:61-68` asserts trivia band collapsed by default; `ReviewBatch.test.tsx:38-46` asserts flagged before routine. | — |
| **AC-4** Code canvas is excellent | PASS | `ReviewCodeDiff.test.tsx:18-23` asserts PR summary; `:34-42` asserts logic→test ordering; `:44-51` asserts CI checks row; `:53-59` asserts `+140 / −31` totals from payload counts; `:70-77` asserts expanded logic-file hunks. `CodeDiffPayload` carries `added`/`removed`/`hunks`; `review-subject.ts:143-289` supplies the full promo-webhook diff; `ReviewCodeDiff.tsx:613-640` maps them through. | — |
| **AC-5** Unknown kind renders through fallback, never breaking | PASS | `canvas-registry.test.ts` asserts `totally_unknown_kind` → `ReviewUnknownCanvas`; `ReviewUnknownCanvas.test.tsx` asserts safe source header, no clickable link for `javascript:` href, non-empty preview. | — |
| **AC-6** `npm run verify` passes | PASS | `npm run verify` exited 0; attestation `.verify-attestations/953ffbcdddfbc916953f30704cf668db858693d2.json` created. `npm run check` and `npm run lint` also green. Lint reports no warnings on new review files. | — |

**Overall verdict: DONE.**

---

## Remaining fix requests

None.

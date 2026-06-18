# AL2 Review Findings

**Branch:** `feat/AL2-proof-family-canvases`  
**Worktree:** `/Users/tg/hyperidle/.worktrees/AL1`  
**Reviewer:** cold `/review` pass  
**Validation run:** `npm run verify` passed (257/258 test files passed, 1 skipped; attestation written).

---

## Executive summary

The registry, contracts, and 9 canvas shells exist and typecheck/lint/test/build green. The story URLs render in the design-system viewer. However the **code canvas is not excellent when driven by the canonical `ReviewArtifact` payload** — it shows `+0 / −0` for every file and renders no hunks because `mapCodeDiffPayload` zeros `added`/`removed` and discards hunks. The per-canvas tests are also too shallow: they only assert title, tool link, and one generic detail affordance; they do not prove relevance-ordering, collapsed trivia, the summary, CI checks, or diff hunks. The `ReviewBrowserPreview` canvas exposes an unguarded `href` to the artifact payload URL, creating a small XSS surface. These gaps block `DONE`.

---

## Lens 1 — Architecture

### CRITICAL

- **Code canvas data contract is insufficient for AC-4.** `packages/web/src/pages/review/review-artifact.ts` `CodeDiffPayload.files` carries `path`, `band`, `rationale` but no `added`/`removed` counts and no hunks. `ReviewCodeDiff.tsx` `mapCodeDiffPayload` (lines 597–612) fills `added: 0`, `removed: 0`, `hunks: []`. The L2 proof surfaces file paths and bands but cannot surface the actual diff. This directly breaks the AC-4 requirement for relevance-ranked, summarized changes with inline checks/hunks.

### WARNINGS

- **AL3 composition boundary.** `ReviewPage.tsx` + `/work/bet/:betId/review/:reviewId` route were flagged in the architecture critique as AL3's composition surface and remain present. The file has a `@lore` disclaimer, but the route/page still risks merge friction with AL3. Recommend reducing to a minimal non-composing route stub or moving behind a flag until AL3 wires real data.
- **Type unsafe casts in payload mappers.** Several canvases cast `artifact.payload as <Payload>` and then cast nested arrays (`payload.rows as RollForwardRow[]`, `r.id as RegionId`, `file.band as ChangedFile["band"]`). These are accepted by `tsc` because of `as`, but they allow runtime payloads that violate the assumed shapes. Consider runtime guards or narrowing helpers.
- **`protectedTests` in `architecture.md` is still empty** despite new test files existing. The architecture-critique requested backfilling; this is not done.

### OBSERVATIONS

- Layer integrity is clean: the review canvas registry lives in `packages/web/src/pages/review/` and does not leak upward into `packages/design-system/`.
- `source-link-guard.ts` is shared and used by `CanvasSourceHeader`; downward dependency preserved.
- Naming is honest (`ReviewCanvasKind`, `ReviewUnknownCanvas`, `getReviewCanvas`).

---

## Lens 2 — Design

### CRITICAL

- **Code canvas renders `+0 / −0` and no hunks from payload.** Screenshot `/tmp/review-code-diff.png` shows all file cards with `+0 −0` and an expanded logic card with only the rationale line `"The fix"` and no diff hunks. This is not the "excellent code canvas" the AC demands. The design brief and approved concept require relevance-ranked files, visible `+`/`-` stats, a PR-message summary, CI checks inline, and a collapsible trivia band with real counts.

### WARNINGS

- **Lint warnings on new review files:** `ReviewBrowserPreview.tsx` (1), `ReviewCodeDiff.tsx` (4), `ReviewFieldChangeSet.tsx` (1), `ReviewUnknownCanvas.tsx` (1). The codebase treats warnings as non-blocking, but new files should be clean.
- **Metrics canvas payload fixture has no rows.** `AL2_REVIEW_SUBJECT.metrics_moved.payload.rows` is `[]`, so the L2 roll-forward table only renders the tie-out strip. The canvas works if rows are supplied, but the default fixture does not prove the table.
- **Rendered-in-context payload fixture is thin.** The subject fixture only provides `inboxRow`, `body`, `renderMode`, `flags`. When mapped via `mapRenderedPayload`, the resulting email loses the audience label, send plan, excluded-note, and full paragraphs that the story fallback renders. The canvas therefore degrades instead of enriching when driven by the subject fixture.

### OBSERVATIONS

- Token usage is disciplined: almost every class uses `var(--*)`. The only raw hex is in `ToolLogo.tsx` (tool identity, documented exemption) and the neutral artifact bodies (email/page) which are documented with `@lore`.
- Each canvas has an L1 summary, an L2 proof body, and at least one L3 expand/collapse affordance, matching the 3-layer contract.
- Stories exist for all 9 canvases with `group: "Conversations"`.
- Visual screenshots are available at `/tmp/review-*.png` (9 canvases) and confirm the components render in the design-system viewer.

---

## Lens 3 — Security

### CRITICAL

- **`ReviewBrowserPreview` exposes payload URL as unguarded `href`.** The browser-chrome "Open" link uses `href={data.url}` where `data.url` comes from `artifact.payload.url` (lines 392–401). `isSafeSourceHref` is not applied. A malicious `javascript:` URL could execute when the reviewer clicks Open. Fix: run `payload.url` through `isSafeSourceHref` before using it as an `<a href>`; render a disabled span if unsafe.

### WARNINGS

- `ReviewUnknownCanvas` stringifies the entire payload into a `<pre>` via `JSON.stringify`. This is safe because it renders as text nodes, but very large payloads could lock the renderer. The architecture-critique suggestion to cap/truncate the dump was not implemented.

### OBSERVATIONS

- No `eval`, `Function`, `dangerouslySetInnerHTML`, or `innerHTML` found in the review canvases.
- `CanvasSourceHeader` correctly uses `isSafeSourceHref` and renders unsafe schemes as disabled text.

---

## Lens 4 — Adversarial

### CRITICAL

- **Tests do not actually exercise the ACs.** Each canvas `*.test.tsx` repeats the same three shallow assertions: title present, tool logo present, source link present, and one generic detail button. They do not assert:
  - relevance ordering (logic before tests),
  - collapsed minor/generated band,
  - PR summary text,
  - CI checks row,
  - file hunks,
  - flagged items pinned above routine items,
  - per-field source provenance.
  This means the ACs are only proven visually, not in CI, and the visual proof fails for the code canvas.

### WARNINGS

- **Payload mappers silently degrade.** `ReviewCodeDiff`, `ReviewMetricsMoved`, `ReviewRenderedInContext`, and `ReviewBatch` prefer `artifact.payload` over their richer fixtures. Because the `AL2_REVIEW_SUBJECT` payloads are minimal, the production route renders degraded canvases rather than the designed experience.
- **`ReviewCodeDiff` totals are wrong from payload.** Even if `files` carried counts, the current map sets them to zero, so the header `+0 / −0` and "3 files changed" are inconsistent.

### OBSERVATIONS

- `ReviewFieldChangeSet` correctly floats `needsYou` fields to the top of the grid and provides per-field expand/collapse.
- `ReviewBatch` correctly renders flagged items before collapsed routine groups.

---

## Lens 5 — Simplification

### WARNINGS

- **Minimal payload subjects could be replaced by richer fixtures or derived defaults.** The thin payloads in `review-subject.fixture.ts` force mappers to throw away content. Providing full payload shapes (or, for code diff, using the rich fixture as the default subject) would remove several mapper branches and make the production route match the stories.
- **Several per-canvas `map*` functions re-create view models that the rich fixtures already encode.** This is necessary for the generic contract, but the payload types could carry the full view model shape to reduce casts and fallback asymmetry.

### OBSERVATIONS

- No dead code or commented-out blocks observed in the new review files.

---

## Lens 6 — AI Slop

### WARNINGS

- **Some comments restate the code.** E.g. `"L3 — on demand: per-field provenance + needs-you detail"` directly above the relevant JSX. These are not harmful but add noise.
- **Uniform but shallow test pattern across all 9 canvases.** The repeated `renders title / shows tool logo / exposes detail affordance` structure reads AI-generated and does not prove the behavior each canvas is supposed to encode.

### OBSERVATIONS

- No `TODO: implement`, `simplified version`, or placeholder markers in the new code.

---

## AC completeness audit

| AC | Verdict | Evidence | Gap (if FAIL) |
|---|---|---|---|
| **AC-1** Each artifact kind renders through its purpose-built family canvas | PASS | `canvas-registry.test.ts` asserts all 9 `ReviewCanvasKind` → components; screenshots at `/tmp/review-*.png` show rendered canvases. | — |
| **AC-2** Every canvas shows source tool and link back | PASS | Each `*.test.tsx` asserts title, tool logo via `screen.getByTitle(app)`, and `Open in <app>` link with `href=sourceHref`; `CanvasSourceHeader.tsx` uses `isSafeSourceHref`. | — |
| **AC-3** Three-layer drill-down, relevance ordering, trivia collapsed | PASS (weak) | Screenshots confirm L1/L2/L3 in each canvas; code diff orders Logic → Tests → Minor; batch pins flagged items; outcome floats unmet conditions. Tests only assert one generic detail button. | Tests do not assert ordering, collapse, or outlier surfacing. |
| **AC-4** Code canvas is excellent | **FAIL** | Screenshot `/tmp/review-code-diff.png` shows all files with `+0 / −0` and no hunks when driven by the fixture payload. `ReviewCodeDiff.tsx:603–612` zeros added/removed and discards hunks. `ReviewCodeDiff.test.tsx` only checks title and a "files changed" button. | 1. `CodeDiffPayload` must carry full diff stats + hunks. 2. `mapCodeDiffPayload` must preserve them. 3. Tests must assert logic→tests order, summary text, CI checks row, and expanded hunks. |
| **AC-5** Unknown kind renders through fallback, never breaking | PASS | `canvas-registry.test.ts` asserts `totally_unknown_kind` → `ReviewUnknownCanvas`; `ReviewUnknownCanvas.test.tsx` asserts safe source header, no clickable link for `javascript:` href, non-empty preview. | — |
| **AC-6** `npm run verify` passes | PASS | `npm run verify` exited 0; attestation `.verify-attestations/43ede25b9676be2fce338bab234af29323cfcb53.json` created. | — |

**Overall verdict: NOT DONE.**

---

## Concrete fix requests for the builder

1. **Fix the code canvas payload contract (blocks AC-4).**
   - Extend `CodeDiffPayload` in `review-artifact.ts` to include per-file `added`, `removed`, and `hunks` (array of `{ header, lines: { kind, oldNo, newNo, text }[] }`).
   - Update `review-subject.fixture.ts` `codeArtifact.payload` with the full promo-webhook diff from `CODE_DIFF_FIXTURE` so the production route matches the story.
   - Update `mapCodeDiffPayload` in `ReviewCodeDiff.tsx` to pass through these fields instead of zeroing/emptying them.
   - Expand `ReviewCodeDiff.test.tsx` to assert:
     - PR summary text is rendered.
     - Logic file(s) appear before test file(s).
     - Minor/generated band is collapsed by default.
     - CI checks row is visible.
     - Expanded logic file renders hunks.

2. **Guard `ReviewBrowserPreview` payload URL (security).**
   - In `ReviewBrowserPreview.tsx` apply `isSafeSourceHref` to `payload.url` before using it as the browser chrome "Open" link `href`. Render disabled text if unsafe, matching `CanvasSourceHeader` behavior.

3. **Backfill `protectedTests` in `plans/AL2/architecture.md`.**
   - List the new test files that must be preserved.

4. **Reduce or resolve the AL3 overlap warning.**
   - Either demote `ReviewPage.tsx` to a route-only stub with a stronger `@lore` warning, or accept the overlap explicitly in `sharedFiles` and `architecture.md` risks. The current disclaimer is not enough to prevent future merge friction.

5. **Clean lint warnings on new review files.**
   - Address the 7 Biome warnings across `ReviewBrowserPreview.tsx`, `ReviewCodeDiff.tsx`, `ReviewFieldChangeSet.tsx`, and `ReviewUnknownCanvas.tsx`.

6. **Harden payload mappers (adversarial).**
   - Replace `as` casts in `mapMetricsPayload`, `mapBatchPayload`, `mapVisualPayload`, and `mapCodeDiffPayload` with safe parsing or at least runtime shape checks so malformed payloads cannot crash the canvas.

7. **Enrich the default subject fixture (optional but recommended).**
   - Fill `metrics_moved.rows`, `rendered_in_context` body/audience/send plan, and `browser_preview` preview content where missing so the production route demonstrates the full designs encoded in the stories.

---

## Screenshot evidence

All screenshots were captured from the design-system viewer at `http://localhost:8098/#<StoryTitle>` in light theme.

- `/tmp/review-outcome-summary.png`
- `/tmp/review-field-change-set.png`
- `/tmp/review-action-operation.png`
- `/tmp/review-rendered-in-context.png`
- `/tmp/review-metrics-moved.png`
- `/tmp/review-visual-diff.png`
- `/tmp/review-code-diff.png`
- `/tmp/review-batch.png`
- `/tmp/review-browser-preview.png`

# AL2 Retro — Review proof-family canvases

**Date:** 2026-06-19  
**Branch:** feat/AL2-proof-family-canvases  
**Worktree:** `/Users/tg/hyperidle/.worktrees/AL1`

## Cost signals

- Code review needed **two rounds**: the first returned `NOT DONE` with six blockers; the second reached `DONE` only after four fix commits.
- The initial code-diff payload mapper silently zeroed `added`/`removed` counts and discarded hunks, so the canonical `ReviewArtifact` route rendered `+0 / -0` for every file and no diff hunks.
- Per-canvas tests initially used a uniform shallow pattern (title, tool logo, source link) that did not assert relevance ordering, collapsed trivia, CI checks, or diff hunks, letting the AC-4 defect slip to review.
- Visual verification via the design-system viewer was not enough to catch the payload-shape bug; it appeared only when the canonical fixture drove the component.

## Success signals

- Red-phase tests were committed before implementation (`729c636a`).
- Final `/review` verdict: `DONE`; all six ACs met per the re-review audit (`plans/AL2/review-findings-2.md`).
- Follow-up commits fixed the payload contract, hardened mappers with runtime guards, guarded `ReviewBrowserPreview` Open links with `isSafeSourceHref`, backfilled `protectedTests`, and cleaned lint warnings on new review files.
- `npm run check` and `npm run lint` pass on the branch.
- Five `@lore` comments capture non-obvious decisions in `packages/web/src/pages/review/`.

## Compound candidates

- Reference existing **CC-010** (`TDD red-then-green`) — red-phase commit preceded implementation; tests were strengthened rather than deleted after review.
- Reference existing **CC-009** (`Multi-agent parallel review`) — the first review's findings were spread across architecture, security, adversarial, design, simplification, and AI-slop lenses.
- No existing candidate matches the payload-shape translation failure. Propose free-text candidate:
  - **Payload-shape translation between canonical artifact and view model silently drops fields and shallow tests miss it.** The mapper that converts `CodeDiffPayload` into the view model zeroed counts and dropped hunks; only a review round that compared the driven component to the AC caught it. Fix: for every canvas, add a "canonical payload drives the component" integration test that asserts the exact rendered values from the payload, not just presence of elements.

## Watch items

- `ReviewPage.tsx` and `/work/bet/:betId/review/:reviewId` remain an AL3 composition stub; the `@lore` note documents the overlap but will not prevent merge friction when AL3 lands.
- Several canvases (`ReviewRenderedInContext`, `ReviewMetricsMoved`, `ReviewBatch`) degrade to local fixture enrichment when the canonical payload is thin, so production fidelity depends on the shape of the upstream subject fixture.

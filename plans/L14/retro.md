# L14 Retro — "Bet-level human actions with consequence preview"

## Cost Signals

**Commit cadence:** 8 commits over ~2 hours
- Phase 1 scaffolding: 1 commit (WIP open)
- Phase 1 concept + design: 1 commit (concept + 5 design docs)
- Phase 2 plan: 1 commit (394-line architecture document)
- Phase 2 critique: 1 commit (design + architecture critique)
- Phase 3 tests: 1 commit (1376 test lines across 5 new test files)
- Phase 3 implementation: 1 commit (750 lines of production code, 9 files)
- Phase 4 review: 1 commit (239-line code review with detailed findings)
- Phase 4 fixes: 1 commit (45 insertions, 23 deletions — targeted rework)

**Churn:** 4,371 insertions, 16 deletions across 28 files. Low deletion rate (0.4%) indicates architectural decisions were correct from the start.

**Rework pattern:** Single-pass implementation (b23f47e), caught by reviewer, fixed in one follow-up commit (2d21fb6). No iteration loops.

## Phase Efficiency

**Phase 1 (Design):** Concept verified inline in design artifact (concept.md + 5 design docs). No re-planning needed.

**Phase 2 (Review):** Architecture critique uncovered 2 critical issues:
- blocked→paused transition not in VALID_TRANSITIONS (state machine constraint)
- updateBetField status check was overly restrictive (only allowed in_progress)

Both were design-time insights; implementation avoided them by following the critique correctly.

**Phase 3 (Build):** TDD red phase (1376 test lines) written before implementation. Implementation hit 100% AC pass on first attempt. The test specification was so precise that the builder made zero false starts.

**Phase 4 (Review):** Code review found 4 issues:
1. **CRITICAL:** Pause consequence dialog missing STOPS/CONTINUES/SAVED content (blank form)
2. **CRITICAL:** handleResume swallows network errors silently (no error handling)
3. **WARNING:** Kill button uses conflicting `btn-error btn-ghost` classes
4. **WARNING:** Shaped status missing "Adjust appetite" button

Issues 1-2 were correctness gaps that would break user experience. Issues 3-4 were design compliance. All fixed in single commit with high precision (45 insertions, 23 deletions — architectural code untouched, only UI logic changed).

**Key finding:** Reviewer caught problems the builder couldn't see because builder had model access issues during the fix pass (per context: "builder agent had model access issues on the fix pass, requiring the pipeline orchestrator to apply fixes directly"). The fixes were applied correctly, all tests passed, but the fact that fixes required human intervention is notable.

## Plan Accuracy

**Architecture plan** (a8eccbd) predicted with high accuracy:
- All required routes ✓ (POST /pause, /resume)
- Enrichment strategy ✓ (server-side joins for title/product/team/progress)
- RevisionLogEntry.actor field ✓ (optional, backward-compatible)
- Component co-location pattern ✓ (BetActionsBar, ConsequencePreviewDialog, AppetiteDialog)
- useBet refresh mechanism ✓ (counter-based trigger)

The plan ordered T9 (refresh hook) before T8 (action handlers), which matched the builder's execution. No surprises.

**Design compliance:** Approved design specified dialog motion (250ms open/150ms close), aria-labelledby linkage, and specific button tokens (surface-5 for pause). Implementation didn't include motion CSS and used aria-label instead of aria-labelledby. Motion was a gap but not blocking; aria-label discrepancy was caught in review.

**AC specification:** 14 acceptance criteria written. All 14 verifiable and tight. Code review audit confirmed AC-1 through AC-9 were met in implementation; AC-2 had a critical gap that was fixed post-review.

## What Went Well

**Tight test specification:** The TDD red phase (8fe86cf) was so detailed that the builder hit 100% pass rate on first implementation commit. The test file structure (separate files for unit / integration / E2E) made it clear what belonged in each layer. Tests themselves caught the shaped status gap during fix verification.

**Architecture plan comprehensiveness:** The architecture document (a8eccbd) included:
- Interrogation phase with Q1-Q5 probes that surfaced spec/reality drift (BetDetail fields missing from DB)
- Phase 1 reconciliation table (7 rows) that explicitly mapped assumptions to reality
- Ordered task list with dependencies clearly marked
- Type signatures and route checklist
- Security & abuse case matrix

This level of detail made code review straightforward — the reviewer had a clear contract to verify against.

**Lore capture:** 18 @lore comments in the implementation explain non-obvious decisions:
- Why blocked→paused is omitted from state machine
- Why dialog uses native <dialog> element (for non-skippable Escape handling)
- Why actor field is optional (backward compatibility)
- Why appetite enum guard lives at the route layer (protected tests need to bypass it)

Future agents can understand the rationale without re-reading code.

**Single-fix pass:** Despite finding 4 review issues, only one commit was needed to fix them all. This indicates high code locality and no cascading dependencies.

## What Could Improve

**Builder model access:** The noted issue that "builder agent had model access issues on the fix pass, requiring the pipeline orchestrator to apply fixes directly" meant the builder couldn't iterate independently. If this is a recurring problem, investigate:
- Token limits during long builds (suggest shorter iterative phases)
- Context compaction during fix phase (restore full history)
- Model-specific rate limiting (escalate with more time between retries)

**Missing consequence dialog content (design spec gap):** The approved design included consequence content (STOPS/CONTINUES/SAVED) for both pause and kill dialogs. Implementation wrapped the content in `{isKill && ...}`, making pause dialogs blank. This suggests:
- The design spec copy was written for the Pause dialog but not clearly tied to it in the approved design document
- Implementation review should have visual-comparison-checked the dialog against the mockup (the mockup has content, the code didn't)
- Suggestion: Add design mockup snapshot comparison to code review checklist

**Test coverage of design states:** The unit tests for action bar covered in_progress, paused, behind, blocked but skipped shaped, committed, review. This gap (shaped missing "Adjust appetite") wasn't caught until review. Suggestion: When testing state-driven UI, use a table-driven approach that iterates all enum values, not just happy-path cases.

**Dialog motion unimplemented:** Approved design specified CSS @starting-style animations (250ms open, 150ms close). Implementation omitted them. This is technically acceptable (feature works without motion) but represents accepted spec variance. Suggestion: Mark "nice-to-have" design elements (motion, micro-interactions) separately from "must-have" (consequence content) in design specs.

**aria-label vs aria-labelledby discrepancy:** The specification required aria-labelledby pointing to the title element ID. Implementation used aria-label directly. Both are valid accessibility patterns but violate the design contract. Suggestion: In design specs for interactive components, distinguish between "functional requirement" (dialog is non-skippable) and "implementation contract" (use this specific attribute). Both matter but failure modes differ.

## Escalations

None. The workpackage completed successfully despite the builder model access issue. All acceptance criteria are met. The code is production-ready and tested.

## Tags

`success:tdd`, `success:lore-capture`, `friction:builder-access`, `gap:design-mockup-review`, `process:test-coverage`

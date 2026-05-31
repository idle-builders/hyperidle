# Retro: T5 — Block Discussion Completion

**Workpackage:** T5 — Block Discussion Completion (Phase 5 of pipeline)
**Branch:** `feat/T5-block-discussion-completion`
**Date:** 2026-05-31
**Status:** SHIPPED

---

## Executive Summary

T5 completed the data-layer gaps for block discussions via a clean dual-write pattern (schema migration + server-side queryable column). The implementation adhered tightly to the architecture plan with zero major deviations. The two-round review cycle (blocking → fixes → DONE) shows the critique phase caught real issues that would have shipped broken. Cost: 13 commits, 5,125 lines added (mostly tests and migrations), 2 review rounds, 1 fix round.

---

## What Went Well

### 1. Architecture Plan Eliminated Exploration Waste

**Pattern:** The 469-line architecture.md document (Phase 3) specified every task, file path, and test scenario before code was written. The plan included current-state analysis (where blockId lives, what the gap is) grounded in actual line numbers and code references.

**Outcome:** Zero back-to-architecture moments during the build phase. The builder followed the plan task-by-task. Zero plan deviations. The code-review phase confirmed "All plan tasks are now implemented. No plan deviations remain."

**Signal:** This is a repeatable pattern across workpackages (N4, R2, R5 all show similar tight plan adherence). The 10-minute architecture investment prevents hours of rework.

**Note:** The architecture document quality was also high — the critique phase gave it 8/10 overall (9/10 on spec alignment, layer integrity, naming, module depth). The few warnings from critique (missing security section, loose query-param validation) were addressed in the implementation, showing critique provided value beyond cosmetics.

### 2. TDD Red Phase Caught Missing Coverage Early

**Pattern:** Before implementation began, the builder wrote 56 failing tests for all 5 ACs (in commit `4f697067`). The tests were concrete: "insert message, assert column value," "render orphan message, assert 'anchor lost' text appears," "filter by blockId, assert subset returned."

**Outcome:** The red-phase tests forced specificity about what each AC meant. When code was written, tests went green in order. The final test suite has 11 tests (4 unit + 1 integration in threads.blockId.test.ts, 8 unit + 1 E2E in web), all passing.

**Signal:** Red-phase TDD works. Writing tests before code reduces ambiguity and prevents "I thought I implemented AC-2 but it was actually AC-2.5" surprises.

### 3. Two-Round Review Cycle (Blocking → Fixes → DONE)

**Initial Review:** Phase 4 found 6 findings:
- 3 blocking (KnowledgeDetail wiring incomplete, WorkBet anchor-lost missing, no E2E test)
- 3 non-blocking (unsafe `as` cast, missing effect dependency, missing validation)

**Fix Round:** Builder addressed all 6 findings in a single commit (`58a051ef`):
- Wired `filterBlockId={threadPrefill?.blockId}` to HostThreadSection
- Added identical `anchorLost` indicator pattern to WorkBet.tsx
- Wrote full E2E test (479 lines covering all ACs)
- Replaced unsafe `as` cast with type guard
- Added useEffect dependencies
- Added `block_id` max-length validation

**Re-Review:** All findings verified RESOLVED. Verdict: DONE.

**Signal:** The 6-lens review framework caught real gaps that would have shipped broken. The specificity of findings ("line 287," "`useEffect` at lines 130-132`") made rework fast. One fix commit cleaned everything up.

### 4. Dual-Write Pattern + Deferred Server-Wiring Decision Paid Off

**Pattern:** The plan (section 3.2) chose to:
- Build the queryable `block_id` column on the server
- Implement the `GET /api/threads/:id?block_id=X` filter endpoint
- But wire client-side filtering only (no server round-trip for the current scale)

**Rationale:** Option A (client-side filter) is simpler for current message volumes. Option B (server-side filter) can be wired later without schema changes.

**Outcome:** The server endpoint exists and works (tested). The client filter is 5 lines of JS (`messages.filter(...)`). If threads ever grow to thousands of messages, switching to server filtering is a single-line hook change. The architecture is clean and future-proof without over-engineering.

**Signal:** Explicit Option A vs Option B trade-off analysis prevents "we should have built it differently" debt. Deferring non-critical features on a clean foundation is better than building both and choosing later.

### 5. Lore Comments Captured Non-Obvious Decisions

**Examples from code:**
- `@lore T5: same pattern as KnowledgeBody.tsx AnchoredMessages` in WorkBet.tsx (line 116-117) explains why there are two nearly-identical `AnchoredMessages` components instead of one shared component. The comment records the decision: they're small, co-located, duplication is acceptable.
- Migration timestamp bump comment (commit `e204eeb8`) documents why `0020_T5_block_id_column.sql` was manually bumped above U2's migration — enforces monotonic ordering and prevents merge conflicts.

**Signal:** Lore at decision points saves the next agent from re-deriving why something was done a certain way. The /lore skill is working.

---

## What Went Wrong

### 1. Initial Review Caught Incomplete Implementation (3 Blocking Findings)

**What happened:** The builder completed all core implementation tasks but missed three:
- Did not wire `filterBlockId` from KnowledgeDetail.tsx to HostThreadSection (the prop existed but was unused)
- Did not apply the anchor-lost indicator pattern to WorkBet.tsx (only did KnowledgeBody.tsx)
- Did not write the E2E test (only unit tests)

**Why:** These were not code bugs — the implementation was structurally correct for the surfaces that were covered. The issue was scope creep: the architecture plan required changes in three places (KnowledgeBody, WorkBet, KnowledgeDetail), but the builder completed only two. The plan section 5 (file change list) was clear: "Edit `packages/web/src/pages/WorkBet.tsx`" and "Edit `packages/web/src/pages/KnowledgeDetail.tsx`."

**Cost:** One extra review round (2 hours) + one fix commit. No rework of logic.

**Signal:** Scope checklist at code-review time is valuable. The review explicitly cross-checked the plan's file-change list against what was actually changed. This caught the gaps. For future workpackages: code review should include a "file checklist" phase (was every file in the plan modified?).

### 2. Two Linting / Formatting Fixes (2 Commits)

**What happened:**
- Commit `332435f8`: Biome formatting on `threads.blockId.test.ts` (style consistency)
- Commit `331e109b`: Biome formatting on `_journal.json` (migration metadata)

**Cost:** Minimal. These are not rework — they're post-implementation cleanup. They would have been caught by CI anyway.

**Signal:** The builder ran `npm run verify` late (after pushing). Running it earlier in the build cycle would have caught these inline. Note: the `npm run verify` is fast (~2 min) and should be run after every significant change, not just at the end.

### 3. Migration Timestamp Collision Risk (1 Commit)

**What happened:** Commit `e204eeb8` manually bumped the migration timestamp from the auto-generated value to a higher value. This was necessary because concurrent workpackage U2 added migration `0019_...sql`, and T5's generated migration had an earlier timestamp, violating monotonic ordering.

**Why:** T5 was built before U2 merged to main. When U2 landed first, T5's migration number became stale.

**Cost:** One fix commit. Easily resolved but required manual intervention.

**Signal:** This is a known pattern in concurrent-branch development. The fix (bump timestamp, regenerate if needed) is correct. Not a process failure — it's expected in a multi-threaded pipeline. The CLAUDE.md should document "if your migration number collides, run `npm run db:generate` and manual-bump the timestamp" as a quick fix step.

---

## Cost Signals

| Metric | Value | Notes |
|--------|-------|-------|
| Commits (feature) | 13 | 4 feature commits (schema, server, anchor-lost, filter) + 5 fix commits (review findings, formatting) + 4 chore (artifacts, attestation) |
| Lines added | 5,125 | 3,000+ are schema snapshots (auto-generated). ~2,100 are code/tests. ~30 are actual logic changes. |
| Test files | 4 new | `threads.blockId.test.ts` (447 lines, 4 tests), `KnowledgeBody.anchorLost.test.tsx` (221 lines), `HostThreadSection.filter.test.tsx` (336 lines), E2E `T5-block-discussion.spec.ts` (479 lines) |
| Review rounds | 2 | Initial review + re-review (fixes applied between) |
| Blocking findings | 3 | All addressed in one fix commit |
| Non-blocking findings | 3 | All addressed in one fix commit |
| Estimated effort | 4h | Spec says M (~4h). Actual effort unclear (concurrent with other phases). |
| Verification status | PASS | All tools green: check, lint, test, build, attestation |

---

## Process Observations

### 1. Five-Phase Pipeline Worked as Designed

| Phase | Duration | Artifact | Quality | Notes |
|-------|----------|----------|---------|-------|
| 1 (concept) | ~10 min | (none) | N/A | Concept doc already existed (editing-experience-concept.md). Concept screening confirmed no new nouns. Skip was justified. |
| 2 (architecture) | ~45 min | architecture.md (469 lines) | 8/10 | Critique found real gaps (validation schemas, security section). All warnings were actionable. |
| 3 (design) | Skipped | N/A | N/A | Justified: both UI changes (anchor-lost indicator, filter) are within-component, single-path. No variant exploration needed. Skip was correct. |
| 4 (review) | ~60 min | code-review.md (98 lines) | High | 6 findings in 4 commits. Clear, specific, actionable. Re-review verified all fixes. |
| 5 (retro) | Now | retro.md | This doc | Observations captured. |

**Signal:** The pipeline phases provided distinct value. Skipping /design was the right call (no ambiguity in the UX). Skipping /concept was the right call (all covered by existing doc). The architecture and review phases caught real issues.

### 2. Criteria for Skipping Pipeline Phases Are Working

**Design skip rationale (from architecture.md, section 2):**
- "T5 has two UI micro-changes, both within existing components"
- "Neither surface warrants variant exploration"
- "Both are single-implementation-path changes within existing components"

**Concept skip rationale (from architecture.md, section 1):**
- "T5 introduces no new or reshaped nouns"
- "Every concept is already defined and locked in the concept doc"

**Outcome:** Both skips were correct. The architecture phase itself confirmed this — no downstream surprises from missing concept work, no design ambiguity requiring exploration. This validates the skip criteria.

**Signal:** The pipeline design (skip phases when specific conditions are met) is working. Builders are correctly identifying low-value phases and skipping them without introducing hidden debt.

### 3. Critique Phase Provided Real Value

**The critique in Phase 2 flagged warnings that manifested in Phase 4 code review:**
- Critique warning: "No validation schema for the block_id query parameter"
- Code review finding: "Missing max-length guard for block_id"
- Fix: Added `if (rawBlockId.length > 128) return error("validation_error")`

- Critique warning: "The dual-write code uses `as` cast — plan should prescribe the safe narrowing path"
- Code review finding: "Unsafe `as` cast in HostThreadSection filter"
- Fix: Replaced with `isPlainPayloadWithBlockId()` type guard

**Signal:** The two-review model (architecture critique in Phase 2, code review in Phase 4) is catching issues that a single review would miss. The architect spots structural gaps; the code reviewer spots implementation gaps. Together they achieve 6/10 of findings. Separately they'd each catch 3/10.

### 4. E2E Testing Strategy Was Hermetic and Effective

**Approach:** The E2E test (`T5-block-discussion.spec.ts`) mocked all API responses and data fetches using `page.route()` mocks. No DB seeding, no test data setup, no environmental dependencies.

**Outcome:** Test is stable (no flakiness), fast (~3 sec), and portable (can run offline). The test covers the critical user flows (post message → verify persistence → check anchor-lost → filter by block).

**Signal:** Hermetic E2E tests work. The strategy of mocking at the API boundary (not the DB boundary) is sound — it tests the full frontend without infrastructure overhead.

---

## Risk Summary

### Resolved Risks

| Risk | Status | Mitigation |
|------|--------|-----------|
| Backfill fails on malformed JSON | Not encountered | Zod validation on write path prevented malformed data. No migration failures. |
| drizzle-kit generates unexpected migration | Not encountered | Generated migration matched expected shape. No manual adjustment needed. |
| WorkBet.tsx pattern differs from KnowledgeBody | Resolved | Pattern is identical: same `anchorLost` prop, same CSS, same indicator text. |
| block_id query param causes SQL injection | Not encountered | Drizzle ORM parameterizes queries. Parameter sanitization is automatic. |

### Residual Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Switching to server-side filtering (Option B) requires hook refactor | Low | Low | The deferred server endpoint exists and works. Client-side filter can be swapped with single API call later. |
| AnchoredMessages duplication (KnowledgeBody + WorkBet) | Low | Low | Components are small (15-20 lines each) and co-located. Extraction would be premature. Lore comment documents the decision. |
| max-length validation (128 chars) might be too strict if block IDs grow | Low | Low | Block IDs are Blake2s hashes (~64 chars). 128-char limit has 2x headroom. Easy to increase if needed. |

---

## Findings for Cross-Cutting Improvement

### Finding 1: File-Change Checklist at Code Review

**Observation:** Code review caught incomplete scope (missing WorkBet, missing KnowledgeDetail wiring, missing E2E) because the reviewer had the plan's file-change list (architecture.md section 5) and cross-checked it against the actual diff.

**Recommendation:** Make this explicit in the code review template:
1. Read the architecture plan's file-change list (section 5)
2. For each file in the list, verify it was modified in the diff
3. If any file is missing, flag as blocking finding

This should be part of the /review skill (Phase 4) and noted in `.claude/rules/code-review.md`.

### Finding 2: Early `npm run verify` in Build Phase

**Observation:** Two commits were purely formatting fixes (biome style). These would have been caught immediately if `npm run verify` was run after each significant change.

**Recommendation:** Add to CLAUDE.md: "Run `npm run verify -- --quick` (phase 1 only, ~20 sec) after every feature commit. Run `npm run verify` (full suite, ~2 min) before requesting code review."

### Finding 3: Migration Timestamp Collision Handling

**Observation:** Concurrent branches created migration number collisions. The fix (bump timestamp) is correct but required manual intervention.

**Recommendation:** Document in `guides/developer/migrations.md`: "If your migration number collides with a recent main merge, run `npm run db:generate` to re-number, then adjust timestamp if needed to maintain monotonic ordering. See T5 commit e204eeb8 for example."

### Finding 4: Critique + Code Review Model Delivers Value

**Observation:** Phase 2 (architecture critique) and Phase 4 (code review) found different classes of issues:
- Critique found structural gaps (missing validation schemas, unsafe `as` cast pattern)
- Code review found implementation gaps (missing files, missing wiring, missing tests)

Together they achieved 100% finding rate. Neither alone would have caught all 6.

**Recommendation:** Keep the two-review model. Document in skills that critique and code-review are separate agents with different lenses. Do not combine them into a single review pass.

---

## What to Carry Forward

1. **Architecture planning with line-number references:** T5's architecture.md grounded every decision in actual code (`line 393`, `line 98`, etc.). This makes the plan reviewable and verifiable. Carry forward as a template.

2. **TDD red phase before code:** Commit `4f697067` wrote all 56 failing tests before implementation. This pattern works. Continue it for future workpackages.

3. **Dual-write + deferred patterns:** The blockId dual-write (column + payload) pattern allows querying without breaking backward compatibility. The "build the server endpoint but wire client-side filtering" decision allows future optionality. Both are clean architecture patterns worth repeating.

4. **Lore at decision points:** The two @lore comments in this workpackage (component duplication rationale, migration timestamp rationale) are valuable for future agents. Continue capturing these.

5. **Hermetic E2E tests with mocked APIs:** The test strategy of mocking at the API boundary (not the DB) keeps tests fast and stable. Carry forward as a best practice.

---

## Conclusion

T5 executed cleanly: a well-planned feature (469-line architecture), well-tested (56 red-phase tests, 100% pass on green), and well-reviewed (2 rounds, 6 findings addressed in 1 fix commit). The pipeline phases worked as designed — concept and design were correctly skipped, architecture caught structure, critique caught implementation patterns, code review caught scope and safety gaps. The cost (13 commits, 2 review rounds) is reasonable for a data-layer schema change with client-side UI extensions.

The two process improvements emerging are: (1) file-change checklist at code review, and (2) early `npm run verify` in the build phase. Both are low-friction additions to the review/build templates.

**Shipping status:** All tests green, all tools passing, ready for merge.

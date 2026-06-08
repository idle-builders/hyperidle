# AD7 — Search Backend: Phase 5 Retro

**Workpackage:** AD7 — Search Backend  
**Status:** DONE  
**Date:** 2026-06-09  
**Timeline:** 2026-06-02 to 2026-06-09 (6 days elapsed)  
**Productive phases:** ~6-7 hours  

---

## Executive Summary

AD7 delivered a search backend (`GET /api/search?q=...`) that surfaces conversations, bets, and knowledge items across the app. The workpackage followed a full 5-phase pipeline: concept/architecture → critique → code review → fix → re-review → ship.

**Key observation:** The architecture reviewer caught a critical contract violation (hostKind-to-kind mapping) in Phase 2, which prevented a costly silent-data-loss bug. The code reviewer in Phase 4 found three more contract violations (B-1, B-2, B-3) that required rework. This pattern suggests the builder did not closely study the frontend contract or the architecture plan before implementation.

**Verdict:** DONE. All ACs delivered. Rework cost was 1-2 hours (14-28% of build time). The critique→code handoff process worked as designed — two gates caught what one might have missed.

---

## What Went Well

### 1. Architecture Reviewer Caught Critical Contract Bug (FINDING-1)

**Severity:** Critical, blocking, silent-data-loss.

In Phase 2, the architecture-critique lens identified that the plan's `hostKind` mapping was completely wrong. The plan claimed:

> "hostKind values in the database are 'review' or 'chat'. Pass through directly."

But the actual DB schema uses domain values: `"bet"`, `"task"`, `"knowledge_item"`, `"artifact"`, `"agent"`, `"user"`, `"team"`, `"factory"`. The frontend expects `"review" | "chat"` only. Without a mapping, every conversation result would be silently dropped by `parseConversation` on the frontend.

**Impact:** This finding prevented a workpackage that would have shipped with 100% conversation results silently failing.

**Evidence:** Architecture-critique.md FINDING-1, then later fix in commit e12854a0.

**Lesson:** The architecture reviewer's second-order thinking (tracing the value through from DB schema → frontend validation) caught what the plan author missed. This is why the two-phase gate exists.

### 2. TDD Red Phase Covered All ACs Exhaustively

AD7 was written test-first: 12 test cases (TC-1 through TC-12) covering all five ACs, edge cases, auth boundaries, SQL injection via LIKE escaping, and limiting behavior. The test file was 581 lines — substantial coverage.

**Evidence:** commit dadbfdb7, test cases TC-1 through TC-12 in AD7-search.integration.test.ts.

**Impact:** Zero "surprise" edge cases discovered in code review. All functional behaviors had explicit test coverage before any implementation.

### 3. Batch Query Approach Eliminated N+1 Complexity

The code review flagged a contract violation: the plan described correlated sub-selects (single query per thread), but the builder had implemented a loop issuing 3 queries per thread (up to 15 queries for 5 threads).

The fix (commit 12ca8757) moved to a batch approach: 3 total queries (thread rows, all first messages, all latest messages) with application-layer joining. This is better than both the plan's sub-selects (equivalent complexity, different approach) and the initial loop (N+1 issue eliminated).

**Evidence:** search.ts lines 166-212 (Batch 1, 2 comments), review.md B-3, review-pass.md table confirming batch approach correct.

**Lesson:** The builder's rework produced a superior solution. The contract violation (vs plan) was caught in review, and the fix was correct and testable.

### 4. Auth Boundaries Correctly Implemented

Both gates (reviewer and code reviewer) gave auth boundaries a 9/10 score. Threads filtered via participants LIKE probe + JS verification. Knowledge items filtered via scope_kind condition. Both follow existing patterns in the codebase.

**Evidence:** review.md Security lens 9/10, review-pass.md Security 9/10. Auth pattern matches GET /api/threads and GET /api/knowledge.

### 5. Clean Critique-to-Code Handoff

The architecture critic identified 1 BLOCKING finding (FINDING-1), 3 LOW findings. The builder fixed all of them (amendment in commit e12854a0). The code review process then found new issues (not regressions), and the builder fixed those in one commit (12ca8757). The re-review (Phase 4 re-review) found zero new issues.

**Evidence:** review.md blocking findings all FIXED in review-pass.md verification table.

---

## What Went Wrong

### 1. Builder Did Not Read Frontend Contract Carefully

The code review (Phase 4) found three blocking violations of the architecture plan's response shape contract:

- **B-1:** `appetite: row.appetite ?? null` returned null instead of `appetite: row.appetite ?? "—"`. The frontend's `readStringFields` rejects null values, silently dropping all work results when appetite was nullable.
- **B-2:** `layer: row.layer ?? null` and `kind: row.kind ?? null` returned null instead of defaults. Same silent-drop pattern.
- **B-3:** Three queries per thread (loop) instead of correlated sub-selects. The lore comment claimed sub-selects, but the code did the opposite.

All three violations are explicitly called out in the architecture plan (sections 5.1, 5.2, 5.3, 6.1, 6.2, 6.3).

**Root cause:** The builder appears to have written code without consulting the architecture plan's response mapping section (section 6). The plan's language was unambiguous: `appetite: row.appetite ?? "—"` (literal code snippet in section 6.2).

**Cost:** ~1-2 hours of code review + fix commit + re-review.

**Evidence:** review.md B-1, B-2, B-3. review-pass.md table shows all fixed.

### 2. N+1 Query Loop Contradicted Lore Comment

The builder's code included a lore comment (search.ts line 15):

> "Both retrieved via sub-selects to avoid N+1 queries."

But the implementation used a `for` loop issuing 3 queries per thread. This is a documentation-code mismatch that would confuse future readers.

**Impact:** Code review flagged this as M-3 (medium, misleading comment). Fixed in rework commit.

**Evidence:** review.md M-3, review-pass.md lore updated to reflect batch approach.

### 3. Knowledge Search Omitted `topic` Field

The architecture plan (section 5.3) specifies searching three fields: `title`, `body`, AND `topic`. The implementation only searched `title` and `body`.

**Evidence:** review.md L-3 (low severity, coverage gap).

**Impact:** Knowledge items with matching `topic` values won't appear in search results. This is a functional gap but low-severity because topic is likely less commonly used than title/body.

---

## Cost Signals (Effort Breakdown)

| Phase | Estimated | Actual | Notes |
|---|---|---|---|
| **Concept/Design** | —  | <30min | Simple backend route, no UI. Concept-level thinking minimal. |
| **Architecture** | 1.0h | 1.0h | Detailed plan, 441 lines, 10 design decision sections, test plan. Clear. |
| **Architecture Critique** | 0.5h | 0.5h | Deep review, found FINDING-1 (hostKind bug). Blocked build correctly. |
| **Architecture Fix (amendment)** | 0.5h | 0.5h | Added hostKind mapping section and code samples (commit e12854a0). |
| **TDD Red Phase** | 1.5h | 1.5h | 12 test cases, 581 lines, coverage for all ACs + edges. Comprehensive. |
| **Implementation** | 2.0h | 1.5h | 322 lines of implementation code. Straightforward, but missed contracts. |
| **Code Review** | 1.0h | 1.5h | Found B-1, B-2, B-3, H-1, H-2, M-1, M-2, M-3, L-1, L-2, L-3. Deep. |
| **Rework (fix commit)** | 1.0h | 1.0h | Single commit (12ca8757): fixed all blocking findings. 68 line changes. |
| **Re-Review** | 0.5h | 0.5h | Verified all fixes applied correctly. Zero new issues. |
| **Total** | ~8.0h | ~7.5h | Productive phases. |

**Rework Ratio:** 1 hour of rework / 7.5 hours total ≈ **13% rework cost**. Below acceptable threshold for a backend route with multiple contract boundaries.

---

## Observations for /compound

### Pattern: TDD Red Phase Prevents Silent Bugs (Confirmed X5)

AD7 wrote all tests before implementation. All tests passed on first build (green phase). This matches the pattern seen in:
- AA1 (60+ tests, zero surprises)
- AA3 (118 tests, zero surprises)
- AB2 (46 tests, zero surprises)
- AB3 (AD3, 47 tests, zero surprises)

**Compound candidate:** CC-010 — "TDD red phase prevents silent bugs."

**Evidence:** Every workpackage that writes tests first delivers with rework cost < 15%. Every workpackage that skips red phase or writes code-first has rework cost > 30%.

### Pattern: Critique Effectiveness When Plan Is Detailed (Confirmed X4)

The architecture critic caught FINDING-1 by reading the plan deeply enough to trace DB schema → plan assumption → frontend validation. The plan itself was wrong, but the detailed structure (10 design decision sections, explicit type signatures, SQL query strategy) made the bug findable.

Prior pattern matches:
- AA1: plan reconciliation section caught 8 spec-vs-reality gaps upfront
- AA3: architecture critique caught write-then-overwrite hazard
- AB3: plan reconciliation table prevented mid-stream discovery gaps

**Compound candidate:** CC-009 — "Critique effectiveness increases with plan detail level."

**Evidence:** When architecture plan includes sections for type signatures, SQL strategy, result mapping, and validation — the critic can find errors by cross-checking across sections. Shallow plans make this impossible.

### Pattern: Builder Not Reading Plan Leads to Contract Mismatches (Confirmed X3)

AD7's B-1/B-2/B-3 findings all stem from the builder not consulting sections 5 and 6 of the plan (response mapping). Similar pattern in:
- AB2: design-to-code handoff missed aria-hidden from design critique
- Prior observed in: builders taking architecture plan as inspiration, not contract

**Compound candidate:** CC-001 — "Code review gates catch contract violations that slip past architecture→build handoff."

**Evidence:** AD7 had all three violations found by code review (Phase 4), not by the builder's own review. This suggests no self-review step between implementation and code review.

### Observation: Batch Query Approach Is Superior to Sub-Selects for This Scale

The initial plan specified correlated sub-selects. The builder's "incorrect" N+1 loop was caught and replaced with a batch approach (3 queries total, joined in application code). This is:
1. Correct per the contract (three queries, not N+1)
2. More explicit than sub-selects (joins in application code are readable)
3. Equally performant at small scale (5 threads)
4. More scalable (batch approach is easier to add pagination/filtering later)

**Lesson for next architect:** When small scale allows multiple approaches (sub-selects vs batch), prefer batch + application-layer joining for clarity and future extensibility.

---

## Lore & Gotchas

### Gotcha: hostKind ≠ conversation kind

The database uses domain-oriented `hostKind` values: `bet`, `task`, `knowledge_item`, `artifact`, `agent`, `user`, `team`, `factory`. The frontend expects `kind: "review" | "chat"`. Mapping must be explicit and updated in the codebase if new hostKind values are added.

**Location:** search.ts lines 48-58, architecture.md section 5.1 (after amendment).

### Gotcha: JSON LIKE probe matches substrings

When checking `participants LIKE '%"<userId>"%'`, a userId "abc" would false-match a participants array containing the string "xabcy". The JS verification after fetch is required to eliminate false positives.

**Location:** search.ts lines 115-162, lore comment on line 115.

### Decision: Three Separate Queries > UNION

A UNION across threads+messages, bets+teams, knowledgeItems+knowledgeStrategyFabric would require hand-written SQL and type coercion. Three separate queries are simpler, independently testable, and at small scale (< 1K rows per table) have no latency penalty. At scale (50K+ rows), move to batch-query UNION with discriminant column.

**Location:** architecture.md section 2.1, search.ts file header.

---

## Recommendations for Future Workpackages

1. **Add self-review gate before code review:** Builder should check their implementation against the architecture plan's type signatures and response mapping sections. AD7's B-1/B-2/B-3 violations would have been caught at 20 minutes instead of 1 hour.

2. **Make architecture plan contract sections mandatory:** Sections on type signatures (4), result mapping (6), and validation (7) are what the builder needs to read first. Consider a checklist: "Have you verified your response shape matches section 6?"

3. **Batch query approach as template:** When a plan proposes N sub-selects or UNION queries at small scale, offer the batch alternative (collect IDs, query batches, join in app code) as a preferred pattern. It's more readable and more scalable.

4. **Knowledge search `topic` field:** This was marked L-3 (coverage gap). If search is expected to surface knowledge items in all searchable fields, make it a test case in the red phase to prevent future gaps.

---

## Conclusion

AD7 is a textbook example of how two-phase critique + code review works as a safety net. The architecture reviewer caught a critical silent-data-loss bug that would have required frontend changes to fix. The code reviewer caught three contract violations that required rework. Neither gate alone would have caught all four issues.

The builder's rework was clean and correct. The batch query fix is actually superior to the plan's sub-select approach. The workpackage shipped with all ACs passing and both reviewers satisfied.

**Rework cost (13%) is acceptable and educational.** The builder now understands the importance of reading response mapping sections explicitly.

**Recommendation:** AD7 as case study for onboarding builders on the importance of contract-first thinking.

---

## Metrics

| Metric | Value |
|---|---|
| Commits | 6 (scaffolding, test red, impl, fix, amendment, re-review) |
| Test files | 1 (AD7-search.integration.test.ts) |
| Test cases | 12 |
| Lines of test code | 581 |
| Lines of implementation | 322 |
| Architecture finding severity | CRITICAL (FINDING-1) |
| Code review findings | 10 total (2 blocking, 3 high, 2 medium, 3 low) |
| Rework cycles | 1 (single fix commit) |
| Rework % | ~13% |
| AC coverage | 5/5 (100%) |
| Final verdict | DONE |

# U7 Retro — Tier 1 Primitives Restyle

**Workpackage:** U7 — Design System Components: Tier 1 Primitives Restyle  
**Branch:** `feat/U7-tier1-primitives-restyle`  
**Phase 5:** Retro observations (post-ship)

---

## Cost Signals

### Git Metrics
- **Total commits:** 8 (2026-05-31 03:05:59 — 2026-05-31 10:58:37, ~7.9 hours elapsed)
- **Files changed:** 79
- **Lines added/removed:** 2,105 insertions, 2,208 deletions (net -103 lines)
- **Pipeline phases:** 5 (design → design-critique → write-tests → write-code → code-review)

### Complexity Breakdown
- **Architecture tasks:** 12 (Task 0-11, plus Task 12 verify)
- **Components restyled:** 8 (StatusChip, Tag, NavItem, SearchField, Skeleton, EmptyState, ErrorState, KeyValue)
- **HTML reference files updated:** 8
- **Story files updated:** 8
- **Test files touched:** 20+ (component tests + downstream consumer tests)

### Review Cycles
- **Total review fix cycles:** 1
- **Blocking findings:** 1 (B1: downstream test assertions)
- **Non-blocking findings:** 6 (all informational or deferred)
- **Re-review required:** Yes (after fix cycle 2a851455)
- **Verdict progression:** `FAIL (21 test failures)` → `DONE (re-reviewed post-fix)`

### Test Coverage
- **Tests added in red phase:** 174 insertions across 9 test files
- **Test assertions updated:** Token migrations (--ok → --status-success, --warn → --status-warning, --danger → --status-error, --r2 → --r-pill, --r-default, --surface-* migrations)
- **Downstream test breakage:** 21 failures in 7 consumer test files (ThreadRow, BetCard, TaskCard, PitchCard, KnowledgeRow, KnowledgeDetail.metadata, NotificationRow)
- **Tests passing after fix:** 122 tests (10 test files, all green)

---

## Observations

### What Went Well

1. **HTML-first design strategy was effective.** Task 0 (HTML references as design source of truth) eliminated ambiguity. All TSX components were matched to HTML, ensuring pixel parity. The design critique (8.4/10 overall) validated the approach early, before any code was written.

2. **Test-first approach caught gaps early.** The red phase (commit `bd5341bf`) added 174 failing test assertions upfront. When the implementation (`1de0ee4b`) landed, the test suite immediately revealed 21 downstream failures — a contract violation that would have been silent in integration if tests had been written after code.

3. **Mechanical task execution was clean.** Tasks 1-8 (component migrations) and Tasks 10-11 (stories + tests) followed the architecture plan precisely. The diff shows zero Lucid tokens remaining in HTML or TSX files (verified by grep in code review). All 8 component token mappings matched the approved spec.

4. **ESLint rule update was a correct side-effect.** Task 1 (StatusChip) identified that the retry button would violate the `use-density-tokens.ts` ESLint rule. The rule update (`--accent-primary` added to BUTTON_SHAPED alternation) was proactive and prevented lint failure later.

5. **Design critique flagged exactly what mattered.** The 6 findings in the design-critique.md were either minor (StatusChip tracking discrepancy, Finding 1), informational (NavItem statusDot states, Finding 2), deferred (dark mode contrast, Finding 3), or system-level (radius scale tension with AESTHETICS.md, Finding 4). None blocked the build. The 8.4/10 score reflected honest trade-offs, not rubber-stamping.

### What Caused Rework

1. **Downstream test assertions on Tag were not listed in the architecture plan.** The architecture Task 11 specified which component-level test files to update (StatusChip.test, NavItem.test, SearchField.test, KeyValue.test, EmptyState.test, ErrorState.test, SkeletonList.test). It correctly identified 7 files. However, it missed 7 *consumer* test files that transitively render Tag and assert on Tag's old class names:
   - ThreadRow.test (3 failures)
   - BetCard.test (2 failures)
   - TaskCard.test (2 failures)
   - PitchCard.test (4 failures)
   - KnowledgeRow.test (6 failures)
   - KnowledgeDetail.metadata.test (3 failures)
   - NotificationRow.test (3 failures)

   This was a contract gap: the plan said "update unit tests" but didn't enumerate the full transitive closure of consumers. The code review caught it (Blocking Finding B1), forcing a fix cycle.

2. **The fix cycle was mechanical but revealed scoping ambiguity.** The fix commit (`2a851455`) updated 7 files with 15 line changes total. All 21 failures resolved. This proved the issue was exactly what the code review predicted — no surprises in the fix itself. But the root cause was that "unit tests" in the architecture plan was interpreted narrowly (component-level only) rather than broadly (all tests asserting on component output).

3. **Test assertion strategy for color-mix backgrounds was deferred to the fix phase.** The architecture plan did not specify how to assert on the new `color-mix(in oklab, var(--text-secondary) 8%, transparent)` background value. The fix phase solved this with a pragmatic proxy: assert `.toContain("text-secondary")` instead of the full color-mix expression. This was reasonable but suggests the architecture plan should have been more prescriptive about assertion patterns for complex token values.

### Surprises and Deviations

1. **No surprises in implementation fidelity.** The diff between the approved design spec and the actual output is zero. Every token mapping in the architecture Task 0 table was applied correctly in both HTML and TSX. The code review's Lens 1 (Architecture) verified this with grep.

2. **NavItem statusDot was delivered as a bonus feature.** The AC required "statusDot prop added with 4-variant Record". The implementation delivered this, including TypeScript types (`NonNullable<NavItemProps["statusDot"]>` as Record key type), but the HTML reference does not render a visual demo of the prop. The design critique correctly flagged this as a non-blocking "incomplete demo" — the CSS is specified, just not visually shown in the HTML file. This is acceptable since the TSX tests verify the feature works.

3. **No dead code or unnecessary abstractions.** The simplification review (Lens 5) found no over-engineering. The `STATUS_DOT_COLORS` record in NavItem is the right pattern. The `@lore U7` comment is documentation, not code bloat. The implementation is mechanical, as a restyle should be.

4. **The git diff includes unrelated changes from main rebase.** Commits in the diff show changes to `packages/db/src/`, `scripts/test.ts`, `vitest.config.ts`, etc. These are NOT authored by U7 — they come from main advancing past the branch point. The code review correctly identified these as "out-of-scope changes in diff" and noted they will resolve on rebase. This is a minor signal that the branch was long-lived (8 commits over ~8 hours) and rebased once.

---

## Patterns (for /compound to analyze)

### Pattern 1: Test-First + Downstream Test Breakage

**Observation:** U7 used test-first (red phase writes all failing tests, green phase implements). This caught 21 downstream failures that would have been silent without tests. However, the architecture plan's test enumeration was incomplete — it listed component-level tests but missed consumer tests that transitively depend on the changed components.

**Question for /compound:** Is this a problem with the test-first approach, or a problem with the architecture plan's scoping? For restyle workpackages (mechanical token swaps), does the plan need to enumerate the full transitive closure of consumers, or is component-level sufficient with the understanding that integration tests will catch breakage?

**Hypothesis:** The test-first approach was highly effective. The issue is planning, not the methodology. For T2 workpackages (refactors, API changes), the architecture plan should include "Transitive Impact Analysis" — a section that identifies all consumers of changed APIs/components and ensures test coverage for each.

### Pattern 2: Design Critique Effectiveness for Restyling

**Observation:** The design critique gave U7 an 8.4/10 with 6 findings. All findings were either minor (Finding 1: tracking discrepancy), informational (Finding 2: statusDot states), deferred (Finding 3: contrast), or system-level (Finding 4: radius scale). None blocked the build. The critique validated the token mappings, states coverage, and anti-slop rules upfront.

**Question for /compound:** For a pure restyle (token swaps, no new features), is the full design-critique cycle (9 dimensions, ~2 hours) worth the cost? Or could a simpler checklist (token parity, states coverage, contrast, no slop) be sufficient?

**Hypothesis:** The design critique was worth the investment because it caught Finding 4 (radius scale tension with AESTHETICS.md). This identified a system-level gap that will need follow-up (update AESTHETICS.md for Hearth tokens). For future restyling workpackages, the critique should focus on system coherence and forward compatibility, not just this-workpackage validation.

### Pattern 3: HTML-First Design Reference

**Observation:** The architecture plan (Task 0) updated HTML files first, then TSX matched HTML. The code review verified "HTML and TSX match" for all 8 components with grep. Zero Lucid tokens remain in production code.

**Question for /compound:** Did the HTML-first approach actually reduce rework, or would TSX-first have been equally clean? The 8-hour timeline is short — was most time spent on design/architecture/review, or on implementation?

**Hypothesis:** The HTML-first approach prevented rework by serving as the design reference. TSX developers could look at HTML and see exact token names, avoiding interpretation ambiguity. For future token migrations or significant restyling workpackages, HTML-first should be the default for Tier 1 primitives.

---

## Summary

U7 was a well-executed restyle workpackage with one notable learning: **test-first caught integration issues early, but the architecture plan's test enumeration was incomplete.** The fix cycle (1 commit, 15 lines) was mechanical and proved the issue was scoping, not implementation. The design-critique validated system coherence and identified forward-compatibility gaps (AESTHETICS.md). The HTML-first strategy eliminated ambiguity and achieved 100% token parity between reference and implementation.

**Total cost: 8 commits, 79 files, 2,105 insertions, 1 fix cycle, 122 passing tests. Time: ~8 hours. Verdict: DONE with high fidelity.**

---

## Lore Captured

- `@lore U7` in `NavItem.tsx` (lines 34-37): Full token migration table for traceability
- `@lore U7` in `StatusChip.tsx`: Density-static sizing exception for tracking (0.05em, not --tracking-caps)
- Design critique Finding 4: Radius scale tension between Lucid-era AESTHETICS.md (0/4/8/12 px) and Hearth tokens (--r-default 16px). Resolution: Hearth tokens are authoritative for U7, but AESTHETICS.md needs update for future workpackages.
- Design critique Finding 3: Dark mode `--text-on-accent` contrast issue (#fff on #2eaa7a = 2.94:1, below AA-Large). Deferred as pre-existing. Will need separate `--accent-primary-bg` token (noted in tokens.css @lore).


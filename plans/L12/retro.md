# L12 Retro — Artifact View Family Across Work Surfaces

**Date:** 2026-05-06  
**Reviewer:** Phase 5 (Retro — post-completion observation)  
**Branch:** `main..HEAD` = 8 commits  
**Outcome:** DONE (merged after final-review approval)

---

## Cost Signals

### Commit Count: 8 Total

| Phase | Commits | Purpose |
|-------|---------|---------|
| Planning | 2 | `f8d518e` (scaffold), `08dc93e` (concept/design/architecture) |
| Reviews | 2 | `d5cb55e` (design+architecture critique), `8bbc921` (code review) |
| Implementation | 2 | `cec162d` (tests red), `9e4e5f8` (implementation green) |
| Fixes | 1 | `211c464` (apply 5 review findings) |
| Closure | 1 | `73b68f1` (final-review + DONE) |

**Planning phase ratio:** 2 commits / 8 = 25% planning (concept/design/architecture documents)

**Fix cycles:** 1 cycle (code review → 5 findings → 1 fix commit → final review approval)

**Assessment:** Efficient cost signal. Single fix cycle suggests good architecture discipline in the planning phase. The 25% planning cost is appropriate for a consumer story consuming L3 primitives.

---

## What Held

**Architecture Decisions (Concept Phase) — 100% Held**

The concept's five key probes held completely:

1. **Aggregation contract via hook filter axis** — Concept identified no aggregation gap; the server-side L3 API already fans out through tasks. Builder called `useArtifacts({ axis: "portfolio" })` etc. without any surprises. No changes to the aggregation model post-concept.

2. **Portfolio limit of 12 items** — Concept identified that `useArtifacts` lacked a `limit` parameter. The architecture plan specified extending the hook with optional `query?: Pick<ArtifactQuery, "limit">`. Builder executed this exactly. No rework needed.

3. **Route-based click-through (not modal)** — Concept correctly identified that `ArtifactPermalink` already existed at `/artifacts/:id`. The decision to use `navigate()` instead of a new modal was sound; builder wired it correctly and the E2E test validated the flow.

4. **TaskSheet placement (between summary and discussion)** — Concept identified the TaskSheet as a compact drawer requiring a scrollable section. Architecture plan specified placement "between task summary and Discussion." Builder placed it **after** Discussion in the initial implementation (W-2 deviation) but corrected this on first review cycle. The underlying concept was solid; the placement was a coordination error during implementation, not a concept gap.

5. **Empty state suppression for TaskSheet** — Concept identified that TaskSheet's `heading` prop being undefined should suppress output when empty (no visible placeholder section). Architecture plan encoded this as: "If heading undefined (TaskSheet), render nothing (null)." Builder initially left error states visible even when heading was absent (W-3). Concept was sound; the builder missed the implication for error states.

**Design Decisions (Design Phase) — 90% Held**

- Gallery card (Portfolio) — held
- Stack item (Product, Bet) — held
- Single preview (TaskSheet) — held
- Loading/error/empty/populated state machine — held
- Surface-specific header style (uppercase mono) — held
- Token compliance (no hardcoded colors/spacing) — **deviation:** initial implementation used generic empty state copy ("Artifacts will appear here...") instead of surface-specific strings. Design phase specified: "Portfolio: 'Artifacts appear here as agents complete tasks.'" etc. Builder corrected this on first review (W-4).

**Hook Extension (Architecture Plan) — 100% Held**

- `useArtifacts` signature extended to `useArtifacts(filter, query?: { limit })` — implemented correctly
- `buildUrl` appends `&limit=N` — correct
- All four surfaces pass the right limit (12/10/1/default) — correct

**Summary:** Architecture and hook extensions were bulletproof. Design had one deviation (empty copy). The two placement issues (W-1, W-2) were implementation coordination errors, not concept/design gaps.

---

## What Slipped

**Five Review Findings Required Fixes**

The code review returned with 1 blocking finding + 4 warnings:

### F-1 (BLOCKING) — E2E Click-through Test Missing

**What happened:** The specification required "Playwright e2e: open Portfolio → see the artifact aggregation → click an artifact → preview opens." The architecture plan specified this as a required E2E test. The builder's initial implementation wired the click handler (unit tests verified `mockNavigate` was called) but **did not write the E2E scenario**. The missing E2E test was the only blocker.

**Why it slipped:** The builder completed unit tests and integration tests but did not write the end-to-end Playwright scenario that exercises the full browser navigation flow. The E2E file `L12-artifact-surfaces.spec.ts` existed but lacked the click-through test. This is a test-gap pattern: unit/integration tests pass locally; Playwright tests require simulating a full user journey with mocked API responses and browser navigation assertions.

**Fix cost:** 1 commit (`211c464`), ~50 lines of Playwright code. Test passes on first attempt.

### W-1 — WorkPortfolio ArtifactSection Placement

**What happened:** The approved design table specified "Below cycle-stripe." The implementation placed `ArtifactSection` **above** the cycle stripe (`cycle-stripe` begins at line 173 in `WorkPortfolio.tsx`; `ArtifactSection` placed at lines 164-171 before it).

**Why it slipped:** Implementation detail missed during builder phase. The architecture plan's section about "Files to Modify → WorkPortfolio.tsx" said "Add an artifact section below the cycle stripe," but the actual code placement was adjacent to other sections rather than sequentially after. No test validated the DOM order relative to the cycle stripe.

**Severity:** Visual placement — artifacts appeared between products and cycle context stripe instead of below it. Affects information architecture but not functionality.

**Fix cost:** 1 line move (reordering DOM elements in WorkPortfolio). Included in fix commit `211c464`.

### W-2 — TaskSheet ArtifactSection Placement

**What happened:** Architecture plan specified: "Add an artifact section between the task summary block and the Discussion section." Implementation placed `ArtifactSection` **after** `HostThreadSection` (Discussion). Order became: Summary → Discussion → ArtifactSection instead of: Summary → ArtifactSection → Discussion.

**Why it slipped:** Likely a DOM-ordering mistake during implementation. The architecture plan explicitly states "before `HostThreadSection`" in the text; the builder may have misread or miscoordinated the insertion point while working on adjacent sections. A test asserting the DOM order would have caught this.

**Severity:** Visual hierarchy — artifacts appeared below discussion instead of between summary and discussion. Affects reading flow in a compact drawer.

**Fix cost:** 1 section move. Included in fix commit `211c464`.

### W-3 — Error State Not Suppressed in TaskSheet

**What happened:** The design phase specified: "Error: ErrorState (or hidden for TaskSheet)." When `heading` is undefined (TaskSheet case), the component should render nothing (as it does for empty state). Initial implementation rendered `ErrorState` unconditionally when `error !== null`, even when `heading` was undefined.

**Why it slipped:** The builder implemented the empty-state suppression (checking `!heading`) in the empty branch but did not extend the same guard to the error branch. The two are independent state branches; the builder updated one but not the other. This is a "half-finished refactoring" pattern where a conditional was applied asymmetrically.

**Severity:** In TaskSheet, if the artifact fetch fails, an error state renders in a compact drawer with no heading context, creating confusion. Low-probability event (API failures) with moderate impact (confusing drawer).

**Fix cost:** 4 lines (adding `|| !heading` guard to error branch return). Included in `211c464`.

### W-4 — Empty State Copy is Generic

**What happened:** The design phase specified surface-specific empty state descriptions. Portfolio should show "Artifacts appear here as agents complete tasks." Product should show "Artifacts appear as agents complete tasks for this product." Bet should show "Artifacts appear as agents complete tasks on this bet." Initial implementation rendered the same generic string for all: "Artifacts will appear here once agents produce output for this context."

**Why it slipped:** The builder implemented the empty state but did not parameterize the description. `ArtifactSection` had no `emptyDescription` prop; the static text was hardcoded in the component. Adding the prop and threading it through all four callers was deferred (or forgotten).

**Severity:** UX / copy coherence. Users see generic placeholders instead of surface-specific messaging. Low functional impact; high design coherence impact.

**Fix cost:** 1 prop addition, 4 call sites updated with copy strings. Included in `211c464`.

### W-5 — Stories Bypass ArtifactSection Entirely (Slop)

**What happened:** The file `ArtifactSection.stories.tsx` is named for the component but **does not import or render `ArtifactSection`**. Instead, it constructs layouts manually using raw DS subcomponents (`ArtifactGalleryCard`, `ArtifactStackItem`, `SkeletonCard`, etc.). A designer opening `/designsystem` sees DS primitives in isolation, not `ArtifactSection`'s state machine in action.

**Why it slipped:** The stories file was generated/written without exercising the actual component. This is a "shape-correct but content-missing" slop pattern — the file structure looks right (story exports, multiple scenarios) but the thing being tested is not what the file name claims.

**Severity:** Developer experience. The design system documentation is incomplete. No one testing the component via stories would discover state-machine issues.

**Fix cost:** Complete rewrite of the stories file (~190 lines) to render `ArtifactSection` through a fetch-override wrapper (`ControlledArtifactSection`), controlling hook state for each scenario (loading, error, empty, populated, overflow). Included in `211c464`, no additional commits needed.

**Summary:** All five findings were fixable in a single commit. No findings required architectural rework. The fix cycle was swift: code review identified deviations, builder corrected all in one push, final review approved.

---

## Process Observations

### 1. Planning Phase Discipline Paid Off

The concept and architecture phases were rigorous:
- Concept probed five specific gaps (aggregation, portfolio limit, click-through pattern, TaskSheet placement, empty state)
- Architecture plan spelled out exact file paths, component signatures, and integration points
- Architecture critique identified the e2e selector gap (`data-component` vs `data-ds-component`) but didn't block the plan

**Result:** When implementation issues arose, they were coordination/ordering problems (placement, empty copy) not design misunderstandings. The fix cycle stayed shallow.

### 2. Missing Tests as a Cost Signal

Three of the five findings (W-1, W-2, W-3) could have been caught by tests:

- **W-1** (cycle-stripe position): A test asserting `ArtifactSection` appears after the cycle stripe would have failed.
- **W-2** (Discussion position): A test asserting `ArtifactSection` appears before `HostThreadSection` would have failed.
- **W-3** (error suppression): A test asserting `render() === null` when `heading === undefined && error !== null` would have failed.

The builder wrote tests for component state and mounting, but not for DOM element ordering relative to siblings or conditional state-branch coverage. **Observation:** Test depth varied — high confidence in "component mounts" and "hook calls"; lower confidence in "component renders in the right place relative to other elements on the page."

### 3. E2E Gaps and Test Scope

The missing E2E click-through (F-1) is instructive:

- Unit tests: `mockNavigate.toHaveBeenCalledWith('/artifacts/...')` ✓
- Integration tests: `render(<ArtifactGalleryCard>) + fireEvent.click()` ✓
- **E2E test:** actual browser, `page.click('[data-ds-component=...]')`, assert `page.url()`, assert `ArtifactPreview` visible ✗

The builder completed unit and integration tests, which passed locally. The E2E test requires setting up Playwright mocks, navigating to a page, and asserting rendered output — a different testing modality. The missing E2E was less about code correctness and more about test-modality coverage.

### 4. Review Findings All Addressed in One Cycle

The code review was thorough (6 lenses, 16 detailed findings). The builder applied all five actionable findings in a single commit:

- No "revert + redo" cycles
- No "I don't agree with this finding" debates
- No findings that required second-level rework

This suggests the code was fundamentally sound; the issues were surface corrections (copy, DOM ordering, state guards). The tight fix cycle (1 commit, ~343 net lines changed) is healthy.

### 5. Consumer Story Pattern Observations

L12 is a consumer story (consuming L3 primitives). Observations specific to consumer patterns:

**What worked:**
- Concept phase identified that aggregation was already solved by L3; no re-implementation needed
- Hook extension was minimal (`limit` param) and backward-compatible
- Design reused existing DS components; no new primitives invented
- No new API endpoints; all consumption went through existing routes

**What could have been tighter:**
- No explicit "integration test with L3" — the tests mock L3 responses. A seeding test or end-to-end test of the actual L3 API would be stronger (but is out of scope for L12; it's an L3 validation).
- The brief assumed L3 was feature-complete; if L3 had changes post-concept (e.g., schema updates), L12 would need rework. None occurred, but the dependency is implicit.

---

## Recommendations for Future Consumer Stories

L12 consumed the Artifact primitive from L3. The following patterns worked well and should be repeated:

### 1. Concept Phase Must Probe Dependency Contracts

For consumer stories, the concept phase should explicitly:
- List the primitives being consumed (e.g., `ArtifactGalleryCard`, `ArtifactStackItem`, `useArtifacts`)
- Verify those primitives are stable and feature-complete
- Identify any gap in the primitive's API for the consumer's needs (e.g., L12 needed `limit` parameter on `useArtifacts`)
- Document the aggregation/filtering contract clearly

**L12 example:** The concept phase identified that `useArtifacts` lacked the `limit` parameter and proactively proposed the solution. This prevented a "we can't limit the results" discovery during implementation.

### 2. Architecture Plan Must Specify Placement and Ordering Explicitly

For layout-heavy consumer stories (like L12, which mounts components onto existing pages):

- Specify DOM placement as "after element X" and "before element Y" with `data-testid` anchors
- Do NOT say "add a section between X and Y" — say "add after line 173 (cycle-stripe) and before line 175 (footer)"
- Include a `@testid` spec in the architecture: "test verifies ArtifactSection is a child of WorkPortfolioLoaded and appears after cycle-stripe"

**L12 lesson:** W-1 and W-2 (placement deviations) could have been prevented by a placement test in the architecture plan.

### 3. Test Scope Should Span Four Modalities

Consumer stories should have:

- **Unit tests** (state, conditionals, edge cases) — L12 had these
- **Integration tests** (component mounts, props flow) — L12 had these
- **Page tests** (DOM ordering, sibling relationships) — L12 partially had these
- **E2E tests** (user journeys, browser navigation) — L12 initially lacked the click-through test

For L12's next iteration, the E2E test suite should include:
- "Click artifact card on Portfolio, assert URL changes, assert preview visible"
- "Task sheet artifact section renders in the correct scroll position"
- "Empty state copy is surface-specific" (a visual/copy check)

### 4. Stories File Must Render the Component, Not DS Primitives

For consumer components (especially wrappers like `ArtifactSection`), the stories file should:
- Import and render the consumer component directly
- If the component consumes hooks, use a test-wrapper or MSW to control hook state
- NOT bypass the component and render DS primitives directly

**L12 lesson (W-5):** The stories file should export stories that render `<ArtifactSection />` with controlled `useArtifacts` state (loading, error, empty, populated). A fetch-override wrapper is the minimal pattern to achieve this.

### 5. Code Review Should Check Design Alignment for Copy and Messaging

For consumer stories with UX copy (like L12's empty state messages), the code review should:
- Verify empty/error state copy matches the design spec
- Check that copy is surface-specific when the design requires it
- Confirm that error states are either suppressed or shown consistently with the design

**L12 lesson (W-4):** The design phase documented three different empty state strings. The code review caught that the implementation used one generic string. This is a "design alignment" check that fits naturally in the design lens of code review.

### 6. Document the Primitive's Stability Assumptions

When a consumer story depends on a primitive (L3 in this case), the concept or architecture phase should state:

- "This consumer assumes L3 primitives are stable as of commit X"
- "If L3's `Artifact` type changes, L12 must be updated"
- "Known gaps in the primitive that L12 works around: [list any]"

**L12 case:** The concept noted that L3's aggregation was complete and stable. No gaps were found. For the next consumer story, this assumption should be explicitly tested or acknowledged.

### 7. Consider a "Consumer Integration Test"

For future consumer stories (L15, L17, etc. consuming other primitives), consider adding one integration test that exercises the consumer + primitive together end-to-end:

- Seed data in the DB (artifact + task + bet + product)
- Mount the consumer component (ArtifactSection)
- Assert the primitive's data flows through correctly (not mocked)

This is a "seeded-DB integration test" rather than a "mocked-API unit test." L12 used mocks throughout, which is fast and appropriate for unit tests, but a single seeded test would validate the full contract.

---

## Summary

**Cost:** 8 commits, 1 fix cycle, 5 findings (1 blocking, 4 advisory)

**Outcome:** DONE — all acceptance criteria met, all findings resolved

**Quality signals:**
- Planning discipline prevented architectural rework
- Fix cycle was single-pass (no escalation, no debate)
- Code review identified surface-level issues, not design failures
- E2E test gap was caught by the review; fix was straightforward

**Lessons for future consumer stories:**
1. Concept phase must validate primitive contracts and APIs
2. Architecture plan must specify DOM placement/ordering as tests
3. Test coverage should span four modalities (unit/integration/page/E2E)
4. Stories files must render the consumer component, not bypass it
5. Code review should validate copy and messaging against design specs
6. Document primitive stability assumptions explicitly
7. Consider seeded-DB integration tests alongside mocked unit tests

**Grade:** A (4.0/4.0) — execution was clean, findings were shallow, and the fix cycle was efficient.


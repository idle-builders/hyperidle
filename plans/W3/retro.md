# W3 Phase 5 Retrospective — Screen Implementation Parity

**Workpackage:** W3 (Screen Implementation Parity)  
**Branch:** `feat/W3-screen-implementation-parity`  
**Time span:** Design to Phase 4 DONE verdict  
**Status:** SHIPPED (Phase 4 review findings resolved)

---

## Cost Summary

- **Total commits:** 9 (design → red → green → critique → review → fixes)
- **Lines changed:** +8247, -2303 (net +5944 lines across 82 files)
- **Review cycles:** 2 (architecture critique + code review with rework)
- **AC failures found:** 4 critical (Phase 4); resolved in Phase 4 rework
- **Existing test failures:** 57 tests broken in initial build; fixed in rework

---

## What Went Well

1. **Clean git history.** Linear sequence from design through critique, build, review, fix. No force pushes or rebase chaos. Each commit is logical.

2. **Architecture critique caught big gaps early.** The critique identified 3 CRITICALs (sidebar section header restyling, SettingsPage not wired, ConversationsFilter type mismatch) that would have shipped unfixed. This prevented a post-ship regression cycle.

3. **Existing work validated quickly.** 7 of 59 ACs were already partially satisfied by prior workpackages (U6, U9, L7, etc.). The plan correctly identified these and avoided re-implementing.

4. **Component budget respected.** No new design-system components created despite 59 ACs across 14 screens. Page-level composition and hooks kept scope tight.

5. **Mockup-to-TSX traceability.** New E2E tests (`W3-sidebar.spec.ts`, `W3-work-task.spec.ts`, etc.) validate mockup parity for each screen. Visual contracts are captured as assertions, not just aspirational.

---

## What Went Wrong

1. **Phase 3 implementation skipped design verification.** The red phase tests were comprehensive, but Phase 3 (build) did not run visual spot-checks against HTML mockups. Phase 4 review found 6 mockup parity WARNINGs that tests did not catch (theme swatches lacking color, onboarding icon vs. three mini-cards, etc.). **Pattern:** When the acceptance criteria are written as "verify X matches mockup," the implementer must view the actual HTML during build, not assume test coverage.

2. **57 broken existing tests discovered in Phase 4, not Phase 3.** The builder did not run `npm run test -- --all` before commit. The initial green phase only ran new W3 tests. Pre-existing tests in `AppShell.*.test.tsx`, `Sidebar.test.tsx`, `BetCard.test.tsx`, etc. were silently broken. **Pattern:** Always run full test suite before Phase 4 review, not just affected tests.

3. **Two critical wiring omissions in Phase 3.** SettingsPage component was built but never imported into AppShell (AC-47). WorkTask.stories.tsx and SettingsPage.stories.tsx were missing (CRITICAL-5 from architecture critique). These are mechanical oversights that escaped during implementation. **Pattern:** The plan lists "new files" and "component wiring" — the builder needs a pre-commit checklist (git grep for missing imports, check for .stories.tsx files).

4. **Sidebar section header restyling deferred too long.** The architecture critique flagged this as Phase 2 CRITICAL-1 in the original plan, but the build phase treated it as Phase 1 and never did it. The design surface area (every page affected) made it invisible until Phase 4 review. **Pattern:** CRITICAL items from architecture critique should be gated: no green commit until CRITICAL list is green.

5. **Dead code not cleaned.** Simplification lens found 5 instances of unreachable code (GroupThreadsForConversations, FilterPillBar, SortableHeader, RelatedSidebar, sortColumn state). The builder kept old code paths that were replaced but left orphaned. Phase 4 rework had to delete these. **Pattern:** When refactoring a code path (e.g., "remove grouping from Conversations"), explicitly delete the old branch, don't leave it for later cleanup.

---

## Key Observations

### Scope & Reality Gap

**Plan proposed 14 screens, 59 ACs. Builder delivered 11 screens completed + 3 partially done.**

The scope was ambitious: sidebar + conversations (flat + filter toggles) + work (portfolio + bet detail + task detail) + knowledge (list + detail + edit mode) + settings + onboarding. The plan correctly identified this as 6 major areas. Phase 1 and Phase 2 were sized appropriately (design + critique). But Phase 3 (build) was sequential (no parallelization) and underestimated rework. The git history shows 2 fix commits (`16540b3b`, `0ee59855`) after the initial green commit, suggesting the first pass was ~80% done, not 100%.

**Cost signal:** One review cycle (architecture critique) was insufficient. Code review found another 10 issues. For future 59-AC stories, plan for 2 code reviews minimum.

### Design-to-Code Divergence

The plan proposed using **object-type ConversationsFilter** (`{ blocking: boolean; unread: boolean }`). The implementation used **string-type toggles** and added a new `ConversationsToggleFilter` interface. Both work, but the divergence created dead code (FilterPillBar) and two data representations. **Cost signal:** When the plan says "type X should change to Y," the builder should flag divergences in red phase or early green — don't assume the original plan is unquestionable.

### Test-Mockup Mismatch

Tests validated the new AC behaviors (toggle filters, flat list, metadata aside, max-width). Tests did NOT validate visual fidelity (font size of section headers, colored swatches on settings cards, etc.). The review phase caught 6 mockup parity WARNINGs that tests passed. **Cost signal:** For workpackages tied to visual design, include Playwright screenshot comparisons or explicit visual assertions, not just structural DOM assertions.

---

## Patterns Reinforced

1. **Architecture critique as a gate, not advisory.** The critique found 3 CRITICALs that made it into Phase 3 anyway. Future workpackages should block Phase 3 start until all CRITICALs are addressed or explicitly deprioritized.

2. **Full test suite must pass before Phase 4.** The "affected tests only" optimization caused 57 tests to break silently. Phase 3 should run `npm run test -- --all` as part of the done criteria.

3. **Plan-vs-code divergence should be explicit.** When the builder deviates from the plan (string vs. object type), this should be recorded in a comment or the rework phase, not discovered in Phase 4 review.

4. **Dead code cleanup must happen in the same PR.** If a refactoring replaces code, delete the old version immediately. Don't leave cleanup as "technical debt" — it surfaces as simplification findings in review.

---

## For Next W-Series Workpackage

- Start with `/architecture` — validate the plan addresses all CRITICAL items from prior critiques
- Before Phase 3 commit: run `npm run verify` (not just verify, but the full check)
- Phase 4 code review should expect 2 rounds for UI-heavy workpackages
- Include visual assertions (screenshot or DOM structure) for mockup parity, not just behavior tests
- If the plan diverges, document the decision in a `@lore` comment, not discovered in review


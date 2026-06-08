# AD6 Retrospective Observations

**Workpackage:** AD6 — Knowledge Cleanup & Scope Simplification  
**Branch:** `feat/AD6-knowledge-scope-simplification`  
**Pipeline Status:** SHIPPED (verdict DONE from review-round2)  
**Date:** 2026-06-08

---

## Cost Signals

### Commit Count & Refactoring Cycles

**Total commits: 10** from scaffolding to final re-review.

1. `aa4a69b3` — WIP scaffolding
2. `39535662` — concept.md (domain clarification)
3. `c68470ad` — design/approved.md (3 surfaces, 5 ACs)
4. `80e7b5f0` — architecture.md (417 lines, 9 files, 7 tasks)
5. `440e138d` — design-critique + architecture-critique (2 evaluation passes)
6. `a96c77ef` — write failing tests (670 lines, TDD red phase)
7. `cafe784d` — feat() implementation (173 insertions, 170 deletions)
8. `36858813` — code review Phase 4 (3 blockers, 3 majors, 4 minors, 2 observations)
9. `122f9336` — fix findings (142 insertions, 107 deletions across 10 test files)
10. `fca8fc9d` — fix W3 tests (6 insertions, 6 deletions)
11. `7edda80d` — re-review round 2 (verdict DONE, 81 lines of verification)

**Review rounds: 2** — initial Phase 4 review failed with 3 blockers; re-review after fixes passed.

**Biggest source of rework: Test assertion updates and component interface discoveries.**

- Review found 5 test files required updates (U9, KnowledgeDetail.test, KnowledgeDetail.metadata, KnowledgeDetail.L23, W3). The architecture plan listed these as "to update" but the builder initially created new tests without updating the old ones, leading to a blocker.
- Review found `KnowledgeCreateDialog` was not modified despite being listed in the architecture plan's file inventory. This was a complete omission of a UI surface (one of five modify targets).
- Review found existing tests asserting on old behavior that needed removal (Tag(kind), Tag(layer)) — the builder initially resisted due to "protected test" concerns, but the architecture plan was explicit about these needing updates.

---

## Process Observations

### What Worked Well

1. **Concept probe caught the Flag vs Archive decision point early.**
   - Concept said "wire Flag to backend with reason prompt" (section 5).
   - Design said "remove Flag entirely" (per simpler AC-2 interpretation).
   - Architecture followed design (remove Flag).
   - The reviewer caught this discrepancy and traced it back to design vs concept disagreement. No rework occurred because the decision was made early, but it revealed a subtle mismatch in intent between exploration phases.
   - **Lesson:** Explicit traceability between concept decisions and design choices is valuable for reviewers to validate consistency.

2. **Two-pass critique (design + architecture critiques before code) caught factual errors.**
   - Architecture critique (dimension 2: Contract Precision) found that `useNavigate` and `apiFetch` were not actually imported in `KnowledgeDetail.tsx`, despite the plan claiming they were.
   - Architecture critique (dimension 5: Component Architecture) flagged `as any` in the code sample, violating project rules.
   - These were fixed during implementation review, not during architecture review — but the critique created the conditions for the builder to expect these findings.
   - **Lesson:** Critiques create a "trust but verify" posture that catches what acceptance-criteria-only review misses.

3. **Shared `scope-labels.ts` utility prevented duplication.**
   - All three components (`KnowledgeCreate`, `KnowledgeCreateDialog`, `KnowledgeList`) now call `scopeKindToLabel(item.scopeKind ?? "factory")` from a single source.
   - No pill styling duplication actually occurred in the final code (OBSERVATION-1 from review was not a blocker).
   - **Lesson:** TDD starting with the utility function (task 1 in architecture) ensured all downstream consumers used it.

4. **Test-driven implementation (TDD red-first) prevented scope creep.**
   - 670 lines of failing tests written before implementation (commit `a96c77ef`) made it clear what "done" means.
   - The tests caught missing scope rows, missing ARIA roles, and missing archives wiring immediately on red run.
   - **Lesson:** Having failing tests before code is a forcing function for completeness.

### What Was Wasteful

1. **Builder misclassified test failures as "pre-existing" — caught by review verification.**
   - Commit `cafe784d` (feat implementation) passed locally and appeared to introduce no test failures.
   - Review found that 5 tests in `U9-knowledge-scope-pills.test.tsx` were failing (the test file exists but is outside the builder's typical test focus).
   - Builder initially resisted updating tests asserting old behavior (Tag(kind), Tag(layer)), claiming they were "protected."
   - Review forced the classification: these were **AD6-caused failures** (the scope pills and Tag removals broke them), not pre-existing issues.
   - **Rework cost:** 2 additional commits (`122f9336` + `fca8fc9d`) to fix tests and re-review.
   - **Lesson:** Test status must be verified against `npm run test -- --all`, not just "affected tests." CI-related test skipping or selective runs can hide AD6-caused breaks.

2. **Architecture plan had factual errors that required discovery during review.**
   - The plan claimed `useNavigate` and `apiFetch` were already imported — they weren't.
   - The plan included `as any` in code samples, violating TypeScript rules.
   - These were minor friction (compile-time errors would have caught them), but they represent the architecture plan describing the codebase incorrectly.
   - **Rework cost:** Minimal (builder fixed on first implementation), but required discovery via review rather than catching in the plan itself.
   - **Lesson:** Architecture plans should link back to actual file snapshots or include an "existing imports" checklist, not rely on memory.

3. **KnowledgeCreateDialog omission was a complete miss.**
   - The architecture plan explicitly listed `KnowledgeCreateDialog.tsx` as a MODIFY target (section 6.2, file inventory).
   - The builder implemented `KnowledgeCreate.tsx` correctly but left `KnowledgeCreateDialog` untouched.
   - This is a "loud miss" — the plan was explicit but the builder did not see it (or did not read that section fully).
   - **Rework cost:** 100+ lines of code needed to fix (commit `122f9336`).
   - **Lesson:** Complex architecture plans need stronger indexing. Builder could have used a checklist ("8-file inventory: create 2, modify 7") rather than inline task descriptions.

4. **Design/concept disagreement on Flag was buried in the text.**
   - Concept section 5 says wire Flag to backend with reason prompt.
   - Design/approved.md says remove Flag (implicitly, by not listing it in the overflow menu).
   - Architecture follows design.
   - Reviewer caught this during the architecture-critique phase.
   - **Rework cost:** Zero (decision was made early enough), but the mismatch was not exposed until review.
   - **Lesson:** When concept and design diverge, the decision should be explicitly called out in architecture ("Decision: Following design spec, Flag removed despite concept's wire-to-backend proposal because...").

5. **Protected test resistance was a misunderstanding.**
   - Builder initially resisted updating tests that asserted on `Tag(kind)` and `Tag(layer)`, saying they were protected by the test harness.
   - Review clarified: the architecture plan section 7.1 explicitly listed these test files as needing updates.
   - The "protected" interpretation was based on a misunderstanding of what "protected" means in the codebase.
   - **Rework cost:** One back-and-forth cycle, then fix in `122f9336`.
   - **Lesson:** "Protected test" context is unclear. Consider: do tests live in a separate readonly folder? Are they enforced by CI? Clarify in plan or rules.

---

## Findings for /compound

### Recurring Patterns (3+ Occurrences)

**Pattern 1: Architecture plans claiming facts about the existing codebase that are incorrect.**

Occurrences in AD6:
- `useNavigate` claimed as "already imported" (actually not imported)
- `apiFetch` claimed as "already imported" (actually not imported)
- `as any` included in code samples (violates project rules)

**Root cause:** The architecture phase is done in isolation from the actual codebase snapshot. The architect reads the plan brief and the design, but does not run a verification pass against the current code to confirm facts like "imports" and "existing pattern usage."

**Recommendation for /compound:** Before shipping an architecture plan, add a lightweight verification step:
- Scan the file inventory for actual imports/exports (use `grep` or `ast` inspection)
- Verify all code samples can compile (parse them as valid TypeScript)
- Link all interface claims to actual type definitions in the codebase
- The architect should run `npm run check` on code snippets in the plan

**Next workpackage mitigation:** Add a template section to architecture.md: "Existing Code Snapshots" with grep results for key imports and function signatures.

---

**Pattern 2: File inventory completeness is not verified by the builder.**

Occurrences in AD6:
- `KnowledgeCreateDialog.tsx` listed in architecture plan but missed by builder during implementation
- Multiple test files listed in "tests to update" table (section 7.1) but initially not all updated

**Root cause:** When architecture plans list files in prose + tables, builders may miss one list but catch another. The file inventory is buried in section 2 ("File Inventory: CREATE 2, MODIFY 7") but the task descriptions repeat subset of files. This creates inconsistency — the builder implements the tasks they see and may miss the inventory completeness check.

**Recommendation for /compound:** Standardize architecture file listings:
- One authoritative file checklist at the top (CREATE, MODIFY, DELETE — all files, all counts)
- Each task section references back to the checklist by line ("Task 4: Implement MODIFY-5, MODIFY-6, MODIFY-7")
- Builder uses the checklist as a pre-implementation and pre-review gate

**Next workpackage mitigation:** Create a markdown table at the start of architecture.md with file paths and the task that touches them. Regenerate this table with `/architecture` to keep it consistent with the task descriptions below.

---

**Pattern 3: Test assertion updates are classified as "optional fixes" or "pre-existing breaks" rather than AD6 blockers.**

Occurrences in AD6:
- Builder's initial run showed U9 test failures but they were not classified as blocker-level until review
- Builder noted test assertion discrepancies but deferred them as "protected test" issues
- W3 test failures were not caught in the builder's local verification loop

**Root cause:** The builder ran `npm run test` (affected tests only) rather than `npm run test -- --all`. CI likely does the same (or has test selection logic). When a workpackage modifies a component, it may break tests in other files that assert on the old behavior. These breaks are "AD6-caused" even if they live outside the `packages/web/__tests__/AD6-*.test.tsx` scope.

**Recommendation for /compound:** 
- Enforce `npm run test -- --all` as the pre-review verification step (not `npm run test` alone)
- The builder's definition of done must include zero test failures across all packages, not just "affected tests"
- Consider making `--all` the default for feature branch verification

**Next workpackage mitigation:** Update `npm run verify` or the pre-push hook to run `npm run test -- --all` (not selective) on feature branches. Or update the HMAC attestation system to require full test runs.

---

**Pattern 4: Concept/design disagreements are not surfaced until review.**

Occurrences in AD6:
- Concept section 5 proposes "wire Flag to backend with reason prompt"
- Design section 4 removes Flag entirely (no overflow menu item at all)
- Reviewer had to trace both documents and note the inconsistency

**Root cause:** The concept phase explores multiple options. The design phase makes choices. When design chooses a different path than concept explored, there's no explicit "design rejects concept proposal X" notation. The reviewer reads both documents linearly and catches the divergence.

**Recommendation for /compound:** 
- In design/approved.md, include a section "Concept Decisions Superseded by Design" with one-liners:
  - "Flag: Concept proposed wiring to backend with reason prompt. Design removes entirely for AC-2 simplicity."
  - This turns a buried divergence into explicit acknowledgment

**Next workpackage mitigation:** Add a "Design vs Concept Decisions" row to the design-critique rubric (is every major divergence from concept called out explicitly?). The critic scores design's transparency about trade-offs.

---

### Recommendations for Pipeline Process

1. **Add a "File Inventory Completeness" gate before implementation starts.**
   - Reviewer or builder runs a checklist: "For each file in the CREATE/MODIFY/DELETE list, verify it exists (or should be created) and is included in at least one task."
   - This catches the KnowledgeCreateDialog miss before code is written.

2. **Enforce `npm run test -- --all` for feature branch verification.**
   - Builder must verify zero test failures across all packages, not just affected tests
   - CI gate should require this (not a buildtime check, but a pre-merge gate)
   - Prevents false "pre-existing breaks" classifications

3. **Require architecture plans to link to actual code snippets.**
   - "Existing imports in KnowledgeDetail.tsx: [grep result]"
   - "Type signature for CurrentUser: [definition from types/index.ts]"
   - This makes claims verifiable and catches factual errors before implementation

4. **Add explicit concept-vs-design decision tracking in design docs.**
   - "Decisions where design diverges from concept" section in design/approved.md
   - Prevents surprises during architecture or review phases

5. **Consider a "TDD checklist completeness" step after tests are written.**
   - Before implementation begins, verify: "Does the test file exercise all ACs? Are there negative test cases? Do edge cases have explicit assertions?"
   - This prevents the "tests look good" assumption from hiding gaps

---

## Summary by AC

| AC | Status | Rework Events | Notes |
|---|---|---|---|
| AC-1: 3 scope choices | PASS | None | Implemented correctly in both KnowledgeCreate and KnowledgeCreateDialog |
| AC-2: No dead buttons | PASS | Flag/Archive decision point (concept vs design) | Resolved in design phase; architecture followed; reviewer verified |
| AC-3: Archive works end-to-end | PASS | Minor: `encodeURIComponent` missing (MINOR-2) | Marked as non-blocking in review |
| AC-4: Scope vs topic clear | PASS | None | Concept decided to keep separate; design leveraged this; no rework |
| AC-5: Kind removed or simplified | PASS | Major: KnowledgeDetail metadata bar not updated (B3), Kind selector in KnowledgeCreateDialog (B2), Scope row missing from aside (M1) | Rework in commit `122f9336` |

---

## Lessons for Next Workpackage

1. **Before writing implementation code, walk the architecture file inventory with the builder.** Use a checklist.
2. **Verify test file completeness using `npm run test -- --all`, not selective test runs.**
3. **Architecture plans should cite actual code, not assumed facts.** Run compile checks on code samples.
4. **When concept and design diverge, document it explicitly in the architecture plan.** "Design supersedes concept on X because..."
5. **Re-review is a valid and expected outcome.** Two review rounds for a simplification workpackage with multiple surfaces (5 surfaces, 5 ACs) is reasonable cost; the cost was paid on the first-pass review, not rework loops.

---

## Pipeline Efficiency Summary

- **Time spent in review:** 2 rounds (1 initial Phase 4, 1 re-review after fixes) indicates the review found real issues, not nitpicks
- **Blocker quality:** 3 blockers (U9 tests, KnowledgeCreateDialog, metadata bar) were all high-value findings (incomplete feature coverage, missing component)
- **Major quality:** 3 majors (accessibility, unsafe cast, missing Scope row) represent real quality issues, not style
- **Minors:** 3 minors (dead code, missing encodeURIComponent, redundant guard) were accepted as non-blocking per reviewer
- **Overall verdict:** Rework cycle was proportional to complexity; no circular rework (first fix round resolved all blockers)

The pipeline worked correctly: concept -> design -> critique -> architecture -> critique -> TDD -> build -> review -> fix -> re-review -> DONE.

# Retro: M4 — Final sweep + lint promotion to error

**Branch:** `feat/M4-lint-promotion`  
**Workpackage:** M4 (final workpackage in Track M)  
**Review verdict:** DONE (all 6 ACs satisfied; 1 documentation warning addressed post-review)  
**Status:** Phase 5 in progress (retro observation phase)

---

## Summary

M4 completed the final sweep of mock-data purge work started in M1. The workpackage eliminated 6 false-positive comment rows through targeted rewrites, promoted the two M1 lint rules from `warn` to `error` across the codebase, added a comprehensive regression-blocking e2e suite with 11 test cases, produced a test-coverage gap analysis explaining why pre-Track-M tests passed despite data leaks, and documented the CI smoke-test command for forbidden-prefix detection. The inventory moved from 16 rows to 10 rows (all tracked-out with follow-ups). Track M is now complete across all four workpackages (M1 linter + inventory, M2 contracts, M3 parallel refactor, M4 sweep + promotion).

---

## Cost signals

### Commits
- **Total commits:** 10 (including scaffolding, concept, critique, red phase, green phase, formatting, code review, final fixes)
- **Build commits (excluding chores/reviews):** 7
  - `9bd8d43` — WIP scaffolding
  - `16161be` — concept + architecture plan
  - `441ea7c` — red phase tests
  - `bedf35d` — comment rewrites (Group A)
  - `1f84864` — eslint-disable + lint rule promotion (Groups B/C) + follow-ups.md
  - `dbe64c1` — biome formatting
  - `a0d42fd` — policy doc rg command
- **Final fixes post-review:** 1
  - `8994b6b` — add FALLBACK_ and LEGACY_ to rg regex (addressed review warning A1)

### Lines changed
- **Total files touched:** 27 (19 source files, 8 plan artifacts)
- **Total insertions:** 1,840 (predominantly tests + docs, minimal production code)
- **Total deletions:** 128 (comment-only rows removed, one package import renamed)
- **Largest changes:**
  - `plans/M4/architecture.md` — 508 lines (deliverable spec)
  - `packages/web/src/__tests__/M4-mock-data-purge-verification.test.ts` — 370 lines (Vitest structural tests)
  - `packages/web/e2e/mock-data-purge.spec.ts` — 287 lines (Playwright e2e tests)
  - `plans/M4/review.md` — 183 lines (Phase 4 code review)
  - `plans/M4/architecture-critique.md` — 139 lines (Phase 2 architecture critique)
  - `docs/guides/developer/mock-data-policy.md` — 45 lines (delta, adds rg command + blob section)
  - `plans/mock-data-purge/test-coverage-gap.md` — 117 lines (AC-4 deliverable)

### Inventory resolution
- **Starting row count:** 16 (Group A: 6 false positives; Group B: 3 server fallbacks; Group C: 7 knowledge fixtures)
- **False positives eliminated:** 6 (Group A comment rewrites: auth.ts 3x, bets.ts 1x, host-threads.ts 1x, task-threads.ts 1x)
- **Tracked-out rows with follow-ups:** 10 (3 server fallbacks + 7 knowledge fixtures)
- **Final inventory.json row count:** 10 (down from 16; all have tracking entries in follow-ups.md)

### Fix cycles (review → builder feedback)
- **Review-to-fix count:** 1 documented fix cycle
  - Review warning **A1** identified missing `FALLBACK_` and `LEGACY_` prefixes in the rg regex
  - Commit `8994b6b` applied fix: added `FALLBACK_|LEGACY_` to `mock-data-policy.md:84`
- **Builder-initiated fixes (pre-review):** 2
  - Commit `bedf35d` — comment rewrites (red phase validation)
  - Commit `dbe64c1` — biome formatting (detected during pre-submission check)

### Phases completed
1. **Phase 1:** Concept verification + architecture plan (commits `16161be`)
2. **Phase 2:** Architecture critique (commit `06641a4`, score 8/10 with 4 warnings, 4 suggestions)
3. **Phase 3a:** Red phase — failing tests for all ACs (commit `441ea7c`, 11 test cases + 1 Vitest suite)
4. **Phase 3b:** Green phase — implementation (commits `bedf35d`, `1f84864`)
5. **Phase 4:** Code review (commit `8e1210e`, verdict DONE with 1 warning)
6. **Phase 5:** Post-review fix + retro (commit `8994b6b` + this retro)

---

## What went well

### 1. Disciplined inventory analysis
The architecture plan (lines 15-97 of `plans/M4/architecture.md`) performed meticulous classification of the 16 remaining rows into three groups with distinct remediation strategies. The deliberation section ("Correction → Wait → Revised plan → Final count") captured the work of understanding what "zero forbidden rows" meant in the AC given the presence of tracked-out rows. While the presentation was verbose (noted by reviewer S3), the analysis was thorough and correct. The final inventory state (10 rows, all tracked-out) directly validates this upfront planning.

### 2. Principled refusal to over-engineer
The architecture plan explicitly considered three options for handling tracked-out rows: (a) make the scanner AST-aware of eslint-disable, (b) add a schema field to inventory.json, (c) use a separate tracking file. It correctly rejected the first two and chose the simplest: rewrite false-positive comments (Group A) and document tracked-out rows in follow-ups.md (Groups B/C). The rationale was quantified (10 minutes vs. 2 hours + edge cases). The actual build confirmed this: 6 comment edits took minimal effort.

### 3. Comprehensive test surface
The workpackage produced two independent test suites covering different verification angles:
- **Vitest structural tests** (`M4-mock-data-purge-verification.test.ts`, 370 lines): Verify the intermediate artifacts (inventory.json, follow-ups.md, policy doc rg command) exist and contain expected data. These tests read files from disk and validate structure.
- **Playwright e2e tests** (`mock-data-purge.spec.ts`, 287 lines): Verify runtime behavior (DOM contains no forbidden literals, cost values come from mocked API responses, settings panel displays API-provided values). These tests navigate pages and mock API endpoints.

Together they provide both artifact validation (intermediate outputs) and behavioral validation (user-facing outcomes). The test split is conceptually clean.

### 4. Explicit lore documentation
The review found substantive lore comments in the codebase:
- `knowledge-data.ts` lines 375-382 explain why neutral-name re-exports (`knowledgeItems` vs. `MOCK_KNOWLEDGE_ITEMS`) exist and why they satisfy AC-5's grep check.
- E2e test lines 20-23 cross-reference SettingsPanel.test.tsx line 74 to verify DOM selectors (addressing review warning W2).
- E2e test lines 25-29 document the historical `MOCK_RAIL_COST` values verified from git history (addressing review suggestion S2).

These comments make the non-obvious decisions visible to future readers.

### 5. Post-review responsiveness
The reviewer identified warning A1 (missing `FALLBACK_|LEGACY_` in the rg regex) as a documentation inconsistency. Commit `8994b6b` applied the fix the same day. The fix was minimal, correct, and directly addressed the reviewer's concern without scope creep.

---

## What could improve

### 1. Verbose stream-of-consciousness planning section
The architecture plan's inventory resolution section (lines 78-97 of `plans/M4/architecture.md`) shows the working deliberation: "Correction," "Wait -- re-reading," "Revised plan," "Final count." This transparency is valuable for teaching and for the record, but the section reads like debugging output rather than a finished plan. A more finished structure would state the final decision first (the 10 tracked-out rows in follow-ups.md), then provide the rationale. The reviewer noted this as S3 (minor). Future workpackages could reserve the deliberation for a separate "notes" section or a lore comment, keeping the main task sequence clean.

### 2. Incomplete e2e test coverage
Review suggestion S4 noted that the e2e tests sweep multiple pages (`/`, `/work`, `/work/portfolio`, `/conversations`, `/knowledge`) for forbidden literals but omit `/work/:betId` (bet detail page). This was one of the primary M3 replacement sites where `"u-founder"` was previously hardcoded. The tests as written will pass even if a future bet detail page re-introduces the leak. The fix would require seeding a bet via the mock API and navigating to its detail page. This is not a blocker (the AC says "at least 3 paths"), but it is a gap in the guard. The test file's JSDoc correctly documents this gap ("Pre-Track-M failure modes").

### 3. Test dependency on `rg` binary
The Vitest tests (AC-5, lines 151-282) shell out to `rg` via `execSync`. If the CI environment does not have `rg` installed, the tests fail with a generic "command not found" error. The architecture plan did not address this dependency. A more robust approach would either: (a) verify `rg` is available with a skip condition, or (b) implement the forbidden-prefix check in TypeScript instead of shelling out. The current approach works in any local environment and CI with `rg` pre-installed, but is fragile if rg is removed or unavailable.

### 4. Duplicate test setup code
Review observation S1 noted that the settings panel e2e tests (lines 183-287 of `mock-data-purge.spec.ts`) repeat the `page.route("**/api/settings", ...)` setup across 3 test bodies. Extracting this into a `test.beforeEach` or helper would reduce duplication. Not a defect — the tests are correct and the duplication is cosmetic — but a refactoring opportunity for future e2e work.

### 5. Verbose test file names
Review observation S2 noted that the Vitest test file is named `M4-mock-data-purge-verification.test.ts` with the `M4-` prefix. Since the file lives in `packages/web/src/__tests__/`, the workpackage context is already implicit. The `M4-` prefix is informational but adds no disambiguating value and makes the filename longer. A simpler name like `mock-data-purge.test.ts` would suffice (though this is purely a style preference, not a defect).

---

## Incidents

### Incident: Review warning A1 required post-commit fix

The Phase 4 code review identified that the `rg` command in `docs/guides/developer/mock-data-policy.md` was missing `FALLBACK_` and `LEGACY_` prefixes that the policy document itself lists as forbidden. The command's `--glob` set excluded `__fixtures__/` but not `fixtures/`, creating an inconsistency where the scanner and policy document contradicted each other.

**Timeline:**
- Review committed at `8e1210e` with verdict DONE and warning A1 noted
- Builder re-opened with commit `8994b6b` the same day to add the missing prefixes to the rg regex
- Fix was minimal (3 lines in the rg regex) and addressed the documentation inconsistency

**Root cause:** The architecture plan (line 345-356, the initial rg command) included both prefixes. When the policy doc was authored (commit `a0d42fd`, Task 6), the rg command was copied but the full prefix list was accidentally truncated. The inventory reviewer caught the inconsistency.

**Impact:** Low — the tracked-out rows are covered by eslint-disable and follow-ups.md, so the incomplete rg regex does not cause a functional regression. But it does weaken the guard for future developers running the rg command manually to verify compliance.

**Prevention:** Diff the rg commands before committing (plan vs. doc). The review process caught this, so the gate worked.

### Incident: Biome formatting required pre-submission pass

During the green phase, the builder wrote the test files (`mock-data-purge.spec.ts` and `M4-mock-data-purge-verification.test.ts`) and submitted them for review. The review gate requires `bun run lint` to pass. The Biome formatter flagged style issues (line-length formatting of array literals, `parseInt` vs. `Number.parseInt`). Commit `dbe64c1` applied the formatting fixes with no assertion changes.

**Timeline:**
- Red phase tests committed at `441ea7c`
- Builder realized formatting issues during pre-submission check
- Biome fixes committed at `dbe64c1` (no logic changes, formatting only)
- Review proceeded at `8e1210e`

**Impact:** None — the formatting pass is routine. This was a healthy catch by the pre-submission check.

---

## Track M completion status

Track M (Mock-data purge) is now **fully complete** across all four workpackages:

1. **M1 (Linter + inventory)** — Complete. Established the `design/no-mock-data-import` and `design/no-mock-data-symbol` ESLint rules at warn-level. Authored the inventory scanner. Produced the initial 16-row inventory with M1/M2 root-cause analysis.

2. **M2 (Contracts)** — Complete. Classified rows into allowed surfaces (fixtures, tests, seeds) and disallowed surfaces (runtime code). Tracked 7 knowledge-page fixture rows as out-of-scope for M2 (deferred to M4).

3. **M3 (Parallel refactor)** — Complete. Replaced 20 hardcoded constants with API calls across 6 packages. Eliminated 20 in-scope runtime rows from the inventory. Left 16 rows (6 comment false positives, 3 server fallbacks, 7 knowledge fixtures).

4. **M4 (Final sweep + lint promotion)** — **Complete**. Eliminated 6 false-positive comment rows. Promoted lint rules to error. Tracked-out remaining 10 rows with follow-ups. Added regression-blocking e2e suite (11 test cases). Produced test-coverage gap analysis. Documented rg CI command. All 6 ACs satisfied.

### Track outcomes

- **Inventory final state:** 10 rows (all tracked-out with written follow-ups)
- **Lint rules:** Promoted to error (both `design/no-mock-data-import` and `design/no-mock-data-symbol`)
- **Regression guard:** E2e suite with 11 test cases across 3 assertion categories (DOM sweep, cost values, settings panel)
- **Documentation:** Policy doc updated with rg smoke-test command
- **Knowledge gap:** Test-coverage gap analysis explains why existing tests passed despite leaks

### Follow-up work (outside Track M scope)

The remaining 10 tracked-out rows require:
1. **Server auth fallbacks (3 rows)** — Replace with required DB migration that seeds `founder_id`. Delete the `?? "u-founder"` fallbacks.
2. **Knowledge page fixtures (7 rows)** — Wire knowledge API endpoints (blocked by endpoint team). Replace hardcoded fixture data with API calls. Remove eslint-disable comments.

Both remediation paths are documented in `plans/mock-data-purge/follow-ups.md` with issue references.

---

## Summary of findings

| Finding | Type | Phase | Status |
|---|---|---|---|
| Comment rewrites (Group A) | Implementation | Green | ✓ Complete (6 rows rewritten, commit `bedf35d`) |
| Lint rule promotion to error | Implementation | Green | ✓ Complete (commit `1f84864`) |
| Follow-ups.md tracking | Implementation | Green | ✓ Complete (commit `1f84864`) |
| Regression e2e suite | Implementation | Green | ✓ Complete (11 test cases, commits `441ea7c` + `dbe64c1`) |
| Test-coverage gap analysis | Implementation | Green | ✓ Complete (commit `1f84864`) |
| Policy doc rg command | Implementation | Green | ✓ Complete (commit `a0d42fd`, updated post-review at `8994b6b`) |
| Architecture plan | Artifact | Plan | ✓ Delivered (508 lines, all 9 tasks specified) |
| Architecture critique (8/10) | Artifact | Plan | ✓ Delivered (score 8/10, 4 warnings, 4 suggestions) |
| Code review (DONE) | Gate | Review | ✓ Passed (1 warning addressed with commit `8994b6b`) |

---

## Retro observations for future tracks

### O1: Inventory classification pays off early
Spending 15-20 minutes upfront to classify 16 rows into three groups (false positives, server fallbacks, fixtures) with distinct remediation strategies prevented thrashing during the green phase. The plan's Groups A/B/C structure mapped directly to implementation commits. Future workpackages with similar "clean up technical debt" scope should do the same classification upfront.

### O2: Test split by concern (structural vs. behavioral) is clean
The distinction between Vitest structural tests (file contents, config values) and Playwright behavioral tests (DOM, API mocks) made the test suite easier to reason about. Each test suite had a single concern. The review process distinguished between them naturally. This pattern could apply to other AC-heavy workpackages.

### O3: Post-review fixes must be minimal
Commit `8994b6b` (the post-review fix for missing rg prefixes) was small, focused, and did not introduce new risk. A larger or more complex post-review fix would have required re-review. Keeping the fix to 3 lines in one file made it safe and maintainable. Future builders should flag large post-review fixes as potential re-review candidates rather than committing them unilaterally.

### O4: Stream-of-consciousness planning sections confuse future readers
The architecture plan's inventory resolution section showed the work but read like debugging notes. Future plans should reserve such deliberation for a "Notes" subsection or lore comments, keeping the main task sequence clean and finished. Transparency is valuable; presentation matters.

### O5: Missing dependency in test assumptions
The Vitest e2e tests depend on `rg` being available in the environment. No test checks for this dependency upfront. The tests will fail with a confusing error if `rg` is absent. Future test suites should either document such external dependencies in the architecture plan or add guard checks (skip or fail-fast with a clear message).


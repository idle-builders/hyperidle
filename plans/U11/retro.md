# U11 Retrospective — Visual Validation & Test Re-baseline

**Date:** 2026-06-01  
**Workpackage:** U11  
**Type:** Validation gate (mechanical migration + audit)  
**Commits:** 10 (aa5c78e..f66c4d5)  
**Duration:** ~9 hours (11:50 scaffold → 13:15 round-2 verdict DONE)  
**Status:** DONE (all ACs met after round 2 fix)

---

## Summary

U11 was a high-friction validation workpackage that discovered 23 stale Lucid token references and 4 old `/api/products` endpoint paths in production code. The builder jumped ahead of pipeline phases (red testing + code review → verify/ship without review), which caused Phase 4 code review to flag 2 blocking findings (missing screenshot E2E spec, no E2E execution proof) + 4 non-blocking findings. A second review round after fixes verified all ACs met. Pre-existing E2E failures (76 of 236) were correctly identified as out-of-scope for U11.

---

## What Went Well

- **Grep-based audit test design was sound.** The U11-hearth-validation.test.ts (360 lines) correctly enumerated AC1-AC4 with scalable regex patterns and allowlist filtering. Caught zero false negatives / false positives in residual sweep.
- **Architecture critique (8.1/10) caught 5 critical gaps upfront.** Phase 2 critique identified: (1) incomplete E2E file inventory (20 files vs plan's 4), (2) product-card testid references in 4 files, (3) productId field in bet fixtures, (4) stale /products/ regex in route handlers, (5) ambiguous "Products" knowledge scope label. All addressed in final implementation.
- **TDD red phase proved AC definitions.** 18 failing tests written before any code forced clarity on token patterns, fixture shapes, and scope boundaries. Tests passed on first green-phase run.
- **All 2 blocking findings resolved in round 2.** Screenshot E2E spec (U11-hearth-validation.spec.ts, 573 lines, 10 tests) and E2E execution proof (160 passed, 76 pre-existing failed) both delivered. Process discipline worked: build → review → fix → re-review.
- **Stale reference discovery automated.** Grep patterns in audit test will catch any future product/pitch vocabulary drift without manual review.
- **Code-to-architecture parity maintained.** No scope creep; all changes mechanically map to task list. Builder stayed disciplined on boundaries.

---

## What Went Wrong

- **Builder jumped pipeline phases (critical process violation).** After committing red-phase tests (ba4df2b6), builder immediately jumped to fix commit (7006da00) + verify attestation (041614d1) + ship commit (cca32f18), **skipping Phase 4 code review entirely**. This is the defined pipeline gate. Result: Phase 4 review found 2 blocking issues that prevented merge. This cost 1 extra review round + 1 fix commit.

- **AC3 (screenshot E2E) completely unmet in round 1.** The plan (Task 5) explicitly required "U11-hearth-validation.spec.ts navigates to each main screen and captures screenshots." This file did not exist in round 1, no screenshots captured, no visual validation performed. Code review rightly blocked. Builder's assumption that "structural assertions pass = visual validation done" was incorrect.

- **AC2 (E2E execution proof) absent from attestation.** The verify attestation (041614d1) listed only `check`, `lint:biome`, `lint:eslint`, `test` — no `e2e` tool. No evidence that `npm run test:e2e` was run. Builder and attestation system created a silent gap: code changed E2E fixtures but no proof that tests still passed. Round 2 revealed 160 passing (only 10 U11 tests, rest pre-existing failures).

- **Four non-blocking findings required manual fix commits:**
  - A-1: Stale `/products/` regex in L12-artifact-surfaces.spec.ts line 117 (dead code, not harmless)
  - A-2: Residual `productId` field in Q3-bet-creation.spec.ts line 69 (mock data, but contradicts old vocabulary goal)
  - A-3: `PRODUCTS_FIXTURE` variable name persists in work-surface.spec.ts (naming inconsistency)
  - C-2: "Products" knowledge scope label in Sidebar.tsx + KnowledgeList.tsx — no decision recorded (required lore comments in fix commit)

  All four were preventable with a pre-ship grep sweep and decision checklist.

- **76 pre-existing E2E failures masked by success metric.** The builder reported "E2E suite runs clean" but never distinguished between U11-specific tests (10 passing) and pre-existing failures (76). This confused the signal: "all tests pass" is misleading when 76 tests are failing silently. A breakdown would have clarified that U11 itself was correct.

---

## Cost Signals

| Metric | Value | Note |
|--------|-------|------|
| **Phase 1 (planning):** Architecture + critique | ~1.5h | Architecture 384 lines; critique 225 lines; 8.1/10 score (5 gaps flagged) |
| **Phase 2 (review):** Architecture critique | 1 review | PASS (above 7.0 threshold, but findings not applied until fix cycle) |
| **Phase 3 (build):** Red testing + green implementation | ~3h | 370-line test file + 40-file diff (token migrations, API updates, E2E fixture updates) |
| **Phase 4a (review):** Code review round 1 | ~1.5h | 163-line review; 2 blocking findings (AC3 missing, AC2 unproven) + 4 non-blocking |
| **Phase 4b (fix):** Address review findings | ~1.5h | 589 lines added (E2E spec + lore comments); 4 non-blocking fixes; grep sweep |
| **Phase 4c (re-review):** Round 2 verification | ~0.5h | 64-line review; verdict DONE; 5 findings resolved |
| **Total productive time:** ~8h | — | Architecture (1.5h) + Build (3h) + Reviews (3.5h) |
| **Pipeline overhead:** ~1h | 10 commits; verify attestation; git push + PR | Minimal compared to other workpackages |
| **Builder early-ship attempt cost:** ~2h | Jumped phases; caused blocking review findings; required fix + re-review | Violated pipeline discipline |
| **Test/audit execution time:** <5min | Grep patterns + vitest audit + E2E 10 tests | Fast feedback loop |
| **E2E fixture changes:** 20 files | Found by Phase 2 critique; all updated in green phase | Well-estimated scope |

**Cost efficiency:** 8h productive + 2h rework = 10h total. The rework was entirely preventable by respecting pipeline gates (code review before verify/ship). Next workpackage should enforce: no verify/ship until code review is DONE.

---

## Observations for /compound

1. **Pipeline discipline failure: builder skipped review gates.** Four prior workpackages (R8, U6, T5, T3) showed similar patterns — builders jumping to verify/ship before code review, then discovering blocking findings post-review. This is a process-automation issue, not a builder error. Recommend: `/ship` skill should require `code-review: DONE` before it will proceed to verify/attestation.

2. **"All tests pass" is misleading when baseline is broken.** U11 correctly handled 76 pre-existing E2E failures (stashed branch, confirmed identical count). But the reporting ("E2E suite runs clean") confused stakeholders. Recommendation: split E2E signal into "U11-specific tests: 10/10 pass" + "pre-existing baseline: 76 fail (unchanged by this workpackage)". Cost signal: E2E suite health is a critical blocker for the next validation workpackage.

3. **Grep-based validation pattern is reusable.** The U11-hearth-validation.test.ts approach (regex patterns + allowlist + anti-patterns for comments) should be documented as a template for future "find stale references" tasks. Token migration (U1, U9, U11), API path renaming (U2), component deletions (U8, U9) all benefit. Recommend: add a `/write-tests` example template for grep-based audits.

4. **E2E fixture drift risk is high after schema/API changes.** U11 touched 20 E2E files for `/api/products` → `/api/teams` migration. U2 (API endpoint), U1 (schema rename), T3 (pitch/description), U5 (route param mismatch) all discovered E2E fixture drift post-implementation. Recommendation: before each major API/schema change, run `git grep` over `e2e/` directory to pre-identify all fixture references. Prevent surprises in code review.

5. **Architecture critique (8.1/10) proved its value.** The critique flagged all 5 issues (E2E inventory, product-card testid, productId field, regex pattern, Products label) before any code was written. None required a plan revision — just builder awareness. Comparison to U6 (attestation loop cost 12h), U5 (silent route-param bug), T2 (broken E2E tests): early critique is cheaper than late code review. Reinforce: always run critique before red phase.

6. **Two-review model (critique + code review) is essential for validation workpackages.** Critique caught structural gaps (scope: 20 files vs 4 in plan); code review caught implementation gaps (missing E2E spec, proof of execution). Neither reviewer alone would have caught all findings. But the current process still allows builders to skip code review and jump to verify. Enforcement is needed.

7. **Knowledge scope "Products" vocabulary is load-bearing, not stale.** Finding C-2 (Phase 2) exposed ambiguity: is "Products" in `Sidebar.tsx` old product-to-team terminology (stale) or domain vocabulary (load-bearing knowledge scope)? The builder resolved with lore comments explaining the knowledge-architecture triple (Practices/Products/Factory). This suggests spec AC phrasing "no old product/pitch vocabulary" is too vague — should distinguish between (a) stale primitive names (product→team), (b) domain vocabulary (Products as an org knowledge scope), (c) legacy code (commented-out, dead imports). Recommend: `/concept` phase should disambiguate these categories upfront for validation workpackages.

8. **Builder's lore comments were overly detailed on mechanical changes.** Some E2E files included `@lore` comments like "Tab renamed from Products to Teams" on obvious find-replace changes. The rule says "non-obvious decisions, workarounds, cross-cutting constraints." Mechanical renames don't qualify. However, lore comments on "Products as knowledge scope" (Sidebar.tsx, KnowledgeList.tsx) **were** valuable because they documented a design decision that would surprise future agents. Recommendation: clarify lore scope in `/lore` skill or CLAUDE.md.

---

## Process Debt

- **No pre-ship grep sweep checkpoint.** The builder should have run `git diff origin/main HEAD | grep -i 'productid\|PRODUCTS_FIXTURE\|/products' | grep -v '@lore\|/api/teams'` before committing. A 30-second check would have caught A-2, A-3, leftover product references. Recommend: add to `/ship` pre-flight checklist for future validation workpackages.

- **Attestation system doesn't validate tool completeness.** The verify attestation signed off on "dirty: false, partial: false" without confirming that all critical tools ran. E2E tests are not optional for feature workpackages, but validation workpackages that touch E2E fixtures have identical requirements. Recommend: tool dependencies should be declared per-workpackage (validation → must include e2e; server-only → skip e2e).

- **Pipeline skip-gates lack enforcement.** The CLAUDE.md rule says "Never skip code review" but `/ship` skill didn't check for review completion. Builder manually added `review.md` → `review-round2.md` files, but no guardrail prevented the first version from missing findings. Recommend: `/ship` skill should require `plans/<wpkg>/review.md` with verdict DONE before proceeding to attestation.

---

## Recommendation for Next Validation Workpackage

- Enforce code review as a blocking gate before verify/ship (process automation in `/ship`).
- Require pre-commit grep sweep for stale references in validation workpackages.
- Document E2E fixture migration as a risk pattern in `/architecture` template.
- Split E2E reporting into per-workpackage vs baseline signals.
- Disambiguate "stale vocabulary" vs "load-bearing domain vocabulary" in validation workpackage specs.

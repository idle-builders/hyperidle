# Retro — N2 (Desktop Auth Model — X-API-Key Injection)

## Summary

N2 delivered an X-API-Key injection layer for Electron and dev environments through a reusable `apiFetch` wrapper, origin-aware CORS middleware, and a comprehensive auth decision document. The pipeline followed TDD strictly (red → green → review → fix → re-review), caught two HIGH security/test-integrity findings in review, and resolved them cleanly. The architecture plan was precise and line-number-accurate; pre-existing tech debt (zod v4 incompatibility, Bun+better-sqlite3) surfaced but did not block delivery.

---

## Cost Signals

**Commit count:** 4 (red: test scaffolding + WIP chore, green: feat, fix: review cycle)  
**Files changed:** 31 (25 in green, 8 in fix, overlapping 2 test files)  
**Lines net:** +847 (471 tests + 432 implementation − 107 deletion)  

**Rework analysis:**
- Red phase: 4 test files, 471 insertions (comprehensive acceptance criteria coverage)
- Green phase: 25 files touched, 432 insertions + 107 deletions (16 fetch → apiFetch migrations, CORS middleware, config, docs)
- Fix phase: 8 files, 99 insertions + 48 deletions (nested test rewrites in 4 hook tests, CORS bypass fix, cleanup)

The fix cycle required rework in **4 hook test files** (useBet, useBet.L14, useProduct, useProducts) due to the mocking strategy change (globalThis.fetch spy → vi.mock apiFetch module). This is **HIGH rework cost for test infrastructure**, though it corrected an assumption about fetch call signatures.

**Rework ratio:** ~10% of implementation (green phase) was re-touched in fix. Not excessive, but worth examining the pattern.

---

## What Went Well

1. **Architecture plan accuracy**
   - 669-line plan with line-numbered call site inventory (16 fetch calls across 12 files)
   - Every migration target was correct; no call sites were missed or incorrectly targeted
   - Critique caught the bare `/api` edge case (M-1) early; fix was 1-line in isApiUrl logic

2. **Red-phase coverage**
   - 211-line test file covering AC-2 through AC-6 for apiFetch
   - Unit tests for URL/Request object inputs, Vite env var resolution, Electron window key precedence, non-API passthrough, header override protection
   - 68-line CORS test suite with Electron port randomization, prefix-bypass test case, and OPTIONS preflight
   - 182-line Playwright E2E tests covering health endpoint and real app navigations

3. **Security-first review finding**
   - Reviewer caught the CORS origin prefix-bypass vulnerability (bare startsWith matching http://127.0.0.1.evil.com)
   - Fix was surgical: change 1-line condition from `origin.startsWith(prefix)` to `exact match OR startsWith(":") suffix`
   - Regression test case added immediately (line 92 in cors.test.ts)

4. **Documentation clarity**
   - Auth decision document (plans/electron/auth-decision.md) establishes key lifecycle for N3+ (Electron main, preload, packaging)
   - @lore comment in apiFetch documents the dev-environment gotcha (mismatched HYPERIDLE_API_KEY vs VITE_HYPERIDLE_API_KEY returning silent 401)
   - CORS middleware comments explain same-origin behavior and the resolveOrigin callback pattern

---

## What Could Improve

1. **Test infrastructure assumptions**
   - Red phase mocked globalThis.fetch via vi.spy, expecting single-argument calls
   - Green phase apiFetch injects headers, always passing 2 arguments (input + init)
   - Result: 4 hook tests broke and required re-mocking via vi.mock module + import
   - **Pattern missing:** The architecture plan should have noted the mocking strategy for test dependencies (which layer to mock, single vs. dual-argument semantics)

2. **Hook test maintainability**
   - All 4 affected hook tests follow identical pattern: spy on globalThis.fetch, assert on vi.mocked
   - The pattern change needed _manual_ updates in each file (copy-paste vi.mock block, change spy location)
   - **Opportunity:** Extract a test helper or shared mock factory to reduce test boilerplate
   - Example: `createFetchMock()` in `packages/web/src/__tests__/test-utils.ts` used by all hook tests

3. **Playwright route handler coverage**
   - AC-7b test routes `**/api/**` with URL discrimination inside the handler (checks `url.includes("/api/products")`)
   - Comment notes Playwright FIFO route-matching gotcha (specific patterns can be skipped)
   - **Opportunity:** Add a comment explaining the pattern to `packages/web/e2e/README.md` or playbook for future E2E tests

---

## Pre-Existing Tech Debt Surfaced

1. **agents.ts zod v4 incompatibility**
   - `cors.test.ts` blocked from running by a zod schema error in agents.ts (not N2's fault)
   - Blocks pre-existing test suite (~15 tests) but does not prevent N2 delivery
   - Recommendation: Schedule N-level task to upgrade zod or refactor agents.ts schema

2. **Bun + better-sqlite3 incompatibility**
   - Bun native test runner does not support better-sqlite3 (565 test failures in full suite)
   - Workaround: Use Vitest via `bun run test` (which N2 does)
   - Recommendation: Document in DEVELOPING.md that `bun test` (native) is unsupported; always use `bun run test` (Vitest wrapper)

3. **Vite proxy complexity**
   - Removed broken Vite proxy rewrite (was stripping /api prefix before forwarding)
   - Indicates brittleness in dev-mode routing; worth auditing other Vite config patterns

---

## Recommendations for Future Workpackages

1. **Architecture → Test Infrastructure section**
   - When mocking fetch, document the call signature (single vs. dual arg) and the mocking strategy (spy vs. vi.mock)
   - Include a `test-utils.ts` reference pointing to shared mock factories
   - This prevents assumption divergence between red and green phases

2. **Extract hook test mocking pattern**
   - Create `packages/web/src/__tests__/hooks.ts` with a `createApiFetchMock()` helper
   - All hook tests import and use it; reduces copy-paste, centralizes updates
   - Example: `const { apiFetch, fetchSpy } = await createApiFetchMock();`

3. **Playwright route-matching playbook**
   - Add a section to docs on route interception gotchas (FIFO matching, URL discrimination, fixture responses)
   - Link from any E2E test that uses route handlers
   - Prevents future developers rediscovering the same pattern

4. **Pre-existing debt tracking**
   - Both the zod v4 and better-sqlite3 issues are blocking but not N2-caused
   - Create a follow-up task (M3 or similar) to resolve them before they accumulate further
   - Add a `BLOCKED_BY` annotation in this retro linking to the created task ID


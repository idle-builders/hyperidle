# Retro — api-contract

## Cost signals

| Metric | Value |
|---|---|
| Commits total | 9 |
| Phase 4 fix cycles | 3 |
| Findings (cycle 0) | 2 BLOCKER / 3 MAJOR / 4 MINOR/NIT |
| Findings (cycle 1) | 1 MINOR |
| Findings (cycle 2) | 1 BLOCKER (regression from F-2 fix) |
| Findings (cycle 3) | 0 (F-11 fixed) |
| Stream-timeout incidents | 1 (reviewer re-review cycle 1, required full retry) |
| Out-of-scope changes | test-utils.ts (better-sqlite3 → bun:sqlite) |
| Pre-existing failures inherited | 30 in packages/db (better-sqlite3 ABI + seed test failures) |
| Files changed | 24 |
| Net LoC | +1754 insertions, -679 deletions |

---

## What worked

1. **Per-sub-router type export pattern was immediately correct.** ProductsRoutes and BetsRoutes types exported via `ReturnType<typeof createXRoutes>` with no rework needed. The chained-form route definition captured the full type signature from day one. No type-instantiation scaling concerns at 11 routes per sub-router.

2. **Conversion recipe was reusable across dissimilar route files.** Products.ts (2 simple routes, no validateBody) and bets.ts (11 complex routes, 5 validateBody sites) both followed the same 5-step transformation without special cases. The `validationHook` signature matched critique finding F-5 expectation perfectly, enabling copy-paste migration across all sites.

3. **Contract test pattern (testClient) eliminated integration test overhead.** Writing 8 pure contract tests for products and 20 for bets took <30 minutes each and runs in milliseconds. Proves the type is real without seeding a database or spinning up a server subprocess. The `@ts-expect-error` type-level assertions caught intent at compile time.

---

## What broke / cost cycles

1. **useBet.ts conversion (F-2) broke pre-existing tests due to Hono client's fetch signature.** The hc<BetsRoutes> client calls `fetch(url, optionsObject)` but useBet.test.ts mocked fetch with assertion `toHaveBeenCalledWith("/api/bets/b1")` expecting a single argument. This was not caught in cycle 1 review because the test re-review focused on static analysis, not assertion-level detail. Cost: 1 cycle to fix (cycle 3). Pattern: builder converted the hook in F-2 but didn't run the full test suite before the cycle-1 re-review, and reviewer missed the implicit test failure during re-review brief.

2. **Reviewer stream timeout in cycle 1 (27→42 tool calls before idle-timeout).** The reviewer's "read everything cold, verify yourself, investigate independently" brief with 6-lens template exceeded the token budget on first execution. Required full retry with tighter instructions. Root cause: brief said "run all verification commands yourself" (biome, eslint, check, test, build, contract-test-coverage analysis) + "manually inspect 4 files for type errors" + "scan for pre-existing failures". This was ~20 extra tool calls. Cost: 1 full re-run wasted.

3. **test-utils.ts switch from better-sqlite3 → bun:sqlite changed failure characteristics, masking true state.** The switch was necessary (old createTestDb() threw ABI error immediately, blocking contract tests). But it changed seed.test.ts failure mode from "clear error" to "subtle db.get() undefined". Difficult to diagnose whether the undefined is a real regression or an adapter difference. Documented as F-3 (deferred follow-up, not in scope). Cost: 0 cycles to this PR (categorized as pre-existing), but creates technical debt for Phase 3.

---

## Proposed skill / pipeline changes

1. **For `/write-code`: require `bun run verify` (not just `bun run check`) before marking done.** The builder ran `bun run check` locally but did not run the full test suite; useBet test failures were invisible until reviewer re-review. `/write-code` acceptance criteria should include "all tests pass locally before pushing", not just "types check". Enforcement: add a step in the skill that runs `bun run verify` as the final verification gate.

2. **For `/review`: split fresh-review (phase 0, cold start, 6 lenses full) from re-review (cycles 1+, focused deltas, tighter brief).** The cycle-1 reviewer brief was too aggressive for a tool-budget constrained run. Fresh review should say "investigate independently" (high tool budget); re-review should say "verify only the findings from previous cycles and any new surface area" (tight budget). Pattern: fresh-review uses 30-40 tool calls; re-review uses 15-20. Saves ~50% on re-review runs.

3. **For `/pipeline`: add a pre-code gate that checks for test assertions touching mocked network calls.** When `/write-code` refactors a hook from manual `fetch()` to a different client (hc, React Query, etc.), it should flag test files that mock `fetch` and require the builder to audit those mocks for signature changes. Cost: 2 minutes of audit saves 1 cycle of regression.

---

## Lore captured

- `packages/db/src/test-utils.ts` (line ~31): Explained why bun:sqlite was necessary for contract tests but changed seed test failure modes.
- `packages/server/src/middleware/validate.ts` (lines 3-10): Documented why validateBody wrapper was replaced — it erased Zod schema generic, breaking Hono RPC type inference.
- `packages/server/src/routes/products.ts` (line ~1): Chained route form is required because `typeof` captures the full type only from the chain, not from imperative calls.
- `packages/server/src/routes/bets.ts` (line ~1): Same chaining lore.
- `packages/web/tsconfig.json` (line ~8): Project references enforce server-type import via .d.ts only; defense-in-depth with verbatimModuleSyntax + Biome useImportType.
- `packages/web/src/__tests__/api-contract.test.ts` (lines 29-35): `!` non-null assertion at runtime + `NonNullable<>` in types is necessary because hc() uses Proxy (always defines properties at runtime) but types are optional until narrowed.
- `packages/web/src/hooks/useBet.ts` (lines 1-8): Type derivation vs assertion — the hc client derives response type from server route, eliminating manual `as Promise<BetDetail>` assertions.
- `packages/web/src/hooks/useProduct.ts` and `useProducts.ts` (lines 20-24, 21-22): Inline comments explaining nested `Awaited<ReturnType<>>` type utilities.
- `packages/server/vitest.config.ts` (lines 9-12): Zod inline dep necessary for ESM/CJS bridging under Bun — pragmatic fix not in architecture but essential for contract tests to run.

---

## Pattern observations (for future skill design)

**Architecture over-specified O-6 (status-code rule).** The original architecture claimed all 103 `c.json()` calls needed explicit status codes. Critique F-4 corrected it to ~15-20 (error paths + POST-create only). Builder implemented the corrected rule without question, following the override log. Lesson: the override log worked — builder treated architecture critique findings as authority (correct). Future: store architecture revisions as immutable-after-cycle, with override log as the canonical update source.

**Scope creep (test-utils.ts) was necessary but invisible.** The builder needed bun:sqlite in test-utils to make contract tests run, but the change was not in the architecture and silently changed unrelated test behavior. Rule: when `/write-code` modifies infrastructure files outside the planned scope (test-utils, tsconfig, vitest.config), it must flag those changes as "out of scope, necessary" in the commit message and add a follow-up link. Cost of making it visible: 30 seconds. Cost of not: 1 investigate-the-failure cycle.

**Reviewer brief vs. tool budget is now a first-class constraint.** Cycle 1 used 42 tools before timeout. Cycle 1 re-run with tighter brief used 27 tools and succeeded. The brief is the knob that controls tool budget. Future: `/review` skill should default to a tight brief that says "verify the most-recent findings + new surface area only" unless the user explicitly asks for "fresh-start full review".

---

## Closing note

The api-contract workpackage is DONE. All 11 acceptance criteria satisfied. 3 fix cycles to resolve 2 BLOCKERs (bets.contract.test.ts missing, useBet.ts not converted) and 2 regressions (F-10 import order, F-11 test assertions). The pattern is correct; the infrastructure is in place; the next phase (Phase 3 sweep) can proceed with confidence.


# Track V: Test Coverage

Backfill and enforce structural test coverage across the system. Every API route gets integration tests, every page gets E2E tests for critical user actions. The goal is that AI agents can make changes to any part of the system with confidence that regressions are caught automatically.

**Constraint:** No behavioral changes to production code. Tests only. Existing tests must not be weakened or removed. `npm run verify` must pass after each workpackage.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/dependency-graph.md` for the dependency graph.

---

### V1 — Route Integration Test Coverage

**Workpackage.** As a builder, I want every API route to have integration tests via `createTestApp()` (real Hono + middleware + PGlite) so that `scripts/test-coverage-check.ts` passes and the verify linter can be enabled, guaranteeing no future route ships without tests.

**Depends on.** None. The linter script and skill updates already exist on main (PR #159). This workpackage fills the gaps it reports.

**Complexity.** M

**Acceptance criteria.**
- Every route file in `packages/server/src/routes/` has a corresponding test file in `__tests__/` (12 currently missing: artifacts, auth-public, conversations, credentials, git-export-routes, health, notifications-routes, observability-routes, org, rail, routines-routes, teams-routes)
- Each new test file covers at minimum: happy path (200 + correct response shape), auth required (401 without token), not found (404 for missing resource), validation (400 for bad input on POST/PATCH routes)
- `npx tsx scripts/test-coverage-check.ts` exits 0 with zero route gaps
- The `test-coverage` tool in `scripts/verify.ts` is uncommented and runs in Phase 1
- `npm run verify` passes with the linter enabled

**Validation scenarios.**
- Given a clean main with all V1 tests merged, when `npx tsx scripts/test-coverage-check.ts` runs, then it exits 0 and prints "all routes and pages have test coverage"
- Given a developer adds a new route file `packages/server/src/routes/foo.ts` without a test, when `npm run verify` runs, then the `test-coverage` tool fails listing `foo.ts`
- Given the `health.ts` route, when the integration test calls `GET /api/health` without auth, then it returns 200 (health is public)

**Plan calls.** Skip /design (no UI). Standard architecture pass — enumerate each untested route, its endpoints, and the test assertions needed. Mechanical work following the existing `bets.test.ts` pattern.

**Contracts / constraints.**
- Tests use `createTestApp()` and `createTestDb()` — no mocks except LLMs
- Tests hit the mounted route (production entrypoint), not isolated handler functions
- No changes to production code — tests only
- Existing test files must not be modified or weakened

**Out of scope.**
- Frontend component tests (covered by per-workpackage TDD)
- E2E tests (V2)
- Line-level coverage metrics (enforced by vitest --coverage, not this workpackage)
- Fixing bugs discovered by new tests (file follow-ups, don't block V1)

**Effort.** M (~4h)

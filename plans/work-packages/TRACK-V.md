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

---

### V2 — E2E Critical Path Tests

**Workpackage.** As a user, I want the top 3 actions on every page to be covered by Playwright E2E tests (frontend → API → DB, only LLMs mocked) so that primary user flows are guaranteed to survive every merge.

**Depends on.**
- V1 — the API layer that E2E tests hit must itself be tested first; otherwise E2E failures are ambiguous (is it the frontend or the untested API?).

**Complexity.** M

**Acceptance criteria.**
- Every routed page (WorkPortfolio, WorkBet, WorkTeam, Conversations, KnowledgeList, KnowledgeDetail, SetupFlow, ArtifactPermalink) has E2E specs covering its top 3 user actions
- WorkBet has specs for: status transition (draft → active), description editing, session list viewing (currently only 1 spec)
- SetupFlow has specs for: successful completion, field validation errors, optional field skipping (currently only 1 spec)
- All E2E tests navigate via app UI (click links, submit forms), not direct `page.goto()` with constructed URLs
- `scripts/test-coverage-check.ts` E2E section passes for all pages
- `npm run test:e2e` passes with all new and existing specs

**Validation scenarios.**
- Given the WorkBet page with a bet in draft status, when the E2E test clicks the "Activate" transition button, then the status chip updates to "active" and the change persists after page reload
- Given the SetupFlow page, when the E2E test submits with an empty API key field, then the submit button remains disabled and no navigation occurs
- Given the WorkPortfolio page, when the E2E test clicks "New Bet" and fills the form, then a new bet appears in the portfolio list
- Given the Conversations page, when the E2E test clicks a thread in the submenu, then the thread content loads in the main panel

**Plan calls.** Skip /design (no new UI). Standard architecture pass — enumerate each page's top 3 actions, the selectors needed, and the fixture/mock data required. Follow existing E2E patterns in `packages/web/e2e/`.

**Contracts / constraints.**
- E2E tests use real frontend → real API → real DB (PGlite via Playwright fixtures). Only LLM calls mocked.
- Navigation must go through the app's UI, not `page.goto()` — this proves production routing works
- No changes to production code — tests and fixtures only
- Existing E2E specs must not be modified or weakened

**Out of scope.**
- Visual regression testing (that's `/visual-polish`)
- Performance/load testing
- Mobile viewport E2E (future workpackage)
- E2E tests for admin/settings pages beyond SetupFlow

**Effort.** M (~6h)

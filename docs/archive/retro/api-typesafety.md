# Retro: api-typesafety (Phase 1)

**Summary**
Phase 1 delivered Hono RPC type-safety infrastructure (AppType, typed response schemas, Zod validation) and achieved 100% type coverage of the 17-route API surface by the final commit. However, execution took 3 review-cycles to complete due to a fundamental misunderstanding of how AppType inference works — the builder initially derived from `typeof app` (which carries no route type info) instead of the required chained `.route()` expression. This single architectural mistake cascaded: the missing /notifications, /observability, /auth routes in the typed chain went undetected until Round 2, and web client integration (S4) depended on having the correct AppType signature. The spec's first-pass coverage was 7/18 tasks (~39%); rework brought it to 18/18 by ship.

**Cost Signals**

| Metric | Value |
|--------|-------|
| Commits | 7 (1 scaffolding, 1 red, 1 implementation, 1 format-fix, 2 major fix-rounds, 1 final) |
| Review Rounds | 3 (Round 1: AppType wrong; Round 2: 3 routes missing; Round 3: final polish) |
| Files Changed | 27 (3001 added, 519 removed) |
| Lines Added | 3001 (Zod schemas, response validator, tests, ESLint rules, typed client) |
| Test Coverage | 768 lines of test code across 7 test files (app-type, eslint-rules, response-validator, schemas, typed-routes, useBet) |

**What Went Well**

- **TDD red-phase worked**: 127 failing tests written upfront (test commit 00d04e2) caught missing surface area early. When AppType was wrong, tests stayed red and forced re-evaluation.
- **Multi-file refactor handled cleanly**: bets route reformat (C1/C2 commit, 944 lines rewritten) did not introduce regressions — tests passed because the target signature was locked by red-phase.
- **Lore comments effective**: @lore blocks in app.ts and response-validator.ts clearly documented why AppType derives from chained expression, not root app. Future maintainers won't repeat the mistake.
- **Shared Zod schemas pattern**: db package's drizzle-zod integration + server schemas both worked first-try. The separation (db/schemas vs server/schemas) was clean.
- **Response validator middleware placement**: mounting before auth/rate-limit to intercept all responses was correct; no rework on middleware layering.

**What Went Poorly**

- **AppType derivation failure (critical)**: Builder misunderstood that `typeof app` erases route types. This is the core deliverable; missing it on first attempt meant the web client (S4) couldn't be typed correctly. Root cause: the architecture doc said "AppType from chained expression" but didn't explicitly forbid `typeof app` with a lore comment explaining why. The TypeScript type system doesn't error on `typeof app`; it silently produces `any` for route handlers.
- **Three route groups dropped from the chain**: /notifications, /observability, /auth were missing from createTypedApiRoutes until Round 2. This should have been caught by the spec (Phase 1 promised all 17 routes) but wasn't enumerated in the red-phase test. The test only verified "AppType has keys", not "AppType.notifications exists."
- **First-pass incomplete spec**: Initial plan covered only 7 of 18 acceptance criteria:
  - **Covered**: AppType derivation (C1), response validator (C3), Zod schemas (S1/S2), middleware mounting (C2).
  - **Missed**: web client (S3, S4), ESLint rules (S3), route chaining (C1 extension), schema registration (S2 extension), coverage thresholds (S5).
  - **Root cause**: spec didn't enumerate "all 17 routes" explicitly; instead said "route groups TBD."
- **ESLint rules scope creep**: S3 committed to "two ESLint rules" but deferred due to pre-existing lint baseline (125 warn-level violations). This is accurate but shows the spec didn't account for baseline cleanup burden.

**Process Observations**

1. **Acceptance criteria must be exhaustive**: "Type-safe API layer" is too vague. The spec should have listed "AppType covers 17 routes: products, bets, tasks, artifacts, knowledge, rail, settings, conversations, threads, agents, routines, sessions, status, git-export, notifications, observability, auth." The missing routes weren't detected until Round 2 code review. <!-- @lore AD8a: historical — Rail removed in U6 -->

2. **TypeScript inference gotchas need explicit guardrails**: `typeof app` is syntactically valid but semantically wrong for AppType. The architecture doc said "use chained expression" but didn't say "do NOT use typeof app" with a @lore explanation. A test-based rule (type-assert that AppType.bets exists) would have caught this on red-phase.

3. **Scope clarity on "polish" tasks**: S4 (web client), S5 (coverage thresholds) were marked as "minor" but required the core (S1–S3) to be correct first. Spec should sequence them or clarify dependencies.

4. **Route enumeration pattern**: Future API-surface-changes should spell out the full list (all 17 routes) once in the spec, then reference "all 17" thereafter. Saying "route groups" left ambiguity about whether WebSocket auth routes, test routes, or internal event-bus routes belong to the surface.

**Architecture Observations**

- The `createTypedApiRoutes` function as a type-inference boundary (not a runtime entrypoint) is the right pattern. But it needs guardrails: a comment saying "this function is never called at runtime" and a test asserting all route keys exist on the type.
- The TypedApiRoutesDeps interface worked well for capturing the extra dependencies (/notifications, /observability, /auth need adapter factories, dispatchers, token stores). This pattern is reusable for other route-grouping workpackages.
- Response validator schema registration via module-level Map<string, ZodSchema> is pragmatic but implicit. A registry export would make it testable and extensible.

**Remaining Debt**

1. **ESLint rules (S3)**: Deferred due to pre-existing lint baseline. Two rules (no-inline-config, --max-warnings=0) require housekeeping outside this scope. Filed as tracker issue.
2. **Coverage thresholds (S5)**: Vitest threshold config added but not enforced in CI. CI gate recommended for next phase.
3. **Migration notes for N-S2**: ESLint disable comments (9 occurrences) and pre-existing warns (125) documented in commit message but not tracked in follow-ups.md. Recommend creating FU-api-typesafety-1 for eslint baseline cleanup and FU-api-typesafety-2 for coverage-gate CI enforcement.


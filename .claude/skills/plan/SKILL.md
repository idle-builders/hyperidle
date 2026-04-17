---
name: plan
description: "Produce a task list for a story. Architect reads the spec, adversary challenges it."
argument-hint: "[story-id]"
user-invocable: true
---

# Plan

**Why:** A clear plan prevents wasted implementation time. Without planning, developers build the wrong thing or miss edge cases. The adversary catches errors before they become expensive rework.

Read the story `$ARGUMENTS` in the relevant track file under `docs/work-packages/` (e.g., `TRACK-A.md` for A-stories) and relevant sections of `docs/ARCHITECTURE.md`. Read existing code in affected packages.

Produce:
1. Acceptance criteria — each with a specific verification method (see table below)
2. Ordered task list: what to do, which files, which test proves it, dependencies between tasks
3. Risks or ambiguities

**Every acceptance criterion MUST have a concrete verification method.** "Write a test" is not specific enough. Say exactly what the test does and what it asserts.

| Criterion type | Verification methods |
|---------------|---------------------|
| Schema exists | Migration runs without error; `.schema` output shows expected tables/columns/constraints |
| API endpoint | Integration test hits the endpoint, asserts status code + response shape |
| Type safety | `bun run check` passes with zero errors; exported types are importable from other packages |
| Data integrity | Test inserts violating data (orphan FK, duplicate unique), asserts rejection |
| CRUD operations | Test creates, reads, updates, deletes a row; asserts each operation's result |
| Config/setup | File exists with expected content; importing it doesn't error |
| Seed data | Seed script runs; query confirms ≥1 row per table |
| UI component | Playwright E2E navigates to page, asserts visible elements + interactions |
| Error handling | Test triggers the error path (bad input, missing resource), asserts error response |
| Performance | Benchmark test runs N operations in < X ms |
| Coverage | `bun run test:coverage` shows 100% of new files |
| Dual-driver/compat | Same test suite runs against both SQLite and PostgreSQL |

Then spawn an **adversary agent** to challenge the plan — over-engineering, missing deps, gaps in AC coverage. Address critical issues. Max 1 round.

Save the final plan via TaskCreate so downstream skills can read it.

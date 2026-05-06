# L19 Retro — Harness Jump-Out from Session Metadata

**Date:** 2026-05-06  
**Verdict:** PASS (code review complete, all findings addressed)

---

## Cost Signals

### Commit Summary
- **Total commits:** 10
  - 1 chore (pipeline scaffolding)
  - 5 docs (concept, design, architecture, design-critique, architecture-critique, code-review verdict)
  - 1 test (red phase)
  - 1 feat (implementation)
  - 1 fix (address review findings)
  - 1 final docs (re-review verdict)

### Implementation Effort
- **Lines changed:** 2,082 insertions across 24 files
- **Key files:** Schema migration (7 LOC), API enrichment (78 LOC), frontend rendering (51 LOC + 51 LOC in TaskSheet), tests (407 LOC integration + 147 LOC Vitest + 145 LOC E2E)
- **Review cycles:** 2 (initial finding → fix → re-review)
- **Critical findings:** 2 (Drizzle table references, integration test)
- **Non-blocking findings:** 3 (deduplicate isValidHarnessUrl, case-insensitive URL check, migration timestamp)

### Complexity Assessment
- **Estimated vs Actual:** Small workpackage with routine surface, but non-obvious DB qualification gotcha
- **Schema complexity:** Low (3 additive nullable columns, all optional)
- **Query complexity:** Medium (5 correlated subqueries; critical gotcha in nested-sql identifier qualification)
- **Frontend complexity:** Low (reuse StatusChip, standard affordances, no new components)

---

## Observations

### What Went Well

1. **Upfront design clarity** — Concept phase confirmed L19 uses only existing primitives. No false starts.

2. **Architectural pattern consistency** — L19 directly mirrors L18's correlated-subquery enrichment pattern. Builder had a proven pattern to follow.

3. **Comprehensive design alternatives** — The "Did we consider" section in the design (6 rejected variants with rationale) prevented post-implementation rework. Jump-out placement (TaskSheet + table, not Kanban) was justified early.

4. **Test-driven red phase** — Tests written before implementation (`test(L19): add failing tests`) provided a clear acceptance target.

5. **Integration test coverage** — The code review flagged the missing API-level test. Builder responded with 5 comprehensive integration tests covering edge cases (no session, multi-session ordering, 404 cases) using `createTestDb()` + `createTestApp()`. These became the gold standard for Session enrichment coverage.

6. **Rapid code review turnaround** — Code review identified exactly 2 blockers and 3 non-blockers, all actionable. Fix commit `70f5cb0` addressed all findings in one coherent sweep (Drizzle refs, integration test, deduplication, case-insensitivity, timestamp).

### What Could Be Improved

1. **Drizzle nested-sql qualification gotcha not flagged in architecture** — The critical issue (unqualified `${tasks.id}` in nested subqueries resolves to the wrong table) was discovered during code review, not architecture phase. The plan should have noted this as a known Drizzle pitfall. Pattern: When writing a correlated subquery inside Drizzle's `sql()` template, unqualified table references in the outer scope are resolved by the inner SQL parser against the inner table, not the outer query. Use `sql.identifier()` to force qualification.

2. **Architecture critique flagged "five subqueries vs one" but didn't block** — The architecture-critique correctly noted that five independent `ORDER BY startedAt DESC LIMIT 1` subqueries are overkill (they hit the same session row every time). Plan included a @lore comment but chose clarity over optimization. This is a reasonable design trade-off for Small workpackages, but the critique would have been stronger if it suggested the alternative pattern: a single subquery returning all five columns as a JSON object, then deserialized on the API response.

3. **Migration timestamp ordering was manual** — The schema update required hand-editing the migration timestamp from `1746576000000` to `1777555646095`. This should have been a process that `bun run db:generate` handles. Flag: builder must manually insert migrations when multiple workpackages land in parallel. Suggest a CI check that detects non-monotonic timestamps.

4. **Design critique flagged "primary" token but builder verified on the fly** — The design specified `text-[var(--primary)]` but the token doesn't exist in the current theme. Builder would need to verify at implementation time. Lesson: design should reference tokenized properties that already exist, or explicitly flag new token requirements for inclusion.

### Non-Obvious Decisions and Gotchas

#### The Nested-SQL Qualification Bug (Critical)

**Location:** `packages/server/src/routes/bets.ts`, lines 133–182

When writing correlated subqueries in Drizzle's `sql\`\`` template:

```ts
// WRONG: ${tasks.id} inside nested sql`` resolves to the inner table
latestSessionOutcome: sql\`(SELECT ... WHERE task_id = ${tasks.id})\`

// RIGHT: Force outer-table qualification using sql.identifier()
const outerTaskId = sql\`${sql.identifier("tasks")}.${sql.identifier("id")}\`;
latestSessionOutcome: sql\`(SELECT ... WHERE task_id = ${outerTaskId})\`
```

The builder learned this by reading the code review comment and the integration test (`bets.session-enrichment.test.ts` proves the correct pattern works). The `@lore` comment in bets.ts documents it for the next agent. **This pattern should be added to CLAUDE.md TypeScript rules.**

#### URL Validation Case-Sensitivity

**Original finding:** `isValidHarnessUrl` checked for lowercase `http://` but Zod's `.url()` accepts uppercase schemes, creating a client-server mismatch.

**Resolution:** Extract `isValidHarnessUrl` to a shared utility and normalize: `url.toLowerCase().startsWith(...)`. Simple fix, but teaches: **validation logic duplicated across boundaries (client, server) must be synced. Use shared utilities from the start.**

### Patterns That Should Be Captured

1. **Correlated subquery enrichment via Drizzle** — L18 established this pattern (artifact-thread-summary). L19 reused it. Future workpackages extending API responses should reference this pattern.

2. **Status mapping functions** — The `sessionOutcomeToStatus` function follows the `taskStateToStatus` pattern. It's a Record lookup that guarantees compile-time exhaustiveness. This is the standard way to map domain enums to presentation statuses in HyperIdle.

3. **@lore comments for non-obvious Drizzle usage** — The nested-sql qualification, the choice to use five independent subqueries vs one, the index coverage analysis — these belong as @lore comments in the code so the next agent doesn't re-discover them. Use `/lore` to scan and index.

4. **Design alternatives table** — The "Did we consider" section in the design avoids post-implementation rework. Recommend this pattern for all future UI workpackages.

5. **Integration tests as the gold standard** — The 5 integration tests in `bets.session-enrichment.test.ts` are more valuable than the frontend Vitest tests for proving the core feature works. Use `createTestDb()` + `createTestApp()` for all API changes, not just happy-path unit tests.

---

## Recommendations

### Process Improvements

1. **Flag nested-SQL qualification in architecture critique.** When a story involves Drizzle correlated subqueries, the architecture critique should call out the identifier qualification gotcha as a builder note.

2. **Add a CI check for migration timestamp monotonicity.** The drizzle meta _journal.json should have strictly increasing `when` values (or strictly by `idx`). A lint rule would prevent parallel workpackage conflicts.

3. **Sync validation logic via shared utilities.** When validation appears on both client and server (like URL schemes), extract it to a shared package from the start. Recommend a `packages/web/src/lib/validation.ts` or similar for domain-specific client rules.

4. **Design time: verify CSS tokens exist.** Before approving a design that references CSS custom properties, confirm they exist in the theme. Add a pre-implementation step: "Verify design tokens" in the builder's checklist.

### Technical Patterns to Document

1. **Add Drizzle nested-SQL identifier qualification to CLAUDE.md TypeScript rules.** Example pattern:
   ```ts
   const outerTableId = sql\`${sql.identifier("table_name")}.${sql.identifier("id")}\`;
   const enriched = db.select({
     x: sql\`(SELECT ... WHERE foreign_key = ${outerTableId})\`
   })
   ```

2. **Correlated subquery enrichment pattern (L18 + L19).** Document in `docs/architecture/patterns/api-enrichment.md`:
   - When to use (bounded result sets, < 100 rows per query)
   - Drizzle syntax for subqueries
   - Index coverage (`task_id` for L19, ensure `ORDER BY` columns are indexed)
   - Testing: always write integration tests with real data

3. **Status mapping exhaustiveness.** Record types with enums are self-documenting about required coverage:
   ```ts
   const outcomeToStatus: Record<SessionOutcome, Status> = {
     completed: "done",
     crashed: "error",
     stopped: "paused",
   };
   ```
   This pattern guarantees the mapping is exhaustive at compile time.

4. **Shared validation functions.** Create `packages/web/src/lib/validation.ts` for reusable client-side predicates (URL schemes, email patterns, etc.) that also live on the server. Co-locate the client + server validator in the shared module.

### Process Discipline

1. **Code review completeness.** This review cycle was clean: specific findings, clear rationale for blocking vs non-blocking, builder responded with targeted fixes. Maintain this standard.

2. **Re-review speediness.** The re-review was fast (1 commit, all findings resolved). The builder's fix commit was surgical and correct. Both builder and reviewer understood the scope.

3. **Test evidence.** Integration tests provided irrefutable evidence the API works correctly. This should be the baseline for all data-path stories (queries, mutations, enrichments).

---

## Final Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Commits | 10 | 5 docs, 1 feat, 1 test, 1 fix, 2 chore/admin |
| Review cycles | 2 | Initial + re-review |
| Critical findings | 2 | Drizzle refs (blocking), integration test (blocking) |
| Non-blocking findings | 3 | Deduplication, case-insensitivity, timestamp |
| Test coverage | 11 frontend + 5 integration + 4 mapping = 20 tests | All pass |
| LOC changed | 2,082 | Schema 7, API 78, tests 407+147+145, UI 51+51 |
| Files touched | 24 | 1 schema, 1 API, 2 client, 4 test, 5 plan docs |
| Acceptance criteria | 8/8 | All PASS in re-review audit |

**Status:** READY TO MERGE  
**Verdict:** L19 is complete, tested, and reviewed. All critical findings resolved.


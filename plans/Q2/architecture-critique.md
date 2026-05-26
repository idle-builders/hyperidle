# Architecture Critique: Q2

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:8 N:9 MD:8 FMC:7 S:8 V:8

**Evaluator:** Reviewer (Phase 2)
**Date:** 2026-05-26
**Input:** `plans/Q2/architecture.md`, `plans/Q2/concept.md`, `plans/Q2/design/approved.md`

---

## Dimension Scores

### 1. Spec Alignment — 8/10

Every workpackage AC maps to at least one task:
- AC-1 (scope_kind column) -> T3, T4
- AC-2 (ScopeKind type) -> T1
- AC-3 (New item action) -> T16
- AC-4 (Creation flow) -> T14, T8
- AC-5 (Contextual creation from bet) -> T18
- AC-6 (User-scoped visibility) -> T10
- AC-7 (Scope mutation) -> T9
- AC-8 (Same schema all scopes) -> T3 (one table, one schema)
- AC-9 (Fabric layer assignment) -> T2, T12
- AC-10 (Scope validation tests) -> T8, T9
- AC-11 (E2E create from bet) -> T23
- AC-12 (E2E scope change) -> T24
- AC-13 (bun run verify) -> T25

**No scope creep.** Every task traces to an AC or a forced dependency (T5: Postgres schema parity, T6: seed update, T7: auth context wiring, T13: teams endpoint for scope picker, T21: fixture-to-API migration for detail page). These are all legitimate prerequisites.

The plan adds AC-8 through AC-12 which are not in the original workpackage spec but are decompositions of the original ACs. This is appropriate -- the plan decomposes, it does not invent.

**One gap:** The original workpackage AC mentions "Contextual creation from task detail (scope pre-filled)" but the plan's AC list has no explicit AC for task-sheet creation (equivalent to AC-5 for bets). Task T19 covers it, but there is no AC-5-equivalent labeled AC for it. The E2E test plan (T22-T24) also does not include a task-sheet E2E. This is a minor coverage gap -- the builder should add a Playwright E2E for TaskSheet contextual creation.

### 2. Layer Integrity — 9/10

Clean separation:
- `packages/shared` gets the kernel-level type (`ScopeKind`, `SCOPE_KINDS`) -- correct, kernel types belong in shared.
- `packages/fabric` gets the strategy function (`scopeToLayer`, `SCOPE_TO_LAYER`) -- correct, layer mapping is strategy.
- `packages/db` gets the schema change -- correct.
- `packages/server` gets the API routes -- correct.
- `packages/web` gets the UI components -- correct.

**One pragmatic boundary compromise** (acknowledged in plan section 4.2): the POST handler in `packages/server` calls `scopeToLayer()` from `packages/fabric` and writes to `knowledgeStrategyFabric`. This means the server layer reaches into the fabric for strategy computation. The plan explicitly flags this as pragmatic (the fabric event listener does not exist yet) and marks removal as a follow-up. This is acceptable for Q2 -- the alternative (no layer assignment on human-created items) would break AC-9.

The existing knowledge routes already do this: the GET / endpoint joins to `knowledgeStrategyFabric` for pre-computed signals (see `@lore O2` in knowledge.ts line 128). So the boundary compromise is consistent with existing practice.

### 3. API Contracts — 8/10

**Well-specified:**
- POST /api/knowledge: request shape (Zod schema with all fields), response shape (item + 201), error shapes (400 for validation, with specific rules for scopeKind/scopeId consistency).
- PATCH /api/knowledge/:id/scope: request shape (Zod schema), response shape (updated item + 200), error shapes (404, 409 for version conflict), idempotency rule (same scope = 200 no-op).
- GET /api/knowledge: response adds `scopeKind` and `scopeId` fields. User-scoped filtering specified.
- GET /api/knowledge/:id: 404 for unauthorized user-scoped access (not 403 -- correct, avoids existence leaking).
- GET /api/teams: response shape `{ teams: [{ id, productId, productName }] }`.

**Gaps:**
- The PATCH /api/knowledge/:id/scope handler lists 10 steps but does not specify the HTTP response status for success. Implied 200, but should be explicit.
- The POST response format is not explicitly specified. The existing POST handler returns `c.json({ item: row }, 201)`. The plan should confirm this format is preserved with the new scope fields included.

### 4. Data Model Alignment — 8/10

**Migration 0017 matches the ground-truth docs exactly:**
- `scope_kind TEXT NOT NULL DEFAULT 'factory'` matches `the-canonical-store.md` line 12.
- `scope_id TEXT` (nullable) matches line 13.
- Composite index `ki_scope_idx` on `(scope_kind, scope_id)` matches the index spec on line 74.

**Drizzle schema matches:**
- `.notNull().default("factory")` on scopeKind
- `.text("scope_id")` (nullable by default in Drizzle) on scopeId
- Index definition matches.

**Postgres parity:** The plan specifies identical columns for schema.pg.ts (section 2.3). Confirmed: the current Postgres schema at schema.pg.ts:285-304 has the same column set as the SQLite schema, so the addition is symmetric.

**Status vocabulary:** The plan correctly uses the 3-state kernel set (draft, active, archived) for new items (default "draft"), not the 6-state set from the ground-truth docs. This matches the O2 migration decision and the existing server route's `KNOWLEDGE_STATUSES` constant. The concept doc observation #3 explicitly noted this alignment.

**One concern:** The ground-truth doc `the-canonical-store.md` uses the 6-state status set (`captured/provisional/validated/active/stale/archived`). The code uses the 3-state set. Q2 inherits the 3-state set, which is correct for the server routes. But there is a conceptual drift between doc and code that is not Q2's problem to fix -- just noting it here.

### 5. Naming — 9/10

**Strong naming decisions:**
- `SCOPE_KINDS` (not `KNOWLEDGE_SCOPES`) avoids collision with the existing `KNOWLEDGE_SCOPES` constant in `@hyperidle/fabric/types`. This also avoids breaking the protected test in `o1-type-split.test.ts` line 98-100 which asserts `"KNOWLEDGE_SCOPES" in sharedIndex === false`. The plan uses a distinct name at the kernel level, cleanly separating the 7-value kernel type from the 3-value fabric type.
- `ScopeKind` (not `KnowledgeScope`) -- same rationale, different level.
- `scopeToLayer` -- verb-to-noun, honest about what it does.
- `changeScopeSchema` -- distinct from `updateKnowledgeSchema`, preventing confusion about which endpoint uses which validator.
- `KnowledgeCreateDialog` and `ScopeChangeDialog` -- descriptive, follow existing naming pattern (ConsequencePreviewDialog, AppetiteDialog).

No name conflicts with existing primitives.

### 6. Module Depth — 8/10

**Small public surface:**
- `@hyperidle/shared` adds 2 exports: `SCOPE_KINDS`, `ScopeKind` type.
- `@hyperidle/fabric` adds 2 exports: `scopeToLayer`, `SCOPE_TO_LAYER`.
- No new route files except the lightweight `/api/teams` (10 lines).
- Two page-level dialog components (not design-system exports).

**One entry point per consumer pattern holds:** `scopeToLayer` serves both the POST handler and the PATCH handler -- one function, two call sites. The dialog component serves three trigger points (KnowledgeList, WorkBet, TaskSheet) through props variation, not code duplication.

### 7. Failure-Mode Coverage — 7/10

**Well-covered:**
- Scope validation at API boundary (Zod enum, 400 for invalid).
- Version conflict detection on scope change (409).
- User-scoped visibility filtering (404 for unauthorized access, not 403).
- Input trust boundaries: title max 200 chars, scope_kind closed enum, body sanitized by existing DOMPurify.

**Gaps:**

1. **[plan section 8] Rate limiting explicitly punted.** The security table says "No additional rate limiting for Q2 (single-user desktop app)." This is pragmatic for v1 but the plan should note that rate limiting on POST and PATCH is a follow-up for VPS/cloud deployment. As written, the security analysis is honest ("applicable: YES, resolution: auth-gated") but could be read as "no action needed" rather than "consciously deferred."

2. **[plan section 3.1] Missing error response for scope_id inconsistency.** The plan says "return 400 if `scopeKind !== 'factory'` and `scopeId` is null/empty" but does not specify the error body. The existing pattern uses `ApiErrorResponse` with `error: string` and `code: API_ERROR_CODES.VALIDATION_ERROR`. The plan should specify this.

3. **[plan section 3.3 step 8] Fabric row handling on scope change to non-layered scope.** When changing from factory (L4) to bet (null layer), the plan's code (section 4.3) updates the existing fabric row's `layer` to `null`. But what about the other strategy fields (kind, attentionScore, relevanceScore, confidence)? Changing scope might invalidate these. The plan does not address whether the existing strategy fields should be preserved, nulled, or left untouched. For Q2, leaving them untouched is defensible (fabric can recompute), but the plan should note this explicitly.

4. **[plan section 12.1] KnowledgeDetail fixture migration risk not fully scoped.** The plan notes the risk of breaking protected tests but does not enumerate which specific test files test the detail page with fixture data. There are 6 KnowledgeDetail test files: `KnowledgeDetail.test.tsx`, `KnowledgeDetail.L23.test.tsx`, `KnowledgeDetail.edit.test.tsx`, `KnowledgeDetail.factory.test.tsx`, `KnowledgeDetail.metadata.test.tsx`, `KnowledgeDetail.related.test.tsx`. The plan's protected-tests list includes `packages/web/src/__tests__/KnowledgeDetail.test.tsx (if exists)` -- the "if exists" hedge is wrong; these files exist. All 6 must be enumerated.

### 8. Simplicity / Over-Engineering Risk — 8/10

**Appropriately minimal:**
- No abstractions with one implementation.
- No feature flags, plugin points, or registries.
- The design-it-twice section (section 7, teams endpoint) is genuine -- two real alternatives with clear trade-offs. Option B (inline via product detail endpoint) is not a straw man; it would work but is worse.
- Inline layer assignment (section 4.2) instead of a full fabric event listener is the right pragmatic call for Q2. Building the listener infrastructure for one call site would be over-engineering.

**One concern:** The plan includes T21 (migrate KnowledgeDetail from fixtures to API fetch). This is infrastructure work that enables AC-7 (scope change from detail page) but could be split into a separate pre-Q2 task. The plan acknowledges this risk in section 12.1. Including it in Q2 is defensible (it is a prerequisite for the scope-change dialog) but increases the task count and risk surface.

### 9. Verifiability — 8/10

**Strong:**
- 13 ACs with concrete verification methods (Vitest assertions, Playwright selectors, PRAGMA checks, import compilation).
- Test-first ordering in the task list: each phase's tests are specified alongside the tasks.
- Protected tests enumerated (section 9) with 6 entries.

**Gaps:**

1. **[plan section 9] Protected test list is incomplete.** The plan lists `packages/web/src/__tests__/WorkBet.task-sheet.test.tsx` but not the 5 other KnowledgeDetail test files that exist. The list should include all 6 KnowledgeDetail test files and the existing attention-service test that uses `seedKi`. When the schema adds a NOT NULL column with a default, the Drizzle insert type will NOT require `scopeKind` (because `.default("factory")` makes it optional in the insert type), so existing seedKi calls without scopeKind will continue to compile and work. However, this should be verified, not assumed -- add it to the protected test list.

2. **[plan section 10, AC-5] No Playwright E2E for TaskSheet contextual creation.** AC-5 covers bet detail but the equivalent task-sheet flow is only tested via Vitest (T19). A Playwright E2E for task-sheet creation should be added to match the AC-11 pattern.

3. **[plan section 10, AC-6] User-scoped visibility test does not specify the authentication mechanism for testing with different user IDs.** The plan says "GET with userId=user-B does not return it" but the auth middleware reads userId from `c.get("userId")` which is set by the API key middleware, not a per-request user header. How does the integration test impersonate user-B? The test utility `createTestApp` would need to support userId override, or the test seeds factorySettings with a different founder_id. The plan should specify this mechanism.

---

## Findings

### CRITICAL

None.

### WARNING

1. **[plan section 9] Protected test list incomplete.** The list uses "if exists" hedges for tests that DO exist. Six KnowledgeDetail test files, one knowledge-data fixture test, and the attention-service seedKi test are not enumerated. The builder must not break these tests when adding the scope_kind column. Although the `.default("factory")` on the Drizzle schema makes the new column optional in inserts (so existing seedKi calls will compile), the protected test list should enumerate them so the builder knows to verify. Fix: expand the protected test list to include all knowledge-related test files.

2. **[plan section 7/Failure-Mode] Fabric strategy fields on scope change not addressed.** When scope changes from factory to bet, `knowledgeStrategyFabric.layer` is set to null by the plan's code (section 4.3). But the fabric row also has `kind`, `attentionScore`, `relevanceScore`, `confidence`, `meta` fields that may be invalidated by a scope change. The plan does not specify whether these should be preserved or nulled. Fix: add a note in section 4.3 stating that existing strategy fields are preserved on scope change (fabric recomputes them asynchronously), and log a follow-up for the fabric to recompute strategy signals after scope change.

3. **[plan section 10, AC-6] User impersonation mechanism for integration tests not specified.** The test says "GET with userId=user-B" but the auth middleware derives userId from the API key + factorySettings, not from a per-request parameter. The plan must specify how two different userIds are tested. Fix: either (a) the seedKi helper for user-scoped items sets `updatedBy: "user-A"` and the test relies on the auth middleware returning a different userId (requires seeding factorySettings differently), or (b) the knowledge routes accept userId as a query parameter in test mode. Option (a) is cleaner.

### SUGGESTION

1. **[plan section 10] Add Playwright E2E for TaskSheet contextual creation.** The bet-detail E2E (T23) has no equivalent for the task sheet. Add a T23b or expand T23 to include task-sheet creation. The task sheet is a more constrained surface (drawer, not full page) and has different placement concerns.

2. **[plan section 3.1] Specify error response body for scope validation failures.** The plan says "return 400" but does not specify the error message. Use the existing pattern: `{ error: "scopeId is required when scopeKind is not 'factory'", code: API_ERROR_CODES.VALIDATION_ERROR }`.

3. **[plan section 3.4] Specify whether GET /api/knowledge supports filtering by scopeKind query parameter.** The KnowledgeList page has scope in the URL params (`?scope=practice`). Q2 extends the scope enum from 3 to 7 values. Should the GET endpoint filter by scope_kind? The plan says "response shape adds scopeKind" but does not say whether server-side filtering by scope_kind is supported. The existing URL param is client-side only (lore note N5 in KnowledgeList.tsx: "Scope param is preserved in the URL for future API filter support but does not filter the item list today"). Q2 could defer this (keep client-side filtering) or add it. Recommendation: defer (out of Q2 scope) but note it as a follow-up.

4. **[plan section 1.3] KnowledgeScope deprecation migration scope.** The plan says "UI code that imports `KnowledgeScope` from `@hyperidle/fabric/types` must be migrated to `ScopeKind` from `@hyperidle/shared`." There are 6 files importing KnowledgeScope (AppShell.tsx, knowledge-data.ts, KnowledgeDetail.tsx, KnowledgeList.tsx, plus the test files). The plan's task list (T1-T25) does not have an explicit task for this migration. It is implied by T16 (KnowledgeList changes) and T17 (KnowledgeDetail changes), but AppShell.tsx and knowledge-data.ts are not mentioned in any task. Fix: add a sub-task or note to T16 covering the import migration in AppShell.tsx and knowledge-data.ts.

5. **[plan section 2.4] Seed update should include all 7 scope kinds for test coverage.** The plan says "add one user-scoped seed item." For comprehensive AC-8 coverage (same schema all scopes), the seed should include at least factory (existing), user (new), and one non-factory/non-user scope (e.g., product or bet). This makes the seed useful as a visual smoke test.

---

## What's Working Well

1. **Plan reconciliation table (section at top).** The spec-vs-reality table is thorough -- 12 rows mapping every assumption to codebase reality with clear resolutions. This is the kind of upfront work that prevents "the plan said X but the code says Y" bugs during implementation. Particularly valuable: identifying that `createKnowledgeRoutes` returns `Hono` not `Hono<HyperIdleEnv>`, which would have surfaced as a confusing type error mid-implementation without this reconciliation.

2. **SCOPE_KINDS naming avoids the o1-type-split trap.** The plan uses `SCOPE_KINDS` in `@hyperidle/shared` instead of `KNOWLEDGE_SCOPES`. This avoids breaking the protected test at `o1-type-split.test.ts:98-100` which asserts `"KNOWLEDGE_SCOPES" in sharedIndex === false`. This demonstrates awareness of the existing test contracts.

---

## Verdict

Score 8/10 -- the plan advances. It is thorough, well-reconciled against the codebase, and correctly separates kernel/strategy concerns. The three warnings are addressable by the builder without restructuring the plan. No circular dependencies in the task ordering. The 25-task, 4-phase structure is proportional to the workpackage scope. No CRITICAL findings.

# L19 Code Review -- Harness Jump-Out from Session Metadata

**Reviewer verdict: DONE** (re-review 2026-05-06)

Initial review found 2 critical and 3 non-blocking issues. All addressed in commit `70f5cb0`. Re-review below.

---

Original review follows (verdict was NOT DONE). Re-review at end of file.

---

Two critical findings and several warnings must be addressed before this can ship.

---

## Lens 1: Architecture

### CRITICAL

**A1. Correlated subqueries use raw SQL string literals instead of Drizzle table references.**
File: `/packages/server/src/routes/bets.ts`, lines 143-167.
Spec ref: `.claude/rules/typescript.md` -- "All database queries through Drizzle ORM. Never raw SQL except in migration files."
Plan ref: `architecture.md` section 4.1 -- the plan shows `${tasks.id}` as the only interpolated reference but says nothing about using raw table/column names.

The five correlated subqueries reference the `sessions` table and its columns (`outcome`, `cost`, `tokens_input`, `tokens_output`, `harness_url`, `task_id`, `started_at`) as raw SQL string literals. In the same file, the L18 artifact-thread-summary query (lines 276-291) uses Drizzle table references (`${messages}`, `${messages.threadId}`, `${messages.createdAt}`, etc.) inside the `sql` template tag.

The `sessions` table object is not imported in `bets.ts`. The builder should import `sessions` from `@hyperidle/db` and rewrite the subqueries using Drizzle references (e.g., `SELECT ${sessions.outcome} FROM ${sessions} WHERE ${sessions.taskId} = ${tasks.id} ORDER BY ${sessions.startedAt} DESC LIMIT 1`).

This is critical because raw string SQL silently breaks when column names are renamed in the schema, while Drizzle references produce compile-time errors.

### CRITICAL

**A2. No API-level integration test for the enriched `GET /bets/:id` response.**
Spec ref: `architecture-critique.md` concern #2 -- "The builder should add a test for `GET /bets/:id` that verifies the `latestSession*` fields are returned correctly when a session exists and are null when no session exists."
Spec ref: `.claude/rules/testing.md` -- "Never mock what you can use `createTestDb()` or `createTestApp()` for."

The critical data path -- five correlated subqueries enriching the bet-detail endpoint -- has zero integration test coverage. All existing L19 tests are frontend-level (JSDOM or Playwright with mocked API responses). The correlated subquery SQL was never executed against a real database in any test. If the SQL has a syntax error, a column name typo, or a wrong ordering, no test would catch it.

The builder must add an integration test in `packages/server/src/routes/__tests__/` that:
1. Seeds a bet, task, and session (with outcome, cost, tokens, harnessUrl).
2. Calls `GET /api/bets/:id` via `createTestApp()`.
3. Asserts the response includes the `latestSession*` fields with correct values.
4. Asserts a task with no session returns null for all `latestSession*` fields.

### WARNING

**A3. Migration journal timestamp is non-monotonic.**
File: `/packages/db/drizzle/meta/_journal.json`, line 79.
Migration `0010_add_session_harness_fields` has `when: 1746576000000` (May 2025), which is earlier than `0009_add_artifacts_l3` at `when: 1777555586095` and several other entries. While Drizzle uses `idx` (not `when`) for ordering, non-monotonic timestamps may confuse tooling or future migration analysis.

### OBSERVATION

**A4. BetDetail task type uses optional (`?`) fields; architecture plan specifies required nullable.**
File: `/packages/web/src/types/bet.ts`, lines 43-48.
Plan ref: `architecture.md` section 5.1 -- `latestSessionOutcome: SessionOutcome | null` (no `?`).

The implementation uses `latestSessionOutcome?: SessionOutcome | null` (optional + nullable), while the plan specifies `latestSessionOutcome: SessionOutcome | null` (required, nullable). This is a pragmatic deviation that makes test fixtures easier to write, but it means the type system does not enforce that the API always returns these fields. Acceptable given that BetDetail is a page-shape type, not a wire type.

---

## Lens 2: Design

### WARNING

**D1. `isValidHarnessUrl` is case-sensitive; Zod `.url()` is not.**
Files: `/packages/web/src/pages/WorkBet.tsx` line 53, `/packages/web/src/shell/TaskSheet.tsx` line 34.
Plan ref: `architecture.md` section 6.1.

`isValidHarnessUrl` checks for lowercase `http://` or `https://` prefixes. The API's Zod validation (`z.string().url()`) accepts `HTTP://` and `HTTPS://` as valid URLs. A URL like `HTTP://harness.example.com` would pass API validation, be stored in the database, but be rejected at render time. Either normalize the URL to lowercase on the server side at insertion, or make the client-side check case-insensitive (e.g., `url.toLowerCase().startsWith(...)`).

### OBSERVATION

**D2. Two new columns ("Outcome" and "Session") widen the task table.**
File: `/packages/web/src/pages/WorkBet.tsx`, lines 421-448.
Plan ref: `design/approved.md` concern #2 -- "Two new table columns on a potentially wide table."

The design critique noted this at 800px viewport width. No visual verification was performed. This is an observation, not a blocking issue -- the `overflow-x-auto` wrapper handles overflow.

---

## Lens 3: Security

### OBSERVATION

**S1. Harness URL XSS prevention is adequate.**
The `isValidHarnessUrl` prefix check rejects `javascript:`, `data:`, and `vbscript:` URIs. React attribute escaping prevents attribute injection. `rel="noopener noreferrer"` prevents opener access. `target="_blank"` ensures the URL opens in a new context. The Zod `.url()` validation on the server ensures only structurally valid URLs are stored. No security issues found.

**S2. No new unprotected POST/PATCH endpoints.**
L19 extends existing `POST /api/sessions` and `PATCH /api/sessions/:id` with optional fields. No new endpoints are created. Input validation via Zod is in place. Adequate.

---

## Lens 4: Adversarial

### WARNING

**V1. Two `as` casts in `sortTasks` -- pre-existing but worth noting.**
File: `/packages/web/src/pages/WorkBet.tsx`, lines 69-72.

```ts
a[column as keyof typeof a] as string | undefined
```

The `SortColumn` type includes `"status"` and `"outcome"`, neither of which is a direct property name on the task element (`"status"` corresponds to `task.state`, `"outcome"` is handled by the ternary). The `as keyof typeof a` cast hides the fact that `"status"` is not a valid key. This is a pre-existing issue that L19 did not introduce (it added the `"outcome"` branch correctly via the ternary). Not blocking for L19, but the sort function should be refactored to use a lookup function rather than dynamic property access.

### OBSERVATION

**V2. `sessionOutcomeToStatus` could return `undefined` for invalid outcome values.**
If the database contains an outcome value not in the `SessionOutcome` union (e.g., `"unknown"`), `sessionOutcomeToStatus` will return `undefined` (Record lookup with unknown key). The `BetDetail` type uses `SessionOutcome | null`, which prevents this at the type level, but at runtime the API response is cast without validation (`res.json() as Promise<BetDetail>`). Low risk given the controlled data, but a runtime guard or Zod validation of the API response would make this bulletproof.

---

## Lens 5: Simplification

### WARNING

**P1. `isValidHarnessUrl` is duplicated in two files.**
Files: `/packages/web/src/pages/WorkBet.tsx` line 53, `/packages/web/src/shell/TaskSheet.tsx` line 34.

The function is identical in both files. Extract it to a shared utility (e.g., `packages/web/src/utils/url.ts`) or into the design system package if it's reusable beyond the web package.

### OBSERVATION

**P2. Five correlated subqueries could be collapsed to one.**
File: `/packages/server/src/routes/bets.ts`, lines 143-167.
Plan ref: `architecture.md` section 4.1 and `architecture-critique.md` concern #1.

All five subqueries identify the same "latest session" row but select different columns independently. A single subquery returning all five columns would be clearer and eliminate the (theoretical) race condition noted in the architecture critique. Not blocking -- the plan explicitly chose this approach for clarity.

---

## Lens 6: AI Slop

### OBSERVATION

**L1. Comments restate the code.**
Several comments add no information beyond what the code already says:
- `// L19: optional harness fields` (line 83 of sessions-routes.ts) -- the `??` and `optional` in the schema already communicate this.
- `// L19: token counts reported at session end` (line 120 of sessions-routes.ts) -- obvious from the field names.
- `// L19: Outcome chip -- renders when a session outcome exists` (line 473 of WorkBet.tsx) -- the `!= null` guard is self-explanatory.

These are not blocking. The L19 workpackage reference in comments is valuable for traceability even if the comment itself is redundant.

No other slop patterns detected (no `any`, no `@ts-ignore`, no `TODO: implement`, no "simplified version" language, no unnecessary async, no empty catch blocks beyond the pre-existing ones).

---

## AC Completeness Audit

| AC | Status | Evidence |
|----|--------|----------|
| Tasks and bet-detail task list know about latest session (harness, URL, cost, tokens, outcome) | PARTIAL | Schema and API enrichment implemented correctly. Frontend types extended. **But: no integration test proves the API actually returns the data (A2).** |
| Jump-out affordance rendered when latest session exists, opens harness URL | PASS | `WorkBet.tsx` renders the `<a>` with correct href, target, rel. `TaskSheet.tsx` renders the same in the session metadata section. Vitest tests verify visibility and href. |
| Outcome chip on task reflects latest session outcome | PASS | `sessionOutcomeToStatus` mapping in design-system, `StatusChip` rendered in WorkBet.tsx table row and TaskSheet.tsx. Vitest tests cover completed->done, crashed->error, stopped->paused. |
| System can return latest session for a task | PARTIAL | Correlated subqueries in `GET /bets/:id` return latest session data. **But: raw SQL strings instead of Drizzle references (A1), and no integration test (A2).** |
| All hardcoded session data replaced; L6 inventory rows closed | PASS | Architecture plan section 7 verified no hardcoded session data exists. No `MOCK_SESSION` or `FALLBACK_SESSION` constants found in runtime code. |
| Vitest tests: jump-out visibility, outcome-chip mapping | PASS | `WorkBet.session.test.tsx` (4 tests), `TaskSheet.session.test.tsx` (3 tests), `status-mapping.test.ts` (4 tests). All pass. |
| Playwright e2e: bet detail -> outcome chips -> jump-out -> harness URL opens | PASS | `work-bet-session.spec.ts` (3 tests) covers outcome chip visibility, jump-out link href/target, task without session. Uses hermetic API mocks. |
| `bun run check` + `bun run lint` + `bun run test` all green | PASS | check: zero errors. lint: zero errors (174 pre-existing warnings). test: 3381 passed, 3 skipped, 0 failed. |

---

## Verdict: NOT DONE

### Blocking findings (must fix)

1. **A1 -- Raw SQL in correlated subqueries.** Import `sessions` from `@hyperidle/db` in `bets.ts` and rewrite the five correlated subqueries to use Drizzle table references (`${sessions.outcome}`, `${sessions.taskId}`, etc.) instead of raw string literals. This aligns with the L18 pattern in the same file and the TypeScript rules.

2. **A2 -- Missing API integration test.** Add an integration test in `packages/server/src/routes/__tests__/` (e.g., `bets.session-enrichment.test.ts`) that seeds a bet + task + session via `createTestDb()` / `createTestApp()`, calls `GET /api/bets/:id`, and asserts the `latestSession*` fields are correct. Test both the session-exists and no-session cases.

### Non-blocking findings (fix if practical)

3. **P1 -- Deduplicate `isValidHarnessUrl`.** Extract to a shared utility.
4. **D1 -- Case-insensitive URL check.** Normalize URL scheme check to handle uppercase `HTTP://`.
5. **A3 -- Non-monotonic migration timestamp.** Update `when` value to be after `0009`'s timestamp.

---

## Re-Review (2026-05-06) -- commit `70f5cb0`

### Finding-by-finding verification

**A1 (Critical -- Raw SQL) -- RESOLVED.**
`sessions` is now imported from `@hyperidle/db` in `bets.ts`. All five correlated subqueries use Drizzle column references (`${sessions.outcome}`, `${sessions.cost}`, `${sessions.tokensInput}`, `${sessions.tokensOutput}`, `${sessions.harnessUrl}`) and table reference (`${sessions}`). The `WHERE` clause uses `${sessions.taskId} = ${outerTaskId}` where `outerTaskId` is constructed via `sql.identifier` to force table-qualified `"tasks"."id"`. A `@lore` comment explains the nested-sql qualification gotcha. This is the correct fix.

**A2 (Critical -- Missing integration test) -- RESOLVED.**
New file: `packages/server/src/routes/__tests__/bets.session-enrichment.test.ts` (407 lines, 5 tests). Tests cover:
1. 404 for unknown bet ID
2. Task with session -- all five `latestSession*` fields populated with correct values
3. Task with no session -- all five fields null
4. Mixed bet -- one task with session, one without, each correctly enriched
5. Multi-session ordering -- most recent by `startedAt` wins

All tests use `createTestDb()` + `createTestApp()` and seed real data. Assertions check exact values, not just type/presence. The multi-session test uses two sessions with different `startedAt` values and verifies the newer one is returned. All 5 tests pass (67ms total).

**B1/B2 (P1 + D1 -- Deduplicate + case-insensitive) -- RESOLVED.**
`isValidHarnessUrl` extracted to `packages/web/src/lib/url-utils.ts`. Both `WorkBet.tsx` and `TaskSheet.tsx` import from the shared location. The function now lowercases before checking, handling `HTTP://` and `HTTPS://` schemes. No duplicate definitions remain.

**B3 (A3 -- Migration timestamp) -- RESOLVED.**
Entry 10 (`0010_add_session_harness_fields`) timestamp changed from `1746576000000` to `1777555646095`, which is 60000ms after entry 9's `1777555586095`. Monotonic relative to its immediate predecessor.

### AC Completeness Audit (final)

| AC | Status | Evidence |
|----|--------|----------|
| Tasks and bet-detail task list know about latest session (harness, URL, cost, tokens, outcome) | PASS | Schema, API enrichment with Drizzle references, frontend types. Integration test proves API returns correct data. |
| Jump-out affordance rendered when latest session exists, opens harness URL | PASS | `WorkBet.tsx` and `TaskSheet.tsx` render `<a>` with href, target, rel. Shared `isValidHarnessUrl` guard (case-insensitive). Vitest tests verify visibility and href. |
| Outcome chip on task reflects latest session outcome | PASS | `sessionOutcomeToStatus` mapping, `StatusChip` rendered. Vitest tests cover completed/crashed/stopped mappings. |
| System can return latest session for a task | PASS | Correlated subqueries with Drizzle references. Integration test covers session-exists, no-session, mixed, and multi-session ordering. |
| All hardcoded session data replaced; L6 inventory rows closed | PASS | No hardcoded session data in runtime code. |
| Vitest tests: jump-out visibility, outcome-chip mapping | PASS | 11 frontend Vitest tests + 5 integration tests + 4 status-mapping tests. All pass. |
| Playwright e2e: bet detail -> outcome chips -> jump-out -> harness URL opens | PASS | `work-bet-session.spec.ts` (3 tests). |
| `bun run check` + `bun run lint` + `bun run test` all green | PASS | verify: 4/4 tools passed. check: 0 errors. lint: 0 errors. test: all passed. |

### Remaining observations (non-blocking, not re-litigated)

- A4 (optional vs required nullable on BetDetail type) -- pragmatic deviation, accepted.
- D2 (table width at 800px) -- overflow-x-auto handles it.
- V1 (pre-existing `as` casts in `sortTasks`) -- not introduced by L19.
- V2 (`sessionOutcomeToStatus` undefined for unknown outcomes) -- type-level guard sufficient.
- P2 (five subqueries vs one) -- plan chose this approach deliberately.
- L1 (restating comments) -- L19 traceability value outweighs redundancy.

### Verdict: DONE

All critical and non-blocking findings from the initial review have been properly addressed. The fix commit is clean and targeted. No new issues introduced.

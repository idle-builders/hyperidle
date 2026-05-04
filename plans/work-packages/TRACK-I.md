# Track I: Hardening & Quality

Post-implementation hardening track. Fixes bugs, security issues, data integrity gaps, UX conformance, and test coverage identified during the comprehensive 12-agent review.

See `docs/work-packages/SHARED.md` for tech stack, shared contracts, and dependency graph.

---

### I1 — Production Server + Data Integrity Fixes

**Story.** As the system, I want the production server to actually serve domain routes, handoff operations to preserve data integrity, and bet state transitions to be atomic, so that the core system works correctly and does not silently corrupt data.

**Depends on.** None (all referenced code exists on main).

**Acceptance criteria.**

_Server entrypoint:_
- `bun dev` starts a server where `GET /api/status/health` returns 200 AND all domain routes (bets, tasks, knowledge, conversations, agents, sessions, rail, status, notifications, observability, git-export, routines) return non-404 responses.
- `index.ts` uses `createApp()` from `app.ts` (or `server-factory.ts` delegates to it), preserving WebSocket support.
- E2E test: `GET /api/bets` returns 200 with valid JSON (not 404).
- E2E test: `POST /api/conversations/items` with valid payload returns 201 (not 404).
- E2E test: WebSocket upgrade at `/ws?token=<key>` succeeds.

_Handoff data integrity:_
- Handoff protocol writes audit entries to `tasks.auditTrail`, not `tasks.notes`.
- `revertTaskToAccepted` in session-provisioning writes to `tasks.auditTrail`, not `tasks.notes`.
- Handoff does NOT set `sessions.cost = 0` — accumulated cost is preserved.
- Unit test: after handoff, `tasks.notes` is unchanged from pre-handoff value.
- Unit test: after handoff, `tasks.auditTrail` contains the handoff entry.
- Unit test: after handoff, `sessions.cost` equals the pre-handoff accumulated cost.

_Bet state atomicity:_
- `transitionBet` wraps the team `activeBets` update and bet row update in a single `db.transaction()`.
- Unit test: concurrent bet commits to the same team do not produce a stale counter (test with two sequential commits, verify `activeBets` increments correctly to 2).
- Unit test: if bet update fails inside the transaction, `activeBets` is not incremented (rollback).

_EventBus resilience:_
- `EventBus.emit()` wraps each handler invocation in try/catch, logs the error, and continues to the next handler.
- Unit test: a throwing handler does not prevent subsequent handlers from receiving the event.
- Unit test: the error is logged (mock logger).

**Validation scenarios.**
- Given server started via `index.ts`, when `GET /api/bets` is called, then 200 response with JSON body.
- Given a task with notes "agent prose", when handoff occurs, then `tasks.notes` still contains "agent prose" and `tasks.auditTrail` contains the handoff entry.
- Given a session with accumulated cost 150, when handoff occurs, then `sessions.cost` remains 150.
- Given two bets committed to the same team, when both transitions complete, then `teams.activeBets` equals 2.
- Given EventBus with two handlers where the first throws, when event emitted, then second handler still fires.

**Contracts / constraints.**
- `server-factory.ts` and `app.ts` must converge to a single app construction path. WebSocket must work in both test and production.
- EventBus error handling must not change the synchronous-after-durability contract — handlers still run synchronously, but failures are isolated.
- All existing tests must continue to pass after these changes.

**Effort.** L (~4d)

---

### I2 — Security Hardening

**Story.** As the system, I want agent sessions sandboxed with minimal credentials, API authentication hardened, and input validation tightened, so that a compromised agent cannot access host resources or bypass security controls.

**Depends on.** I1.

**Acceptance criteria.**

_Agent sandbox:_
- Claude SDK adapter passes an allow-listed environment to agent sessions: only `PATH`, `HOME`, `LANG`, `ANTHROPIC_API_KEY`. No `HYPERIDLE_API_KEY`, no database URLs, no SMTP credentials.
- `allowDangerouslySkipPermissions` is removed or gated behind an explicit `HYPERIDLE_UNSAFE_AGENT_MODE=true` env var that logs a warning on startup.
- Local workspace adapter refuses to instantiate when `NODE_ENV === "production"`.
- Docker workspace adapter uses `spawn` with argument arrays (not shell string interpolation) for `docker exec`.
- Unit test: agent session environment does not contain `HYPERIDLE_API_KEY`.
- Unit test: Docker adapter `exec` with shell metacharacters in command does not execute them on the host.

_Authentication:_
- API key comparison uses `crypto.timingSafeEqual` (or equivalent constant-time comparison).
- WebSocket authentication uses a short-lived upgrade token (obtained via authenticated REST endpoint) instead of the API key in the query string.
- Server refuses to start if `HYPERIDLE_API_KEY` is not set (explicit error message, not silent failure).
- Unit test: timing-safe comparison is used (verify `crypto.timingSafeEqual` is called).
- Unit test: WebSocket rejects expired or reused upgrade tokens.

_Input validation:_
- `transitionTaskSchema` uses `z.enum([...valid states])` instead of `z.string()`.
- `updateBetSchema.field` uses `z.enum(["done_condition", "hypothesis", "appetite"])`.
- Knowledge layer path parameter is validated against `["L0", "L1", "L2", "L3", "L4"]`.
- Knowledge search query escapes LIKE wildcards (`%`, `_`) before constructing the pattern.
- `PATCH /status/settings` blocks keys with `git_export.`, `notifications.`, `observability.` prefixes.
- Unit test per validation fix: invalid input returns 400, not 500.

_Rate limiting:_
- Global rate limiting middleware added (configurable per-IP or per-key).
- Request body size limit middleware (1MB default, configurable).
- Unit test: exceeding rate limit returns 429.
- Unit test: oversized body returns 413.

_Role-based tool access:_
- `buildToolRegistry` accepts agent role and filters tools via `toolsForRole()`.
- Builder agents cannot invoke facilitator tools (`promote_knowledge`, `route_item`, `score_attention`, `create_conflict_review`).
- Unit test: builder registry does not contain `promote_knowledge`.
- Unit test: facilitator registry contains all tools.

**Validation scenarios.**
- Given agent session started, when agent reads env vars, then `HYPERIDLE_API_KEY` is not present.
- Given Docker adapter, when agent sends command `$(cat /etc/passwd)`, then command is passed as literal string to container, not interpreted by host shell.
- Given `HYPERIDLE_API_KEY` not set, when server starts, then process exits with error message.
- Given `PATCH /tasks/:id` with `{ state: "banana" }`, when request processed, then 400 returned with Zod validation error.
- Given builder agent, when invoking `promote_knowledge`, then tool not found error returned.

**Contracts / constraints.**
- Rate limiting must not add >1ms latency to normal requests.
- Timing-safe comparison must handle different-length keys correctly.
- Tool registry role filtering must be enforced at the registry level, not per-tool.
- All existing tests must continue to pass (update test helpers if needed for env changes).

**Effort.** L (~4d)

---

### I3 — Data Layer & Schema Fixes

**Story.** As the system, I want database queries to be efficient, schema constraints to prevent orphan data, knowledge scoring to be mathematically correct, and the FTS system to be safe from injection, so that the system scales correctly and produces accurate results.

**Depends on.** I1.

**Acceptance criteria.**

_Indexes:_
- Secondary indexes added on: `tasks(bet_id)`, `tasks(team_id)`, `tasks(product_id)`, `sessions(task_id)`, `sessions(agent_id)`, `sessions(state)`, `items(thread_id)`, `messages(thread_id)`, `bets(product_id)`, `bets(status)`.
- Migration generated and applied for both SQLite and PostgreSQL schemas.
- Query plan test: `EXPLAIN QUERY PLAN` for `SELECT * FROM tasks WHERE bet_id = ?` shows index usage (not full scan).

_Foreign key constraints:_
- Reference data FKs (`products`, `agents`, `teams`, `threads`) use `ON DELETE RESTRICT`.
- Dependent data FKs (`knowledge_edit_log` on `knowledge_items`) use `ON DELETE CASCADE`.
- Migration generated for both schemas.
- Unit test: deleting a product with active teams fails with constraint error.

_Dependency watcher optimization:_
- `checkAndUnblockDependents` uses SQL-level filtering (WHERE `dependencies LIKE '%completedTaskId%' AND state = 'hold'`) instead of loading all tasks.
- Benchmark: with 500 tasks, completes in <10ms (not loading all into memory).

_Knowledge optimistic locking:_
- `knowledge-repository.update()` adds `eq(knowledgeItems.version, expectedVersion)` to the UPDATE WHERE clause.
- Checks `changes === 0` to detect version conflicts.
- Unit test: concurrent updates to the same item — second update throws `VersionConflictError`.

_Relevance scoring fix:_
- `computeConfidence()` removes the `/100` division — values are already in [0,1].
- `computeAttentionScore()` removes the `/100` division.
- Unit test: item with `confidence: 0.8` scores confidence factor as `0.8`, not `0.008`.

_FTS sanitization:_
- `ftsSearch()` sanitizes query input: strips or escapes FTS5 operators (`AND`, `OR`, `NOT`, `NEAR`, `*`, `{`, `}`, `(`, `)`, `"`, `^`).
- Unit test: query containing `*` does not match everything.
- Unit test: query containing unbalanced quotes does not throw.

_Cost cap memory leak:_
- `emittedEvents` Set replaced with a bounded structure (LRU cache or per-session scoping).
- Entries cleaned up when sessions end.
- Unit test: after 1000 session cost checks, dedup cache size stays bounded.

_PG schema alignment:_
- Boolean columns (`delegationAllowed`, `humanReview`, `silent`, `active`, `pinned`, `blocking`, `crossTeam`) use `boolean()` in PG schema.
- PG seed script has parity with SQLite seed (same agents, team, bet, task, routines, knowledge items).
- Schema parity test updated to account for boolean vs integer dialect difference.

**Validation scenarios.**
- Given 500 tasks in database, when task completed, then `checkAndUnblockDependents` completes in <10ms.
- Given item at version 5, when two concurrent updates both read version 5, then only one succeeds and the other throws `VersionConflictError`.
- Given knowledge item with `confidence: 0.8`, when relevance scored, then confidence factor equals `0.8`.
- Given FTS query `test* OR admin`, when searched, then FTS operators are escaped and treated as literal text.

**Contracts / constraints.**
- Migrations must be additive (no data loss).
- Index additions are backward-compatible.
- Relevance scoring changes will alter materialization ranking — verify with existing attention scoring tests.

**Effort.** L (~4d)

---

### I4 — Frontend Correctness & Spec Conformance

**Story.** As a founder, I want the UI to match the specification (correct page composition, working status displays, functional search, keyboard accessibility, and error resilience), so that I can use the application as designed without encountering crashes or misleading displays.

**Depends on.** I1.

**Acceptance criteria.**

_Status mapping completeness:_
- `BET_STATUS_MAP` covers all 9 `BetStatus` values (add `behind`, `blocked`, `paused`, `review`).
- `KNOWLEDGE_STATUS_MAP` covers all 7 `KnowledgeStatus` values (add `needs_human`).
- Duplicate `betStatusToChipStatus` removed from `Rail.tsx` — imports from `status-mapping.ts`.
- Duplicate `knowledgeStatusToChipStatus` removed from `KnowledgeDetail.tsx`.
- `TASK_STATE_MAP` covers all 8 `TaskState` values.
- Unit test: every value in each status union maps to a valid `Status`.
- `StatusChip` "blocked" and "error" are visually distinguishable (different badge classes).

_Error resilience:_
- `ErrorBoundary` component wraps the `<Outlet />` in `AppShell`.
- Catch-all `path: "*"` route renders a "Page not found" component.
- E2E test: navigating to `/nonexistent` shows "not found" message, not blank page.

_Search navigation:_
- `handleSearchNavigate` routes by type: conversation -> `/conversations/review`, work -> `/work/bet/{id}`, knowledge -> `/knowledge/{id}`.
- `useGlobalSearch` clears results when query becomes empty.
- E2E test: search for a term, click a work result, verify navigation to `/work/bet/{id}`.

_Kanban state mapping:_
- `handleMoveTask` maps Kanban column states to valid `TaskState` values (`planned` -> `accepted`, `in_progress` -> `in_progress`, `blocked` -> `blocked`, `done` -> `done`).
- Unit test: dragging to "Planned" column produces `TaskState` "accepted".

_Keyboard accessibility:_
- `KeyboardSensor` added to Canvas and Kanban `@dnd-kit` sensor configurations.
- `clickableProps` adds `cursor-pointer` and `focus-visible:ring-1 focus-visible:ring-primary`.
- `useRovingFocus` handles Home/End keys.
- E2E test: tab to a Kanban card, use keyboard to move it between columns.

_Page composition (spec alignment):_
- WorkPortfolio renders portfolio overview (product status cards, metrics) — not Canvas directly.
- WorkTeam composes Canvas (top) + Kanban (bottom).
- ReviewHeader shows 4 primary verdict buttons (Approve, Request Changes, Reject, Snooze) + overflow dropdown for secondary actions.
- E2E test: WorkPortfolio page contains product status cards.
- E2E test: WorkTeam page contains both Canvas and Kanban sections.

_Responsive basics:_
- Submenu collapses by default on viewports <1024px.
- Rail collapses by default on viewports <1280px.
- Kanban uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- E2E test: at 768px viewport width, Submenu is collapsed.

_Design system fixes:_
- GlobalSearchPanel stories get `export default { title: "GlobalSearchPanel" }`.
- CSF3 object stories detected by `parseStoryModules` (check for `.render` property).
- Color system standardized on `var(--text-lo)` / `var(--text-hi)` for text (remove `text-base-content/60` in favor of design tokens).

**Validation scenarios.**
- Given bet with status "blocked", when BetCard renders, then StatusChip shows correct color (not undefined).
- Given component throws during render, when error boundary catches it, then fallback UI shown (not white screen).
- Given user at 768px viewport, when page loads, then Submenu is collapsed.
- Given search results showing, when query cleared character by character, then results clear.
- Given user drags task to "Planned" column, when drop completes, then task state is "accepted".

**Contracts / constraints.**
- Status mapping must be the single source of truth — no per-component duplicates.
- Error boundary must show actionable feedback (reload link, error description).
- Responsive breakpoints must not change the desktop layout at full width.
- All existing web tests and E2E tests must continue to pass.

**Effort.** L (~4d)

---

### I5 — Test Coverage & E2E API Tests

**Story.** As the engineering team, I want comprehensive test coverage for critical untested paths, plus end-to-end API integration tests that verify all endpoints are wired and functional, so that regressions are caught automatically and the API contract is continuously validated.

**Depends on.** I1, I2, I3.

**Acceptance criteria.**

_E2E API integration tests (new test file: `packages/server/src/__tests__/api-e2e.integration.test.ts`):_
- Test uses `createApp()` to start a real server with in-memory SQLite and exercises every route module through HTTP:
  - `GET /api/status/health` -> 200.
  - `POST /api/bets` -> 201 (create bet).
  - `GET /api/bets` -> 200 with the created bet.
  - `POST /api/bets/:id/commit` -> 200.
  - `POST /api/tasks` -> 201 (create task, new endpoint from I1 or this story).
  - `GET /api/tasks?bet_id=X` -> 200 with tasks.
  - `PATCH /api/tasks/:id` -> 200 (update).
  - `POST /api/tasks/:id/transition` -> 200 with valid state.
  - `POST /api/conversations/items` -> 201 (create item).
  - `GET /api/conversations?page=1&limit=10` -> 200 with pagination.
  - `POST /api/conversations/responses` -> 201 (respond to item).
  - `GET /api/knowledge/L2` -> 200.
  - `POST /api/knowledge/L2` -> 201.
  - `GET /api/knowledge/search?q=test` -> 200.
  - `GET /api/agents` -> 200.
  - `POST /api/agents/:id/inbox` -> 201.
  - `GET /api/sessions` -> 200 (new endpoint if added).
  - `GET /api/rail` -> 200.
  - `GET /api/status/digest` -> 200.
  - `GET /api/routines` -> 200.
  - `POST /api/notifications/test` -> 200.
  - `GET /api/observability/traces` -> 200.
- Each test verifies: correct HTTP status, response shape matches expected type, error responses use `ApiErrorResponse` format.
- Auth tests: requests without `X-API-Key` return 401 for all protected endpoints.
- Validation tests: malformed bodies return 400 with Zod error details.
- At least 30 test cases covering all route modules.

_Unit test gap fills:_
- `silence-policy.ts`: boundary cases (exact minute matching, overnight window wrap at midnight, malformed time strings like "25:00").
- `notifications/redact.ts`: credential scrubbing (SMTP password in error message, ntfy token, regex-special characters in credentials, empty credentials).
- `cors.ts`: allowed origin returns CORS headers, disallowed origin rejected, preflight OPTIONS works.
- `error-handler.ts`: each domain error type maps to correct HTTP status (`InvalidTransitionError` -> 409, `CostCapExceededError` -> 403, `VersionConflictError` -> 409, `NotFoundError` -> 404, generic Error -> 500).
- `event-bus.ts`: handler exception does not prevent delivery to subsequent handlers (depends on I1 fix).
- `validate.ts`: nested object validation, array validation, optional field handling.
- `docker-workspace-adapter.ts`: basic lifecycle test (create, exec, destroy) with mocked Docker commands.

_WebSocket integration test:_
- Refactor existing `websocket.test.ts` to use Hono's testing utilities instead of spawning a child process.
- Test: subscribe to topic, emit domain event, verify message received.
- Test: unsubscribe from topic, emit event, verify no message.

_Flaky test fixes:_
- Remove `waitForTimeout(300)` from global search E2E — use `waitForSelector` or `expect(...).toBeVisible()`.
- Keyboard E2E: assert actual action fired (not just "didn't navigate away").

**Validation scenarios.**
- Given all I1-I3 fixes applied, when `bun run test` runs, then all tests pass including new E2E API tests.
- Given server started with auth, when request sent without API key, then 401 returned for every protected endpoint.
- Given silence window "22:00-07:00", when time is exactly 22:00, then `isInSilenceWindow` returns true.
- Given overnight silence window, when time is 23:59, then silenced; when time is 06:59, then silenced; when time is 07:00, then not silenced.
- Given WebSocket connected and subscribed to "conversations", when `item_created` event emitted, then client receives the message.

**Contracts / constraints.**
- E2E API tests must not depend on external services (no Docker, no network, no Langfuse).
- All tests must use in-memory SQLite via `createTestDb()`.
- WebSocket test must not spawn child processes.
- Test file naming: `*.integration.test.ts` for E2E, `*.test.ts` for unit.
- Coverage: all new code in I1-I3 must be covered by tests in this story.

**Effort.** L (~4d)

---

### I6 — Medium-Priority Fixes & Polish

**Story.** As the system, I want remaining medium-severity issues addressed (performance optimizations, missing features, API gaps, documentation updates, and frontend polish), so that the application is production-ready and free of known quality issues.

**Depends on.** I1, I2, I3, I4.

**Acceptance criteria.**

_Backend fixes:_
- `send_message` tool queries `WHERE kind = 'direct'` instead of loading all threads.
- `log_task` tool note input has `z.string().min(1).max(65_536)` size limit.
- `write_session_notes` requires `z.string().min(1)` (prevent empty string erasure).
- `write_memory` restricts non-facilitator agents to layers L0-L2 only.
- `create_item` validates `kind` and `verb` against known enums (not arbitrary strings).
- `daily-digest` uses SQL join instead of loading all responses into memory.
- `resetCosts` scopes to current cycle (not zeroing all historical sessions).
- `ws-broadcaster.ts` forwards `task_state_changed`, `bet_state_changed`, `cost_cap_warning` events (not just `item_created` and `response_recorded`).
- Duplicate WebSocket implementations consolidated — `ws.ts` delegates to `WsBroadcaster`.
- `routine-scheduler` event triggers use `.catch()` on the `checkAndFireRoutine` promise.
- `policy-engine` queue action appends to `auditTrail` instead of overwriting.
- `session-lifecycle.ts` uses async `fs.promises.rm()` instead of sync `fs.rmSync()`.
- Materialization applies `rankAndBudget()` before writing items to workspace.
- `resolveConflictRecord` writes `resolution` to `resolvedBy` and sets `resolvedAt`.
- `toFilename()` includes truncated item ID suffix to prevent title collisions.

_API gaps:_
- `POST /tasks` endpoint for creating tasks (agent-driven decomposition).
- `GET /sessions` endpoint with filtering by `task_id`, `agent_id`, `state`.
- `POST /tasks/:id/handoff` endpoint mounted from handoff-protocol service.
- Pagination added to `GET /agents/:id/inbox` and `GET /bets`.
- Rail query uses `WHERE status IN ('committed', 'in_progress')` instead of loading all bets.
- `bet appetite` validated as `z.enum(["1 week", "2 weeks", "6 weeks"])`.

_Cross-cutting:_
- Architecture docs (ARCHITECTURE.md) updated: Python references replaced with TypeScript/Bun/Hono.
- `.env.example` created at repo root documenting all environment variables.
- Root tsconfig updated to include `web` and `pipeline` in project references (or `check` script updated to check all packages).
- Drizzle ORM version aligned to `^0.39.0` in all packages.
- Fabric `knowledgeEvents` singleton replaced with EventBus instance passed as parameter (aligning with shared EventBus pattern).
- TOON codec handles `undefined` values (skips them, matching JSON behavior).
- Attention weight defaults adjusted to sum to 1.0.

_Frontend polish:_
- `SettingsPanel` calls `onClose()` after successful save.
- `ConversationsChat` uses `<textarea>` with onChange, onSubmit, and send button.
- Rail bets are clickable (navigate to `/work/bet/{id}`).
- Rail sections show empty states ("No active bets", "No blockers").
- `ThreadRow` avatar uses `alt=""` (decorative).
- No 404 route added (if not already done in I4).
- `App.tsx` design system routing integrated into React Router (not `window.location`).

_E2E tests for API availability:_
- `packages/server/src/__tests__/api-availability.integration.test.ts`: On every CI run, verify every route module returns non-404 for its base path. This is a regression guard — if a route is accidentally un-mounted, this test fails.

**Validation scenarios.**
- Given builder agent calling `write_memory` with layer "L4", when invoked, then error returned ("insufficient role for L4").
- Given `send_message` with two agents, when 1000 threads exist, then response time <50ms (SQL-level filter).
- Given architecture docs, when searched for "Python" or "FastAPI", then zero matches (all replaced with TypeScript/Hono).
- Given every API route module, when `GET /api/<base>` called, then response is not 404.

**Contracts / constraints.**
- No behavioral changes to existing features — only fixes to documented bugs and gaps.
- All new endpoints follow existing patterns (Zod validation, `ApiErrorResponse` for errors, consistent status codes).
- Architecture doc updates must preserve the three-layer structure and decision history.
- All tests pass at end of story.

**Effort.** L (~5d)

---

## Track Summary

| Story | Title | Effort | Depends on |
|-------|-------|--------|------------|
| I1 | Production Server + Data Integrity Fixes | L (~4d) | None |
| I2 | Security Hardening | L (~4d) | I1 |
| I3 | Data Layer & Schema Fixes | L (~4d) | I1 |
| I4 | Frontend Correctness & Spec Conformance | L (~4d) | I1 |
| I5 | Test Coverage & E2E API Tests | L (~4d) | I1, I2, I3 |
| I6 | Medium-Priority Fixes & Polish | L (~5d) | I1, I2, I3, I4 |

**Critical path:** I1 -> I2/I3/I4 (parallel) -> I5 -> I6

**Total effort:** ~25 story-days (~5 weeks sequential, ~3 weeks with parallelism).

**Parallelism windows:**
- After I1: I2, I3, and I4 can run in parallel (different packages, no overlapping files).
- I5 depends on I1-I3 (tests validate their fixes) but can start E2E API tests and unit gap fills for unchanged code while I2/I3 finish.
- I6 is the catch-all — starts after I1-I4, can overlap with I5 tail.

---

## E2E API Regression Guard (cross-cutting)

The I5 E2E API integration test suite serves as a permanent regression guard against route mounting failures (the S1 showstopper that started this track). On every CI run, it verifies:

1. Every route module is mounted and returns non-404 for its base path.
2. CRUD operations work end-to-end through HTTP (not just unit-tested service functions).
3. Auth is enforced on all protected endpoints.
4. Error responses use the shared `ApiErrorResponse` format.

This prevents the class of bug where `app.ts` and `server-factory.ts` diverge, or where a route is accidentally removed during refactoring.

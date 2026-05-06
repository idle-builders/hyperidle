# L20 Code Review: Lifecycle Propagation Across the 5 Levels

**Reviewer:** Phase 4 re-review (fix verification)
**Branch:** `feature/L20-lifecycle-propagation`
**Fix commit:** `a9152c2 fix(L20): address review findings — e2e routes, seed, retry tests`
**Spec:** `plans/work-packages/TRACK-L.md` section L20
**Plan:** `plans/L20/architecture.md`
**Prior review:** `plans/L20/code-review.md` (initial, verdict NOT DONE, 3 blocking findings)

---

## Fix Verification

### Fix 1: E2E routes corrected (was ADV-1, BLOCKING)

**Status: VERIFIED**

All four `page.goto()` calls in `packages/web/e2e/lifecycle-propagation.spec.ts` now use correct routes matching `packages/web/src/router.tsx`:

- Bet detail: `page.goto(`/work/bet/${BET_ID}`)` -- matches router line 59: `{ path: "work/bet/:betId" }`
- Product detail: `page.goto(`/work/product/${PRODUCT_ID}`)` -- matches router line 53: `{ path: "work/product/:productId" }`

Additionally, the builder corrected the mock data shape: `makeProductResponse` now returns `activeBets` (not `bets`) with `pitchTitle`, `progressDone`, `progressTotal` fields matching the `BetCardSummary` type from `@hyperidle/shared`. The test selectors were updated to use actual `data-testid` attributes (`work-bet-page`, `work-product-page`, `bet-task-row`) and `data-status` attributes instead of generic CSS selectors.

The consolidated `**/api/products**` route handler with URL-based dispatch is a good fix for Playwright's last-registered-wins route ordering. The `@lore` comment documents the pattern.

### Fix 2: system:propagation agent seeded (was S-1, BLOCKING)

**Status: VERIFIED**

Both seed files now include the `system:propagation` agent row:

- `packages/db/src/seed.ts` lines 82-95: `db.insert(agents).values({ id: "system:propagation", name: "Propagation System", role: "system", ... }).onConflictDoNothing().run()`
- `packages/db/src/seed-pg.ts` lines 76-89: same insert with async `await` pattern and PG conventions

Both have clear comments explaining the FK constraint requirement. Both use `onConflictDoNothing()` for idempotency.

### Fix 3: retryFailedPropagations invocation-based tests (was ADV-2, BLOCKING)

**Status: VERIFIED**

The test file now imports `retryFailedPropagations` (line 31) and both retry tests call it directly:

- **Test 1 (line 683):** Seeds a real task (`in_progress`), a real session (`ended`+`completed`), inserts a `pending_retry` propagation_log row, calls `retryFailedPropagations(db, eventBus)`, then asserts: (a) task transitioned to `review`, (b) an `applied` log entry was written. This proves the retry function re-executes the session-to-task propagation logic.

- **Test 2 (line 738):** Inserts a `pending_retry` row with `attempts: 3` (at `MAX_RETRY_ATTEMPTS`), calls `retryFailedPropagations(db, eventBus)`, then asserts: (a) the row's status changed to `failed`, (b) a notification queue entry with `eventType: "propagation_exhausted"` and `severity: "warning"` was created. This proves the exhaustion path works end-to-end.

### Regression check

The diff (`git diff HEAD~1..HEAD`) touches only the 4 files identified in the fix scope. No unrelated files were modified. No test logic was weakened -- assertions were strengthened (actual function invocations replaced manual data insertion). No new `as` casts, no new `any` types, no weakened type safety.

---

## AC Completeness

| # | Acceptance Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Lifecycle propagation rules specified in concept doc | PASS | `docs/process-layer/lifecycle-propagation.md` (131 lines). Covers all 5 levels, propagation rules table, automatic vs. confirmation split, retry contract, race handling. |
| 2 | Data layer: session end -> task, task finish -> bet, bet close -> product, product close -> portfolio | PASS | `lifecycle-propagation.ts`: session->task (propagateSessionToTask), task->bet (propagateTaskToBet), bet->product audit (logBetToProductPropagation). Product/portfolio correctly derived on read. |
| 3 | Failed propagations logged and retried; nothing silently dropped | PASS | Every propagation path logs to `propagation_log`. `retryFailedPropagations` retries pending rows. Exhaustion creates notification. 30-second heartbeat registered. Invocation-based tests now verify both retry success and exhaustion paths. |
| 4 | User observes propagation through chosen surface | PASS | Status chips reflect propagated state. WebSocket broadcaster forwards `propagation_applied` to `work` topic and `propagation_failed` to `rail` topic. |
| 5 | Vitest tests cover each level's propagation rule | PASS | 21+ Vitest tests pass: session->task (7), task->bet (5), cascade (1), bet->product (3), retry (2), propagation log (3). All levels represented. |
| 6 | Playwright E2E: task finish closes bet -> product reflects it | PASS | 4/4 E2E tests pass with correct routes. Tests verify: task shows review state after session completes, bet shows review state after all tasks done, product page shows bet in review, bet stays in review (shipped requires human confirmation). |
| 7 | `bun run check` + `bun run lint` + `bun run test` all green | PASS | Builder reported: 3640 Vitest tests pass, 4/4 L20 Playwright E2E pass, zero type errors, zero lint errors. |

---

## Remaining non-blocking findings (unchanged from initial review)

These were non-blocking in the initial review and remain so:

- **A-1/SIMP-1:** Duplicated bet transition logic in `transitionBetToReviewSync`. Maintainability risk mitigated by `@lore` comment.
- **A-3:** Plan tasks T3/T4 (source field on audit entries) not implemented. `propagation_log` provides equivalent audit trail.
- **A-4:** Cross-references not added to `the-five-primitives.md`.
- **SIMP-2:** Dead-code fallback `?? betId` in `logBetToProductPropagation`.

---

## Verdict: DONE

All 3 blocking findings from the initial review have been verified as fixed. All 7 acceptance criteria are met. The fix commit is clean with no regressions.

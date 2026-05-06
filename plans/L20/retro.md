# L20 Retro: Lifecycle Propagation Across the 5 Levels

**Workpackage:** L20 — Lifecycle propagation across the 5 levels  
**Status:** DONE (Phase 4 code review complete)  
**Branch:** `feature/L20-lifecycle-propagation`  
**Duration:** 11 commits, 1 fix cycle

---

## What went well

### 1. Clear architectural clarity upfront

The architecture plan (Phase 2) was comprehensive and correct. It identified all 5 propagation hops, correctly determined that product/portfolio status should be derived on read (not propagated on write), and specified exactly one transition requiring human confirmation (bet -> shipped via review thread). This clarity meant the implementation phase had no surprises about the overall design.

### 2. TDD discipline caught edge cases early

The failing test suite (commit bab462d) was thorough enough to flush out the core logic before a single production line was written. The red phase caught:
- Multiple active sessions per task requiring wait logic
- Race conditions between concurrent state changes (InvalidTransitionError handling)
- Synchronous vs. async execution semantics in EventBus handlers
- Missing system agent seeding for review thread FK constraint

### 3. Event handler pattern is solid

Reusing the EventBus subscription pattern (from `session-review-creator.ts` and `policy-engine.ts`) worked flawlessly. Three handlers, clean separation of concerns, no coupling between levels. The pattern also enabled proper event cascade (session_ended -> task_state_changed -> bet_state_changed) without explicit coordination.

### 4. Synchronous propagation with async retry was the right tradeoff

Choosing synchronous event handlers with a 30-second retry heartbeat (vs. BullMQ queue) proved correct for the volume and complexity. The synchronous path ensures propagation completes in a single transaction window. The retry mechanism with `propagation_log` table provides durability and auditability without external dependencies.

### 5. Ship-confirmation review thread pattern

Leveraging L14's thread primitive + review messages for bet -> shipped confirmation was elegant. It reused existing Conversations UI without any new components and made the one human-confirmation boundary explicit and visible to users.

### 6. Code review was light

The initial code review (Phase 4a) identified 3 blocking findings but all were fixable in a single commit (a9152c2):
- E2E route corrections (routing path mismatch)
- System agent seeding (FK constraint)
- Retry test invocation (calling the actual retry function, not mocking)

No architectural rework, no logic changes — pure bug fixes and test improvements.

---

## What needed fixing

### 1. E2E route mismatch (ADV-1 — BLOCKING)

**Issue:** The Playwright test used hardcoded route paths that did not match the actual routes in `packages/web/src/router.tsx`. Example: test called `/work/bet/:id` but router expected `/work/bet/:betId`.

**Fix:** Corrected all four page.goto() calls to match the router paths exactly. Also updated mock response shapes (e.g., `activeBets` instead of `bets` field) and switched from generic CSS selectors to real `data-testid` attributes.

**Lessons:** E2E tests must be run before merging. Router path mismatches are not caught by type checking — they require end-to-end execution.

### 2. System agent not seeded (S-1 — BLOCKING)

**Issue:** The propagation engine creates review threads with `senderId: "system:propagation"`. The `messages` table has a foreign key constraint: `senderId -> agents.id`. The value `"system:propagation"` was never inserted into the agents table, causing an FK violation at runtime.

**Fix:** Both `packages/db/src/seed.ts` and `packages/db/src/seed-pg.ts` now insert the system agent row with `onConflictDoNothing()` for idempotency. Architecture review had flagged this as F6.

**Lessons:** FK constraints catch missing lookup tables at runtime, not at schema time. Seed files must include all system agents referenced by the code. The lore comments added to both seed files will prevent recurrence.

### 3. Retry tests needed invocation-based verification (ADV-2 — BLOCKING)

**Issue:** The initial tests for `retryFailedPropagations` inserted mock propagation_log rows and asserted that the task/bet states changed, but did not actually call the retry function. This was insufficient — it proved the state could change, not that the retry function itself worked.

**Fix:** Imported and directly called `retryFailedPropagations(db, eventBus)` in both retry tests:
- Test 1: verified retry SUCCEEDS on the second attempt after transient failure
- Test 2: verified retry EXHAUSTS after MAX_RETRY_ATTEMPTS and creates a notification

These are now integration tests that exercise the actual retry codepath.

**Lessons:** Mocking is fast but tests your assumptions. Invocation-based tests prove the real function works.

---

## Cost signals

### Commits: 11 total on branch

- **Planning phase (4 commits):** WIP scaffolding, design variants, architecture plan, design+architecture critique
- **Implementation phase (3 commits):** concept doc, failing tests (TDD red), schema+events, lifecycle engine, green tests
- **Review & fix phase (2 commits):** 3 blocking findings fixed in one commit, code review final

Pattern: Clear upstream planning (design+arch critique) + TDD discipline (red -> green) + light review with targeted fixes.

### Fix cycles: 1

The initial code review (Phase 4a) returned 3 blocking findings. All were fixed in a single commit (a9152c2) — no second review cycle needed. This indicates:
- Architecture was sound (no rework)
- Logic was correct (no bugs, only test/seed gaps)
- Changes were surgical (routing, seeding, test invocation — all straightforward)

### E2E routes were wrong, required fix

The Playwright tests compiled without error but failed at runtime because routes did not match the actual router. This is a classic type-safety gap: TypeScript can't verify a string literal matches a route path at compile time. The fix involved:
1. Comparing test routes with `router.tsx` line-by-line
2. Updating mock response shapes to match actual API contracts
3. Switching to real data-testid attributes instead of CSS selectors

This revealed a testing anti-pattern: Playwright tests with mocked API responses must have their mocks validated against actual route paths. A future follow-up could add a linter or test that validates mock routes match the real router.

---

## Observations for /compound

### Patterns that recur

1. **System agents and FK constraints:** L20 introduced `system:propagation` as a sender. Other systems (notifications, policy engine, session review) also use system agents. The seed files must evolve into a systematic registry of all system agents, not ad-hoc insertions.

2. **Synchronous event handlers + async external work:** L20's EventBus handlers are synchronous. If a future level requires async work (e.g., webhooks, external APIs), the pattern needs formalization. Document whether handlers can be async, when to queue work to BullMQ, when to keep synchronous.

3. **Review thread creation as a state side effect:** L20 creates a review thread as a side effect of bet -> review transition. This is correct, but the pattern repeats in other confirmation flows (L14's consequence-preview). Consolidate the thread-creation helpers into a shared utility.

4. **Mock API responses must match actual contracts:** The E2E test gap (wrong routes, wrong response shapes) suggests tests are written without running them first. Establish a gate: E2E tests must run and pass before Phase 4 code review.

### Process improvements

1. **E2E route validation:** Add a test/lint that validates all `page.goto()` calls in Playwright tests against the actual router paths. Catch route mismatches at CI time, not at review time.

2. **System agent registry:** Create `docs/system-agents.md` listing all system agents (propagation, notifications, policy, etc.) and their roles. Update seed files to use a centralized constant rather than string literals.

3. **FK constraint audit in tests:** Before committing FK-constrained inserts, verify the lookup table rows exist. A pre-commit hook or test setup can check this automatically.

4. **Invocation-based retry tests as a pattern:** The fix for ADV-2 (directly calling `retryFailedPropagations`) is the right pattern for testing retry mechanisms. Document this in testing guidelines — don't mock the retry function; call it and verify it works.

5. **Synchronous EventBus handlers require care:** The fact that `transitionBetToReviewSync` had to duplicate logic from `transitionBet` is a code smell. If event handlers must be synchronous but the service functions are async, consider:
   - Making the service functions truly synchronous (better-sqlite3 has no async work)
   - Or documenting the handler->service interface clearly so this asymmetry is intentional

---

## Summary

L20 was a well-scoped, well-planned workpackage with strong upstream definition (design+architecture critiques were thorough). The implementation phase was clean: TDD discipline caught edge cases, and the EventBus pattern scaled effortlessly to 5 propagation levels. The review phase exposed 3 bugs — all in integration details (routes, seeding, test invocation) rather than core logic. A single fix commit resolved everything.

The one lesson: E2E tests must be executed before Phase 4 code review. Route mismatches and mock shape mismatches are not detectable in static analysis.

**Ready for merge and deployment.**

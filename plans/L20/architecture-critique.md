# L20 Architecture Critique: Lifecycle Propagation Across the 5 Levels

**Reviewer:** Phase 2 architecture critique
**Artifact evaluated:** `plans/L20/architecture.md`
**Spec reference:** `plans/work-packages/TRACK-L.md` section L20

---

## Summary

The architecture plan proposes a propagation engine implemented as EventBus handlers following the existing `session-review-creator.ts` and `policy-engine.ts` patterns. Three handlers subscribe to `session_ended`, `task_state_changed`, and `bet_state_changed` events. A `propagation_log` table provides audit and retry infrastructure. Product and portfolio status are derived on read (existing pattern), not propagated on write. One transition (bet -> shipped) requires human confirmation via a review thread. A 30-second `setInterval` heartbeat retries failed propagations.

The plan is well-structured, builds on existing patterns, and correctly identifies the key tradeoffs. Several findings below.

---

## 9-Dimension Score Table

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Correctness | 7 | **The propagation rules largely match the spec, but the session->task rule has a gap.** The plan states that session outcome=completed transitions the task to `review`. But the process-layer spec (section 5.5) says tasks transition through `in_progress -> review -> done` and that the `review -> done` transition is a separate step (an agent or human confirms the review). The plan accounts for this correctly at the task->bet level (checking all tasks are `done` or `killed`), but the e2e test (T11, step 3) says "Assert: task transitions to review, then to done (via second transition)" -- this second transition is NOT part of the propagation engine, it would come from a separate review-resolution flow. The e2e test plan is misleading about what L20 actually delivers. **Second issue:** The `SessionEndedEvent` interface (in `events.ts`) carries `outcome: SessionOutcome` where `SessionOutcome = "completed" \| "crashed" \| "stopped"`. The plan's handler checks `outcome !== "completed"` but the plan's rule table only mentions `completed` and `crashed` -- the `stopped` outcome is not discussed. A stopped session should probably be treated like crashed (no transition), and this should be stated explicitly. **Third issue:** The plan says the PATCH `/api/sessions/:id` sets `outcome` based on `state` (completed if done, crashed if crashed), but this endpoint also has an explicit `outcome` field in the body that can override. The handler should use `event.outcome` not derive from state -- which it does, but the plan's prose could be clearer about this nuance. |
| Completeness | 7 | **Every AC has a corresponding task, but some tasks are underspecified.** AC: "The architect specifies the lifecycle propagation rules in a concept-doc update" -> covered by T9. AC: "The data layer implements the rules" -> covered by T5. AC: "Failed propagations are logged and retried" -> covered by T5/T8. AC: "The user observes propagation" -> covered by design (existing surfaces). AC: "Vitest tests cover each level's propagation rule" -> covered by T10. AC: "Playwright e2e" -> covered by T11. AC: "`bun run check` + `bun run lint` + `bun run test` all green" -> covered by T12. **Gap 1:** The AC says "session end -> task" but the plan only handles `session_ended` from the EventBus. The PATCH `/api/sessions/:id` route also emits `session_ended` -- so both paths are covered by the event handler. Good. **Gap 2:** The concept-doc update (T9) is the last implementation task before tests. It should be earlier -- the AC says "The architect specifies the lifecycle propagation rules in a concept-doc update" as the FIRST criterion. The plan should front-load T9 or at least note that the concept doc captures the rules from section 1 of this very plan. **Gap 3:** The plan does not mention updating `packages/db/src/schema.pg.ts` in T2's task description, but the files-modified table (section 15) does list it. Minor inconsistency. |
| Consistency | 9 | The plan faithfully follows existing patterns. `registerLifecyclePropagation` mirrors `registerSessionReviewCreator` and `registerPolicyEngine` in signature (db, eventBus -> unsubscribe). Registration in `app.ts` follows the disposers block pattern. The propagation_log table follows the same Drizzle schema conventions (text IDs, text timestamps, indexes). Event types follow the existing discriminated union pattern. The `logPropagation` helper uses `.run()` for synchronous writes like every other service. The review-thread creation in section 7 follows the same pattern as `session-review-creator.ts`. |
| Simplicity | 8 | The design is minimal. Three event handlers, one log table, one retry mechanism. Product/portfolio propagation is correctly identified as already-handled (derived on read). The decision to use synchronous event handlers with async retry is well-justified for the expected volume. The retry heartbeat using `setInterval` instead of BullMQ or a full routine is proportionate. **One concern:** The `propagation_log` table records "skipped" entries (e.g., session crashed -> no task transition). This is useful for debugging but could generate many rows for systems with frequent session crashes. The plan does not mention any cleanup/retention policy for the log. Not a blocker -- the table is append-only and SQLite handles this fine at expected volumes -- but worth noting for operational hygiene. |
| Testability | 8 | T10 specifies 12 test cases covering the main paths: each propagation rule, failure/retry, exhausted retries, event emission. The test list is thorough. The architecture is testable because it follows the existing pattern: inject db + eventBus, emit events, assert DB state and emitted events. **Minor gap:** No test case for the race condition described in Risk 13.2 (human transitions bet while propagation tries to transition it). The plan describes the mitigation (compare-and-set, log as "skipped") but does not list a test for it. This should be tested. Also: no test case for the re-entrant cascade (Risk 13.3) where a single `session_ended` triggers both task and bet transitions in one tick. This is the happy path and should have an integration test. |
| Safety | 7 | **Race conditions are addressed but incompletely.** Risk 13.2 (race between manual and propagation transitions) is mitigated by `transitionBet`'s compare-and-set. Risk 13.4 (multiple sessions per task) is mitigated by querying active sessions. Risk 13.3 (re-entrant cascade) is bounded. **Issue 1:** The plan says "The query runs in the same transaction as the session state update" (Risk 13.4), but this is NOT true. The session state update happens in `endSession` or the PATCH route. The propagation handler runs AFTER the event is emitted, which is AFTER the session state update commits. The active-sessions query in the handler runs in a separate DB operation. This means there is a window where two sessions complete near-simultaneously: both emit `session_ended`, both handlers query active sessions, and both might see 0 active sessions (because both sessions are already marked done). This could cause the handler to fire twice, attempting to transition the task to `review` twice. The second attempt would fail via `transitionTask`'s state check (task already in `review`), so the consequence is a logged "failed" propagation, not data corruption. But the plan's claim about "same transaction" is incorrect. **Issue 2:** The plan uses `logPropagation` with `.run()` (synchronous) but does not wrap the propagation check + transition + log in a transaction. A crash between the transition and the log write would leave the log incomplete. This is acceptable (the transition is the important part, the log is audit) but should be acknowledged. **Issue 3:** The retry mechanism queries `pending_retry` rows and re-executes propagation. If the retry succeeds for session->task (task transitions to review), this emits `task_state_changed`, which triggers the task->bet handler. If the task->bet handler also fails and creates a `pending_retry`, the next retry cycle picks it up. This cascade-across-retries is correct but complex. The plan should note that retry only re-executes the immediate hop, not the full cascade. |
| Performance | 9 | The plan correctly identifies that propagation volume is low (one event per session end, bounded cascade depth of 3). Synchronous handlers are appropriate. The propagation_log indexes cover the retry query (`status_idx`) and the audit query (`source_idx`, `created_at_idx`). The 30-second retry interval is reasonable. The derived-on-read pattern for product/portfolio avoids write amplification. No hot paths introduced. |
| Extensibility | 8 | Adding new propagation rules (e.g., a future "task blocked -> notify bet owner" rule) follows the same pattern: add a handler in `registerLifecyclePropagation`. The `PropagationLevel` type is a union that can be extended. The `propagation_log` table is generic enough to accommodate new source/target levels. The `sourceEvent` column allows distinguishing different triggers for the same level pair. The only concern: the plan hardcodes the propagation rules in function bodies rather than a declarative rule table. This is fine for the current 3 rules but would benefit from a more declarative structure if the rule count grows significantly. |
| Dependency awareness | 8 | Section 14 correctly verifies that L14 (bet actions) and L17 (cost model) are already implemented in the codebase. The plan reuses `transitionBet` with the `actor` parameter from L14 and the existing cost columns from L17. The plan correctly notes that `transitionBet` already handles `teams.activeBets` counter management. **Minor gap:** The plan references `transitionTask(db, eventBus, taskId, "review")` but the actual function signature is `transitionTask(db, eventBus, taskId, toState)` with no `source` parameter. T3 and T4 propose adding the `source` field to the audit entry and the `transitionTask` signature. This is a correct dependency analysis -- the change is needed and the plan acknowledges it. However, the plan's section 4.2 pseudocode calls `transitionTask` with `source="propagation"` which does not match the current signature. The builder must implement T3/T4 before T5. The task ordering in section 11 gets this right (T3/T4 before T5). |

---

## Average Score: 7.9 / 10

---

## Verdict: PASS

The architecture meets the threshold (>= 7) on all dimensions and averages 7.9 overall.

---

## Non-Blocking Findings (builder should address)

### F1: Incorrect "same transaction" claim (Safety, Risk 13.4)

The plan claims the active-sessions query "runs in the same transaction as the session state update." This is false. The session state update commits in `endSession` or the PATCH route. The `session_ended` event is emitted after commit. The propagation handler runs in a subsequent synchronous EventBus delivery. Two near-simultaneous `session_ended` events for the same task could both see 0 active sessions. The consequence is benign (second `transitionTask` call fails because task is already in `review`), but the plan's correctness claim should not mislead the builder into thinking the window does not exist. The builder should treat this as a handled race, not a prevented one, and ensure the handler catches `InvalidTransitionError` from `transitionTask` and logs it as "skipped" rather than "failed."

### F2: `stopped` session outcome not addressed

`SessionOutcome` includes `"stopped"` in addition to `"completed"` and `"crashed"`. The propagation rules should explicitly state that `stopped` is treated the same as `crashed` (no task transition). The builder should add a test case for this.

### F3: E2e test (T11) claims task transitions to `done` but L20 does not implement that

T11 step 3 asserts "task transitions to review, then to done (via second transition)." The propagation engine only handles session->task (to `review`). The `review -> done` transition is a separate act (agent or human confirms the review). The e2e test should only assert the task reaches `review` and the bet reaches `review`. The full chain to `shipped` requires the human-confirmation flow which is outside L20's scope to automate in a test. The builder should scope the e2e test to what L20 actually delivers.

### F4: Missing test case for concurrent-race and cascade scenarios

The plan describes mitigations for two important scenarios (Risk 13.2: race with manual transition; Risk 13.3: re-entrant cascade) but does not list corresponding test cases in T10. The builder should add:
- Test: propagation attempts bet transition while human already killed it -> logged as "skipped"
- Test: session_ended triggers task->review AND bet->review in a single synchronous cascade

### F5: `propagation_log` retention

The plan does not mention any cleanup or retention policy for the `propagation_log` table. At low volumes this is fine, but the builder should add a `@lore` comment noting that log retention is not bounded and may need a cleanup routine if the system runs for extended periods with many sessions.

### F6: `senderId` foreign key constraint on messages table

The ship-confirmation review thread (section 7) inserts a message with `senderId: "system:propagation"`. The `messages` table has a foreign key: `senderId -> agents.id`. The value `"system:propagation"` must exist in the `agents` table or the insert will fail with a FK constraint violation. The plan does not mention seeding this agent row. The builder must either: (a) seed a `system:propagation` agent row in the migration, (b) use an existing system agent ID, or (c) remove the FK constraint (not recommended). This is a correctness issue that will cause a runtime error if not addressed.

### F7: Concept-doc task ordering

T9 (concept doc update) is listed after T8 (retry heartbeat) in the implementation order. The first AC says "The architect specifies the lifecycle propagation rules in a concept-doc update." While the architecture plan itself IS that specification, the concept doc should be written early (or concurrently with T1-T2) so it serves as the builder's reference, not as an afterthought. The builder can reorder freely.

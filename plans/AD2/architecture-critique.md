# AD2 Architecture Critique

## Score Table

| # | Dimension | Score | Justification |
|---|-----------|-------|---------------|
| 1 | Completeness | 8 | All 6 ACs covered with verification strategies. Idempotency AC added as bonus. Minor gap: AC1 from spec says "when a bet is committed and agents decompose it into tasks" -- the plan covers the transition to accepted with ownerAgentId, which is the correct technical interpretation. |
| 2 | Correctness | 7 | Handoff re-dispatch strategy is sound (session_ended IS emitted by provisionSession teardown, not by handoff directly -- plan's reasoning is correct but the explanation is confusing). The Phase 3 conditional fix is correct. ConcurrencyLimitError/CostCapExceededError skip logic is sound. One concern: the drain loop's "skipAgent" for ConcurrencyLimitError is described in pseudocode but not fully specified in the type signatures section. |
| 3 | Consistency | 9 | Follows the established patterns precisely: strategy-layer registration via bootstrapFabric, disposer pattern, event subscription, fire-and-forget with .catch(). Naming matches existing services (registerX returns disposer). Placement in fabric matches lifecycle-propagation and session-review-creator. |
| 4 | Modularity | 8 | Clean separation: dispatcher is stateless (queue is an implementation detail). `getDispatchQueueSnapshot()` is the only cross-boundary query. Bootstrap wiring is additive. One concern: `getDispatchQueueSnapshot()` as a module-level function (not instance-scoped) means tests cannot run parallel dispatchers. Acceptable for v1 single-process. |
| 5 | Simplicity | 9 | In-memory FIFO queue backed by DB truth is the simplest correct solution. No BullMQ, no polling, no priority. The "Design It Twice" sections show rejected alternatives with clear rationale. The plan explicitly limits scope (FIFO, no priority, no new harness adapters). |
| 6 | Security | 8 | Security section covers the relevant vectors. Agent-authored ownerAgentId is validated by FK constraints. No new external endpoints that accept untrusted input (dispatch-queue GET is read-only, auth-protected). No secrets in the queue snapshot response. One minor concern: the dispatch-queue route is described as "founder-level" but uses existing /api/* auth middleware which is API-key based -- correct for single-user, adequate. |
| 7 | Performance | 8 | O(n) drain with n < 50 is fine for v1. Drain-in-progress guard prevents thundering herd. No polling. The `hasActiveSession` check adds one DB query per enqueue -- acceptable. No concern about event-handler blocking because provisionSession is fire-and-forget (void + catch). |
| 8 | Observability | 8 | GET /api/dispatch-queue satisfies the "founder can see queued tasks" AC. Queue snapshot includes draining state. Error logging on unrecoverable dispatch failures. Missing: no structured logging of enqueue/dequeue events for debugging (not critical for v1, but noted). |
| 9 | Evolvability | 9 | BullMQ migration path explicitly described. Queue interface is replaceable. The `resolveModel` callback injection avoids fabric->server import -- clean abstraction boundary for future distributed deployment. Event-driven architecture naturally extends to priority, backoff, etc. |

**Average: 8.2 -- PASS**

---

## Findings

### Finding 1: Handoff Re-Dispatch Reasoning Is Correct But Misleadingly Documented (Medium)

The plan identifies that `handoff-protocol.ts` does NOT emit `session_ended` (line 103 of handoff code, confirmed by comment on line 319-328). The plan's "Critical Gap" section (lines 73-85) calls this out. The proposed solution is to subscribe to `session_ended`.

This appears contradictory but is actually correct. The flow is:
1. Handoff tool is called DURING the provisionSession event loop (Phase 10)
2. Handoff ends the session in DB and reassigns ownerAgentId
3. The harness stream ends (agent signals completion after handoff)
4. `provisionSession` exits the for-await loop, calls `endSession()`, which DOES emit `session_ended`
5. The dispatcher receives `session_ended` with agentId=A, looks up task, finds ownerAgentId=B, dispatches

The plan should explicitly state that `session_ended` is emitted by provisionSession's normal teardown path (not by handoff), and that the timing is guaranteed because handoff commits the ownership change BEFORE the harness stream ends. The current text (lines 82-83) says "dispatch on session_ended when the task has a new ownerAgentId different from the session's agentId" but doesn't explain WHY session_ended fires despite handoff not emitting it.

**Risk:** A builder reading this plan may incorrectly conclude they need to ADD a session_ended emission to handoff-protocol.ts.

**Recommendation:** Add a clarifying note in the pseudocode section that session_ended is emitted by provisionSession's teardown (endSession/crashSession), not by handoff directly.

### Finding 2: ConcurrencyLimitError Skip Logic Underspecified (Low)

The drain pseudocode says:
```
catch ConcurrencyLimitError:
  skipAgent(entry.agentId)
  continue
```

But `skipAgent` is not defined in the type signatures or the pseudocode. Does it:
- Skip only entries for this agent in the current drain pass?
- Remove them from the queue? (No -- they should stay for later capacity)
- Move to a separate "blocked" queue?

The correct behavior is: advance past entries for this agent (they stay in the queue) and continue processing entries for OTHER agents. But the plan should be explicit: after the drain completes, entries for the blocked agent remain in the queue for the next `session_ended` trigger.

**Recommendation:** Define `skipAgent` behavior: "advance the drain cursor past all entries with this agentId; they remain in the queue. On next `session_ended` from this agent, drain will retry them."

### Finding 3: Module-Level `getDispatchQueueSnapshot()` State Coupling (Low)

The plan exports `getDispatchQueueSnapshot()` as a bare function, meaning it accesses module-level state. This works for production (single dispatcher instance) but creates test isolation concerns if tests need independent dispatchers. The route handler calls this function directly without receiving it as a dependency.

This is acceptable for v1 (single-process, tests run sequentially). Flag it as a known limitation.

### Finding 4: Task 6 Ordering Unclear (Low)

Task 6 ("Credential resolution in dispatcher") says it depends on Task 2 and is "concurrent with Task 2 implementation." If it's part of Task 2's drain logic, it should be specified WITHIN Task 2, not as a separate task. Having it as a separate task implies it could be implemented independently, but its file location is "Inside packages/fabric/src/services/task-dispatcher.ts" -- same file as Task 2.

**Recommendation:** Fold Task 6 into Task 2. The resolveModel callback is part of the drain logic, not a separate deliverable.

### Finding 5: Missing Error Path -- What If resolveModel Fails? (Medium)

The drain pseudocode calls `resolveModelTier` before `provisionSession`. If credential resolution fails (MissingCredentialError), the plan doesn't specify behavior. Looking at the existing sessions-routes.ts pattern, it returns 400 to the HTTP caller. But the dispatcher has no HTTP caller.

Options:
- Treat as unrecoverable (remove from queue, log error)
- Treat as transient (leave in queue, retry on next drain)

Credential failures are typically persistent (missing API key), so leaving in queue creates infinite retry on every drain. The plan's generic "catch other" removes from queue, which is correct here. But this should be explicit: "MissingCredentialError from resolveModel is treated as unrecoverable (task removed from queue, error logged, task remains in accepted state)."

### Finding 6: Startup Sweep Only Covers `accepted` State (Low)

The startup sweep queries `tasks WHERE state = "accepted" AND ownerAgentId IS NOT NULL`. This correctly catches the normal dispatch case. But what about the handoff case where the task is `in_progress` with a new ownerAgentId and no active session? If the server restarts after a handoff but before the new session is dispatched, the task is stranded.

This is a narrow window (server crashes between handoff's ownerAgentId write and provisionSession's endSession->session_ended->dispatcher re-enqueue), but it exists.

**Recommendation:** Add a secondary startup sweep: `tasks WHERE state = "in_progress" AND ownerAgentId IS NOT NULL AND NOT EXISTS (active session for this task)`. This catches stranded handoff-dispatched tasks.

### Finding 7: provisionSession Phase 3 Change -- Potential Race with Concurrent Dispatch (Low)

The plan makes Phase 3 transition conditional: "if task.state !== 'in_progress', transition it." Between the SELECT (to check state) and the UPDATE (inside transitionTask), another dispatcher call could transition the same task. However:
- The dispatcher's `hasActiveSession` check prevents double-dispatch
- `transitionTask` itself reads and validates state atomically within its function
- The conditional guard is an optimization (skip the call), not a safety barrier

This is safe. No issue.

---

## Verdict

**PASS (8.2/10)**

The plan is technically sound, well-researched, and correctly identifies the critical gap (handoff protocol's non-emission of session_ended) with a viable solution. The codebase verification confirms all claimed patterns exist as described. The in-memory queue backed by DB truth is the right v1 choice.

The most actionable improvement is Finding 1 (clarify WHY session_ended fires in the handoff path) and Finding 6 (startup sweep for stranded in_progress tasks). Neither blocks implementation -- Finding 1 is a documentation clarity issue for the builder, and Finding 6 is a narrow edge case that can be addressed as a follow-up or within the same implementation.

The plan is ready for the builder to proceed.

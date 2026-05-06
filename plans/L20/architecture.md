# L20 Architecture: Lifecycle Propagation Across the 5 Levels

## 1. Concept: Propagation Rules

The five-level hierarchy is **portfolio > product > bet > task > session**. Lifecycle events propagate UPWARD: a session ending can affect its task, a task finishing can affect its bet, a bet closing affects its product, a product change affects the portfolio.

The system is kanban-like: done when done. No cycles, no sprints. WIP limits create sparsity.

### 1.1 Propagation Rules by Level

**Session -> Task (automatic)**

| Session event | Condition | Task effect |
|---|---|---|
| Session ends with outcome=completed | Task has no other active sessions AND task state is `in_progress` | Task transitions to `review` |
| Session ends with outcome=crashed | Task has no other active sessions AND task state is `in_progress` | Task stays `in_progress` (agent can retry) |
| Session ends with outcome=completed | Task has other active sessions still running | No transition (wait for all) |

Rationale: A completed session means the agent believes the work is done. Moving to `review` is the natural next step per the task lifecycle. A crash does NOT auto-transition because the work may need retry. Multiple active sessions (parallel work on a single task) must all complete before transition.

**Task -> Bet (automatic check, shipped requires confirmation)**

| Task event | Condition | Bet effect |
|---|---|---|
| Task transitions to `done` | All tasks on the bet are `done` or `killed` | Bet transitions to `review` (automatic) |
| Task transitions to `done` | Some tasks are still open | No transition |
| Task transitions to `killed` | All remaining tasks are `done` or `killed` | Bet transitions to `review` (automatic) |
| Bet is in `review` | User confirms via review thread | Bet transitions to `shipped` (requires human confirmation) |

Rationale: When all tasks are complete, the bet enters `review`. The shipped transition requires human confirmation per the process-layer spec (section 5.5): "A bet ships when its done condition is met AND its high-risk artifacts have passed review." The system cannot evaluate the done condition -- only the human can confirm it was met.

**Bet -> Product (automatic, derived)**

| Bet event | Condition | Product effect |
|---|---|---|
| Bet transitions to `shipped` | -- | Product status recalculates (derived server-side on read) |
| Bet transitions to `killed` | Was an active bet | Product's activeBets counter decrements (already handled in `transitionBet`) |
| Bet transitions to `committed` | -- | Product's activeBets counter increments (already handled) |

Rationale: Product status is DERIVED, not stored. `deriveProductStatus` in `products.ts` computes it from team state and active bet states on every read. No propagation logic needed -- the existing read-time derivation already works. The only write-time effect is the `teams.activeBets` counter, which `transitionBet` already manages for committed/shipped/killed transitions.

**Product -> Portfolio (automatic, derived)**

| Product event | Condition | Portfolio effect |
|---|---|---|
| Any product state change | -- | Portfolio counters recalculate on read |

Rationale: The portfolio page already queries real data from bets and tasks on each request. Ship rate, progress, and active bet counts are computed at read time. No write-time propagation needed.

### 1.2 Summary: Automatic vs. Confirmation

| Transition | Mode |
|---|---|
| Session ended -> task to review | Automatic |
| Task done -> bet to review | Automatic |
| Bet review -> bet shipped | Human confirmation (review thread) |
| Bet shipped/killed -> product status | Automatic (derived on read) |
| Product change -> portfolio | Automatic (derived on read) |

Simplicity bias satisfied: only ONE transition requires human confirmation.

---

## 2. Schema Changes

### 2.1 propagation_log table (new)

Stores a log of every propagation attempt for auditability and retry.

```
packages/db/src/schema.ts — new table

export const propagationLog = sqliteTable(
  "propagation_log",
  {
    id: text("id").primaryKey(),
    sourceLevel: text("source_level").notNull(),     // "session" | "task" | "bet"
    sourceId: text("source_id").notNull(),            // the entity whose transition triggered propagation
    sourceEvent: text("source_event").notNull(),       // e.g. "session_ended", "task_state_changed"
    targetLevel: text("target_level").notNull(),       // "task" | "bet" | "product"
    targetId: text("target_id").notNull(),             // the entity that should be affected
    targetTransition: text("target_transition"),        // e.g. "in_progress -> review" (null if no transition was needed)
    status: text("status").notNull(),                  // "applied" | "skipped" | "failed" | "pending_retry"
    failureReason: text("failure_reason"),              // error message if failed
    attempts: integer("attempts").notNull().default(1),
    createdAt: text("created_at").notNull(),
    appliedAt: text("applied_at"),
  },
  (table) => [
    index("propagation_log_source_idx").on(table.sourceLevel, table.sourceId),
    index("propagation_log_status_idx").on(table.status),
    index("propagation_log_created_at_idx").on(table.createdAt),
  ],
);
```

Rationale: The AC requires "Failed propagations are logged and retried; nothing is silently dropped." A dedicated table gives us:
1. Audit trail (which propagation happened when)
2. Retry state (status=pending_retry, attempts counter)
3. Diagnostic visibility (what failed and why)

This table is NOT surfaced in the UI. It is infrastructure for the retry mechanism and for debugging. The user sees the RESULT of propagation (status chips changing), not the mechanism.

### 2.2 Inferred types addition

```typescript
export type PropagationLogRow = typeof propagationLog.$inferSelect;
export type NewPropagationLogRow = typeof propagationLog.$inferInsert;
```

### 2.3 Migration

Forward-only migration creates the table. No existing data is affected.

```
packages/db/drizzle/NNNN_add_propagation_log.sql

CREATE TABLE propagation_log (
  id TEXT PRIMARY KEY NOT NULL,
  source_level TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_event TEXT NOT NULL,
  target_level TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_transition TEXT,
  status TEXT NOT NULL,
  failure_reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  applied_at TEXT
);
CREATE INDEX propagation_log_source_idx ON propagation_log (source_level, source_id);
CREATE INDEX propagation_log_status_idx ON propagation_log (status);
CREATE INDEX propagation_log_created_at_idx ON propagation_log (created_at);
```

Rollback: `DROP TABLE propagation_log;` (no other tables affected).

---

## 3. Shared Types

### 3.1 Propagation-related types in packages/shared/src/propagation.ts (new file)

```typescript
export type PropagationLevel = "session" | "task" | "bet" | "product" | "portfolio";

export type PropagationStatus = "applied" | "skipped" | "failed" | "pending_retry";

export interface PropagationResult {
  sourceLevel: PropagationLevel;
  sourceId: string;
  targetLevel: PropagationLevel;
  targetId: string;
  targetTransition: string | null;  // e.g. "in_progress -> review" or null if no-op
  status: PropagationStatus;
  failureReason?: string;
}
```

### 3.2 New domain events in packages/shared/src/events.ts

```typescript
export interface PropagationAppliedEvent {
  type: "propagation_applied";
  streamId: string;  // = targetId
  sourceLevel: PropagationLevel;
  sourceId: string;
  targetLevel: PropagationLevel;
  targetId: string;
  targetTransition: string;
  timestamp: number;
}

export interface PropagationFailedEvent {
  type: "propagation_failed";
  streamId: string;  // = targetId
  sourceLevel: PropagationLevel;
  sourceId: string;
  targetLevel: PropagationLevel;
  targetId: string;
  failureReason: string;
  attempts: number;
  timestamp: number;
}
```

Add both to the `DomainEvent` union.

---

## 4. Server-Side Propagation Engine

### 4.1 File: packages/server/src/services/lifecycle-propagation.ts (new)

The propagation engine is a set of event handlers registered on the EventBus, following the same pattern as `session-review-creator.ts` and `policy-engine.ts`.

```typescript
import { createLogger, type EventBus } from "@hyperidle/shared";
import type { HyperIdleDb } from "@hyperidle/db";

const logger = createLogger({ pkg: "server.lifecycle-propagation" });

const MAX_RETRY_ATTEMPTS = 3;

export function registerLifecyclePropagation(
  db: HyperIdleDb,
  eventBus: EventBus,
): () => void {
  // Handler 1: session_ended -> evaluate task transition
  const unsubSessionEnded = eventBus.on("session_ended", (event) => {
    propagateSessionToTask(db, eventBus, event.sessionId, event.taskId, event.outcome);
  });

  // Handler 2: task_state_changed -> evaluate bet transition
  const unsubTaskChanged = eventBus.on("task_state_changed", (event) => {
    if (event.toState === "done" || event.toState === "killed") {
      propagateTaskToBet(db, eventBus, event.taskId);
    }
  });

  // Handler 3: bet_state_changed -> emit propagation_applied for downstream listeners
  // Product/portfolio status is DERIVED on read, so no write-time propagation needed.
  // We still log the propagation for audit purposes.
  const unsubBetChanged = eventBus.on("bet_state_changed", (event) => {
    if (event.toState === "shipped" || event.toState === "killed") {
      logBetToProductPropagation(db, eventBus, event.betId, event.toState);
    }
  });

  return () => {
    unsubSessionEnded();
    unsubTaskChanged();
    unsubBetChanged();
  };
}
```

### 4.2 propagateSessionToTask

```typescript
function propagateSessionToTask(
  db: HyperIdleDb,
  eventBus: EventBus,
  sessionId: string,
  taskId: string,
  outcome: string,
): void {
  // 1. Only propagate on completed outcome (not crashed/stopped)
  if (outcome !== "completed") {
    logPropagation(db, {
      sourceLevel: "session", sourceId: sessionId,
      targetLevel: "task", targetId: taskId,
      sourceEvent: "session_ended",
      status: "skipped",
      targetTransition: null,
    });
    return;
  }

  // 2. Check if task has other active sessions
  // (query sessions WHERE task_id = taskId AND state = 'active')
  // If yes, skip -- wait for all sessions to finish.

  // 3. Check task is in 'in_progress' state
  // If not (e.g., already in review or done), skip.

  // 4. Transition task to 'review'
  // Use transitionTask(db, eventBus, taskId, "review")
  // Wrap in try/catch for InvalidTransitionError

  // 5. Log the propagation result
  // On success: status = "applied", targetTransition = "in_progress -> review"
  // On failure: status = "failed", failureReason = error message
  //   If failed, insert with status = "pending_retry" and schedule retry
}
```

### 4.3 propagateTaskToBet

```typescript
function propagateTaskToBet(
  db: HyperIdleDb,
  eventBus: EventBus,
  taskId: string,
): void {
  // 1. Look up the task to find its betId

  // 2. Look up the bet to check current status
  // Only propagate if bet is in "in_progress" or similar active state

  // 3. Query all tasks for this bet
  // Check: are ALL tasks in terminal state (done or killed)?

  // 4. If yes, transition bet to "review"
  // Use transitionBet(db, eventBus, betId, "review", { reason: "All tasks completed" })

  // 5. Create a review thread for the bet
  // The user must confirm the bet ships (per design decision).
  // Thread uses hostKind="bet", hostId=betId.
  // Message type = "review" with payload indicating ship-confirmation needed.

  // 6. Log the propagation result
}
```

### 4.4 logBetToProductPropagation

```typescript
function logBetToProductPropagation(
  db: HyperIdleDb,
  eventBus: EventBus,
  betId: string,
  newStatus: string,
): void {
  // 1. Look up the bet to find its productId

  // 2. Log the propagation as "applied" (product status is derived, not stored)
  // The bet-state-machine already handles the teams.activeBets counter.

  // 3. Emit propagation_applied event for audit
}
```

### 4.5 Retry mechanism

```typescript
function retryFailedPropagations(db: HyperIdleDb, eventBus: EventBus): void {
  // Query propagation_log WHERE status = 'pending_retry' AND attempts < MAX_RETRY_ATTEMPTS
  // For each row, re-execute the propagation based on sourceLevel/sourceEvent
  // On success: update status to 'applied'
  // On failure: increment attempts; if >= MAX_RETRY_ATTEMPTS, set status to 'failed'
  //   and create a notification queue entry (severity: warning)
}
```

The retry is triggered by a heartbeat routine (using the existing routine infrastructure). Not a polling loop -- a cron-like routine that runs every 30 seconds, checks for pending retries, and processes them. This uses the existing `registerBuiltinRoutineHandlers` pattern.

### 4.6 logPropagation helper

```typescript
function logPropagation(
  db: HyperIdleDb,
  entry: {
    sourceLevel: string;
    sourceId: string;
    sourceEvent: string;
    targetLevel: string;
    targetId: string;
    targetTransition: string | null;
    status: string;
    failureReason?: string;
  },
): void {
  db.insert(propagationLog).values({
    id: crypto.randomUUID(),
    sourceLevel: entry.sourceLevel,
    sourceId: entry.sourceId,
    sourceEvent: entry.sourceEvent,
    targetLevel: entry.targetLevel,
    targetId: entry.targetId,
    targetTransition: entry.targetTransition,
    status: entry.status,
    failureReason: entry.failureReason ?? null,
    createdAt: new Date().toISOString(),
    appliedAt: entry.status === "applied" ? new Date().toISOString() : null,
  }).run();
}
```

---

## 5. Registration in app.ts

Add to `createApp` in the disposers block (alongside `registerSessionReviewCreator`, `registerPolicyEngine`, etc.):

```typescript
import { registerLifecyclePropagation } from "./services/lifecycle-propagation.js";

// ... inside createApp, in the disposers block:
disposers.push(registerLifecyclePropagation(options.db, eventBus));
```

---

## 6. WebSocket Broadcasting

Add new event forwarding in `ws-broadcaster.ts`:

```typescript
const unsubPropApplied = this.eventBus.on("propagation_applied", (event) => {
  this.broadcast("work", JSON.stringify(event));
});
const unsubPropFailed = this.eventBus.on("propagation_failed", (event) => {
  this.broadcast("rail", JSON.stringify(event));
});
```

Rationale: `propagation_applied` goes to the `work` topic so the UI can invalidate its data. `propagation_failed` goes to the `rail` topic so the notification system picks it up.

---

## 7. Ship-Confirmation Review Thread

When all tasks on a bet complete and the bet auto-transitions to `review`, the propagation engine creates a review thread:

```typescript
// In propagateTaskToBet, after transitioning bet to review:

// 1. Create thread
const threadId = crypto.randomUUID();
const now = new Date().toISOString();
db.insert(threads).values({
  id: threadId,
  hostKind: "bet",
  hostId: betId,
  initiatorId: "system:propagation",
  participants: JSON.stringify(["system:propagation", "u-founder"]),
  lastActiveAt: now,
  createdAt: now,
}).run();

// 2. Create review message
const messageId = crypto.randomUUID();
db.insert(messages).values({
  id: messageId,
  senderId: "system:propagation",
  threadId,
  type: "review",
  payload: JSON.stringify({
    kind: "ship_confirmation",
    betId,
    betTitle: deriveTitleFromPitch(bet.pitch, betId),
    taskSummary: { done: doneCount, killed: killedCount, total: totalCount },
    message: "All tasks on this bet are complete. Confirm shipping?",
  }),
  clientKey: `propagation-ship-${betId}-${Date.now()}`,
  createdAt: now,
}).run();

// 3. Update thread lastActiveAt
db.update(threads)
  .set({ lastActiveAt: now })
  .where(eq(threads.id, threadId))
  .run();

// 4. Emit thread events so the UI refreshes
eventBus.emit({
  type: "thread_created",
  streamId: threadId,
  threadId,
  hostKind: "bet",
  hostId: betId,
  initiatorId: "system:propagation",
  timestamp: Date.now(),
});
```

When the user responds to this review thread with a "approve" verdict (using L7's response-as-event path), the existing thread-resolution flow fires. The bet then transitions from `review` to `shipped` via `transitionBet`. This is the same flow L14 already supports -- no new endpoint needed. The user approves via the existing verdict mechanism in the Conversations view.

---

## 8. Audit Trail Integration

### 8.1 Task audit trail

When the propagation engine transitions a task, the `transitionTask` function already writes to the task's `auditTrail` JSON column. The audit entry will have `from` and `to` states. To distinguish system-propagation from agent-initiated transitions, we add an optional `source` field to `StateTransitionAuditEntry`:

File: `packages/server/src/services/task-audit.ts`

```typescript
export interface StateTransitionAuditEntry {
  from: string;
  to: string;
  timestamp: string;
  source?: "agent" | "human" | "propagation";  // NEW optional field
}
```

The `transitionTask` function needs a small extension to accept an optional `source` parameter and pass it through to the audit entry.

### 8.2 Bet revision log

When the propagation engine transitions a bet, the `transitionBet` function already writes to the bet's `revisionLog`. The `actor` field (added in L14) distinguishes human-initiated from system-initiated. The propagation engine passes `actor: "system:propagation"` so the log reads distinctly.

---

## 9. Concept Doc Update

### 9.1 New file: docs/process-layer/lifecycle-propagation.md

Content covers:
- The five levels and their relationships
- The propagation rules table (section 1.1 above)
- The automatic-vs-confirm split (section 1.2 above)
- The kanban principle: no cycles, no sprints, done when done
- The retry contract: failed propagations are logged and retried up to 3 times; after exhaustion, a notification alerts the operator
- The derivation principle: product and portfolio status are derived on read, not propagated on write

### 9.2 Update: docs/process-layer/the-five-primitives.md

Add a cross-reference to the new propagation doc in the Session, Task, and Bet sections. Specifically note that session completion can trigger task state changes, and task completion can trigger bet state changes.

---

## 10. API Changes

### 10.1 No new REST endpoints needed

Product and portfolio status are already derived on read. The propagation engine operates entirely through event handlers and direct DB writes. The existing endpoints already return the correct data after propagation runs.

### 10.2 Event contracts

Two new event types added to the DomainEvent union (section 3.2). These flow through the WebSocket broadcaster to the UI.

---

## 11. Implementation Tasks (ordered)

### T1: Shared types and events (packages/shared)
- Create `packages/shared/src/propagation.ts` with PropagationLevel, PropagationStatus, PropagationResult types
- Add PropagationAppliedEvent and PropagationFailedEvent to `packages/shared/src/events.ts`
- Add both to the DomainEvent union
- Export from `packages/shared/src/index.ts`
- Estimated: 30min

### T2: Schema + migration (packages/db)
- Add `propagationLog` table to `packages/db/src/schema.ts`
- Add inferred types
- Generate migration: `bun run db:generate`
- Run migration: `bun run db:migrate`
- Update `packages/db/src/schema.pg.ts` for PostgreSQL parity
- Estimated: 30min

### T3: Extend task-audit.ts (packages/server)
- Add optional `source` field to `StateTransitionAuditEntry`
- No breaking change -- field is optional
- Estimated: 15min

### T4: Extend transitionTask to accept source (packages/server)
- Add optional `source` parameter to `transitionTask` function signature
- Pass source through to the audit entry
- Existing callers are unaffected (parameter is optional)
- Estimated: 15min

### T5: Lifecycle propagation service (packages/server) -- core implementation
- Create `packages/server/src/services/lifecycle-propagation.ts`
- Implement `propagateSessionToTask`:
  - Listen to `session_ended`
  - Check outcome=completed, no other active sessions, task in in_progress
  - Call transitionTask with source="propagation"
  - Log to propagation_log
- Implement `propagateTaskToBet`:
  - Listen to `task_state_changed` for toState=done|killed
  - Check all tasks on bet are terminal
  - Call transitionBet with actor="system:propagation"
  - Create ship-confirmation review thread
  - Log to propagation_log
- Implement `logBetToProductPropagation`:
  - Listen to `bet_state_changed` for toState=shipped|killed
  - Log to propagation_log (product status is derived, not written)
  - Emit propagation_applied event
- Implement `logPropagation` helper
- Implement `retryFailedPropagations` function
- Export `registerLifecyclePropagation`
- Estimated: 3-4 hours

### T6: Register propagation engine in app.ts
- Import and register in the disposers block
- Estimated: 10min

### T7: WebSocket broadcaster update
- Add `propagation_applied` -> "work" topic
- Add `propagation_failed` -> "rail" topic
- Estimated: 10min

### T8: Retry heartbeat
- Register a periodic check in `registerLifecyclePropagation` using `setInterval` (simple in-process timer, not a full routine -- the propagation_log table provides durability)
- Interval: 30 seconds
- Checks for status=pending_retry rows, executes retry, updates status
- Creates notification queue entries for exhausted retries
- Clean up interval on dispose
- Estimated: 1 hour

### T9: Concept doc update
- Create `docs/process-layer/lifecycle-propagation.md`
- Update cross-references in `docs/process-layer/the-five-primitives.md`
- Estimated: 30min

### T10: Vitest tests
- Test: session_ended with outcome=completed -> task transitions to review
- Test: session_ended with outcome=crashed -> task stays in_progress
- Test: session_ended when other active sessions exist -> no transition
- Test: task done when all tasks on bet are terminal -> bet transitions to review
- Test: task done when some tasks are still open -> no bet transition
- Test: bet to review creates a ship-confirmation review thread
- Test: failed propagation is logged and retried
- Test: retried propagation succeeds after transient failure
- Test: exhausted retries create a notification queue entry
- Test: bet shipped -> propagation_log records the event
- Test: propagation_applied event emitted on success
- Test: propagation_failed event emitted on exhausted retries
- Estimated: 2-3 hours

### T11: Playwright e2e test
- Simulate a task finish that closes a bet:
  1. Seed a bet with one task in in_progress, one active session
  2. End the session (PATCH /sessions/:id with state=done, outcome=completed)
  3. Assert: task transitions to review, then to done (via second transition)
  4. Assert: bet transitions to review
  5. Assert: product page shows the bet in review state
  6. Note: the shipped transition requires human confirmation, so the e2e verifies up to review
- Estimated: 1-2 hours

### T12: Full verification
- `bun run check` -- zero type errors
- `bun run lint` -- zero lint errors
- `bun run test` -- all green
- Full Playwright e2e suite stays green
- Estimated: 30min

---

## 12. Trade-offs

### 12.1 Synchronous propagation vs. async queue

**Chosen: Synchronous event handlers with async retry.**

Propagation runs synchronously within the EventBus handler (same process, same tick). This is correct for the expected volume: a session_ended event triggers at most one task transition; a task_done event triggers at most one bet transition. The propagation chain is at most 3 hops deep and each hop is a single DB query + update.

The retry mechanism uses the propagation_log table for durability. If the synchronous handler fails (e.g., InvalidTransitionError because of a race), it logs the failure and a periodic retry picks it up.

Cost of the alternative (BullMQ async queue): adds Redis dependency, message serialization, and a new infrastructure concern. Unjustified for the volume.

### 12.2 Derived vs. stored product/portfolio status

**Chosen: Derived on read (existing pattern).**

Product status is already computed by `deriveProductStatus` on every read. Portfolio counters are already computed by SQL queries on every read. Adding write-time propagation for these levels would create a cache-invalidation problem (what if the derivation logic changes?) for zero user-visible benefit (reads are fast, data is fresh).

Cost of the alternative (stored status): migration to add status column to products, dual-write logic, cache invalidation concerns, migration backfill. Estimated 2+ extra days of work for a denormalization that saves ~1ms per read at current data volumes.

### 12.3 Ship confirmation via review thread vs. automatic

**Chosen: Human confirmation for bet -> shipped.**

The process-layer spec (section 5.5) explicitly states: "On founder approval, the bet moves to shipped." Making this automatic would violate the spec and remove the human quality gate. Every other transition is automatic.

Cost of the alternative (all automatic): faster shipping, but the founder loses the opportunity to catch "all tasks done but done condition not met" scenarios. The bet's done_condition is a free-text field that cannot be machine-evaluated.

### 12.4 Separate propagation_log table vs. extending audit_trail

**Chosen: Separate table.**

The task audit_trail is a JSON column on tasks -- not queryable for retry, not indexed, not structured for cross-entity analysis. The bet revision_log is a JSON column on bets -- same limitations. A dedicated propagation_log table gives us indexed queries for retry (status=pending_retry), cross-entity audit (show all propagations for bet X), and clean separation of concerns.

Cost: one new table, one new migration. Minimal.

---

## 13. Risks and Mitigations

### 13.1 Event handler ordering

Risk: The propagation handler for `session_ended` runs alongside the existing `session-review-creator` handler. Both subscribe to the same event. Order is not guaranteed.

Mitigation: They operate on different entities (propagation affects the task; review-creator affects the review queue). No conflict. Both are idempotent (propagation checks current state before transitioning; review-creator checks riskTier before creating).

### 13.2 Race between propagation and manual transitions

Risk: A human (via L14) transitions a bet to `killed` at the same moment the propagation engine tries to transition it to `review`.

Mitigation: `transitionBet` uses compare-and-set (`WHERE status = fromState`). The loser throws `InvalidTransitionError`. The propagation engine catches this and logs it as "skipped" (not "failed"), since the bet was already moved by a human. This is the expected behavior.

### 13.3 Re-entrant event emission

Risk: propagateSessionToTask calls transitionTask, which emits `task_state_changed`. propagateTaskToBet is subscribed to `task_state_changed`. This means a single `session_ended` event can cascade through two propagation levels in the same tick.

Mitigation: This is intentional and correct. The EventBus delivers events synchronously. The cascade is bounded (at most 3 hops: session -> task -> bet). Each handler is idempotent and checks current state before acting. The propagation_log records each hop separately for debugging.

### 13.4 Multiple sessions per task

Risk: A task with 3 active sessions. Session 1 completes. Propagation fires but 2 other sessions are still active. It correctly skips. Session 2 completes. Same skip. Session 3 completes. Now propagation fires and all sessions are done.

Mitigation: The handler queries `sessions WHERE task_id = X AND state = 'active'` to check for remaining active sessions. This is correct. The query runs in the same transaction as the session state update, so it sees the freshly-ended session's new state.

---

## 14. Dependency Check

**L14 (bet actions):** Already implemented. Provides `transitionBet` with actor support, pause/resume/kill endpoints, revision log with actor field. L20 reuses this directly.

**L17 (cost model):** Already implemented. Cost columns exist on sessions, tasks, bets. L20 does not modify cost logic -- it only triggers state transitions that cause cost to roll up through the existing mechanisms.

Both dependencies are met in the current codebase.

---

## 15. Files Modified (summary)

| File | Change |
|---|---|
| `packages/shared/src/propagation.ts` | NEW: propagation types |
| `packages/shared/src/events.ts` | ADD: PropagationAppliedEvent, PropagationFailedEvent to DomainEvent |
| `packages/shared/src/index.ts` | ADD: exports for new types |
| `packages/db/src/schema.ts` | ADD: propagationLog table + inferred types |
| `packages/db/src/schema.pg.ts` | ADD: propagationLog table (PG mirror) |
| `packages/db/drizzle/NNNN_*.sql` | NEW: migration for propagation_log |
| `packages/server/src/services/task-audit.ts` | MODIFY: add optional `source` field |
| `packages/server/src/services/task-state-machine.ts` | MODIFY: accept optional `source` parameter |
| `packages/server/src/services/lifecycle-propagation.ts` | NEW: propagation engine |
| `packages/server/src/services/ws-broadcaster.ts` | MODIFY: add propagation event forwarding |
| `packages/server/src/app.ts` | MODIFY: register propagation engine |
| `docs/process-layer/lifecycle-propagation.md` | NEW: concept doc |
| `docs/process-layer/the-five-primitives.md` | MODIFY: add cross-references |
| `packages/server/src/__tests__/lifecycle-propagation.test.ts` | NEW: Vitest tests |
| `packages/web/e2e/lifecycle-propagation.spec.ts` | NEW: Playwright e2e |

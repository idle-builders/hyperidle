# Track C: Process Primitives

See `docs/work-packages/SHARED.md` for tech stack, shared contracts, and dependency graph.

---

### C1 — Task State Machine + Dependency Watcher

**Story.** As the system, I want tasks to flow through an 8-state lifecycle with automatic dependency-driven transitions, so that blocked work unblocks automatically when dependencies complete.

**Depends on.** A2, A3.

**Acceptance criteria.**
- Valid transitions execute; invalid transitions throw `InvalidTransitionError`.
- Dependencies: task B depends on A. B in `on_hold`. Complete A → B auto-transitions to `accepted` and owner notified.
- Complex: C depends on A and B. Complete A → C stays `on_hold`. Complete B → C transitions to `accepted`.
- Every transition logged in audit trail.
- Transitioning to `killed` works from any state.
- `on_hold` → `accepted` auto-transition emits notification event.
- All 8 states achievable: proposed, accepted, hold, in_progress, blocked, review, done, killed.

**Validation scenarios.**
- Given task B depends on A, when A completes, then B auto-transitions to accepted.
- Given task C depends on A and B, when only A completes, then C stays in hold. When B completes, then C transitions to accepted.
- Given invalid transition, when attempted, then error thrown with clear message.

**Contracts / constraints.**
- on_hold → accepted transitions are automatic (Dependency Watcher).
- Other transitions are explicit requests.

**Effort.** M (~2d)

---

### C2 — Bet State Machine + Revision Logging

**Story.** As the system, I want bets to flow through a shaped→committed→in_progress→shipped lifecycle with revision logging, so that changes to bet scope (done_condition, hypothesis, appetite) are logged and surfaced for human approval.

**Depends on.** A2, A3.

**Acceptance criteria.**
- Create bet → `shaped`. Commit → `committed`, revision_log contains entry.
- Committing when team capacity full → `CapacityExceededError`.
- Changing done_condition on in_progress bet: revision_log entry added, item_created event fires.
- Shipping bet → `bet_shipped` event.
- Killing bet requires reason (validation enforced).
- Reshaping: committed → shaped with reason logged.
- Revision log is JSON array with `{ timestamp, field, old_value, new_value, reason }` entries.

**Validation scenarios.**
- Given capacity at limit, when attempting to commit, then error thrown.
- Given in_progress bet, when done_condition changed, then revision logged and review item created.

**Contracts / constraints.**
- Capacity check at commit time (enforced at state machine level).
- Revision log immutable once written.

**Effort.** M (~2d)

---

### C3 — Session Lifecycle

**Story.** As a task, I want agent sessions to materialize knowledge, watch files, track cost, and clean up gracefully, so that work is persisted and context window limits are respected.

**Depends on.** C1, B2, B4.

**Acceptance criteria.**
- Create session → `active`, workspace exists, materialized files present, watcher running.
- End session → `done`, watcher stopped, final pass complete, session_ended event fires.
- Crash session → `crashed`, watcher stopped, final pass complete, knowledge preserved in SQLite.
- Session cost recorded: $0.15 in session → stored on end.
- Creating session at agent's max_concurrent_sessions → `ConcurrencyLimitError`.
- Session workspace_snapshot contains path to workspace.
- After session end, workspace cleaned up (deleted).

**Validation scenarios.**
- Given task and agent, when session created, then materialization runs and watcher starts.
- Given active session at cost limit, when new session attempted, then error thrown.

**Contracts / constraints.**
- Materialization and watcher start/stop integrated into session lifecycle.
- Cost accumulation per session.

**Effort.** M (~2d)

---

### C4 — Team Management

**Story.** As the system, I want to create teams, add/remove members, enforce capacity, and track team-level costs, so that work can be organized by product with clear constraints.

**Depends on.** A2, A3.

**Acceptance criteria.**
- Create team with 3 agents → team exists, agents have team_id set.
- Add member updates agent team_id.
- Remove member with active routines → `ActiveRoutinesError` (routines must reassign first).
- getAvailableCapacity returns capacity - active_bets_count.
- Dissolving team sets dissolved_at, unlinks agents.
- Team cost = sum of session costs for agents in current cycle.
- Committing bet at capacity 0 rejected.

**Validation scenarios.**
- Given team with 5 bet slots and 3 active bets, when querying capacity, then 2 slots available.
- Given agent with active routine, when removal attempted, then error thrown.

**Contracts / constraints.**
- Capacity is enforced at bet commit time (via C2).
- Team dissolution is soft (marked dissolved_at, not deleted).

**Effort.** S (~1d)

---

### C5 — Routine Scheduler

**Story.** As the system, I want to schedule routines by cron, event, heartbeat, and continuous triggers, with cost-aware firing and delegation support, so that agents can run repeating work automatically within constraints.

**Depends on.** C3, A3.

**Acceptance criteria.**
- Heartbeat routine with interval 60s fires within 60–90s of last run.
- Calendar routine with cron `0 9 * * MON` fires at correct time.
- Event-triggered routine fires when configured event emitted.
- Delegation: owner at WIP limit, delegation_allowed true, teammate with skill exists → session for teammate.
- Factory cost cap reached → routine does NOT fire, next_run_at set to next cycle.
- Silent routine (silent=true) creates session but produces no item (verified in items table).
- Human review routine (human_review=true) output produces review item in Conversations.
- last_run_at and next_run_at updated after fire.

**Validation scenarios.**
- Given heartbeat routine, when 60s elapse, then routine fires.
- Given event-triggered routine, when event emitted, then routine fires.
- Given cost cap breached, when routine's fire time reached, then routine skipped and next_run_at moved forward.

**Contracts / constraints.**
- Polls routines table every 30 seconds for due triggers.
- Cost cap check before session creation (C7 integration).
- WIP limit respected (checks agent.max_concurrent_sessions).

**Effort.** M (~2d)

---

### C6 — Handoff Protocol

**Story.** As an agent, I want to hand off a task to another agent or a human with structured metadata (context, status, reason, artifacts, remaining work), so that work can be cleanly transferred with all necessary context.

**Depends on.** C3, C1.

**Acceptance criteria.**
- Agent A hands off to agent B → A's session ends, B becomes owner, B receives thread message with handoff metadata.
- Handoff by role: `toAgent: 'builder'` → resolves to available Builder. No Builder available → escalation item created.
- Handoff to human → task moves to `blocked`, review item created.
- Thread message contains structured handoff metadata JSON (context_id, status, reason, artifacts, remaining_work).
- Handoff with status `failed` includes error information.
- Task audit trail shows full handoff history.

**Validation scenarios.**
- Given handoff initiated, when A's session checked, then A's session is done.
- Given handoff to role, when no agent available, then escalation item created.

**Contracts / constraints.**
- Handoff message is structured (not prose-only).
- Task ownership changes atomically with session end.

**Effort.** M (~2d)

---

### C7 — Cost Cap Enforcement

**Story.** As the system, I want to enforce cost caps at agent, team, and factory levels with warnings and pausing, so that spending stays within budget.

**Depends on.** C3, A3.

**Acceptance criteria.**
- Agent cap $10 → after $10 spent, checkCostCap returns `{ allowed: false, level: 'agent' }`.
- Team cap $50 → team total at $50 blocks new sessions even if agent has budget.
- Factory cap $200 → no agent can start session when hit.
- Breach emits `cost_cap_breached` event with level and spend.
- Warning at 80%: factory cap $200, spend $160 → `cost_cap_warning` emits.
- After reset, agents can start sessions again.
- In-progress sessions NOT killed (finish naturally).
- Review thread item created on breach.
- Idempotency: duplicate warnings deduplicated by session_id + event_type.

**Validation scenarios.**
- Given agent at daily budget limit, when new session attempted, then `CostCapExceededError` thrown.
- Given factory cost at 80% of cap, when cost incremented, then warning event fires.
- Given in-progress session at factory cap, when cap breach occurs, then session continues to completion.

**Contracts / constraints.**
- Caps checked at session creation time (C5/D5 integration).
- Cost reset on cycle boundary (daily default).
- Per-level hierarchy: agent < team < factory (agent cap applies even if team has budget).

**Effort.** M (~2d)

---

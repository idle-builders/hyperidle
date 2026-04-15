# Work Packages — HyperIdle Implementation

Agent-friendly user stories organized in eight parallel tracks with outcome-level acceptance criteria.

---

## Tech Stack Decision

**Backend:** TypeScript on Bun, Hono (HTTP/WebSocket), Drizzle ORM (SQLite + PostgreSQL), BullMQ (production scheduling).
**Frontend:** React + Vite + TypeScript, Tailwind CSS + DaisyUI + `factory-dark` theme.
**Database:** Drizzle dual-driver schema (better-sqlite3 default, postgres.js for scale).
**Monorepo:** Five packages: `db`, `server`, `web`, `fabric`, `shared`.

---

## Shared Contracts (consolidated)

**KnowledgeMetadata schema signature:**
```
{
  layer: 'L0' | 'L1' | 'L2' | 'L3' | 'L4',
  scope_id: string | null,
  kind: string,
  topic: string | null,
  title: string,
  body: string,
  format: 'markdown' | 'toon',
  status: 'captured' | 'provisional' | 'validated' | 'active' | 'stale' | 'archived',
  version: number,
  updated_by: string,
  meta: Record<string, unknown>
}
```

**RevisionLogEntry shape (for bets):**
```
{ timestamp: string, field: string, old_value: unknown, new_value: unknown, reason: string }
```

**Event bus guarantees:** Per-stream ordering (same stream ID events arrive in order), at-least-once delivery (emitted after database write durability).

**WebSocket push contract:** All real-time endpoints (`/api/ws/*`) deliver updates in same shape as corresponding REST response + `_event: 'update' | 'delete'` field.

**Harness error taxonomy:** `InvalidTransitionError`, `VersionConflictError`, `CapacityExceededError`, `CostCapExceededError`, `ConcurrencyLimitError`, `MissingCredentialError`, `ActiveRoutinesError`.

**8-state task lifecycle:** proposed → accepted → hold → in_progress → blocked → review → done → killed. `hold` auto-transitions to `accepted` when all dependencies complete.

**10 verdict actions:** approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate. Keyboard shortcuts: A, A+C, C, I, R, E, X, ↵, S, ↑.

**5 ArtifactView shapes:** text_diff, content_preview, visual_comparison, action_summary, data_metrics.

---

## UI Stack & Component Budget

**Foundation:** Tailwind CSS + DaisyUI + custom `factory-dark` theme (surfaces, accents, text hierarchy, radius, fonts).

**Behavior:** `focus-trap-react` (modals), `@floating-ui/react` (positioning).

**Custom components:** 19 total across three tiers:
- **Tier 1 (5):** StatusChip, Tag, KeyValue, NavItem, SearchField
- **Tier 2 (6):** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow
- **Tier 3 (8):** IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector

---

## Implementation Tracks & Dependency Graph

Eight parallel tracks. Within each track, stories are sequential. Tracks run in parallel where dependencies allow.

Critical path: **A1 → A2 → B1 → B2 → B4 → C3 → D5 → E6 → UI-00 → UI-10 → UI-20 → UI-30 → UI-31 → UI-32 → UI-40 → G1 → G2 → G3 → G4 → H4**

Parallel windows:
- B (Knowledge Fabric) and C (Process Primitives) fully parallel after A2.
- E (API Layer) starts after A3.
- D (Agent Runtime) needs B2 + C3 before starting.
- UI starts after E6 (all endpoints).
- G (Facilitators) needs D4 + B4 + C5.
- H (Operations) can start once D5 core loop works.

```
A1 ─► A2 ─► A3
      │      │
      ├──────┼─► B1 ─► B2 ─► B3 ─► B4 ─► B5 ─► B6
      │      │
      ├──────┼─► C1 ─► C2 ─► C3 ─► C4 ─► C5 ─► C6 ─► C7
      │      │
      │      ├─► E1 ─► E2 ─► E3 ─► E4 ─► E5 ─► E6
      │      │         │                         │
      │      │         │                         └─► UI-00 ─► UI-10 ─► UI-20 ─► UI-30 ─► UI-31 ─► UI-40 ─► UI-50
      │      │         │                              │      │      │      │      │                    │
      │      │         │                              └──────┘      │      │      └─── UI-32 ─────────┘
      │      │         │                                           UI-42  UI-45 (parallel with UI-31/32)
      │      │
      ├──────┼───────────────────────► D1 ─► D2 ─► D3 ─► D4 ─► D5
      │      │                                              │
      │      └──────────────────────────────────────────────┼─► G1 ─► G2 ─► G3 ─► G4
      │                                                     │
      └─────────────────────────────────────────────────────┴─► H1 ─► H2 ─► H3 ─► H4
```

---

## Track A: Foundation

### A1 — Project Scaffolding

**Story.** As an agent, I want a working monorepo with TypeScript, testing, and database tooling configured, so that I can begin implementing features with type safety and confidence that changes are tested.

**Depends on.** None.

**Acceptance criteria.**
- `bun install` completes with zero errors.
- `bun test` runs Vitest across all packages with ≥3 tests per critical package (db, server, fabric).
- `bun dev` starts both Hono (port 3001) and Vite (port 5173).
- `GET /health` returns `{ status: "ok", timestamp: ... }`.
- React app renders at `localhost:5173`.
- Cross-package type import works: `packages/shared` type imported in both server and web.
- Drizzle connects to in-memory SQLite in a test and executes a query.

**Validation scenarios.**
- Given monorepo initialized, when running tests, then all tests pass and coverage is reported.
- Given app running, when requesting health endpoint, then response is valid and immediate.

**Contracts / constraints.**
- Test utilities (`createTestDb()`, `createTestApp()`) are exported and reusable by all downstream stories.
- Coverage targets: 80% unit, critical paths in integration.

**Effort.** M (~2d)

---

### A2 — Database Schema + Migrations

**Story.** As an agent, I want the complete database schema defined and migrated, with seed data in place, so that I can interact with the canonical stores (process primitives, knowledge, items, responses) as I build features.

**Depends on.** A1.

**Acceptance criteria.**
- `bun run db:migrate` applies migrations to fresh SQLite without errors.
- All tables insert/read/update correctly with full type safety.
- All five knowledge_items indexes exist.
- Seed script populates ≥1 row per major table (agents, teams, products, knowledge_items, factory_settings).
- Same schema works against PostgreSQL (via Docker) — dual-driver support proven.
- Foreign key constraints enforced.

**Validation scenarios.**
- Given empty database, when running migrations, then schema is created correctly.
- Given seeded database, when querying each table, then seed data is present and well-formed.
- Given PostgreSQL enabled, when running migrations, then schema created correctly in Postgres.

**Contracts / constraints.**
- Schema must be versionable (migrations as SQL files, numbered sequentially).
- Shared types (TaskState, KnowledgeLayer, etc.) must be importable from `packages/shared`.

**Effort.** M (~2d)

---

### A3 — Event Bus

**Story.** As an agent, I want typed events flowing through an in-process pub/sub system with per-stream ordering and at-least-once delivery, so that components can react to state changes without tight coupling.

**Depends on.** A1.

**Acceptance criteria.**
- Subscribers receive events in order for the same stream.
- Multiple subscribers to same event both receive it.
- Unsubscribe prevents future delivery.
- Type errors on malformed payloads fail at compile time.
- Throughput: 1000 events/sec without drops.
- Wildcard subscription (`bus.on('*', ...)`) receives all events.
- Per-stream ordering: 5 sequential events for same task arrive in order.
- At-least-once delivery: events emitted only after database write durability.

**Validation scenarios.**
- Given subscriber to `task_state_changed`, when event is emitted, then subscriber receives typed payload.
- Given 1000 events emitted, when throughput test runs, then all events delivered without loss.
- Given wildcard subscription, when event emitted, then wildcard subscriber receives it.

**Contracts / constraints.**
- Event types defined in `packages/shared/events.ts` as TypeScript union types.
- Redis adapter interface defined (implementation deferred).
- Synchronous emission after database durability (not async).

**Effort.** S (~1d)

---

## Track B: Knowledge Fabric

### B1 — Knowledge Items CRUD + Search

**Story.** As an agent or human, I want to create, read, update, and search knowledge items from a canonical SQLite store, with optimistic versioning and full-text search, so that knowledge can be queried and modified reliably.

**Depends on.** A2.

**Acceptance criteria.**
- Create, read, update operations succeed with version control.
- Update with stale version throws `VersionConflictError` with current version.
- FTS5 search on 10 items returns matching items ranked by relevance.
- Every update creates `knowledge_edit_log` entry.
- `knowledge_item_updated` event fires on every write.
- Pagination works: limit 5, offset 0 returns first 5.
- List by layer, scope_id, kind, topic filters correctly.

**Validation scenarios.**
- Given knowledge item, when updated with correct version, then version increments and new row appears in edit log.
- Given 10 knowledge items, when searched for keyword, then matching items returned with relevance ranking.
- Given stale version, when update attempted, then error thrown with current version in response.

**Contracts / constraints.**
- `version` column for optimistic concurrency (per-field last-writer-wins strategy lives in B5).
- FTS5 virtual table required for search.

**Effort.** M (~2d)

---

### B2 — Materialization Engine

**Story.** As an agent starting a session, I want a workspace directory materialized with relevant knowledge (context/, knowledge/, work/ zones), so that I have exactly what I need for the task without wasting context tokens.

**Depends on.** B1, B3.

**Acceptance criteria.**
- Materialized workspace contains context/, work/, knowledge/ zones with correct permissions (context/ read-only).
- `.fabric/manifest.json` exists with version tracking per item.
- Role-filtered practices: growth practices NOT materialized for a Builder.
- Materialization of 200 items completes in <10 seconds.
- Re-materialization overwrites workspace cleanly.
- `session.toon` context pack in context/ contains task state and bet context.

**Validation scenarios.**
- Given task for Builder agent, when materialization runs, then workspace contains only building-relevant practices in context/.
- Given 200 knowledge items, when materialization runs, then completes within time budget.

**Contracts / constraints.**
- Workspace layout must match KNOWLEDGE_ARCHITECTURE.md §4.2 exactly.
- Materialization budget applied via B6 (relevance + token budget).

**Effort.** M (~2d)

---

### B3 — TOON Codec

**Story.** As a materialization engine, I want to encode/decode TOON format for compact context packs, so that agent context windows can hold more knowledge.

**Depends on.** A1.

**Acceptance criteria.**
- Round-trip encode/decode identical for 10 test cases.
- TOON-encoded practice ≥30% smaller than JSON (by token count).
- Nested objects (3 levels, arrays, nulls) encode/decode correctly.
- Malformed TOON throws descriptive `ToonParseError`.
- 1000 items encode/decode in <100ms.

**Validation scenarios.**
- Given complex nested object, when round-trip encode/decode, then result is identical.
- Given practice and JSON version, when token count compared, then TOON is ≥30% smaller.

**Contracts / constraints.**
- Follows spec at github.com/toon-format/toon.

**Effort.** S (~1d)

---

### B4 — File Watcher + Continuous Writeback

**Story.** As an agent writing files in a session workspace, I want changes automatically synced back to SQLite with conflict detection and versioning, so that knowledge persists across session boundaries without manual checkpoints.

**Depends on.** B2, B1.

**Acceptance criteria.**
- New file in knowledge/ creates knowledge_items row with status CAPTURED within 2 seconds.
- Modified file updates corresponding row, version increments.
- Deleted file flags for facilitator review (item created), NOT auto-deleted.
- 10 files written in 200ms debounce collapses to ≤10 writeback operations.
- Version conflict: external update + agent file change creates knowledge_conflicts row.
- stopWatcher() final pass completes, subsequent writes not recorded.
- Manifest updated after each writeback.
- work/session-notes.md changes reflected in sessions.notes.
- Polling fallback detects changes within 3 seconds.
- Last-writer-wins: agent writes T=0, human patches T=250ms (within 500ms window) → human change wins, conflict flagged.

**Validation scenarios.**
- Given file written to knowledge/ directory, when 2 seconds elapse, then corresponding row exists in knowledge_items.
- Given version conflict, when manifest checked after writeback, then version bumped and conflict record created.
- Given human update within 500ms window, when file also updated by agent, then human change takes precedence.

**Contracts / constraints.**
- Uses `Bun.watch()` with 500ms debounce; polling fallback for environments without native watcher.
- Workspace layout: context/ (read-only), knowledge/ (read-write), work/ (read-write), .fabric/manifest.json (metadata).
- E4 contract: B4 unblocks E4 for workspace file serving.

**Effort.** M (~3d)

---

### B5 — Conflict Resolution

**Story.** As the knowledge system, I want concurrent edits to same items to resolve automatically for structured data (per-field LWW) and escalate to humans for prose, so that knowledge updates don't block each other.

**Depends on.** B4, B1.

**Acceptance criteria.**
- Two edits to different fields of structured practice: both apply, no conflict record.
- Two edits to same field of structured practice: last writer wins for field, conflict record created.
- Two edits to prose item: both versions stored, conflict record with status 'open', older version remains active.
- Conflict record contains version_base, version_current, proposed_body, proposed_by.
- Open conflict prevents promotion to VALIDATED status.
- Resolving conflict (status 'resolved') allows promotion.

**Validation scenarios.**
- Given two concurrent edits to different fields, when writeback runs, then both changes apply without conflict.
- Given two concurrent edits to same field, when writeback runs, then last writer wins and conflict record created.

**Contracts / constraints.**
- Per-field merge only for structured items (practices, decisions, failures).
- Prose conflicts require facilitator review.

**Effort.** S (~1d)

---

### B6 — Materialization Budget + Relevance Scoring

**Story.** As materialization, I want to score knowledge relevance and enforce a token budget, so that agents load exactly what they need without wasting context.

**Depends on.** B1, B2.

**Acceptance criteria.**
- Practice tagged "file-handling" scores higher than "email-marketing" for file-upload task.
- Recently updated practice scores higher than stale one (same relevance).
- Budget enforcement: 200 items, 40K token budget → only top-scoring items returned.
- L4 factory items always included (non-negotiable context).
- 200K context window allocates ~40K for knowledge (verify math).
- Scoring weights overridable via factory_settings (no code changes).

**Validation scenarios.**
- Given task about file handling, when relevance scoring runs, then file-handling practice ranked higher.
- Given 200 items, 40K token budget, when materialization runs, then items within budget returned.

**Contracts / constraints.**
- Scoring factors: task tag match, role match, recency, confidence, usage frequency, layer proximity.
- Budget allocation: 40% task, 30% L0 session, 20% L2+L3, 10% L4.
- Token counting via whitespace-split approximation.

**Effort.** S (~1d)

---

## Track C: Process Primitives

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

## Track D: Agent Runtime

### D1 — Harness Adapter Interface

**Story.** As a harness integrator, I want an abstraction layer that defines how to spawn agents, stream events, and stop sessions, so that any harness (Claude, Goose, OpenHands) can be plugged in.

**Depends on.** A1.

**Acceptance criteria.**
- HarnessAdapter interface compiles with full type safety.
- MockHarnessAdapter implements interface: startSession, streamEvents (yields 3 mock events), stopSession.
- Test uses mock adapter to create, stream, and stop session — all events received in order.
- SessionConfig includes workspace path, soul prompt path, model tier, tools list.
- Mock adapter getCapabilities returns `{ preCompactionTrigger: true, subAgents: true }`.
- Interface generic enough for future adapters without changes.

**Validation scenarios.**
- Given mock adapter, when session started, then handle returned.
- Given session running, when streamEvents consumed, then events received in order.

**Contracts / constraints.**
- Interface only — no concrete implementation in D1 (that's D2).
- Event types: token_usage, tool_call, completion, error, cost_update, pre_compaction.

**Effort.** S (~1d)

---

### D2 — Claude Agent SDK Adapter

**Story.** As a Claude SDK user, I want a concrete harness adapter for Claude Agent SDK that handles model tier mapping, pre-compaction triggers, and cost tracking, so that Claude agents can be spun up from the factory.

**Depends on.** D1.

**Acceptance criteria.**
- Integration test (requires API key): start session → receive completion event → stop cleanly.
- Token count from events matches actual API usage.
- Model tier mapping: Reasoning → opus, Workhorse → sonnet, Fast → haiku.
- Pre-compaction trigger: approaching context limit → pre_compaction event fires.
- Can instantiate without API key (throws MissingCredentialError on startSession, not construction).
- cost_update events report costs within 10% of API reported.

**Validation scenarios.**
- Given Claude API key, when session started with Reasoning tier, then opus model used.
- Given context near limit, when threshold crossed, then pre_compaction event fires.

**Contracts / constraints.**
- Credential injection via environment variables.
- Token counting from Claude's output stream.

**Effort.** M (~2d)

---

### D3 — Workspace Adapter + Docker Implementation

**Story.** As a session provisioner, I want workspaces (local directories or Docker containers) where agents run with isolated file systems, so that work is sandboxed and reproducible.

**Depends on.** D1.

**Acceptance criteria.**
- Local adapter: spawn creates directory, exec('ls') lists it, destroy removes it.
- Docker adapter: spawn creates running container, exec('echo hello') returns hello, destroy stops/removes.
- Materialized workspace accessible inside container at expected path.
- File changes in container visible to host-side file watcher.
- Workspace isolated: agent cannot access files outside workspace directory.
- 5 concurrent workspaces spawn without conflict.

**Validation scenarios.**
- Given Docker enabled, when 5 workspaces spawned, then all running independently.
- Given file written inside container, when host file watcher checked, then change visible.

**Contracts / constraints.**
- WorkspaceAdapter interface: spawn, exec, destroy.
- LocalWorkspaceAdapter for laptop profile, DockerWorkspaceAdapter for production.
- Materialized workspace path passed to both D2 and B2.

**Effort.** M (~2d)

---

### D4 — Agent Skill Tools

**Story.** As an agent running a session, I want tools to read inbox, send messages, log tasks, query practices, write memory, initiate handoffs, create items, and write session notes, so that I can interact with the factory's coordination layer.

**Depends on.** B1, C1, C6.

**Acceptance criteria.**
- read_inbox: agent with 3 messages → tool returns all 3.
- send_message: sends to agent B → appears in B's inbox.
- log_task: appends "Discovered X" → task.notes contains text.
- query_practice: searches "file handling" → returns matching L3 practices.
- handoff_to: initiates to B → task owner changes, session ends (C6).
- create_item: creates review with risk_tier high → routes to Conversations.
- write_session_notes: writes to work/session-notes.md → reflected in sessions.notes.
- Each tool has valid Claude tool_use JSON schema.
- Invalid input returns structured error (not crash).

**Validation scenarios.**
- Given agent with unread messages, when read_inbox called, then all unread returned.
- Given create_item called, when item_created event checked, then event contains correct fields.

**Contracts / constraints.**
- Tools are functions registered with harness adapter.
- Tool schemas follow Claude tool_use format.

**Effort.** M (~2d)

---

### D5 — Session Provisioning (End-to-End)

**Story.** As a task awaiting agent work, I want a full session provisioning flow (cost check, workspace spawn, knowledge materialize, watcher start, agent start, event streaming, cost tracking, cleanup), so that end-to-end work execution is reliable and observable.

**Depends on.** D1, D2/D3, B2, B4, C3, C7, D4.

**Acceptance criteria.**
- End-to-end mock: provision session → workspace created, materialized, watcher running → agent writes file → writeback to SQLite → session ends → workspace cleaned.
- Claude integration test: provision real session → agent runs → session completes.
- Crash recovery: agent process dies → session marked crashed, pre-crash knowledge preserved.
- Cost cap rejection: set agent cap $0 → provisioning fails with CostCapExceededError.
- Concurrent sessions: provision 3 sessions for agent (if WIP allows) → all independent.
- Task state: moves to `in_progress` on session start.
- Sub-agent aggregation: agent spawns 2 sub-agents, verify session cost = main + sub1 + sub2.
- session_ended event fires with `{ sessionId, cost_delta, outcome, taskId }`. E2 subscribes to create review items.

**Validation scenarios.**
- Given task and agent, when session provisioned, then all steps complete (cost check, spawn, materialize, start).
- Given agent at cost cap, when session provisioned, then CostCapExceededError thrown.
- Given agent crashes mid-session, when recovery runs, then knowledge written before crash is in SQLite.

**Contracts / constraints.**
- Integrates B2 (materialization), B4 (watcher), C3 (session lifecycle), C7 (cost checks), D4 (tools), D1/D2/D3 (adapters).
- Task.state → in_progress on session start.
- E2 subscribes to session_ended events to create review items for high-value completions.

**Effort.** L (~4d)

---

## Track E: API Layer

### E1 — API Scaffold + Auth

**Story.** As a client, I want a Hono API with auth middleware, error handling, request validation, and WebSocket support, so that requests are routed correctly, validated, and errors are consistent.

**Depends on.** A2, A3.

**Acceptance criteria.**
- GET /api/health returns 200 with status.
- Request without API key to /api/* returns 401.
- Request with valid API key passes auth.
- Invalid JSON body returns 400 with validation errors.
- Unhandled error returns 500 with consistent error shape (no stack trace).
- WebSocket upgrade works on /api/ws.
- CORS allows localhost:5173.

**Validation scenarios.**
- Given invalid API key, when request made, then 401 returned.
- Given invalid JSON body, when request made, then 400 with validation errors.

**Contracts / constraints.**
- Error response shape: `{ error: string, code: string, details?: object }`.
- Request validation via Zod (auto-generated from types where possible).

**Effort.** S (~1d)

---

### E2 — Conversations + Items + Responses Endpoints

**Story.** As a human, I want to see review items and chat threads, respond with verdicts (approve, request changes, reject, snooze, etc.), and receive real-time push updates, so that I can oversee agent work and provide feedback.

**Depends on.** E1, B1, C1, D5.

**Acceptance criteria.**
- GET /api/conversations list threads, paginated, sorted by recency or attention_score.
- GET /api/conversations/:threadId thread with items and responses.
- POST /api/items create item (from agent tools, facilitators).
- POST /api/responses record verdict (10 actions: approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate).
- WebSocket /api/ws/conversations pushes new items/responses in real time.
- Item routing: risk_tier, kind → correct view (Conversations vs Rail vs Knowledge).
- Founder routing: Market/Growth → CEO; Product/Design/Tech → CPO; Strategic → Both.
- E2 subscribes to session_ended, creates review items for high-value outcomes.

**Validation scenarios.**
- Given new item created, when WebSocket connected, then item received within 1 second.
- Given human responds with approve, when response recorded, then response_recorded event fires.

**Contracts / constraints.**
- Item routing rules per HUMAN_INTERFACE_LAYER.md §7.
- Founder routing per AGENT_LAYER.md §7.

**Effort.** L (~4d)

---

### E3 — Work Endpoints (Bets + Tasks)

**Story.** As a human planning work, I want to see bets grouped by status, commit bets to cycles respecting capacity, transition tasks through states, and view the canvas, so that work planning is visible and constrained.

**Depends on.** E1, C1, C2.

**Acceptance criteria.**
- GET /api/bets list grouped by status (shaped, committed, in_progress, shipped).
- GET /api/bets/:id bet detail with tasks.
- POST /api/bets create shaped bet.
- PATCH /api/bets/:id update fields (triggers revision logging).
- POST /api/bets/:id/commit transition shaped→committed (capacity enforced).
- POST /api/bets/:id/ship transition in_progress→shipped.
- POST /api/bets/:id/kill kill with reason.
- GET /api/tasks list, filterable by bet_id, state, owner.
- PATCH /api/tasks/:id update.
- POST /api/tasks/:id/transition state transition (validates).
- GET /api/bets/canvas data for Canvas region: shaped, committed, capacity info.
- Concurrent commit at capacity: first succeeds, second rejected 409 (no race).

**Validation scenarios.**
- Given shaped bet, when committed and capacity checked, then bet_shipped event fires.
- Given team at capacity, when concurrent commits attempted, then first succeeds, second rejected 409.

**Contracts / constraints.**
- Canvas data: `{ shaped: [...], committed: [...], capacity: { used, max } }`.
- Kill requires reason (validation).

**Effort.** L (~4d)

---

### E4 — Knowledge Endpoints

**Story.** As a human curator, I want to view knowledge items by layer/scope, create/update/merge/split/archive items, search across knowledge, and receive real-time updates, so that knowledge can be curated and kept coherent.

**Depends on.** E1, B1, B4.

**Acceptance criteria.**
- GET /api/knowledge/:layer list by layer, grouped by topic, kind.
- GET /api/knowledge/:layer/:id single item.
- POST /api/knowledge/:layer create (version=1).
- PATCH /api/knowledge/:layer/:id update (optimistic locking).
- Update stale version → 409 with current version.
- POST /api/knowledge/:layer/:id/merge merge two items (combine body, both IDs redirect).
- POST /api/knowledge/:layer/:id/split split into two.
- POST /api/knowledge/:layer/:id/archive archive (status = 'archived').
- POST /api/knowledge/:layer/:id/flag flag for review.
- GET /api/knowledge/search?q=... FTS5 search, ranked by relevance.
- WebSocket /api/ws/knowledge pushes updates when files written back by agents.
- Edit log: every PATCH creates knowledge_edit_log entry.
- WebSocket delivers updates in same shape as PATCH response + `_event` field.

**Validation scenarios.**
- Given knowledge search, when results returned, then ranked by relevance.
- Given agent writes practice file, when writeback occurs, then WebSocket push delivered within 2s.

**Contracts / constraints.**
- Optimistic concurrency via version column.
- Merge/split maintain cross-links and edit log.

**Effort.** L (~4d)

---

### E5 — Rail Endpoint + WebSocket

**Story.** As a human at a glance, I want to see active bets, blockers, awaiting-ordering items, and cost burn rate on the Rail, with real-time updates via WebSocket, so that I have ambient awareness without opening conversations.

**Depends on.** E1, A3, C1, C7.

**Acceptance criteria.**
- GET /api/rail current state: bets with status, blockers, awaiting-ordering items, cost burn rate.
- WebSocket /api/ws/rail subscribes to: task_state_changed (blockers), bet_committed/shipped (status), cost_cap_warning/breached (cost), item_created (ordering queue).
- Block task → WebSocket blocker_added within 5s (NF-1.2).
- Cost warning → WebSocket cost_warning within 5s.
- Bets returned with one-liner: id, title, status, progress.
- Blockers include: task id, title, owner, duration blocked.
- Cost updates pushed every 30s or per session cost.

**Validation scenarios.**
- Given task blocked, when Rail WebSocket connected, then blocker received within 5s.
- Given factory cost at warning threshold, when cost incremented, then warning pushed.

**Contracts / constraints.**
- Rail data assembled from bets, tasks, factory_settings, items.
- Push latency target: 5s (NF-1.2).

**Effort.** M (~2d)

---

### E6 — Agents + Sessions + Status Endpoints

**Story.** As an operator, I want to view and manage agents (skills, autonomy levels), routines (trigger config, status), inbox, and factory status (active sessions, cost, uptime), so that operations are visible and configurable.

**Depends on.** E1, D5.

**Acceptance criteria.**
- GET /api/agents list all with status, team, role, current sessions.
- GET /api/agents/:id detail with skills, autonomy levels, cost.
- PATCH /api/agents/:id/skills/:skillId update autonomy level (creates review thread if changed).
- GET /api/routines list with trigger config, last/next run.
- PATCH /api/routines/:id update (enable/disable, change config).
- POST /api/routines/:id/retire retire (reassign or deactivate).
- POST /api/routines/:id/trigger manually trigger for testing.
- GET /api/agents/:id/inbox agent's inbox.
- POST /api/agents/:id/inbox send message to agent.
- POST /api/sessions create session (triggers D5).
- PATCH /api/sessions/:id update state (end, crash).
- GET /api/status factory-wide: active sessions, agent states, total cost, uptime.
- GET /api/settings factory settings.
- PATCH /api/settings update settings (cost caps, etc.).
- Autonomy update creates review thread item.

**Validation scenarios.**
- Given agent, when autonomy level changed, then review item created.
- Given routine, when manually triggered, then session created.

**Contracts / constraints.**
- Autonomy changes require human awareness (review thread created).
- Routine retirement respects mutual dependencies.

**Effort.** L (~4d)

---

### E7 — Autonomy + Silence Policy Engine (Backend v1, UI deferred to v2)

**Story.** As the system, I want to evaluate each item against autonomy levels and silence modes to decide whether to push, queue silently, or auto-resolve, so that humans only see what needs their attention and low-risk work auto-approves.

**Depends on.** E2, C7.

**Acceptance criteria.**
- Autonomy L4 + risk_tier low → auto-resolve (no notification).
- Autonomy L3 + risk_tier low → queue silently (in daily digest).
- Autonomy L2 or risk_tier ≥ medium → push notification.
- Autonomy L1 → push for every action.
- Silence mode active → queue all non-blocking items.
- Auto-resolution creates Response with approver='policy_engine'.
- High-risk items NEVER auto-resolve (regardless of autonomy).
- Skill-change items NEVER auto-resolve.
- Daily digest includes all queued items from past 24h.
- Per-product silence: silence product P → all P items queued.
- Silence windows: time-based quiet hours (e.g., 10pm–7am, no pushes).

**Validation scenarios.**
- Given L4 agent and low-risk item, when policy engine runs, then item auto-resolved.
- Given silence mode active, when item created, then item queued (not pushed).

**Contracts / constraints.**
- Policy engine runs on every item creation (E2).
- Auto-resolution policy configurable via factory_settings.
- UI for silence modes deferred to v2 (backend only in v1).

**Effort.** M (~2d)

---

## Track F: Human Interface (UI)

### UI-00 — Foundation

**Story.** As a UI developer, I want Tailwind CSS, DaisyUI, and custom theme wired up with fonts and behavior dependencies, so that all downstream components inherit consistent styling.

**Depends on.** A1.

**Acceptance criteria.**
- `npm run dev` starts with Tailwind styles applied.
- DaisyUI button renders with factory-dark colors.
- Focus ring visible on keyboard focus.
- Fonts load correctly (Inter body, Space Grotesk headings).
- Grid alignment 4px verified.
- No custom CSS — only utilities and DaisyUI.

**Validation scenarios.**
- Given Vite running, when DaisyUI button rendered, then factory-dark colors applied.

**Contracts / constraints.**
- Theme config in tailwind.config.ts.
- Surface colors, accents, text hierarchy defined (see UI_DESIGN.md).

**Effort.** S (~1d)

---

### UI-10 — Tier 1 Primitives

**Story.** As a component library, I want five foundational primitives (StatusChip, Tag, KeyValue, NavItem, SearchField) that wrap DaisyUI with semantic mapping, so that all blocks and regions use consistent, semantically correct base elements.

**Depends on.** UI-00.

**Acceptance criteria.**
- StatusChip: status enum → correct color, icon, tooltip.
- Tag: label + color → DaisyUI badge-outline.
- KeyValue: label + value → two-column or stacked layout.
- NavItem: label + active state → DaisyUI menu-item with left bar indicator.
- SearchField: input with icons → loading state, clear button, results indicator.
- All five have ≥3 Storybook stories covering states and variants.
- Storybook build succeeds.

**Validation scenarios.**
- Given StatusChip with status='blocked', when rendered, then red color applied.
- Given KeyValue in two-column layout, when rendered, then label left, value right.

**Contracts / constraints.**
- Only DaisyUI classes and Tailwind utilities (no custom CSS).
- Semantic focus on state mapping (status → color, active → style).

**Effort.** M (~2d)

---

### UI-20 — Tier 2 Blocks

**Story.** As a component library, I want six reusable card/row components (ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow) composed from Tier 1, so that pages can quickly assemble domain objects into lists.

**Depends on.** UI-00, UI-10.

**Acceptance criteria.**
- ThreadRow: avatar + title + snippet + timestamp + actions.
- BetCard: pitch + appetite badge + status + actions.
- PitchCard: hypothesis + proposer + status + actions.
- TaskCard: title + owner + state badge + cost + actions.
- KnowledgeRow: layer badge + title + kind + status + timestamp + actions.
- NotificationRow: severity icon + message + timestamp + actions.
- Each composes ≥2 Tier 1 primitives.
- ≥2 Storybook stories per component.
- Storybook build succeeds.

**Validation scenarios.**
- Given BetCard, when rendered, then appetite badge visible.
- Given TaskCard in blocked state, then red border visible.

**Contracts / constraints.**
- Compose only Tier 1 + DaisyUI.
- All states (unread, active, blocked, etc.) visually distinct.

**Effort.** M (~3d)

---

### UI-30 — Tier 3 Shell Regions

**Story.** As a page layout, I want IconRail (left), Submenu (contextual), and Rail (right notification sidebar) so that every page has consistent navigation and ambient awareness.

**Depends on.** UI-00, UI-10, UI-20.

**Acceptance criteria.**
- IconRail: vertical icon menu, labels on hover/expand.
- Submenu: collapsible, nested items, active highlight.
- Rail: bets + blockers + cost sections, collapsible.
- Keyboard nav: arrow keys, Enter to expand, Esc to close.
- Active item state distinct.
- Rail only notification surface (no bell, no global toast).
- Storybook build succeeds.

**Validation scenarios.**
- Given IconRail, when arrow keys pressed, then focus moves between items.
- Given Rail expanded, when collapsed, then icons only visible.

**Contracts / constraints.**
- Rail is the **only** notification surface in app.
- Keyboard-first interaction (arrow keys, Enter, Esc).

**Effort.** M (~3d)

---

### UI-31 — Tier 3 Work/Planning Regions

**Story.** As a work planning surface, I want Canvas (shaped/committed columns with drag), Kanban (four state columns), and PitchSelector (pitch picker modal), so that humans can compose and organize work visually.

**Depends on.** UI-00, UI-10, UI-20, UI-30.

**Acceptance criteria.**
- Canvas: drag-drop shaped → committed, capacity badge, over-capacity warning.
- Kanban: drag-drop between state columns (hold, in_progress, review, done).
- PitchSelector: SearchField + pitch list, filter/select, checkmark on select.
- Empty states: "No bets yet", "No tasks in blocked", "No pitches available".
- Storybook build succeeds.

**Validation scenarios.**
- Given Canvas, when drag bet from shaped to committed, then card moves.
- Given Kanban, when dragging task between columns, then task state updates.

**Contracts / constraints.**
- Drag-drop via React libraries (e.g., react-beautiful-dnd).
- Only Tier 1 + Tier 2 + DaisyUI.

**Effort.** M (~3d)

---

### UI-32 — Tier 3 Review Regions

**Story.** As a review surface, I want ArtifactView (five data shapes) and ReviewHeader (verdict actions with keyboard shortcuts), so that humans can evaluate agent work and respond quickly with structured verdicts.

**Depends on.** UI-00, UI-10, UI-20, UI-30.

**Acceptance criteria.**
- ArtifactView: text_diff (green/red), content_preview (HTML+metadata), visual_comparison (before/after), action_summary (structured fields), data_metrics (headlines + charts).
- Each shape has Storybook stories: default, loading, error, empty.
- ReviewHeader: proposer info + all 10 verdict buttons + keyboard shortcuts.
- Keyboard shortcuts work: A → Approve, R → Request Changes, X → Reject, S → Snooze.
- All regions use only Tier 1 + Tier 2 + DaisyUI.
- Accessibility tests (axe) pass.

**Validation scenarios.**
- Given ArtifactView with text_diff, when rendered, then additions green, deletions red.
- Given ReviewHeader, when A pressed, then Approve button focused/activated.

**Contracts / constraints.**
- Syntax highlighting for text_diff (e.g., Prism or highlight.js).
- Keyboard shortcuts pre-fill verdict, user presses Enter to confirm.
- 10 verdict actions: approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate.

**Effort.** M (~3d)

---

### UI-40 — Tier 4 Pages

**Story.** As a human user, I want nine domain pages (Conversations/Review, Conversations/Chat, Work/Portfolio, Work/Team, Work/Team+Pitch, Work/Bet, Knowledge/List, Knowledge/Detail, Settings) composed entirely from Tier 3 regions, so that all app functionality is navigable and usable.

**Depends on.** UI-30, UI-31, UI-32, E2, E3, E4, E5, E6.

**Acceptance criteria.**
- All nine pages render without errors.
- Each composed only from Tier 3 regions (no custom components outside 19-component budget).
- Navigation between pages works (Submenu items link to routes).
- Main pane content distinct per domain (thread list, bet list, knowledge list, etc.).
- Rail updates in real time from /api/ws/rail.
- Shell layout (IconRail | Submenu | Main | Rail) consistent.
- Responsive: single-column or tabs on mobile.
- Storybook build succeeds.

**Validation scenarios.**
- Given Conversations page, when item created via API, then item appears in list within 1s.
- Given Work page, when bet transitioned, then Canvas updates in real time.

**Contracts / constraints.**
- No custom components outside the 19-component budget (StatusChip, Tag, KeyValue, NavItem, SearchField, ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow, IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector).
- React Router for navigation.

**Effort.** L (~4d)

---

### UI-42 — Settings Panel

**Story.** As a human, I want to access settings from a user avatar menu with five tabs (Profile, Products, Agents, Notifications, Appearance), so that I can configure my experience and agent autonomy levels.

**Depends on.** UI-00, UI-10, UI-20, UI-30.

**Acceptance criteria.**
- Settings modal opens from avatar click in IconRail.
- Five tabs: Profile (name/email/avatar), Products (activate/deactivate per product), Agents (autonomy level dropdowns, pause/reactivate), Notifications (toggles for review/cost/blocker, quiet hours, product mutes), Appearance (theme, density).
- Save button disables while request in flight.
- Validation: cost caps ≥0, times valid 24h format.
- Feedback routed to Rail (not inline toast).
- Only composes existing Tier 1/2 + DaisyUI.

**Validation scenarios.**
- Given Settings opened, when autonomy level changed, then Save button enabled.
- Given invalid cost cap, when Save attempted, then validation error shown.

**Contracts / constraints.**
- Five tabs using DaisyUI tabs component.
- No new components outside 19-component budget.
- Theme UI (light/dark) deferred to v2.

**Effort.** S (~2d)

---

### UI-45 — Global Search Panel

**Story.** As a human, I want to press ⌘K to open a global search modal that searches conversations, bets, and knowledge items with real-time results grouped by type, so that I can quickly navigate to any item.

**Depends on.** UI-00, UI-10, UI-20.

**Acceptance criteria.**
- ⌘K opens search modal (Ctrl+K on Windows/Linux).
- SearchField focused automatically.
- Typing filters results in real time.
- Results grouped by type (Conversations, Work, Knowledge).
- Arrow keys navigate, Enter selects, Esc closes.
- Results rendered as ThreadRow, BetCard-lite, KnowledgeRow.
- No results → "No matches. Try different query."
- Only composes existing Tier 1/2 + DaisyUI.

**Validation scenarios.**
- Given ⌘K pressed, when search modal opened, then SearchField focused.
- Given search typed, when results loaded, then grouped by type.

**Contracts / constraints.**
- No new components outside 19-component budget.
- Results use existing Tier 2 rows.

**Effort.** S (~2d)

---

### UI-50 — Polish

**Story.** As a user, I want smooth transitions, loading states, empty states, keyboard shortcuts, and accessibility features, so that the app feels polished and is usable without a mouse.

**Depends on.** UI-00 through UI-45.

**Acceptance criteria.**
- Page transitions smooth (fade, slide).
- Empty state placeholders for: no conversations, no bets, no knowledge.
- Loading spinner and error toasts.
- Keyboard shortcuts: Alt+1 (Conversations), Alt+2 (Work), Alt+3 (Knowledge), Alt+4 (Settings). Arrow keys in Rail/Submenu. Enter to expand, Esc to close modals.
- ARIA labels on all interactive elements.
- Color contrast WCAG AA minimum.
- Keyboard-only navigation works (no mouse).
- axe accessibility tests pass (Storybook).

**Validation scenarios.**
- Given page transition, when smooth animation plays, then no jarring jumps.
- Given empty conversations list, when rendered, then placeholder shown.
- Given Alt+1 pressed, then Conversations view opens.

**Contracts / constraints.**
- No custom CSS — Tailwind animations.
- axe integration in Storybook.

**Effort.** S (~2d)

---

## Track G: Facilitator Pipeline

### G1 — Facilitator Agent Infrastructure

**Story.** As the system, I want facilitator agents (Chief of Staff, Practice Facilitators, Product Managers) seeded into the database with their own soul prompts and facilitator-specific tools (route_item, score_attention, promote_knowledge, create_conflict_review), so that facilitation workflows can run autonomously.

**Depends on.** D4, B1.

**Acceptance criteria.**
- After seeding, database contains: 1 Chief of Staff, ≥1 Practice Facilitator, ≥1 Product Manager.
- Each has valid soul_prompt_path.
- Facilitator-specific tools compile and return correct types.
- route_item creates item assigned to correct view.
- promote_knowledge transitions item from CAPTURED to PROVISIONAL.
- Session can be provisioned for facilitator using standard D5 flow.

**Validation scenarios.**
- Given facilitator agent, when session provisioned, then tools available.
- Given promote_knowledge called, when item checked, then status = PROVISIONAL.

**Contracts / constraints.**
- Facilitator agent identities: Chief of Staff (factory-wide), Practice Facilitators (per community), Product Managers (per product).

**Effort.** S (~1d)

---

### G2 — Attention Scoring Engine

**Story.** As knowledge items accumulate, I want an attention scoring algorithm that factors novelty, impact, conflict, repetition, confidence, taste sensitivity, recency, and usage frequency, so that items crossing a threshold are surfaced to humans automatically.

**Depends on.** G1, B1.

**Acceptance criteria.**
- Item conflicting with existing scores higher than non-conflicting.
- Brand-voice item scores higher than technical detail.
- Recently reviewed item scores lower than never-reviewed.
- Threshold crossing (0.7) triggers item_created event.
- Scoring deterministic: same inputs → same output.
- 1000 items scored in <1 second.

**Validation scenarios.**
- Given item with conflict, when scored, then score > item without conflict.
- Given item score crosses 0.7, when event checked, then item_created fired.

**Contracts / constraints.**
- Scoring factors and weights configurable per deployment.
- Recomputed periodically (facilitator routines) or on-demand.

**Effort.** S (~1d)

---

### G3 — Knowledge Promotion Pipeline

**Story.** As the system, I want knowledge to flow through a promotion lifecycle (CAPTURED → PROVISIONAL → VALIDATED → ACTIVE → STALE → ARCHIVED) with automatic promotion on cross-product repetition and layer-precedence conflict detection, so that knowledge quality improves over time and stale items are archived.

**Depends on.** G2, B5.

**Acceptance criteria.**
- Facilitator promotion: CAPTURED → PROVISIONAL status updates.
- Auto-promotion: same finding in 5+ sessions → VALIDATED (no human needed).
- Contradiction check: proposed L3 contradicting L4 principle → flagged for human review (NOT auto-promoted).
- Stale detection: ACTIVE unused >90 days → STALE.
- Open conflict prevents promotion past PROVISIONAL.
- 3-turn practice meeting: turn 1 (proposals) → turn 2 (reactions) → turn 3 (synthesis) creates/updates items.

**Validation scenarios.**
- Given same finding in 5 sessions, when promotion checked, then status = VALIDATED.
- Given proposed practice contradicting L4 principle, when checked, then flagged for review (not promoted).

**Contracts / constraints.**
- Automatic promotion only on strong signal (5+ repetitions, no contradictions).
- Layer precedence: L4 > L3 > L2 > L1 (higher layers override lower).

**Effort.** M (~2d)

---

### G4 — Built-in Routines

**Story.** As the factory, I want five core routines (Cost Sentinel, Practice Meeting, Post-Bet Retro, Monthly Portfolio Retro, Knowledge Decay Check) seeded and running on schedule, so that facilitator work, learning, and monitoring happen automatically.

**Depends on.** G3, C5.

**Acceptance criteria.**
- Cost Sentinel: 15-min heartbeat, monitors burn rate, emits warnings/breaches.
- Practice Meeting: weekly, runs 3-turn conversation, produces reflection items.
- Post-Bet Retro: event-triggered on bet_shipped, compares hypothesis vs reality.
- Portfolio Retro: first Monday, monthly, cross-product patterns.
- Knowledge Decay: daily, finds items unused >90 days, transitions to STALE.
- All routines created during factory init with correct config.
- Can be manually triggered via API for testing.
- Disabling routine (active=false) prevents firing.

**Validation scenarios.**
- Given routine fire time reached, when scheduler checks, then routine fires.
- Given Cost Sentinel at warning threshold, when incremented, then warning event emitted.

**Contracts / constraints.**
- Routines seeded during factory initialization.
- E7 integration: Policy Engine respects autonomy levels for routine outputs.

**Effort.** M (~2d)

---

## Track H: Operations

### H1 — Git Export Routine

**Story.** As the knowledge system, I want human-readable knowledge items (L2 product docs, L4 factory docs) exported to a Git repository on schedule or after human edits, so that version history is preserved and documents are accessible outside the app.

**Depends on.** B1, G1.

**Acceptance criteria.**
- Human edit to L4 PRINCIPLES → Git export runs, commits new PRINCIPLES.md.
- Commit message includes which items changed.
- No commit if no changes since last export.
- Exported markdown matches item body exactly.
- Configurable: repo path, remote URL, branch.

**Validation scenarios.**
- Given PRINCIPLES item edited, when export runs, then commit created with message.
- Given no changes since last export, when export runs, then no commit created.

**Contracts / constraints.**
- Git operations: commit with message, push to remote.
- L2 exports: BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md per product.
- L4 exports: PRINCIPLES.md, FOCUS.md, PORTFOLIO.md, REFLECTIONS/ per factory.

**Effort.** S (~1d)

---

### H2 — Notification Adapter

**Story.** As the system, I want pluggable notification adapters (console for dev, ntfy.sh for self-hosted, SMTP for email fallback), so that blocking items and cost breaches reach humans via their preferred channel.

**Depends on.** E2, A3.

**Acceptance criteria.**
- Console adapter: blocking item logged to console.
- Ntfy adapter: push sent to ntfy.sh topic (integration test).
- SMTP adapter: email sent (integration test with MailHog).
- Silence mode: items queued during quiet hours, not pushed.
- Push policy: only blocking items + cost breaches (not low-risk).
- Daily digest: non-urgent items accumulated and sent.

**Validation scenarios.**
- Given blocking item, when ntfy adapter enabled, then push sent to topic.
- Given silence mode active during quiet hours, when item created, then item queued.

**Contracts / constraints.**
- Adapter interface: `send(recipient, notification)`.
- Configuration via factory_settings.

**Effort.** M (~2d)

---

### H3 — Observability Adapter

**Story.** As an operator, I want structured event logging with trace correlation (console or Langfuse), so that session execution, tool calls, cost, and state changes are observable for debugging and analysis.

**Depends on.** A3.

**Acceptance criteria.**
- Console adapter: structured JSON logs to stdout.
- Langfuse adapter: traces sent to Langfuse project (integration test).
- Trace correlation: all session events share same trace ID.
- Events logged: session start/end, tool calls, cost, state transitions, knowledge writes.
- Performance: 1000 events logged in <100ms (non-blocking).
- Adapter configurable via factory_settings.

**Validation scenarios.**
- Given session started, when logged, then trace ID in log.
- Given 1000 events, when logged, then <100ms elapsed.

**Contracts / constraints.**
- Event logging non-blocking (async or buffered).
- TraceID correlates all events within session.

**Effort.** S (~1d)

---

### H4 — Deployment Profiles + PostgreSQL Adapter

**Story.** As an operator, I want three deployment profiles (laptop, VPS, cloud) with corresponding database drivers (SQLite for laptop, Postgres optional for scale), workspace adapters (local, Docker, E2B), and a single-command setup, so that deployments are reproducible across contexts.

**Depends on.** A2, H1–H3.

**Acceptance criteria.**
- `bun run setup --profile laptop` creates SQLite DB, runs migrations, seeds, starts server.
- `bun run setup --profile vps` starts with Docker Compose (Postgres + server + web).
- All tests pass against PostgreSQL (full suite with Postgres driver).
- Switching SQLite → Postgres is a config change (no code changes).
- Postgres adapter uses connection pooling (10 connections default).
- Documentation exists for each profile's setup.

**Validation scenarios.**
- Given laptop profile, when setup runs, then SQLite database created and seeded.
- Given vps profile, when setup runs, then Docker Compose starts all services.

**Contracts / constraints.**
- Single schema definition (Drizzle) targets both SQLite and Postgres.
- Profile config in `.env` or CLI flag.
- Migrations work identically on both databases.

**Effort.** M (~2d)

---

## Previous Decisions Preserved

- Tailwind + DaisyUI + factory-dark theme
- TOON format for context packs (~40% token savings)
- Desktop-first UI (mobile deferred to v2); desktop = web app (Tauri optional later)
- 19-component budget (5 Tier 1, 6 Tier 2, 8 Tier 3)
- Rail as sole notification surface
- 10 verdict actions on review items
- 5 ArtifactView shapes
- 8-state task lifecycle
- D5 ↔ E2 sequencing (session_ended events trigger review item creation)
- B4 → E4 contract (workspace layout)
- A3 event ordering + C7 idempotency (cost cap warnings deduplicated by key)
- UI-31/UI-32 split (work/planning vs review)
- UI-42 Settings Panel (5 tabs, Profile/Products/Agents/Notifications/Appearance)
- UI-45 Global Search (⌘K, results grouped by type)
- E7 deferred UI (backend-only in v1)

---

## Critical Path Summary

**A1 → A2 → B1 → B2 → B4 → C3 → D5 → E6 → UI-00 → UI-10 → UI-20 → UI-30 → UI-31 → UI-32 → UI-40 → G1 → G2 → G3 → G4 → H4**

Approximately **32–36 story-weeks** (assuming M = 2d, S = 1d, L = 4d, adjusting for real parallelism and team coordination).

**First working system ("hello world"):** After D5, agents can be assigned work, materialize knowledge, and write back. This is the core loop.

**Human in the loop:** After UI-40, humans see and respond to agent work via Conversations and Review pages.

**Self-improving factory:** After G4, facilitators run automatically: practices accumulate, retros happen, knowledge curates.

---

*Companion to ARCHITECTURE.md (structure), REQUIREMENTS.md (what it must do), and design docs (why). This document is the bridge from design to implementation: each story is a unit an agent can decompose and execute.*

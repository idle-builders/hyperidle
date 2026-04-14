# Work Packages — HyperIdle Implementation

How to build HyperIdle, story by story. Every story is a logical unit with testable acceptance criteria. Each story's implementation follows the same discipline: set up the validation/test infrastructure first, implement the feature, then prove all acceptance criteria pass.

---

## Tech Stack Decision

**Backend: TypeScript on Bun** with Hono (HTTP + WebSocket), Drizzle ORM (SQLite + PostgreSQL dual support, type-safe schema), and BullMQ (Redis-backed job scheduling for production, in-memory fallback for laptop).

**Frontend: React + Vite + TypeScript** with Tailwind CSS + DaisyUI + custom `factory-dark` theme. Behavior gaps filled with `focus-trap-react` and `@floating-ui/react`.

**Database: Drizzle ORM schema** targeting both better-sqlite3 (laptop default) and postgres.js (scale option). Same schema definition, two drivers. Migrations as versioned SQL files.

**Monorepo: single repo** with `packages/db` (schema + migrations), `packages/server` (Hono API + workers), `packages/web` (React + Vite), `packages/fabric` (materialization + writeback + watcher), `packages/shared` (types, constants, TOON codec).

**Rationale:** TypeScript gives full-stack type safety (shared types between API and UI), Drizzle gives first-class SQLite + Postgres with zero runtime overhead, Bun gives fast startup and native file watching (`Bun.watch()`), and AI agents are most proficient in TypeScript — the codebase will be maintained by agents using HyperIdle itself.

---

## UI Stack & Component Budget

**Foundation:** Tailwind CSS + DaisyUI (for unstyled, accessible component primitives) + custom `factory-dark` theme (surface colors, accent colors, text hierarchy, radius overrides, font loading for Inter + Space Grotesk).

**Behavior gaps:** `focus-trap-react` (focus management in modals/drawers) + `@floating-ui/react` (positioning for tooltips, dropdowns, popovers).

**DaisyUI primitives used directly (no wrapping):** `btn`, `input`, `textarea`, `select`, `checkbox`, `radio`, `toggle`, `range`, `file-input`, `kbd`, `badge`, `tabs`, `menu`, `dropdown`, `modal`, `drawer`, `alert`, `toast`, `tooltip`, `skeleton`, `breadcrumbs`, `avatar`, `divider`, `collapse`, `loading`.

**Custom component budget:** **19 components total** across three tiers:
- **Tier 1 (5 Primitives):** StatusChip, Tag, KeyValue, NavItem, SearchField
- **Tier 2 (6 Blocks):** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow
- **Tier 3 (8 Regions):** IconRail, Submenu, Rail, ArtifactView (5 shapes: text_diff, content_preview, visual_comparison, action_summary, data_metrics), ReviewHeader, Canvas, Kanban, PitchSelector

These 19 are the **only custom UI components allowed.** Any new component outside this list requires updating UI_DESIGN.md first.

---

## Implementation Tracks

Eight parallel tracks. The dependency graph below shows what blocks what. Stories within a track are sequential; tracks run in parallel where dependencies allow.

```
Track A: Foundation          ──────────────────────────────────────────────►
Track B: Knowledge Fabric       ║══════════════════════════════════════════►
Track C: Process Primitives     ║══════════════════════════════════════════►
Track D: Agent Runtime              ║══════════════════════════════════════►
Track E: API Layer                  ║══════════════════════════════════════►
Track F: Human Interface (UI)           ║══════════════════════════════════►
Track G: Facilitator Pipeline               ║══════════════════════════════►
Track H: Operations                              ║═════════════════════════►

A1 ─► A2 ─► A3
      │      │
      ├──────┼─► B1 ─► B2 ─► B3 ─► B4 ─► B5 ─► B6
      │      │
      ├──────┼─► C1 ─► C2 ─► C3 ─► C4 ─► C5 ─► C6 ─► C7
      │      │
      │      ├─► E1 ─► E2 ─► E3 ─► E4 ─► E5 ─► E6
      │      │         │                         │
      │      │         │                         └─► UI-00 ─► UI-10 ─► UI-20 ─► UI-30 ─► UI-31 ─► UI-40 ─► UI-50
      │      │
      ├──────┼───────────────────────► D1 ─► D2 ─► D3 ─► D4 ─► D5
      │      │                                              │
      │      └──────────────────────────────────────────────┼─► G1 ─► G2 ─► G3 ─► G4
      │                                                     │
      └─────────────────────────────────────────────────────┴─► H1 ─► H2 ─► H3 ─► H4
```

**Parallel opportunities:**
- B (Knowledge Fabric) and C (Process Primitives) can run fully in parallel after A2.
- E (API Layer) can start after A3 and runs parallel to B and C.
- UI (UI-00..UI-50) can start after E6 is done (all API endpoints needed).
- D (Agent Runtime) needs B2 (materialization) and C3 (sessions), so starts later.
- G (Facilitator Pipeline) needs D4 (agent skills), B4 (writeback), and C5 (routines).
- H (Operations) can start once the core loop (D5) is working.

---

## Track A: Foundation

### A1 — Project Scaffolding

Set up the monorepo, toolchain, and test infrastructure that every subsequent story depends on.

**Scope:**
- Bun workspace monorepo with packages: `db`, `server`, `web`, `fabric`, `shared`
- TypeScript strict mode, shared `tsconfig.base.json`
- Vitest for unit + integration tests across all packages
- Drizzle ORM configured with better-sqlite3 driver (SQLite) + postgres.js driver (Postgres)
- Drizzle Kit for migration generation
- React + Vite app in `packages/web` with Tailwind CSS + DaisyUI installed and the `factory-dark` theme wired (see UI_DESIGN.md)
- Hono app in `packages/server` with health endpoint
- Biome for linting + formatting
- Single `bun dev` command starts server + web concurrently

**Acceptance Criteria:**
1. `bun install` completes with zero errors.
2. `bun test` runs Vitest across all packages with minimum coverage: at least 3 tests each in `packages/db`, `packages/server`, `packages/fabric` (critical paths), 1+ test per other package.
3. `bun dev` starts the Hono server on port 3001 and the Vite dev server on port 5173.
4. `GET /health` returns `{ status: "ok", timestamp: ... }`.
5. The React app renders a placeholder page at `localhost:5173`.
6. `packages/shared` exports a type that `packages/server` and `packages/web` both import — proving cross-package type sharing works.
7. Drizzle can connect to an in-memory SQLite database in a test and execute a trivial query.
8. Test infrastructure is explicitly owned: `createTestDb()` and `createTestApp()` utilities exported from test helper, coverage targets enforced (unit 80%, integration for critical paths).

**Test setup (built as part of this story):**
- Vitest config with workspace support
- Test utility: `createTestDb()` — returns a fresh in-memory SQLite connection with Drizzle
- Test utility: `createTestApp()` — returns a Hono app instance wired to the test DB

---

### A2 — Database Schema + Migrations

Define the complete Drizzle schema for all tables from the architecture. Generate and apply the initial migration.

**Scope:**
- All tables from ARCHITECTURE.md §2.1 defined as Drizzle schema in `packages/db/schema/`:
  - `bets`, `tasks`, `sessions`, `teams`, `routines`
  - `messages`, `threads`
  - `items`, `responses`
  - `agents`, `products`, `agent_skills`
  - `factory_settings`
  - `file_leases`
  - `knowledge_items` (with all indexes from KNOWLEDGE_ARCHITECTURE.md §3)
  - `knowledge_conflicts`
  - `knowledge_edit_log`
- All enum-like fields (status, state, layer, kind, etc.) defined as TypeScript union types in `packages/shared`
- Drizzle migration generated and committed
- Seed script for dev/test data (one factory, one product, two agents, one team, sample knowledge items across L1–L4)

**Acceptance Criteria:**
1. `bun run db:migrate` applies the migration to a fresh SQLite file with zero errors.
2. Every table can be inserted into and queried via Drizzle with full type safety — a test inserts one row per table and reads it back, asserting all fields.
3. All five indexes on `knowledge_items` exist (verified by `PRAGMA index_list`).
4. The seed script populates the database and a test verifies: ≥1 row in each of `agents`, `teams`, `products`, `knowledge_items`, `factory_settings`.
5. The same Drizzle schema connects to a PostgreSQL test database (via Docker) and all tables are created correctly — proving dual-driver support.
6. All shared types (e.g., `TaskState`, `KnowledgeLayer`, `ItemVerb`) are importable from `packages/shared` in both `packages/server` and `packages/db`.
7. Foreign key constraints hold: inserting a task with a non-existent `bet_id` fails.

**Test setup (built as part of this story):**
- `createSeededTestDb()` — returns a test DB with the seed data pre-loaded
- Docker Compose file for a PostgreSQL test instance
- CI-friendly test that runs the schema against both SQLite and Postgres

---

### A3 — Event Bus

In-process pub/sub for state-change events with per-stream ordering and at-least-once delivery semantics. Every subsequent component that reacts to state changes (dependency watcher, WebSocket push, cost sentinel, file watcher notifications) subscribes to this bus.

**Scope:**
- Typed event emitter in `packages/shared/events.ts`
- Event types defined: `task_state_changed`, `item_created`, `response_recorded`, `session_started`, `session_ended`, `routine_fired`, `cost_cap_warning`, `cost_cap_breached`, `bet_committed`, `bet_shipped`, `bet_revised`, `knowledge_item_updated`, `knowledge_conflict_created`, `handoff_initiated`
- Each event type has a typed payload interface
- Subscribe/unsubscribe/emit API
- Per-stream ordering: events for the same stream (e.g., task ID) are delivered in order
- At-least-once delivery: events are emitted synchronously after database writes are durable
- Optional: Redis pub/sub adapter for multi-process deployments (interface defined, implementation deferred)

**Acceptance Criteria:**
1. A test subscribes to `task_state_changed`, emits the event, and the subscriber receives the typed payload with correct fields.
2. Multiple subscribers to the same event all receive the emission.
3. Unsubscribing prevents further delivery.
4. Type errors: emitting `task_state_changed` with a malformed payload fails at compile time (not runtime).
5. The event bus can handle 1000 emissions/sec without dropping events (throughput test).
6. A wildcard subscription (`bus.on('*', ...)`) receives all events (for audit logging).
7. Per-stream ordering: emit 5 events for the same task (state_changed events) → all 5 arrive in order at subscribers.
8. At-least-once delivery: events are emitted only after the triggering database write is committed.

---

## Track B: Knowledge Fabric

### B1 — Knowledge Items CRUD + Search

The canonical store API. All knowledge reads and writes go through this module.

**Scope:**
- `packages/fabric/knowledge-store.ts`: CRUD operations on `knowledge_items`
  - `create(item)` → inserts with version=1, returns full row
  - `read(id)` → returns row or null
  - `update(id, changes, expectedVersion)` → optimistic update, bumps version, returns new row. Throws `VersionConflictError` if version mismatch.
  - `list(filters)` → filter by layer, scope_id, kind, topic, status; paginated
  - `search(query)` → FTS5 full-text search across title + body
  - `archive(id)` → sets status to 'archived'
- FTS5 virtual table created alongside `knowledge_items`
- `knowledge_edit_log` entries created automatically on every `update()` call
- Emits `knowledge_item_updated` event on every write

**Acceptance Criteria:**
1. Create a knowledge item, read it back — all fields match.
2. Update with correct version succeeds; version is incremented.
3. Update with stale version throws `VersionConflictError` with current version in the error.
4. `list({ layer: 'L3', scope_id: 'building' })` returns only matching items.
5. FTS5 search: insert 10 items with varied content, search for a keyword — returns only matching items with relevance ranking.
6. Every `update()` call creates a row in `knowledge_edit_log` with correct old/new values.
7. `knowledge_item_updated` event fires on create, update, and archive — a test subscriber verifies.
8. Pagination: list with `limit: 5, offset: 0` returns first 5; `offset: 5` returns next batch.

---

### B2 — Materialization Engine

Given a session context, produce a workspace directory with the three-zone layout.

**Scope:**
- `packages/fabric/materialize.ts`:
  - `materialize({ sessionId, taskId, agentId, productId, role })` → creates workspace directory
  - Queries `knowledge_items` for the relevant slice (L4 factory, L2 product, L3 practices filtered by role/task relevance, L1 task state)
  - Writes files to `context/`, `work/`, `knowledge/` zones
  - Generates `.fabric/manifest.json` with version tracking per item
  - Format selection: TOON for practices in `context/`, markdown for product docs, markdown for editable copies in `knowledge/`
- Workspace layout matches KNOWLEDGE_ARCHITECTURE.md §4.2 exactly

**Acceptance Criteria:**
1. Materialize a session for a Builder agent on product P: workspace contains `context/factory/PRINCIPLES.md`, `context/product/BRIEF.md`, `context/practices/*.toon` (only building-relevant practices), `work/` (empty), `knowledge/practices/` (editable markdown copies).
2. `.fabric/manifest.json` exists and contains version numbers for every materialized item.
3. `context/` files are read-only (file permissions `0444`).
4. `knowledge/` files are read-write.
5. A practice at L3 with `scope_id: 'growth'` is NOT materialized for a Builder agent — role filtering works.
6. Materialization of 200 knowledge items completes in <10 seconds (performance requirement NF-1.3).
7. Re-materializing the same session overwrites the workspace cleanly.
8. The `session.toon` context pack in `context/` contains task state, bet context, and handoff history.

**Design decisions to make in this story:**
- Define the exact file naming convention (e.g., `{kind}-{slug}.md` or `{id}.md`)
- Define the `session.toon` pack structure

---

### B3 — TOON Codec

Encode and decode the TOON format for context packs.

**Scope:**
- `packages/shared/toon.ts`:
  - `encode(data: Record<string, unknown>)` → TOON string
  - `decode(toon: string)` → Record<string, unknown>
  - Follows the spec at github.com/toon-format/toon
- Used by materialization (B2) and session context pack building

**Acceptance Criteria:**
1. Round-trip: `decode(encode(obj))` produces an identical object for 10 varied test cases.
2. A TOON-encoded practice is ≥30% smaller than the equivalent JSON encoding (token count, measured by splitting on whitespace).
3. Encoding a complex nested object (3 levels deep, arrays, nulls) works correctly.
4. Decoding malformed TOON throws a descriptive `ToonParseError`.
5. Encoding/decoding 1000 items takes <100ms.

---

### B4 — File Watcher + Continuous Writeback + Workspace Layout

The core sync loop: watch `knowledge/` and `work/` directories, write changes back to SQLite incrementally. Also defines the workspace folder structure.

**Scope:**
- Workspace layout (files written by agents):
  - `context/` (read-only): factory principles, product brief, materialized practices, session context pack
  - `knowledge/` (read-write): editable copies of knowledge items, indexed by `{kind}-{slug}.md` naming convention
  - `work/` (read-write): task notes, session notes, artifacts
  - `.fabric/manifest.json`: version tracking per materialized item
- `packages/fabric/watcher.ts`:
  - `startWatcher(sessionId, workspacePath)` → starts file watcher
  - `stopWatcher(sessionId)` → stops watcher, runs final pass
  - Uses `Bun.watch()` with 500ms debounce, last-writer-wins for concurrent edits
  - On file change in `knowledge/`:
    - Modified files: diff against manifest version, update `knowledge_items`, bump version, update manifest
    - New files: create new `knowledge_items` rows (status: CAPTURED)
    - Deleted files: flag for facilitator review (create item)
  - On file change in `work/`:
    - Link artifacts to task record
    - Update session notes
  - Emits `knowledge_item_updated` event per writeback
  - Polling fallback (2s interval) when native watch isn't available
- `packages/fabric/writeback.ts`:
  - `writebackFile(sessionId, filePath, manifest)` → processes a single file change
  - `finalPass(sessionId, workspacePath)` → scans all files, catches any remaining changes
  - Version conflict handling: detect from manifest, create `knowledge_conflicts` row
  - Last-writer-wins: when both agent and human edit same field within 500ms, human write wins
- **E4 contract:** B4 completion unblocks E4. E4 uses the file naming convention to serve workspace files via API.

**Acceptance Criteria:**
1. Start watcher on a workspace. Write a new file to `knowledge/practices/new-practice.md`. Within 2 seconds, a new row exists in `knowledge_items` with status CAPTURED.
2. Modify an existing file in `knowledge/`. Within 2 seconds, the corresponding `knowledge_items` row is updated and version is incremented.
3. Delete a file in `knowledge/`. An `item_created` event fires for facilitator review — the knowledge item is NOT auto-deleted.
4. Rapid burst: write 10 files within 200ms. The debounce collapses them into fewer writeback operations (verify by counting `knowledge_item_updated` events — should be ≤10, not 0).
5. Version conflict: externally update a `knowledge_items` row (simulating a human edit), then modify the same file. A `knowledge_conflicts` row is created.
6. `stopWatcher()` runs a final pass and returns. After stopping, file changes are not written back.
7. Manifest is updated after each successful writeback — re-reading it shows new version numbers.
8. `work/session-notes.md` changes are reflected in the session's `notes` field in the `sessions` table.
9. Polling fallback: disable native watcher, verify polling detects file changes within 3 seconds.
10. Last-writer-wins conflict strategy: agent writes file at T=0, human PATCHes same field at T=250ms (within 500ms window) → human's change wins; conflict flag set for facilitator awareness.

---

### B5 — Conflict Resolution

Per-field LWW merge for structured items, facilitator routing for prose conflicts.

**Scope:**
- `packages/fabric/conflict.ts`:
  - `resolveConflict(itemId, proposedChanges, proposedBy)` → attempts merge
  - For structured items (practices, decisions, failures): per-field last-writer-wins
  - For prose items (briefs, principles, reflections): create conflict record, route to facilitator
  - Conflict record creation in `knowledge_conflicts` table
- Integration with writeback (B4): when writeback detects version mismatch, calls conflict resolution

**Acceptance Criteria:**
1. Two concurrent edits to different fields of a structured practice: both edits apply, no conflict record created.
2. Two concurrent edits to the same field of a structured practice: last writer wins for that field, a conflict record is created for facilitator review.
3. Two concurrent edits to a prose item (brief): both versions stored, conflict record created with status 'open', earlier version remains active.
4. Conflict record contains: `version_base`, `version_current`, `proposed_body`, `proposed_by`.
5. An open conflict on an item prevents it from being promoted to VALIDATED status (verified by attempting status update and getting rejection).
6. Resolving a conflict (setting status to 'resolved') allows the item to be promoted.

---

### B6 — Materialization Budget + Relevance Scoring

The intelligence layer that decides what gets loaded into a session.

**Scope:**
- `packages/fabric/relevance.ts`:
  - `scoreRelevance(item, taskContext)` → 0.0–1.0 score
  - Factors: task tag match, role match, recency, confidence, usage frequency, layer proximity
  - Weights configurable per deployment
- `packages/fabric/budget.ts`:
  - `applyBudget(items, contextWindowSize)` → filtered items list within token budget
  - Budget allocation: 40% task execution, 30% L0 session pack, 20% L2+L3 knowledge, 10% L4 factory
  - Token counting via whitespace-split approximation (good enough for budgeting)
- Integration with materialization (B2): relevance scoring filters which items get materialized

**Acceptance Criteria:**
1. A practice tagged "file-handling" scores higher than one tagged "email-marketing" when the task is about file uploads.
2. A recently updated practice scores higher than a stale one (same relevance otherwise).
3. Budget enforcement: given 200 items but a 40K token budget for knowledge, only the top-scoring items that fit within budget are returned.
4. L4 factory items are always included regardless of relevance score (they're non-negotiable context).
5. With a 200K token context window, the materialization budget allocates ~40K tokens for knowledge — verify the math.
6. The scoring weights can be overridden via `factory_settings` without code changes.

---

## Track C: Process Primitives

### C1 — Task State Machine + Dependency Watcher

The core task lifecycle from PROCESS_LAYER.md §6.1. Eight-state lifecycle with automatic dependency-driven transitions.

**Scope:**
- `packages/server/domain/tasks.ts`:
  - `createTask(data)` → creates task in `proposed` state
  - `transitionTask(id, toState, metadata)` → validates transition, updates state, emits event
  - Valid transitions for 8-state machine: proposed→accepted, proposed→killed, accepted→hold, accepted→in_progress, hold→accepted (auto, via dependency watcher), in_progress→blocked, in_progress→review, in_progress→done, blocked→in_progress, review→done, review→in_progress, on_hold→accepted (auto), *→killed
  - Invalid transitions throw `InvalidTransitionError`
- `packages/server/workers/dependency-watcher.ts`:
  - Subscribes to `task_state_changed` events
  - When a task moves to `done`: find all tasks with this task in their `dependencies` list. For each, check if ALL dependencies are now `done`. If yes, **transition from `on_hold` → `accepted` automatically and notify owner** (this is the Dependency Watcher).
  - When a task enters `on_hold` state, it waits for all blocking dependencies to reach `done` before auto-transitioning to `accepted`.

**Acceptance Criteria:**
1. Create a task → state is `proposed`. Transition to `accepted` → state is `accepted`. Transition to `in_progress` → state is `in_progress`. Each transition emits `task_state_changed`.
2. Invalid transition `proposed → in_progress` throws `InvalidTransitionError`.
3. Dependency watcher: create tasks A and B. B depends on A. B is in `on_hold`. Complete A → B automatically transitions to `accepted`.
4. Complex dependency: C depends on both A and B. Complete A → C stays in `on_hold`. Complete B → C transitions to `accepted`.
5. Every transition is logged in an audit trail (a `task_transitions` log or event stream).
6. Transitioning to `killed` works from any state.
7. The `on_hold` → `accepted` auto-transition emits a notification event (for the owner's inbox).
8. Verify 8-state lifecycle: proposed, accepted, planned, blocked, in_progress, on_hold, done, cancelled. Dependency Watcher handles on_hold → accepted transitions only when all dependencies are done.

---

### C2 — Bet State Machine + Revision Logging

**Scope:**
- `packages/server/domain/bets.ts`:
  - `createBet(data)` → creates bet in `shaped` state with required fields: product, team, pitch, appetite, done_condition, hypothesis
  - `transitionBet(id, toState, reason)` → validates transition, logs revision
  - Valid transitions: shaped→committed, shaped→killed, committed→in_progress, in_progress→shipped, in_progress→killed, committed→shaped (reshaping)
  - A bet cannot enter `committed` if the team's committed bets ≥ capacity limit
  - Every state change appends to `revision_log` JSON array
- Revision logging: changes to `done_condition`, `hypothesis`, or `appetite` are first-class events, each creating a review thread item

**Acceptance Criteria:**
1. Create a bet → state is `shaped`. Commit it → state is `committed`, `revision_log` contains the commit entry with timestamp and reason.
2. Attempting to commit when team capacity is full throws `CapacityExceededError`.
3. Changing `done_condition` on an in_progress bet: revision_log entry added, `item_created` event fires (for review thread).
4. Shipping a bet triggers `bet_shipped` event.
5. Killing a bet requires a reason — calling without reason throws validation error.
6. Reshaping: committed→shaped transition works with reason logged.
7. Revision log is a JSON array in the `revision_log` column — each entry has `{ timestamp, field, old_value, new_value, reason }`.

---

### C3 — Session Lifecycle

**Scope:**
- `packages/server/domain/sessions.ts`:
  - `createSession(taskId, agentId, modelTier)` → creates session in `active` state, calls materialization (B2), starts watcher (B4)
  - `endSession(sessionId, outcome)` → stops watcher (final pass), records outcome and cost, transitions to `done`
  - `crashSession(sessionId)` → stops watcher (final pass), records as `crashed`, ensures notes are preserved
  - States: active → paused → done | crashed
  - Cost tracking: accumulates cost from harness adapter callbacks
- Integration with Knowledge Fabric: session creation triggers materialization, session end triggers watcher stop + final pass

**Acceptance Criteria:**
1. Create a session → state is `active`, workspace directory exists with materialized files, file watcher is running.
2. End session → state is `done`, watcher stopped, final pass completed, `session_ended` event fires.
3. Crash session → state is `crashed`, watcher stopped, final pass completed, any knowledge written during session is preserved in SQLite.
4. Session cost is recorded: set a mock cost of $0.15 during session, verify it's stored on session end.
5. Creating a session when the agent's `max_concurrent_sessions` is reached throws `ConcurrencyLimitError`.
6. The session's `workspace_snapshot` field contains the path to the workspace.
7. After session end, the workspace directory is cleaned up (deleted).

---

### C4 — Team Management

**Scope:**
- `packages/server/domain/teams.ts`:
  - `createTeam(productId, members, leadAgentId, capacity)` → creates team
  - `addMember(teamId, agentId)` / `removeMember(teamId, agentId)`
  - `updateCapacity(teamId, newCapacity)`
  - `dissolveTeam(teamId)` → archives team, unlinks agents
  - Capacity enforcement: `getAvailableCapacity(teamId)` returns remaining bet slots
  - Cost cap tracking: `getTeamCost(teamId)` aggregates session costs for current cycle

**Acceptance Criteria:**
1. Create a team with 3 agents → team exists, all agents have `team_id` set.
2. Adding a member updates their `team_id`.
3. Removing a member with active routines throws `ActiveRoutinesError` (routines must be reassigned first).
4. `getAvailableCapacity` returns `capacity - active_bets_count`.
5. Dissolving a team sets `dissolved_at`, unlinks all agents (sets `team_id` to null).
6. Team cost is the sum of all session costs for agents on the team within the current cost cycle.
7. Attempting to commit a bet when available capacity is 0 is rejected.

---

### C5 — Routine Scheduler

**Scope:**
- `packages/server/workers/scheduler.ts`:
  - Polls `routines` table for due triggers every 30 seconds
  - Trigger types: `calendar` (cron expression), `event` (fires on specific event bus event), `heartbeat` (every N minutes/hours), `inbox` (fires when agent inbox has unread messages), `continuous` (re-fires after each session completes)
  - When a routine fires: create a session via C3, using the routine's `skill_id` and `owner_agent_id`
  - Delegation: if owner is at WIP limit and `delegation_allowed`, find teammate with matching skill
  - Updates `last_run_at` and `next_run_at` on fire
  - Respects cost caps: does not fire if agent/team/factory cap is reached
- Subscribes to event bus for event-triggered routines

**Acceptance Criteria:**
1. A heartbeat routine with interval 60s fires within 60–90 seconds of its last run.
2. A calendar routine with cron `0 9 * * MON` fires at the correct time (test with mocked clock).
3. An event-triggered routine fires when its configured event is emitted.
4. Delegation: routine owner at WIP limit, `delegation_allowed: true`, teammate with matching skill exists → session created for teammate.
5. Cost cap: factory cost cap reached → routine does NOT fire, `next_run_at` is set to next cycle.
6. Silent routines (silent=true): session is created but no item is produced (verified by checking `items` table).
7. `last_run_at` and `next_run_at` are updated after each fire.
8. Human review routines (human_review=true): session output produces a review item in Conversations.

---

### C6 — Handoff Protocol

The A2A-inspired structured handoff from PROCESS_LAYER.md §8.

**Scope:**
- `packages/server/domain/handoffs.ts`:
  - `initiateHandoff(handoff: HandoffMessage)` → validates, updates task owner, creates thread message, ends current session, notifies new owner
  - `HandoffMessage` type: `{ contextId, fromAgent, toAgent, taskId, reason, status, message, artifacts, remainingWork }`
  - `reason` enum: `phase_complete`, `skill_needed`, `blocked`, `escalation`
  - `status` enum: `working`, `completed`, `failed`, `canceled`
  - `toAgent` can be an agent ID or a role string — if role, resolve to best available agent via team + skill lookup
- Thread message created with structured handoff metadata (not just prose)
- Previous session ended, new session creation triggered for the receiving agent

**Acceptance Criteria:**
1. Agent A hands off to Agent B with status `working`: A's session ends, B is set as task owner, B receives a thread message with handoff metadata, B's inbox gets a notification.
2. Handoff by role: `toAgent: 'builder'` resolves to an available Builder on the team. If no Builder available, creates an escalation item.
3. Handoff to human: `toAgent: 'human'` → task moves to `blocked`, review item created in Conversations.
4. The handoff thread message contains structured JSON metadata (context_id, status, reason, artifacts list, remaining_work) — not just a prose string.
5. Handoff with status `failed` includes error information in the message.
6. The audit trail on the task shows the full handoff history.

---

### C7 — Cost Cap Enforcement

**Scope:**
- `packages/server/domain/costs.ts`:
  - `checkCostCap(agentId)` → returns `{ allowed: bool, remaining: number, level: 'agent'|'team'|'factory' }`
  - `recordCost(sessionId, amount)` → increments `cost_actual` on agent, team, and factory
  - `resetCosts(level, cycle)` → resets `cost_actual` for the given level at cycle boundary
- `packages/server/workers/cost-sentinel.ts`:
  - Heartbeat routine: checks burn rate at all three levels
  - Emits `cost_cap_warning` at 80% of cap
  - Emits `cost_cap_breached` when cap is hit
  - On breach: pauses non-essential routines, blocks new session creation at that level
- Integration with session creation (C3): check cost cap before starting a session
- Integration with scheduler (C5): skip routines when cap is breached

**Acceptance Criteria:**
1. Agent cost cap of $10: after $10 in session costs, `checkCostCap(agentId)` returns `{ allowed: false, level: 'agent' }`.
2. Team cost cap of $50: even if agent has budget, if team total reaches $50, `checkCostCap` returns `{ allowed: false, level: 'team' }`.
3. Factory cost cap of $200: overrides all. When reached, no agent can start new sessions.
4. Cost cap breach emits `cost_cap_breached` event with level and current spend.
5. Warning at 80%: factory cap of $200, current spend $160 → `cost_cap_warning` event fires.
6. Cost reset: after resetting factory costs, agents can start sessions again.
7. In-progress sessions are NOT killed when cap is reached — they finish naturally.
8. A review thread item is created when any cap is breached.
9. Idempotency: duplicate `cost_cap_warning` events with the same session ID are idempotent — warning is not re-created if already present. Event consumers use idempotency keys (session_id + event_type) to deduplicate.

---

## Track D: Agent Runtime

### D1 — Harness Adapter Interface

The abstraction layer between HyperIdle and any agent harness.

**Scope:**
- `packages/server/adapters/harness.ts`:
  - Interface `HarnessAdapter`:
    - `startSession(config: SessionConfig)` → starts the agent, returns a session handle
    - `streamEvents(sessionId)` → async iterable of session events (token usage, tool calls, completions)
    - `stopSession(sessionId)` → gracefully stops the agent
    - `getCapabilities()` → returns what the harness supports (pre-compaction trigger, sub-agents, etc.)
  - `SessionConfig`: agent identity (soul prompt path), workspace path, model tier, credential map, available tools
  - Event types: `token_usage`, `tool_call`, `completion`, `error`, `cost_update`, `pre_compaction`
- No concrete implementation yet — this is the interface + mock adapter for testing

**Acceptance Criteria:**
1. The `HarnessAdapter` interface compiles with full type safety.
2. A `MockHarnessAdapter` implements the interface: `startSession` returns a handle, `streamEvents` yields 3 mock events, `stopSession` completes.
3. A test uses the mock adapter to create a session, stream events, and stop — all events received in order.
4. `SessionConfig` includes all required fields: workspace path, soul prompt path, model tier, tools list.
5. The mock adapter's `getCapabilities()` returns `{ preCompactionTrigger: true, subAgents: true }`.
6. The interface is generic enough that future adapters (Claude, Goose, OpenHands) can implement it without changes to the interface.

---

### D2 — Claude Agent SDK Adapter

Concrete adapter for the Claude Agent SDK.

**Scope:**
- `packages/server/adapters/claude.ts`:
  - Implements `HarnessAdapter` for Claude Agent SDK
  - `startSession` → spawns a Claude Agent SDK process with the configured model, tools, and workspace
  - `streamEvents` → parses Claude's output stream for token counts, tool calls, and completions
  - `stopSession` → sends termination signal to the Claude process
  - Pre-compaction trigger: monitors token count and fires `pre_compaction` event when approaching context limit
  - Model tier mapping: Reasoning → claude-opus, Workhorse → claude-sonnet, Fast → claude-haiku
  - Credential injection: environment variables passed to the agent process

**Acceptance Criteria:**
1. Integration test (requires Claude API key): start a session with a trivial task prompt, receive at least one `completion` event, stop the session cleanly.
2. Token counting: after a session, the total token count from `token_usage` events matches the actual usage reported by the API.
3. Model tier mapping: Reasoning tier creates a session with the opus model.
4. Pre-compaction trigger: simulate approaching context limit → `pre_compaction` event fires.
5. The adapter can be instantiated without a Claude API key (for testing) — it throws `MissingCredentialError` on `startSession` instead of on construction.
6. Cost tracking: `cost_update` events report dollar costs accurately (within 10% of the API's reported cost).

---

### D3 — Workspace Adapter + Docker Implementation

Sandboxed execution environments for agent sessions.

**Scope:**
- `packages/server/adapters/workspace.ts`:
  - Interface `WorkspaceAdapter`:
    - `spawn(config)` → creates an isolated workspace environment, returns workspace path
    - `exec(workspaceId, command)` → run a command inside the workspace
    - `destroy(workspaceId)` → tear down the workspace
  - `LocalWorkspaceAdapter`: creates workspaces as directories on the local filesystem (laptop profile)
  - `DockerWorkspaceAdapter`: creates Docker containers with volume mounts (gVisor optional)
- The workspace path is what gets passed to the materialization engine (B2) and the harness adapter (D1)

**Acceptance Criteria:**
1. Local adapter: `spawn()` creates a directory with correct permissions. `exec('ls')` lists the directory. `destroy()` removes it.
2. Docker adapter: `spawn()` creates a running container. `exec('echo hello')` returns "hello". `destroy()` stops and removes the container.
3. The materialized workspace (from B2) is accessible inside the Docker container at the expected path.
4. File changes inside the Docker container's workspace are visible to the host-side file watcher (B4).
5. The workspace is isolated: the agent cannot access files outside its workspace directory.
6. Spawning 5 concurrent workspaces works without conflict.

---

### D4 — Agent Skill Tools

The tools that agents call during sessions to interact with HyperIdle.

**Scope:**
- `packages/server/tools/`:
  - `read_inbox.ts` → reads agent's unread messages
  - `send_message.ts` → sends a message to another agent or thread
  - `log_task.ts` → appends notes to the current task
  - `query_practice.ts` → searches L3 knowledge via FTS5
  - `write_memory.ts` → writes to knowledge_items (any layer the agent has access to)
  - `handoff_to.ts` → initiates handoff (calls C6)
  - `create_item.ts` → surfaces something to humans via the Item data model
  - `write_session_notes.ts` → writes/updates session notes in `work/session-notes.md`
- Each tool is a function with typed input/output that can be registered with any harness adapter
- Tool definitions follow the Claude tool_use schema (name, description, input_schema)

**Acceptance Criteria:**
1. `read_inbox`: agent has 3 unread messages → tool returns all 3 with correct fields.
2. `send_message`: sends a message to agent B → message appears in B's inbox and on the thread.
3. `log_task`: appends "Discovered X" to task notes → task's `notes` field contains the text.
4. `query_practice`: searches for "file handling" → returns matching L3 practices.
5. `handoff_to`: initiates handoff to agent B → task owner changes, session ends (via C6).
6. `create_item`: creates a review item with risk_tier "high" → item routes to Conversations.
7. Each tool has a valid Claude tool_use JSON schema definition.
8. Calling a tool with invalid input returns a structured error (not a crash).

---

### D5 — Session Provisioning (End-to-End)

The full loop: receive a task assignment, provision a session, run the agent, write back knowledge, emit session end hook to E2.

**Scope:**
- `packages/server/domain/session-provisioner.ts`:
  - `provisionSession(taskId, agentId)`:
    1. Check cost caps (C7)
    2. Spawn workspace (D3)
    3. Materialize knowledge into workspace (B2)
    4. Start file watcher (B4)
    5. Configure tools (D4) with session context
    6. Start agent via harness adapter (D1/D2)
    7. Stream events, track cost, aggregate cost from sub-agent runs
    8. On session end: stop watcher (final pass), record outcome, clean up workspace, emit `session_ended` event with final cost_delta
  - Handles crashes: if agent process dies, run crash recovery (stop watcher with final pass, mark session as crashed)
  - Sub-agent cost aggregation: tracks cost from all sub-agent spawns and rolls up to parent session
- This is the integration point — it wires together everything from tracks B, C, and D
- **Dependency contract with E2:** D5 emits `session_ended` event; E2 (review queue) subscribes to route created items into Conversations

**Acceptance Criteria:**
1. End-to-end (with mock adapter): provision a session → workspace is created with materialized files → watcher is running → mock agent writes a file to `knowledge/` → file is written back to SQLite → session ends → workspace cleaned up.
2. With Claude adapter (integration test): provision a real session with a trivial task → agent runs, produces output, session completes.
3. Crash recovery: kill the mock agent process mid-session → session marked as `crashed`, knowledge written before the crash is preserved in SQLite.
4. Cost cap rejection: set agent cost cap to $0 → provisioning fails with `CostCapExceededError`.
5. Concurrent sessions: provision 3 sessions for the same agent (if WIP limit allows) → all run independently.
6. The task's state moves to `in_progress` when the session starts.
7. Sub-agent cost aggregation: provision a session where the agent spawns 2 sub-agents. Verify session cost = cost(main) + cost(sub1) + cost(sub2).
8. `session_ended` event fires with `{ sessionId, cost_delta, outcome, taskId }`. E2 subscribes to create review items for high-value session ends.

---

## Track E: API Layer

### E1 — API Scaffold + Auth

**Scope:**
- `packages/server/api/`:
  - Hono app with route groups: `/api/conversations`, `/api/rail`, `/api/work`, `/api/knowledge`, `/api/tasks`, `/api/sessions`, `/api/agents`, `/api/items`
  - Auth middleware: API key validation (keys stored in `factory_settings`)
  - Error handling middleware: all errors return consistent `{ error: string, code: string, details?: object }` shape
  - Request validation middleware: Zod schemas for all request bodies, auto-generated from Drizzle types where possible
  - CORS configuration for the Vite dev server
  - WebSocket upgrade support on Hono

**Acceptance Criteria:**
1. `GET /api/health` returns 200 with status.
2. A request without API key to any `/api/*` endpoint returns 401.
3. A request with valid API key passes auth.
4. A request with invalid JSON body returns 400 with validation errors.
5. An unhandled error in a route handler returns 500 with consistent error shape (not a stack trace).
6. WebSocket upgrade works on `/api/ws`.
7. CORS allows requests from `localhost:5173`.

---

### E2 — Conversations + Items + Responses Endpoints

Review queue and verdict flow. E2 receives review items from agents (via D5 session end hook) and routes them to the right founder.

**Scope:**
- `GET /api/conversations` → list threads with latest item, paginated, sorted by recency or attention_score
- `GET /api/conversations/:threadId` → thread with all items and responses
- `POST /api/items` → create an item (used by agents via tools, and by facilitators)
- `POST /api/responses` → record a human response to an item (the 10 verdict actions: approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate)
- `GET /api/items/:id` → single item with responses and verdict history
- WebSocket: `/api/ws/conversations` → push new items and responses in real time
- Item routing: on item creation, apply routing rules from HUMAN_INTERFACE_LAYER.md §7 to determine which view it targets
- Founder responsibility routing: domain-based routing to CEO vs CPO (Market/Growth → CEO; Product/Design/Tech → CPO; Strategic → Both) per AGENT_LAYER.md §7
- **Integration with D5:** E2 subscribes to `session_ended` events from D5 and creates review items for high-value session completions

**Acceptance Criteria:**
1. Create an item with `kind: 'review'`, `risk_tier: 'high'` → it appears in the conversation list.
2. Respond to the item with `decision: 'approve'` → response recorded, `response_recorded` event fires.
3. Conversation list returns threads sorted by most recent item.
4. Filtering: `GET /api/conversations?kind=review&blocking=true` returns only blocking review threads.
5. WebSocket: connect to `/api/ws/conversations`, create an item → the item appears on the WebSocket stream within 1 second.
6. Pagination: 50 threads, request page 1 (limit 20) and page 2 → correct threads returned.
7. Item routing: `risk_tier: 'low'` item routes to Rail, not Conversations.
8. Founder routing: a Market-domain item routes to the CEO founder. A Product-domain item routes to the CPO founder. A Strategic item routes to both.

---

### E3 — Work Endpoints (Bets + Tasks)

**Scope:**
- `GET /api/bets` → list bets grouped by status (shaped, committed, in_progress, shipped)
- `GET /api/bets/:id` → bet detail with tasks
- `POST /api/bets` → create a shaped bet
- `PATCH /api/bets/:id` → update bet fields (triggers revision logging from C2)
- `POST /api/bets/:id/commit` → transition shaped→committed (checks capacity)
- `POST /api/bets/:id/ship` → transition in_progress→shipped
- `POST /api/bets/:id/kill` → kill a bet with reason
- `GET /api/tasks` → list tasks, filterable by bet_id, state, owner
- `PATCH /api/tasks/:id` → update task fields
- `POST /api/tasks/:id/transition` → state transition (validates via C1)
- `GET /api/bets/canvas` → the data for the **Canvas** region: shaped bets and committed bets with capacity info

**Acceptance Criteria:**
1. Create a bet → it appears in `GET /api/bets` under the "shaped" group.
2. Commit a bet → it moves to "committed". Committing when at capacity returns 409.
3. `GET /api/bets/canvas` returns `{ shaped: [...], committed: [...], capacity: { used: N, max: M } }`.
4. Task transition: `POST /api/tasks/:id/transition { state: 'in_progress' }` succeeds when valid, returns 400 when invalid.
5. `GET /api/tasks?state=blocked` returns only blocked tasks.
6. Shipping a bet triggers `bet_shipped` event — verified by a test subscriber.
7. Killing a bet without a `reason` in the body returns 400.
8. Concurrent commit at capacity: team capacity is 5 bets. Two concurrent `POST /api/bets/{id1}/commit` and `POST /api/bets/{id2}/commit` both at team capacity → first succeeds, second rejected with 409 and typed error `CapacityExceededError`. No race condition, strong consistency.

---

### E4 — Knowledge Endpoints

**Scope:**
- `GET /api/knowledge/:layer` → list knowledge items by layer (L2, L3, L4), with nested grouping by `topic` then `kind`
- `GET /api/knowledge/:layer/:id` → single knowledge item
- `POST /api/knowledge/:layer` → create a knowledge item (with version=1)
- `PATCH /api/knowledge/:layer/:id` → update a knowledge item (with optimistic locking via version)
- `POST /api/knowledge/:layer/:id/merge` → merge two items into one
- `POST /api/knowledge/:layer/:id/split` → split an item into two
- `POST /api/knowledge/:layer/:id/archive` → archive an item
- `POST /api/knowledge/:layer/:id/flag` → flag for facilitator review
- `GET /api/knowledge/search?q=...` → FTS5 search across all knowledge
- WebSocket: `/api/ws/knowledge` → push updates when file watcher writes back agent changes

**Acceptance Criteria:**
1. `GET /api/knowledge/practice` returns all L3 knowledge items grouped by community (building, growth, etc.).
2. Update with correct version → succeeds, version bumped. Update with stale version → 409 Conflict with current version in response.
3. Merge: item A and item B → merged item with combined body, both original IDs redirect to merged.
4. Search: `GET /api/knowledge/search?q=file%20handling` returns matching items ranked by relevance.
5. WebSocket: agent writes a practice file → writeback fires → WebSocket push delivers the update to connected clients within 2 seconds.
6. Archive: item status changes to 'archived', item no longer appears in default list (but still accessible via explicit filter).
7. Edit log: every PATCH creates a `knowledge_edit_log` entry.
8. WebSocket push contract: `/api/ws/knowledge` delivers updates in the same shape as `PATCH /api/knowledge/:layer/:id` response, with an `_event: 'update'` field. Client re-fetches affected item if conflict detected.

---

### E5 — Rail Endpoint + WebSocket

**Scope:**
- `GET /api/rail` → current Rail state: active bets with status, blockers, awaiting-ordering items, cost burn rate
- WebSocket: `/api/ws/rail` → push updates for all Rail-relevant state changes
  - Subscribes to event bus: `task_state_changed` (blockers), `bet_committed`/`bet_shipped` (bet status), `cost_cap_warning`/`cost_cap_breached` (cost), `item_created` (new items for ordering)
- Rail data assembled from: bets (status), tasks (blocked count, state), factory_settings (cost_cap, cost_actual), items (unresolved, awaiting ordering)

**Acceptance Criteria:**
1. `GET /api/rail` returns `{ bets: [...], blockers: [...], awaitingOrder: [...], cost: { burn: N, cap: M, pct: P } }`.
2. WebSocket: connect, then block a task → WebSocket receives a `blocker_added` message within 5 seconds (NF-1.2).
3. WebSocket: cost sentinel fires warning → WebSocket receives `cost_warning` message.
4. Bets are returned with one-line status: id, title, status, progress indicator.
5. Blockers include: task id, title, owner, how long blocked.
6. Cost burn updates are pushed at least every 30 seconds (or on every session cost update).

---

### E6 — Agents + Sessions + Status Endpoints

**Scope:**
- `GET /api/agents` → list all agents with status, team, role, current sessions
- `GET /api/agents/:id` → agent detail with skills, autonomy levels, cost
- `PATCH /api/agents/:id/skills/:skillId` → update autonomy level for an agent-skill pair (creates review thread if level changes)
- `GET /api/routines` → list all routines with status, trigger config, last/next run
- `PATCH /api/routines/:id` → update routine (enable/disable, change config)
- `POST /api/routines/:id/retire` → retire a routine (reassign or deactivate)
- `POST /api/routines/:id/trigger` → manually trigger a routine (for testing)
- `GET /api/agents/:id/inbox` → agent's inbox (messages)
- `POST /api/agents/:id/inbox` → send message to agent
- `POST /api/sessions` → create a session (triggers provisioning via D5)
- `PATCH /api/sessions/:id` → update session state (end, crash)
- `GET /api/status` → factory-wide status: active sessions, agent states, total cost, uptime
- `GET /api/settings` → factory settings
- `PATCH /api/settings` → update factory settings (cost caps, etc.)

**Acceptance Criteria:**
1. `GET /api/agents` returns all agents with their current session count.
2. Agent inbox: send a message, then read inbox → message appears.
3. `POST /api/sessions` with valid task and agent → session provisioned, 201 returned with session ID.
4. `GET /api/status` returns `{ activeSessions: N, agents: { total: M, active: K }, cost: { today: $X, cap: $Y } }`.
5. `PATCH /api/settings` with new cost_cap → factory_settings updated, subsequent cost checks use new cap.
6. Agent skill autonomy levels are included in `GET /api/agents/:id` response.
7. Autonomy update: `PATCH /api/agents/:id/skills/:skillId { autonomy_level: 'L3' }` → updates `agent_skills` row, creates a review thread item (autonomy changes need human awareness).
8. Routine management: list routines, disable a routine, manually trigger a routine.
9. Retiring a routine with an active owner works; retiring when the owner has other routines on the same skill raises a warning.

---

### E7 — Autonomy + Silence Policy Engine (Backend in v1, UI deferred to v2)

The gating layer that decides which items get pushed, which queue silently, and which auto-resolve based on autonomy levels and silence modes.

**Scope (v1 — backend only):**
- `packages/server/domain/policy-engine.ts`:
  - `evaluateItem(item, agentSkill, silenceConfig)` → returns `{ action: 'push' | 'queue' | 'auto_resolve', reason: string }`
  - Rules:
    - Autonomy L4 + risk_tier low → auto-resolve (approve without human)
    - Autonomy L3 + risk_tier low → queue silently (include in daily digest)
    - Autonomy L2 or risk_tier ≥ medium → push notification
    - Autonomy L1 → push notification for every action
    - Silence mode active → queue all non-blocking items
  - Auto-resolution: creates a Response automatically with `approver: 'policy_engine'`
- Integration with item creation (E2): every new item passes through the policy engine before routing
- Silence modes: per-human time windows (e.g., "don't push between 10pm-7am"), per-product (e.g., "this product is in maintenance, queue everything")
- Configuration: silence windows and per-product modes stored in `factory_settings`

**UI portion (deferred to v2):**
- Settings panel for silence modes, autonomy level toggles per agent/skill, policy rule configuration
- These UI elements are part of UI-42 (Settings Panel) scope but marked as v2

**Acceptance Criteria (v1):**
1. Agent skill at L4, low-risk item → item is auto-resolved, no notification sent. Response exists with `approver: 'policy_engine'`.
2. Agent skill at L1, any item → push notification fires.
3. Silence mode active → item is queued, not pushed. After silence window ends, queued items are delivered.
4. A high-risk item is NEVER auto-resolved regardless of autonomy level.
5. Skill-change items are NEVER auto-resolved regardless of autonomy level.
6. The daily digest contains all queued items from the past 24 hours.
7. Per-product silence: enable silence on product P → all items from P are queued.

---

## Track F: Human Interface (UI)

Built bottom-up from foundation through pages. The canonical component tree is the single source of truth — no custom components outside the 19-component budget without updating UI_DESIGN.md first.

### UI-00 — Foundation (~2 days)

Install Tailwind + DaisyUI, author the `factory-dark` theme, wire up behavior dependencies.

**Scope:**
- `packages/web/`:
  - Tailwind CSS + DaisyUI installed and configured in `vite.config.ts`
  - Custom `factory-dark` theme in `tailwind.config.ts`:
    - Surface colors: #000000, #0e0e0e, #131313, #191a1a, #1f2020, #252626, #2c2c2c
    - Primary: #adc6ff; warn: #d58f24; ok: #bbffb3; danger: #ee7d77
    - Text: #e7e5e4, #acabaa, #767575
    - Radius overrides: 0, 2px, 4px, 8px
  - Font loading: Inter (body) + Space Grotesk (headings) in `index.html` or CSS
  - `FocusRing` utility component (1-2px outline using focus-visible)
  - `focus-trap-react` imported and ready for modal/drawer use
  - `@floating-ui/react` imported and ready for positioning
  - Grid system configured to 4px base

**Deliverables:**
- Tailwind config with factory-dark theme
- FocusRing utility
- Proof-of-concept: render a DaisyUI button with factory-dark styling

**Acceptance Criteria:**
1. `npm run dev` starts Vite with Tailwind styles applied.
2. A DaisyUI `<button class="btn">` renders with factory-dark colors.
3. Focus ring visible on button with keyboard focus.
4. Fonts load correctly (Inter body, Space Grotesk headings).
5. Grid alignment (4px) verified visually or via design inspection.
6. No custom CSS — only Tailwind utilities and DaisyUI classes.

---

### UI-10 — Tier 1 Primitives (~3 days)

Five foundational components used by every Block and Region above.

**Scope:**

**StatusChip:** small inline status indicator
- Props: status (enum: 'proposed', 'accepted', 'in_progress', 'hold', 'blocked', 'review', 'done', 'killed', 'captured', 'provisional', 'validated', 'active', 'stale', 'shaped', 'committed', 'shipped')
- Rendered as: DaisyUI `<badge>` with theme color mapped to status
- States: default, with icon, with tooltip

**Tag:** label / category indicator
- Props: label (string), color (optional, default neutral)
- Rendered as: DaisyUI `<badge class="badge-outline">`
- States: default, closable, with count

**KeyValue:** label + value pair (often in lists)
- Props: label (string), value (string | ReactNode), emphasized (bool)
- Layout: two-column (label on left, value on right, or stacked on mobile)
- States: normal, emphasized, with unit/suffix

**NavItem:** sidebar or menu navigation item
- Props: label (string), active (bool), icon (ReactNode), count (number, optional)
- Rendered as: DaisyUI `<menu-item>` or semantic `<li>` with Tailwind active state
- States: default, active, focused, with badge/count

**SearchField:** text input for search
- Props: placeholder (string), value (string), onChange (handler), onSubmit (handler), loading (bool)
- Rendered as: DaisyUI `<input type="text">` with icons (search icon, clear button, spinner when loading)
- States: default, filled, loading, empty, with results indicator

**Deliverables:**
- Five component files in `packages/web/src/components/Tier1/`
- Storybook stories for each with all states
- Integration tests (props, rendering, events)

**Dependencies:**
- UI-00 (Tailwind + DaisyUI + theme loaded)

**Acceptance Criteria:**
1. All five components render without errors.
2. StatusChip displays correct color for each status enum value.
3. Each component has ≥3 Storybook stories covering all variants and states.
4. KeyValue layouts correctly (two-column desktop, stacked mobile).
5. NavItem active state is visually distinct and keyboard-navigable.
6. SearchField handles user input and onChange without lag.
7. All components use only DaisyUI classes and Tailwind utilities — no custom CSS.
8. Storybook build succeeds.

---

### UI-20 — Tier 2 Blocks (~4 days)

Six reusable card/row components composed from Tier 1 and DaisyUI primitives.

**Scope:**

**ThreadRow:** message or thread item in a list
- Props: id, title (string), snippet (string), timestamp (Date), unread (bool), avatar (ReactNode), actions (array of { label, onClick })
- Layout: avatar | content (title + snippet, timestamp) | actions
- States: default, unread (bold/highlight), focused, hovered, with badge

**BetCard:** bet opportunity card (used in Canvas shaped column)
- Props: id, title, pitch (brief description), appetite (string: S, M, L, XL), appetite_detail (number), actions (array)
- Rendered as: DaisyUI `<card>` with header (title), body (pitch + appetite badge), actions
- States: default, selected, disabled, with activity indicator

**PitchCard:** proposal card (similar to BetCard but for pitches)
- Props: id, title, proposedBy (agent name), hypothesis (string), actions (array)
- Layout: header (title + proposer), body (hypothesis), actions
- States: default, selected, with attachment indicator

**TaskCard:** single task unit
- Props: id, title, owner (agent name), state (StatusChip), sessionCount (number), cost (string), actions (array)
- Layout: header (title + owner) | state badge | metadata (session count, cost) | actions
- States: all task states (hold, blocked, in_progress, review, done); blocked state has red border

**KnowledgeRow:** knowledge item in a list
- Props: id, title, layer (L1–L4), kind (practice, decision, etc.), status (StatusChip), lastModified (Date), actions (array)
- Layout: layer badge | title | kind badge | status | timestamp | actions
- States: default, conflict warning (yellow badge), favorite, focused

**NotificationRow:** message or alert item
- Props: id, title, message (string), severity (low/medium/high, maps to color), timestamp (Date), actions (array)
- Layout: severity icon | message | timestamp | actions
- States: unread, read, acknowledged, with action menu

**Deliverables:**
- Six component files in `packages/web/src/components/Tier2/`
- Storybook stories (all states per component)
- Integration with Tier 1 (each Block composes at least two Primitives)

**Dependencies:**
- UI-00, UI-10

**Acceptance Criteria:**
1. All six components render without errors.
2. Each composes at least two Tier 1 primitives (StatusChip, Tag, KeyValue, etc.).
3. Each has ≥2 Storybook stories covering main variants.
4. BetCard and PitchCard are visually distinct.
5. TaskCard blocked state renders with red border per design.
6. All states (unread, active, blocked, etc.) are visually distinct.
7. Storybook build succeeds.

---

### UI-30 — Tier 3 Shell Regions (~4 days)

Three core layout regions that form the shell of every page.

**Scope:**

**IconRail:** left sidebar with icon buttons and badge
- Props: items (array of { id, icon, label, count, onClick, active }), onHomeClick, onSettingsClick
- Layout: vertical menu of icon buttons (only icons visible by default, label on hover or in tooltip)
- States: default (icons only), expanded (shows labels), with unread badges

**Submenu:** collapsible menu below IconRail (or nested inside it)
- Props: items (array of { id, label, icon, active, onClick, children (optional for nested) })
- Layout: vertical list, indented for nested items
- States: collapsed (icon only), expanded (full labels), active item highlighted
- Behavior: toggle collapse/expand, select items, navigate nested

**Rail:** right notification/status sidebar (the only notification surface)
- Props: bets (array with status), blockers (array with duration), awaitingOrder (array), cost ({ burn, cap, pct })
- Layout: vertical sections (active bets, blockers, cost bar)
- States: collapsed (icons/badges only), expanded (full detail)
- Behavior: keyboard nav (arrow keys), expand item to open in main pane, acknowledge blocker

**Deliverables:**
- Three component files in `packages/web/src/components/Tier3/`
- Storybook stories
- Keyboard navigation (arrow keys, Enter to expand)

**Dependencies:**
- UI-00, UI-10, UI-20

**Acceptance Criteria:**
1. IconRail renders vertical icon menu correctly.
2. Submenu toggles expand/collapse and shows/hides labels.
3. Rail displays bets, blockers, cost in sections.
4. Keyboard nav works: arrow keys move focus, Enter expands/collapses.
5. Active item state is visually distinct.
6. Rail is the **only** component that can display notifications (confirm no notification bell or global toast elsewhere).
7. Storybook build succeeds.

---

### UI-31 — Tier 3 Domain Regions: Work/Planning (~3 days)

Three specialized regions for work planning: Canvas, Kanban, PitchSelector.

**Scope:**

**Canvas:** two-column layout (shaped / committed) for bet placement
- Props: shaped (array of BetCard), committed (array of BetCard), capacity ({ used, max }), onDragEnd (handler)
- Layout: left column (shaped), right column (committed with capacity badge at top)
- States: default, dragging, over-capacity (visual warning)
- Behavior: drag-and-drop from shaped to committed (or use click-to-commit UI)

**Kanban:** four-column task board (for task states: hold, in_progress, review, done)
- Props: columns (array of { state, tasks (array of TaskCard) }), onMove (handler)
- Layout: four vertical columns, drag-drop between columns or click-state-menu
- States: default, dragging, empty column
- Behavior: drag-drop or state-change menu

**PitchSelector:** modal or expanded pane to pick a pitch for a new task or bet
- Props: pitches (array of PitchCard), onSelect (handler), onCancel (handler)
- Layout: grid or list of pitches with search/filter at top (SearchField)
- States: default, loading, no-results, selected (checkmark)

**Deliverables:**
- Three component files in `packages/web/src/components/Tier3/`
- Storybook stories for each region
- Drag-drop logic (Canvas, Kanban)

**Dependencies:**
- UI-00, UI-10, UI-20, UI-30

**Acceptance Criteria:**
1. Canvas drag-drop moves cards between shaped and committed columns.
2. Canvas over-capacity state shows visual warning.
3. Kanban drag-drop moves TaskCards between state columns.
4. PitchSelector filters pitches by search and allows selection.
5. All regions use only Tier 1 + Tier 2 + DaisyUI.
6. Storybook build succeeds.
7. Empty states: Canvas with no bets shows "No bets yet. Click + to add one."; Kanban columns show "No tasks in {state}"; PitchSelector shows "No pitches available."

---

### UI-32 — Tier 3 Review Regions: Artifact + Verdict (~3 days)

Two specialized regions for reviewing work: ArtifactView (five shapes) and ReviewHeader (verdict actions, keyboard shortcuts).

**Scope:**

**ArtifactView:** renders content in one of five canonical shapes
- Props: shape ('text_diff' | 'content_preview' | 'visual_comparison' | 'action_summary' | 'data_metrics'), data (shape-specific payload)
- Rendered as DaisyUI `<card>` or `<modal>`
- **text_diff:** two-column code diff with syntax highlighting (additions green, deletions red, context lines)
- **content_preview:** rendered HTML/markdown content + metadata sidebar
- **visual_comparison:** before/after images or visual elements, zoom controls, annotations with legend
- **action_summary:** summary card (what, why, impact, rollback, checks, timeline, cost)
- **data_metrics:** headline metrics with trend indicators, charts (line/bar), narrative insights, recommendations
- States: default, loading, error, empty data

**ReviewHeader:** approval bar with all 10 verdict actions
- Props: proposedBy (agent name), proposedAt (Date), reasoning (string), actions array with keyboard shortcuts
- Layout: header bar with avatar | proposedBy + time | reasoning snippet | action buttons
- Actions: approve (A), approve-with-comments (A+C), comment, inline-comment, request-changes (R), edit, reject (X), reply, snooze (S), escalate
- States: default, loading (buttons disabled), completed (checkmark), rejected (X)
- Keyboard shortcuts: A → Approve, R → Request Changes, X → Reject, S → Snooze (only when appropriate state)

**Deliverables:**
- Two component files in `packages/web/src/components/Tier3/`
- Storybook stories for all five ArtifactView shapes with empty/loading/error/default states
- ReviewHeader with all 10 verdict buttons and keyboard shortcut hints
- Inline comment and reply composer hooks

**Dependencies:**
- UI-00, UI-10, UI-20, UI-30

**Acceptance Criteria:**
1. ArtifactView renders all five shapes without errors.
2. text_diff: renders additions (green), deletions (red), context lines, per INFORMATION_ARCHITECTURE.md.
3. content_preview: renders HTML/markdown content with metadata.
4. visual_comparison: renders before/after images, zoom, annotations, legend.
5. action_summary: renders summary card with structured fields (what, why, impact, rollback, checks, timeline, cost).
6. data_metrics: renders headline metrics with trend indicators, charts, narrative, recommendations.
7. Each shape has Storybook stories covering: default render, loading, error, empty data states.
8. ReviewHeader displays proposer info and shows all 10 verdict buttons in correct grouping (primary: Approve, Request Changes, Reject, Snooze; secondary overflow: Edit, Escalate, Delegate, Comment Only).
9. Keyboard shortcuts work: press A → Approve, R → Request Changes, X → Reject, S → Snooze. Shortcuts pre-fill verdict but don't submit; user presses Enter or clicks button to confirm.
10. All regions use only Tier 1 + Tier 2 + DaisyUI.
11. Storybook build succeeds with accessibility tests passing (axe).

---

### UI-40 — Tier 4 Pages (~1 week)

Nine domain pages composed entirely from Tier 3 Regions (and smaller primitives where needed).

**Scope:**

Pages (each composed from: IconRail + Submenu on left, Main pane in center, Rail on right):

1. **Conversations/Review:** thread list (ThreadRow blocks) + detail (ReviewHeader + ArtifactView) + action buttons
2. **Conversations/Chat:** thread list + chat bubbles (ThreadRow variants) + reply input
3. **Work/Portfolio:** bets overview (BetCard list, grouped by status)
4. **Work/Team:** team member list (agent cards), team capacity, cost
5. **Work/Team+Pitch:** workspace for a specific bet/pitch (Canvas or kanban board)
6. **Work/Bet:** single bet detail (BetCard + linked tasks + revision log)
7. **Knowledge/List:** scope selector + KnowledgeRow list grouped by layer/kind
8. **Knowledge/Detail:** single knowledge item (title + body editor + metadata + conflict indicator)
9. **Settings:** factory settings form (cost caps, thresholds, etc.)

**Deliverables:**
- Nine page files in `packages/web/src/pages/`
- React Router routes wired to each page
- Navigation between pages via Submenu and IconRail
- Full Shell layout (IconRail + Submenu + Main + Rail) on each page

**Dependencies:**
- UI-00, UI-10, UI-20, UI-30, UI-31, UI-32

**Acceptance Criteria:**
1. All nine pages render without errors.
2. Each page is composed **only** from Tier 3 Regions (no custom component outside the canonical 19).
3. Navigation between pages works (Submenu items link to routes).
4. Main pane content is distinct and matches domain (conversations thread list, work bets, knowledge items, etc.).
5. Rail updates in real-time from `/api/ws/rail`.
6. Shell layout (three zones) is consistent across all pages.
7. Responsive: pages adapt to mobile viewport (breaks to single-column or tabs per domain).

---

### UI-42 — Settings Panel (~3 days)

User settings accessible from IconRail avatar menu. Composes existing Tier 1/2 components only.

**Scope:**
- Modal or drawer opened from user avatar in IconRail
- Five tabs (DaisyUI `tabs` component): Profile, Products, Agents, Notifications, Appearance
- Each tab is a form with KeyValue rows + DaisyUI `input` / `toggle` / `select` controls
- **Profile:** user name, email (read-only), avatar
- **Products:** list of products with activation toggles (which products the user can see/act on)
- **Agents:** list of agents with autonomy level selectors (dropdown), pause/reactivate buttons (v2: detailed autonomy UI deferred)
- **Notifications:** toggles for review/cost/blocker, time picker for quiet hours, product list with mute toggles
- **Appearance:** theme selector (light/dark, deferred), density setting (compact/normal)
- Save button disables while request in flight; shows success/error feedback via Rail
- Validation: all caps must be >= 0, time fields are valid times
- No new components — only composes IconRail NavItem for Settings, Submenu section NavItems, KeyValue rows with DaisyUI inputs/toggles/selects in Main pane

**Deliverables:**
- Settings page in `packages/web/src/pages/Settings.tsx`
- Integration with IconRail avatar click
- React Router route `/settings`

**Dependencies:**
- UI-00, UI-10, UI-20, UI-30

**Acceptance Criteria:**
1. Settings modal opens from avatar click in IconRail.
2. Five tabs render and are independently scrollable.
3. Profile tab shows user name, email, avatar.
4. Products tab: list of products with toggle switches for activation.
5. Agents tab: list of agents with autonomy level dropdowns, pause/reactivate buttons.
6. Notifications tab: toggles for review/cost/blocker, time picker for quiet hours, product mute toggles.
7. Appearance tab: theme selector (light/dark deferred to v2), density picker.
8. Save button disables while request in flight.
9. Validation: cost caps must be >= 0, times are valid (24-hour format).
10. Success/error feedback routed through Rail, not inline toast.
11. Only composes existing Tier 1/2 components and DaisyUI primitives.

---

### UI-45 — Global Search Panel (~2 days)

Command-palette-style global search accessible via ⌘K. Composes existing components only.

**Scope:**
- Modal triggered by ⌘K keyboard shortcut (or Ctrl+K on Windows/Linux)
- DaisyUI `modal` + SearchField primitive + scrollable list
- Results composed of existing Tier-2 rows: ThreadRow, BetCard (lite), KnowledgeRow
- Searches across: conversations, bets, tasks, knowledge items
- Groups results by type
- Arrow keys navigate, Enter selects
- ESC closes modal

**Deliverables:**
- Global search modal component in `packages/web/src/components/GlobalSearch.tsx`
- Keyboard event handler wired into app shell
- Integration with `/api/search` endpoint (if needed; otherwise use existing endpoints)

**Dependencies:**
- UI-00, UI-10, UI-20

**Acceptance Criteria:**
1. ⌘K opens search modal.
2. Search field focused automatically on open.
3. Typing filters results in real time.
4. Results grouped by type (Conversations, Work, Knowledge).
5. Arrow keys navigate results, Enter selects.
6. ESC closes modal.
7. Results show as ThreadRow (conversations), BetCard-lite (work), KnowledgeRow (knowledge).
8. No results shows "No matches. Try a different query."
9. Only composes existing Tier-2 components and DaisyUI primitives.

---

### UI-50 — Polish (~3 days)

Motion, states, keyboard shortcuts, accessibility.

**Scope:**
- Transitions and animations:
  - Page transitions (fade, slide)
  - Component hover/focus states (subtle scale, color shift)
  - Loading skeletons for async content
- Empty/loading/error states:
  - Empty state placeholders (no conversations, no bets, etc.)
  - Loading spinner (DaisyUI `<loading>`)
  - Error toast notifications (DaisyUI `<alert>`)
- Keyboard shortcuts:
  - Alt+1 → Conversations, Alt+2 → Work, Alt+3 → Knowledge, Alt+4 → Settings
  - Arrow keys in Rail and Submenu (already wired in UI-30/31)
  - Enter to expand, Esc to close modals
- Accessibility:
  - ARIA labels on all interactive elements
  - Color contrast verified (WCAG AA minimum)
  - Keyboard-only navigation works (no mouse required)
  - Screen reader testing (Storybook with axe plugin)

**Deliverables:**
- Tailwind animation utilities (or CSS keyframes if needed)
- Loading skeleton components
- Error/empty state components
- Keyboard event handlers integrated into existing pages

**Dependencies:**
- UI-00 through UI-45 (all UI layers)

**Acceptance Criteria:**
1. All pages have smooth transitions (no jarring jumps).
2. Empty states render for: conversations (no threads), work (no bets), knowledge (no items).
3. Loading state shows spinner or skeleton while fetching.
4. Error state shows toast with dismiss button.
5. Keyboard shortcuts work (Alt+1, Alt+2, etc.).
6. Arrow keys navigate Rail/Submenu, Enter expands items.
7. All interactive elements have proper focus rings and ARIA labels.
8. axe accessibility tests pass (Storybook integration).
9. No custom CSS — only Tailwind + DaisyUI.

---

## Track G: Facilitator Pipeline

### G1 — Facilitator Agent Infrastructure

**Scope:**
- Agent identity model: Chief of Staff, Practice Facilitators (per community), Product Managers (per product)
- `IDENTITY.md` (soul prompt) templates for each facilitator type
- Seed data: create the facilitator agents in the database with correct roles, teams, and skills
- Facilitator-specific tools: in addition to the standard agent tools (D4), facilitators get:
  - `route_item.ts` → route an item to a specific view
  - `score_attention.ts` → set attention score on a knowledge item
  - `promote_knowledge.ts` → transition knowledge item status
  - `create_conflict_review.ts` → create a review thread for a knowledge conflict

**Acceptance Criteria:**
1. After seeding, the database contains: 1 Chief of Staff, at least 1 Practice Facilitator, and 1 Product Manager.
2. Each facilitator has a valid `soul_prompt_path` pointing to an `IDENTITY.md` file.
3. The facilitator-specific tools compile and return correct types.
4. `route_item` creates an item and assigns it to the correct view based on risk_tier and kind.
5. `promote_knowledge` transitions a knowledge item from CAPTURED to PROVISIONAL — verified by re-reading the item.
6. A session can be provisioned for a facilitator agent using the standard flow (D5).

---

### G2 — Attention Scoring Engine

**Scope:**
- `packages/server/domain/attention.ts`:
  - `computeAttentionScore(item, context)` → 0.0–1.0
  - Factors: novelty (new topic = higher), impact (broad applicability = higher), conflict (contradicts existing = higher), repetition (repeated discovery = lower need for human review), confidence (high confidence = lower need), taste sensitivity (brand/voice/style = higher), recency of last human review, usage frequency
  - Scores are recomputed periodically by facilitator routines and on-demand when items change
- Threshold crossing: when an item's attention score crosses the threshold (configurable, default 0.7), create an item for the human's queue

**Acceptance Criteria:**
1. A knowledge item that conflicts with an existing item gets a higher attention score than one that doesn't.
2. A brand-voice item (taste-sensitive) scores higher than a technical implementation detail.
3. An item reviewed by a human recently has a lower score than one never reviewed.
4. Threshold: item score crosses 0.7 → an item_created event fires to surface it in the Rail.
5. Score computation is deterministic: same inputs produce same output.
6. Scoring 1000 items takes <1 second.

---

### G3 — Knowledge Promotion Pipeline

**Scope:**
- `packages/server/workers/promotion-pipeline.ts`:
  - CAPTURED → PROVISIONAL: automatic when a facilitator validates the item's structure and relevance
  - PROVISIONAL → VALIDATED: automatic when the same learning appears in 5+ sessions (cross-product repetition) AND no contradictions
  - VALIDATED → ACTIVE: facilitator promotes after organizing, tagging, and deduplicating
  - ACTIVE → STALE: attention score decay over time without usage
  - STALE → ARCHIVED: facilitator or human archives
  - Layer precedence: L4 > L3 > L2 > L1 — a proposed L3 practice contradicting an L4 principle is flagged for human review
- The 3-turn practice meeting conversation:
  1. All agents propose findings
  2. All agents react with context and relevance
  3. Practice Facilitator synthesizes — routing items to L3 or L2

**Acceptance Criteria:**
1. A CAPTURED item promoted by a facilitator moves to PROVISIONAL — status updated, event fired.
2. Auto-promotion: same finding in 5 different sessions → item auto-promoted to VALIDATED (no human needed).
3. Contradiction check: a proposed practice that contradicts an L4 principle → flagged for human review (item created), NOT auto-promoted.
4. Stale detection: an ACTIVE item unused for 90 days → status moves to STALE.
5. An item with an open conflict cannot be promoted past PROVISIONAL.
6. The 3-turn meeting: a test simulates the three turns → synthesized output creates/updates knowledge items.

---

### G4 — Built-in Routines (Retro, Practice Meeting, Cost Sentinel)

**Scope:**
- Pre-configured routines created during factory initialization:
  - **Cost Sentinel:** heartbeat every 15 minutes, owned by Chief of Staff, monitors burn rate (C7)
  - **Practice Meeting:** weekly calendar trigger, owned by Practice Facilitators, runs the 3-turn conversation
  - **Post-Bet Retro:** event trigger on `bet_shipped`, owned by Product Manager, compares hypothesis vs. reality
  - **Monthly Portfolio Retro:** calendar trigger first Monday, owned by Chief of Staff, cross-product patterns
  - **Knowledge Decay Check:** daily heartbeat, owned by Practice Facilitators, flags stale items
- Each routine is seeded with correct trigger_type, trigger_config, skill_id, owner, and autonomy_level

**Acceptance Criteria:**
1. After factory initialization, all 5 routines exist in the `routines` table with correct configs.
2. Cost Sentinel: fires on heartbeat, checks costs, emits warning/breach events as appropriate.
3. Post-Bet Retro: shipping a bet triggers the routine → a retro session runs → produces a reflection item.
4. Knowledge Decay: daily check finds items unused for >90 days → transitions to STALE.
5. Each routine can be manually triggered via API for testing (`POST /api/routines/:id/trigger`).
6. Disabling a routine (`active: false`) prevents it from firing.

---

## Track H: Operations

### H1 — Git Export Routine

**Scope:**
- Routine that exports human-readable knowledge items to a Git repository
- Triggers: after any human edit to L2 or L4 knowledge items, or on a daily schedule
- Exports: L2 product docs (BRIEF.md, ARCHITECTURE.md, etc.) and L4 factory docs (PRINCIPLES.md, FOCUS.md) as markdown files
- Git operations: commit with descriptive message, push to configured remote
- Configurable: Git repo path, remote URL, branch

**Acceptance Criteria:**
1. After a human edits an L4 PRINCIPLES item, the Git export runs and commits a new `PRINCIPLES.md` to the repo.
2. The commit message includes which items were changed.
3. If no items changed since last export, no commit is created.
4. The exported markdown matches the item's body exactly.
5. Configure a different branch → exports go to that branch.

---

### H2 — Notification Adapter

**Scope:**
- `packages/server/adapters/notification.ts`:
  - Interface `NotificationAdapter`: `send(recipient, notification)`
  - `ConsoleNotificationAdapter`: logs to console (development)
  - `NtfyAdapter`: sends to ntfy.sh topic (self-hosted push)
  - `SmtpAdapter`: sends email (fallback)
- Notification triggers: blocking review items, cost cap breaches, urgent agent chats
- Notification policy: respect silence modes, daily digest batching for non-urgent items
- Configuration: adapter selection and credentials in `factory_settings`

**Acceptance Criteria:**
1. Console adapter: creates a blocking review item → notification logged to console.
2. Ntfy adapter: sends a push to a configured ntfy.sh topic (integration test with a test topic).
3. SMTP adapter: sends an email (integration test with a test SMTP server like MailHog).
4. Silence mode: enable silence for a time window → notifications during that window are queued, not sent.
5. Only blocking review items and cost breaches trigger push notifications — low-risk items do not.
6. Daily digest: non-urgent items accumulate and are sent as a single digest.

---

### H3 — Observability Adapter

**Scope:**
- `packages/server/adapters/observability.ts`:
  - Interface `ObservabilityAdapter`: `logEvent(event)`, `startSpan(name)`, `endSpan(spanId)`
  - `ConsoleObservabilityAdapter`: structured JSON logs to console
  - `LangfuseAdapter`: sends traces to Langfuse (optional)
- Events logged: session start/end, tool calls, cost, state transitions, knowledge writes
- Trace correlation: each session gets a trace ID that links all events

**Acceptance Criteria:**
1. Console adapter: starting a session logs a structured JSON event with session ID, agent ID, task ID.
2. Trace correlation: all events within a session share the same trace ID.
3. Langfuse adapter: sends a trace to a Langfuse project (integration test with test credentials).
4. Performance: logging 1000 events takes <100ms (non-blocking).
5. Adapter is configurable via `factory_settings`.

---

### H4 — Deployment Profiles + PostgreSQL Adapter

**Scope:**
- Deployment profile configuration: `laptop`, `vps`, `cloud`
  - Laptop: SQLite, local workspaces, console notifications, single process
  - VPS: Postgres optional, Docker workspaces, ntfy notifications, single process
  - Cloud: Postgres required, E2B/Daytona workspaces, full notification stack
- PostgreSQL adapter for Drizzle: same schema, postgres.js driver
  - Migration script that works for both SQLite and Postgres
  - Connection pooling configuration
- Docker Compose files for each profile
- Single-command setup: `bun run setup --profile laptop`

**Acceptance Criteria:**
1. `bun run setup --profile laptop` creates the SQLite database, runs migrations, seeds data, and starts the server.
2. `bun run setup --profile vps` starts with Docker Compose (Postgres + server + web).
3. All tests pass against PostgreSQL (run the full test suite with Postgres driver).
4. Switching from SQLite to Postgres requires only changing a config value (no code changes).
5. The Postgres adapter handles connection pooling (10 connections default).
6. Documentation exists for each profile's setup steps.

---

## Dependency Summary

```
STORY    DEPENDS ON              PARALLEL WITH
─────    ──────────              ─────────────
A1       (none)                  (none — everything starts here)
A2       A1                      (none)
A3       A1                      A2

B1       A2                      C1, E1
B2       B1, B3                  C2, C3
B3       A1                      B1, C1 (can start early)
B4       B2                      C4
B5       B4, B1                  C5
B6       B1, B2, B4              C6

C1       A2, A3                  B1, E1
C2       A2, A3                  B1, C1, E1
C3       C1, B2, B4             C4
C4       A2                      B1, C1, C2
C5       C3, A3                  B5
C6       C3, C1                  C5
C7       C3, A3                  C6

D1       A1                      B1, C1 (interface only)
D2       D1                      B2, C3
D3       D1                      D2
D4       B1, C1, C6              D2, D3
D5       D1, D2 or D3, B2, B4, C3, C7, D4    (integration point, E2 sequencing)

E1       A2, A3                  B1, C1
E2       E1, B1, C1              B2, C2, D5 (receives session_ended events)
E3       E1, C1, C2              E2, B2
E4       E1, B1, B4              E2, E3 (B4 unblocks E4 for workspace layout contract)
E5       E1, A3, C1, C7          E2, E3, E4
E6       E1, D5                  E5
E7       E2, C7                  E6

UI-00    A1                      (foundation)
UI-10    UI-00                   (primitives)
UI-20    UI-00, UI-10            (blocks)
UI-30    UI-00, UI-10, UI-20     (shell regions)
UI-31    UI-00, UI-10, UI-20, UI-30  (work/planning domains: Canvas, Kanban, PitchSelector)
UI-32    UI-00, UI-10, UI-20, UI-30  (review domains: ArtifactView + ReviewHeader, all verdict actions + keyboard shortcuts)
UI-40    UI-30, UI-31, UI-32, E2, E3, E4, E5, E6  (pages, needs all API endpoints)
UI-42    UI-00, UI-10, UI-20, UI-30  (Settings Panel — 5 tabs, composed from existing components)
UI-45    UI-00, UI-10, UI-20     (Global Search — modal with ⌘K, composes existing Tier-2 rows)
UI-50    UI-00 through UI-45     (polish, final pass)

G1       D4, B1                  E6
G2       G1, B1                  G3
G3       G2, B5                  G4
G4       G3, C5                  H1

H1       B1, G1                  H2
H2       E2, A3                  H1, H3
H3       A3                      H1, H2
H4       A2, H1-H3              (final)
```

---

## Critical Path

The longest dependency chain determines the minimum time to a working system:

```
A1 → A2 → B1 → B2 (+B3) → B4 → C3 → D5 → E6 → UI-00 → UI-10 → UI-20 → UI-30 → UI-31 → UI-32 → UI-40 → G1 → G2 → G3 → G4 → H4
```

This is the critical path: **Foundation → Knowledge Store → Materialization → Writeback → Sessions → Provisioning → API (E6) → UI Foundation → Tier1 → Tier2 → Shell Regions → Work/Planning Regions (UI-31) → Review Regions (UI-32) → Pages → Facilitators → Operations**.

(UI-42 Settings and UI-45 Global Search run in parallel with UI-31/UI-32 after UI-30; they join the critical path at UI-40.)

**First demo milestone (the "hello world"):** After D5 (Session Provisioning), a real agent can be given a task, materialize knowledge, work on it, and write knowledge back. This is the core loop — everything else is orchestration and UI on top.

**Second milestone (human in the loop):** After UI-40 (Tier 4 Pages), a human can see what agents are doing via Conversations and respond to review items via the Review page. The feedback loop is closed. The Rail provides real-time notifications.

**Third milestone (self-improving):** After G4 (Built-in Routines), the facilitator pipeline runs automatically: practices accumulate, retros happen, knowledge is curated. The factory learns. Humans direct via the Knowledge and Settings pages.

---

*This document is the companion to ARCHITECTURE.md (how the system is structured), REQUIREMENTS.md (what it must do), and the other design docs (why it's designed this way). WORK_PACKAGES.md is the bridge to implementation — it's how the design becomes code.*

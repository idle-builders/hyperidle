## 2. Components

<!-- @source packages/db/src/schema.ts -->
<!-- @source packages/server/src/app.ts -->

### 2.1 Primitive Store

**What it is.** The single source of truth for all process state. Every object in the system — Bets, Tasks, Sessions, Teams, Routines, Threads, Messages, Items — lives here. (The legacy "inbox messages" abstraction is folded into the Thread + Message model defined in HUMAN_INTERFACE_LAYER.md §4.5; the legacy `responses` table is dropped, with verdict-payload messages replacing it.)

**Technology.** SQLite by default. One database file per factory instance (`hyperidle.db`). For deployments exceeding ~50 agents or needing concurrent write throughput beyond SQLite's comfort zone, a Postgres adapter is available (same schema, swapped connection).

**Schema highlights:**

```sql
-- Core process primitives
bets (id, product_id, team_id, pitch, appetite, done_condition,
      hypothesis, status, revision_log, created_at, shipped_at)

tasks (id, bet_id, product_id, team_id, owner_agent_id, title,
       description, done_condition, state, dependencies, artifacts,
       cost_cap, cost_actual, durability, risk_tier, attention_score,
       cross_team, thread_id, notes, created_at, updated_at)

sessions (id, task_id, agent_id, model_tier, started_at, ended_at,
          state, sandbox_snapshot, cost, outcome, notes)

teams (id, product_id, members, lead_agent_id, capacity,
       active_bets, cost_cap, cost_actual, formed_at, dissolved_at)

routines (id, owner_agent_id, trigger_type, trigger_config, skill_id,
          done_condition, state_key, delegation_allowed, human_review,
          autonomy_level, silent, active, last_run_at, next_run_at)

-- Threads & messages — see HUMAN_INTERFACE_LAYER.md §4.5 (Thread primitive)
-- Schema below is illustrative; the concept doc is the source of truth.
-- Per §4.5 contracts: a thread attaches to exactly one host (kind + id),
-- messages carry a typed payload (plain | review | questionnaire — closed
-- vocabulary), payloads are immutable after persistence, and "review/chat/
-- coach" <!-- @lore AD8a: ThreadConfiguration "coach" renamed to "assistant" in AD8b --> are NOT thread types — they are message shapes (review,
-- questionnaire, plain) and thread configurations (DM/assistant/feed).
messages (id, sender_id, thread_id, type, payload, client_key,
          deleted_at, redacted_at, created_at)
       -- type ∈ {plain, review, questionnaire, verdict} — closed enum,
       -- exhaustively dispatched at the renderer; new types require
       -- concept-doc update first
       -- payload is JSON typed by `type`; immutable after insert
       -- a `verdict` message carries decision + resolvesMessageId
       -- (redaction is a structured replacement, not an in-place edit;
       --  redacted_at marks the redaction event)
       -- (thread_id, sender_id, client_key) UNIQUE — dedupes at-least-once retries

threads (id, host_kind, host_id, initiator_id, participants, pinned,
         resolved_at, last_active_at, created_at)
       -- host_kind ∈ {bet, task, knowledge_item, artifact, agent, user,
       --              team, factory}
       -- closed enum; new hosts require concept-doc update first
       -- `kind` (review/chat/assistant) is intentionally absent — the founder
       -- reframe at the post-journey-v3 review removed thread-level kinds.
       -- `blocking` and `sync_mode` are intentionally absent — both are
       -- derived from "can the participating agent continue to work
       -- without an answer in this thread?" (HIL §4.5.5).
       -- Hosts cannot be hard-deleted while threads reference them
       -- (soft-archive only); host immutable except user → factory re-home
       -- on user offboarding (HIL §4.5.6).

-- The universal item/response pair (human interface contract)
items (id, source_agent_id, layer, verb, kind, title, body,
       attachments, proposed_action, options, risk_tier,
       attention_score, blocking, reasoning, cost_estimate,
       audit_trail, thread_id, created_at)

responses (id, item_id, decision, inline_anchor, edits, feedback,
           approver_id, view, responded_at)

-- Agent registry (each agent belongs to exactly one team, or is central)
agents (id, name, system_prompt_path, team_id, role, skills, status,
        max_concurrent_sessions, cost_cap, cost_actual, created_at)

-- Product registry
products (id, name, phase, brief_path, architecture_path,
          brand_path, principles_path, factory_db_path, created_at)

-- Per-agent-per-skill autonomy tracking
agent_skills (agent_id, skill_id, autonomy_level, success_count,
              failure_count, last_used_at, promoted_at)

-- Factory-level settings
factory_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)
-- Keys include: cost_cap, cost_cycle (daily/weekly), cost_actual, ...

-- Knowledge edit log (training data for facilitator improvement)
knowledge_edit_log (id, item_id, editor, field, old_value, new_value,
                    edit_type, created_at)

```

**Key differences from v0.1:**
- `agents` has a single `team_id` (one agent, one team; central agents have team_id null).
- `tasks` has a `cross_team` flag and a `notes` column (session notes written before context compaction — the primary bridge between sessions).
- `sessions` has a `model_tier` field (Reasoning / Workhorse / Fast).
- `routines` has a `silent` flag for sleep-time routines that update memory without producing items.
- Sub-agents spawned within a session are invisible to the schema — their cost rolls up into the parent session.

**Interfaces.** The Primitive Store exposes a thin data-access layer — not an ORM, just typed functions: `create_bet(...)`, `get_tasks_for_bet(bet_id)`, `transition_task(task_id, new_state)`, `send_message(...)`, `create_item(...)`, `record_response(...)`. Every write emits an event to the Event Bus (§2.6).

### 2.2 Router

**What it is.** Takes an Item from any source (a facilitator, an agent completing a task, a routine firing) and sends it to the correct view in the Human Interface. The routing logic from HUMAN_INTERFACE_LAYER §7, made executable.

**Technology.** A pure function layer — no server process of its own. Called whenever an Item is created or updated. Implemented as a TypeScript module (`packages/server/src/services/item-router.ts`).

**Routing rules (deterministic, no ML):**

```
IF risk_tier >= medium AND kind == review    → Conversations (push notification)
IF kind == skill_change                      → Conversations (push notification)
IF kind == chat AND flagged_urgent           → Conversations (push notification)
IF kind == chat AND NOT flagged_urgent       → Conversations (silent, daily digest)
IF kind == coach <!-- @lore AD8a: ThreadConfiguration "coach" renamed to "assistant" in AD8b --> → assistant thread (pinned)
IF verb == prioritize                        → Ambient awareness
IF verb == bet                               → Work
IF verb == curate                            → Knowledge
ELSE                                         → Ambient awareness (catch-all)
```

**Founder routing.** When the target is Conversations, the Router also decides which founder receives the item based on domain (see AGENT_LAYER §7). Market/growth/portfolio → CEO; product/design/tech/content → CPO; strategic → both.

**Interfaces.** Input: an Item object. Output: a routing decision (target view + notification policy + recipient founder(s)). The API Layer reads routing decisions to know which view gets which items.

### 2.3 Scheduler

**What it is.** Three functions in one component:

1. **Routine Scheduler** — fires calendar/event/heartbeat triggers and starts sessions for the right agents (with delegation logic when owner is overloaded). Supports silent routines: when `routine.silent == true`, the session runs, writes to memory, and produces no Item.
2. **Dependency Watcher** — watches task state transitions and notifies owners when dependencies are met.
3. **Model Tier Selector** — picks the model tier (Reasoning / Workhorse / Fast) for each new session based on: task risk_tier, routine type (sleep-time → Fast), factory cost posture, and explicit skill overrides.

**Technology.** A background worker running in the same Node.js process as the API server. Uses `setInterval`-based polling against SQLite + EventBus-triggered routines (`packages/server/src/services/routine-scheduler.ts`). For VPS/cloud profiles, a distributed scheduler (candidate: BullMQ or Temporal) **could** back this; not used today.

The scheduler does not call models. It reads the Primitive Store, evaluates trigger conditions, selects the model tier, and emits events (which the Harness Adapter picks up to actually start agent sessions).

**Cost monitoring.** The Cost Sentinel is a heartbeat routine owned by the assistant (not a subsystem of the Scheduler). It runs on the same scheduling infrastructure as every other routine. Cost caps are nested: agent < team < factory. Each level has a configurable budget (default: daily cycle). The Sentinel monitors burn rate at all three levels. When any cap is approached, it creates a review thread item. When a team cap is reached, that team stops (agents finish in-progress sessions, no new work). When the factory cap is reached, all teams stop. It emits `cost_cap_warning` and `cost_cap_breached` events (scoped to agent/team/factory) that the Scheduler uses to pause work and downgrade model tiers.

**Interfaces.**
- Reads: `routines`, `tasks` (dependency graph), cost totals from `sessions`.
- Writes: new `sessions` (via Harness Adapter), new `items` (dependency-met notifications).
- Emits: `routine_fired`, `dependency_met`, `cost_ceiling_breached` events to the Event Bus.

### 2.4 Knowledge Fabric

**What it is.** The sync layer between one canonical knowledge store and two client types (humans via web UI, agents via file workspaces). Full design in KNOWLEDGE_ARCHITECTURE.md §4–7.

**Core architecture.** All knowledge lives in a single `knowledge_items` table in the same SQLite database as the Primitive Store. The Knowledge Fabric projects this store into two formats: a rich API for the human-facing Knowledge view, and assembled file workspaces for agent sessions. Sync is continuous — context assembly at session start, then a file watcher on `knowledge/` and `work/` directories writes back changes incrementally as the agent works. Optimistic concurrency with per-field last-writer-wins for rare conflicts. No dependency on a clean session-end hook.

**The canonical store:**

```sql
knowledge_items (
  id, layer, scope_id, kind, topic,
  title, body, format, status,
  attention_score, confidence,
  version, updated_by, created_at, updated_at, meta
)
```

One table. Every piece of knowledge — from L4 factory principles to L1 task failures — is a row. `layer` determines scope implicitly (L2=product, L3=practice, L4=factory). `scope_id` identifies which product or practice community. `topic` groups items within a scope. `kind` classifies the item type (pattern, anti_pattern, brief, principle, decision, failure, reflection, focus). The `version` column enables optimistic concurrency control.

**Agent workspace projection.** When a session starts, the context assembly engine queries `knowledge_items` for the relevant slice and writes files to the agent's workspace in three zones: `context/` (read-only reference material), `work/` (session scratch), `knowledge/` (proposed knowledge changes). A hidden `.fabric/manifest.json` tracks versions for conflict detection at writeback.

**Human projection.** The API layer reads from `knowledge_items` and serves the Knowledge view (practice scope via `layer='L3'`, product scope via `layer='L2'`, factory scope via `layer='L4'`). Edits write directly to SQLite with version checks.

**Context assembly budget.** The fabric applies relevance scoring (task match, role match, recency, confidence, usage frequency) and a token budget to limit what gets loaded into each session. See KNOWLEDGE_ARCHITECTURE.md §7.

**Semantic search (optional).** For deployments needing cross-product knowledge search ("how did we handle CSV import before?"):
- Default: SQLite FTS5 (full-text search) on `knowledge_items`. Zero extra infrastructure.
- Scale option: Postgres + pgvector. Same schema, vector embeddings added as a column.

**Interfaces.**
- `assemble context(session_id, task, agent, product, role) → workspace_path` — builds the agent workspace.
- `writeback(session_id, workspace_path) → list[change]` — diffs the workspace and writes changes back.
- `read_knowledge(layer, filters) → list[items]` — API for the Knowledge view.
- `write_knowledge(item_id, changes, expected_version) → result` — optimistic write for the Knowledge view.
- `promote(item, from_layer, to_layer)` — facilitators call this to promote knowledge upward.
- `score_attention(item) → float` — computes the attention score for a knowledge item.
- `resolve_conflict(conflict_id, resolution)` — facilitators or humans resolve version conflicts.

### 2.5 API Layer

**What it is.** A thin HTTP API that the Human Interface (the Factory app) talks to. It exposes reads and writes on the Primitive Store, filtered by human identity and routed by the Router.

**Technology.** Hono (TypeScript) running on Node.js. Runs as a single process alongside the Scheduler (`packages/server/`). For the laptop profile, this is the only server process.

**Key endpoints (REST or WebSocket):**

```
# Conversations
GET    /conversations                  → list threads for this human
GET    /conversations/:id              → thread detail with items
POST   /conversations/:id/respond      → submit a Response (verdict, comment, etc.)

# Status (ambient awareness)
GET    /status                        → current system state (bets, blockers, cost, unread count)
WS     /status/stream                 → real-time status updates via WebSocket

# Work (Bets + Tasks)
GET    /bets/canvas                   → shaped pitches + active bets + capacity zones
POST   /bets/:id/commit               → move a pitch to committed
POST   /bets/:id/kill                 → kill a pitch/bet
PATCH  /bets/:id                      → revise bet (done_condition, hypothesis, appetite)

# Knowledge
GET    /knowledge/:layer              → knowledge items for a layer (L2, L3, L4), grouped by topic
POST   /knowledge/:layer/items/:id    → edit, merge, split, flag, archive

# Tasks
GET    /tasks?bet_id=X                → tasks for a bet
PATCH  /tasks/:id                     → update task state/notes
POST   /tasks/:id/handoff             → handoff to another agent

# Agents (internal — used by harness adapters and agent skills)
POST   /agents/:id/inbox              → deliver a message to an agent's inbox
GET    /agents/:id/inbox              → read an agent's inbox
POST   /sessions                      → create a new session
PATCH  /sessions/:id                  → update session state/notes

# Knowledge (internal — used by Knowledge Fabric)
GET    /knowledge/:layer              → query a knowledge layer
POST   /knowledge/:layer              → write to a knowledge layer

# Items (used by facilitators to surface things to humans)
POST   /items                         → create an Item (triggers routing)

# System
GET    /status                        → factory health, agent count, cost burn
```

**Auth.** For the initial deployment: API keys per human identity, passed in headers. Tailscale handles network-level access control. OAuth or passkey auth is a v2 concern.

**Real-time updates.** WebSocket connection for status updates and new Thread items. The API Layer subscribes to the Event Bus and pushes relevant events to connected clients.

### 2.6 Event Bus

**What it is.** An in-process pub/sub system that connects components without tight coupling. Every state change in the Primitive Store emits an event; other components subscribe to the events they care about.

**Technology.** For laptop/VPS profiles: an in-process TypeScript `EventBus` class (`packages/shared/src/event-bus.ts`) with synchronous delivery and type-safe subscriptions. No external message broker needed. For cloud profiles that need distributed event delivery: Redis pub/sub or NATS. The adapter pattern makes this a config choice.

**Key event types:**

```
task_state_changed       → Dependency Watcher, Router, UI push
item_created             → Router, Notification Adapter, UI push
response_recorded        → Knowledge Fabric (close the loop), Harness Adapter (unblock agent)
session_started          → Cost meter, Observability
session_ended            → Cost meter, Task updater, Memory writer
routine_fired            → Harness Adapter (start session)
cost_ceiling_breached    → Scheduler (pause non-essential, downgrade tiers)
bet_committed            → Team notifier, UI push
bet_shipped              → Retro trigger, Practice updater
bet_revised              → Audit log, UI push
```

### 2.7 Harness Adapter

**What it is.** The boundary between HyperIdle and the agent runtime. A thin adapter per supported harness that translates HyperIdle's "start a session for this agent on this task" into the harness's native API.

**Technology.** One TypeScript module per harness (`packages/shared/src/harness/`). Each implements a common interface:

```typescript
interface HarnessAdapter {
  getCapabilities(): HarnessCapabilityDescriptor;

  startSession(params: {
    agent: AgentConfig;       // system prompt, skills, identity
    context: TOONPack;        // L0 session context
    task: Task;               // what to work on
    workspace: WorkspaceRef;  // where to work
    modelTier: ModelTier;     // Reasoning / Workhorse / Fast
  }): Promise<SessionHandle>;

  streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;

  stopSession(handle: SessionHandle): Promise<SessionResult>;
}
```

**Supported harnesses:**
- **First-party harness extension** — HyperIdle's own API-gateway/direct-key runtime (`builtin`) for OpenRouter and similar model gateways, shipped as a bundled extension rather than Kernel-core provider logic; users make it ready by entering a key into HyperIdle, and its descriptor can be read by Strategy as capability context.
- **Autodiscovered BYO harness extensions** — known local coding-agent CLIs detected when installed/authenticated, first-class for `codex`, `claude-code`, `cursor-agent`, and `opencode`; these primarily use the user's provider subscription through native CLI auth, exposed through a standardized HyperIdle login action that delegates to each CLI's own login method. Remote workers may also register when available.

The adapter also handles:
- Returning a **Harness Capability Descriptor**: a queryable declaration of the harness's available models, access mode, auth/onboarding action, generic per-model options, autodiscovery/readiness status, runtime support, and event-normalization commitments. See `docs/agent-layer/harness-capability-descriptor.md`.
- Injecting credentials into the workspace environment.
- Logging every tool invocation into the Observability Adapter.
- Catching session crashes and writing recovery state (session notes) to the task.
- **Pre-compaction trigger.** Where the harness supports it (via token counting, context-window signals, or harness-specific APIs), the adapter fires a trigger that prompts the agent to do a final note-writing pass before the session ends. Not all harnesses expose this — for those that don't, the agent's continuous note-writing habit (writing to `work/session-notes.md` throughout the session) is the fallback.
- Mapping the `model_tier` to the deployer-configured actual model.

### 2.8 Workspace Adapter

**What it is.** Abstraction over where agents physically run. Each workspace is a **per-session working directory on the host machine**. The agent runs as a host child process with the user's environment inherited (PATH, HOME, LANG). There is no isolation boundary (see [Run-unit model](./run-unit-model.md)).

**Technology.** One module per workspace type:

```typescript
interface SandboxAdapter {
  spawn(config: WorkspaceConfig): Promise<WorkspaceRef>;
  exec(ref: WorkspaceRef, command: string): Promise<ExecResult>;
  read(ref: WorkspaceRef, path: string): Promise<Buffer>;
  write(ref: WorkspaceRef, path: string, data: Buffer): Promise<void>;
  snapshot(ref: WorkspaceRef): Promise<SnapshotRef>;
  destroy(ref: WorkspaceRef): Promise<void>;
}
```

**Supported workspaces (as of AQ1):**
- **LocalSandboxAdapter** (default) — a working directory under `HYPERIDLE_WORKSPACES_DIR`; the harness runs as a host child process.
- **DisabledSandboxAdapter** — server-profile boot guard; refuses to provision sessions on shared backends.

Opt-in isolation (per-agent sandbox boundary) is planned for AQ2.

### 2.9 Notification Adapter

**What it is.** Translates routing decisions with push=true into actual notifications on the founder's devices.

**Technology.** Adapter pattern:
- **ntfy.sh** (default, zero infrastructure) — HTTP POST to a topic.
- **SMTP** (fallback) — plain email to the founder's address.
- **APNs / Firebase** (when native mobile wrapper ships) — push notifications.

The adapter reads the Router's notification policy (push immediately / silent / daily digest) and acts accordingly. Daily digests are assembled by a routine on the assistant.

### 2.10 Observability Adapter

**What it is.** Every harness call, tool invocation, skill load, inbox message, and state transition emits a span through this adapter.

**Technology.**
- **Console** (default) — structured logs to stdout.
- **No-op** — drops all events; useful for load tests and CI.
- **OpenTelemetry** (planned) — future integration for traces, evals, cost tracking.

Spans follow OpenTelemetry conventions. The adapter translates into whatever the backend expects.

---

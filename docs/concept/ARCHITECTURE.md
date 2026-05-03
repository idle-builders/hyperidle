# HyperIdle — Architecture Document

Version 0.2 — April 2026

This document describes the parts of HyperIdle, how they interface with each other, and the technologies underneath them. It is the companion to REQUIREMENTS.md (what the system must do) — this document captures how.

---

<!-- @anchor: system-overview -->
## 1. System Overview

HyperIdle is a meta layer that sits between agent harnesses (which run agents) and human interfaces (which present work). It does not call models, execute tools, or manage conversations — those are harness responsibilities. HyperIdle manages the organizational structure: who works on what, what they know, how they coordinate, and how humans stay in the loop.

```
┌─────────────────────────────────────────────────────────────────┐
│                     HUMAN INTERFACE                              │
│  The Factory (PWA + optional Tauri shell)                       │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────────┐   │
│  │Conversa-  │ │ Rail     │ │ Work      │ │ Knowledge       │   │
│  │ tions     │ │ (HUD)   │ │ (Bets,    │ │ (Wiki)          │   │
│  │ (Review,  │ │          │ │  Tasks)   │ │                 │   │
│  │  Chat,    │ │          │ │           │ │                 │   │
│  │  Coach)   │ │          │ │           │ │                 │   │
│  └─────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬──────────┘   │
│        │            │             │               │              │
│        └────────────┴──────┬──────┴───────────────┘              │
│                            │                                     │
│                     ┌──────┴──────┐                               │
│                     │  API Layer  │                               │
│                     └──────┬──────┘                               │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                     META LAYER                                    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Router       │  │ Scheduler    │  │ Knowledge Fabric       │  │
│  │              │  │              │  │                        │  │
│  │ Items →      │  │ Routines,    │  │ L0 Session (TOON)     │  │
│  │ Views        │  │ Rhythms,     │  │ L1 Task (SQLite)      │  │
│  │              │  │ Dependency   │  │ L2 Product (md+SQLite) │  │
│  │              │  │ watcher      │  │ L3 Practice (SQLite)   │  │
│  │              │  │              │  │ L4 Factory (markdown)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘  │
│         │                 │                     │                 │
│  ┌──────┴─────────────────┴─────────────────────┴──────────────┐ │
│  │                   Primitive Store                            │ │
│  │  Bets · Tasks · Sessions · Teams · Routines · Inbox · Items │ │
│  │                     (SQLite)                                │ │
│  └─────────────────────────┬───────────────────────────────────┘ │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                     AGENT RUNTIME                                 │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Workspace    │  │ Harness      │  │ Observability        │    │
│  │ Adapter      │  │ Adapter      │  │ Adapter              │    │
│  │              │  │              │  │                      │    │
│  │ Docker/E2B/  │  │ Claude SDK/  │  │ Langfuse/LangSmith/  │    │
│  │ Daytona/Git  │  │ Letta/Goose/ │  │ no-op                │    │
│  │              │  │ OpenHands    │  │                      │    │
│  └──────────────┘  └──────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

The layering is strict. Arrows point down (dependency direction). The Human Interface depends on the Meta Layer. The Meta Layer depends on the Agent Runtime adapters. No layer reaches past its neighbor.

---

<!-- @anchor: components -->
## 2. Components

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
          state, workspace_snapshot, cost, outcome, notes)

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
-- coach" are NOT thread types — they are message shapes (review,
-- questionnaire, plain) and thread configurations (DM/coach/feed).
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
       -- `kind` (review/chat/coach) is intentionally absent — the founder
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
agents (id, name, soul_prompt_path, team_id, role, skills, status,
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

-- File leases
file_leases (id, agent_id, file_path, acquired_at, released_at)
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
IF kind == coach                             → Coach thread (pinned)
IF verb == prioritize                        → Rail
IF verb == bet                               → Work
IF verb == curate                            → Knowledge
ELSE                                         → Rail (catch-all)
```

**Founder routing.** When the target is Conversations, the Router also decides which founder receives the item based on domain (see AGENT_LAYER §7). Market/growth/portfolio → CEO; product/design/tech/content → CPO; strategic → both.

**Interfaces.** Input: an Item object. Output: a routing decision (target view + notification policy + recipient founder(s)). The API Layer reads routing decisions to know which view gets which items.

### 2.3 Scheduler

**What it is.** Three functions in one component:

1. **Routine Scheduler** — fires calendar/event/heartbeat triggers and starts sessions for the right agents (with delegation logic when owner is overloaded). Supports silent routines: when `routine.silent == true`, the session runs, writes to memory, and produces no Item.
2. **Dependency Watcher** — watches task state transitions and notifies owners when dependencies are met.
3. **Model Tier Selector** — picks the model tier (Reasoning / Workhorse / Fast) for each new session based on: task risk_tier, routine type (sleep-time → Fast), factory cost posture, and explicit skill overrides.

**Technology.** A background worker running in the same Bun process as the API server. Uses `setInterval`-based polling against SQLite + EventBus-triggered routines (`packages/server/src/services/routine-scheduler.ts`). For VPS/cloud profiles: optionally backed by BullMQ for distributed job scheduling.

The scheduler does not call models. It reads the Primitive Store, evaluates trigger conditions, selects the model tier, and emits events (which the Harness Adapter picks up to actually start agent sessions).

**Cost monitoring.** The Cost Sentinel is a heartbeat routine owned by the Chief of Staff (not a subsystem of the Scheduler). It runs on the same scheduling infrastructure as every other routine. Cost caps are nested: agent < team < factory. Each level has a configurable budget (default: daily cycle). The Sentinel monitors burn rate at all three levels. When any cap is approached, it creates a review thread item. When a team cap is reached, that team stops (agents finish in-progress sessions, no new work). When the factory cap is reached, all teams stop. It emits `cost_cap_warning` and `cost_cap_breached` events (scoped to agent/team/factory) that the Scheduler uses to pause work and downgrade model tiers.

**Interfaces.**
- Reads: `routines`, `tasks` (dependency graph), cost totals from `sessions`.
- Writes: new `sessions` (via Harness Adapter), new `items` (dependency-met notifications).
- Emits: `routine_fired`, `dependency_met`, `cost_ceiling_breached` events to the Event Bus.

### 2.4 Knowledge Fabric

**What it is.** The sync layer between one canonical knowledge store and two client types (humans via web UI, agents via file workspaces). Full design in KNOWLEDGE_ARCHITECTURE.md §4–7.

**Core architecture.** All knowledge lives in a single `knowledge_items` table in the same SQLite database as the Primitive Store. The Knowledge Fabric projects this store into two formats: a rich API for the human-facing Knowledge view, and materialized file workspaces for agent sessions. Sync is continuous — materialization at session start, then a file watcher on `knowledge/` and `work/` directories writes back changes incrementally as the agent works. Optimistic concurrency with per-field last-writer-wins for rare conflicts. No dependency on a clean session-end hook.

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

**Agent workspace projection.** When a session starts, the materialization engine queries `knowledge_items` for the relevant slice and writes files to the agent's workspace in three zones: `context/` (read-only reference material), `work/` (session scratch), `knowledge/` (proposed knowledge changes). A hidden `.fabric/manifest.json` tracks versions for conflict detection at writeback.

**Human projection.** The API layer reads from `knowledge_items` and serves the Knowledge view (practice scope via `layer='L3'`, product scope via `layer='L2'`, factory scope via `layer='L4'`). Edits write directly to SQLite with version checks.

**Materialization budget.** The fabric applies relevance scoring (task match, role match, recency, confidence, usage frequency) and a token budget to limit what gets loaded into each session. See KNOWLEDGE_ARCHITECTURE.md §7.

**Semantic search (optional).** For deployments needing cross-product knowledge search ("how did we handle CSV import before?"):
- Default: SQLite FTS5 (full-text search) on `knowledge_items`. Zero extra infrastructure.
- Scale option: Postgres + pgvector. Same schema, vector embeddings added as a column.

**Interfaces.**
- `materialize(session_id, task, agent, product, role) → workspace_path` — builds the agent workspace.
- `writeback(session_id, workspace_path) → list[change]` — diffs the workspace and writes changes back.
- `read_knowledge(layer, filters) → list[items]` — API for the Knowledge view.
- `write_knowledge(item_id, changes, expected_version) → result` — optimistic write for the Knowledge view.
- `promote(item, from_layer, to_layer)` — facilitators call this to promote knowledge upward.
- `score_attention(item) → float` — computes the attention score for a knowledge item.
- `resolve_conflict(conflict_id, resolution)` — facilitators or humans resolve version conflicts.

### 2.5 API Layer

**What it is.** A thin HTTP API that the Human Interface (the Factory app) talks to. It exposes reads and writes on the Primitive Store, filtered by human identity and routed by the Router.

**Technology.** Hono (TypeScript) running on Bun. Runs as a single process alongside the Scheduler (`packages/server/`). For the laptop profile, this is the only server process.

**Key endpoints (REST or WebSocket):**

```
# Conversations
GET    /conversations                  → list threads for this human
GET    /conversations/:id              → thread detail with items
POST   /conversations/:id/respond      → submit a Response (verdict, comment, etc.)

# Rail
GET    /rail                          → current Rail state (bets, blockers, cost, unread count)
WS     /rail/stream                   → real-time Rail updates via WebSocket

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

**Real-time updates.** WebSocket connection for the Rail and for new Thread items. The API Layer subscribes to the Event Bus and pushes relevant events to connected clients.

### 2.6 Event Bus

**What it is.** An in-process pub/sub system that connects components without tight coupling. Every state change in the Primitive Store emits an event; other components subscribe to the events they care about.

**Technology.** For laptop/VPS profiles: an in-process TypeScript `EventBus` class (`packages/shared/src/event-bus.ts`) with synchronous delivery and type-safe subscriptions. No external message broker needed. For cloud profiles that need distributed event delivery: Redis pub/sub or NATS. The adapter pattern makes this a config choice.

**Key event types:**

```
task_state_changed       → Dependency Watcher, Router, Rail updater
item_created             → Router, Notification Adapter, UI push
response_recorded        → Knowledge Fabric (close the loop), Harness Adapter (unblock agent)
session_started          → Cost meter, Observability
session_ended            → Cost meter, Task updater, Memory writer
routine_fired            → Harness Adapter (start session)
cost_ceiling_breached    → Scheduler (pause non-essential, downgrade tiers)
bet_committed            → Team notifier, Rail updater
bet_shipped              → Retro trigger, Practice updater
bet_revised              → Audit log, Rail updater
```

### 2.7 Harness Adapter

**What it is.** The boundary between HyperIdle and the agent runtime. A thin adapter per supported harness that translates HyperIdle's "start a session for this agent on this task" into the harness's native API.

**Technology.** One TypeScript module per harness (`packages/shared/src/harness/`). Each implements a common interface:

```typescript
interface HarnessAdapter {
  startSession(params: {
    agent: AgentConfig;       // soul, skills, identity
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
- **Claude Agent SDK** (launch adapter) — uses the Anthropic Claude Agent SDK for subagent spawning, bash + file tools, skill loading.
- **Letta** (planned) — uses Letta's agent server with tiered memory.
- **Goose** (planned) — uses Goose's local-first CLI.
- **OpenHands** (planned) — uses OpenHands' SDK.

The adapter also handles:
- Injecting credentials into the workspace environment.
- Logging every tool invocation into the Observability Adapter.
- Catching session crashes and writing recovery state (session notes) to the task.
- **Pre-compaction trigger.** Where the harness supports it (via token counting, context-window signals, or harness-specific APIs), the adapter fires a trigger that prompts the agent to do a final note-writing pass before the session ends. Not all harnesses expose this — for those that don't, the agent's continuous note-writing habit (writing to `work/session-notes.md` throughout the session) is the fallback.
- Mapping the `model_tier` to the deployer-configured actual model.

### 2.8 Workspace Adapter

**What it is.** Abstraction over where agents physically run. Each workspace is an isolated environment with file access, shell access, and installed tools.

**Technology.** One module per workspace type:

```typescript
interface WorkspaceAdapter {
  spawn(config: WorkspaceConfig): Promise<WorkspaceRef>;
  exec(ref: WorkspaceRef, command: string): Promise<ExecResult>;
  read(ref: WorkspaceRef, path: string): Promise<Buffer>;
  write(ref: WorkspaceRef, path: string, data: Buffer): Promise<void>;
  snapshot(ref: WorkspaceRef): Promise<SnapshotRef>;
  destroy(ref: WorkspaceRef): Promise<void>;
}
```

**Supported workspaces:**
- **Docker + gVisor** (default for laptop/VPS) — a container per agent session.
- **E2B Desktop Sandbox** (managed cloud) — Firecracker-based VM per session.
- **Daytona** (self-hosted cloud) — workspace sandbox per agent.
- **Git repo** (minimal) — the workspace is a directory; "spawn" is `git worktree add`.

### 2.9 Notification Adapter

**What it is.** Translates routing decisions with push=true into actual notifications on the founder's devices.

**Technology.** Adapter pattern:
- **ntfy.sh** (default, zero infrastructure) — HTTP POST to a topic.
- **SMTP** (fallback) — plain email to the founder's address.
- **APNs / Firebase** (when native mobile wrapper ships) — push notifications.

The adapter reads the Router's notification policy (push immediately / silent / daily digest) and acts accordingly. Daily digests are assembled by a routine on the Chief of Staff.

### 2.10 Observability Adapter

**What it is.** Every harness call, tool invocation, skill load, inbox message, and state transition emits a span through this adapter.

**Technology.**
- **No-op** (default for laptop) — logs to a local file.
- **Langfuse** (self-hosted) — one `docker compose up` for traces, evals, cost tracking.
- **LangSmith / Helicone** (managed) — zero-ops, paid.

Spans follow OpenTelemetry conventions. The adapter translates into whatever the backend expects.

---

<!-- @anchor: the-human-interface-the-factory -->
## 3. The Human Interface: The Factory

### 3.1 Technology Stack

**Framework.** React (TypeScript) with **Tailwind CSS + DaisyUI** and a custom `factory-dark` theme, plus `focus-trap-react` and `@floating-ui/react` for behavior gaps. See `UI_DESIGN.md` for the canonical component tree (5 Primitives + 6 Blocks + 8 Regions = 19 custom components total, built on the DaisyUI primitive set). One codebase serving both desktop and mobile via responsive layout.

**Rendering.** Shell is `IconRail | Submenu | Main | Rail`. Per view:
- **Conversations view:** Main renders `ReviewHeader + ArtifactView` (one of 5 shapes: `text_diff`, `content_preview`, `visual_comparison`, `action_summary`, `data_metrics`) + composer. Supports the full verdict grammar (approve / approve with comments / comment / inline comment / request changes / edit / reject / reply / snooze / escalate). Submenu renders a list of `ThreadRow`s.
- **Rail:** the sole notification surface, subscribing to the WebSocket event stream. Collapsed = stacked `NavItem`s with counts per category. Expanded = grouped `NotificationRow`s. No top-bar bell, no global toasts.
- **Work view:** Main renders `Canvas` (two-column shaped / committed with hard capacity cap — no spatial canvas, just `BetCard`s with a limit) plus `Kanban` (four columns of `TaskCard`s) for Level 2. The `Kanban` is swapped for `PitchSelector` (list of `PitchCard`s) when the `+` slot on the `Canvas` is clicked. Level 1 is a portfolio grid of `BetCard`s; Level 3 is Bet Detail composed of `KeyValue`s + linked `TaskCard`s / `KnowledgeRow`s / `NotificationRow`s.
- **Knowledge view:** Submenu renders a `SearchField` + filter `Tag`s + list of `KnowledgeRow`s. Main renders item detail with inline markdown edit. Drag-and-drop merge/split via `modal`.

**Desktop shell.** Two options (deployer choice):
- **Browser tab** (default) — the PWA runs in any modern browser. Zero install.
- **Tauri wrapper** (optional) — delivers OS-native notifications, tray icon, and the "always open on a side screen" behavior. Single binary distribution. Rust backend is thin — it's just a shell around the web app.

**Mobile.** The same React app, responsive-layout-shifted into three tabs (Home, Conversations, Work). Wrapped in Capacitor (or equivalent) only if push notifications require native APIs.

### 3.2 Data Flow

```
User opens Factory app
  → WebSocket connects to /rail/stream (ambient updates)
  → GET /conversations (initial conversation list)
  → GET /rail (initial rail state)

User opens a thread
  → GET /conversations/:id (full thread with items)
  → Items render with verdict buttons

User submits a verdict
  → POST /conversations/:id/respond (Response object)
  → API writes Response to Primitive Store
  → Event emitted: response_recorded
  → Harness Adapter picks up the event → unblocks the agent
  → Knowledge Fabric picks up the event → updates attention scores
  → Thread list refreshes via WebSocket push
```

### 3.3 Offline / Degraded Mode

The Factory app is a PWA with a service worker. In offline mode:
- The Rail shows the last-known state (cached).
- Conversations are readable from cache.
- Responses queue locally and sync when connectivity returns.
- Work is read-only offline.

---

<!-- @anchor: key-interfaces-between-components -->
## 4. Key Interfaces Between Components

### 4.1 Agent → Meta Layer (via skills)

Agents interact with HyperIdle through skills that wrap the meta layer's APIs:

```
read_inbox()              → GET /agents/:id/inbox
send_message(to, msg)     → POST /agents/:to/inbox
log_task(task_id, msg)    → PATCH /tasks/:id (append to notes)
query_practice(topic)     → GET /knowledge/l3/:community?q=topic
write_memory(layer, k, v) → POST /knowledge/:layer
handoff_to(agent, msg)    → POST /tasks/:id/handoff
create_item(item)         → POST /items (surfaces to human)
write_session_notes(notes) → PATCH /sessions/:id (called before context compaction)
```

These are thin wrappers — they call the API Layer directly via HTTP or, in a single-process deployment, via function call.

### 4.2 Meta Layer → Harness (via Harness Adapter)

When the Scheduler determines an agent should start a session (routine fired, dependency met, inbox message arrived):

```
1. Scheduler emits event
2. Scheduler selects model tier based on task risk_tier + routine type + cost posture
3. Harness Adapter receives event
4. Adapter calls Knowledge Fabric: build_session_context(agent, task) → TOON pack
5. Adapter calls Workspace Adapter: spawn(config) or reuse existing workspace
6. Adapter calls Harness: start_session(agent, context, task, workspace, model_tier)
7. Harness runs the agent (model calls, tool use — all inside the harness)
8. Agent uses skills to interact with meta layer (inbox, memory, items, task notes)
9. Session nears context compaction → agent writes session notes to task
10. Session ends (compaction imminent, task done, or explicit stop)
11. Adapter calls: stop_session → SessionResult
12. Adapter writes session result to Primitive Store
13. Event emitted: session_ended
```

### 4.3 Meta Layer → Human Interface (via API + Events)

The API Layer serves the Factory app. State flows in two directions:

**Down (meta → UI):** Items, thread updates, Rail state, Work data (bets + tasks), Knowledge trees. Delivered via REST endpoints (initial load) and WebSocket (real-time updates).

**Up (UI → meta):** Responses (verdicts, comments, edits), Work actions (commit bet, kill pitch, revise bet), Knowledge actions (merge, split, flag, archive), Rail actions (nudge, acknowledge).

### 4.4 Facilitator → Router → Human Interface

Facilitators are agents, but their output is special: they produce Items that need routing to the right human view. The flow:

```
1. Facilitator (running as an agent session) creates an Item via create_item()
2. Item is written to Primitive Store
3. Event: item_created
4. Router evaluates the Item's characteristics → routing decision
5. Router determines recipient founder(s) based on domain
6. Routing decision stored on the Item (target view, notification policy, recipient)
7. Notification Adapter fires if push is required
8. API Layer pushes the Item to connected clients via WebSocket
9. Factory app renders the Item in the target view
```

---

<!-- @anchor: technology-summary -->
## 5. Technology Summary

| Component | Default Technology | Scale Alternative |
|-----------|--------------------|-------------------|
| Primitive Store | SQLite (`hyperidle.db`) | Postgres |
| Knowledge (all layers) | SQLite (`knowledge_items` table in `hyperidle.db`) | Postgres + pgvector |
| Knowledge exports (human-readable) | Git repo (markdown exports from SQLite) | Same |
| Session context | TOON format ([github.com/toon-format/toon](https://github.com/toon-format/toon)) | Same |
| API Layer | Hono (TypeScript/Bun) | Same + load balancer |
| Event Bus | In-process EventBus (TypeScript) | Redis pub/sub or NATS |
| Scheduler | setInterval + EventBus + SQLite polling | BullMQ / Temporal |
| Harness (default) | Claude Agent SDK | Letta, Goose, OpenHands |
| Workspace (default) | Docker + gVisor | E2B, Daytona |
| Human Interface | React + TypeScript PWA | Same |
| Desktop shell | Browser tab (default) / Tauri (optional) | Same |
| Canvas (bet placement) | React DnD (or similar drag-and-drop) | — |
| Notifications | ntfy.sh / SMTP | APNs, Firebase |
| Observability | No-op / local file | Langfuse, LangSmith |
| Auth | API keys + Tailscale | OAuth / passkeys |
| Version control | Git (for markdown artifacts) | Same |

### Language choices

**TypeScript** for the entire stack (meta layer + frontend). The meta layer (API, Scheduler, Adapters, Knowledge Fabric) runs on **Bun** with **Hono** as the HTTP framework. Reasons: single language across the monorepo, Bun's native SQLite driver, Drizzle ORM for type-safe queries, and the agent ecosystem's TypeScript SDK support (Claude Agent SDK).

**TypeScript + React** for the Factory app (frontend). Reasons: Tailwind + DaisyUI compose cleanly with React, the PWA ecosystem is TypeScript-native, and sharing types with the server eliminates API contract drift.

**No Rust, Go, or Java in the core.** Tauri is Rust under the hood but we treat it as a shell, not a development surface. The meta layer runs efficiently on Bun's optimized JavaScript runtime.

---

<!-- @anchor: deployment-architecture -->
## 6. Deployment Architecture

### 6.1 Laptop Profile

Everything runs on one machine. Single process for the API + Scheduler. Docker containers for agent workspaces. SQLite for all storage.

```
MacBook / Linux laptop
├── hyperidle (Bun process)
│   ├── Hono API server (localhost:3001)
│   ├── Scheduler (in-process)
│   ├── Event Bus (in-process)
│   └── SQLite database
│       └── hyperidle.db (primitives + knowledge_items)
├── Docker (agent workspaces)
│   ├── container: nimmly-builder-session-42
│   └── container: nimmly-growth-session-43
├── Git repo (markdown artifacts)
│   ├── factory/ (PRINCIPLES.md, FOCUS.md, ...)
│   └── products/nimmly/ (BRIEF.md, ARCHITECTURE.md, ...)
└── Browser → http://localhost:5173 (the Factory)
```

Install: `bun install && bun run db:migrate && bun dev`

### 6.2 VPS Profile

Same architecture, but the VPS is always on. Tailscale for secure remote access. Optional: Langfuse container for observability.

```
VPS (Ubuntu, 4+ cores, 8+ GB RAM)
├── hyperidle (systemd service)
├── Docker (agent workspaces)
├── Tailscale (network access)
├── Langfuse (docker compose, optional)
└── Nginx reverse proxy (for HTTPS)
```

The Factory app is accessed via `https://factory.tailscale-hostname:443` from any device.

### 6.3 Cloud Profile

Workspaces run on E2B or Daytona. The meta layer runs on a small VM or container. Postgres replaces SQLite for the Primitive Store.

```
Cloud (AWS/GCP/Hetzner)
├── VM: hyperidle (API + Scheduler)
├── Postgres (Primitive Store + Knowledge)
├── E2B / Daytona (agent workspaces)
├── Redis (Event Bus, optional)
└── Managed observability (LangSmith / Helicone)
```

---

<!-- @anchor: data-flow-examples -->
## 7. Data Flow Examples

### 7.1 A Bet Ships

```
1. Builder agent completes final task → session ends, task → "done"
2. Dependency Watcher: all tasks for Bet-17 are done
3. Product Manager's routine fires: "check bet done condition"
4. Product Manager confirms done condition met
5. Product Manager creates Item: bet review thread
   (kind: review, risk_tier: high, body: summary of what shipped)
6. Router: risk_tier ≥ medium → Conversations + push notification
7. Router: product scope → route to CPO
8. Notification Adapter: push to CPO's phone
9. CPO opens thread, reads summary, approves
10. Response recorded → bet status → "shipped"
11. Retro routine fires on Product Manager
12. Product Manager writes retro, routes to Practice + Coach thread
```

### 7.2 An Agent Gets Stuck

```
1. Builder agent hits a question it can't resolve → creates a chat thread Item
   (kind: chat, flagged_urgent: true, body: "Stripe webhook keys missing")
2. Router: chat + urgent → Conversations + push notification
3. Router: technical scope → route to CPO
4. CPO opens thread on phone, replies with the key location
5. Response → message delivered to Builder's inbox
6. Builder starts new session, reads reply, continues
```

### 7.3 A Practice Learns Something (the contribution loop)

```
1. Nimmly Builder discovers chunked upload >10MB works better
2. Builder logs finding to task notes at session end (before context compaction)
3. At next practice meeting (weekly routine on Build Practice Facilitator):
   a. Facilitator collects findings from all Builders across all products
      (each Builder contributes findings accumulated since the last meeting)
   b. Builders and Facilitator discuss — is this worth keeping?
   c. Facilitator creates practice item: "chunked upload for files >10MB"
      (status: CAPTURED, attention_score computed)
4. Score is moderate → doesn't surface to human in Knowledge view immediately
5. Two weeks later, Ambrovia Builder independently discovers the same thing
6. At next practice meeting, Facilitator: repetition signal → promotes to VALIDATED
7. Practice item is now ACTIVE and available in L3
8. Next time any Builder starts a task session:
   a. L0 Session Builder queries L3 for relevant patterns
   b. This pattern matches the task type → included in the TOON pack
   c. The Builder has the knowledge without anyone pushing a notification
```

### 7.4 A Bet Changes Mid-Flight

```
1. Nimmly team is two weeks into a 6-week bet
2. Growth Agent discovers via analytics that the target audience uses
   the product differently than hypothesized
3. Growth Agent posts finding to task notes + contributes to next practice meeting
4. Product Manager notices the trajectory has shifted:
   the hypothesis is no longer valid
5. Product Manager drafts a bet revision:
   - New hypothesis: "SME buyers use the comparison tool for due diligence,
     not initial screening"
   - Revised done condition: adjust acceptance criteria for due-diligence flow
   - Reasoning: cites the Growth Agent's analytics data
6. Product Manager creates Item: bet revision review thread
   (kind: review, risk_tier: high)
7. Router → Conversations + push notification → both founders (strategic)
8. Founders discuss in the thread, approve with comments
9. Response recorded → bet.revision_log appended → hypothesis and done_condition updated
10. Team adjusts task graph accordingly (internal, no additional human review
    unless the Product Manager's judgement says otherwise)
```

### 7.5 A Sleep-Time Routine Runs

```
1. Brand Voice agent has a silent routine: "every 6 hours, summarize
   new copy artifacts across all products into memory"
2. Scheduler fires the routine (silent: true)
3. Model tier selected: Fast (sleep-time routine)
4. Session starts, agent queries for new copy artifacts since last run
5. Agent summarizes patterns into its own L2 memory
   ("Nimmly shifted to more formal tone this week; Ambrovia added humor")
6. Session ends → session_ended event → cost logged
7. No Item created, no thread, no notification
8. Next time Brand Voice agent reviews copy in a task session,
   its L0 context pack includes the updated memory — it's current
   without anyone having pushed an update
```

### 7.6 Cross-Team Work

```
1. Nimmly Product Manager's bet needs a new billing webhook
2. Nimmly PF opens a chat thread to Platform Team lead:
   "We need a billing webhook for subscription changes.
    Appetite: 3 days of Platform work."
3. Platform lead agrees → creates a cross-team task on Nimmly's bet
   (owner: Platform Builder, cross_team: true)
4. Platform Builder starts sessions on the task, works it in Platform's rhythm
5. Task completes → artifact ready → task → "done"
6. Nimmly bet's dependency resolves → Nimmly team continues
7. Cross-team task is visible in Nimmly's bet thread and in the Rail
```

---

<!-- @anchor: what-this-architecture-does-not-include -->
## 8. What This Architecture Does Not Include

- **A model-calling loop.** That's the harness.
- **A workflow engine or DAG executor.** Sequences emerge from task dependencies and handoffs.
- **MCP servers or protocol adapters.** Skills call CLIs and APIs directly.
- **A vector database.** pgvector on Postgres handles semantic search when needed; SQLite FTS5 is the default.
- **A separate auth service.** Tailscale + API keys for now.
- **A backlog.** Pitches live on the canvas; unpicked ones expire.
- **Multiple applications.** One app, two form factors.
- **Jira-style reporting.** The Rail and Coach thread are the human surfaces for status.

---

<!-- @anchor: decisions -->
## 9. Decisions

### Resolved

- **TOON format specification.** Using the existing TOON spec at [github.com/toon-format/toon](https://github.com/toon-format/toon). ~40% token savings over JSON for structured agent context packs.
- **Practice "meeting" mechanics.** Three-turn conversation: (1) all agents propose findings, (2) all agents react with context and relevance, (3) Practice Facilitator synthesizes — routing items to practice L3 or product L2 as appropriate. Not all findings become practice knowledge.
- **Session note quality.** No rigid template. LLMs write good prose; what matters is flight-level guidance on what to write about (goal, outcome, changes, next steps, hazards). The skill package provides defaults; the meta layer doesn't parse notes structurally.
- **Context compaction detection.** Continuous session notes throughout the session (agent writes to `work/session-notes.md` as it works). Pre-compaction trigger where the harness supports it (part of the Harness Adapter contract). Token-counting heuristic as fallback.
- **Hot-reload for skills.** Next session picks it up. No mid-session propagation needed.
- **Desktop shell.** Web-first. No Tauri, no PWA wrapper. Plain web app served by the API process. Native apps or PWA can be added later if needed.
- **Mobile strategy.** Start online-first with a responsive web app. No dedicated native app or offline-first PWA in v1.
- **Canvas (bet placement) tech.** Simple symbolic UI — not an actual canvas or drag-and-drop zone. A two-column layout (shaped / committed) with a hard capacity cap, rendered as `BetCard`s. Standard React components, no canvas library needed.
- **Scheduler architecture.** Single-process (Bun event loop). API server and Scheduler share one process. Materialization and session-start calls run as async tasks so the event loop isn't blocked. **Scaling note:** if measured latency degrades under load, extract Scheduler to its own process communicating via Event Bus. Monitor for this.
- **No external framework integrations in the meta layer.** No Letta, no Agent Mail, no Temporal, no Inngest. All agentic integrations happen through the Agent Runtime layer (Harness Adapters). The meta layer stays minimal: SQLite, TypeScript/Bun, the Knowledge Fabric, and the Hono API. Complex dependencies are avoided as long as possible.
- **Laptop minimum install.** Bun + Docker + Claude API key. 10-minute install bar for anyone.
- **Cross-product routine ownership.** Chief of Staff owns routines that observe patterns across products (e.g., portfolio-level Cost Sentinel).
- **Knowledge Fabric sync.** Continuous writeback via file watcher is the v1 design — no session-boundary dependency. The file watcher on `knowledge/` and `work/` directories writes back changes incrementally (500ms debounce), with WebSocket push to open Knowledge view tabs. See KNOWLEDGE_ARCHITECTURE.md §5.
- **Notifications.** TBD during development. Will need some notification adapter; specific technology (ntfy.sh, SMTP, push API) decided at implementation time.
- **Cost hierarchy: agent < team < factory.** Strictly nested. Each level has a configurable cost cap (default: daily cycle). When a team cap is reached, the team stops. When the factory cap is reached, everything stops. Critical ops tasks finish in-progress sessions but cannot start new ones. Smart defaults: equal splits across agents. See PROCESS_LAYER.md §10.
- **Autonomy: per-agent-per-skill.** Each agent–skill combination has its own autonomy level (L1–L4). Effectively per-team-per-skill since the same skill in different products needs different oversight. Tracked in `agent_skills` table.
- **Task dependencies: hold state.** Tasks with unmet upstream dependencies go to `hold`. The Dependency Watcher auto-transitions to `accepted` when upstream clears. Distinct from `blocked` (runtime blocks). See PROCESS_LAYER.md §6.1.
- **Knowledge layer precedence: L4 > L3 > L2 > L1.** Higher layers are more absolute. Contradictions between layers are flagged at materialization time. See KNOWLEDGE_ARCHITECTURE.md §6.3.
- **Edit log for facilitator learning.** Every human edit logged in `knowledge_edit_log`. Serves as training signal for improving facilitator proposals over time.
- **A2A-inspired handoff protocol.** Structured handoff messages with context IDs, task states (working/completed/failed/canceled), reason codes, and artifact references. JSON format for all inter-agent communication; TOON reserved for context packs. See PROCESS_LAYER.md §8.
- **Attention scores: Rail & notifications, not Knowledge view.** The Knowledge view provides access to all knowledge. Attention scores drive what surfaces in the Rail and what triggers notifications — they don't filter the Knowledge view.
- **Facilitators are not a SPOF.** Practice facilitation is an async self-improvement knowledge loop. It never interferes with normal task execution. If a facilitator is down or slow, agents keep working — they just don't get new practice updates until the next materialization.
- **Knowledge misses are acceptable.** Agents will miss relevant knowledge sometimes. This is a feature, not a bug — it's part of how new approaches are discovered. The system optimizes for relevance at materialization time but doesn't guarantee completeness.
- **Paused routines when cost cap hit.** When a cost cap is reached, the heartbeat won't trigger for paused routines — they're simply skipped until the budget resets.
- **PostgreSQL as SQLite alternative.** SQLite is the default. PostgreSQL must be ready as an alternative for deployments that exceed SQLite's comfort zone (~50 concurrent writers, or when WAL mode write throughput becomes a bottleneck). **Scaling threshold:** when the factory has >50 agents with overlapping sessions, or when the Knowledge Fabric's continuous writeback creates sustained >100 writes/sec, switch to PostgreSQL. The same schema applies; the adapter pattern in the Primitive Store extends to `knowledge_items`.

### Deferred — Decide During Development

- **Heartbeat granularity for routines.** Minimum resolution roughly hourly, not sub-minute. Exact granularity determined during implementation.
- **Daytona Custom Regions.** Parked. Relevant when addressing self-hosted deployment profiles, not before.

---

*This document captures how the system is built — the companion REQUIREMENTS.md captures what it must do.*

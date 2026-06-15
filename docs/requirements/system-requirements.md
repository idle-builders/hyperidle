## 4. System Requirements

### S-1: Deployment

**S-1.1** The system ships as a native macOS desktop app (Electron) with the API server embedded in-process. Install via `brew install --cask hyperidle` or DMG download. No Docker, no separate server process.

**S-1.2** A founder must be able to install HyperIdle and reach the Factory shell in under 2 minutes — download, double-click, complete SetupFlow (name, email, first product, optional API key).

**S-1.3** The development environment runs via `npm install && npm run dev` (Node 20+). Production uses `@hono/node-server` bundled by esbuild into the Electron main process.

### S-2: Data Storage

**S-2.1** Primary storage: SQLite via `better-sqlite3` at `~/Library/Application Support/HyperIdle/hyperidle.db`. One database file per factory instance. Swappable to Postgres for deployments exceeding ~50 agents.

**S-2.2** Human-readable artifacts (briefs, principles, reflections): stored as rows in `knowledge_items` with format `markdown`. Exported to Git-versioned directories for version history and external access. Git is the backup and audit trail, not the source of truth.

**S-2.3** Semantic search (optional): Postgres + pgvector for cross-product querying at scale. SQLite FTS5 on `knowledge_items` as the lightweight default.

**S-2.4** Session context packs: TOON format for ~40% token savings over JSON. Assembled by the Knowledge Fabric at session start.

**S-2.5** Knowledge Fabric sync: context assembly at session start (SQLite → workspace files), continuous writeback via file watcher during session (workspace diffs → SQLite updates, 500ms debounce). Optimistic concurrency via `version` column. Per-field last-writer-wins for structured data conflicts; facilitator review for prose conflicts. See KNOWLEDGE_ARCHITECTURE.md §5.

### S-3: Agent Runtime

**S-3.1** HyperIdle is a process layer, not an agent harness. It does not contain a tool-use loop or a model-calling loop. Those live in the harness.

**S-3.2** The system supports harnesses via a thin adapter interface: spawn an agent with a prompt/tools/skills, stream events, stop, read the conversation. Current harness: Claude Agent SDK via LocalSandboxAdapter (desktop gate).

**S-3.3** Workspaces are abstracted behind a thin interface: `spawn`, `exec`, `read`, `write`, `snapshot`, `destroy`. The desktop app uses LocalSandboxAdapter (filesystem-level isolation on the same machine).

**S-3.4** Model tier assignment happens at session creation time. The Scheduler picks the tier (Reasoning / Workhorse / Fast) based on task risk tier, routine type, and cost posture. The deployer configures which actual models map to each tier.

### S-4: Skills System

**S-4.1** Skills are packages containing a SKILL.md instruction file, bundled scripts (bash, Python, curl, CLI invocations), and resources (templates, schemas, examples). Skills call existing CLIs and APIs directly — no protocol layer, no MCP wrapper.

**S-4.2** Progressive disclosure: metadata in system prompt (~100 tokens per skill), SKILL.md on demand, resources on demand.

**S-4.3** Skills must be compatible with vanilla Claude Code SKILL.md format. If the process layer vanishes, skills keep working in bare Claude Code.

**S-4.4** Skill changes (new, edit, retire) always require human approval via review thread.

### S-5: Threads and Messaging

**S-5.1** All human↔agent and agent↔agent communication flows through the Thread primitive. Threads are append-only sequences of typed Messages (`plain`, `review`, `questionnaire`, `verdict`) attached to a host entity.

**S-5.2** Agents read/write threads via the API. Humans read/write threads via the Conversations view and HostThreadSection surfaces mounted on bets, tasks, knowledge items, and artifacts.

**S-5.3** Humans can initiate conversations with agents (RecipientPicker), not just respond to agent-initiated threads.

**S-5.4** The human inbox (Conversations view in the Factory) renders all threads where the human is a participant, filtered by blocking/async status.

### S-6: Scheduling and Rhythm

**S-6.1** The system supports four agent rhythms: heartbeat (cron), inbox-driven (event), continuous, and calendar-driven.

**S-6.2** Scheduling interface: `schedule(agent, trigger)` where trigger is heartbeat, inbox, continuous, or calendar.

**S-6.3** Minimum implementation: `cron` + SQLite + a background worker process. No dependency on Inngest, Temporal, or LangGraph.

**S-6.4** Durability is per-task and opt-in. Skills declare their durability requirement. Adapters ship for: none (default), checkpoint (harness-native), temporal (Temporal/Hatchet). Risk-tier high or runtime > 30 min defaults to temporal.

**S-6.5** Sleep-time routines (silent, memory-only runs) must be supported — the Scheduler fires the routine, the session runs, writes to memory, and produces no Item.

### S-7: Observability

**S-7.1** Every harness call, tool invocation, skill load, and inbox message emits a span through one adapter.

**S-7.2** Default adapter is console for minimal installs. OpenTelemetry integration is planned for production backends.

### S-8: Notification Delivery

**S-8.1** A notification adapter hooks the review-thread stream into push services. Supported: APNs, Firebase, ntfy, plain SMTP. Deployer chooses.

**S-8.2** Minimum viable notification: ntfy.sh or plain SMTP + a mobile email client.

### S-9: Cross-Cutting Data Model

**S-9.1** The Thread primitive (§4.5 of HUMAN_INTERFACE_LAYER) is the primary interaction data model. Threads carry typed Messages; views render threads filtered by participant, host, and blocking status.

**S-9.2** Human actions on review messages use the verdict grammar: `approve`, `approve-with-comments`, `request-changes`, `edit`, `reject` (binding verdicts that resolve the review), plus `comment`, `inline-comment`, `reply` (non-binding actions that append plain messages).

**S-9.3** The unified `users` table (with `kind: 'human' | 'ai'`) is the identity model. Review routing flows through `org_edges` (polymorphic: direct, function, or team targeting).

### S-10: Security and Isolation

**S-10.1** Agent workspaces are sandboxed. Agents cannot access other agents' workspaces directly; coordination happens through threads and shared knowledge stores.

**S-10.2** Credentials are stored encrypted (AES-256-GCM) in `server_credentials` for shared deployments, or via Electron `safeStorage` for desktop. Agents receive credentials injected into workspace environments; they never see or handle secrets directly.

**S-10.3** The desktop app runs on localhost only. Auth is via auto-generated API key injected by the Electron preload bridge. No public-internet exposure.

---

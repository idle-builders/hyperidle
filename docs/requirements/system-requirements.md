## 4. System Requirements

### S-1: Deployment Profiles

**S-1.1** The system must be deployable across four profiles from day one: laptop (Docker + gVisor or Git repo workspace), self-hosted VPS (Docker + gVisor or Daytona), managed cloud (E2B Desktop Sandbox or Modal), BYO cloud (Daytona when Custom Regions GA).

**S-1.2** A solo builder must be able to install and run HyperIdle on a MacBook in under 30 minutes with nothing beyond Python, SQLite, Docker, and a model API key.

**S-1.3** Switching deployment profiles is a configuration change, not a rebuild.

### S-2: Data Storage

**S-2.1** Primary storage: SQLite by default for all stores — process primitives (Bets, Tasks, Sessions, Teams, Routines, Inbox) and knowledge (`knowledge_items` table). One database file per factory instance. Swappable to Postgres for deployments exceeding ~50 agents.

**S-2.2** Human-readable artifacts (briefs, principles, reflections): stored as rows in `knowledge_items` with format `markdown`. Exported to Git-versioned directories for version history and external access. Git is the backup and audit trail, not the source of truth.

**S-2.3** Semantic search (optional): Postgres + pgvector for cross-product querying at scale. SQLite FTS5 on `knowledge_items` as the lightweight default.

**S-2.4** Session context packs: TOON format for ~40% token savings over JSON. Materialized by the Knowledge Fabric at session start.

**S-2.5** Knowledge Fabric sync: materialization at session start (SQLite → workspace files), continuous writeback via file watcher during session (workspace diffs → SQLite updates, 500ms debounce). Optimistic concurrency via `version` column. Per-field last-writer-wins for structured data conflicts; facilitator review for prose conflicts. See KNOWLEDGE_ARCHITECTURE.md §5.

### S-3: Agent Runtime

**S-3.1** HyperIdle is a meta layer, not an agent harness. It does not contain a tool-use loop or a model-calling loop. Those live in the harness.

**S-3.2** The system must support multiple harnesses via a thin adapter interface: spawn an agent with a prompt/tools/skills, stream events, stop, read the conversation. Supported harnesses at launch: Claude Agent SDK. Planned: Letta, Goose, OpenHands.

**S-3.3** Workspaces are abstracted behind a thin interface: `spawn`, `exec`, `read`, `write`, `snapshot`, `destroy`.

**S-3.4** Model tier assignment happens at session creation time. The Scheduler picks the tier (Reasoning / Workhorse / Fast) based on task risk tier, routine type, and cost posture. The deployer configures which actual models map to each tier.

### S-4: Skills System

**S-4.1** Skills are packages containing a SKILL.md instruction file, bundled scripts (bash, Python, curl, CLI invocations), and resources (templates, schemas, examples). Skills call existing CLIs and APIs directly — no protocol layer, no MCP wrapper.

**S-4.2** Progressive disclosure: metadata in system prompt (~100 tokens per skill), SKILL.md on demand, resources on demand.

**S-4.3** Skills must be compatible with vanilla Claude Code SKILL.md format. If the meta layer vanishes, skills keep working in bare Claude Code.

**S-4.4** Skill changes (new, edit, retire) always require human approval via review thread.

### S-5: Inbox and Messaging

**S-5.1** The inbox is a SQLite table (or Git-tracked message directory). Messages have: sender, recipient, thread, subject, body, attached file leases, timestamps.

**S-5.2** Agents read/write inboxes via `read_inbox` / `send_message` skills.

**S-5.3** File leases: when an agent modifies an artifact, it reserves a lease. Other agents see the lease and work elsewhere. Humans see leases in the inbox.

**S-5.4** The human inbox (Conversations view in the Factory) reads the same table, with humans as identities.

### S-6: Scheduling and Rhythm

**S-6.1** The system supports four agent rhythms: heartbeat (cron), inbox-driven (event), continuous, and calendar-driven.

**S-6.2** Scheduling interface: `schedule(agent, trigger)` where trigger is heartbeat, inbox, continuous, or calendar.

**S-6.3** Minimum implementation: `cron` + SQLite + a background worker process. No dependency on Inngest, Temporal, or LangGraph.

**S-6.4** Durability is per-task and opt-in. Skills declare their durability requirement. Adapters ship for: none (default), checkpoint (harness-native), temporal (Temporal/Hatchet). Risk-tier high or runtime > 30 min defaults to temporal.

**S-6.5** Sleep-time routines (silent, memory-only runs) must be supported — the Scheduler fires the routine, the session runs, writes to memory, and produces no Item.

### S-7: Observability

**S-7.1** Every harness call, tool invocation, skill load, and inbox message emits an OpenTelemetry-style span through one adapter.

**S-7.2** Default adapter is console for minimal installs. OpenTelemetry integration is planned for production backends.

### S-8: Notification Delivery

**S-8.1** A notification adapter hooks the review-thread stream into push services. Supported: APNs, Firebase, ntfy, plain SMTP. Deployer chooses.

**S-8.2** Minimum viable notification: ntfy.sh or plain SMTP + a mobile email client.

### S-9: Cross-Cutting Data Model

**S-9.1** Every item flowing through any view is the same shape (the Item schema from HUMAN_INTERFACE_LAYER §6): id, source (agent identity), layer, verb, kind, title, body, attachments, proposed_action, options, risk_tier, attention_score, blocking, reasoning, cost_estimate, audit_trail, timestamps.

**S-9.2** Every human action is the same shape (the Response schema): item_id, decision, inline_anchor, edits, feedback, approver, view, timestamp.

**S-9.3** These two schemas are the contract between the meta layer and the UI. The UI renders Items; the meta layer processes Responses.

### S-10: Security and Isolation

**S-10.1** Agent workspaces are sandboxed. Agents cannot access other agents' workspaces directly; coordination happens through the inbox and shared knowledge stores.

**S-10.2** Credentials are injected into workspace environments; agents never see or handle secrets directly.

**S-10.3** The Factory app is accessible only over Tailscale (or equivalent private network) by default. No public-internet exposure required.

---

# Track D: Agent Runtime

See `docs/work-packages/SHARED.md` for tech stack, shared contracts, and dependency graph.

---

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

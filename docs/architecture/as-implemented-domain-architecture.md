# As-Implemented Domain Architecture

Code-derived domain, component, and interface map. Each diagram shows domain ownership and the interfaces between domains; the component inventory below the diagrams is verified against `packages/` file-by-file.

## L0 - Domain Map

```mermaid
flowchart LR
  Interface["Human collaboration interface\nwork, conversations, knowledge, settings"]
  Coordination["Coordination domain\nteams, bets, tasks, routines"]
  Conversation["Conversation domain\nthreads, messages, reviews, artifacts"]
  Knowledge["Knowledge domain\nknowledge items, relevance, attention, writeback"]
  Session["Agent session domain\nsession lifecycle and execution"]
  Harness["Harness domain\nbuiltin, CLI, remote adapters"]
  Integration["Integration domain\nfilesystems, credentials, service connections"]
  Eventing["Domain event bus\nstate changes and push"]

  Interface -- "HTTP API + websocket topics" --> Coordination
  Interface -- "HTTP API + websocket topics" --> Conversation
  Interface -- "HTTP API" --> Knowledge
  Interface -- "HTTP API" --> Integration

  Coordination -- "session request\naccepted tasks, routines" --> Session
  Coordination -- "decomposition request" --> Harness
  Conversation -- "assistant turn request" --> Session
  Knowledge -- "context and prompt material" --> Session
  Session -- "run config and event stream" --> Harness
  Session -- "tool calls" --> Conversation
  Session -- "writeback and captures" --> Knowledge
  Session -- "mount/capture request" --> Integration

  Coordination -- "domain events" --> Eventing
  Conversation -- "domain events" --> Eventing
  Knowledge -- "domain events" --> Eventing
  Session -- "domain events" --> Eventing
  Eventing -- "dispatch, reviews, notifications,\nrelevance, lifecycle propagation" --> Coordination
  Eventing -- "thread/session/work updates" --> Interface
```

## L1 - Bounded Contexts And Public Interfaces

```mermaid
flowchart TB
  subgraph Coordination["Coordination Domain"]
    Team["Team membership"]
    Bet["Bet lifecycle"]
    Task["Task lifecycle"]
    Routine["Routine lifecycle"]
    CoordinationAPI["Interface\nteams, bets, tasks, routines APIs\nstate transition events"]
  end

  subgraph Conversation["Conversation Domain"]
    Thread["Threads and messages"]
    Review["Review items"]
    Artifact["Artifacts"]
    ProposedCall["Proposed calls and grants"]
    ConversationAPI["Interface\nthreads, conversations, reviews,\nartifacts APIs\nmessage/item events"]
  end

  subgraph Knowledge["Knowledge Domain"]
    KnowledgeItem["Knowledge items"]
    KnowledgeProjection["Knowledge projection\nlayer, kind, scores"]
    Relevance["Relevance and attention"]
    Writeback["Sandbox writeback"]
    KnowledgeAPI["Interface\nknowledge/search APIs\nprojection repository interface\nknowledge events"]
  end

  subgraph Session["Agent Session Domain"]
    SessionLifecycle["Session lifecycle"]
    Provisioning["Session provisioning"]
    Activity["Session activity"]
    SessionAPI["Interface\nsession API\nprovisionSession\nsession events"]
  end

  subgraph Harness["Harness Domain"]
    AdapterPool["Adapter selection"]
    AdapterContract["HarnessAdapter interface"]
    Tools["Tool registry"]
    HarnessAPI["Interface\nstartSession, streamEvents,\nstopSession, getCapabilities\ntool invocation interface"]
  end

  subgraph Integration["Integration Domain"]
    Credentials["Credentials and config"]
    Filesystems["Filesystem registry and injections"]
    Captures["Filesystem captures"]
    IntegrationAPI["Interface\nsettings, credentials,\nconnections, filesystems APIs\nmount/capture interface"]
  end

  CoordinationAPI --> SessionAPI
  ConversationAPI --> SessionAPI
  KnowledgeAPI --> SessionAPI
  SessionAPI --> HarnessAPI
  SessionAPI --> IntegrationAPI
  HarnessAPI --> ConversationAPI
  HarnessAPI --> KnowledgeAPI
```

## L1 - Core Interface Contracts

```mermaid
flowchart LR
  SessionRequest["Session Request\nagent id\nwork or conversation context\nmodel tier\nmode\ncost/concurrency inputs"]
  SessionEvents["Session Events\nsession_started\nsession_ended\nsession_not_returned\ntool_call_recorded"]
  HarnessContract["HarnessAdapter\nstartSession(config)\nstreamEvents(handle)\nstopSession(handle)\ngetCapabilities()"]
  AgentLayerContract["Agent layer provider\nassembleContext\nbeginLearningIngestion\nresolve defaults\nselectAgent\ndecomposeBet\nformAssistant"]
  ToolContract["Tool Invocation\nregistry.invoke(name, rawArgs)\nsession context bound at registry construction\noptional MCP exposure"]
  MountContract["Filesystem Mount\nregistered filesystems\nagent injection\nsession capture"]
  EventContract["Domain Events\ntyped EventBus\nstate, message, knowledge,\ncost, notification events"]

  Coordination["Coordination"] -- "creates" --> SessionRequest
  Conversation["Conversation"] -- "creates" --> SessionRequest
  SessionRequest --> Session["Agent session"]
  Session -- "emits" --> SessionEvents
  Session -- "calls" --> AgentLayerContract
  Session -- "calls" --> HarnessContract
  Session -- "calls" --> ToolContract
  Session -- "calls" --> MountContract
  Coordination -- "emits/subscribes" --> EventContract
  Conversation -- "emits/subscribes" --> EventContract
  Knowledge -- "emits/subscribes" --> EventContract
  Session -- "emits/subscribes" --> EventContract
```

Contract anchors:

- `HarnessAdapter` = startSession/streamEvents/stopSession/getCapabilities — `packages/shared/src/harness/harness-adapter.ts:270`. `startSession(config: SessionConfig)`; SessionConfig carries sessionId, sandboxPath, assembledPrompt, modelTier, resolvedModel, MCP bridge info, thread messages, return hook, session workflow.
- Agent layer provider = assembleContext/beginLearningIngestion/resolve defaults/selectAgent/decomposeBet/formAssistant. Current production ownership lives in agent-owned `packages/server/src/services/` files (context assembly, learning ingestion, agent defaults, selection, decomposition, assistant formation) — no separate app-runtime package boundary since AU11.
- Tool invocation = `registry.invoke(name, rawArgs)` — `packages/server/src/tools/tool-registry.ts:584`; per-session context is bound when `buildToolRegistry` constructs the registry, not passed per call.
- Session events verified in `packages/shared/src/events.ts` (session_started :34, session_ended :51, session_not_returned :72, tool_call_recorded :207).

## L2 - Coordination Domain

```mermaid
flowchart TB
  Team["Team\nproduct/work boundary"]
  MemberGroup["Team membership group"]
  Agent["Agent or human user"]
  Bet["Bet\nbounded commitment"]
  Task["Task\nassignable unit"]
  Routine["Routine\nrecurring trigger"]

  Team --> MemberGroup
  MemberGroup --> Agent
  Team --> Bet
  Bet --> Task
  Team --> Routine
  Agent --> Task
  Agent --> Routine

  BetState["Bet state machine\ndraft → active → completed | killed"] --> Bet
  TaskState["Task state machine\ntransition, handoff, dependencies"] --> Task
  RoutineScheduler["Routine scheduler"] --> Routine
  Decomposition["Bet decomposition"] --> Task

  BetState -- "bet_state_changed" --> Events["EventBus"]
  TaskState -- "task_state_changed" --> Events
  RoutineScheduler -- "routine_fired" --> Events

  Task -- "accepted owner task" --> SessionRequest["Session request"]
  Routine -- "trigger" --> SessionRequest
  Bet -- "active" --> DecompositionRequest["Decomposition request"]
```

Bet lifecycle endpoints: `POST /api/bets/:id/commit` (`routes/bets.ts:739`), `/:id/ship` (:802), `/:id/kill` (:823), `/:id/outcome` (:860). Task handoff: `POST /api/tasks/:id/handoff` (`routes/tasks.ts:224`) via the handoff protocol. Lifecycle semantics live in [process-layer](../process-layer/bets-shape-commit-change-ship.md).

## L2 - Conversation Domain

```mermaid
flowchart TB
  Thread["Thread\nconversation host"]
  Message["Message"]
  Item["Item\nreview/notification surface"]
  Review["Review"]
  Artifact["Artifact"]
  ProposedCall["Proposed call"]
  Grant["Tailored grant"]
  Outcome["Operation outcome"]

  Thread --> Message
  Thread --> Item
  Item --> Review
  Artifact --> Thread
  Message --> ProposedCall
  ProposedCall --> Grant
  ProposedCall --> Outcome

  AssistantTurn["Assistant turn"] --> Thread
  AssistantTurn --> SessionRequest["Conversational session request"]
  SessionResult["Session completion"] --> Message
  ToolRegistry["Tool registry"] --> Artifact
  ToolRegistry --> Item
  ToolRegistry --> ProposedCall

  Thread -- "thread_* events" --> Events["EventBus"]
  Item -- "item_created" --> Events
  ProposedCall -- "proposed_call_granted" --> Events
```

Thread/Message primitive (HOST_KINDS, MESSAGE_TYPES, verdict grammar, idempotency) is owned by the [Thread primitive](../human-interface-layer/thread-primitive.md). Proposed calls / staged operations: [staged operation](../process-layer/staged-operation.md). Artifact contract and embed shapes: [Artifact primitive](../process-layer/artifact-primitive.md).

## L2 - Knowledge Domain

```mermaid
flowchart TB
  KnowledgeItem["Knowledge item\ncanonical content and scope"]
  KnowledgeProjection["Knowledge projection\nlayer, kind, confidence,\nrelevance, attention"]
  EditLog["Edit log"]
  AccessLog["Access log"]
  Conflict["Conflict"]

  KnowledgeItem --> KnowledgeProjection
  KnowledgeItem --> EditLog
  KnowledgeItem --> AccessLog
  KnowledgeItem --> Conflict

  Repository["Knowledge repository"] --> KnowledgeItem
  Repository --> KnowledgeProjection
  Search["Search"] --> Repository
  Relevance["Relevance service"] --> KnowledgeProjection
  Attention["Attention service"] --> KnowledgeProjection
  Attention --> ReviewItem["Review item"]
  Writeback["Sandbox writeback"] --> Repository
  Promotion["Promotion pipeline"] --> Repository

  KnowledgeAPI["Knowledge API"] --> Repository
  SessionContext["Session context assembly"] --> Repository
  Repository -- "knowledge_created/updated/accessed/archived" --> Events["EventBus"]
```

Knowledge runtime internals (layer taxonomy, assembly, sync, scoring) are owned by [knowledge-architecture](../knowledge-architecture/index.md). Component-level summary: agent-owned context assembly projects the canonical store into a human-facing API and per-session agent workspaces — `assembleAgentContext` writes prompt/context artifacts with a version manifest (`packages/server/src/services/agent-context/assemble-context.ts`); agent-owned writeback (`packages/server/src/services/writeback.ts`) uses optimistic concurrency (`version` column, `knowledge_conflicts` table); Core-owned relevance and attention scoring filter what each session loads (`packages/server/src/knowledge/relevance-service.ts`, `packages/server/src/knowledge/attention-service.ts`).

## L2 - Agent Session Domain

```mermaid
flowchart TB
  SessionRequest["Session request"] --> Admission["Admission\nagent, model, cost, concurrency"]
  Admission --> SessionRecord["Session record\nactive"]
  SessionRecord --> Workspace["Workspace\nsandbox + mounts"]
  Workspace --> Context["Context assembly"]
  Context --> Prompt["Prompt and context files"]
  Prompt --> HarnessRun["Harness run"]
  HarnessRun --> EventDrain["Event drain\ncost, token, tool, completion, error"]
  EventDrain --> ToolInvocation["Tool invocation"]
  EventDrain --> Completion["Completion capture"]
  EventDrain --> Terminal["End or crash"]
  Terminal --> Writeback["Writeback and capture"]
  Terminal --> SessionEvents["Session events"]

  AgentLayerInterface["Agent layer interface"] --> Context
  HarnessInterface["Harness interface"] --> HarnessRun
  ToolInterface["Tool interface"] --> ToolInvocation
  MountInterface["Mount/capture interface"] --> Workspace
```

`provisionSession` (`packages/server/src/services/session-provisioning.ts`) runs admission (adapter selection, concurrency, cost cap at :622-694), spawns the sandbox, applies filesystem mounts (Phase 4.5, :237) before context assembly, then drains harness events. The run unit itself — per-session host working directory, no isolation boundary — is owned by the [run-unit model](./run-unit-model.md).

## L2 - Harness Domain

```mermaid
flowchart TB
  AdapterPool["Adapter pool\nselection + load tracking"]
  HarnessAdapter["HarnessAdapter interface"]
  Builtin["Builtin adapter"]
  CLI["CLI adapter"]
  Remote["Remote adapter"]
  EventStream["Harness event stream\ncost_update\ntoken_usage\ntool_call\ncompletion\nerror\npre_compaction"]

  AdapterPool --> HarnessAdapter
  HarnessAdapter --> Builtin
  HarnessAdapter --> CLI
  HarnessAdapter --> Remote
  Builtin --> Provider["LLM provider API"]
  CLI --> Binary["Installed CLI binary"]
  Remote --> Worker["Remote worker"]
  Builtin --> EventStream
  CLI --> EventStream
  Remote --> EventStream

  EventStream --> Session["Agent session domain"]
  ToolCalls["tool_call events"] --> ToolRegistry["Tool registry"]
  Builtin --> ToolRegistry
```

Harness event types match `packages/shared/src/harness/harness-events.ts:6-57` exactly (token_usage, tool_call, completion, error, cost_update, pre_compaction). The pool does least-loaded selection with load tracking (`packages/server/src/harness/adapter-pool.ts:187-235`). Event-normalization mechanism, capability descriptor shape, discovery/session probes, and the MCP bridge are owned by the [harness capability descriptor](../agent-layer/harness-capability-descriptor.md).

## L2 - Knowledge (Core) And Agent Services

AU11 dissolved the transitional `app-runtime/` shell (see [runtime-simplification](./runtime-simplification.md)) — context assembly and learning ingestion are agent-owned services; knowledge repository, relevance, and attention scoring are Core (`packages/server/src/knowledge/`).

```mermaid
flowchart TB
  AgentServices["Agent services"]
  CoreKnowledge["Core: packages/server/src/knowledge/"]

  AgentServices --> ContextAssembly["Context assembly"]
  AgentServices --> LearningIngestion["Learning ingestion"]
  AgentServices --> AgentDefaults["Agent defaults"]
  AgentServices --> AgentSelection["Agent selection"]
  AgentServices --> BetDecompose["Bet decomposition request"]
  AgentServices --> AssistantForm["Assistant formation"]

  ContextAssembly --> KnowledgeRepo["Knowledge repository (Core)"]
  ContextAssembly --> PromptFiles["Prompt/context files"]
  LearningIngestion --> FileWatcher["File watcher"]
  FileWatcher --> Writeback["Writeback"]
  KnowledgeRepo --> Relevance["Relevance scoring (Core)"]
  KnowledgeRepo --> Attention["Attention scoring (Core)"]
  CoreKnowledge -.owns.-> KnowledgeRepo
  CoreKnowledge -.owns.-> Relevance
  CoreKnowledge -.owns.-> Attention
```

## L2 - Integration Domain

```mermaid
flowchart TB
  ServerConfig["Server config"]
  Credentials["Server credentials"]
  ServiceConnections["Service connections"]
  Filesystems["Team filesystems"]
  Injections["Per-agent filesystem injections"]
  Captures["Per-session filesystem captures"]

  ServerConfig --> ModelResolution["Model and harness settings"]
  Credentials --> CredentialResolver["Credential resolver"]
  ServiceConnections --> ConnectionResolver["Connection resolver"]
  Filesystems --> MountPlan["Mount plan"]
  Injections --> MountPlan
  MountPlan --> SessionWorkspace["Session workspace"]
  SessionWorkspace --> Captures

  SettingsAPI["Settings/config APIs"] --> ServerConfig
  CredentialsAPI["Credentials API"] --> Credentials
  ConnectionsAPI["Connections API"] --> ServiceConnections
  FilesystemsAPI["Filesystems API"] --> Filesystems
  FilesystemsAPI --> Injections
```

Tables in `packages/db/src/schema.ts`: filesystems (:871), filesystem_injections (:919), filesystem_captures (:951), server_credentials (:988), server_config (:1009), service_connections (:1313). Held/inherited Connection semantics: [connection model](./connection-model.md). Encryption: [credential model](./credential-model.md).

## L2 - Event Interface

```mermaid
flowchart TB
  EventBus["EventBus\ntyped in-process events"]

  CoordinationEvents["Coordination events\ntask_state_changed\nbet_state_changed\nroutine_fired"] --> EventBus
  SessionEvents["Session events\nsession_started\nsession_ended\nsession_not_returned\ntool_call_recorded"] --> EventBus
  ConversationEvents["Conversation events\nthread_created\nthread_message_appended\nitem_created\nproposed_call_granted"] --> EventBus
  KnowledgeEvents["Knowledge events\nknowledge_accessed\nknowledge_updated\nknowledge_created\nknowledge_archived"] --> EventBus
  CostEvents["Cost events\ncost_cap_warning\ncost_cap_breached"] --> EventBus
  NotificationEvents["Notification events\nnotification"] --> EventBus

  EventBus --> TaskDispatch["Task dispatch"]
  EventBus --> Decomposition["Bet decomposition"]
  EventBus --> Lifecycle["Lifecycle propagation"]
  EventBus --> Dependency["Dependency unblock"]
  EventBus --> ReviewCreation["Review creation"]
  EventBus --> Relevance["Relevance recompute"]
  EventBus --> Notifications["Notification routing"]
  EventBus --> Routines["Routine triggers"]
  EventBus --> Push["WebSocket push"]
  EventBus --> Observability["Observability"]
```

**Guarantees** (one line — the contract lives in the `packages/shared/src/event-bus.ts` docblock): in-process typed pub/sub, synchronous delivery, per-stream ordering, at-least-once when `emit()` is called after database write durability; one throwing handler does not abort delivery to the rest.

## L3 - Current Agent Invocation Paths

```mermaid
flowchart TB
  Task["Task accepted or manually started"] --> SessionRequest["Session request"]
  Routine["Routine trigger"] --> SessionRequest
  Assistant["Assistant message"] --> ConversationSession["Conversational session request"]

  SessionRequest --> Provision["provisionSession"]
  ConversationSession --> Provision
  Provision --> AdapterPool["AdapterPool"]
  AdapterPool --> HarnessAdapter["HarnessAdapter"]

  BetActive["Bet becomes active"] --> DecompositionIntent["Durable decomposition intent"]
  DecompositionIntent --> AgentRequest["Agent-layer session request"]
  AgentRequest --> HarnessAdapter

  HarnessAdapter --> Builtin["Builtin harness"]
  HarnessAdapter --> CLI["CLI harness"]
  HarnessAdapter --> Remote["Remote harness"]
```

All agent-run entry families persist a durable work intent. The agent layer reloads domain truth, resolves a trigger, creates an idempotent session request, and executes through `session-provisioning.ts`. Assistant preparation lives in `agent-work-assistant.ts`; decomposition no longer calls an adapter from its domain service.

## Component Inventory

Verified against code 2026-07-07. Component-level facts only; primitive semantics live in their owning docs.

### Primitive store

Embedded Postgres: PGlite (laptop/test) or postgres-js (VPS/cloud), one unified Drizzle type (`packages/db/src/connection.ts`). Tables (all shapes owned by `packages/db/src/schema.ts`): teams, team_members, users (humans and agents, `kind` human|ai), bets, tasks, sessions, routines, routine_runs, threads, messages, items, user_skills, org_edges (:548), factory_settings, knowledge_items (:580) + app projection extension (:690, historical table name `knowledge_strategy_fabric`) + knowledge_edit_log (:609) + knowledge_access_log (:641) + knowledge_conflicts (:659), propagation_log (:808), notification_queue, artifacts, filesystems (+injections/captures), credential/config/login/invite/proposed-call tables.

- The `responses` table is dropped — verdicts are `verdict`-typed messages ([Thread primitive](../human-interface-layer/thread-primitive.md)).
- Message idempotency: UNIQUE(threadId, senderId, clientKey).
- Sessions carry no cost columns — spend accrues on users/teamMembers ([the five primitives](../process-layer/the-five-primitives.md)).
- `org_edges` records org relationships per (fromUserId, mechanism, target); `propagation_log` records lifecycle-propagation applications by source level/id and status; `knowledge_access_log` records per-item knowledge reads.

### Item router

Pure function `routeItem` at `packages/server/src/services/item-router.ts` (Core) returning a target view; `routeToFounder` at `packages/server/src/services/founder-router.ts` (Core) picks the recipient by agent role. Item shape and routing rules are owned by [items and routing](../human-interface-layer/items-and-routing.md). Notification policy is not the router's output — it lives in the notification services (`silence-policy.ts`, `notifications/dispatcher.ts`).

### Schedulers

In-process `setInterval` services, no external workflow engine. Routine scheduler (`packages/server/src/services/routine-scheduler.ts`, Core) fires cron/event/heartbeat triggers, honors silent routines; task dispatcher (`packages/server/src/services/task-dispatcher.ts`, agent-owned) starts sessions; dependency watcher (`packages/server/src/services/dependency-watcher.ts`) emits `dependency_met`. The scheduler never calls models — it reads the store and emits events.

Model tier selection: explicit param → agent `modelTierPreference` → `"workhorse"` (`session-provisioning.ts:663-673`); tier→model resolution via the model gateway. Vocabulary and catalog: [model routing and cost](../agent-layer/model-routing-and-cost.md).

### Cost sentinel

Application code, not a routine row — extracted in AD8c and registered (agent-owned) via `registerAgentLayerServices` in `server-factory.ts` precisely so it cannot be disabled from data (`packages/server/src/services/cost-sentinel.ts`). 15-minute tick, level-based dedupe via factory_settings key `cost_sentinel_last_level`; emits `cost_cap_warning` / `cost_cap_breached`. Cap grammar and hierarchy: [WIP and cost limits](../process-layer/wip-and-cost-limits.md).

### Knowledge Services

See the L2 Knowledge Domain paragraph above; full design in [knowledge-architecture](../knowledge-architecture/index.md). Context assembly and writeback are agent-owned (`packages/server/src/services/`, `packages/server/src/services/agent-context/`); promotion, attention scoring, and conflict resolution are Core-owned (`packages/server/src/knowledge/`). Search is escaped case-insensitive LIKE SQL (`routes/search.ts`) — no FTS5, no pgvector.

### API layer

Hono on Node, all routes under `/api` (`packages/server/src/app.ts`), single process hosting API + app-owned schedulers (`bootstrapAppRuntime` wired in `server-factory.ts`). Route groups: auth, users, agents, teams, team-members, bets (incl. `/:id/commit|ship|kill|outcome`), tasks (incl. `/:id/handoff`), sessions, reviews, artifacts, filesystems, knowledge (URL shape `/:id`, not `/:layer`), conversations, threads, org, recipients, status (incl. `/digest`), workers, harnesses, git-export, credentials, connections, hint-progress, dispatch-queue, search, settings, ws.

Auth: single `HYPERIDLE_API_KEY` via `X-API-Key` header (constant-time compare) + Bearer login-session tokens + invite codes (`middleware/auth.ts`, `services/login-session.ts`). Boundary enforcement: [authorization model](./authorization-model.md).

### Harness adapters

Interface in `packages/shared/src/harness/harness-adapter.ts`; implementations in `packages/server/src/harness/`: builtin (gateway/direct-key runtime — anthropic/openrouter/openai-compatible, `builtin-harness-adapter.ts`), CLI (codex, claude-code, opencode — `cli-harness-adapter.ts`), remote worker (`remote-harness-adapter.ts`). Autodiscovery covers codex, claude-code, cursor-agent, opencode (`harness-discovery.ts`). Descriptor, probes, MCP bridge, pre-compaction contract: [harness capability descriptor](../agent-layer/harness-capability-descriptor.md).

### Sandbox (run unit)

Per-session working directory under `HYPERIDLE_WORKSPACES_DIR` (`server-factory.ts:266-268`); the harness runs as a host child process with the user's environment inherited — no isolation boundary (AQ1). `SandboxAdapter` = `spawn(baseDir)` / `exec` / `destroy` (`harness/sandbox-adapter.ts:19-23`). `LocalSandboxAdapter` is the default; `DisabledSandboxAdapter` refuses agent provisioning on non-laptop server profiles. Opt-in isolation is planned (AQ2). Full model: [run-unit model](./run-unit-model.md).

### Notifications

`packages/server/src/notifications/` (Core): ntfy, SMTP, and console adapters behind `adapter-factory.ts`; the dispatcher owns policy, mute, drain, redaction, and runs the daily digest on its own timer (`dispatcher.ts` -> `runDailyDigest`) — not via a routine. Primitive semantics and cadence discipline: [notification primitive](../human-interface-layer/notification-primitive.md).

### Observability

Channels `"console"` | `"noop"` (`packages/server/src/services/observability/types.ts:4`); OpenTelemetry explicitly future (`config.ts:25,110-113`); event shapes in `packages/shared/src/observability/events.ts`.

## MCP Tool Surface

Agents interact with the process layer through MCP tools served in-process (`packages/server/src/mcp/mcp-bridge.ts` + `tools/tool-registry.ts`), calling services directly — not HTTP wrappers. Tools include: read_inbox, send_message, log_task, query_practice, write_memory, handoff_to, create_item, write_session_notes, plus create-bet/task/team/routine, promote-knowledge, score-attention, route-item, submit-review, commit-file, return-status (`packages/server/src/tools/`).

The same nouns have real HTTP surfaces for clients: `/api/users/:id/inbox` (GET/POST, principal-self scoped), `POST /api/tasks/:id/handoff`, `/api/knowledge` (`/search`, `/`, `/triage-count`, `/:id`).

## Session Flow

Triggers: routine fired, dependency cleared, or an inbox/assistant message. Then:

1. Model tier resolved (explicit param → agent preference → workhorse), model via gateway.
2. Context assembly writes TOON prompt + context files.
3. `LocalSandboxAdapter` provisions the per-session working directory; filesystem mounts applied.
4. Harness spawned; agent works via MCP tools.
5. Session notes written before context compaction (`tools/write-session-notes.ts`; fallback notes file `work/task-notes.md`).
6. Stop → `SessionResult` persisted, writeback + capture, `session_ended` emitted (`services/session-lifecycle.ts`).

## Item Routing Pipeline

Verified end-to-end: `create_item` tool → `items` row → `item_created` event → item-router/founder-router pick target view + recipient → notification dispatcher fires if push-worthy (ntfy) → WebSocket push → UI renders in the target view.

## WebSocket Push Contract

One client endpoint, topic-based:

- `GET /api/ws?token=<one-shot token>`; the token is minted by authenticated `POST /api/auth/ws-token` (`routes/ws.ts:77-99`, `routes/auth.ts`). Connection acks `{type:"connected"}`.
- Client sends `{type:"subscribe"|"unsubscribe", topic}`; server acks `{type:"subscribed"|"unsubscribed"|"forbidden", topic}`.
- Topics: `conversations`, `work`, `thread:<threadId>`, `session:<sessionId>` (session topics are read-only observe mode, open to any authenticated client).
- Payloads are serialized EventBus event objects per topic (`services/ws-broadcaster.ts`) — not REST-shaped responses.
- Subscribe authorization for per-thread topics goes through `canSubscribe` — see the [authorization model](./authorization-model.md).

A separate worker channel `GET /ws/worker?token=<HYPERIDLE_WORKER_TOKEN>` (`routes/worker-ws.ts`) carries Zod-validated register/event/session_result/error/pause/resume messages for remote harness workers.

Web client: singleton `packages/web/src/services/ws-client.ts` — lazy connect on first subscriber, auto-reconnect with 1s→15s backoff.

# As-Implemented Domain Architecture

Code-derived domain, component, and interface map. Each diagram shows domain ownership and the interfaces between domains; the component inventory below the diagrams is verified against the source tree file-by-file.

## L0 - Domain Map

```mermaid
flowchart LR
  Interface["Human collaboration interface\nwork, conversations, knowledge, settings"]
  Coordination["Coordination domain\nteams, bets, tasks, routines"]
  Conversation["Conversation domain\nthreads, messages, reviews, artifacts"]
  Knowledge["Knowledge domain\nknowledge items, relevance, attention, writeback"]
  Session["Agent session domain\nsession lifecycle and execution"]
  Harness["Harness domain\nCLI + remote adapters"]
  Integration["Integration domain\nfilesystems, credentials, service connections"]
  Eventing["Domain event bus\nstate changes and push"]

  Interface -- "HTTP API + websocket topics" --> Coordination
  Interface -- "HTTP API + websocket topics" --> Conversation
  Interface -- "HTTP API" --> Knowledge
  Interface -- "HTTP API" --> Integration

  Coordination -- "session request\naccepted tasks, routines" --> Session
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
  SessionRequest["Session Request\nagent id\nwork or conversation context\nmodel tier\nmode\nconcurrency inputs"]
  SessionEvents["Session Events\nsession_started\nsession_ended\nsession_not_returned\ntool_call_recorded"]
  HarnessContract["HarnessAdapter\nstartSession(config)\nstreamEvents(handle)\nstopSession(handle)\ngetCapabilities()"]
  AgentLayerContract["Agent layer provider\nassembleContext\nbeginLearningIngestion\nresolve defaults\nselectAgent\nformAssistant"]
  ToolContract["Tool Invocation\nregistry.invoke(name, rawArgs)\nsession context bound at registry construction\noptional MCP exposure"]
  MountContract["Filesystem Mount\nregistered filesystems\nagent injection\nsession capture"]
  EventContract["Domain Events\ntyped EventBus\nstate, message, knowledge,\nnotification events"]

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

- `HarnessAdapter` = startSession/streamEvents/stopSession/getCapabilities — `framework/harness-protocol/src/harness/harness-adapter.ts:270`. `startSession(config: SessionConfig)`; SessionConfig carries sessionId, sandboxPath, assembledPrompt, modelTier, resolvedModel, MCP bridge info, thread messages, return hook, session workflow.
- Agent layer provider = assembleContext/beginLearningIngestion/resolve defaults/selectAgent/formAssistant. Production ownership lives in `layers/agent-orchestration/`'s Services.
- Tool invocation = `registry.invoke(name, rawArgs)` — `layers/agent-execution/harness-registry/src/tool-registry.ts`; per-session context is bound when `buildToolRegistry` constructs the registry, not passed per call.
- Session events verified in `framework/domain-model/src/events.ts` (session_started :34, session_ended :51, session_not_returned :72, tool_call_recorded :207).

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

  BetState -- "bet_state_changed" --> Events["EventBus"]
  TaskState -- "task_state_changed" --> Events
  RoutineScheduler -- "routine_fired" --> Events

  Task -- "accepted owner task" --> SessionRequest["Session request"]
  Routine -- "trigger" --> SessionRequest
```

Bet lifecycle endpoints: `POST /api/bets/:id/commit`, `/:id/ship`, `/:id/kill`, `/:id/outcome` (`layers/core-api/src/routes/bets.ts`). Task handoff: `POST /api/tasks/:id/handoff` (`layers/core-api/src/routes/tasks.ts`) via the handoff protocol. Lifecycle semantics live in [process-layer](../process-layer/bets-shape-commit-change-ship.md).

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

Knowledge runtime internals (layer taxonomy, assembly, sync, scoring) are owned by [knowledge-architecture](../knowledge-architecture/index.md). Component-level summary: `agent-orchestration` assembles the context a run needs and writes it into the per-session workspace; its writeback (`layers/agent-orchestration/run-orchestration/src/writeback-processor.ts`) uses optimistic concurrency (`version` column, `knowledge_conflicts` table); `core-api`'s relevance and attention scoring filter what each session loads (`layers/core-api/knowledge/src/relevance-service.ts`, `attention-service.ts`).

## L2 - Agent Session Domain

```mermaid
flowchart TB
  SessionRequest["Session request"] --> Admission["Admission\nagent, model, concurrency"]
  Admission --> SessionRecord["Session record\nactive"]
  SessionRecord --> Workspace["Workspace\nsandbox + mounts"]
  Workspace --> Context["Context assembly"]
  Context --> Prompt["Prompt and context files"]
  Prompt --> HarnessRun["Harness run"]
  HarnessRun --> EventDrain["Event drain\ntoken, tool, completion, error"]
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

The provisioner (`layers/agent-orchestration/run-orchestration/src/provisioner.ts`) runs admission (adapter selection, concurrency), spawns the sandbox, applies filesystem mounts before context assembly, then drains harness events. The run unit itself — per-session host working directory, no isolation boundary — is owned by the [run-unit model](./run-unit-model.md).

## L2 - Harness Domain

```mermaid
flowchart TB
  AdapterPool["Adapter pool\nselection + load tracking"]
  HarnessAdapter["HarnessAdapter interface"]
  Builtin["Builtin adapter"]
  CLI["CLI adapter"]
  Remote["Remote adapter"]
  EventStream["Harness event stream\ntoken_usage\ntool_call\ncompletion\nerror\npre_compaction"]

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

Harness event types match `framework/harness-protocol/src/harness/harness-events.ts` exactly (token_usage, tool_call, completion, error, pre_compaction). `cost_update` was removed — harness telemetry was narrowed to token usage only (founder ruling: "very few harness can actually report cost"; see `layers/agent-execution/harness-registry/src/__testing__/llm-cassette.ts`). The pool does least-loaded selection with load tracking (`layers/agent-execution/harness-registry/src/adapter-pool.ts`). Event-normalization mechanism, capability descriptor shape, discovery/session probes, and the MCP bridge are owned by the [harness capability descriptor](../agent-layer/harness-capability-descriptor.md).

## L2 - Knowledge And Agent Services

Context assembly and learning ingestion belong to `agent-orchestration`; the knowledge repository, relevance, and attention scoring belong to `core-api` (`layers/core-api/knowledge/`). See [runtime-simplification](./runtime-simplification.md).

```mermaid
flowchart TB
  AgentServices["Agent services"]
  CoreKnowledge["core-api: layers/core-api/knowledge/"]

  AgentServices --> ContextAssembly["Context assembly"]
  AgentServices --> LearningIngestion["Learning ingestion"]
  AgentServices --> AgentDefaults["Agent defaults"]
  AgentServices --> AgentSelection["Agent selection"]
  AgentServices --> AssistantForm["Assistant formation"]

  ContextAssembly --> KnowledgeRepo["Knowledge repository (core-api)"]
  ContextAssembly --> PromptFiles["Prompt/context files"]
  LearningIngestion --> FileWatcher["File watcher"]
  FileWatcher --> Writeback["Writeback"]
  KnowledgeRepo --> Relevance["Relevance scoring (core-api)"]
  KnowledgeRepo --> Attention["Attention scoring (core-api)"]
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

Tables in `framework/db/src/schema.ts`: filesystems, filesystem_injections, filesystem_captures, server_credentials (:1319), server_config, service_connections (:1735). Held/inherited Connection semantics: [connection model](./connection-model.md). Encryption: [credential model](./credential-model.md).

## L2 - Event Interface

```mermaid
flowchart TB
  EventBus["EventBus\ntyped in-process events"]

  CoordinationEvents["Coordination events\ntask_state_changed\nbet_state_changed\nroutine_fired"] --> EventBus
  SessionEvents["Session events\nsession_started\nsession_ended\nsession_not_returned\ntool_call_recorded"] --> EventBus
  ConversationEvents["Conversation events\nthread_created\nthread_message_appended\nitem_created\nproposed_call_granted"] --> EventBus
  KnowledgeEvents["Knowledge events\nknowledge_accessed\nknowledge_updated\nknowledge_created\nknowledge_archived"] --> EventBus
  NotificationEvents["Notification events\nnotification"] --> EventBus

  EventBus --> TaskDispatch["Task dispatch"]
  EventBus --> Lifecycle["Lifecycle propagation"]
  EventBus --> Dependency["Dependency unblock"]
  EventBus --> ReviewCreation["Review creation"]
  EventBus --> Relevance["Relevance recompute"]
  EventBus --> Notifications["Notification routing"]
  EventBus --> Routines["Routine triggers"]
  EventBus --> Push["WebSocket push"]
  EventBus --> Observability["Observability"]
```

**Guarantees** (one line — the contract lives in the `framework/event-bus/src/event-bus.ts` docblock): in-process typed pub/sub, synchronous delivery, per-stream ordering, at-least-once when `emit()` is called after database write durability; one throwing handler does not abort delivery to the rest.

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

  HarnessAdapter --> Builtin["Builtin harness"]
  HarnessAdapter --> CLI["CLI harness"]
  HarnessAdapter --> Remote["Remote harness"]
```

All agent-run entry families persist a durable work intent. `core-api` bakes everything the run needs onto the emitted request; `agent-orchestration` claims it, formats it and dispatches. Assistant preparation lives in `layers/core-api/conversation/src/assistant-turn-resolver.ts`.

## Component Inventory

Verified against code 2026-08-06. Component-level facts only; primitive semantics live in their owning docs.

### Primitive store

Embedded Postgres: PGlite (laptop/test) or postgres-js (VPS/cloud), one unified Drizzle type (`framework/db/src/connection.ts`). 44 tables, all shapes owned by `framework/db/src/schema.ts`: teams, team_members, users (humans and agents, `kind` human|ai), bets, tasks, sessions, routines, routine_runs, threads, messages, items, org_edges, knowledge_items (:883) + knowledge_app_projection (:1004) + knowledge_edit_log (:912) + knowledge_access_log + knowledge_conflicts, propagation_log, notification_queue, artifacts, filesystems (+injections/captures), agent-run tables (agent_session_requests, agent_work_intents, explicit_session_starts, agent_run_config, …), credential/config/login/invite/proposed-call tables.

- The `responses` table is dropped — verdicts are `verdict`-typed messages ([Thread primitive](../human-interface-layer/thread-primitive.md)).
- Message idempotency: UNIQUE(threadId, senderId, clientKey).
- Sessions carry no cost columns. The cost feature was deleted with no replacement; the spend ceiling lives at the upstream LLM provider account ([WIP limits](../process-layer/wip-and-cost-limits.md)).
- `org_edges` records org relationships per (fromUserId, mechanism, target); `propagation_log` records lifecycle-propagation applications by source level/id and status; `knowledge_access_log` records per-item knowledge reads.

### Item routing

`routeItem` and `routeToFounder` are deleted. An item carries no computed target view; review recipients are resolved by `resolveReviewRecipients` (`layers/core-api/org/src/org-routing.ts`), and notification policy lives in the notification Service (`layers/core-api/notifications/src/silence-policy.ts`, `install.ts`). Item shape is owned by [items and routing](../human-interface-layer/items-and-routing.md).

### Schedulers

In-process `setInterval` services, no external workflow engine. Routine scheduler (`layers/core-api/routine/src/routine-scheduler.ts`) fires cron/event/heartbeat triggers and honors silent routines; dispatch lives in `layers/agent-orchestration/dispatch/`; `checkAndUnblockDependents` (`layers/core-api/work/src/dependency-watcher.ts`) moves dependent tasks off hold. The scheduler never calls models — it reads the store and emits events.

A session runs the model its agent was configured with — `agent_run_config.model_id` reaches the harness as `SessionConfig.selectedModel`. There is no gateway and no tier→model resolution; the tier is a cost-reporting label only. Vocabulary: [model routing and cost](../agent-layer/model-routing-and-cost.md).

### Knowledge Services

See the L2 Knowledge Domain paragraph above; full design in [knowledge-architecture](../knowledge-architecture/index.md). Context assembly and writeback belong to `layers/agent-orchestration/run-orchestration/`; promotion, attention scoring, and conflict resolution to `layers/core-api/knowledge/`. Search is escaped case-insensitive LIKE SQL (`layers/core-api/src/routes/search.ts`) — no FTS5, no pgvector.

### API layer

Hono on Node. `core-api` mounts its routes under `/api` (`layers/core-api/src/app.ts`); each Layer hosts its own app, and an Application composes them (`applications/remote-server/src/create-server.ts`, `applications/desktop/src/main.ts`). Schedulers start from `layers/core-api/src/service-bootstrap.ts`. Route groups: auth, users, agents, teams, team-members, bets (incl. `/:id/commit|ship|kill|outcome`), tasks (incl. `/:id/handoff`), sessions, reviews, artifacts, filesystems, knowledge (URL shape `/:id`, not `/:layer`), conversations, threads, org, recipients, status (incl. `/digest`), workers, harnesses, credentials, hint-progress, dispatch-queue, search, settings, ws. `/connections` is served by `agent-orchestration`'s own app (`layers/agent-orchestration/src/app.ts`, `layers/agent-orchestration/src/routes/connections.ts`) — its table set (`service_connections`) is owned by that Layer (AU26 E4).

Auth: single `HYPERIDLE_API_KEY` via `X-API-Key` header (constant-time compare) + Bearer login-session tokens + invite codes (`layers/core-api/src/middleware/auth.ts`, `layers/core-api/users/src/login-session.ts`). Boundary enforcement: [authorization model](./authorization-model.md).

### Harness adapters

Interface in `framework/harness-protocol/src/harness/harness-adapter.ts`; implementations in `layers/agent-execution/harness-registry/src/`: CLI (codex, claude-code, opencode, cursor-agent — `cli-harness-adapter.ts`) and remote worker (`remote-harness-adapter.ts`). Autodiscovery covers the same four CLIs (`harness-discovery.ts`). A built-in in-process adapter used to sit alongside these, calling a provider API directly; it is gone, and with it the model gateway that fed it. Descriptor, probes, MCP bridge, pre-compaction contract: [harness capability descriptor](../agent-layer/harness-capability-descriptor.md).

### Sandbox (run unit)

Per-session working directory under `HYPERIDLE_WORKSPACES_DIR`; the harness runs as a host child process with the user's environment inherited — no isolation boundary (AQ1). `SandboxAdapter` = `spawn(baseDir)` / `exec` / `destroy` (`layers/agent-execution/harness-registry/src/sandbox-adapter.ts`). `LocalSandboxAdapter` is the default; `DisabledSandboxAdapter` refuses agent provisioning on non-laptop server profiles. Opt-in isolation is planned (AQ2). Full model: [run-unit model](./run-unit-model.md).

### Notifications

`layers/core-api/notifications/`: ntfy, SMTP, and console adapters; the dispatcher owns policy, mute, drain, redaction, and runs the daily digest on its own timer (`install.ts` → `runDailyDigestInternal`, `daily-digest.ts`) — not via a routine. Primitive semantics and cadence discipline: [notification primitive](../human-interface-layer/notification-primitive.md).

### Observability

Channels `"console"` | `"noop"` (`framework/diagnostics/src/observability/types.ts:4`); OpenTelemetry explicitly future. Event shapes in `framework/diagnostics/src/observability/events.ts`; the runtime wiring in `layers/core-api/src/observability-runtime.ts`.

## MCP Tool Surface

Agents interact with the process layer through MCP tools served in-process (`layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts` + `tool-registry.ts`). The tool set is declared in `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`: read_inbox, send_message, reply, log_task, query_practice, write_memory, handoff_to, create_item, create_artifact, write_session_notes, create_bet, edit_bet, create_task, create_team, add_agent, create_routine, update_routine, promote_knowledge, score_attention, create_conflict_review, submit_review, commit_file.

The same nouns have real HTTP surfaces for clients: `/api/users/:id/inbox` (GET/POST, principal-self scoped), `POST /api/tasks/:id/handoff`, `/api/knowledge` (`/search`, `/`, `/triage-count`, `/:id`).

## Session Flow

Triggers: routine fired, dependency cleared, or an inbox/assistant message. Then:

1. Model tier resolved (explicit param → agent preference → workhorse), model via gateway.
2. Context assembly writes TOON prompt + context files.
3. `LocalSandboxAdapter` provisions the per-session working directory; filesystem mounts applied.
4. Harness spawned; agent works via MCP tools.
5. Session notes written before context compaction (the `write_session_notes` tool; fallback notes file `work/task-notes.md`).
6. Stop → `SessionResult` persisted, writeback + capture, `session_ended` emitted.

## Item Pipeline

`create_item` tool → `items` row → `item_created` event → notification dispatcher fires if push-worthy (ntfy) → WebSocket push → UI renders it.

## WebSocket Push Contract

One client endpoint, topic-based:

- `GET /api/ws?token=<one-shot token>`; the token is minted by authenticated `POST /api/auth/ws-token` (`layers/core-api/src/routes/ws.ts`, `routes/auth.ts:87`). Connection acks `{type:"connected"}`.
- Client sends `{type:"subscribe"|"unsubscribe", topic}`; server acks `{type:"subscribed"|"unsubscribed"|"forbidden", topic}`.
- Topics: `conversations`, `work`, `thread:<threadId>`, `session:<sessionId>` (session topics are read-only observe mode, open to any authenticated client).
- Payloads are serialized EventBus event objects per topic (`layers/core-api/src/ws-connection-hub.ts`) — not REST-shaped responses.
- Subscribe authorization for per-thread topics goes through `canSubscribe` — see the [authorization model](./authorization-model.md).

A separate worker channel `GET /ws/worker?token=<HYPERIDLE_WORKER_TOKEN>` (`layers/agent-orchestration/run-orchestration/src/worker-ingress.ts`) carries Zod-validated register/event/session_result/error/pause/resume messages for remote harness workers.

Web client: singleton `layers/core-ui/src/services/ws-client.ts` — lazy connect on first subscriber, auto-reconnect with 1s→15s backoff.

# As-Implemented Domain Architecture

Code-derived domain, component, and interface map. Each diagram shows domain ownership and the interfaces between domains; the component inventory below the diagrams is verified against the source tree file-by-file.

## L0 - Domain Map

```mermaid
flowchart LR
  Interface["Human collaboration interface\nwork, conversations, knowledge, settings"]
  Coordination["Coordination domain\ntasks"]
  Conversation["Conversation domain\nthreads, messages, reviews, artifacts"]
  Knowledge["Document domain\ndocuments (memory/artifact/document), writeback"]
  User["User domain\nusers, teams, org edges, subscriptions, inbox"]
  Session["Agent session domain\nsession lifecycle and execution"]
  Harness["Harness domain\nCLI + remote adapters"]
  Integration["Integration domain\nfilesystems, service connections"]
  Eventing["Domain event bus\nstate changes and push"]

  Interface -- "HTTP API + websocket topics" --> Coordination
  Interface -- "HTTP API + websocket topics" --> Conversation
  Interface -- "HTTP API" --> Knowledge
  Interface -- "HTTP API" --> Integration
  Interface -- "HTTP API + websocket topics" --> User

  Coordination -- "session request\naccepted tasks" --> Session
  Conversation -- "assistant turn request" --> Session
  Knowledge -- "context and prompt material" --> Session
  User -- "subscription wake" --> Session
  Session -- "run config and event stream" --> Harness
  Session -- "tool calls" --> Conversation
  Session -- "writeback and captures" --> Knowledge
  Session -- "mount/capture request" --> Integration

  Coordination -- "domain events" --> Eventing
  Conversation -- "domain events" --> Eventing
  Knowledge -- "domain events" --> Eventing
  Session -- "domain events" --> Eventing
  User -- "domain events" --> Eventing
  Eventing -- "dispatch, reviews,\nlifecycle propagation" --> Coordination
  Eventing -- "subscription fire" --> User
  Eventing -- "thread/session/work updates" --> Interface
```

## L1 - Bounded Contexts And Public Interfaces

```mermaid
flowchart TB
  subgraph Coordination["Coordination Domain"]
    Task["Task lifecycle (recursive tree)"]
    CoordinationAPI["Interface\ntasks API\nstate transition events"]
  end

  subgraph User["User Domain"]
    UserRow["Users, teams, org edges"]
    Subscription["Subscriptions and inbox"]
    UserAPI["Interface\nsearch_users/open_user/edit_user\nuser events"]
  end

  subgraph Conversation["Conversation Domain"]
    Thread["Threads and messages"]
    Review["Review messages"]
    Artifact["Artifacts"]
    ConversationAPI["Interface\nsearch_threads/open_thread/send_message/adjust_thread\nartifacts API\nthread events"]
  end

  subgraph Knowledge["Document Domain"]
    Document["Documents\none table: content, scope, slot, tree position, usage"]
    Writeback["Sandbox writeback"]
    KnowledgeAPI["Interface\nsearch_documents/open_document/edit_document\nchanges rows as history\ndocument:&lt;id&gt; / documents websocket topics"]
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
    Config["Server config"]
    Filesystems["Filesystem registry and injections"]
    Captures["Filesystem captures"]
    IntegrationAPI["Interface\nsettings,\nconnections, filesystems APIs\nmount/capture interface"]
  end

  CoordinationAPI --> SessionAPI
  ConversationAPI --> SessionAPI
  KnowledgeAPI --> SessionAPI
  UserAPI --> SessionAPI
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
  EventContract["Domain Events\ntyped EventBus\nstate, message, knowledge,\nuser change events"]

  Coordination["Coordination"] -- "creates" --> SessionRequest
  Conversation["Conversation"] -- "creates" --> SessionRequest
  User["User"] -- "creates (subscription wake)" --> SessionRequest
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
  User -- "emits/subscribes" --> EventContract
```

Contract anchors:

- `HarnessAdapter` = startSession/streamEvents/stopSession/getCapabilities — `framework/harness-protocol/src/harness/harness-adapter.ts:270`. `startSession(config: SessionConfig)`; SessionConfig carries sessionId, sandboxPath, assembledPrompt, modelTier, resolvedModel, MCP bridge info, thread messages, return hook, session workflow.
- Agent layer provider = assembleContext/beginLearningIngestion/resolve defaults/selectAgent/formAssistant. Production ownership lives in `layers/agent-orchestration/`'s Services.
- Tool invocation = `registry.invoke(name, rawArgs)` — `layers/agent-execution/harness-registry/src/tool-registry.ts`; per-session context is bound when `buildToolRegistry` constructs the registry, not passed per call.
- Session events verified in `framework/domain-model/src/events.ts` (session_started :34, session_ended :51, session_not_returned :72, tool_call_recorded :207).

## L2 - Coordination Domain

```mermaid
flowchart TB
  Task["Task\nunit of work (root or subtask), owned by a team"]
  Subtask["Subtask\n(same shape, parentTaskId set)"]

  Task --> Subtask
  Subtask --> Subtask

  TaskState["Task state machine\nproposed→accepted→in_progress→review→done | killed\nhold, blocked as runtime states"] --> Task

  TaskState -- "task.created / task.changed" --> Events["EventBus"]

  Task -- "accepted owner task" --> SessionRequest["Session request"]
```

Task actions, `POST /api/actions/<name>`: `search_tasks`, `open_task` (returns the task, its ancestors, and its full subtree), `edit_task` (create when `id` is omitted, otherwise edit — same door for humans and agents, no gate; `state: "killed"` cascades to the whole subtree; setting `ownerAgentId` to another user is a handoff). Lifecycle semantics: [tasks-and-sessions](../process-layer/tasks-and-sessions.md).

## L2 - User Domain

```mermaid
flowchart TB
  User["User\nhuman or agent (kind)"]
  Team["Team\nid + name — every user's own, or its owner's"]
  OrgEdge["Org edge\nreporting line (direct / function / team)"]
  Subscription["Subscription\nevent or schedule, paused"]
  Inbox["Inbox row\npointer at a change, seen/read"]

  User --> Team
  User --> OrgEdge
  User --> Subscription
  User --> Inbox

  Fire["Subscription fire"] --> Subscription
  Clock["Subscription clock"] --> Subscription
  Fire -- "agent: wake" --> SessionRequest["Session request"]
  Fire -- "person: inbox row + socket nudge" --> Inbox

  User -- "user.created / user.changed" --> Events["EventBus"]
```

User actions, `POST /api/actions/<name>`: `search_users`, `open_user` (returns identity, team, run config, folders, connections, subscriptions, and — for the caller's own row — the inbox), `edit_user` (create when `id` is omitted; the one door for a person's profile and an agent's identity, harness, folders, connections, subscriptions, and inbox marks alike — same door for humans and agents, no gate). Firing, reach, and the retro loop: [subscriptions-and-retros](../process-layer/subscriptions-and-retros.md).

## L2 - Conversation Domain

```mermaid
flowchart TB
  Thread["Thread\nconversation host"]
  Message["Message\nplain | review | questionnaire | verdict"]
  Artifact["Artifact"]

  Thread --> Message
  Artifact --> Thread

  ThreadTurn["Thread turn"] --> Thread
  ThreadTurn --> SessionRequest["Conversational session request"]
  SessionResult["Session completion"] --> Message
  ToolRegistry["Tool registry"] --> Artifact

  Thread -- "changes row (thread.created / thread.message / thread.changed)" --> Events["EventBus"]
```

Thread/Message primitive (HOST_KINDS, MESSAGE_TYPES, verdict grammar, idempotency) is owned by the [Thread primitive](../human-interface-layer/thread-primitive.md). Artifact contract and embed shapes: [Artifact primitive](../process-layer/artifact-primitive.md).

## L2 - Document Domain

```mermaid
flowchart TB
  Document["Document\ncanonical content, scope, slot, tree position, usage counts"]
  Changes["changes rows\ndocument.created / document.changed — the history"]

  Document --> Changes

  Store["Document store\nlayers/core-api/document/"] --> Document
  Search["search_documents"] --> Store
  Open["open_document\nbumps read_count"] --> Store
  Edit["edit_document\nstale version refused, discarded"] --> Store
  Writeback["Sandbox writeback"] --> Edit
  SessionContext["Session context assembly\nbumps session_use_count"] --> Store

  Store -- "document:&lt;id&gt; / documents" --> WsPush["WebSocket push"]
```

Document runtime internals (assembly, sync, tree invariants) are owned by [knowledge-architecture](../knowledge-architecture/index.md). Component-level summary: `agent-orchestration`'s writeback (`layers/agent-orchestration/run-orchestration/src/writeback-processor.ts`) calls `edit_document` as the session's own agent, using optimistic concurrency (`version` column) — a stale write is refused and discarded, there is no conflict table. There is no repository, relevance service, attention service, or promotion pipeline; `layers/core-api/document/` is the one module, and every create/edit is one `changes` row.

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

## L2 - Document And Agent Services

Context assembly and learning ingestion belong to `agent-orchestration`; the document module belongs to `core-api` (`layers/core-api/document/`). See [runtime-simplification](./runtime-simplification.md).

```mermaid
flowchart TB
  AgentServices["Agent services"]
  CoreDocument["core-api: layers/core-api/document/"]

  AgentServices --> ContextAssembly["Context assembly"]
  AgentServices --> LearningIngestion["Learning ingestion"]
  AgentServices --> AgentDefaults["Agent defaults"]
  AgentServices --> AgentSelection["Agent selection"]
  AgentServices --> AssistantForm["Assistant formation"]

  ContextAssembly --> DocumentStore["Document store (core-api)"]
  ContextAssembly --> PromptFiles["Prompt/context files"]
  LearningIngestion --> FileWatcher["File watcher"]
  FileWatcher --> Writeback["Writeback"]
  DocumentStore --> SessionDocuments["assembleSessionDocuments\ntag/recency/confidence scoring, 40K token budget"]
  CoreDocument -.owns.-> DocumentStore
  CoreDocument -.owns.-> SessionDocuments
```

## L2 - Integration Domain

```mermaid
flowchart TB
  ServerConfig["Server config"]
  ServiceConnections["Service connections"]
  Filesystems["Team filesystems"]
  Injections["Per-agent filesystem injections"]
  Captures["Per-session filesystem captures"]

  ServerConfig --> ModelResolution["Model and harness settings"]
  ServiceConnections --> ConnectionResolver["Connection resolver"]
  Filesystems --> MountPlan["Mount plan"]
  Injections --> MountPlan
  MountPlan --> SessionWorkspace["Session workspace"]
  SessionWorkspace --> Captures

  SettingsAPI["Settings/config APIs"] --> ServerConfig
  ConnectionsAPI["Connections API"] --> ServiceConnections
  FilesystemsAPI["Filesystems API"] --> Filesystems
  FilesystemsAPI --> Injections
```

Tables in `framework/db/src/schema.ts`: filesystems, filesystem_injections, filesystem_captures, server_config, service_connections (:1387). Held/inherited Connection semantics and its encryption: [connection model](./connection-model.md).

## L2 - Event Interface

```mermaid
flowchart TB
  EventBus["EventBus\ntyped in-process events"]

  CoordinationEvents["Coordination events\ntask.created\ntask.changed"] --> EventBus
  SessionEvents["Session events\nsession_started\nsession_ended\nsession_not_returned\ntool_call_recorded"] --> EventBus
  ConversationEvents["Conversation events\nthread.created\nthread.message\nthread.changed"] --> EventBus
  DocumentEvents["Document events\ndocument.created\ndocument.changed"] --> EventBus
  UserEvents["User events\nuser.created\nuser.changed"] --> EventBus

  EventBus --> TaskDispatch["Task dispatch"]
  EventBus --> Lifecycle["Lifecycle propagation"]
  EventBus --> Dependency["Dependency unblock"]
  EventBus --> ReviewCreation["Review creation"]
  EventBus --> SubscriptionFire["Subscription fire\n(agent wake or inbox row)"]
  EventBus --> Push["WebSocket push"]
  EventBus --> Observability["Observability"]
```

All nine members of `EventByType` — `task.created`/`task.changed`/`thread.created`/`thread.message`/
`thread.changed`/`document.created`/`document.changed`/`user.created`/`user.changed` — are one shape,
`ObjectChangeEvent`, built from the `changes` row the emitting module just appended. The document
websocket push (`document:<id>`/`documents`) is a separate direct push from the same row, not routed
through the bus.

**Guarantees** (one line — the contract lives in the `framework/event-bus/src/event-bus.ts` docblock): in-process typed pub/sub, synchronous delivery, per-stream ordering, at-least-once when `emit()` is called after database write durability; one throwing handler does not abort delivery to the rest.

## L3 - Current Agent Invocation Paths

```mermaid
flowchart TB
  Task["Task accepted or manually started"] --> SessionRequest["Session request"]
  SubscriptionWake["Subscription wake (event or schedule)"] --> SessionRequest
  Assistant["Assistant message"] --> ConversationSession["Conversational session request"]

  SessionRequest --> Provision["provisionSession"]
  ConversationSession --> Provision
  Provision --> AdapterPool["AdapterPool"]
  AdapterPool --> HarnessAdapter["HarnessAdapter"]

  HarnessAdapter --> Builtin["Builtin harness"]
  HarnessAdapter --> CLI["CLI harness"]
  HarnessAdapter --> Remote["Remote harness"]
```

All agent-run entry families persist a durable work intent. `core-api` bakes everything the run needs onto the emitted request; `agent-orchestration` claims it, formats it and dispatches. Thread-turn preparation (a mention or a direct-thread reply waking an agent) lives in `layers/core-api/thread/src/thread-turn-resolver.ts`.

## Component Inventory

Verified against code 2026-08-06. Component-level facts only; primitive semantics live in their owning docs.

### Primitive store

Embedded Postgres: PGlite (laptop/test) or postgres-js (VPS/cloud), one unified Drizzle type (`framework/db/src/connection.ts`). All shapes owned by `framework/db/src/schema.ts`: teams (id + name only), users (humans and agents, `kind` human|ai; team membership is `users.teamId`, or an owned agent's owner's), subscriptions, inbox, tasks (recursive — `parent_task_id` nullable self-FK; replaces the former `bets` + `tasks` two-table design), sessions, threads, messages, org_edges, `documents` (one table: content, scope, slot, tree position, `confidence`/`meta`, and four usage columns — `read_count`/`last_read_at`/`session_use_count`/`last_used_at`), artifacts, filesystems (+injections/captures), agent-run tables (agent_session_requests, agent_work_intents, explicit_session_starts, agent_run_config, …), config/login/invite/proposed-call tables.

- The `responses` table is dropped — verdicts are `verdict`-typed messages ([Thread primitive](../human-interface-layer/thread-primitive.md)).
- There is no `items` table. A review, a question, an escalation are messages on a thread.
- Message idempotency: UNIQUE(threadId, senderId, clientKey).
- Sessions carry no cost columns. The cost feature was deleted with no replacement; the spend ceiling lives at the upstream LLM provider account ([WIP limits](../process-layer/wip-and-cost-limits.md)).
- `org_edges` records org relationships per (fromUserId, mechanism, target). There is no separate access-log table for documents — a read is counted directly on the row (`read_count`/`last_read_at`), and every create/edit is one `changes` row (`object='document'`).

### Item routing

There is no `items` table and no item router. Review recipients are resolved through `org_edges` (`(fromUserId, mechanism, target)`), read via `open_user`/`search_users`.

### Schedulers

In-process `setInterval` services, no external workflow engine. The subscription clock (`layers/core-api/user/src/subscription-clock.ts`) fires due schedule subscriptions and advances their `nextRunAt`; subscription fire (`layers/core-api/user/src/subscription-fire.ts`) wakes event subscriptions off the same nine change events every object module emits; dispatch lives in `layers/agent-orchestration/dispatch/`; `checkAndUnblockDependents` (`layers/core-api/work/src/dependency-watcher.ts`) moves dependent tasks off hold. Neither scheduler calls models — both read the store and emit events or wakes.

A session runs the model its agent was configured with — `agent_run_config.model_id` reaches the harness as `SessionConfig.selectedModel`. There is no gateway and no tier→model resolution; the tier is a cost-reporting label only. Vocabulary: [model routing and cost](../agent-layer/model-routing-and-cost.md).

### Document Services

See the L2 Document Domain paragraph above; full design in [knowledge-architecture](../knowledge-architecture/index.md). Context assembly and writeback belong to `layers/agent-orchestration/run-orchestration/`; the document store and the three document actions belong to `layers/core-api/document/`. Search is case-insensitive `ILIKE` over title and body (`document-store.ts`) — no FTS5, no pgvector.

### API layer

Hono on Node. `core-api` mounts its routes under `/api` (`layers/core-api/src/app.ts`); each Layer hosts its own app, and an Application composes them (`applications/remote-server/src/create-server.ts`, `applications/desktop/src/main.ts`). Schedulers start from `layers/core-api/src/service-bootstrap.ts`. `core-api`'s own route groups are down to four: `auth`, `health`, `search`, and `actions` — one router over the composed action list (`search_tasks`/`open_task`/`edit_task`/`search_threads`/`open_thread`/`send_message`/`adjust_thread`/`search_documents`/`open_document`/`edit_document`/`search_users`/`open_user`/`edit_user`/`search_plugins`/`edit_plugin`). There is no separate `users`/`agents`/`teams`/`team-members`/`org`/`recipients`/`harnesses`/`settings-agent-behavior`/`notifications` route family any more — every one of those nouns is now `search_users`/`open_user`/`edit_user` under `POST /api/actions/<name>`, mounted generically. Agent-orchestration mounts its own `/actions` the same way, with `search_sessions`/`watch_session`/`stop_session`, plus `/filesystems` (plumbing: `POST /inspect-path` only) — both Layer apps mount at `/` on the one `/api` router, so `POST /api/actions/<name>` resolves to whichever Layer owns that action. The two Layers' action lists are joined once, at each Application's `createServer`, into the one list an agent reaches over MCP. `/api/connections` and the core-hosted `/api/agents/:id/injections` route are both deleted — connections and folders are user attributes now, behind `open_user`/`edit_user`.

Auth: single `HYPERIDLE_API_KEY` via `X-API-Key` header (constant-time compare) + Bearer login-session tokens + invite codes (`layers/core-api/src/middleware/auth.ts`, `layers/core-api/users/src/login-session.ts`). Boundary enforcement: [authorization model](./authorization-model.md).

### Harness adapters

Interface in `framework/harness-protocol/src/harness/harness-adapter.ts`; implementations in `layers/agent-execution/harness-registry/src/`: CLI (codex, claude-code, opencode, cursor-agent — `cli-harness-adapter.ts`) and remote worker (`remote-harness-adapter.ts`). Autodiscovery covers the same four CLIs (`harness-discovery.ts`). A built-in in-process adapter used to sit alongside these, calling a provider API directly; it is gone, and with it the model gateway that fed it. Descriptor, probes, MCP bridge, pre-compaction contract: [harness capability descriptor](../agent-layer/harness-capability-descriptor.md).

### Sandbox (run unit)

Per-session working directory under `HYPERIDLE_WORKSPACES_DIR`; the harness runs as a host child process with the user's environment inherited — no isolation boundary (AQ1). `SandboxAdapter` = `spawn(baseDir)` / `exec` / `destroy` (`layers/agent-execution/harness-registry/src/sandbox-adapter.ts`). `LocalSandboxAdapter` is the default; `DisabledSandboxAdapter` refuses agent provisioning on non-laptop server profiles. Opt-in isolation is planned (AQ2). Full model: [run-unit model](./run-unit-model.md).

### Notifications

There is no notifications package and no egress adapter — `layers/core-api/notifications/` is deleted. A person's inbox is `inbox` rows, owned by `layers/core-api/user/`, filled by subscription fire (above) and pushed live over the `user:<id>` websocket topic. Primitive semantics: [notification primitive](../human-interface-layer/notification-primitive.md).

### Observability

Channels `"console"` | `"noop"` (`framework/diagnostics/src/observability/types.ts:4`); OpenTelemetry explicitly future. Event shapes in `framework/diagnostics/src/observability/events.ts`; the runtime wiring in `layers/core-api/src/observability-runtime.ts`.

## MCP Tool Surface

Agents interact with the process layer through MCP tools served in-process (`layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts` + `tool-registry.ts`). There are no hand-declared tools any more — `create_team`/`add_agent`/`create_routine`/`update_routine` and the `CoreApiPort` seam behind them are all deleted. Every tool is projected straight from the composed action list (`layers/core-api/src/actions/actions-as-tools.ts`) — `search_tasks`, `open_task`, `edit_task` (ungated — same door for humans and agents; setting `ownerAgentId` is a handoff), `search_threads`, `open_thread`, `send_message`, `adjust_thread`, `search_documents`, `open_document`, `edit_document`, and `search_users`, `open_user`, `edit_user`. There is no `write_memory`, `create_artifact`, or knowledge-sweep/scoring/conflict/merge/split tool any more — a memory or an artifact is `edit_document` called with `as: "memory"` / `as: "artifact"`.

The same nouns have one real HTTP surface for clients: `POST /api/actions/<name>` for tasks, threads, documents, and users alike — there is no separate `/api/knowledge` route and no per-noun REST family. A person's own inbox is `open_user({}).inbox`; marking it read or seen is `edit_user({ id: me, inbox })`.

## Session Flow

Triggers: a subscription wake (event or schedule), dependency cleared, or an inbox/assistant message. Then:

1. The agent's own model (`model_id`) becomes `SessionConfig.selectedModel`; the tier is a cost-reporting label, resolved as explicit param → `workhorse`.
2. Context assembly writes TOON prompt + context files.
3. `LocalSandboxAdapter` provisions the per-session working directory; filesystem mounts applied.
4. Harness spawned; agent works via MCP tools.
5. Session notes written before context compaction (the `write_session_notes` tool; fallback notes file `work/task-notes.md`).
6. Stop → `SessionResult` persisted, writeback + capture, `session_ended` emitted.

## WebSocket Push Contract

One client endpoint, topic-based:

- `GET /api/ws?token=<one-shot token>`; the token is minted by authenticated `POST /api/auth/ws-token` (`layers/core-api/src/routes/ws.ts`, `routes/auth.ts:87`). Connection acks `{type:"connected"}`.
- Client sends `{type:"subscribe"|"unsubscribe", topic}`; server acks `{type:"subscribed"|"unsubscribed"|"forbidden", topic}`.
- Topics: `conversations`, `work`, `thread:<threadId>`, `session:<sessionId>` (session topics are read-only observe mode, open to any authenticated client), `document:<documentId>`, `documents` (pushed once per `changes` row on a document create/edit), `user:<userId>` (a content-free nudge telling that user's own client to refetch its inbox — admits only that user).
- Payloads are serialized EventBus event objects per topic (`layers/core-api/src/ws-connection-hub.ts`) — not REST-shaped responses. Two topics push a plain envelope instead, straight from the write that changed something rather than through the bus: `document:<id>`/`documents` from the row that changed, and `session:<id>` from agent-orchestration's own activity gateway — a content-free `{type:"update", topic, kind:"session.activity", data:{sessionId}}` nudge telling the client to re-fetch, not the activity itself. There is no separate session websocket any more.
- Subscribe authorization for per-thread topics goes through `canSubscribe` — see the [authorization model](./authorization-model.md).

A separate worker channel `GET /ws/worker?token=<HYPERIDLE_WORKER_TOKEN>` (`layers/agent-orchestration/run-orchestration/src/worker-ingress.ts`) carries Zod-validated register/event/session_result/error/pause/resume messages for remote harness workers.

Web client: singleton `layers/core-ui/src/services/ws-client.ts` — lazy connect on first subscriber, auto-reconnect with 1s→15s backoff.

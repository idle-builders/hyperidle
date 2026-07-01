# As-Implemented Domain Architecture

Code-derived domain view. Each diagram shows domain ownership and the interfaces between domains.

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
    FabricExtension["Fabric metadata\nlayer, kind, scores"]
    Relevance["Relevance and attention"]
    Writeback["Sandbox writeback"]
    KnowledgeAPI["Interface\nknowledge/search APIs\nstrategy repository interface\nknowledge events"]
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
  StrategyContract["Strategy Port\nassembleContext\nbeginLearningIngestion\nscaffoldAgents\nselectAgent\ndecomposeBet\nformAssistant"]
  ToolContract["Tool Invocation\nregistry.invoke(tool, input, context)\noptional MCP exposure"]
  MountContract["Filesystem Mount\nregistered filesystems\nagent injection\nsession capture"]
  EventContract["Domain Events\ntyped EventBus\nstate, message, knowledge,\ncost, notification events"]

  Coordination["Coordination"] -- "creates" --> SessionRequest
  Conversation["Conversation"] -- "creates" --> SessionRequest
  SessionRequest --> Session["Agent session"]
  Session -- "emits" --> SessionEvents
  Session -- "calls" --> StrategyContract
  Session -- "calls" --> HarnessContract
  Session -- "calls" --> ToolContract
  Session -- "calls" --> MountContract
  Coordination -- "emits/subscribes" --> EventContract
  Conversation -- "emits/subscribes" --> EventContract
  Knowledge -- "emits/subscribes" --> EventContract
  Session -- "emits/subscribes" --> EventContract
```

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

  BetState["Bet state machine\ncommit, ship, kill, outcome"] --> Bet
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

## L2 - Knowledge Domain

```mermaid
flowchart TB
  KnowledgeItem["Knowledge item\ncanonical content and scope"]
  FabricMeta["Fabric extension\nlayer, kind, confidence,\nrelevance, attention"]
  EditLog["Edit log"]
  AccessLog["Access log"]
  Conflict["Conflict"]

  KnowledgeItem --> FabricMeta
  KnowledgeItem --> EditLog
  KnowledgeItem --> AccessLog
  KnowledgeItem --> Conflict

  Repository["Knowledge repository"] --> KnowledgeItem
  Repository --> FabricMeta
  Search["Search"] --> Repository
  Relevance["Relevance service"] --> FabricMeta
  Attention["Attention service"] --> FabricMeta
  Attention --> ReviewItem["Review item"]
  Writeback["Sandbox writeback"] --> Repository
  Promotion["Promotion pipeline"] --> Repository

  KnowledgeAPI["Knowledge API"] --> Repository
  SessionContext["Session context assembly"] --> Repository
  Repository -- "knowledge_created/updated/accessed/archived" --> Events["EventBus"]
```

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

  StrategyInterface["Strategy interface"] --> Context
  HarnessInterface["Harness interface"] --> HarnessRun
  ToolInterface["Tool interface"] --> ToolInvocation
  MountInterface["Mount/capture interface"] --> Workspace
```

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

## L2 - Strategy/Fabric Domain

```mermaid
flowchart TB
  StrategyPort["Strategy port"]
  FabricStrategy["Fabric strategy"]
  MinimalStrategy["Minimal strategy"]

  StrategyPort --> FabricStrategy
  StrategyPort --> MinimalStrategy

  FabricStrategy --> ContextAssembly["Context assembly"]
  FabricStrategy --> LearningIngestion["Learning ingestion"]
  FabricStrategy --> AgentScaffold["Agent scaffold"]
  FabricStrategy --> AgentSelection["Agent selection"]
  FabricStrategy --> BetDecompose["Bet decomposition plan"]
  FabricStrategy --> AssistantForm["Assistant formation"]

  ContextAssembly --> KnowledgeRepo["Knowledge repository"]
  ContextAssembly --> PromptFiles["Prompt/context files"]
  LearningIngestion --> FileWatcher["File watcher"]
  FileWatcher --> Writeback["Writeback"]
  KnowledgeRepo --> Relevance["Relevance scoring"]
  KnowledgeRepo --> Attention["Attention scoring"]
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

  BetActive["Bet becomes active"] --> Decomposition["Bet decomposition"]
  Decomposition --> DirectAdapterRun["Direct adapter.startSession\nPM decomposition run"]
  DirectAdapterRun --> HarnessAdapter

  HarnessAdapter --> Builtin["Builtin harness"]
  HarnessAdapter --> CLI["CLI harness"]
  HarnessAdapter --> Remote["Remote harness"]
```

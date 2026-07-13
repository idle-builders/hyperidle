# Runtime Simplification: Dependency Graph (As-Is vs As-Should)

Tracks Core App / Agent Layer / Plugin ownership boundaries for Track AU. Graphs and trees only, no
tables. Companion target doc (untouched by this file): `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`.

**Live state as of 2026-07-13:** every domain-ownership WP (AU12–AU16, AU18) is merged to
`origin/main`. AU17 (the package split) is CI-green on **PR #447**, held from merge — see §5.
AU8 (should-graph guard) has not started.

---

## 1. As-Is Graph — merged `origin/main` (current live state, unaltered from prior revision)

```mermaid
flowchart TD
  HumanInterface[Human Interface<br/>web, desktop, stories] --> ServerCore[Server Core<br/>routes, app factory, domain services]
  DesktopShell[Desktop Shell] --> ServerCore

  ServerCore --> CoreDomains[Core product domains<br/>work, conversations, knowledge, notifications, users, settings, routines<br/>AU11: former app-runtime dispatch/scheduling folded in directly]
  CoreDomains --> CanonicalStore[(Canonical DB)]
  CoreDomains --> DomainEvents[Domain events<br/>wake hint only]
  CoreDomains -- "same tx as domain write" --> AgentWorkIntents[(agent_work_intents<br/>7 families, AU9)]

  ServerCore --> SettingsRoutes[Settings routes]
  SettingsRoutes --> PluginConfig[Plugin configuration service<br/>defaults, overrides, resolved config]
  BuiltInDefaults[Built-in/default configuration] --> PluginConfig
  BuiltInToolCatalog[(builtin-tool-catalog.ts<br/>pure data, AU10)] --> PluginConfig
  BuiltInToolCatalog --> ToolRegistry

  AgentWorkIntents --> IntentWorker[Intent worker<br/>drainAgentWorkIntents, AU9<br/>sole resolver + request creator]
  DomainEvents -.wake.-> IntentWorker
  IntentWorker --> PluginConfig
  IntentWorker --> AgentSessionRequests[(Agent session requests)]

  AgentSessionRequests --> AgentRunBoundary[Agent run boundary<br/>execute request, lifecycle read model]
  AgentRunBoundary --> AgentSessionRuntime[Agent session runtime<br/>AU9: single-writer custody<br/>claim, admit, terminal, boot recovery]
  AgentSessionRuntime --> SessionProvisioning[session-provisioning.ts]
  SessionProvisioning --> HarnessAdapters[Harness adapters]
  SessionProvisioning --> ToolRegistry[Tool registry]
  SessionProvisioning --> McpBridge[MCP bridge]
  SessionProvisioning --> SessionLifecycle[Session lifecycle and writeback]

  AgentSessionRuntime -- "terminal, AU9" --> LifecycleInbox[(agent_lifecycle_inbox)]
  LifecycleInbox --> LifecycleProjectors[Per-family lifecycle projectors<br/>core-owned, AU9]
  LifecycleProjectors --> CoreDomains

  CoreDomains -- "routine-scheduler.ts fire-time call<br/>residual edge, AU8-tracked, AU11" --> AgentSelection[agent-selection.ts<br/>agent-owned]

  CoreDomains -. "eval-only cross-package export<br/>routines.ts, AU11" .-> RoutinesExport[/"@hyperidle/server/routines"/]
```

This is `origin/main` right now — AU17 has not merged, so this graph (single `packages/server`,
`@hyperidle/server/routines` export) is still exactly accurate.

---

## 2. As-Is Graph — PR #447 branch (unmerged), same runtime flow, package boundaries added

Identical nodes and edges to §1, redrawn with the three new package boundaries as subgraphs so you
can see which package each runtime component would move into if #447 merges.

```mermaid
flowchart TD
  subgraph ServerPkg["@hyperidle/server (composition root)"]
    HumanInterface[Human Interface<br/>web, desktop, stories] --> ServerCore[Server Core<br/>routes, app factory]
    DesktopShell[Desktop Shell] --> ServerCore
    SettingsRoutes[Settings routes]
  end

  subgraph CoreAppPkg["@hyperidle/core-app"]
    CoreDomains[Core product domains<br/>work, conversations, knowledge, notifications, users, settings, routines]
    CoreDomains --> CanonicalStore[(Canonical DB)]
    CoreDomains --> DomainEvents[Domain events<br/>wake hint only]
    CoreDomains -- "same tx" --> AgentWorkIntents[(agent_work_intents<br/>7 families)]
    PluginConfig[Plugin configuration service]
    BuiltInDefaults[Built-in/default configuration] --> PluginConfig
    BuiltInToolCatalog[(builtin-tool-catalog.ts)] --> PluginConfig
  end

  subgraph AgentLayerPkg["@hyperidle/agent-layer"]
    IntentWorker[Intent worker<br/>drainAgentWorkIntents<br/>sole resolver + request creator]
    AgentSessionRequests[(Agent session requests)]
    AgentRunBoundary[Agent run boundary]
    AgentSessionRuntime[Agent session runtime<br/>single-writer custody]
    SessionProvisioning[session-provisioning.ts]
    HarnessAdapters[Harness adapters]
    ToolRegistry[Tool registry]
    McpBridge[MCP bridge]
    SessionLifecycle[Session lifecycle and writeback]
    LifecycleInbox[(agent_lifecycle_inbox)]
    LifecycleProjectors[Per-family lifecycle projectors]
    AgentSelection[agent-selection.ts]
  end

  ServerCore --> CoreDomains
  ServerCore --> AgentSessionRequests
  ServerCore --> AgentRunBoundary
  SettingsRoutes --> PluginConfig
  BuiltInToolCatalog --> ToolRegistry

  AgentWorkIntents --> IntentWorker
  DomainEvents -.wake.-> IntentWorker
  IntentWorker --> PluginConfig
  IntentWorker --> AgentSessionRequests

  AgentSessionRequests --> AgentRunBoundary
  AgentRunBoundary --> AgentSessionRuntime
  AgentSessionRuntime --> SessionProvisioning
  SessionProvisioning --> HarnessAdapters
  SessionProvisioning --> ToolRegistry
  SessionProvisioning --> McpBridge
  SessionProvisioning --> SessionLifecycle

  AgentSessionRuntime -- "terminal" --> LifecycleInbox
  LifecycleInbox --> LifecycleProjectors
  LifecycleProjectors --> CoreDomains

  CoreDomains -- "fire-time call<br/>residual edge, AU8-tracked" --> AgentSelection

  CoreDomains -. "eval-only export<br/>agent-layer/routines" .-> RoutinesExport[/"@hyperidle/agent-layer/routines"/]
```

Note the one topology change visible here versus §1: the curated cross-package export moves from
`@hyperidle/server/routines` to `@hyperidle/agent-layer/routines` (`packages/eval` now imports the
two new packages directly, no longer routes through `packages/server`).

---

## 3. As-Should Graph (target — byte-identical to the version before this doc's edits, unaltered)

```mermaid
flowchart TD
  HumanInterface[Human Interface<br/>web, desktop, stories] --> CoreApp[Core App]

  CoreApp --> Work[Work]
  CoreApp --> Conversations[Conversations]
  CoreApp --> Knowledge[Knowledge]
  CoreApp --> Users[Users]
  CoreApp --> Settings[Settings]
  CoreApp --> DomainEvents[Domain events]
  CoreApp --> CanonicalStore[(Canonical DB)]

  PluginBundles[Plugin bundles] --> PluginLoader[Plugin loader]
  PluginLoader --> PluginDefaults[Typed config defaults only]
  Settings --> ConfigStore[Effective configuration store]
  PluginDefaults --> ConfigStore
  UserOverrides[User and team overrides] --> ConfigStore

  DomainEvents --> TriggerResolver[Agent layer trigger resolver]
  ConfigStore --> TriggerResolver
  TriggerResolver --> RequestQueue[(Agent session request queue)]
  RequestQueue --> AgentRunOrchestrator[Agent run orchestrator]

  AgentRunOrchestrator --> ContextProviders[Context providers<br/>backed by core Knowledge]
  AgentRunOrchestrator --> HarnessRegistry[Harness registry]
  AgentRunOrchestrator --> ToolProvider[Tool provider]
  AgentRunOrchestrator --> McpProvider[MCP provider]
  AgentRunOrchestrator --> CaptureWriteback[Capture and writeback providers]

  ContextProviders --> Knowledge
  CaptureWriteback --> Knowledge
  CaptureWriteback --> DomainEvents

  HarnessRegistry --> ExternalHarnesses[External harnesses]
  ToolProvider --> ExternalTools[External tools]
  McpProvider --> ExternalMcp[MCP servers]
```

---

## 4. Folder Trees — Core App / Agent Layer (PR #447 branch)

### 4a. As-is — package boundary real, internal shape NOT domain-split

```
packages/core-app/src/
├── config/                 3 files   (git-export-config, builtin-routines, builtin-tool-catalog)
├── knowledge/               15 files  ✅ pre-existing subfolder, carried over unchanged
├── notifications/           15 files  ✅ pre-existing subfolder, carried over unchanged
├── schemas/                 3 files   (pure zod: artifact-preview, bet, common)
└── services/                43 files  ⚠️ FLAT — no domain grouping
    ├── work-service.ts              ← Work
    ├── routine-service.ts           ← Routine
    ├── conversation-store.ts        ← Conversations
    ├── user-store.ts                ← Users
    ├── server-config.ts             ← Settings
    ├── plugin-configuration.ts      ← Settings
    ├── agent-behavior-config.ts     ← Settings
    └── ...36 more with no domain grouping
        (invite-code.ts, item-router.ts, like-escape.ts, org-edges.ts,
         schedule-label.ts, ws-broadcaster.ts, credential-encryption.ts,
         model-gateway.ts, task-state-machine.ts, bet-kill-cascade.ts, ...)

packages/agent-layer/src/
├── harness/                 20 files  ✅ pre-existing subfolder, carried over unchanged
├── mcp/                     2 files   ✅ pre-existing subfolder, carried over unchanged
├── tools/                   28 files  ✅ pre-existing subfolder, carried over unchanged
├── services/agent-context/  1 file
├── services/agent-defaults/ 1 file
└── services/                31 files  ⚠️ FLAT — no domain grouping
    ├── trigger-resolution.ts        ← Trigger resolution
    ├── agent-run-boundary.ts        ← Run orchestration
    ├── agent-session-runtime.ts     ← Run orchestration
    ├── agent-session-requests.ts    ← Run orchestration
    ├── context-assembly.ts          ← Context providers
    ├── cost-cap.ts, cost-sentinel.ts ← Cost
    ├── session-lifecycle.ts         ← Lifecycle
    ├── session-provisioning.ts      ← Lifecycle
    └── ...23 more with no domain grouping
        (agent-selection.ts, select-agent.ts, routine-scheduler.ts,
         builtin-routine-handlers.ts, task-dispatcher.ts,
         assistant-dispatcher.ts, writeback.ts, file-watcher.ts, ...)

packages/server/src/                (composition root — routes + wiring only, 68 files)
├── routes/          38 files (HTTP surface)
├── middleware/       8 files
├── auth/             3 files
├── filesystem/       8 files
├── services/         2 prod files (mcp-route.ts, worker-ws.ts — inbound transport only)
└── app.ts, index.ts, server-factory.ts, session.ts
```

**Root cause:** AU17's plan moved the old monolith's flat `services/` bucket as-is into two smaller
flat buckets and declared further reorganization out of scope ("one boundary at a time"). The
package *boundary* is real and compiler-enforced; the internal *shape* does not match the
as-should graph's domain separation.

### 4b. As-should (target — illustrative grouping, not yet built, no WP registered)

```
packages/core-app/src/
├── work/            work-service.ts, bet-state-machine.ts, bet-kill-cascade.ts, task-*, item-router.ts
├── conversation/    conversation-store.ts
├── users/           user-store.ts, login-session.ts, invite-code.ts
├── knowledge/       (unchanged)
├── notifications/   (unchanged)
├── settings/        server-config.ts, plugin-configuration.ts, agent-behavior-config.ts, config/
├── routine/         routine-service.ts
└── shared/          files with no single clear domain owner — needs its own audit
                      (ws-broadcaster.ts, org-edges.ts, credential-encryption.ts, model-gateway.ts, ...)

packages/agent-layer/src/
├── harness/         (unchanged)
├── mcp/             (unchanged)
├── tools/           (unchanged)
├── execution/       agent-run-boundary.ts, agent-session-runtime.ts, agent-session-requests.ts,
                      trigger-resolution.ts, agent-selection.ts, select-agent.ts
├── dispatch/        task-dispatcher.ts, assistant-dispatcher.ts, routine-scheduler.ts,
                      builtin-routine-handlers.ts, bet-decomposition*.ts
├── context/         context-assembly.ts, context-assembly-prompt.ts, session-context.ts, agent-context/
├── lifecycle/       session-lifecycle.ts, session-provisioning.ts, routine-session-reaper.ts, sandbox-reaper.ts
└── cost/            cost-cap.ts, cost-sentinel.ts
```

Illustrative only — grouped from the as-is flat file list under the as-should graph's named domains,
not yet critiqued or built. A follow-up WP is the concrete path from §4a to §4b.

---

## 5. Work Package Status Graph

```mermaid
flowchart LR
  AU11[AU11 — merged #428] --> AU12[AU12 — merged #435<br/>Conversation+Users]
  AU11 --> AU13[AU13 — merged #436+#442<br/>Work+Routine]
  AU13 --> AU15[AU15 — merged #445<br/>Routine to intent queue]
  AU14[AU14 — merged #434+#441<br/>Knowledge]
  AU16[AU16 — merged #440<br/>Harness read-model]
  AU18[AU18 — merged #446<br/>Notification+Settings]
  AU12 --> AU17["AU17 — CI-green, PR #447<br/>HELD FROM MERGE<br/>package boundary only, see §4"]
  AU13 --> AU17
  AU14 --> AU17
  AU15 --> AU17
  AU16 --> AU17
  AU18 --> AU17
  AU17 -.blocked.-> AU8[AU8 — not started<br/>should-graph guard]

  style AU17 fill:#7a1f1f,color:#fff
```

All six of AU17's dependencies (AU12/13/14/15/16/18) are merged. AU17 itself is CI-green but is
being deliberately **held from merge** pending a decision on the folder-reorg gap in §4. AU8 stays
blocked until AU17 lands.

---

## 6. Guard Coverage Graph (`npm run lint`)

```mermaid
flowchart LR
  Lint[npm run lint]

  Lint --> AU3g[au3-runtime-vocab-guard]
  Lint --> AU6g[au6-agent-boundary-guard]
  Lint --> AU7g[au7-runtime-retirement-guard]
  Lint --> AU10g[au10-plugin-config-ownership-guard]
  Lint --> AU12g[au12-conversation-users-ownership-guard]
  Lint --> AU13g[au13-work-routine-ownership-guard]
  Lint --> AU14g[au14-knowledge-ownership-guard]
  Lint --> AU18g[au18-notification-ownership-guard]
  Lint --> HHg[honest-harness-guard]

  AU3g -->|enforces| E3[No Strategy/Fabric/app-runtime vocabulary]
  AU6g -->|enforces| E6[Request-consumption ownership]
  AU7g -->|enforces| E7[Strategy/Fabric runtime retirement]
  AU10g -->|enforces| E10[No runtime-execution import in plugin config]
  AU12g -->|enforces| E12[Sole owner: threads / messages / users]
  AU13g -->|enforces| E13[Sole owner: bets / tasks / items / routines]
  AU14g -->|enforces| E14[Sole route to knowledgeItems]
  AU18g -->|enforces| E18[Sole owner: notificationQueue]
  HHg -->|enforces| EH[No stubbed harness integration tests]

  subgraph PR447["Only on PR #447 (unmerged)"]
    AU17g[au17-package-boundary-guard]
    AU17g -->|enforces| E17[core-app cannot import agent-layer<br/>+ AC-2 typecheck-boundary proof]
    Retired[Retired, superseded by real package boundary]
    Retired -.was.-> AU9g[au9-direct-handoff-guard]
    Retired -.was.-> AU11g[au11-runtime-ownership-guard]
  end
```

---

## 7. Gap Register Tree

```mermaid
flowchart TD
  Gaps[Should-Graph Gaps]
  Gaps --> Open[Open]
  Gaps --> Deliberate[Deliberate exceptions — not violations]

  Open --> G1[Core-app-imports-plugin-internals check<br/>no guard exists — AU8's job]
  Open --> G2[Agent-layer-owns-core-CRUD check<br/>proven only by regression tests, not statically — AU8's job]
  Open --> G3[Prompt Catalog, 8th config catalog in as-should graph<br/>not built — CONFIGURATION_KINDS has no 'prompt' kind — product decision]
  Open --> G6["Domain-folder reorg, §4<br/>flat services/ in both new packages<br/>not registered as a WP"]
  Open --> G7["AU17 merge itself<br/>CI-green but HELD, pending a decision on G6"]

  Deliberate --> G4["routine-scheduler.ts fire-time call<br/>into agent-selection.ts — Core calling Agent<br/>directly, bypasses intent-queue pattern<br/>needs an explicit AU8 allowlist entry"]
  Deliberate --> G5["@hyperidle/agent-layer/routines<br/>3-function curated export, eval-only<br/>guard-pinned, not a barrel"]
```

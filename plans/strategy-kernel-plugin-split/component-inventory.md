# Strategy Kernel Removal: Component Inventory And Recommendations

Purpose: list the live system components around Strategy/Kernel/Fabric, then recommend candidate ownership for the plugin split. Component names are the organizing model; paths are only code anchors for verification. Recommendations are intentionally reviewable, not final decisions.

## Proposed Vocabulary

Replace the process-wide Strategy concept with these narrower nouns:

- Plugin: installable bundle that can contribute agents, skills, routines, triggers, tools, MCP servers, harness adapters, and settings UI.
- Trigger: persisted rule mapping a domain event to an LLM-capable action. If no specific trigger exists, core falls back to "attach the default eligible agent with no prompt override."
- Runtime core: stable app/runtime machinery that executes sessions, invokes tools, bridges MCP, stores entities, and emits events.
- Fabric plugin: first-party plugin bundle containing the current knowledge fabric behavior.

## Inventory Matrix

| System component | Code anchor | Current owner | Recommendation | Notes |
|---|---|---:|---:|---|
| Active Strategy singleton | `server/services/strategy-registry.ts` | Server | Remove/replace | Replace with plugin registry + trigger dispatcher. Avoid one active global "brain." |
| Strategy interface | `shared/strategy-port.ts` | Shared | Split into plugin extension contracts | Current interface mixes context, ingestion, agents, selection, decomposition, assistant formation. |
| Fabric Strategy adapter | `fabric/fabric-strategy.ts` | Fabric | Retire adapter; move behavior into Fabric plugin manifests/handlers | Adapter is mostly delegation and becomes unnecessary once plugin contracts exist. |
| Minimal Strategy | `strategy-minimal/*` | Package | Replace with fixture/test plugin | Useful as test baseline, but not as product concept. |
| Fabric bootstrap | `fabric/bootstrap.ts` | Fabric | Convert into Fabric plugin activation | It already behaves like plugin activation: registers subscribers/schedulers and returns disposers. |
| EventBus + DomainEvent | `shared/events.ts` | Shared/core | Keep core | Trigger system should use this as the event spine. |
| Trigger event vocabulary | `shared/events.ts`, routine rows | Shared/db/fabric | Keep core, formalize | Every event that can call an LLM gets a trigger surface. Missing specific trigger means default agent/no prompt. |
| Routine rows | `db/schema.ts` routines/routine_runs | DB/core | Keep core | Scheduling/editing/history are app features. Handler/prompt can be plugin-provided. |
| Routine scheduler | `fabric/services/routine-scheduler.ts` | Fabric | Split | Core scheduler should evaluate persisted triggers; Fabric-specific handlers become plugin handlers. |
| Built-in routines | `fabric/services/builtin-routines.ts` | Fabric | Plugin | These are first-party Fabric plugin routines. |
| Task dispatcher | `fabric/services/task-dispatcher.ts` | Fabric | Move core or "core automation plugin" | It provisions accepted tasks. This is runtime backbone, not knowledge-specific. |
| Agent identity rows | `db/schema.ts` users | DB/core | Keep core | Agents as users remain core. Plugins can contribute default agent templates. |
| Agent roster/persona creation | `fabric/roster.ts`, `scaffoldAgents` call sites | Strategy/Fabric | Plugin | Plugin contributes agent templates and default roster rules. Core persists rows. |
| Agent selection | `selectAgent`, `fabric/services/agent-selection.ts` | Strategy/Fabric | Trigger/plugin handler | Event/trigger should choose agent/prompt at runtime. Core validates selected user/session. No match falls back to default eligible agent. |
| Bet decomposition | `server/services/bet-decomposition.ts`, `decomposeBet` | Server + Strategy | Split | Core owns bet state/session execution. Plugin/trigger owns decomposer agent + prompt + optional task plan. |
| Assistant formation | `assistant-turn.ts`, `formAssistant` | Server + Strategy | Trigger/plugin handler | Message event should attach assistant agent + prompt + draft tool surface. |
| Context assembly | `fabric/context-assembly.ts` | Fabric Strategy | Plugin hook | Core provides sandbox; plugin writes context. |
| Learning ingestion | `fabric/file-watcher.ts`, writeback | Fabric Strategy | Plugin hook | Core owns lifecycle and disposal; plugin owns interpretation/writeback. |
| Knowledge items | `db/schema.ts` knowledge_items | DB/core | Keep core | CRUD/editing/search surface remain app core. |
| `knowledge_strategy_fabric` | `db/schema.ts` | DB/Fabric | Rename/rehome | If Fabric is plugin, table should become plugin-owned projection, e.g. `plugin_state` or `knowledge_fabric_projection`. |
| `task_strategy_fabric` | `db/schema.ts` | DB/Fabric | Rename/rehome | Same; current name bakes Strategy into schema. |
| User skills | `db/schema.ts` user_skills | DB/core-ish | Keep core schema, plugin supplies skill definitions | Current "skills" are records/counters, not executable packages. |
| Tool definitions | `server/tools/tool-registry.ts` | Server | Split | Core registry/invocation stays; tool catalog becomes core tools + plugin tool packs. |
| MCP bridge | `server/mcp/*` | Server | Keep core | Transport for registered tool surface. Plugins can contribute MCP server descriptors/tools. |
| Harness adapter pool | `server/harness/adapter-pool.ts` | Server | Split | Core contract/registry stays; concrete harnesses can be plugin-provided except bundled builtin. |
| CLI harness dialects | `server/harness/adapter-pool.ts`, `cli-mcp-config.ts` | Server | Plugin | Codex/OpenCode/Claude details fit harness plugin units. |
| Return hooks/plugins | `server/harness/provision-return-hook.ts` | Server | Split | Core owns return contract; per-harness hook content belongs to harness plugin. |
| Service connections | `server/services/service-connection-*`, credentials routes | Server | Keep core | Plugins declare required connections; core stores/resolves credentials. |
| Notifications | `fabric/services/notifications/*`, notification routes | Fabric/server | Plugin + core queue | Queue/delivery route might stay core; Fabric notification policies/adapters can be plugins. |
| Relevance/attention/scoring | `fabric/services/*`, `fabric/*scoring*` | Fabric | Plugin | Knowledge Fabric behavior. |
| Lifecycle propagation | `fabric/services/lifecycle-propagation.ts` | Fabric | Review | Could be core process automation or Fabric plugin policy. Needs founder decision. |
| Git export | `fabric/services/git-export*`, routes | Fabric/server | Plugin or optional core module | Export policy is plugin-like; route/UI may stay core if generic. |

## Candidate Plugin Contracts

A plugin should be able to contribute these independently:

| Contract | Inputs | Output/action | Replaces current |
|---|---|---|---|
| `agents` | team/user/factory context | agent templates: role/name/prompt/default harness prefs? | `scaffoldAgents`, `fabric/roster.ts`, `strategy-minimal` |
| `skills` | plugin manifest + DB state | skill definitions + autonomy metadata | `user_skills` without executable package model |
| `tools` | `ToolContext`, Zod schema | `ToolDefinition[]` | `ALL_TOOL_DEFINITIONS` growth |
| `mcpServers` | session/plugin config | MCP server descriptors or proxied tool sets | hard-coded per-session HyperIdle-only MCP bridge |
| `routines` | routine manifest + handler | routine templates + executable handlers | `builtin-routines.ts` |
| `triggers` | `DomainEvent`, persisted trigger row | attach agent, call routine handler, enqueue session, mutate app state, or fall back to default attach | hard-coded subscribers + Strategy calls |
| `contextProviders` | session admission context | files written to sandbox | `assembleContext` |
| `ingestionHandlers` | session sandbox/manifest/end event | captures/writeback/projections | `beginLearningIngestion` |
| `harnesses` | adapter descriptor/config | `HarnessAdapter` registration + MCP dialect + return hook | adapter-pool literals |
| `settingsUi` | plugin config schema | editable config in app | current scattered settings routes/forms |

## Trigger Model Recommendation

Core should persist trigger definitions, evaluate them against EventBus events, and execute narrow actions. Every event that can call an LLM should have a trigger surface. The absence of a specific trigger is not an error; it executes the default minimal behavior.

```ts
type TriggerResolution =
  | { kind: "default_attach" }
  | { kind: "attach_agent"; agentId: string; promptTemplateId: string; toolSurfaceId?: string }
  | { kind: "run_routine"; routineId: string }
  | { kind: "call_plugin_handler"; pluginId: string; handlerId: string };
```

Default attach means: choose the default eligible agent for the event's scope and run with no event-specific prompt override. This preserves the useful part of Minimal Strategy as core fallback behavior.

Initial trigger sources to migrate:

- `thread_message_appended` -> attach assistant agent with assistant prompt/tool surface.
- `task_state_changed(accepted)` -> attach task owner agent.
- `bet_state_changed(active)` -> attach decomposer agent or call decomposition handler.
- `work_selection_requested` -> choose owner agent.
- `work_decompose_requested` -> choose decomposer and optional decomposition handler.
- `routine_fired` and routine calendar/event triggers -> run routine handler.
- `proposed_call_granted` -> attach grant-bearing session.
- `knowledge_accessed` -> call Fabric relevance handler.

This makes "which agent with which prompt attaches to which event" editable data instead of hidden code, while still allowing the system to act when nothing custom is configured.

## Migration Slices

1. Inventory and freeze current behavior with tests around Strategy seams.
2. Introduce `PluginRegistry` and plugin manifest types without changing behavior.
3. Register a first-party `fabric` plugin that wraps current Fabric bootstrap + Fabric Strategy methods.
4. Move Strategy methods into smaller plugin contracts: agents, context, ingestion, selection, assistant formation, decomposition.
5. Replace StrategyRegistry reads with PluginRegistry queries/trigger dispatch plus default attach fallback.
6. Rename schema/code nouns containing `strategy` only after behavior is preserved.
7. Move hard-coded tools into core tool pack + Fabric tool pack.
8. Move harness literals into harness plugin descriptors.
9. Add app-editable trigger rows and UI.
10. Delete Strategy port/package/guards once no call sites remain.

## Review Questions

- Should task dispatch be core runtime or a first-party automation plugin?
- Should lifecycle propagation be core process behavior or Fabric policy?
- Should notification delivery adapters be core connectors or plugins?
- Should `knowledge_strategy_fabric` become a Fabric plugin table, a generic plugin projection table, or stay as legacy migration target?
- Should built-in first-party app tools remain always available, or become a locked core plugin?
- Should plugins be allowed to define default harness/model preferences for agents, or only prompts/tools/skills?
- What is the exact default eligible agent per event scope: assistant for user threads, task owner for tasks, product manager for decomposition, or first active team agent?

## High-Risk Couplings

- Server still imports many Fabric exports directly; package-level split is incomplete.
- `Strategy<TDb>` is shared and generic, but concrete behavior assumes DB schema and Fabric tables.
- `routines.triggerConfig` is untyped JSON; plugin triggers need typed schemas.
- Trigger conflict resolution must be explicit: user trigger should override plugin defaults, and more specific scope should override broader scope.
- `ToolRegistry` is hard-coded and role-filtered; plugin tools need conflict handling, ordering, and role/agent scoping.
- MCP bridge is per-session and role-filtered; plugin MCP servers must not bypass `registry.invoke`.
- Harness return hooks are per-harness generated files; harness plugins need lifecycle hooks for provisioning.
- Assistant response trigger is inline in `threads.ts`, while assistant dispatcher only pins after AI response. Migration must not double-dispatch.

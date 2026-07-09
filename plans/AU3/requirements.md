DOC-CLASS: significant

# AU3 Requirements: No Fabric Runtime Layer

## Required Reading

- `.pipeline/work-packages/TRACK-AU.md`
- `.pipeline/work-packages/AU2/requirements.md`
- `.pipeline/plans/AU2.md`
- `docs/architecture/runtime-simplification.md`
- `docs/architecture/as-implemented-domain-architecture.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/data-flow-examples.md`
- `docs/architecture/run-unit-model.md`
- `docs/agent-layer/agent-model.md`
- `docs/agent-layer/harness-capability-descriptor.md`
- `docs/knowledge-architecture/the-canonical-store.md`
- `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md`
- `docs/knowledge-architecture/relevance-and-attention.md`
- `docs/process-layer/tasks-and-sessions.md`
- `docs/process-layer/bets-shape-commit-change-ship.md`
- `docs/process-layer/routines-and-retros.md`
- `docs/architecture/connection-model.md`
- `plans/strategy-kernel-plugin-split/dependency-graph.md`
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`

## Goal

HyperIdle should boot and run as two runtime boundaries: core app domains plus the agent layer. Knowledge is a normal core app domain, plugins are configuration seeds, and LLM execution lives only in the agent layer. AU3 removes the old Fabric/Strategy runtime concept from production boot, package dependencies, runtime registries, and developer/user vocabulary while preserving today's Work, Conversation, Knowledge, Users, Settings, Routine, notification, and session behavior.

Maintainers get one dependency shape they can explain without a third runtime: core app stores domain records and emits events; agent layer accepts session requests, assembles context, runs harnesses/tools/MCP, captures output, and publishes lifecycle events. AU4 can then add one trigger path without competing with hidden Strategy calls or Fabric subscribers.

## Success

- Production boot does not register, select, or require a Strategy or Fabric runtime layer.
- Server/core production code has no runtime dependency on `@hyperidle/fabric`, `@hyperidle/strategy-minimal`, or `strategy-registry`.
- Existing Work, Conversation, Knowledge, Users, Settings, Routine, notification, git export, context assembly, writeback, selection, decomposition, and dispatch behavior remains observable through app-owned services.
- The agent layer is the only owner of LLM execution mechanics: session request intake, admission, provisioning, harness execution, tool/MCP invocation, context/capture, and lifecycle events.
- Former Fabric-named durable rows stay readable and are projected through app-owned vocabulary; AU3 does not drop data.
- User-facing and developer-facing runtime docs/logs/errors/configuration no longer teach "Fabric" or "Strategy" as concepts needed to run HyperIdle.

## Scope

In scope:

- Removing the active Strategy registry and Strategy port from production runtime.
- Removing production imports and package dependency edges from server/core to `@hyperidle/fabric` and `@hyperidle/strategy-minimal`.
- Rehoming former Fabric services into app-owned domain services or agent-layer services.
- Rehoming built-in routines, roster/persona defaults, tools, MCP defaults, harness descriptors, and assistant/decomposition defaults behind AU2 configuration projection where applicable.
- Providing app-owned aliases/read models for existing Fabric-named durable data.
- Static gates that prevent Strategy/Fabric runtime vocabulary or imports from returning in production code.
- Updating architecture docs that still present Kernel/Strategy/Fabric as the current boundary.

Out of scope:

- AU4's trigger resolver and full event-to-agent trigger runtime.
- AU5's editable settings UI.
- Plugin package distribution, marketplace, signing, trust tiers, sandboxing, or governance.
- Remote worker scheduling changes.
- Changing knowledge scoring quality, context relevance algorithms, decomposition quality, or agent work policy beyond preserving current behavior under app-owned names.
- Dropping or destructively renaming existing Fabric-named physical tables in the same migration that removes runtime vocabulary.

## Guide Draft

HyperIdle now runs with a core app and an agent layer.

The core app owns Work, Conversation, Knowledge, Users, Settings, Routines, notifications, durable records, domain events, and app configuration. Knowledge is just one of those app domains: humans edit it through the Knowledge view, agents read and write projections of it during sessions, and the database remains the source of truth.

The agent layer owns every LLM-capable run. Domain services do not call harnesses directly. They create or consume session requests, and the agent layer handles admission, context assembly, sandbox setup, tools, MCP, harness execution, capture, writeback, and lifecycle events.

Plugins and built-ins seed editable configuration. Agent defaults, skills, routines, tools, MCP servers, harness descriptors, and prompt defaults are configuration records with provenance. Runtime code reads resolved app configuration; plugin files or Fabric bundles do not own live execution.

Existing databases continue to open. Rows that were originally stored in Fabric-named projection tables are read through app-owned services and response fields. The old physical table names can remain as compatibility storage, but contributors should use the app-owned service names and schema aliases when writing production code.

## Nouns

**Core app domain**: A first-party product domain that owns durable records, API routes, event emission, and human-visible behavior.

Hard rules:

- Core app domains do not provision harness sessions directly.
- Knowledge is a core app domain, not a plugin-only feature and not a runtime layer.
- Core app code may emit session requests or domain events, but LLM execution mechanics stay in the agent layer.

**Agent layer**: The runtime boundary that turns approved app/domain intent into LLM-capable sessions.

Hard rules:

- Owns session request intake, admission, context assembly, provisioning, harness execution, tool/MCP invocation, capture/writeback, and session lifecycle events.
- Does not own Work, Conversation, Knowledge, Users, or Settings records.
- Must not add a second execution path beside AU1 session requests and existing session provisioning.

**App-owned projection**: A compatibility read/write surface over existing projection data that uses HyperIdle domain vocabulary even if the underlying table name is historic.

Hard rules:

- Must be forward-compatible and non-destructive.
- Production callers use app-owned aliases/services, not `Fabric`/`Strategy` names.
- Existing rows remain readable before and after AU3.

## Existing Doc Conflict

`docs/architecture/runtime-simplification.md` and Track AU replace the older Kernel/Strategy/Fabric framing. Several existing docs still call `docs/architecture/kernel-strategy-split.md` authoritative and describe Fabric as the current Strategy runtime. AU3 must update or retire those current-state claims as part of the implementation. Until then, downstream work should treat `runtime-simplification.md` as the governing AU3 boundary and treat `kernel-strategy-split.md` as historical input only.

## Acceptance Criteria And Verification

| AC | Requirement | Verification method |
|---|---|---|
| AC1 | HyperIdle boots without registering or selecting a Strategy or Fabric runtime layer. | Service integration test boots `createServer()` with fixture DB and stub-safe adapters, asserts `/api/health`, `/api/knowledge`, `/api/routines`, `/api/notifications`, `/api/harnesses`, and session request services are available without calling `setActiveStrategy`, `getActiveStrategy`, `fabricStrategy`, or `bootstrapFabric`. Static lint bans those runtime imports/calls in production code. |
| AC2 | Core app domains still expose existing Work, Conversation, Knowledge, Users, Settings, Routine, notification, and git export behavior. | Existing route/service integration tests remain green with assertions preserved; add AU3 integration coverage for representative Knowledge read/write with projection data, routine fire/manual trigger path, notification enqueue/list/drain path, and git export route. |
| AC3 | The agent layer is the only owner of LLM execution behavior. | Service integration tests for task dispatch, assistant turn, decomposition request, routine dispatch, and direct session route assert each creates or consumes an `agent_session_requests`/session provisioning path and never calls a Strategy object. Static lint bans `getActiveStrategy` and Strategy port usage in production source. |
| AC4 | Server/core production code has no runtime dependency on a Fabric package or Fabric boot bundle. | ESLint `no-restricted-imports` bans `@hyperidle/fabric`, `@hyperidle/strategy-minimal`, and `strategy-registry` from production source; `npm run knip:production` reports no production dependency on those packages from `@hyperidle/server`; `package.json` dependency edge is removed. |
| AC5 | Runtime vocabulary no longer presents Fabric or Strategy as concepts needed to configure or run the app. | Static vocabulary guard/lint checks production code, runtime logs/errors, exported public API types, docs current-state pages, and user-facing strings for banned runtime terms, with narrow allowlist for historical docs, migration SQL, compatibility table names, and tests. No readFile/grep unit tests. |
| AC6 | Existing Fabric-named durable data remains readable through forward-compatible app concepts with no data loss. | DB/service integration test starts from rows in `knowledge_strategy_fabric` and `task_strategy_fabric`, runs migrations/boot, reads them through app-owned services/API fields, updates a knowledge item and task signal, and asserts existing row ids/content/scores/history remain present. Migration does not drop those tables. |
| AC7 | Static shape and production health are green. | `npm run check`, `npm run lint`, `npm run test`, and before ship `npm run verify` pass. Static-only properties are enforced by lint/type/knip/scripts, not filesystem-reading tests. |


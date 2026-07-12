# Runtime Simplification Dependency Graph: As-Is vs As-Should

Baseline: `origin/main` at `6dd27dfd` (`docs: update AU dependency graph for AU9-merged and
AU10-shipped status (#427)`). This baseline already includes AU10 merged (`3d9b2226`).

Update: AU6 rework checked against `feat/AU6-agent-execution-boundary` at `4a11aa45`
(`chore: attest AU6 boundary closure`, PR #419). AU6-owned agent execution boundary gaps
are marked separately below from the remaining Strategy/Fabric retirement gaps.

Update: AU7 was sent back through the pipeline after review found the cleanup requirement gap.
The corrected AU7 scope now deletes the live Strategy/Fabric source packages and seam files:
`packages/fabric`, `packages/strategy-minimal`, `packages/shared/src/strategy-port.ts`, and
`packages/server/src/services/strategy-registry.ts`. Server/eval runtime code uses server
app-runtime contracts, and lint now blocks runtime imports/registration of Fabric, minimal
Strategy, Strategy port, active Strategy APIs, and the deleted live paths returning. Durable
historical `strategy`/`fabric` names remain only where old records need to be readable.

Update: AU9 ("Hard agent handoff boundary") merged. PR #425
(`feat(AU9): hard agent handoff boundary — remediation-2 rebuild`) merged to `origin/main`. AU9
replaced the ad-hoc, direct request-creation paths still present at the AU7 baseline with a single
durable handoff: every core route/domain command persists one `agent_work_intents` row (kind,
source, idempotency key — no execution detail) in the same transaction as its own domain write; the
agent layer alone drains, resolves, admits, executes, and projects lifecycle back. This took five
build/review cycles inside AU9 itself before a founder-directed architecture-level re-diagnosis
closed the pattern for good (see `plans/AU9/architecture.md` §Remediation-2, rules R1/R2/R3).

**Update: AU10 ("Plugin surface ownership correction") merged.** PR #426 merged to `origin/main`
at `3d9b2226` (2026-07-11T15:14:57Z) — `npm run verify` and `release-guard` both green on the merge
commit. This document's baseline now includes AU10; all prior "(AU10, pending merge)" markers below
are now just "(AU10)". AU10's audit of the plugin/default configuration surface
(`plugin-configuration.ts`, `agent-behavior-config.ts` — the entire production config-seeder
surface) found exactly one forbidden upward edge: `plugin-configuration.ts:26` imported
`ALL_TOOL_DEFINITIONS` from the runtime `tools/tool-registry.ts` to seed built-in tool config
defaults, pulling in ~20 tool handlers plus `ToolContext` and `app-runtime/contracts` transitively
for what was only ever a name/description/roles/reversibility read. The fix extracted a pure-data
`packages/server/src/config/builtin-tool-catalog.ts` (zero runtime imports — only `import type` from
`@hyperidle/shared`); `tool-registry.ts` now depends on that same catalog too, so both sides depend
downward onto one data source instead of config reaching up into execution. A new static guard,
`scripts/au10-plugin-config-ownership-guard.ts` (AST module-import reachability, not a runtime test,
wired into `npm run lint`), makes the boundary durable — real-tree run finds 0 forbidden imports
post-fix, and its `--fixtures` mode proves it catches both a direct and a transitive leak.
`agent-defaults/resolvers.ts` (which imported `app-runtime/roster` + `app-runtime/services/agent-selection`)
was confirmed out of AU10's scope at the time — that was the AU11 transitional-shell edge, and AU11
(below) has now repointed it.

**Update: AU11 ("Runtime ownership hard cut") is implementation-complete but not yet merged.**
Checked against branch `framework/AU11-runtime-ownership-hard-cut` at commit `c6358a30`
(`chore(AU11): commit fresh verify attestation`), PR #428 — `npm run verify` (2m34s) and
`release-guard` (11s) both green in CI, PR open and mergeable, awaiting human merge. AU11 dissolved
the transitional `packages/server/src/app-runtime/` shell — 67 files, the third runtime owner that
AU9's own review had named but explicitly deferred. Every file was reclassified against the
should-graph and either moved to its owner or deleted:

- 32 files → **Core app** (Knowledge 18, Notifications 14).
- 14 files → **Core app services** (policy, approval-rate, review routing, lifecycle-propagation,
  retention, practice-meeting, git-export — these were already core-shaped, just app-runtime-housed).
- 14 files → **Agent layer** (context-assembly, capture/writeback, roster, agent-selection, task and
  assistant dispatchers, cost, session/sandbox reapers — joined AU9's agent-owned `services/` set).
- 2 files → **Editable config** (`builtin-routines` split into a config-defaults file and an
  agent-owned handler file; `git-export-config.ts`).
- 5+ artifacts **deleted outright**: the barrel `index.ts`, `bootstrapAppRuntime`, the
  `./app-runtime` package export, `runtime-contracts.test.ts` (its premise — a shared app-runtime
  grouping — is what AU11 dissolves), and dead `AdapterPool`/`SandboxAdapter`/`McpBridgeRegistry`
  import-type threading in 3 core routes. Two routes doing genuine execution rather than descriptor
  reads (`mcp-route.ts`, `worker-ws.ts`) were relocated from `routes/` to agent-owned `services/`.
  A round-1 code review additionally caught 5 pre-existing dead files (`knowledge/conflict-resolution.ts`,
  `knowledge/layers.ts`, `services/polling-watcher.ts`, `services/founder-router.ts`,
  `services/provision-registry.ts`) plus ~18 dead exports that the barrel's re-exports had been
  masking from `knip` — the build had initially preserved them via new `knip.json` ignore entries,
  which review rejected as a violation of AC-4 and this repo's "dead code must be deleted, never
  masked" rule; round 2 deleted all of it instead.

A new static guard, `scripts/au11-runtime-ownership-guard.ts` (module-import reachability, same
technique as AU10's guard, wired into `npm run lint`), enforces two properties: AC-1, the
transitional shell can never reappear (no `app-runtime` path segment, no `bootstrapAppRuntime`
symbol, no `./app-runtime` package export); and AC-2, core routes/domain services cannot import
harness adapters, MCP bridge registries, provisioning internals, context assembly, tool execution,
or agent lifecycle internals — walked from every core-classified file, stopping at the agent-owned
boundary. Real-tree run is 0 findings; `--fixtures` mode proves it catches the shell-reappearance
and forbidden-import cases. A curated new package export, `@hyperidle/server/routines` →
`packages/server/src/routines.ts`, re-exports exactly three functions
(`checkAndFireRoutine`, `provisionTeamRoutines`, `runBuiltinRoutine`) for the one legitimate
cross-package consumer, `packages/eval`, that cannot deep-import server `src/`; the guard enforces
its export list stays exactly those three, so it cannot regrow into a second barrel.

One deliberate, named residual edge survived AU11 by design, not oversight: `routine-scheduler.ts`
stays Core (cron/due-eval is a core concern) but its fire-time agent-selection call
(`isAgentAtWipLimit` / `selectAgentByAppDefaults`) still reaches directly into the agent-owned
`agent-selection.ts`. AU11's planning round (critique round 1) explicitly rejected folding this into
the agent layer's intent-worker drain-time resolver, because the intent worker does not select an
agent for routines today (it uses `routine.ownerAgentId` directly) — moving selection there would
relocate a fire-time decision to drain-time, a real behavior change AU11's import-path-only
invariant forbids. This is tracked as an AU8 should-graph-guard boundary item below (gap 6), not a
defect in AU11.

Companion target document: `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`.

This file compares the current runtime dependency graph against the target dependency graph. It is intentionally dependency-focused: it tracks ownership and call direction, not every API route or DB table.

## Executive Summary

The AU7 runtime-retirement, AU9 hard-handoff, AU10 plugin-ownership, and AU11 runtime-ownership
targets are all now reached at the work-package level (AU7, AU9, AU10 merged; AU11
implementation-complete, PR #428 pending merge). Strategy/Fabric are gone from production runtime
and live source; core app routes/services no longer construct, consume, or execute agent requests
directly — they record durable intent, the agent layer does everything downstream of that; the
plugin/default configuration surface no longer imports a runtime execution registry to seed its
defaults; and the transitional `app-runtime/` shell — the third runtime owner AU9's review first
named — no longer exists. Core app and Agent layer are, for the first time, the *only* two runtime
owners in the source tree, matching the as-should graph's shape exactly. The full target graph is
still not mechanically proven end-to-end as a single, unified guard: AU8 has not yet consolidated
the four separate boundary scripts (`au7-runtime-retirement-guard.ts`, `au9-direct-handoff-guard.ts`,
`au10-plugin-config-ownership-guard.ts`, `au11-runtime-ownership-guard.ts`) into the should-graph's
full closure signal, and two of the as-should graph's eight boundary checks
(Core-app-imports-plugin-internals, Agent-layer-owns-core-CRUD) have no guard at all yet — see the
Gap Register. AU9 was a *precondition* for both AU10 and AU11 (both formally depend on it in the
manifest); AU11 was itself a precondition for AU8 (the manifest's last node) — with AU7/AU9/AU10
merged and AU11 implementation-complete, **AU8 is now the only remaining, not-yet-started work
package in the entire AU track**, unblocked as soon as AU11 merges.

Important target pieces are already present:

- `AgentSessionRequest` is now a real runtime primitive.
- Trigger-backed request creation exists in `packages/server/src/services/trigger-resolution.ts`.
- `packages/server/src/services/agent-run-boundary.ts` is the named execution boundary:
  request execution flows through `executeAgentRunRequest`, while lifecycle reads use
  `getAgentRunLifecycle` / `listAgentRunLifecycleBySource`.
- Server core, routine, decomposition, and session route callers no longer resolve a production
  request consumer from the legacy registry.
- Plugin/default configuration resolution exists in `packages/server/src/services/plugin-configuration.ts`.
- `scripts/au6-agent-boundary-guard.ts` is wired into `npm run lint` and fails when
  production server code imports `agent-session-runtime`, resolves request consumers
  from the registry, uses the legacy `provisionSession` registry hook, or reintroduces local
  `consumeAgentSessionRequest` naming outside the boundary.
- Settings has a current story entry at `packages/web/src/pages/SettingsPage.stories.tsx`.
- `@hyperidle/server/routines` is exported for the one legitimate cross-package (eval) caller;
  no other package deep-imports server internals. **(AU11, pending merge)**
- Eval scenarios that used to import Fabric runtime types now import server core/config types.
- `scripts/au7-runtime-retirement-guard.ts` is wired into `npm run lint` and blocks production
  runtime use of `@hyperidle/fabric`, `@hyperidle/strategy-minimal`, Strategy registry, Strategy
  port, Fabric bootstrap, minimal Strategy fallback, and the retired source paths returning.
- **(AU9)** Every one of the seven work families (assistant, explicit session, knowledge, routine,
  decomposition, task, re-engagement) persists a durable `agent_work_intents` row in the same
  transaction as its own domain write; no family callback creates or resolves a request itself.
- **(AU9)** `scripts/au9-direct-handoff-guard.ts` is wired into `npm run lint` and statically
  forbids core-side files from importing `trigger-resolution`, `agent-session-requests`,
  `agent-session-runtime`, or `agent-run-boundary`, or from referencing request-construction/
  consumption symbols (`createTriggeredAgentSessionRequest`, `claimNextAgentSessionRequest`,
  `consumeAgentSessionRequest`, `executeAgentRunRequest`, `provisionSession`, etc.) outside the
  agent-owned file set.
- **(AU9)** Request custody (claim, admission, terminal transition, boot recovery) is each a
  single CAS-guarded writer function, and terminal state is projected through a durable
  `agent_lifecycle_inbox` and per-family projector registry rather than a direct execution
  callback — closing Gap Register items 1 and 2 from the AU7-era version of this document.
- **(AU10)** `packages/server/src/config/builtin-tool-catalog.ts` is a pure-data
  catalog (zero runtime imports) that both `plugin-configuration.ts` and `tools/tool-registry.ts`
  depend on downward, replacing the prior edge where `plugin-configuration.ts` imported
  `ALL_TOOL_DEFINITIONS` from the runtime tool registry directly.
- **(AU10)** `scripts/au10-plugin-config-ownership-guard.ts` is wired into
  `npm run lint` and statically forbids the plugin/default configuration surface
  (`plugin-configuration.ts`, `agent-behavior-config.ts`) from importing runtime tool registries,
  harness adapters, MCP bridge registries, provisioning services, or agent execution internals
  (module-import reachability, not symbol-call reachability); real-tree run is 0 findings
  post-fix, `--fixtures` mode proves it catches a direct and a transitive leak.
- **(AU11, pending merge)** `packages/server/src/app-runtime/` no longer exists — no barrel, no
  boot shell, no package export. Boot is split into `registerCoreDomainServices` and
  `registerAgentLayerServices` in `server-factory.ts`.
- **(AU11, pending merge)** `scripts/au11-runtime-ownership-guard.ts` is wired into `npm run lint`
  and statically forbids (a) any reintroduction of an `app-runtime`-shaped grouping and (b) core
  routes/domain services from importing harness adapters, MCP bridge registries, provisioning
  internals, context assembly, tool execution, or agent lifecycle internals — real-tree run is 0
  findings, `--fixtures` mode proves it catches both violation classes.
- **(AU11, pending merge)** Dead `AdapterPool`/`SandboxAdapter`/`McpBridgeRegistry` import-type
  threading through core routes that had no real execution behind it is deleted; the two routes
  that did real execution (`mcp-route.ts`, `worker-ws.ts`) moved to agent-owned `services/`.

The remaining structural gap is no longer deletion of Strategy/Fabric source, nor direct
core-to-execution handoff, nor plugin config importing a runtime registry, nor a third
`app-runtime`-shaped runtime owner. The remaining AU work is: (a) merge AU11
(implementation-complete), then (b) mechanically enforce the complete should-graph guard as one
unified closure signal (AU8) — the only work package left in Track AU once AU11 lands.

## Side-by-Side Shape

| Area | As-is graph | As-should graph |
| --- | --- | --- |
| Runtime center | Server owns routes plus provisioning, request runtime, trigger resolution, plugin config, and core domain services. Legacy Fabric package dependency is gone. **(AU9)** Every route/domain command's only cross-boundary act is a durable intent write. **(AU11, pending merge)** The former app-runtime intermediate layer is gone — its responsibilities landed in Core app or Agent layer directly; only two runtime owners remain, matching the as-should shape. One named residual edge remains (`routine-scheduler.ts`'s fire-time call into agent-owned `agent-selection.ts`), tracked for AU8. | Core app owns product records/events/settings. Agent layer owns every LLM-capable run. Plugins only seed defaults. |
| Strategy | Strategy port/registry files and Fabric/minimal implementations are deleted from the live source graph. Production runtime no longer imports/registers/selects active Strategy. | No Strategy port, no active Strategy singleton, no Strategy implementations. |
| Fabric | `packages/fabric` is deleted from the live source graph. Former Fabric behavior lives in server core/agent services, with durable historical names preserved only for old records. **(AU11, pending merge)** The last intermediate hop (app-runtime) those responsibilities transited through after AU7 is now also gone — they sit directly in their should-graph owner. | No Fabric runtime package. Former Fabric responsibilities redistributed to Core app, Agent layer, or plugin defaults. |
| Agent runs | **(AU9)** All seven work families enter through one durable-intent → drain → single-request → custody → lifecycle-inbox pipeline. `agent-work-intent-worker.ts` is the sole intent resolver/request-creator; `agent-session-runtime.ts` is the sole request custody writer (claim, admission, terminal transition, boot recovery each a single CAS-guarded function). Provisioning (`session-provisioning.ts`) remains the internal orchestrator the agent layer calls once custody is held. | All LLM runs enter via trigger resolver -> session request queue -> agent run orchestrator. |
| Configuration | Plugin configuration resolver exists with defaults, overrides, and resolved views. **(AU10)** Built-in tool defaults now project from a pure-data `builtin-tool-catalog.ts`; the config surface no longer imports the runtime tool registry, and a lint guard enforces it. Prompt Catalog still has no real equivalent (see Detailed Comparison, unaffected by AU9/AU10/AU11). | Plugins seed typed config defaults. User/team overrides win. Config resolver produces the effective runtime view. |
| Knowledge | Knowledge routes and projections exist in server. **(AU9)** Knowledge actions persist a durable intent row alongside their domain write. **(AU11, pending merge)** Former Fabric-era knowledge/context behavior that had been housed in app-runtime (18 files) is now core-owned Knowledge directly, no intermediate layer. | Knowledge CRUD, scoring, search, and projections are core app Knowledge. Agent context/writeback are Agent layer providers backed by core Knowledge. |
| Boundary enforcement | AU6 guard enforces request-consumption ownership. AU7 guard enforces Strategy/Fabric runtime retirement. **(AU9)** `au9-direct-handoff-guard.ts` forbids core-side construction/consumption of requests; two of the target's eight boundary checks ("every LLM-capable event has a trigger surface or default-attach path", "every agent run has a recorded trigger resolution including fallback runs") are already structurally guaranteed by AU9's `agent_work_intents_kind_source_compat_ck` DB constraint + exhaustive `eventTypeFor` switch + mandatory `triggerResolutionHistory` insert on every request. **(AU10)** `au10-plugin-config-ownership-guard.ts` forbids the plugin/default config surface from importing runtime tool registries/harness adapters/MCP bridges/provisioning services. **(AU11, pending merge)** `au11-runtime-ownership-guard.ts` forbids the app-runtime shell from reappearing and forbids core routes/domain services from importing harness/MCP/provisioning/context/tool/lifecycle internals — this closes the as-should graph's "Core app modules must not import harness adapters directly" check. Two of the remaining boundary checks (Core-app-imports-plugin-internals, Agent-layer-owns-core-CRUD) have no guard yet and genuinely await AU8's consolidated should-graph guard. | Mechanical lint/type/package boundaries prevent forbidden imports and ownership leaks. |

## As-Is Graph

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

## As-Should Graph

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

## Current Evidence

| Current edge | Evidence |
| --- | --- |
| Legacy Strategy port deleted | `packages/shared/src/strategy-port.ts` removed from live source graph |
| Legacy Strategy registry deleted | `packages/server/src/services/strategy-registry.ts` removed from live source graph |
| Legacy Fabric package deleted | `packages/fabric` removed from live source graph |
| Legacy minimal Strategy package deleted | `packages/strategy-minimal` removed from live source graph |
| Agent run boundary exists | `packages/server/src/services/agent-run-boundary.ts` |
| AU6 request-consumption guard exists | `scripts/au6-agent-boundary-guard.ts`, `package.json` `lint` script |
| AU7 runtime-retirement guard exists | `scripts/au7-runtime-retirement-guard.ts`, `package.json` `lint` script |
| **(AU9)** Direct-handoff guard exists | `scripts/au9-direct-handoff-guard.ts`, `package.json` `lint` script — forbids core imports of `trigger-resolution`/`agent-session-requests`/`agent-session-runtime`/`agent-run-boundary` and forbidden request-construction/consumption symbols outside the agent-owned file set |
| **(AU9)** Durable intent boundary exists | `packages/db/src/schema.ts` (`agent_work_intents`, seven kinds/sources, unique idempotency key), `packages/server/src/services/agent-work-intent-worker.ts` |
| **(AU9)** Single-writer request custody exists | `packages/server/src/services/agent-session-runtime.ts` (`terminalizeAgentSessionRequest` — sole terminal writer, both running+session_id and claimed+claim_token preconditions; `recoverRunningAgentSessionRequests` — real boot recovery) |
| **(AU9)** Durable lifecycle projection exists | `packages/db/src/schema.ts` (`agent_lifecycle_inbox`), `packages/server/src/services/agent-lifecycle-projectors.ts` (per-family projector registry, core-owned, no agent-runtime import — moved out of `app-runtime/` by AU11) |
| **(AU9)** Task dispatch has a durable, replay-safe source | `packages/db/src/schema.ts` (`task_dispatch_attempts`), `packages/server/src/services/task-state-machine.ts` |
| **(AU9)** `createTriggeredAgentSessionRequest` has exactly one production caller | the intent drain (`agent-work-intent-worker.ts`); assistant/handoff direct-create paths collapsed into it |
| **(AU10)** Built-in tool catalog is pure data | `packages/server/src/config/builtin-tool-catalog.ts` — no import of `tools/`, `harness/`, `mcp/`, or provisioning; only `import type` from `@hyperidle/shared` |
| **(AU10)** Plugin config no longer imports the runtime tool registry | `packages/server/src/services/plugin-configuration.ts:26` imports `BUILTIN_TOOL_CATALOG` from `../config/builtin-tool-catalog.js` (was `ALL_TOOL_DEFINITIONS` from `../tools/tool-registry.js`) |
| **(AU10)** Catalog↔registry drift guard exists | `packages/server/src/tools/__tests__/builtin-tool-catalog-consistency.test.ts` — name-set equality, `return_status_tool` exclusion, per-tool metadata deep-equal, real-path validation via `loadBuiltInConfigurationDefaults` |
| **(AU10)** Plugin-config-ownership guard exists | `scripts/au10-plugin-config-ownership-guard.ts`, `package.json` `lint` script — module-import-reachability check over the plugin/default config surface; 0 findings on the real tree post-fix, `--fixtures` mode proves it catches a direct and a transitive leak |
| **(AU11, pending merge)** The transitional shell no longer exists | `packages/server/src/app-runtime/` — directory, barrel `index.ts`, `bootstrapAppRuntime`, and the `./app-runtime` package export are all deleted; `rg app-runtime` across production source finds only historical `@lore` comments |
| **(AU11, pending merge)** Boot no longer routes through one runtime-shaped bootstrapper | `packages/server/src/server-factory.ts` — split into `registerCoreDomainServices` and `registerAgentLayerServices` |
| **(AU11, pending merge)** Runtime-ownership guard exists | `scripts/au11-runtime-ownership-guard.ts`, `package.json` `lint` script — forbids app-runtime-shell reappearance (AC-1) and core routes/domain services importing harness/MCP/provisioning/context/tool/lifecycle internals (AC-2); 0 findings on the real tree, `--fixtures` proves both checks |
| **(AU11, pending merge)** Curated cross-package export exists | `packages/server/src/routines.ts` → `@hyperidle/server/routines`, re-exports exactly `checkAndFireRoutine`/`provisionTeamRoutines`/`runBuiltinRoutine`; consumed by 4 files in `packages/eval` (the guard pins the export list to exactly these three names) |
| **(AU11, pending merge)** Dead descriptor-threading removed from core routes | `packages/server/src/routes/sessions-routes.ts`, `routes/routines-routes.ts`, `services/bet-decomposition.ts` — `AdapterPool`/`SandboxAdapter`/`RoutineProvisionDeps` import-type threading deleted; no real execution was behind it |
| **(AU11, pending merge)** Real-execution routes relocated to agent-owned `services/` | `packages/server/src/services/mcp-route.ts` (was `routes/mcp-route.ts` — executes `bridgeRegistry.handleRequest`), `packages/server/src/services/worker-ws.ts` (was `routes/worker-ws.ts`) |
| Server bootstrap no longer registers production request/provision consumer hooks | `packages/server/src/server-factory.ts` |
| Trigger-backed request creation exists | `packages/server/src/services/trigger-resolution.ts` |
| Agent request queue/runtime exists | `packages/server/src/services/agent-session-requests.ts`, `packages/server/src/services/agent-session-runtime.ts` |
| Provisioning remains central | `packages/server/src/services/session-provisioning.ts` |
| Plugin configuration resolution exists | `packages/server/src/services/plugin-configuration.ts` |
| Core/server knowledge exists | `packages/server/src/routes/knowledge.ts`, `packages/server/src/services/knowledge/projections.ts` |
| Eval runtime imports use core/config types, not app-runtime | `packages/eval/src/scenarios/builtin-routines.ts`, `packages/eval/src/scenarios/delegation.ts`, `packages/eval/src/scenarios/routine-sessions.ts`, `packages/eval/src/scenarios/skill-autonomy.ts` — all repointed off the deleted `app-runtime` export by AU11 |
| Settings story exists | `packages/web/src/pages/SettingsPage.stories.tsx` |

## Detailed Comparison

### Core App

| Responsibility | As-is | As-should |
| --- | --- | --- |
| Work records | Core server routes/services own this. AU6 moved request execution through the agent-run boundary, AU7 removed Strategy/Fabric ownership, **(AU9)** task acceptance/retry/owner-handoff persist a `task_dispatch_attempts` row + intent in the same transaction as the domain write, and **(AU11, pending merge)** the app-runtime intermediate dispatch layer that used to sit between core routes and this write is gone — the dispatcher lives directly in core `services/` now. | Core owns records and emits events only. |
| Conversations | Server routes/services own records. **(AU9)** the assistant message-insert transaction persists the intent directly. | Conversation domain records user intent and emits events; Agent layer owns the LLM run. |
| Knowledge | Core routes/projections exist. **(AU9)** knowledge actions persist their intent in the same transaction as the action/flag mutation. **(AU11, pending merge)** Former Fabric-era knowledge/context behavior that had been housed in `app-runtime/knowledge/` (18 files) is now directly under core `knowledge/`, no intermediate layer. | Core Knowledge owns CRUD, search, scoring, projections, and visibility. |
| Settings | Settings routes plus plugin configuration service exist. **(AU10)** the config surface no longer imports a runtime execution registry to seed built-in tool defaults. | Settings edits user/team overrides; resolver merges overrides with plugin defaults. |
| Domain events | Present, and **(AU9) substantially closed**: direct route/service creation of agent requests is gone — replaced by a durable intent row per family, persisted in the same transaction as the domain write, with the EventBus emission demoted to a wake-hint only (not the recovery contract). One nuance versus the as-should diagram: the as-should graph draws `DomainEvents -> TriggerResolver` as the sole handoff primitive, while AU9 built a dedicated `agent_work_intents` table as the durable contract and kept EventBus purely as a latency optimization. This is arguably the stronger design (a table survives replay; an in-memory-published event does not) but it is a deliberate divergence from the literal diagram worth flagging, not a defect. | Sole handoff from core domains into Agent layer triggers. |

### Agent Layer

| Responsibility | As-is | As-should |
| --- | --- | --- |
| Trigger resolution | Exists in server service and reads resolved configuration. | Lives inside Agent layer and is the only event-to-run decision point. |
| Request queue | `AgentSessionRequest` create/claim/consume exists. AU6 puts production consumption behind `executeAgentRunRequest`. **(AU9)** `createTriggeredAgentSessionRequest` now has exactly one production caller (the intent drain). | Queue is the stable boundary between core events and execution. |
| Run orchestration | `executeAgentRunRequest` is the domain-facing boundary; `consumeAgentSessionRequest` and `provisionSession` remain internal implementation details. **(AU9)** custody (claim/reclaim, admission, terminal transition, boot recovery) is each a single CAS-guarded writer. | Agent run orchestrator owns lifecycle, harness, context, tools, MCP, capture, and writeback. |
| Context | **(AU11, pending merge)** `context-assembly.ts`, `context-assembly-prompt.ts`, and `session-context.ts` are now directly agent-owned `services/` files (moved out of `app-runtime/`, no intermediate layer). | Context providers are Agent layer adapters backed by Core Knowledge. |
| Tools/MCP | Server provisioning builds tool registry and MCP wiring. **(AU11, pending merge)** `mcp-route.ts` (real MCP protocol execution — `bridgeRegistry.handleRequest`) moved from `routes/` into agent-owned `services/`, closing the one core-route file that did real execution rather than a descriptor read. | Agent layer exposes tool/MCP providers; core does not import execution adapters. |
| Capture/writeback | **(AU11, pending merge)** `writeback.ts` and `file-watcher.ts` are now agent-owned `services/` files, moved directly out of `app-runtime/` with no intermediate layer. | Agent layer writes captured artifacts back through core-owned stores/events. |
| Lifecycle projection | **(AU9)** terminal request state is written by the single custody writer, which inserts one `agent_lifecycle_inbox` row in the same transaction; **(AU11, pending merge)** the core-owned, per-family projector registry (`agent-lifecycle-projectors.ts`) is now a direct core `services/` file (moved out of `app-runtime/services/`), drains that inbox and mutates each family's own read model. | Domains observe completion/failure/cancellation only through durable lifecycle projection, never an execution callback. |
| Agent selection / roster | **(AU11, pending merge)** `agent-selection.ts` and `roster.ts` are now agent-owned `services/` files. `agent-defaults/resolvers.ts` (the edge AU10 confirmed out of its scope) is repointed to these new locations. One residual edge remains by design: `routine-scheduler.ts` (Core) still calls `agent-selection.ts` (Agent) directly at fire-time — see the preamble note above and gap 6 below. | Agent layer owns agent selection; core never calls it directly except through the trigger/intent boundary. |

### Plugin And Configuration

| Responsibility | As-is | As-should |
| --- | --- | --- |
| Defaults | Default/configuration records exist; typed-default projection (AU2/AU5) predates AU10. **(AU10)** built-in tool defaults now project from the pure-data `builtin-tool-catalog.ts` instead of the runtime tool registry. **(AU11, pending merge)** `builtin-routines` split into a config-defaults file (`config/builtin-routines.ts`) and an agent-owned handler file (`services/builtin-routine-handlers.ts`) — the config side now imports nothing execution-shaped. | Plugins seed typed defaults only. |
| Overrides | Plugin configuration service supports user/team overrides and resolved config. AU10 preserved this byte-for-byte (`defaultVersionHash` unchanged; VS2 override-survives-reseed regression stayed green). AU11 did not touch this surface. | Same concept, but enforced as the only editable runtime configuration path. |
| Runtime behavior | Production runtime no longer registers Strategy or imports Fabric/minimal Strategy; legacy packages/files are deleted from the live source graph. | Effective config feeds Agent layer trigger/orchestration decisions directly. |
| Plugin isolation | **(AU10)** Partially enforced: `au10-plugin-config-ownership-guard.ts` statically forbids the plugin/default config surface from importing runtime tool registries, harness adapters, MCP bridge registries, or provisioning services (0 findings on the real tree). **(AU11, pending merge)** `au11-runtime-ownership-guard.ts` closes the adjacent "core app imports harness directly" check, but neither guard forbids Agent-layer-owns-core-CRUD or Core-app-imports-plugin-internals — the full should-graph enforcement is still AU8. | Plugins cannot subscribe to the event bus, invoke harnesses, or mutate core records directly. |
| Prompt catalog | **Still open, unaffected by AU9/AU10/AU11.** The target's 8th configuration catalog (Prompt Catalog) has no real equivalent. `packages/shared/src/configuration.ts` `CONFIGURATION_KINDS` still defines exactly 7 kinds (agent, skill, routine, trigger, tool, mcp_server, harness_descriptor) — no `prompt` kind, confirmed unchanged on the AU11 branch. Prompt templates/overrides are not editable configuration; they live folded into trigger/agent prompt-mode bindings (`PROMPT_MODE_BY_SOURCE`, `trigger-resolution.ts`). This is the AU2/AU5-era shape. | Prompt Catalog is a first-class configuration catalog alongside the other 7 (Agent, Skill, Routine, Trigger, Tool, MCP, Harness). |

## Gap Register

These gaps should be registered as follow-up work if not already represented by later AU work packages. Status reflects PR #425 (AU9), PR #426 (AU10) as merged, and PR #428 (AU11) as if merged.

1. ~~Finish defining and enforcing the Agent layer boundary beyond AU6 request consumption.~~ **Closed by AU9 + AU11.**
   - AU6 closed the production request-consumption gap: non-boundary imports of
     `agent-session-runtime`, registry consumer resolution, legacy `provisionSession` registry
     hooks, and local `consumeAgentSessionRequest` variables are guarded by lint.
   - **AU9** closed request *construction*: `au9-direct-handoff-guard.ts` forbids core files from
     importing the agent-owned modules at all, and `createTriggeredAgentSessionRequest` has
     exactly one production caller.
   - **AU11** closed the remaining piece this gap's "Remaining AU8/AU11 work" line called out: the
     agent-owned trigger resolution, provisioning/orchestration, harness registry, tools, MCP,
     context, and capture/writeback set is no longer routed through an intermediate `app-runtime`
     hop — every one of those 14 files now sits directly under agent-owned `services/`, and
     `au11-runtime-ownership-guard.ts` mechanically forbids core routes/domains from importing
     execution adapters directly (module-import reachability, not just a symbol/module denylist).
     What's left — a true structural *package* boundary (a separate `@hyperidle/agent-layer`
     package rather than a directory convention within `packages/server`) — was never an AU7-era
     ask and is not in any AU work package's acceptance criteria; if wanted, it would need a new
     work package, not a reopening of this gap.

2. ~~Decide and enforce the final event-only handoff rule.~~ **Closed by AU9, with a noted design divergence.**
   - AU9 made the durable `agent_work_intents` row — not the EventBus — the recovery contract;
     every family persists it in the same transaction as its domain write, and EventBus emission
     is now explicitly a wake-hint, never load-bearing. All direct-request-creation call sites
     found in the AU7-era audit are gone.
   - Noted divergence (not a defect): the as-should diagram draws `DomainEvents -> TriggerResolver`
     as the literal mechanism; AU9 implements the same guarantee through a durable table instead of
     the event bus, which is more crash-safe than a literal event-only design would be. Worth a
     one-line note if `as-should-dependency-graph.md` is ever revised, otherwise leave as informative
     context.

3. ~~Finish plugin bundle/default projection.~~ **Boundary-check portion closed by AU10; typed-default projection was already in place from AU2/AU5.**
   - Built-in behavior already seeds typed defaults through the plugin/default configuration path
     (AU2/AU5, pre-AU10) — that part of this gap was stale by the time AU10 started.
   - User/team overrides already win and remained unchanged by AU10 (byte-stable
     `defaultVersionHash`, VS2 regression green).
   - **AU10** added the boundary check this gap actually called for: plugin/default config can no
     longer import a runtime execution registry (`au10-plugin-config-ownership-guard.ts`, 0
     findings on the real tree, catches direct + transitive leaks via `--fixtures`). Scoped to the
     plugin/default config surface specifically — it does not forbid plugins from subscribing to
     the event bus or invoking harnesses directly, which was already true pre-AU10 and remains a
     should-graph-guard (AU8) concern to make mechanical and general rather than a newly-found gap.

4. Add mechanical dependency checks. **Substantially closed by AU9, AU10, and AU11; full unified guard is still AU8.**
   - AU7 already forbids runtime imports of `@hyperidle/fabric` and `@hyperidle/strategy-minimal`.
   - AU7 already forbids production runtime imports of `strategy-port` and Strategy registry.
   - **AU9** added a targeted guard for core-side request construction/consumption
     (`au9-direct-handoff-guard.ts`), scoped to that one edge.
   - **AU10** added a targeted guard for plugin/default config importing runtime tool
     registries/harness adapters/MCP bridges/provisioning services (`au10-plugin-config-ownership-guard.ts`),
     scoped to the plugin/default config surface.
   - **AU11** added a targeted guard (`au11-runtime-ownership-guard.ts`) that forbids the
     app-runtime shell from reappearing and forbids core routes/domain services from importing
     harness/MCP/provisioning/context/tool/lifecycle internals — this closes the as-should graph's
     "Core app modules must not import harness adapters directly" boundary check, which the prior
     revision of this gap had listed as genuinely open.
   - Still open, and now the entirety of what's left: forbid **Core-app-imports-plugin-internals**
     and forbid **Agent-layer-owns-core-CRUD**. Neither has any static guard today — AU11's AC-3
     ("agent-layer code doesn't own core CRUD except via contracts") was proven only by
     behavior-preservation regression tests staying green on an import-path-only move, which would
     not catch a *newly introduced* agent-layer CRUD write. This is AU8's full should-graph guard,
     and AU8 depends on AU11 (implementation-complete, pending merge) in the manifest — once AU11
     merges, AU8 is unblocked and is the only remaining AU work.
   - A related, smaller AU8 task: today the should-graph boundary is enforced by **four separate
     scripts** (`au7-runtime-retirement-guard.ts`, `au9-direct-handoff-guard.ts`,
     `au10-plugin-config-ownership-guard.ts`, `au11-runtime-ownership-guard.ts`) with overlapping
     but not unified scope, naming, or failure-message vocabulary. AU8's own acceptance criteria
     ask for one closure signal "in target-graph vocabulary" — consolidating these four (plus the
     two new checks above) into a single should-graph guard is itself in scope, not just adding the
     two missing checks standalone.

7. **New gap surfaced by the AU9/AU10 cycle's should-graph audit — the target's Prompt Catalog has no real
   equivalent.**
   - The as-should graph's Configuration And Plugin Graph lists 8 catalogs (Agent, Skill, Routine,
     Trigger, Tool, MCP, Harness, Prompt). Source (`packages/shared/src/configuration.ts`
     `CONFIGURATION_KINDS`) has only 7 — no `prompt` kind, confirmed still true on the AU11 branch.
     Prompt templates/overrides are not editable configuration; they're folded into trigger/agent
     prompt-mode bindings (`PROMPT_MODE_BY_SOURCE`, `trigger-resolution.ts`).
   - Not created or touched by AU9/AU10/AU11 (this is the AU2/AU5-era shape, unchanged) — but it
     was never named in this document before the AU9/AU10 audit cycle. A real, if minor,
     should-graph deviation, still on record and still unresolved.
   - Whether this should become a real 8th editable catalog (giving users an editable
     prompt-override surface) or the target doc should be revised to drop it is a product
     decision, not an engineering gap. Not assigned to a specific AU package here — AU8 is the
     should-graph guard, not a place to add new configuration surface, so this most likely needs
     its own future work package (or a documented decision to drop it from the target) rather than
     folding into AU8.

5. Reconcile AU5 status into mainline. **Resolved — no longer a gap.**
   - AU5 (Settings agent behavior configuration surface) is merged into `origin/main` as of
     `09eb9b41` (`feat(AU5): add agent behavior configuration surface`), which is an ancestor of
     the current baseline. No further reconciliation needed; this line item can be dropped in a
     future revision of this document.

6. ~~The app-runtime layer is still a third runtime owner.~~ **Closed by AU11, with one deliberate residual edge tracked for AU8.**
   - AU9 first verified that `packages/server/src/app-runtime/services/{task-dispatcher,routine-scheduler}.ts`
     still existed as an intermediate dispatch/scheduling layer between core routes and the agent
     layer's intent drain. AU10 confirmed the same layer (via `agent-defaults/resolvers.ts`) as
     out of its own scope, deliberately deferred to AU11.
   - **AU11 dissolved it.** All 67 files under `app-runtime/` were reclassified against the
     should-graph and either moved to Core app, Agent layer, editable config, or deleted; the
     directory, barrel, boot shell, and package export no longer exist. Core app and Agent layer
     are now the only two runtime owners in the source tree — matching the as-should graph exactly.
   - **One deliberate residual edge remains**, named explicitly rather than silently accepted:
     `routine-scheduler.ts` (Core, cron/due-eval) still calls `agent-selection.ts` (Agent-owned)
     directly at fire-time. AU11's own critique round rejected relocating this into the agent
     layer's drain-time intent resolver, because doing so would move a fire-time decision to
     drain-time — a real behavior change, not an import-path-only move. This is a genuine,
     documented cross-boundary call (Core calling into Agent-owned code directly, bypassing the
     intent-queue pattern every other family uses) that the as-should graph's literal shape does
     not allow. It should be an explicit AU8 boundary-check exception (an allowlisted edge with a
     comment pointing to this document) rather than something a future guard silently flags as a
     regression or silently ignores as noise.
   - A second, much smaller residual: the new `@hyperidle/server/routines` cross-package export
     (three functions, for `packages/eval` only) is a narrow, guard-pinned exception to "no
     app-runtime-shaped grouping" — it is not a barrel and cannot regrow into one, but AU8 should
     be aware it exists when defining "no runtime-shaped package export" as a boundary check, so it
     doesn't get flagged as a false positive.

## AU7 Completion Check

| AU7 requirement | Status | Notes |
| --- | --- | --- |
| Production server boot succeeds without registering/selecting a Strategy | Complete | Production runtime no longer imports/registers/selects active Strategy; AU7 guard blocks reintroduction. |
| Runtime package dependencies no longer include `@hyperidle/fabric` or `@hyperidle/strategy-minimal` | Complete | Runtime roots and workspace package graph no longer depend on either package. |
| Former Fabric service behavior reachable through server core/agent services | Complete for AU7 surface | Server/eval callers use core service types instead of Fabric runtime types; the intermediate `app-runtime/contracts.ts` hop this originally routed through is itself now gone (AU11). |
| Agent-capable behavior continues through AU6 request/runtime boundary | Complete | AU6 boundary remains the execution handoff; AU7 updated the AU6 guard to stop treating Fabric as production runtime. |
| Durable rows with historical `strategy`/`fabric` names remain readable | Complete | AU7 does not rename historical schema/table vocabulary. This is intentional compatibility, not active runtime architecture. |
| Docs describe Fabric and Strategy only as legacy compatibility | Complete | Runtime simplification and system overview docs were updated in AU7, and again in AU11 to describe the two-owner (not three-owner) end state. |
| Full as-should dependency tree mechanically enforced | Not an AU7 requirement | AU8 needs the full graph guard after AU9/AU10/AU11 land. |

## AU9 Completion Check

| AU9 requirement | Status | Notes |
| --- | --- | --- |
| Core app routes and domain services never directly create, consume, or execute agent run requests | Complete, merged | `au9-direct-handoff-guard.ts` lint-enforced; manual `rg` audit against the agent-owned file allowlist confirmed by two independent review rounds. |
| Every existing LLM-capable entry point hands off by recording domain intent or publishing a domain event the agent layer consumes | Complete, merged | All seven families (assistant, explicit session, knowledge, routine, decomposition, task, re-engagement) persist an `agent_work_intents` row in the same transaction as their domain write. |
| The agent layer is the only owner of request construction, trigger resolution outcome binding, execution admission, and lifecycle publication | Complete, merged | `createTriggeredAgentSessionRequest` has exactly one production caller (the drain); custody operations are each a single CAS-guarded writer; lifecycle publication goes through the durable inbox + projector registry. |
| Assistant turns, session-start paths, knowledge actions, routines, decomposition, task acceptance, and re-engagement preserve current observable behavior after the handoff cut | Complete, merged | Protected suites amended to drive the real route/drain/boot entrypoints (not helper imports) still pass; a real builtin-harness LLM call independently re-verified the assistant reply path end-to-end. |
| Failure, cancellation, and completion are observed by domains only through lifecycle state/events, not direct execution callbacks | Complete, merged | Terminal transition writes the lifecycle inbox row in the same transaction as the CAS; seven core-owned projectors consume it; no family imports agent-runtime execution types. |
| Review includes a should-graph audit proving no core-to-agent direct handoff edge remains | Complete, merged | Phase-4 review (`plans/AU9/code-review-remediation2.md`) independently re-verified the guard and the caller-count claims against source; verdict DONE, 0 CRITICAL. |
| Full as-should dependency tree mechanically enforced | Not an AU9 requirement | AU9 scoped to the core↔agent handoff edge only; AU10 (plugin ownership) and AU11 (app-runtime shell removal) are explicitly out of AU9's scope, and AU8 needs the full graph guard after both land. |

## AU10 Completion Check

| AU10 requirement | Status | Notes |
| --- | --- | --- |
| Plugin/default configuration code does not import runtime tool registries, harness adapters, MCP bridge registries, provisioning services, or agent execution internals | Complete, merged | `au10-plugin-config-ownership-guard.ts` (module-import reachability) — 0 findings on the real tree; independently re-run by the Phase-4 reviewer, not just builder-reported. |
| Built-in defaults are represented through the same editable configuration/provenance model as plugin defaults | Complete, merged | Confirmed already true pre-AU10 by independent source review; `configuration-projection-boot.integration.test.ts` pins `tool.submit_review` resolving `origin.type==="builtin"` post-swap. |
| Runtime execution consumes active configuration through agent-layer contracts instead of plugin code pushing behavior into runtime registries | Complete, merged | Confirmed already true pre-AU10 (`trigger-resolution.ts` already read `listResolvedConfiguration`); guard now makes the correct direction durable, and existing consumption tests stayed green. |
| User overrides, disabled plugin origins, and built-in defaults preserve AU2/AU5 observable behavior | Complete, merged | `defaultVersionHash` byte-stable; full `plugin-configuration.test.ts` suite including the VS2 override-survives-reseed case green, unchanged. |
| Capability validation is explicit and inspectable without making plugin configuration own runtime discovery | Complete, merged | `builtin-tool-catalog-consistency.test.ts` exercises the real `validateConfigurationValue` path over all 21 catalog entries. |
| Review includes a should-graph audit proving plugins are configuration sources only | Complete, merged | Phase-4 reviewer's explicit audit: the config surface reaches zero execution internals; the only real tool-registry importers left are execution modules, all in the correct downward direction. |
| Full as-should dependency tree mechanically enforced | Not an AU10 requirement | AU10 scoped to the plugin/default-config-surface-owns-no-runtime-import edge only, deliberately narrower than AU8's eventual full guard. |

## AU11 Completion Check

| AU11 requirement | Status | Notes |
| --- | --- | --- |
| No transitional app-runtime/Fabric-shaped ownership boundary remains in boot, service wiring, or runtime imports | Complete (pending merge) | `packages/server/src/app-runtime/` directory, barrel, `bootstrapAppRuntime`, and package export all deleted; boot split into `registerCoreDomainServices`/`registerAgentLayerServices`; `au11-runtime-ownership-guard.ts` AC-1 check is 0 findings on the real tree, independently re-run by the Phase-4 reviewer twice (round 1 and round 2). |
| Core routes and core domain services do not import harness adapters, MCP bridge registries, provisioning internals, context assembly, tool execution, or agent lifecycle implementation details | Complete (pending merge) | `au11-runtime-ownership-guard.ts` AC-2 check is 0 findings; reviewer independently verified the two "still-direct execution" reclassifications (`mcp-route.ts`, `worker-ws.ts`) and the descriptor-read allowlist (`agent-profile.ts`/`agents.ts`/`workers.ts`/`harnesses.ts`/`connections.ts`) file-by-file, confirming each only reads capability/registration metadata with zero execution calls. |
| Agent-layer code does not own Work, Conversation, Knowledge, Users, Settings, Routine, or notification CRUD except through explicit core app contracts | Complete (pending merge), proven by regression not by a static guard | All 14 agent-layer-destined files call core-owned modules through explicit functions; ~64 file moves verified import-path-only via spot-checked diffs; no new static check exists for this — see Gap Register item 4, this is exactly AU8's remaining scope. |
| Former transitional services are either moved to their should-graph owner or deleted as dead behavior; none remain as pass-through wrappers | Complete (pending merge), after one review round of rework | Owner table exhaustive over all 67 `app-runtime/` files (32 core, 14 core-services, 14 agent, 2 config, 5+ deleted). Round-1 review found 5 dead files + ~18 dead exports preserved via new `knip.json` ignore entries instead of being deleted — a real AC-4 violation; round-2 deleted all of it, and `knip.json` is now byte-identical to pre-AU11 except the `app-runtime/**` glob removal. |
| Existing Work, Conversation, Knowledge, Settings, Routine, notification, session, tool, MCP, and harness behavior remains observable | Complete (pending merge) | Full `npm run verify` green (3388 unit/component + 2501+ integration tests); the two harness-facing integration test files touched by the `mcp-route.ts` relocation were independently re-run by the reviewer against real binaries (builtin/claude/opencode all passed; the only 3 failures were a pre-existing, unrelated codex account usage-cap issue). |
| Review includes a should-graph audit proving every moved/deleted responsibility lands in the target owner | Complete (pending merge) | Reviewer independently re-derived a sample of the owner table against the actual moved files and ran an `rg app-runtime` production sweep (only comment/`@lore` hits remained) in both review rounds. |
| Full as-should dependency tree mechanically enforced | Not an AU11 requirement | AU11 scoped to dissolving the third runtime owner and the two edges its own guard covers; AU8 needs the full graph guard (Core-app-imports-plugin-internals, Agent-layer-owns-core-CRUD, and consolidating all four existing guards into one closure signal). |

## Requirement Resolution

Track AU says AU7 owns Strategy/Fabric runtime retirement and AU8 explicitly excludes removing
remaining Strategy/Fabric code. Review clarified that "retirement" means a completely clean live
source graph, not only production-runtime removal. AU7 requirements were corrected to match that
definition.

Under the corrected definition, AU7 deletes `packages/fabric`, `packages/strategy-minimal`,
`packages/shared/src/strategy-port.ts`, and `packages/server/src/services/strategy-registry.ts`
from the live source graph. AU7 also hardens lint so those paths and runtime imports cannot return.
Durable historical table/field names remain readable as compatibility data, not active runtime
architecture.

AU9 took the review-driven correction pattern further than any prior AU package: the acceptance
criteria ("core never creates/consumes/executes agent requests") were architecturally right from
the first pass, but the *implementation* twice reintroduced a weaker parallel path beside a correct
one. The fix that finally held was not another code patch — it was three explicit, reviewer-
mechanical rules written directly into the architecture (single custody writer per operation;
production-entrypoint-only tests; no manufactured rows/dead scaffolds), each with a named
canonical symbol and a `rg`-based verification recipe.

AU10, by contrast, stayed a single-pass correction: the acceptance criteria were architecturally
right from the first pass, the audit found exactly one concrete violation, and the fix (extract a
pure-data catalog, invert the import, add a narrowly-scoped guard) held through refine-critique,
architecture-critique, and code review without a single CRITICAL finding at any gate.

AU11 landed between the two: architecturally right from the first pass (the owner table was
exhaustive and internally consistent from round 1), but the planning critique loop needed one
revision round to close two WARNING-level open decisions (the routine-scheduler resolution had
initially picked the option that would have changed fire-time-vs-drain-time behavior; the
cross-package export decision was initially attributed to the wrong package with an unworkable
fix) — both closed cleanly once corrected, scores rising from 7.5/7.5 to 9.0/9.0. The *build* then
needed one review round of rework, but of a different character than AU9's: not a correct-symbol-
beside-a-weak-symbol defect, but a **dead-code-masking** defect — the mechanical move surfaced 5
files and ~18 exports the app-runtime barrel had been keeping falsely "alive" in `knip`'s eyes, and
the first build pass suppressed that discovery with new `knip.json` ignore entries instead of
deleting the dead code, which is exactly the failure mode this repo's own rules forbid ("dead code
must be deleted, never masked"). This is worth naming as a distinct pattern from AU9's: large
mechanical deletion passes that remove a barrel/re-export layer should expect to *increase* the
amount of dead code `knip` can see, and the correct response is always deletion, never a new
ignore — a useful heuristic for AU8, which will also touch every one of these guard scripts and
could face the same temptation if consolidating them surfaces more previously-hidden dead code.

## Bottom Line

**On track — AU8 is now the only remaining work package in Track AU.** The dependency-ordered
chain the manifest encodes (AU7 → AU9 → {AU10, AU11} → AU8) is proceeding in the correct order with
no work skipped or reordered: AU7, AU9, and AU10 are merged, and AU11 is implementation-complete
(PR #428, CI green — `npm run verify` 2m34s, `release-guard` 11s — awaiting human merge). Once AU11
merges, AU8 (the should-graph guard) is unblocked and is the only AU work left. No scope has
silently dropped — AU9's own review named the app-runtime transitional layer as still standing
(gap 6), AU10 confirmed the same edge and deliberately left it untouched, and AU11 has now closed
it, naming its one deliberate residual (the routine-scheduler fire-time call) explicitly rather than
silently absorbing it.

**New observations from this cycle, in order of how surprising they were:**

- **A real, recurring process gap, confirmed again:** AU11's Phase-4 review round 1 caught the
  builder preserving 5 dead files + ~18 dead exports via new `knip.json` ignore entries instead of
  deleting them — directly the failure mode this repo's own memory/feedback already documents
  ("dead code must be deleted, never masked; knip:production is the guardrail, don't weaken it").
  The pattern held even under the pressure of a large (67-file) mechanical deletion pass, and it was
  only caught because the reviewer independently re-derived the claim against source rather than
  trusting the builder's green `npm run verify`. Worth flagging for `/compound`: this is at least
  the second AU-track instance of "verify passes green while a guardrail is quietly weakened
  underneath it" (the first being AU9's remediation-cycle pattern of a correct symbol coexisting
  with an unused weak one) — different mechanism, same shape (a passing test suite is not proof the
  right thing happened; independent re-derivation is what actually catches it).
- **A smaller, also-recurring process gap:** the builder's sandboxed session could not provision the
  worktree's `.env` for the harness-facing integration lane (no `OPENROUTER_API_KEY`, and direct
  `cat`/`cp` of the primary checkout's `.env` were denied by the sandbox) — the orchestrator had to
  `cp` it in from outside the builder's session, and even then the harness vitest project doesn't
  auto-load `.env`, requiring `node --env-file=.env` to actually run it. This is the same standing
  friction already noted for AU9/AU10-era work and AR1/AV4 in project memory — still unresolved as
  of AU11.
- **Confirmed, not new:** the app-runtime dispatcher/scheduler layer (former gap 6) is now gone, not
  merely "narrowed" — AU11 was the first AU package to actually delete the transitional shell rather
  than defer it further, closing a gap that AU9 first named and AU10 explicitly declined to touch.

**Independent should-graph audit (2026-07-11, this cycle):** verified directly against source on
both the merged-main baseline (`6dd27dfd`, includes AU10) and the AU11 branch (`c6358a30`) rather
than trusting AU11's own artifacts: confirmed `packages/server/src/app-runtime/` does not exist on
the AU11 branch and does exist on `origin/main` (three-owner state is genuinely still live on `main`
until AU11 merges); confirmed AU10 is merged into `origin/main` and is the AU11 branch's merge-base
(no drift); confirmed `CONFIGURATION_KINDS` in `packages/shared/src/configuration.ts` still has no
`prompt` kind on the AU11 branch (Prompt Catalog gap genuinely untouched); confirmed no core route
imports `SessionProvisioning`/harness adapters/`mcp-bridge` in production source (only a test file
references them by name); read `au11-runtime-ownership-guard.ts`'s actual allowlist logic rather
than trusting its docstring, confirming its scope really is AC-1 (shell reappearance) + AC-2 (core
execution-import ban) and nothing broader — AC-3 (agent-layer-owns-core-CRUD) has no static
enforcement mechanism anywhere in the repo today, matching this document's Gap Register claim.

No new work package is needed. The next actions in dependency order are: merge PR #428 (AU11), then
start AU8 (now the only unblocked, not-yet-started AU work, and the last work package in the
track).

---

## Service-Scoped Architecture (AU12–AU17): As-Is vs Should (2026-07-12)

AU8's own review found the should-graph's two-layer split (Core App / Agent Layer) is real but too
coarse to build a zero-allowlist guard against: it names *no* real services, so a Routine handler
writing into `messages` is invisible to a check that only knows "core" from "agent." This section
goes one level down — real services, per layer, with their internal modules, and the exact
mechanism each crossing should use. It registers AU12–AU17 (`.pipeline/work-packages/TRACK-AU.md`)
and gives AU8 something concrete to check once they land. Grounded in direct code reading this
session (a forked audit + manual verification), not re-derived from the AU2-era component inventory.

**Update (2026-07-12): AU14 ("Knowledge write-path unification") is MERGED to `main` (PR #434,
commit `f22990a7`).** `routes/knowledge.ts`'s `POST /` and `PATCH /:id` now call
`knowledge-repository.ts`'s `create`/`update` instead of doing their own raw inserts; the dead
`getKnowledgeEvents()` singleton (zero `.on()` subscribers anywhere in the repo, independently
grep-confirmed twice — once by the architecture-critique reviewer, once by the code reviewer) and
its file `knowledge/events.ts` are deleted; the shared `EventBus` (the mechanism with real
subscribers — `ws-broadcaster.ts`, `git-export.ts`, `observability/dispatcher.ts`,
`relevance-listener.ts`) is the sole surviving event mechanism. Knowledge is the first of the six
AU12–AU16 domains to close its as-is/should gap completely and land on `main` — see the AU14
Completion Check below.

**Update (2026-07-12, later): AU12 and AU13 are both implementation-complete, reviewed DONE, and
CI-green — neither is merged yet (open PRs, awaiting human merge).** AU12 (Conversation + Users)
PR #435: 58 production write sites across 21 files migrated onto `conversation-store.ts` /
`user-store.ts`. AU13 (Work + Routine) PR #436: ~69 production write sites across 26 files migrated
onto `work-service.ts` / `routine-service.ts`. Both `npm run verify` and `release-guard` green on
each. **New since the AU14 update above:** §7 below records what each PR's own architecture pass
surfaced that this document didn't yet know — a real merge-order conflict between the two PRs on
`builtin-routine-handlers.ts`, four out-of-`packages/server` write locations AU12 explicitly
allowlisted rather than migrated, and a confirmed, unregistered gap (Settings/Notification raw
writes) that both PRs' own audits independently flagged as a prerequisite AU8 needs before it can
run with zero tolerated allowlist exceptions. AU15 and AU16 have not started (no branch/PR yet);
AU17 and AU8 are correctly still blocked on all five (AU12–AU16) landing.

### 1. Package boundary — as-is vs should

```mermaid
flowchart TB
  subgraph ASIS["AS-IS — one package, one directory, boundary = a hand-typed file list"]
    direction TB
    S1["@hyperidle/server"]
    S1 --> R1["routes/ — 38 files"]
    S1 --> SV1["services/ — 81 files, core AND agent-owned mixed together"]
    S1 --> K1["knowledge/ — 15 files (has real internal shape)"]
    S1 --> N1["notifications/ — 14 files (has real internal shape)"]
    S1 --> C1["config/ — 3 files"]
    S1 --> H1["harness/ — 19 files"]
    S1 --> M1["mcp/ — 2 files"]
    S1 --> T1["tools/ — 29 files"]
  end
```

```mermaid
flowchart TB
  subgraph SHOULD["SHOULD — two packages, boundary = a build fact"]
    direction TB
    CORE["@hyperidle/core-app"]
    CORE --> CV["conversation/"]
    CORE --> WK["work/"]
    CORE --> US["users/"]
    CORE --> KN["knowledge/"]
    CORE --> CF["configuration/ (settings + plugin defaults + overrides, one module)"]
    CORE --> RT["routine/"]
    CORE --> NT["notification/"]

    AGENT["@hyperidle/agent-layer"]
    AGENT --> TR["trigger-resolver/"]
    AGENT --> OR["orchestrator/ (+ lifecycle publishing)"]
    AGENT --> SB["sandbox-bridge/ (context in + capture out)"]
    AGENT --> HR["harness-registry/"]
    AGENT --> TS["tool-surface/ (tools + MCP, one door)"]
    AGENT --> CL["cost-limits/"]

    DESK["packages/desktop — Desktop Shell (unchanged, already correct)"]
    HI["Human Interface — web/desktop UI (unchanged, already correct)"]
  end
```

Today's four guard scripts (`au7-runtime-retirement-guard.ts`, `au9-direct-handoff-guard.ts`,
`au10-plugin-config-ownership-guard.ts`, `au11-runtime-ownership-guard.ts`) exist specifically
because there is no folder-level distinction inside `services/` — `AU9_AGENT_FILES` and
`AU11_AGENT_FILES` are hand-maintained arrays of file paths standing in for a package boundary that
doesn't exist yet. `packages/server/package.json`'s `exports` map already deep-exports ~15
individual internal files directly to other packages — confirmed by reading it — so even today's
nominal "public API" is not a deliberate small surface. AU17 is what turns the SHOULD diagram above
into a build-enforced fact instead of a diagram.

### 2. How services communicate — as-is vs should

| Crossing | As-is | Should | Why |
|---|---|---|---|
| Core service ↔ its own table | Mixed: Knowledge/Settings/Notification mostly do this correctly; Conversation/Work/Users/Routine do not — both core routes AND agent-owned files write these tables directly | Direct DB access, but *only* from the owning service's own files | The one place raw table access is correct — because nothing else is allowed to do it |
| Core service ↔ another core service | No shared functions exist for Conversation/Work/Users/Routine; each caller does its own insert | Function call to the other service's exported function | Same process, needs the answer now |
| Core service → Agent Layer, "do work" | Durable intent row (`agent_work_intents`) for every family **except** routines, which call `agent-selection.ts` directly at fire-time | Durable intent row, no exceptions | A queue's value is crash-safety + latency-decoupling, which holds even fully in-process — a second channel undermines that guarantee for exactly the family using it |
| Agent Layer → Core service, "record this fact" | **Fixed on both PRs, neither merged yet.** AU12 (PR #435, CI green) migrates `agent-work-assistant.ts`, `assistant-dispatcher.ts`, and the `threads` writes in `builtin-routine-handlers.ts` onto `conversation-store.ts`/`user-store.ts`. AU13 (PR #436, CI green) migrates `builtin-routine-handlers.ts`'s `items`/`routines`/`routine_runs` writes and `task-dispatcher.ts`/the routine reapers onto `work-service.ts`/`routine-service.ts`. Both touch `builtin-routine-handlers.ts` — see §7.1 for the concrete merge-order conflict. **Knowledge is fully correct and merged (AU14)** — every writer now goes through the one repository, with no remaining second path | Function call into the owning Core service | Never a raw write — the domain keeps owning its own invariants regardless of who's asking |
| Agent Layer internal services, to each other | Mostly already function calls, in-process | Function call | One pipeline |
| Orchestrator → harness process | Files (sandbox in/out) + `HarnessAdapter` interface (local spawn or `RemoteHarnessAdapter` over WS) | Unchanged — already correct | One interface, swappable implementation, caller oblivious to which |
| Running agent → tools/MCP/Knowledge search | MCP over HTTP — the harness's own MCP config is a real server URL (`cli-mcp-config.ts`), works identically local or remote | Unchanged — already correct | The agent is foreign code; MCP is its one audited door |
| Harness/worker capability state → Core (display) | 8 route files `import type` adapter/registry internals directly — a hand-verified allowlist, not a structural rule | A real read-only capability function Core calls; zero harness/mcp imports in Core at all | A read shouldn't need a per-file manual carve-out to stay safe |
| Plugin defaults / user overrides → Configuration | Already correct: `plugin-configuration.ts` is one module, `loadPluginConfigurationDefaults`/`setConfigurationOverride` are real functions, not raw writes | Unchanged — already correct | Confirmed by reading the code, not assumed |
| Desktop Shell's local files (`config.json`, `secrets.json`, `credentials.json`, `window-state.json`) | Already correct: each has exactly one owning function in `packages/desktop`, confirmed no other module touches them | Unchanged — already correct, just not previously named as such | Local-file storage is that owner's mechanism, not an exemption from ownership |
| Human Interface ↔ Core API | Real API always | Unchanged — already correct | Genuinely separate deployable, no shared memory, ever |

### 3. Dependency tree, scoped by service

```mermaid
flowchart LR
  AU11["AU11 — merged\n(app-runtime dissolved)"]
  AU11 --> AU12["AU12 — PR #435 open, CI green\nConversation + Users\nown their writes"]
  AU11 --> AU13["AU13 — PR #436 open, CI running\nWork + Routine\nown their writes"]
  AU13 --> AU15["AU15 — not started\nRoutine agent-selection\nthrough the intent queue"]
  AU14["AU14 — MERGED (#434)\nKnowledge write-path\nunification — DONE (independent)"]
  AU16["AU16 — not started\nDescriptor read-model\n(independent)"]
  AU12 --> AU17["AU17\nCore App / Agent Layer\nas real packages"]
  AU13 --> AU17
  AU14 --> AU17
  AU15 --> AU17
  AU16 --> AU17
  AU17 --> AU8["AU8\nshould-graph guard,\ngeneralized"]
```

AU12/AU13/AU14/AU16 have no dependency on each other and can build in parallel — they touch
disjoint files. AU14 confirms this held in practice: its whole pipeline run (architecture through
ship) touched only `packages/server/src/knowledge/` and `packages/server/src/routes/knowledge.ts`,
zero overlap with AU12's Conversation/Users files or AU13's Work/Routine files, and all three ran
concurrently without a rebase conflict. AU15 depends on AU13 only because both touch
`routine-scheduler.ts` and `builtin-routine-handlers.ts`; sequencing avoids two work packages editing
the same files at once. AU17 depends on all five because splitting packages around code that still
cross-writes just relocates the mess into two packages instead of fixing it — AU14 being done doesn't
unblock AU17 early, since AU17's own precondition is *all five* landing, not any one. AU8 depends
only on AU17 directly — the rest are transitive through it, matching this manifest's existing
convention (e.g. AU11 lists `depends: [AU9, AU10]`, not the full chain back through AU7).

### 4. Internal modules per service — as-is vs should

The should-graph's Core App / Agent Layer components are themselves collections of real files, not
single units. What follows is every file behind each service today, and what should own it.

**Core App — Knowledge** (already had real internal shape; the gap was the second write path, not
missing structure — **closed by AU14**, MERGED to `main` (PR #434, commit `f22990a7`)):

| File | Role | As-is / should |
|---|---|---|
| `knowledge-repository.ts` | `create`/`update`/`list`/`search` — the actual CRUD | **Now the only write path (AU14).** `routes/knowledge.ts`'s `POST /`/`PATCH /:id` call `repo.create`/`repo.update` instead of their own inserts; the repository's dead `getKnowledgeEvents()` emit calls were removed so the route's `EventBus` emit is the one surviving event per write |
| `attention-classifier.ts`, `attention-scoring.ts`, `attention-service.ts` | Relevance/attention scoring | Internal collaborators, call the repository — already correct shape |
| `promotion-pipeline.ts` | Promotion sweeps | Same |
| `relevance-engine.ts`, `relevance-listener.ts`, `relevance-service.ts`, `relevance-scoring.ts` | Relevance computation + event reaction | Same |
| `role-community-map.ts`, `scoring-config.ts`, `token-budget.ts` | Scoring support data/config | Same |
| `fts.ts` | Full-text search | Same |
| `errors.ts`, `types.ts` | Shared types/errors for the domain | Same |
| ~~`events.ts`~~ | Dead module-level `getKnowledgeEvents()` event singleton, zero subscribers | **Deleted (AU14)** — its emit calls were a second, unobserved event mechanism; the shared `EventBus` (route-side) is the one surviving mechanism |

**Core App — Notification** (also already has real internal shape; not yet audited for a
route-vs-module dual-path the way Knowledge was, flagged as an open check for AU12/AU13's audit
task rather than assumed clean):

| File | Role |
|---|---|
| `dispatcher.ts`, `drain.ts` | Queue drain / delivery |
| `adapter-factory.ts`, `console-adapter.ts`, `ntfy-adapter.ts`, `smtp-adapter.ts` | Delivery adapters |
| `daily-digest.ts`, `digest.ts` | Digest batching |
| `mute.ts`, `silence-policy.ts`, `redact.ts` | Delivery policy |
| `notification-listener.ts` | Domain-event reaction |
| `config.ts`, `types.ts` | Config/types |

**Core App — Conversation, Work, Users, Routine** (no dedicated folder exists today — this is the
literal absence AU12/AU13 build):

| Domain | As-is | Should |
|---|---|---|
| Conversation (`threads`, `messages`) | Scattered across `routes/threads.ts`, `routes/assistant.ts`, `routes/coach.ts`, plus direct writes from `services/agent-work-assistant.ts`, `services/assistant-dispatcher.ts` | A `conversation/` module owning both tables; every listed caller becomes a caller of it (AU12) |
| Users/Agents (`users`) | Scattered across `routes/users.ts`, `routes/agents.ts`, `routes/teams-routes.ts`, plus `services/agent-work-assistant.ts`'s lazy-create | A `users/` module (AU12) |
| Work (`bets`, `tasks`, `items`) | Scattered across core routes, plus `services/builtin-routine-handlers.ts`'s `items` insert | A `work/` module (AU13) |
| Routine (`routines`, `routine_runs`) | Scattered across core routes, plus `services/builtin-routine-handlers.ts`'s direct inserts | A `routine/` module (AU13) |

**Core App — Configuration** (already one real module, contrary to this document's earlier,
un-verified four-box model of "Plugin Loader / Settings Service / Configuration Store / Configuration
Resolver" — confirmed by reading `plugin-configuration.ts` directly):

| Function | Role |
|---|---|
| `loadPluginConfigurationDefaults`, `loadBuiltInConfigurationDefaults` | Plugin/built-in default seeding |
| `setConfigurationOverride`, `clearConfigurationOverride` | User override writes |
| `setPluginConfigurationState` | Plugin enable/disable/remove |
| `listResolvedConfiguration`, `getResolvedConfiguration` | The merged read Agent Layer's Trigger Resolver calls |

**Agent Layer — Trigger Resolver**: `trigger-resolution.ts`, `agent-selection.ts`, `roster.ts`.
As-is/should gap: `agent-selection.ts` is also called directly by `routine-scheduler.ts` (Core),
the one bypass this maps onto AU15.

**Agent Layer — Orchestrator** (absorbs the old "Lifecycle Publisher" — it isn't separate data, it's
this service narrating its own state transitions): `agent-work-handoff.ts`,
`agent-work-intent-worker.ts`, `agent-session-requests.ts`, `agent-run-boundary.ts`,
`agent-session-runtime.ts`, `session-provisioning.ts`, `agent-layer-boot.ts`,
`agent-work-assistant.ts`, `assistant-dispatcher.ts`, `task-dispatcher.ts`,
`routine-session-reaper.ts`, `sandbox-reaper.ts`, `contracts.ts`. As-is/should gap:
`agent-work-assistant.ts` and `assistant-dispatcher.ts` write Conversation/Users tables directly
(AU12); `task-dispatcher.ts` and the routine reapers should call Work/Routine once AU13 lands.

**Agent Layer — Sandbox Bridge** (merges the old "Context Assembly" and "Capture & Writeback" — same
files⇄domain-data translation, run in each direction): `context-assembly.ts`,
`context-assembly-prompt.ts`, `session-context.ts`, `writeback.ts`, `file-watcher.ts`. **Correction
from AU14's own audit:** this row previously read "both directions currently reach Knowledge's
table/repository inconsistently" — that was imprecise. `context-assembly.ts` (read direction) and
`writeback.ts` (write direction) already called `knowledge-repository.ts` correctly pre-AU14; they
were never part of the gap. The actual second write path was `routes/knowledge.ts` (a Core route,
not this service) doing its own raw insert instead of calling the repository — now closed by AU14.
Sandbox Bridge's Knowledge-facing calls were already should-shaped; no change was needed here.

**Agent Layer — Harness Registry**: `adapter-pool.ts`, `builtin-harness-adapter.ts`,
`cli-harness-adapter.ts`, `cli-mcp-config.ts`, `context-window.ts`, `disabled-sandbox-adapter.ts`,
`harness-capability-descriptors.ts`, `harness-discovery.ts`, `harness-session-probe.ts`,
`llm-client.ts`, `llm-types.ts`, `local-sandbox-adapter.ts`, `remote-harness-adapter.ts`,
`sandbox-adapter.ts`, `services/worker-ws.ts` (the WS control channel — relocated here by AU11,
zero DB imports, confirmed). As-is/should gap: this is the read surface 8 core routes bypass via
the descriptor-read allowlist instead of calling (AU16).

**Agent Layer — Tool Surface** (merges the old "Tool Registry" and "MCP Gateway" — two transports,
one concern): `tools/tool-registry.ts` + all `tools/*.ts` tool implementations, `mcp/mcp-bridge.ts`,
`mcp/mcp-bridge-registry.ts`, `services/mcp-route.ts` (relocated by AU11 — its body directly
executes MCP requests, not a descriptor read, confirmed), `harness/provision-return-hook.ts`,
`harness/re-engage.ts`, `harness/return-enforcement-registry.ts`, `harness/return-gate.ts`,
`tools/return-status-tool.ts`. Already clean — no gap found.

**Agent Layer — Cost & Limits**: `services/cost-cap.ts`, `services/cost-sentinel.ts`,
`harness/llm-cost-estimate.ts`. Already clean — no gap found.

**Open question carried from this session, not resolved here:** Harness Registry and Tool Surface
are both "capability registries" and could arguably merge into one — kept separate above because a
harness is selected once per session while tools/MCP are invoked repeatedly within one, a real
lifecycle difference. Worth a second opinion during AU17's architecture pass, not assumed settled.

### 5. AU14 Completion Check

| AU14 requirement | Status | Notes |
|---|---|---|
| `routes/knowledge.ts` create/update handlers call the repository's `create`/`update` rather than their own inserts/updates | Complete, PR open | `POST /` and `PATCH /:id` now call `repo.create`/`repo.update`; raw `db.insert(knowledgeItems)` and the manual per-field edit-log loop are gone. Independently re-verified against the live diff by the Phase-4 reviewer, not just the builder's report. |
| Q2 user-scope visibility rule holds exactly as before, reads and writes | Complete, PR open | Read filters in the untouched GET handlers; write-side `resolvedScopeId` resolution and the `requiresScopeId` 400 guard stay route-side; the repository stays scope-agnostic so its non-HTTP callers (`write-memory.ts`, `writeback.ts`, `context-assembly.ts`) keep working unchanged. |
| Exactly one event per create/update, observable by every current consumer of either mechanism | Complete, PR open | Both the architecture-critique reviewer and the code reviewer independently grepped for `.on()` subscribers on the module-level `getKnowledgeEvents()` singleton and found zero, confirming it was dead; it and its file (`knowledge/events.ts`) were deleted, and the route's existing `EventBus` emit — the mechanism with real subscribers — is unchanged and fires exactly once per write. |
| Knowledge edit log records an entry for every create/update, regardless of origin | Complete, PR open | The repository already wrote this row unconditionally for every caller; the actual gap was that the API route's create wrote none. A new test proves the API path now produces an `editType:"create"` row, closing that gap. A pre-existing, unrelated test (`agent-work-intent-production.integration.test.ts`) asserted the edit-log table was empty after a rollback — true only because the old route wrote nothing; it was corrected in the same PR to assert zero *new* rows, preserving its actual intent (rollback atomicity) without weakening it. |
| Review includes a should-graph audit proving Knowledge has one write path | Complete, PR open | This section (Core App — Knowledge, above) is that audit: `knowledge-repository.ts` is now the only writer, confirmed by re-reading the live diff, not by trusting either agent's self-report. |
| Full as-should dependency tree mechanically enforced | Not an AU14 requirement | AU14 closed one domain's write-path duplication; a mechanical guard forbidding a *future* second write path from reappearing is AU8's should-graph-guard scope, same pattern as AU9–AU11's targeted guards preceding AU8's unified one. |

One thing this completion check does **not** cover, worth naming rather than leaving implicit: AU14
had no dependency on AU12/AU13/AU15/AU16 and none of them depend on it either (see the dependency
tree in §3) — its being done first doesn't accelerate or block any sibling. AU17 still needs all
five landed before it can start.

### 6. AU12/AU13 completion snapshot, and two things AU8 needs before it can run

**Status.** AU12 (PR #435) and AU13 (PR #436) are both implementation-complete, reviewed DONE, CI
green, and open — not yet merged. Between them they migrated ~127 production write sites (58 + 69)
across 47 files onto four new owning modules (`conversation-store.ts`, `user-store.ts`,
`work-service.ts`, `routine-service.ts`), each with its own AST write-ownership guard wired into
`npm run lint`. This closes four of the six as-is/should gaps this section tracks (Conversation,
Users, Work, Routine — alongside Knowledge, already merged via AU14). Their own architecture passes
surfaced three things this document didn't know before, none of which change the AU12/AU13 verdict
(both are correctly DONE against their own contracts) but all of which AU17/AU8 need on record.

**6.1 — A real merge-order conflict on `builtin-routine-handlers.ts`, not yet resolved.** AU13's
plan (`.pipeline/plans/AU13.md` §6) explains why: AU13's builder audited the repo while AU12's
worktree was still empty (concurrent pipeline runs, no shared lock on which lands first), so AU13
correctly deferred AU12's part of the file and left `runPostBetRetro`/`runPortfolioRetro`'s
`tx.insert(threads)` calls untouched, migrating only the co-located `tx.insert(items)` in the same
two functions onto `work.createItem`. AU12's own pipeline run, dispatched independently, migrated
the *same* two functions' `tx.insert(threads)` calls onto `conversation-store.ts`'s `insertThread` —
unaware of AU13's parallel run. Diff-checked directly (`git diff origin/main
origin/framework/AU12-…` vs `…AU13-…` on this file): both PRs edit overlapping hunks inside
`runPostBetRetro`/`runPortfolioRetro`, and AU13 also removes `routineRuns` from the file's
`@hyperidle/db` import (now unused there) while AU12 adds a new import line to the same block. This
is a genuine rebase conflict, not a diagram-level footnote — **whichever of #435/#436 merges
second must rebase onto the first and hand-reconcile these two functions** so both the `threads`
insert (→ `conversation-store`) and the `items` insert (→ `work-service`) land migrated together,
plus reconcile the import block. Recommend the human merging these two PRs do so back-to-back and
resolve this file's conflict directly, rather than letting a third agent rediscover it cold.

**6.2 — Four write locations outside `packages/server` that AU12 deliberately did not migrate —
these do not block AU8.** AU12's own audit (`plans/AU12/architecture.md` §5a, referenced from the
PR) found four more `users`/`threads`/`messages` write call sites, all outside
`packages/server/src` — outside the scope this whole Service-Scoped Architecture section (and AU8's
guard) actually covers, since Core App / Agent Layer, per §1, are both inside `packages/server`
today (and become `@hyperidle/core-app` / `@hyperidle/agent-layer` post-AU17):

| Site | Writes | Why it's not a violation |
|---|---|---|
| `packages/db/src/factory-bootstrap.ts` (6 sites) | `users` insert/update | `packages/db` sits *below* `packages/server` in the dependency direction — it structurally cannot import a server-side store without an upward/circular dependency. Not a gap; already correctly on the other side of the boundary. |
| `packages/db/src/demo-fixture.ts` (4 sites) | `users` insert/update | Same layer, same reasoning; already gated by its own `demo-fixture-guard`. |
| `packages/eval/src/seeding.ts` (7 sites) | `users`/`threads`/`messages` | `packages/eval` *could* import the stores (it depends on `@hyperidle/server`) but this is benchmark-fixture seeding building arbitrary graph shapes for evals — same category as a test fixture, which writes directly by design, and the same pattern AU17's own plan text already names as an expected exception (the `routines.ts` 3-function curated export for `packages/eval`). Not on any production request/agent path. |
| `packages/web/scripts/ah6-test-server.ts` (2 sites) | `users` insert | Dev/test harness bootstrap script, never a shipped request path. |

AU8's guard (a `TABLE_OWNER` map, per its Plan calls in `.pipeline/work-packages/TRACK-AU.md`)
should be scoped to `packages/server/src` — matching where AU9–AU13's own guards already scope
their checks, and matching where Core App / Agent Layer actually live per §1. Scoped that way, none
of these four sites are even visible to the guard; they need no allowlist entry at all. They only
become a problem if AU17/AU8 later decide to widen the guard to the whole monorepo without carrying
this table forward — in which case these four are exactly the "explicitly surfaced and justified
during a work package's own architecture pass" exceptions the AU8 contract already permits
allowlisting (`TRACK-AU.md`, AU8 Contracts/constraints), not violations sent back for rework.
**Recommendation: AU17's architecture pass should paste this table into its own plan directly, so
AU8 doesn't have to rediscover it, and should confirm the guard's scope is `packages/server/src` (or
the two future packages) rather than monorepo-wide.**

**6.3 — Settings and Notification raw writes: a real, confirmed, currently-unregistered gap that
*will* block AU8 unless a new work package closes it first.** This is the one finding in this
update that changes AU8's readiness, not just its bookkeeping. AU12's Plan calls and AU13's Plan
calls both required a first-task audit of Settings/Notification for the same raw-write pattern;
both ran it independently (AU12 first, AU13 confirmed and refined it, since AU12 hadn't migrated
anything there for AU13 to build on) and got the same answer:

- **Settings (`factorySettings`, a generic key-value table shared by cost, git-export,
  observability, and notifications):** raw-written from ~10–11 production sites across 8 files —
  `services/cost-cap.ts:378`, `services/cost-sentinel.ts:70,75`, `notifications/config.ts:247,263`,
  `notifications/mute.ts:62`, `services/observability/config.ts:129`,
  `config/git-export-config.ts:115,145`, `routes/status.ts:142`. No owning Settings service exists.
- **Notification (`notificationQueue`):** raw-written from ~15 sites across 5 files —
  `notifications/dispatcher.ts` (~9), `notifications/digest.ts` (4),
  `routes/notifications-routes.ts` (407, 430), `services/retention-reaper.ts:148`,
  `services/lifecycle-propagation.ts:663`. No owning Notification service exists.

Both are the identical structural violation AU12/AU13 exist to close for their own domains — and
both are *inside* `packages/server`, squarely in AU8's checked scope, so they are **not** eligible
for the "outside the guard's scope" reasoning in §6.2. AU8's own contract
(`TRACK-AU.md`, AU8 Contracts/constraints) is explicit: "no allowlist entries for genuine
violations... anything else found must be sent back as a new prerequisite work package, not
absorbed into an exception." Neither AU12 nor AU13 built this (correctly — both flagged it as
scope-growth and declined to silently absorb it, per their own Out-of-scope sections), and **no
work package currently registered in `pipeline-manifest.yaml` or `TRACK-AU.md` covers it.** The
should-graph (§1) already names a Settings Service and a Notification Service as target Core App
components — the target shape is decided, just not built. **Recommendation: register a new work
package (e.g. `AU18` — "Settings and Notification own their own writes," same shape as AU12/AU13)
and sequence it as a dependency of AU17/AU8, alongside AU12–AU16, before AU8 attempts its
zero-tolerance guard.** Without it, AU8 will either have to allowlist real violations (which the
track's own founder ruling forbids) or fail on landing, and either way the work will resurface as
exactly the kind of last-minute rediscovery this section exists to prevent.

### 7. What this section is, and isn't

This is a should-graph refinement, not a new should-graph — the two-layer contract in §"Layer
Interaction Graph" above (Core App owns records/events, Agent Layer owns execution, Plugins are
configuration-only) is unchanged. What's new is naming the real services inside each layer and the
specific mechanism each crossing should use, because AU8's own audit found the two-layer split alone
cannot support a zero-allowlist guard: it has no vocabulary for "a Routine handler wrote into a
Conversation table," since both are "core." AU12–AU17 (`.pipeline/work-packages/TRACK-AU.md`) are
what turn this section from a diagram into source. AU8 is the last work package in the track either
way — this section is what it will actually check once they land.

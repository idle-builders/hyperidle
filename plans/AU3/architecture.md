# AU3 Architecture Plan: No Fabric Runtime Layer

## Required Reading

- `.pipeline/work-packages/AU3/requirements.md`
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
- `.claude/rules/typescript.md`
- `.claude/rules/testing.md`

## Plan Reconciliation

- Spec assumes AU1 session request boundary exists. Reality: `agent_session_requests` exists, session routes and routine/decomposition paths already use or can use it. AU3 must preserve this path and must not invent a second execution queue.
- Spec assumes AU2 config exists. Reality: `packages/server/src/services/plugin-configuration.ts`, shared configuration types, and plugin/config tables exist; `createServer()` already calls `projectProductionConfigurationDefaults(db)`. AU3 can move built-in defaults and former Fabric behavior behind this resolver instead of hard-coded Strategy methods.
- Spec says no Fabric runtime layer. Reality: `packages/server/src/server-factory.ts` imports `bootstrapFabric`, `fabricStrategy`, `createGitRunner`, registries from `@hyperidle/fabric`, and calls `setActiveStrategy(fabricStrategy)` plus `bootstrapFabric(...)`. AU3 removes this boot path.
- Spec says no Strategy. Reality: `packages/shared/src/strategy-port.ts`, `packages/server/src/services/strategy-registry.ts`, `packages/fabric/src/fabric-strategy.ts`, and `packages/strategy-minimal` remain production concepts. AU3 deletes or de-exports them after replacing every production call site.
- Spec says core/server must not depend on Fabric. Reality: server production imports Fabric in boot, app, session provisioning/lifecycle, bet decomposition, assistant formation, creation/selection surfaces, knowledge/routes, routines, notifications, git export, tool handlers, cost helpers, and filesystem helpers. AU3 is a package/API move plus behavior-preservation work, not a rename.
- Spec says Knowledge remains app-owned. Reality: `knowledge_items` is core but projections/scoring/writeback still live in `packages/fabric`; routes join and write `knowledgeStrategyFabric` directly. AU3 moves knowledge repository/projection/scoring/writeback into app-owned `packages/server/src/services/knowledge/` and schema aliases.
- Spec says durable Fabric-named data remains readable. Reality: physical tables `knowledge_strategy_fabric` and `task_strategy_fabric` exist across migrations and tests. AU3 keeps physical tables, adds app-owned exports/services, and statically bans new production imports of old names outside compatibility modules.
- Spec says user/developer vocabulary should not present Fabric/Strategy as runtime concepts. Reality: docs and comments still call `kernel-strategy-split.md` authoritative. AU3 updates current-state docs and adds a vocabulary guard with historical/migration allowlists.

## Target Ownership Map

| Current Fabric/Strategy component | Target owner | Target path |
|---|---|---|
| Strategy port and active registry | delete | remove `packages/shared/src/strategy-port.ts`, `packages/server/src/services/strategy-registry.ts`, `packages/strategy-minimal` after call sites migrate |
| `fabricStrategy.assembleContext` | agent layer context provider | `packages/server/src/services/agent-context/assemble-context.ts` |
| `beginLearningIngestion` / watcher / writeback | agent layer capture/writeback | `packages/server/src/services/agent-context/writeback.ts`, `file-watcher.ts`, `polling-watcher.ts` |
| `context-assembly-prompt`, `session-context`, token budget | agent layer context provider | `packages/server/src/services/agent-context/` |
| Cost cap/dedup helpers | agent layer cost service | `packages/server/src/services/session-cost.ts` |
| Agent scaffold/selection/decomposition/formAssistant Strategy methods | core/app config + agent request services | `packages/server/src/services/agent-defaults/`, `select-agent.ts`, `bet-decomposition.ts`, `assistant-turn.ts` |
| Built-in routines and routine scheduler | core Routine service + agent session requests | `packages/server/src/services/routines/` |
| Task dispatcher | agent layer dispatcher | `packages/server/src/services/agent-session-dispatcher.ts` |
| Notifications adapter/config/dispatcher/drain | core Notification service | `packages/server/src/services/notifications/` |
| Item routing, founder routing, review item factory | core Conversation/Review service | `packages/server/src/services/items/` |
| Knowledge repository, FTS, relevance, attention, promotion | core Knowledge service | `packages/server/src/services/knowledge/` |
| Git export runner/config/service | core Knowledge export service | `packages/server/src/services/git-export/` and filesystem helpers |
| Policy/approval helpers | core review/routine service | `packages/server/src/services/reviews/` |
| Physical `knowledge_strategy_fabric`, `task_strategy_fabric` tables | compatibility storage | app-owned Drizzle aliases and services; no destructive rename in AU3 |
| Built-in roster/routine/tool/MCP/harness defaults | AU2 built-in config projection | `projectProductionConfigurationDefaults` plus extracted default seed modules |
| Knowledge taxonomy/status/layer/types currently imported from `@hyperidle/fabric/types` | shared app vocabulary | `packages/shared/src/knowledge.ts`, `packages/api-contract/src/knowledge.ts`, `packages/design-system/src/knowledge-status.ts` |
| User-facing "strategy agent" / "managed by strategy" labels | app-owned agent category vocabulary | rename to "factory-wide agent", "managed by app defaults", or internalize as non-rendered storage value |

## Acceptance Criteria And Verification

| AC | Verification |
|---|---|
| AC1 boot has no Strategy/Fabric runtime | Add `packages/server/src/__tests__/AU3-no-fabric-boot.integration.test.ts`: boot `createServer()` with fixture DB, builtin pool, disabled sandbox, no Strategy setup, assert health and representative routes succeed. Add ESLint bans for `setActiveStrategy`, `getActiveStrategy`, `fabricStrategy`, `bootstrapFabric` in production source. |
| AC2 observable behavior preserved | Keep protected tests below with assertions unchanged. Add `packages/server/src/__tests__/AU3-domain-behavior.integration.test.ts` covering knowledge create/read/update with projection row, routine manual/fire path into session request, notification enqueue/list/drain, and git export route response. |
| AC3 agent layer owns LLM execution | Add `packages/server/src/services/__tests__/AU3-agent-layer-execution.integration.test.ts`: drive accepted task dispatch, assistant message, bet decomposition, routine fire, and direct session route; assert each goes through session request/provisioning services and emits session lifecycle events, with no Strategy object injection. |
| AC4 no server/core Fabric package dependency | Add/extend ESLint `no-restricted-imports` for production `packages/server/src/**`, `packages/shared/src/**`, `packages/api-contract/src/**`, `packages/web/src/**` public runtime surfaces. Remove `@hyperidle/fabric` and `@hyperidle/strategy-minimal` from `packages/server/package.json`; `npm run knip:production` verifies no production dependency remains. Add a static guard banning production imports of `knowledgeStrategyFabric` and `taskStrategyFabric` outside DB schema, migrations, tests, and explicit compatibility modules. |
| AC5 no runtime Fabric/Strategy vocabulary | Add `scripts/au3-runtime-vocab-guard.ts` wired into `npm run lint`, with allowlist for historical docs, migration SQL/meta snapshots, tests, and compatibility table-name declarations. Guard checks production docs/current-state pages, source comments/log messages/errors/API exports for banned runtime concepts. |
| AC6 existing Fabric-named data readable | Add `packages/server/src/services/__tests__/AU3-projection-compat.integration.test.ts`: seed `knowledge_strategy_fabric` and `task_strategy_fabric`, boot/apply migrations, read through app-owned projection services and API fields, update via app-owned service, assert no rows lost and physical table remains. |
| AC7 static and runtime gates green | Run `npm run check`, `npm run lint`, `npm run test` during build; before shipping run `npm run verify`. |

## Contracts

### Agent Context Provider

Replace Strategy context/ingestion methods with direct agent-layer services.

```ts
export interface AssembleAgentContextInput {
	readonly db: HyperIdleDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly taskId: string | null;
	readonly agentId: string;
	readonly agentRole: UserRole;
	readonly teamId: string | null;
	readonly isRoutine: boolean;
	readonly sourceKind: AgentSessionRequestSourceKind | null;
	readonly sourceId: string | null;
}

export interface AgentContextAssemblyOutcome {
	readonly itemCount: number;
	readonly durationMs: number;
	readonly manifestPath: string;
}

export interface AgentWritebackHandle {
	dispose(): void;
}

export async function assembleAgentContext(
	input: AssembleAgentContextInput,
): Promise<AgentContextAssemblyOutcome>;

export function beginAgentWriteback(input: {
	readonly db: HyperIdleDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly manifestPath: string;
}): AgentWritebackHandle;
```

Rules:

- Manifest path remains `<sandbox>/.fabric/manifest.json` for compatibility in AU3; service names are app-owned.
- Task-free session requests still assemble the relevant conversation/decomposition/routine context when available.
- Writeback must flush best-effort on `dispose()` and never throw during teardown.

### App-Owned Projection Aliases

Keep physical table names in AU3, but add app-owned exports and production services.

```ts
export const knowledgeAppProjection = knowledgeStrategyFabric;
export const taskPlanningSignals = taskStrategyFabric;

export type KnowledgeAppProjectionRow = typeof knowledgeAppProjection.$inferSelect;
export type TaskPlanningSignalRow = typeof taskPlanningSignals.$inferSelect;
```

Rules:

- Production server code imports app-owned aliases/services only.
- Old names may remain in `packages/db/src/schema.ts`, migration files, tests, and explicit compatibility modules.
- No migration drops or truncates existing projection tables.

### Agent Defaults And Selection Resolvers

Replace Strategy creation/selection/assistant/decomposition calls with app-owned pure resolver functions backed by AU2 config and existing durable rows. There is no process-wide active implementation, singleton registry, or swappable runtime object.

```ts
export async function resolveAgentScaffoldSpecs(
	input: ResolveAgentScaffoldSpecsInput,
): Promise<readonly AgentScaffoldSpec[]>;

export async function resolveAgentSelection(
	input: ResolveAgentSelectionInput,
): Promise<SelectAgentOutcome>;

export async function resolveAssistantFormation(
	input: ResolveAssistantFormationInput,
): Promise<AssistantFormation>;

export async function resolveDecompositionPlan(
	input: ResolveDecompositionPlanInput,
): Promise<DecompositionPlanningOutcome>;
```

Rules:

- Defaults come from resolved configuration first, then app-owned built-in fallbacks.
- No service can provision a harness directly.
- Resolvers are normal imported functions; callers pass `db`, event/request context, and resolved config dependencies explicitly.
- `resolveDecompositionPlan(...).tasks` preserves current behavior: AU3 does not introduce richer decomposition quality.

### Shared And Web Vocabulary

Move knowledge and agent-category vocabulary out of Fabric-owned exports before removing the package dependency.

```ts
// packages/shared/src/knowledge.ts
export const KNOWLEDGE_STATUSES = [
	"captured",
	"provisional",
	"validated",
	"active",
	"stale",
	"archived",
	"needs_human",
] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const KNOWLEDGE_LAYERS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type KnowledgeLayer = (typeof KNOWLEDGE_LAYERS)[number];
```

Rules:

- `packages/web`, `packages/design-system`, and `packages/api-contract` import knowledge taxonomy/status labels/scope mapping from `@hyperidle/shared` or app-owned API/design-system modules, never `@hyperidle/fabric/types`.
- User-facing labels must not render "Strategy" as the runtime owner. If the persisted `agentCategory` value remains `"strategy"` for compatibility, presentation maps it to app-owned language.
- Component protection includes `KnowledgeRow`, Knowledge list/detail surfaces, `AgentProfile`, `WorkTeam`, and `AgentDetailPane` stories/tests/static checks.

### Boot Contract

`createServer()` owns production wiring:

- Project AU2 configuration defaults.
- Register session request creator/consumer if registries remain internal to agent layer.
- Start app-owned routine scheduler, notification dispatcher, lifecycle propagation, relevance listeners, git export listeners, task dispatcher, and session review creator.
- Do not call `setActiveStrategy`, `fabricStrategy`, or `bootstrapFabric`.
- `createApp()` option should be renamed from `strategyBootstrap` to an app-owned service bootstrap name or deleted if production wiring lives in `createServer()`.

## Fabric Bootstrap Migration Matrix

Current `bootstrapFabric` registration must be migrated one registration at a time. Each target keeps disposer semantics explicit so `disposeApp()` and server shutdown behavior remain unchanged.

| Current registration | Target owner/path | Disposer behavior | Verification |
|---|---|---|---|
| FTS setup | Core Knowledge service: `packages/server/src/services/knowledge/fts.ts` or boot migration helper | No long-lived disposer; setup is idempotent and boot-scoped | Service integration boots app and asserts Knowledge search route/query works on seeded item; existing FTS sanitization tests moved under server remain green |
| Relevance listener | Core Knowledge service: `packages/server/src/services/knowledge/relevance-listener.ts` | Returns EventBus unsubscribe disposer; registered once at app boot | Integration emits knowledge access/update/edit event and asserts projection score update or queued recomputation observable |
| Session review creator | Core Review/Conversation service: `packages/server/src/services/reviews/session-review-creator.ts` | Returns EventBus unsubscribe disposer | Existing session-review/protected route tests plus AU3 domain behavior test assert medium/high-risk session completion creates review item |
| Policy engine | Core Review service: `packages/server/src/services/reviews/policy-engine.ts` | Pure service or EventBus disposer only if listener remains; no Strategy bootstrap | Unit/service tests for approval-rate/autonomy behavior import app-owned service and preserve outputs |
| Lifecycle propagation | Core Process service: `packages/server/src/services/lifecycle-propagation.ts` | Returns EventBus unsubscribe disposer | Existing lifecycle propagation tests remain green; integration emits session/task/bet events and asserts state propagation |
| Built-in routine handlers | Core Routine service: `packages/server/src/services/routines/builtin-handlers.ts` | Handler registry is boot-local; disposer unregisters event handlers/timers if registered | Routine integration tests assert built-in manual/event routines still resolve handler and create expected item/session request |
| Cost-cap dedup releaser | Agent-layer cost service: `packages/server/src/services/session-cost.ts` | EventBus unsubscribe disposer for session terminal events; in-memory dedup cache has explicit clear for tests | Cost-cap session-end-path tests moved to app-owned service assert dedup release on complete/crash/fail paths |
| Cost sentinel | Core Cost/Routine service: `packages/server/src/services/cost-sentinel.ts` | Interval disposer if still scheduled; otherwise EventBus unsubscribe | Existing cost sentinel tests moved under server assert alerts/items still produced or no-op behavior preserved |
| Git export handler | Core Knowledge export service: `packages/server/src/services/git-export/handler.ts` | EventBus unsubscribe disposer; no leaked git runner handles | Git export route/integration tests assert export trigger and route response still work |
| Notification dispatcher/listener/drain | Core Notification service: `packages/server/src/services/notifications/` | Listener unsubscribe plus interval/queue drain disposer; adapter factory owned by route/service | Notifications route integration and AU3 domain behavior test assert enqueue, list, drain/flush paths |
| Task dispatcher | Agent layer dispatcher: `packages/server/src/services/agent-session-dispatcher.ts` | EventBus unsubscribe disposer; no cross-package provision registry | Agent-session runtime tests assert accepted/ready task creates session request and dispatch snapshot route works |
| Sandbox reaper | Agent layer workspace maintenance: `packages/server/src/services/workspace-reaper.ts` | Interval disposer; no-op in disabled sandbox/server profile as today | Reaper integration/unit tests assert stale workspace cleanup and disposer stops interval |
| Retention reaper | Core retention service: `packages/server/src/services/retention-reaper.ts` | Interval disposer | Existing retention tests moved under server assert expired rows/files cleaned and active rows preserved |
| Routine-session reaper | Core Routine/session maintenance: `packages/server/src/services/routines/routine-session-reaper.ts` | Interval disposer | Routine-session reaper tests assert orphaned/expired routine sessions resolved |
| Routine scheduler | Core Routine service: `packages/server/src/services/routines/scheduler.ts` | Interval disposer plus EventBus unsubscribe for event-triggered routines | Routines integration tests and AU3 domain behavior test assert manual fire, event fire, and scheduled due check create session requests without Strategy/Fabric |

## Ordered Tasks

1. Write failing static gates first: ESLint import bans and `scripts/au3-runtime-vocab-guard.ts`, wired into `npm run lint` with allowlists for migrations/history/tests. Include explicit production import bans for `knowledgeStrategyFabric` and `taskStrategyFabric` outside `packages/db/src/schema.ts`, migration files, tests, and named compatibility modules.
2. Write failing boot integration test proving `createServer()` works without any Strategy/Fabric registration.
3. Write failing domain behavior integration test `packages/server/src/__tests__/AU3-domain-behavior.integration.test.ts` covering representative knowledge projection read/write, routine manual/fire into session requests, notification enqueue/list/drain, git export route response, and protected route assertions for the surfaces listed in the route checklist.
4. Write failing projection compatibility integration test for `knowledge_strategy_fabric` and `task_strategy_fabric` rows read through app-owned services.
5. Write failing agent-layer execution integration test covering task dispatch, assistant turn, decomposition, routine fire, and direct session route through session request/provisioning.
6. Write protected web/shared vocabulary checks: component/static checks for `KnowledgeRow`, Knowledge list/detail, global search, `AgentProfile`, `WorkTeam`, and `AgentDetailPane` proving no production import from `@hyperidle/fabric/types` and no user-facing "managed by strategy"/runtime Strategy labels.
7. Add app-owned shared/API/design-system knowledge taxonomy modules; migrate web/design-system/API imports from `@hyperidle/fabric/types`; map persisted `"strategy"` agent category to app-owned user-facing language or internalize it.
8. Add app-owned DB aliases/types and projection services; migrate production imports from old Fabric-named schema exports.
9. Move/copy knowledge repository, FTS, scoring, relevance, attention, promotion, context assembly, prompt assembly, token budget, watcher, writeback into server app/agent services. Preserve behavior before deleting old package files.
10. Migrate every `bootstrapFabric` registration using the Fabric Bootstrap Migration Matrix, preserving each disposer contract before deleting the bootstrap bundle.
11. Move/copy notification services, item routing/review helpers, routine scheduler/builtin routines, task dispatcher, git export, cost helpers, cron helpers, and filesystem git helpers into server services.
12. Replace `getActiveStrategy().assembleContext` and `beginLearningIngestion` in session provisioning/lifecycle with `assembleAgentContext` and `beginAgentWriteback`.
13. Replace creation/selection/decomposition/assistant Strategy calls with app-owned resolver functions backed by AU2 config and existing user/routine rows.
14. Rewire `server-factory.ts` and `app.ts` to app-owned boot services. Remove `fabricStrategy`, `bootstrapFabric`, `setActiveStrategy`, `setProvisionSessionFn` cross-package bridge where no longer needed.
15. Remove production dependency edges and exports: `@hyperidle/fabric`, `@hyperidle/strategy-minimal`, `strategy-port`, `strategy-registry`. Keep or migrate tests only after behavior tests are green.
16. Update current-state architecture docs: `system-overview.md`, `as-implemented-domain-architecture.md`, `data-flow-examples.md`, `the-canonical-store.md`, `the-knowledge-fabric-how-knowledge-moves.md`, `tasks-and-sessions.md`, `routines-and-retros.md`, and retire/mark `kernel-strategy-split.md` historical.
17. Run `npm run check`, `npm run lint`, `npm run test`; before ship run `npm run verify`.

## Design-It-Twice

Alternative A: keep `packages/fabric` as an implementation package but rename exports to app-owned names. Trade-off: lower file movement, but package dependency still teaches Fabric as a runtime layer and `server -> fabric -> db/shared` remains the old shape. Reject because AU3 explicitly requires no Fabric runtime package or boot path.

Alternative B: move behavior into app-owned server/domain services and delete Fabric/Strategy production packages. Keep physical projection table names as compatibility storage with app-owned aliases. Trade-off: bigger mechanical migration, but the dependency graph matches the new architecture and data compatibility is explicit.

Chosen: Alternative B. AU3 is foundational and should pay the one-time move cost. Keeping the package would leave the dead runtime concept in every future dependency conversation.

## Route Checklist

Routes that must keep behavior while imports move:

- `packages/server/src/routes/knowledge.ts` -> app-owned knowledge projection/scoring service
- `packages/server/src/routes/search.ts` -> app-owned knowledge projection alias
- `packages/server/src/routes/bets.ts` -> app-owned projection alias for retros/reflections
- `packages/server/src/routes/routines-routes.ts` -> app-owned cron/routine service
- `packages/server/src/routes/notifications-routes.ts` -> app-owned notification service
- `packages/server/src/routes/status.ts` -> app-owned digest/status service
- `packages/server/src/routes/git-export-routes.ts` -> app-owned git export service
- `packages/server/src/routes/dispatch-queue-routes.ts` -> app-owned agent dispatcher snapshot
- `packages/server/src/routes/teams-routes.ts` -> app-owned routine provisioning/notification helpers
- `packages/server/src/routes/users.ts`, `assistant.ts` -> app-owned agent defaults service
- `packages/server/src/routes/sessions-routes.ts` -> agent-layer context/capture services

## Security And Abuse Cases

- Rate-limit state-changing endpoints: applicable. Existing route rate limits remain; AU3 must not weaken notification, harness, connection, routine, or knowledge write limits.
- Input trust boundary for agent-authored fields: applicable. Moved tool handlers and writeback services keep existing validation and do not trust agent-written markdown/JSON as executable config.
- Secret handling: applicable. Moving MCP/git/notification services must preserve no-secret-response/no-log behavior. Credentials remain in `server_credentials` and `service_connections`; config defaults must not store secret values.
- Path traversal: applicable. Context assembly, writeback, git export, and filesystem mount helpers handle paths. Preserve existing path normalization and sandbox-root constraints.
- SSRF: applicable for MCP server descriptors and notification adapters. AU3 must not expand outbound URL handling beyond existing validated surfaces.
- Preemptive security/gating: N/A. Do not add trust tiers, plugin sandboxing, approval chains, or irreversible-action classifiers.

## Migrations

- No destructive migration drops `knowledge_strategy_fabric` or `task_strategy_fabric`.
- Add app-owned Drizzle aliases and, only if necessary, SQL views or comments for forward vocabulary.
- Remove package-level production dependencies on `@hyperidle/fabric` and `@hyperidle/strategy-minimal`.
- Remove or de-export `packages/shared/src/strategy-port.ts` after all production imports are gone.
- Rename/deprecate runtime option names such as `strategyBootstrap`; update call sites and tests.
- Update migration/seed code only where it writes app-owned aliases; factory bootstrap may keep physical table compatibility until a future data-vocabulary migration.
- Add lint/static guard banning production imports of `knowledgeStrategyFabric` and `taskStrategyFabric` outside DB schema, migrations, tests, and explicit compatibility modules; production callers use app-owned aliases/services only.
- Move web/shared knowledge status/layer/kind labels and scope mapping to app-owned shared/API/design-system modules before removing Fabric package exports.

## Protected Tests

protectedTests:

- `packages/server/src/__tests__/configuration-projection-boot.integration.test.ts`
- `packages/server/src/services/__tests__/plugin-configuration.test.ts`
- `packages/server/src/services/__tests__/agent-session-requests.test.ts`
- `packages/server/src/services/__tests__/agent-session-runtime.test.ts`
- `packages/server/src/routes/__tests__/knowledge.q2.integration.test.ts`
- `packages/server/src/routes/__tests__/knowledge.af13.integration.test.ts`
- `packages/server/src/routes/__tests__/routines.routes.integration.test.ts`
- `packages/server/src/routes/__tests__/notifications.routes.integration.test.ts`
- `packages/server/src/routes/__tests__/git-export.routes.integration.test.ts`
- `packages/server/src/routes/__tests__/dispatch-queue.routes.integration.test.ts`
- `packages/server/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts`
- `packages/server/src/mcp/__tests__/mcp-bridge-stateful.integration.test.ts`
- `packages/server/src/tools/__tests__/create-routine.integration.test.ts`
- `packages/server/src/tools/__tests__/promote-knowledge.integration.test.ts`
- `packages/design-system/src/KnowledgeRow.tsx`
- `packages/design-system/src/status-mapping.ts`
- `packages/web/src/pages/KnowledgeList.tsx`
- `packages/web/src/pages/KnowledgeDetail.tsx`
- `packages/web/src/hooks/useGlobalSearch.ts`
- `packages/web/src/pages/AgentProfile.tsx`
- `packages/web/src/pages/WorkTeam.tsx`
- `packages/web/src/pages/work/AgentDetailPane.tsx`

Assertions in these files protect observable behavior. Imports/helpers may change only as required by the runtime-package removal.

## Shared Files

sharedFiles:

- `package.json`
- `eslint.config.ts`
- `scripts/*`
- `packages/db/src/schema.ts`
- `packages/db/src/index.ts`
- `packages/db/src/factory-bootstrap.ts`
- `packages/db/drizzle/*`
- `packages/shared/src/index.ts`
- `packages/shared/src/configuration.ts`
- `packages/shared/src/events.ts`
- `packages/shared/src/knowledge.ts`
- `packages/api-contract/src/knowledge.ts`
- `packages/design-system/src/status-mapping.ts`
- `packages/design-system/src/KnowledgeRow.tsx`
- `packages/web/src/pages/KnowledgeList.tsx`
- `packages/web/src/pages/KnowledgeDetail.tsx`
- `packages/web/src/hooks/useGlobalSearch.ts`
- `packages/web/src/pages/AgentProfile.tsx`
- `packages/web/src/pages/WorkTeam.tsx`
- `packages/web/src/pages/work/AgentDetailPane.tsx`
- `packages/server/package.json`
- `packages/server/src/server-factory.ts`
- `packages/server/src/app.ts`
- `packages/server/src/test-fixtures.ts`
- `packages/server/src/services/session-provisioning.ts`
- `packages/server/src/services/session-lifecycle.ts`
- `packages/server/src/services/agent-session-requests.ts`
- `packages/server/src/services/agent-session-runtime.ts`
- `packages/server/src/services/plugin-configuration.ts`
- `packages/server/src/routes/index.ts`
- `packages/server/src/tools/tool-registry.ts`
- `docs/architecture/*.md`
- `docs/knowledge-architecture/*.md`
- `docs/process-layer/*.md`

## Risks And Ambiguities

- Blast radius is high because `@hyperidle/fabric` mixes knowledge behavior with schedulers, notifications, dispatch, scoring, and git export. Implementation should migrate one behavior cluster at a time behind tests.
- Physical table names still contain `strategy_fabric`. AU3 should not destructively rename them; the vocabulary win is production services, APIs, docs, and developer-facing symbols.
- AU4 owns trigger resolution. AU3 must preserve current routine/decomposition/assistant/dispatch behavior using existing event/subscriber/session-request mechanisms, not build the new trigger model early.
- Docs currently conflict. `runtime-simplification.md` governs AU3; `kernel-strategy-split.md` must become historical or be rewritten.
- Existing tests may encode Strategy/Fabric internals. Do not delete behavior assertions; update fixtures to app-owned services.

## Definition Of Done

- Requirements and architecture artifacts exist in `.pipeline` and conventional `plans/AU3`.
- Red tests/static gates are written before production code.
- Red AC2 domain behavior test is written before production moves.
- Fabric bootstrap registrations are migrated via the matrix with disposer behavior preserved.
- Web/shared knowledge vocabulary and user-facing Strategy labels are migrated before removing Fabric exports.
- All AU3 acceptance criteria have concrete verification.
- Production app boots without Strategy/Fabric registration and without server/core dependency on Fabric packages.
- Existing behavior remains covered by protected tests plus AU3-specific compatibility tests.
- Static guards ban production imports of Fabric packages and direct `knowledgeStrategyFabric` / `taskStrategyFabric` symbols outside compatibility boundaries.
- `npm run check`, `npm run lint`, `npm run test`, and before ship `npm run verify` pass.

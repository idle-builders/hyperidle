# Census — the layer below the contract

Read-only sweep, 2026-09-11, `origin/main` @ `f88b71434`. Facts with file:line. No opinions.
Question it answers: what does the code between the 17-action / 9-event contract and the
database look like today?

## 1. Service shape per object (`layers/core-api/<pkg>/src`)

| Package | src lines | Executor on writes | Events emitted where | Validation / invariants |
|---|---|---|---|---|
| `work` | 1814 | `WriteExecutor` (tx-joinable) | **in service** | **in service** |
| `conversation` | 755 | `HyperIdleDb` only | **never** — all in routes | route |
| `knowledge` | 4441 | `WriteExecutor` | **both** | in service |
| `users` | 802 | mixed | **never** — route | mixed |
| `org` | 675 | `WriteExecutor` | **never** — route | service (1:1 team invariant) |
| `routine` | 2176 | `WriteExecutor` | in service (scheduler) | service |
| `notifications` | 1093 | `HyperIdleDb` | never (it *subscribes*) | service |
| `settings` | 2281 | `WriteExecutor` partly | never | service (zod manifest) |
| `policy` | 1400 | injected `PolicyDeps` ports | in service | service |
| `credentials` | 385 | `HyperIdleDb` | never | service |

`WriteExecutor = HyperIdleDb | PgTransaction` — `framework/db/src/write-executor.ts:29`.

Exports, grouped:
- **work**: reads `get · list · listAncestorIds · listSubtreeIds · maxSiblingPosition · countTeamTasksInProgress`; writes `create · update · transition · transitionTask · assertNoCycle · cascadeTaskKill · checkAndUnblockDependents`; emits `task_state_changed` at `work/src/task-state-machine.ts:253`, `notification` at `dependency-watcher.ts:93`.
- **conversation**: reads `findThread · findMessage · listThreads · listMessages · listInbox · searchConversations`; writes `insertThread · insertMessage · updateThread · resolveMessageIfUnresolved · findOrCreateDirectThread`. `conversation-store.ts:4-8` says outright: "owns the ROW WRITE ONLY — no event emission, no transaction orchestration… callers keep their own `eventBus.emit`".
- **knowledge**: 12 reads, 14 writes (`create · update · remove · reparent · transition · graduate · setKnowledgeStatus · upsertKnowledgeDocument · …`), emits inside service (`attention-service.ts:313`, `promotion-pipeline.ts:284,347`, `review-item-factory.ts:129`) AND in the route (`routes/knowledge.ts:480,592,757,799,832,863`).
- **users**: `findUser · listUsers · insertUser · updateUser · getOrCreateUser · setAgentsStatus · createInvite/claimInvite · createLoginSession/revokeLoginSession`; `user_created` emitted by `routes/users.ts:148`.
- **org**: `getTeam · listTeams · createTeam · updateTeam · upsertOrgEdge · deleteOrgEdge · persistScaffoldedAgents · resolveReviewRecipients`; `team_created` emitted by `routes/teams-routes.ts:313`.
- **routine**: CRUD + `startRoutineScheduler · fireGenericRoutine`; emits `agent_work_intent_recorded` (`routine-scheduler.ts:240`), `routine_fired` (`:257`).
- **notifications**: `enqueue · markNotifications · reap · listNotifications · readConfig/updateConfig · readPreferences/updatePreferences · deliver · installNotifications` (subscribes `notification` at `install.ts:469`).
- **settings**: configuration overrides, plugin contributions, install/enable/disable/remove plugin, server config, `parsePluginManifest` (zod).
- **policy**: `registerPolicy` installs `item_created`, `session_ended`, `task_state_changed` subscribers; `buildHandoff`; `computeApprovalRate`.
- **credentials**: `readCredentials · resolveCredential · writeCredential · deleteCredential`.

Validation: zero zod in 9 of 10 service packages. Routes hold all wire validation —
`validateBody` 24× across 7 route files; 7 other route files hand-roll `schema.safeParse`
(`threads.ts` 6×). Domain invariants that do exist are in services and throw typed errors
the route maps to HTTP: `VALID_TRANSITIONS`/`assertNoCycle` (work), `InvalidReparentError`
(knowledge), `CapacityExceededError` — caught at `routes/tasks.ts:520-529`,
`routes/knowledge.ts:571-579`.

## 2. Route → service pattern

`HyperIdleEnv` — `framework/domain-model/src/http.ts:21-28`: `{ userId, authMethod:
"api_key"|"login_session", loginSessionId }`. That is the whole request context. No team,
no role, no capability set. `validateBody` (`http.ts:100-108`) re-declares the generic by
hand because `@hono/zod-validator` deduped to zod 3 while schemas are zod 4 (`http.ts:90-98`).

Actor resolution — `layers/core-api/src/middleware/auth.ts`: local mode `X-API-Key` then
`resolveApiKeyActorUserId` (`:142-150`) reads header `x-hyperidle-actor-id`
(`api-contract/src/core-api-port.ts:236`); absent → the sole human user, else `"u-founder"`.
Shared mode: `Authorization: Bearer` → login session → userId, else API key. **An API-key
holder can act as any actor by setting the header. That is the agent seam**
(`withActorTransport`, `agent-orchestration/src/services/core-api-port-composition.ts:860-878`).

`POST /tasks` (`routes/tasks.ts:314-381`): validate → parent exists → team inheritance →
FK check → `maxSiblingPosition` → `work.create` → re-read → 201. **No event on create.**
Route generates the id (`crypto.randomUUID()` :362). Service does the row write only.
`PATCH /tasks/:id` (`:424-537`): the route opens `db.transaction` itself (`:442,:465`),
runs `assertNoCycle`, renumbers siblings, then `applyStateChange` → `transitionTask` /
`cascadeTaskKill`; service emits; route maps errors (`:520-529`).

`POST /threads/:id/messages` (`routes/threads.ts:1287-1640`): ~350 lines in one handler
(biome-ignore for complexity at `:1289`). Route owns: manual parse, `senderId =
c.get("userId")` (`:1304`), participant parse, `authorizeWrite` (`:1327`), transaction
with 3 row writes, then post-commit: assistant-turn resolve, work-intent submit across
`AgentOrchestrationPort` (`:1539`), verdict recorder, `eventBus.emit(thread_message_appended)`
(`:1514`), `thread_resolved/reopened` (`:1584/:1594`), two WS pushes (`:1606,:1616`),
response shaping (`rowToThread`/`rowToMessage` `:570/:585`). `VerdictRaceConflict` class
declared inline at `:1453`.

`POST /knowledge` (`routes/knowledge.ts:499-595`): validate → scope rules (400s) → parent
visible → scopeId autofill → `createKnowledgeItem` (own tx) → catch `InvalidReparentError`
→ re-read → `eventBus.emit(knowledge_created)` (`:592`) → 201.

`POST /users` (`routes/users.ts:73-158`): pre-auth setup route mounted before the auth
middleware (`app.ts:286-290`); re-implements the API-key check inline (`:101-105`); inserts
user, scaffolds the assistant, emits `user_created` (`:148`). `PATCH /users/:id` enforces
self-only by comparing `c.get("userId")` to `:id` (`:216-222`).

**What routes do that services don't, uniformly:** authz, actor read, id generation, most
event emission, transaction opening (tasks, threads), response re-read + shaping,
error→HTTP mapping, WS push.

## 3. `framework/api-contract` (1,083 lines, zero runtime deps)

`CoreApiPort` (`core-api-port.ts:698-705`): six sub-ports, **43 methods**, ~40 hand-written
request/response interfaces. Work 9 · Users 3 · Conversation 7 · Org 7 · Routine 3 ·
Knowledge 14. `AgentOrchestrationPort` (`agent-orchestration-port.ts:259-266`): 13 methods.

Typing is hand-written, not derived. `core-api-port.ts:5-14`: "every type below is a
hand-written mirror of a real core-api route, NOT generated from `AppType` (bare `Hono` —
no per-route schema survives `app.route(path, sub)` mutation)… fidelity is a TESTED
obligation, never a compiler guarantee." `AppType = Hono` (`app.ts:531`).

`hc<AppType>` derivation: none works. `core-api-port-composition.ts:338-341` calls `hc()`
with no generic and casts to a 230-line hand-typed `CoreApiHcClient` (`:100-322`).
`agent-orchestration-port-composition.ts:143-146` writes `hc<AppType>` but `AppType` is
`Hono` and the result is cast. **Zero type safety flows from Hono RPC anywhere.** Both
ports share transport shape `(req: Request) => Promise<Response>` = `app.fetch`.

## 4. UI → backend

**No shared client.** One primitive: `apiFetch` (`core-ui/src/services/api-fetch.ts:62-78`)
— injects `X-API-Key` on `/api/*`. No base URL, no error normalisation, no types.

| Metric | Value |
|---|---|
| Files importing `apiFetch` (non-test) | 52 |
| `apiFetch(` call sites (non-test) | 95 |
| of which directly in `pages/ settings/ components/ shell/` (not in a hook) | 64 |
| `hooks/` | 32 files, 3,700 lines |

`useFetch` (`hooks/useFetch.ts`) is a 45-line GET helper; most hooks re-implement the
cancel/loading/error block inline (`useTaskTree.ts:32-60`). Response types:
`core-ui/src/types/` has **one file**, `task.ts`, a hand-copied wire type. Everything else
comes from `@hyperidle/domain-model` (81 files) plus `as Promise<T>` casts at each
`res.json()`. `core-ui` does **not** depend on `@hyperidle/api-contract`.

Live updates — `ws-client.ts:255-281`: two sockets. `/api/ws` topics `thread:<id>`,
`conversations`, `work`; `/api/agent-orchestration/ws` topic `session:<id>`. One-shot
token from `POST /api/auth/ws-token`. Server `routes/ws.ts`: subscribe/unsubscribe, else
**echoes the message back verbatim** (`:133`).

**Not an event-bus mirror.** `WsConnectionHub` has no `EventBus` dependency; the generic
event→topic forwarder was deleted (`ws-connection-hub.ts:28-48`). Push sites:

| Topic | Pusher | Envelope |
|---|---|---|
| `thread:<id>`, `conversations` | `routes/threads.ts:107` (`pushUpdate`) at `:1606,1616,1621,1626` | `{type:"update",topic,kind,data}` full record |
| `work` | `services/work-state-push-gateway.ts:40-51` on `task_state_changed` | `{taskId,toState}` |
| `session:<id>` | `agent-orchestration/src/services/session-activity-gateway.ts:54-62` | raw event |

UI subscribe sites: 4 — `useConversationsThreads.ts:240`, `useAssistantThread.ts:170`,
`useThreadDetail.ts:236`, `useSessionActivity.ts:233`. **Nothing subscribes to `work`** —
the work push gateway broadcasts to zero listeners. Subscribe authz:
`ws-subscribe-authorizer.ts:82-101`.

## 5. Agent → backend

Transports (`core-api-port-composition.ts`): `createInProcessCoreApiTransport(app)` =
`app.fetch` (`:829-831`); `createNetworkCoreApiTransport(baseUrl)` (`:841-849`);
`unconfiguredCoreApiTransport()` (`:895-903`). **Only in-process is wired in production**
(`applications/remote-server/src/create-server.ts:501`, `applications/desktop/src/
create-server.ts`). Network transport has no production call site.

`tool-handlers/` 2,307 lines. `ports.ts` (517) declares `ToolHandlersPorts`; every method
takes trailing `actorId`. Types are structurally re-declared, never imported from
`api-contract` (`:38-44`). `tool-definitions.ts` 1,597 lines, 20 tools. Wiring
`tool-handlers-bindings.ts:94-100`: **a fresh `CoreApiPort` per tool call**
(`seamPortForActor(actorId)` builds an `hc` client each time).

MCP exposure: **Streamable HTTP, per session.** `mcp/mcp-bridge.ts:119-163` — one
`McpServer` + `WebStandardStreamableHTTPServerTransport` per agent session, URL token
(`randomBytes(32)`), tools registered by iterating the role-filtered registry
(`registerTool(def.name, {description, inputSchema}, handler)` `:141-157`), handler
re-validates via `registry.invoke`. Route: `ALL /mcp/:token` + `POST /mcp/:token/
return-status` (`mcp-route.ts:65-164`), mounted **pre-auth** (`agent-execution/src/
boot.ts:205`). Harness gets `.mcp.json` `{mcpServers:{hyperidle:{type:"http",url}}}` from
`run-orchestration/src/provisioner.ts:1576-1611`. **Agent identity never travels over
MCP** — `ToolContext.agentId` is captured at `buildToolRegistry` time
(`run-orchestration-composition.ts:380-389`) and forwarded per call as `x-hyperidle-actor-id`.
The MCP token authorises the session; the actor is baked into the closure.

Remote worker (`agent-execution/src/remote-worker-client.ts`, 381 lines): gets a worker
token, opens `ws://…/api/ws/worker`, registers a `RemoteHarnessAdapter` into the server's
`AdapterPool` (`run-orchestration/src/worker-ingress.ts:239-280`). **Never calls
`CoreApiPort`** — inverted execution channel. No standalone binary
(`applications/remote-worker/src/index.ts` is 25 lines of re-export).

## 6. Deployment shapes

Three composition roots; desktop's duplicates remote-server's on purpose (application →
application imports forbidden, `applications/desktop/src/create-server.ts:4-21`).

| Shape | DB | Execution | Bind |
|---|---|---|---|
| Desktop (Electron) | PGlite only | `topology:"local"` hard-coded (`boot-server.ts:38`) | `127.0.0.1`, port 0 |
| Laptop / web dev (`HYPERIDLE_PROFILE=laptop`) | PGlite | local | all |
| Shared (`vps|cloud`) | Postgres | `"disabled"` — empty pool, filled by workers over WS | all |
| Remote worker | none | holds a `HarnessAdapter` | outbound WS only |

Auth mode is a separate axis: `HYPERIDLE_SHARED_MODE` (`app.ts:322`, `boot.ts:199`).

**The backend is one process in every shipped configuration.** `bootAgentExecution →
bootCoreApi → bootAgentOrchestration` all mount on one Hono root
(`compose-api-application.ts:69-100`), one `serve()`, one `EventBus`. The split-process
capability exists in type only.

UI channels other than HTTP+WS on `/api`: Electron IPC via `contextBridge`
(`applications/desktop/src/preload.ts:13-53`): `credentials.*` (OS keychain), `shell.*`,
`onOpenSettings`, `worker.*`.

## 7. Event bus

`framework/event-bus/src/` — 854 lines. **In-process only. No persistence, no outbox, no
replay.** `emit` is synchronous (`event-bus.ts:80-87`), per-handler try/catch, errors
logged and swallowed. No table stores events. A crash between DB commit and `emit` loses
the event. 29 event types, completeness compile-checked (`events.ts:670-675`). One
`new EventBus()` per process (`remote-server/src/create-server.ts:248`,
`desktop/src/create-server.ts:168`).

`eventBus.on(` sites in production, by what they react to:

| Group | Sites |
|---|---|
| session lifecycle | `work-session-started-reactions.ts:104` · `work-session-end-reactions.ts:113` · `agent-health-session-end-reactions.ts:187` · `routine-run-session-end-reactions.ts:137` · `policy/lifecycle-propagation.ts:418` · `conversation/session-not-returned-notice.ts:72` · `run-orchestration/start-runtime.ts:393` · `session-activity-gateway.ts:54,57` · `session-activity-buffer.ts:100` |
| run lifecycle / admission | `work-session-end-reactions.ts:104` · `routine-run-session-end-reactions.ts:145` · `agent-run-admission-reactions.ts:127` · `start-runtime.ts:325` |
| `task_state_changed` | `app.ts:429` (unblock dependents) · `policy/lifecycle-propagation.ts:434` · `work-state-push-gateway.ts:40` |
| `thread_message_appended` | `assistant-turn-coherence-trigger.ts:112` · `assistant-thread-pin-reaction.ts:50` |
| `item_created` | `policy/policy-engine.ts:45` |
| `notification` | `notifications/install.ts:469` |
| `tool_call_recorded` | `session-activity-gateway.ts:60` · `session-activity-buffer.ts:99` |
| `sandbox_writeback_changes_detected` | `writeback-processor.ts:584` |
| **all 29 events** | `routine/src/routine-scheduler.ts:675-676` — loops `EVENT_TYPES`, registers 29 handlers, each does a `listRoutines(db,{triggerType:"event",eventType})` query on every emit |

Registration at boot: `registerCoreDomainServices` (`service-bootstrap.ts:231`) pushes 9
disposers + `installNotifications` + a 6h retention interval; `registerAgentLayerServices`
(`:428`) starts the scheduler; `app.ts:429` adds the dependency watcher directly.

## 8. Counts (production `.ts/.tsx`, excl. tests/stories/config)

| Unit | Lines |
|---|---|
| `layers/core-ui` | 65,287 |
| `layers/core-api` | 29,840 |
| `layers/agent-orchestration` | 18,437 |
| `layers/agent-execution` | 6,440 |
| `framework/domain-model` | 4,024 |
| `applications/` | 3,423 |
| `framework/db` | 2,036 |
| `framework/api-contract` | 1,083 |
| `framework/event-bus` | 854 |

core-api split: domain service packages 15,822 · `src/routes/` (28 files) 9,584 ·
`src/services/` reactions 1,996 · top level 1,777 · middleware/auth/schemas 661.
**Routes are 61% the size of all ten services put together.**

core-ui split: `pages/` 15,175 · `ds/` 9,769 · `components/` 4,863 · `settings/` 4,732 ·
`hooks/` 3,700 · `shell/` 2,380 · `layouts/AppShell.tsx` 984 · `block/` 979 ·
`services/` 747 · `types/` 1 file.

agent-orchestration split: `run-orchestration/` 8,619 · `src/` 4,772 · `tool-handlers/`
2,316 · `session-requests/` 1,572 · `connections/` 734 · `filesystems/` 469.

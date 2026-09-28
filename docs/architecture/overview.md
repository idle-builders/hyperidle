# Architecture overview

HyperIdle is one Node.js process with four layers and three shipped applications.

## Applications

| App | What it is |
|---|---|
| `applications/desktop` | Electron shell — opens a browser window, manages the local database and the OS keychain |
| `applications/remote-server` | Node HTTP server for shared-backend deployments |
| `applications/remote-worker` | A session-execution endpoint that connects to a remote server |

The website (`applications/website`) is an Astro static site that publishes the user-facing docs.

## Layers

```
core-api          — task · thread · document · user · policy · changes · settings
agent-orchestration — run-orchestration · session-requests · connections · filesystems · tool-handlers
agent-execution   — harness-registry (adapter pool, MCP bridge, return gate)
core-ui           — React + Vite front end
```

**`core-api`** owns the domain objects and the one database. Its modules are `task`, `thread`, `document`, `user`, `changes` (the event log), `policy` (lifecycle propagation, approval rate), and `settings` (server config, bundled plugins, plugin installer).

**`agent-orchestration`** runs sessions. It never reads a core-api table directly — it receives work via durable `agent_work_intents` rows and signals back via bus events. Its modules are `run-orchestration`, `session-requests`, `connections`, `filesystems`, and `tool-handlers`.

**`agent-execution`** is the harness adapter layer: `harness-registry` holds the adapter pool, the MCP bridge, return-gate enforcement, and event normalization. It runs inside the same process as agent-orchestration and is the only code that spawns a harness subprocess.

**`core-ui`** is the browser client. It talks to the server only through the action call service (`layers/core-ui/src/services/call.ts`).

## The 18 actions

Every capability is declared once as an `ActionDeclaration` in `framework/domain-model/src/actions/`:

| File | Actions |
|---|---|
| `task.ts` | `search_tasks` · `open_task` · `edit_task` |
| `thread.ts` | `search_threads` · `open_thread` · `send_message` · `adjust_thread` |
| `document.ts` | `search_documents` · `open_document` · `edit_document` |
| `user.ts` | `search_users` · `open_user` · `edit_user` |
| `session.ts` | `search_sessions` · `watch_session` · `stop_session` |
| `platform.ts` | `search_plugins` · `edit_plugin` |

Each declaration carries a name, a sentence description, a Zod input schema, a set of pure invariant functions, and a `run` handler. The same list is projected three ways without duplication:

- **HTTP routes** — `createActionsRouter` (`layers/core-api/src/actions/actions-router.ts`) mounts `POST /api/actions/<name>` for every action.
- **MCP tools** — `actionsAsTools` (`layers/core-api/src/actions/actions-as-tools.ts`) registers a tool per action. Tools call the action in-process as the session's agent; no HTTP hop.
- **UI client** — `layers/core-ui/src/services/call.ts` calls `POST /api/actions/<name>` for the same list.

One governance lint rule verifies that every declared action is projected onto all three surfaces.

Alongside the 18 actions, agents have one extra tool: `return_status` (`layers/agent-execution/harness-registry/src/return-status-tool.ts`), which lets an agent ask whether it has satisfied the return gate.

## Plumbing routes

The routes that fall outside the action loop remain as explicit Hono route files:

- **Auth** — `GET /api/auth/ws-token` (WebSocket upgrade token), `GET /ws/worker` (worker registration)
- **Health** — `GET /api/health`
- **Cross-object search** — `GET /api/search` (hand-written; queries task, thread, document, user in one response)
- **MCP bridge** — `POST /api/mcp/:token` (stateful MCP bridge), `POST /api/mcp/:token/return-status` (return-gate adjudication)
- **Agent-orchestration intake** — `POST /api/agent-orchestration/*` routes: work intents, review links, review verdicts, run config, filesystems, connections, sessions

## Events

### Object events (`changes` table)

Every write appends a row to the `changes` table (`id`, `object`, `object_id`, `kind`, `actor`, `before`, `after`, `at`). That row is the event. Nine names, declared in `framework/domain-model/src/actions/user.ts`:

```
task.created  task.changed
thread.created  thread.message  thread.changed
document.created  document.changed
user.created  user.changed
```

### Bus events

An in-memory event bus carries lifecycle signals after commit. A crash between commit and emit loses the event — the bus is not durable. Bus events:

```
agent_run_admission_failed  agent_run_lifecycle_changed
session_started  session_ended  session_not_returned
sandbox_writeback_changes_detected
propagation_applied  propagation_failed
tool_call_recorded
```

WebSocket pushes to the browser come from the bus. The socket serves topics `conversations`, `thread:<id>`, `documents`, `document:<id>`, and `session:<id>` — see [security.md](./security.md) §WS subscribe authorization for who may subscribe to each.

## Subscriptions

A subscription row has an owner (`userId`), a trigger (exactly one of: an `ObjectEventName` or a cron schedule), a `paused` flag, and a `prompt` document. On every matching event or clock tick, the subscription fires:

- **Agent owner** → a `subscription_run` work intent is written to `agent_work_intents`.
- **Human owner** → an inbox row is written to `inbox`.

Users manage their subscriptions through `edit_user`. The install itself creates only the hidden `system:propagation` actor. The person's assistant — subscribed to all nine object events — is created by the welcome screen (SetupFlow).

## Core → orchestration hand-off

`core-api` never calls agent-orchestration directly. The seam has two sides:

**Pushing work** — `core-api` writes a row to `agent_work_intents` (kind: `thread_turn`, `task_run`, `session_resume`, or `subscription_run`). Agent-orchestration polls and drains this table. Each intent carries the actor, the source kind, a baked payload, and an attempt counter.

**Calling orchestration** — when a core-api handler must read from agent-orchestration (connections, folders, sessions), it goes through `AgentOrchestrationPort` (`layers/core-api/src/services/agent-orchestration-port-composition.ts`), an in-process HTTP client (`hc<AppType>`) built over the `/api/agent-orchestration/*` plumbing routes.

**Signalling back** — agent-orchestration emits bus events (`session_started`, `session_ended`, `propagation_applied`, etc.) that core-api subscribers react to. Session lifecycle changes reach task state through these reactions, not through a direct database write.

## Session path

1. An intent is drained from `agent_work_intents`.
2. The run provisioner builds a working directory in `HYPERIDLE_WORKSPACES_DIR` (default: OS temp), writes `AGENTS.md` / `CLAUDE.md`, `.mcp.json`, held connection files, and a return-enforcement hook.
3. The harness adapter (`CliHarnessAdapter` or `RemoteHarnessAdapter`) spawns the process.
4. The MCP bridge (`/api/mcp/:token`) serves the 18 actions to the agent.
5. On turn end, the return gate evaluates whether the agent returned. Writeback (`filesystem_injections`) syncs any file changes.
6. The session ends; a bus event signals core-api.

See [agent-layer/harnesses.md](../agent-layer/harnesses.md) and [agent-layer/return-gate.md](../agent-layer/return-gate.md) for step 3 and 5.

## What HyperIdle does not do

HyperIdle is not a git host, a CI runner, or a deployment platform. It does not:

- Run CI pipelines or build jobs
- Host or mirror git repositories
- Own OAuth apps for any service (agents use connection tokens or harness-inherited auth)
- Deploy or release software

Agents can reach these things through [connections](./connections.md) and [filesystems](../objects/folders.md) (a code filesystem mounts a git working directory the agent writes back to). HyperIdle wires the agent to the work; it does not replace the tools the work needs.

## One Node process

No distributed message queue. One `node` process, one Postgres database (PGlite locally, Postgres on the shared backend), in-process `setInterval` schedulers in `layers/core-api/*/src/` and `layers/agent-orchestration/*/src/`. The agent processes are child processes of that one host, not separate services.

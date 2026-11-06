# Architecture overview

HyperIdle is one Node.js process with four layers and two shipped applications.

## Applications

| App | What it is |
|---|---|
| `applications/desktop` | Electron shell — runs the server and its agents on this computer over a local database, or opens a team's server; keeps that server's key encrypted with the computer's keychain (Electron `safeStorage`) |
| `applications/remote-server` | Node HTTP server for shared-backend deployments |

The website (`applications/website`) is an Astro static site that publishes the user-facing docs.

## Layers

```
core-api          — task · thread · document · user · policy · changes · settings
agent-orchestration — runner · run-orchestration · session-requests · connections · tool-handlers
agent-execution   — harness-registry (adapter pool, MCP bridge, return gate)
core-ui           — React + Vite front end, plain CSS
```

**`core-api`** owns the domain objects and the one database. Its modules are `task`, `thread`, `document`, `user`, `changes` (the event log), `policy` (lifecycle propagation, approval rate), and `settings` (server config, bundled plugins, plugin installer).

**`agent-orchestration`** runs sessions. It never reads a core-api table directly: its runner reads each agent's inbox and everything else through the action door, with that agent's key (see [How an agent gets work](#how-an-agent-gets-work)), and it signals back via bus events. Its modules are `runner`, `run-orchestration`, `session-requests`, `connections`, and `tool-handlers`.

**`agent-execution`** is the harness adapter layer: `harness-registry` holds the adapter pool, the MCP bridge, return-gate enforcement, and event normalization. It runs inside the same process as agent-orchestration and is the only code that spawns a harness subprocess.

**`core-ui`** is the browser client: plain React and plain CSS with tokens. It reads and writes through one client, `call(action, input)` in `layers/core-ui/src/api.ts`, and one hook, `useAction` (`layers/core-ui/src/useAction.ts`), which asks again when a WebSocket topic it listens on changes. The only other requests are the WebSocket token, cross-object search and first start (below). How the screens look is in [interface/ui-design.md](../interface/ui-design.md).

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
- **MCP tools** — `actionToolsThroughDoor` (`layers/agent-orchestration/src/runner/action-tools.ts`) makes each of core's actions an agent's tool. A tool calls `POST /api/actions/<name>` with the agent's own key and names its run in the `X-HyperIdle-Run` header. The three session actions belong to agent-orchestration and are registered in-process (`layers/agent-orchestration/src/actions/actions-as-tools.ts`).
- **UI client** — `call` in `layers/core-ui/src/api.ts` posts to `POST /api/actions/<name>`; its types come from the same declarations.

One governance lint rule verifies that every declared action is projected onto all three surfaces.

Alongside the 18 actions, agents have one extra tool: `return_status` (`layers/agent-execution/harness-registry/src/return-status-tool.ts`), which lets an agent ask whether it has satisfied the return gate.

## Plumbing routes

The routes that fall outside the action loop remain as explicit Hono route files:

- **Auth** — `POST /api/auth/ws-token` (one-time token for the browser's socket at `/api/ws`)
- **Health** — `GET /api/health` (no key), `GET /api/health/auth` (with the key)
- **Cross-object search** — `GET /api/search` (hand-written; queries task, thread, document, user in one response)
- **First start** — `POST /api/start/look` (look for the agent programs on this computer again), `POST /api/start` (make the first person, team, agent and conversation)
- **MCP bridge** — `POST /api/mcp/:token` (stateful MCP bridge), `POST /api/mcp/:token/return-status` (return-gate adjudication)
- **Agent-orchestration intake** — `/api/agent-orchestration/*` routes: run config, space-folders, connections

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

WebSocket pushes to the browser come from the bus. The socket serves topics `conversations`, `tasks`, `documents`, `users`, `thread:<id>`, `task:<id>`, `document:<id>`, `user:<id>` and `session:<id>`. A push only says that something changed; the page asks again. Who may subscribe to each: [security.md](./security.md) §WS subscribe authorization.

## Subscriptions

A subscription row has an owner (`userId`), a trigger (exactly one of: an `ObjectEventName` or a cron schedule), a `paused` flag, and a `prompt` document. On every matching event or clock tick, the subscription fires: it writes a `subscription` row into its owner's inbox, for a person and an agent alike ([User](../objects/user.md#inbox)). A person's row is the notification they see; an agent's row is a reason for its runner to start a run (below). A schedule firing writes a row with no change.

Users manage their subscriptions through `edit_user`. The install itself creates only the hidden `system:propagation` actor. First start (`POST /api/start`, from the `/start` page) makes the person, their team, a first agent called Builder on a signed-in agent program — subscribed to all nine object events — and a first conversation where that agent says hello.

## How an agent gets work

The server never starts an agent run and never builds a run request. Every reason for an agent to act is a row in its **inbox** — the same `inbox` table people's notifications live in (`framework/db/src/schema.ts`). Core writes rows with `tellUser` (`layers/core-api/user/src/inbox-tell.ts`), only for an agent that can run (`isRunnableAgent`: an active or idle agent, never the system actor), and nudges the `user:<agentId>` WebSocket topic.

Each row has a reason (`INBOX_REASONS`, `framework/domain-model/src/actions/user.ts`) and a key that is unique per user, so the same wake is one row:

| Reason | Written when |
|---|---|
| `message` | `send_message` wakes the agent: it is mentioned, or it is the other member of a two-person thread |
| `review_answered` | a verdict or answer resolves the agent's own review or question — instead of a `message` row for the same message |
| `task_run` | `edit_task` gives the agent work: a task accepted with it as owner, a retry, a restart after a stop, or a hand-off to it. Core still records each try in `task_dispatch_attempts` |
| `task_stop` | the agent's task is killed, paused to stopped, or handed to another agent |
| `subscription` | one of its subscriptions fires on a change, or its schedule comes due (then the row has no change) |

### The runner

The **runner** (`layers/agent-orchestration/src/runner/`) holds the agents' keys and works their inboxes. It runs inside the desktop app only (`applications/desktop/src/create-server.ts`). A shared server runs no runner, so its agents' rows wait there unread.

- **Keys.** At start it calls as the person on this computer, with their own key, and lists the agents that person may hold: their own, and any agent no one owns. For each it asks for a fresh key (`edit_user({ id, key: "new" })`). It looks again whenever a user is created or changed.
- **Reading the inbox.** For each agent it reads the unread rows oldest first (`open_user({ unread: true })`), acts on each as that agent, and marks it read (`edit_user({ inbox: { read: [id] } })`). It does this once at start (whatever waited while it was off), on every nudge, and every 30 seconds. A row whose task or thread is gone, or no longer the agent's, is marked read with nothing done; a failed pass leaves the rows unread for the next one.
- **Building the run.** Everything it reads — the thread, the task and its parents, the subscription and its prompt, the agent's identity document, and the ranked documents (`search_documents({ forSession: { about } })`) — comes through the normal action door, `POST /api/actions/<name>`, with the agent's key. From that it builds the run and puts it in its own queue of session requests (`queueRun`, `session-requests`).

What each reason does (`inbox-work.ts`):

- **`message`** — a plain message goes into the agent's live run in that thread, if it has one. Otherwise the agent gets a new turn in the thread, reading the whole conversation.
- **`review_answered`** — the session that asked comes back: the answer goes into it if it is still live, or it is resumed. If no session can come back, the agent gets a new turn in the thread.
- **`task_run`** — if the task is still ready, accepted or in progress and still the agent's, a run on the task with the task, its parents and its documents.
- **`task_stop`** — the agent's run on the task is stopped. When the task was handed to another agent, the run only ends, and the new owner carries the work on.
- **`subscription`** — a run with the subscription's prompt, the change that fired it (if any) and its documents.

**The agent's tools** for core's actions call the same door, with the agent's key and an `X-HyperIdle-Run` header naming its session, task and thread (`action-tools.ts`). That run becomes the action's `caller`; the actions check the task or thread, never the run ([Security](./security.md#trust-mode)). When an agent files a review or a question, the runner records which session filed it (`review_sessions`), so the answer can bring that session back.

**A run that never starts.** The run side emits `agent_run_admission_failed`. Core then posts "<agent> could not start …" into the thread the turn came from (only if a person is in it), or fails the task's dispatch attempt (`layers/core-api/src/services/agent-run-admission-reactions.ts`).

## Core and orchestration

`core-api` never calls agent-orchestration to start work; work reaches the runner only through inboxes.

**Calling orchestration** — when a core-api handler must read or change something agent-orchestration owns (run config, space-folders, connections), it goes through `AgentOrchestrationPort` (`layers/core-api/src/services/agent-orchestration-port-composition.ts`), an in-process HTTP client (`hc<AppType>`) built over the `/api/agent-orchestration/*` plumbing routes.

**Signalling back** — agent-orchestration emits bus events (`session_started`, `session_ended`, `propagation_applied`, etc.) that core-api subscribers react to. Session lifecycle changes reach task state through these reactions, not through a direct database write.

## Session path

1. The runner queues a run request for an inbox row (above); the session-request queue starts it.
2. The run provisioner builds a working directory in `HYPERIDLE_WORKSPACES_DIR` (default: OS temp), writes `AGENTS.md` / `CLAUDE.md`, `.mcp.json`, held connection files, and a return-enforcement hook.
3. The harness adapter (for example `CliHarnessAdapter`) spawns the process.
4. The MCP bridge (`/api/mcp/:token`) serves the agent's tools: the 18 actions, core's called through the door as the agent.
5. On turn end, the return gate evaluates whether the agent returned. The `knowledge/` watcher syncs any file changes back to documents.
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

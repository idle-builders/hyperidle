# System Overview

HyperIdle is an OS for your agent factory. Its process layer sits between agent harnesses (which run agents) and human interfaces (which present work). It does not call models, execute tools, or manage conversations — those are harness responsibilities. HyperIdle manages the organizational structure: who works on what, what they know, how they coordinate, and how humans stay in the loop.

## 1. The Four Layers

The repository has four tiers of directory, and they mean different things.

```
applications/     deployment units — wiring and bootstrap only, never business logic
  desktop           Electron shell; the laptop-solo product
  remote-server     headless host process
  remote-worker     runs agent execution on its own machine

layers/           the four Layers; each decomposes into Service packages
  core-ui           React app: Conversations, Work, Knowledge
  core-api          HTTP surface + core domains
                    thread · work · knowledge · users · settings · routine ·
                    notifications · policy · review · org · credentials ·
                    connections · filesystems · git-export · observability · realtime
  agent-orchestration   decides that and when an agent run happens, and prepares
                    and consumes what it needs
                    session-requests · run-orchestration · dispatch · tool-handlers ·
                    agent-run-config · filesystems · filesystem-mounting · connections
  agent-execution   the only Layer that invokes a model, an agent CLI or an MCP server
                    harness-registry

framework/        db, api-contract, design-system + eighteen packages the substrate split into
tools/            eval, eslint-plugin-authz, eslint-plugin-design
```

A Layer is **isolated**, not stacked — it does not sit above or below its neighbours, and there is no
"downward dependency" allowance. What may actually cross which boundary is machine-enforced by
`npm run lint` and written down once, in [`tools/governance/README.md`](../../tools/governance/README.md). No
rule is restated here; a second copy drifts from the enforced one. Never infer a boundary rule from
the imports in the code around you either — an existing import may be a violation nobody has caught
yet.

`core-api` owns the user-visible product domains: durable records, editing surfaces, domain events.
`agent-orchestration` owns every LLM-capable run up to the moment of execution: session requests,
admission, provisioning, context assembly, capture and writeback, lifecycle events.
`agent-execution` owns the harness itself and holds no database access.

Knowledge lives in one nested tree, not a layer ladder: where an item sits says what it is about, and `scope` (`factory | team | user`, `framework/domain-model/src/knowledge.ts`) says who can see it. Per-session task/team/routine state is serialized separately as `context/session.toon`. Owned by [Knowledge Architecture](../knowledge-architecture/index.md).

Agents run as host processes in a local working directory — there is no isolation layer by default; opt-in sandboxing is a planned follow-up (AQ2). See [Run-Unit Model](./run-unit-model.md).

## 2. Technology Summary

| Component | Default Technology | Scale Alternative |
|-----------|--------------------|-------------------|
| Primitive Store | PGlite (embedded Postgres, `@electric-sql/pglite`) via Drizzle `pgTable` | Real Postgres (`bootstrap-pg.ts`, `pg-ssl.ts`) |
| Knowledge search | Case-insensitive `ILIKE` over `documents.title`/`documents.body` (`layers/core-api/document/src/document-store.ts`) | Same |
| Knowledge exports (human-readable) | Git repo (markdown exports) | Same |
| Session context | TOON format (`framework/toon-codec/src/toon-codec.ts`) | Same |
| API Layer | Hono on `@hono/node-server` | Same + load balancer |
| Event Bus | In-process EventBus (TypeScript) | _Future candidate:_ Redis pub/sub or NATS (cloud profile only) |
| Scheduler | `setInterval` services inside the owning Service, e.g. `layers/core-api/routine/src/routine-scheduler.ts` | _Future candidate:_ external queue (cloud profile only) |
| Harnesses | CLI adapters (claude-code/codex/opencode/cursor-agent) + remote worker, pooled via `layers/agent-execution/harness-registry/src/adapter-pool.ts` | — |
| Sandbox (default) | `LocalSandboxAdapter` (host working dir); `DisabledSandboxAdapter` | Opt-in isolation planned (AQ2) |
| Human Interface | React + TypeScript (Electron renderer) | Same |
| Desktop shell | Electron (macOS, arm64, DMG) | — |
| Notifications | ntfy.sh / SMTP adapters (`layers/core-api/notifications/`) | APNs, Firebase |
| Observability | `console` \| `noop` channels (`framework/diagnostics/src/observability/`) — OpenTelemetry explicitly future | — |
| Auth | Auto-generated API key (`X-API-Key` header) | OAuth / passkeys |
| Credentials | Electron safeStorage (desktop) / AES-256-GCM server-side — see [Credential Model](./credential-model.md) | — |
| Version control | Git (for markdown artifacts) | Same |

### Language choices

**TypeScript** for the entire stack. The process layer (API, scheduler, adapters, knowledge services) runs on **Node.js** with **Hono** as the HTTP framework: single language across the monorepo, Drizzle ORM for type-safe queries against the embedded Postgres store.

**TypeScript + React** for the Factory app: Tailwind + DaisyUI compose cleanly with React, sharing types with the server eliminates API contract drift, and Electron bundles the renderer natively.

### Monorepo packages

Run `ls layers/ layers/*/ framework/ applications/ tools/` for the live set — a list here goes stale.
The tiers:

| Tier | Packages | Purpose |
|---|---|---|
| `layers/` | `core-ui`, `core-api`, `agent-orchestration`, `agent-execution`, plus a nested package per Service | The four Layers and their Services |
| `framework/` | `api-contract`, `db`, `diagnostics`, `domain-model`, `event-bus`, `harness-capability`, `harness-protocol` | Drizzle schema + migrations, Zod response schemas, the product's nouns, the event bus, and the harness contracts. Each declares who may name it in `tools/governance/architecture.json`; only `domain-model` is reachable by everyone. The eighteen packages the old `shared` substrate became have since consolidated to these seven — run `ls framework/` rather than trusting a list |
| `applications/` | `desktop`, `remote-server`, `remote-worker` | Deployment units — wiring and bootstrap only |
| `tools/` | `eval`, `eslint-plugin-design`, `eslint-plugin-authz` | LLM-judged evals; design-system and authorization lint rules |

## 3. The Human Interface: The Factory

### 3.1 Delivery

One codebase, one app, two form factors. Desktop (Electron, macOS arm64) is the primary form factor; the same web app is intended to be reachable from a mobile browser for review triage and agent unblocking. No native mobile app, no offline support. The mobile claim is unproven for the desktop profile today — the embedded server is reached at `127.0.0.1` (`applications/desktop/src/main.ts:558`), so a phone cannot reach it directly; mobile access presumes a shared deployment (see [deployment](../deployment/index.md)).

### 3.2 Technology stack

React (TypeScript) with **Tailwind CSS + DaisyUI** and the Hearth theme — `hearth-light` / `hearth-dark`, resolved from a light/dark/system preference before first paint (`layers/core-ui/index.html:39`). Behavior gaps filled by `focus-trap-react` in `core-ui` and `@floating-ui/dom` in the design system. Visual authority lives in [ui-design](../ui-design/index.md).

### 3.3 The three views

- **Conversations** — threaded messages; review messages embed an artifact reference plus a verdict affordance; humans can initiate conversations and dial into live sessions. Verdict grammar is owned by [Thread Primitive](../human-interface-layer/thread-primitive.md); ArtifactView's five embed shapes by [Artifact Primitive](../process-layer/artifact-primitive.md).
- **Work** — drill-down WorkOverview → Team → Task (any depth; no Product level; scope is Team). A team's capacity cap is enforced server-side at `in_progress` transitions (`layers/core-api/task/src/task-actions.ts`, `edit_task`). Tasks are agent-owned — no drag; state changes flow through threads.
- **Knowledge** — a nested tree of documents, no scoring engine; every edit, including a scope change, lands as one `changes` row. Store design: [the canonical store](../knowledge-architecture/the-canonical-store.md).

View behavior and layout are owned by the [human-interface-layer](../human-interface-layer/the-three-views.md) and [information-architecture](../information-architecture/app-shell-always-present.md) docs.

### 3.4 Desktop shell

Electron main process starts the embedded Hono server on localhost; the BrowserWindow loads `http://127.0.0.1:{port}`. Data lives in PGlite at Electron userData (`resolveDataDir` → `userData/hyperidle-pg`, `applications/desktop/src/main.ts:48`). Auth is an auto-generated API key injected by the preload bridge. Install and packaging live in [deployment](../deployment/index.md).

### 3.5 Data flow skeleton

```
User opens Factory app
  → Electron main starts embedded Hono server on localhost
  → BrowserWindow loads http://127.0.0.1:{port}
  → POST /api/auth/ws-token mints a one-shot upgrade token
  → WebSocket connects via /api/ws?token=… (ambient updates for threads and sessions)
  → POST /api/actions/search_threads (initial thread list)

User submits a verdict
  → POST /api/actions/send_message (verdict-type message)
  → API writes Message to Primitive Store
  → Event emitted via EventBus
  → App subscribers react: harness adapter unblocks agent, attention scores update
  → WebSocket pushes the changed row as a nudge; the page re-runs search_threads/open_thread

User creates a task
  → POST /api/actions/edit_task (no `id`; markdown body + done condition)

User creates knowledge
  → POST /api/knowledge (scope_kind + scope_id + markdown body)
  → Core knowledge services assign the item to the correct knowledge layer
```

WebSocket subscribe authorization is owned by the [Authorization Model](./authorization-model.md); full end-to-end flows live in [Data Flow Examples](./data-flow-examples.md).

## 4. What This Architecture Does Not Include

- **A model-calling loop.** That's the harness.
- **A workflow engine or DAG executor.** Sequences emerge from task dependencies and handoffs.
- **MCP servers for external tool discovery.** Skills call CLIs and APIs directly. Exception: the MCP Bridge (`layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts`) exposes HyperIdle's tools TO external harnesses — the inverse direction. There is no outbound MCP broker; external tools arrive via the [Connection model](./connection-model.md) (held tokens injected at provisioning, or inherited harness auth).
- **A vector database.** Document search is case-insensitive `ILIKE` over title and body; no FTS5, no pgvector.
- **A separate auth service.** Auto-generated API keys; a Tailscale-style private network for shared deployments.
- **A backlog.** Proposed tasks live on the Work view; unpicked ones can be killed.
- **Multiple applications.** One app, two form factors.
- **Jira-style reporting.** Conversations (review threads) and Work (task views) are the human surfaces for status.
- **A git forge, a CI engine, or deploy infrastructure.** HyperIdle rides the git substrate (code in a local-first, forge-optional git repo), integrates CI/registries/deploy/SSO via API/MCP, and triggers side-effects through connected systems — it never hosts repos, runs runners, or executes a deploy itself. See [System Boundary](./system-boundary.md) for the trigger-not-executor seam.

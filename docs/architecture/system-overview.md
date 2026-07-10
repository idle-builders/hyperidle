# System Overview

HyperIdle is an OS for your agent factory. Its process layer sits between agent harnesses (which run agents) and human interfaces (which present work). It does not call models, execute tools, or manage conversations — those are harness responsibilities. HyperIdle manages the organizational structure: who works on what, what they know, how they coordinate, and how humans stay in the loop.

## 1. The Three Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     HUMAN INTERFACE                              │
│  The Factory (Electron desktop app)                             │
│  ┌──────────────┐ ┌───────────────┐ ┌─────────────────────┐     │
│  │Conversations │ │ Work          │ │ Knowledge           │     │
│  │ (Threads,    │ │ (Bets, Tasks, │ │ (Items, Scopes,     │     │
│  │  Messages)   │ │  Sessions)    │ │  Curation)          │     │
│  └──────┬───────┘ └───────┬───────┘ └──────────┬──────────┘     │
│         └─────────────────┼────────────────────┘                 │
│                    ┌──────┴──────┐                               │
│                    │  API Layer  │                               │
│                    └──────┬──────┘                               │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                     CORE APP + AGENT LAYER                        │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Item routing │  │ Scheduler    │  │ Knowledge Services     │  │
│  │              │  │              │  │                        │  │
│  │ Items →      │  │ Routines,    │  │ L0 Session (TOON)      │  │
│  │ Views        │  │ dependency   │  │  …                     │  │
│  │              │  │ watcher      │  │ L4 Factory             │  │
│  │              │  │ (setInterval │  │                        │  │
│  │              │  │  services)   │  │                        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘  │
│  ┌──────┴─────────────────┴─────────────────────┴──────────────┐ │
│  │                   Primitive Store                            │ │
│  │  Users · Bets · Tasks · Sessions · Teams · Routines ·        │ │
│  │  Threads · Messages · Knowledge Items   (PGlite / Postgres)  │ │
│  └─────────────────────────┬────────────────────────────────────┘ │
└────────────────────────────┼──────────────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                     AGENT RUNTIME                                  │
│                                                                    │
│  ┌──────────────┐  ┌───────────────────┐  ┌────────────────────┐  │
│  │ Sandbox      │  │ Harness           │  │ Observability      │  │
│  │ Adapter      │  │ Adapters          │  │                    │  │
│  │              │  │                   │  │                    │  │
│  │ Local (host  │  │ builtin (Open-    │  │ console / noop     │  │
│  │ working dir) │  │ Router) · CLI     │  │ (OTel future)      │  │
│  │ / Disabled   │  │ (claude/codex/    │  │                    │  │
│  │              │  │ opencode) · remote│  │                    │  │
│  └──────────────┘  └───────────────────┘  └────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

The layering is strict. Arrows point down (dependency direction). The Human Interface depends on the Meta Layer; the Meta Layer depends on the Agent Runtime adapters. No layer reaches past its neighbor.

The Meta Layer is split at the code level into **core app domains** and the **agent layer**. Core app domains own Work, Conversation, Knowledge, Users, Settings, Routines, notifications, durable records, and domain events. The agent layer owns every LLM-capable run: session requests, admission, provisioning, harness execution, tools/MCP, context assembly, capture, writeback, and lifecycle events. Former knowledge and automation helpers now run as app-owned server services, not as a separate runtime layer.

Knowledge moves through five maturity layers L0–L4 (`packages/shared/src/knowledge.ts`); L0 is per-session context serialized as TOON. The taxonomy is owned by [The Five Layers](../knowledge-architecture/the-five-layers.md).

Agents run as host processes in a local working directory — there is no isolation layer by default; opt-in sandboxing is a planned follow-up (AQ2). See [Run-Unit Model](./run-unit-model.md).

## 2. Technology Summary

| Component | Default Technology | Scale Alternative |
|-----------|--------------------|-------------------|
| Primitive Store | PGlite (embedded Postgres, `@electric-sql/pglite`) via Drizzle `pgTable` | Real Postgres (`bootstrap-pg.ts`, `pg-ssl.ts`) |
| Knowledge full-text search | Postgres tsvector + GIN on `knowledge_items` (`packages/server/src/app-runtime/fts.ts`) | Same |
| Knowledge exports (human-readable) | Git repo (markdown exports) | Same |
| Session context | TOON format (`packages/shared/src/toon-codec.ts`) | Same |
| API Layer | Hono on `@hono/node-server` | Same + load balancer |
| Event Bus | In-process EventBus (TypeScript) | _Future candidate:_ Redis pub/sub or NATS (cloud profile only) |
| Scheduler | `setInterval` services in `packages/server/src/app-runtime/services/` | _Future candidate:_ external queue (cloud profile only) |
| Harnesses | builtin (OpenRouter) + CLI adapters (claude/codex/opencode) + remote worker, pooled via `harness/adapter-pool.ts` | — |
| Sandbox (default) | `LocalSandboxAdapter` (host working dir); `DisabledSandboxAdapter` | Opt-in isolation planned (AQ2) |
| Human Interface | React + TypeScript (Electron renderer) | Same |
| Desktop shell | Electron (macOS, arm64, DMG) | — |
| Notifications | ntfy.sh / SMTP adapters (`packages/server/src/app-runtime/services/notifications/`) | APNs, Firebase |
| Observability | `console` \| `noop` channels (`packages/server/src/services/observability/`) — OpenTelemetry explicitly future | — |
| Auth | Auto-generated API key (`X-API-Key` header) | OAuth / passkeys |
| Credentials | Electron safeStorage (desktop) / AES-256-GCM server-side — see [Credential Model](./credential-model.md) | — |
| Version control | Git (for markdown artifacts) | Same |

### Language choices

**TypeScript** for the entire stack. The process layer (API, scheduler, adapters, knowledge services) runs on **Node.js** with **Hono** as the HTTP framework: single language across the monorepo, Drizzle ORM for type-safe queries against the embedded Postgres store.

**TypeScript + React** for the Factory app: Tailwind + DaisyUI compose cleanly with React, sharing types with the server eliminates API contract drift, and Electron bundles the renderer natively.

### Monorepo packages

| Package | Layer | Purpose |
|---------|-------|---------|
| `shared` | Shared | Types, constants, TOON codec |
| `db` | Core app | Schema (Drizzle ORM), migrations |
| `server` | Core app + agent layer | Hono API routes, middleware, WebSocket, domain services, agent runtime services |
| `fabric` | Legacy compatibility | Historical package retained for old tests/exports; product runtime must use `server/src/app-runtime` instead |
| `strategy-minimal` | Legacy compatibility | Historical package retained for old tests/exports; product runtime must not use it as fallback |
| `web` | Interface | React SPA (Vite) |
| `desktop` | Interface | Electron main process, preload bridge |
| `design-system` | Interface | React components + stories |
| `api-contract` | Shared | Zod response schemas, Hono RPC types |
| `eval` | Tooling | LLM-judged evals for agent journeys |
| `eslint-plugin-design` | Tooling | Design system lint rules |
| `eslint-plugin-authz` | Tooling | Authorization boundary lint rules |

## 3. The Human Interface: The Factory

### 3.1 Delivery

One codebase, one app, two form factors. Desktop (Electron, macOS arm64) is the primary form factor; the same web app is intended to be reachable from a mobile browser for review triage and agent unblocking. No native mobile app, no offline support. The mobile claim is unproven for the desktop profile today — the embedded server binds `127.0.0.1` (`packages/desktop/src/main.ts:547`), so a phone cannot reach it directly; mobile access presumes a shared deployment (see [deployment](../deployment/index.md)).

### 3.2 Technology stack

React (TypeScript) with **Tailwind CSS + DaisyUI** and the Hearth theme — `hearth-light` / `hearth-dark`, resolved from a light/dark/system preference before first paint (`packages/web/index.html:39`). Behavior gaps filled by `focus-trap-react` and `@floating-ui/dom`. Visual authority lives in [ui-design](../ui-design/index.md).

### 3.3 The three views

- **Conversations** — threaded messages; review messages embed an artifact reference plus a verdict affordance; humans can initiate conversations and dial into live sessions. Verdict grammar is owned by [Thread Primitive](../human-interface-layer/thread-primitive.md); ArtifactView's five embed shapes by [Artifact Primitive](../process-layer/artifact-primitive.md).
- **Work** — drill-down WorkOverview → Team → Bet → Task (no Product level; scope is Team). Bets have a hard capacity cap enforced server-side at status transitions (`packages/server/src/routes/bets.ts:757`). Tasks are agent-owned — no drag; state changes flow through threads.
- **Knowledge** — items with relevance and attention scoring; scope changes carry a reason logged to the knowledge edit log. Scoring design: [relevance and attention](../knowledge-architecture/relevance-and-attention.md).

View behavior and layout are owned by the [human-interface-layer](../human-interface-layer/the-three-views.md) and [information-architecture](../information-architecture/app-shell-always-present.md) docs.

### 3.4 Desktop shell

Electron main process starts the embedded Hono server on localhost; the BrowserWindow loads `http://127.0.0.1:{port}`. Data lives in PGlite at Electron userData (`resolveDataDir` → `userData/hyperidle-pg`, `packages/desktop/src/main.ts:48`). Auth is an auto-generated API key injected by the preload bridge. Install and packaging live in [deployment](../deployment/index.md).

### 3.5 Data flow skeleton

```
User opens Factory app
  → Electron main starts embedded Hono server on localhost
  → BrowserWindow loads http://127.0.0.1:{port}
  → POST /api/auth/ws-token mints a one-shot upgrade token
  → WebSocket connects via /api/ws?token=… (ambient updates for threads, sessions, costs)
  → GET /api/conversations (initial thread list)

User submits a verdict
  → POST /api/threads/:id/messages (verdict-type message)
  → API writes Message to Primitive Store
  → Event emitted via EventBus
  → App subscribers react: harness adapter unblocks agent, attention scores update
  → Thread list refreshes via WebSocket push

User creates a bet
  → POST /api/bets (markdown body + appetite)

User creates knowledge
  → POST /api/knowledge (scope_kind + scope_id + markdown body)
  → app-runtime assigns the item to the correct knowledge layer
```

WebSocket subscribe authorization is owned by the [Authorization Model](./authorization-model.md); full end-to-end flows live in [Data Flow Examples](./data-flow-examples.md).

## 4. What This Architecture Does Not Include

- **A model-calling loop.** That's the harness.
- **A workflow engine or DAG executor.** Sequences emerge from task dependencies and handoffs.
- **MCP servers for external tool discovery.** Skills call CLIs and APIs directly. Exception: the MCP Bridge (`packages/server/src/mcp/mcp-bridge.ts`) exposes HyperIdle's tools TO external harnesses — the inverse direction. There is no outbound MCP broker; external tools arrive via the [Connection model](./connection-model.md) (held tokens injected at provisioning, or inherited harness auth).
- **A vector database.** Full-text search is Postgres tsvector + GIN on `knowledge_items`; no pgvector.
- **A separate auth service.** Auto-generated API keys; a Tailscale-style private network for shared deployments.
- **A backlog.** Draft bets live on the Work view; unpicked drafts expire.
- **Multiple applications.** One app, two form factors.
- **Jira-style reporting.** Conversations (review threads) and Work (bet/task views) are the human surfaces for status.
- **A git forge, a CI engine, or deploy infrastructure.** HyperIdle rides the git substrate (code in a local-first, forge-optional git repo), integrates CI/registries/deploy/SSO via API/MCP, and triggers side-effects through connected systems — it never hosts repos, runs runners, or executes a deploy itself. See [System Boundary](./system-boundary.md); the trigger-not-executor seam is the [Proposed Call](../process-layer/staged-operation.md) (AL7).

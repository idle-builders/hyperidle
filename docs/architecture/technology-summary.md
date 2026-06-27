## 5. Technology Summary

| Component | Default Technology | Scale Alternative |
|-----------|--------------------|-------------------|
| Primitive Store | SQLite via `better-sqlite3` | Postgres |
| Knowledge (all layers) | SQLite (`knowledge_items` table) | Postgres + pgvector |
| Knowledge exports (human-readable) | Git repo (markdown exports from SQLite) | Same |
| Session context | TOON format ([github.com/toon-format/toon](https://github.com/toon-format/toon)) | Same |
| API Layer | Hono on `@hono/node-server` | Same + load balancer |
| Event Bus | In-process EventBus (TypeScript) | _Future candidate:_ Redis pub/sub or NATS (cloud profile only) |
| Scheduler | setInterval + EventBus + SQLite polling | _Future candidate:_ BullMQ / Temporal (cloud profile only) |
| Harness (default) | Claude Agent SDK | — |
| Sandbox (default) | LocalSandboxAdapter (host working dir) | Opt-in isolation planned (AQ2) |
| Human Interface | React + TypeScript (Electron renderer) | Same |
| Desktop shell | Electron (macOS, arm64) | — |
| Notifications | ntfy.sh / SMTP | APNs, Firebase |
| Observability | Console / no-op | OpenTelemetry (planned) |
| Auth | Auto-generated API key (X-API-Key header) | OAuth / passkeys |
| Credentials | Electron safeStorage (desktop) / AES-256-GCM (shared) | — |
| Version control | Git (for markdown artifacts) | Same |

### Language choices

**TypeScript** for the entire stack (process layer + frontend). The process layer (API, Scheduler, Adapters, Knowledge Fabric) runs on **Node.js** with **Hono** as the HTTP framework. Reasons: single language across the monorepo, better-sqlite3 for native SQLite, Drizzle ORM for type-safe queries, and the agent ecosystem's TypeScript SDK support (Claude Agent SDK).

**TypeScript + React** for the Factory app (frontend). Reasons: Tailwind + DaisyUI compose cleanly with React, sharing types with the server eliminates API contract drift, and Electron bundles the renderer natively.

### Monorepo packages

| Package | Layer | Purpose |
|---------|-------|---------|
| `shared` | Kernel | Types, constants, TOON codec |
| `db` | Kernel | Schema (Drizzle ORM), migrations |
| `server` | Kernel | Hono API routes, middleware, WebSocket, kernel services |
| `fabric` | Strategy | Scoring, routing, propagation, notifications, built-in routines |
| `web` | Interface | React SPA (Vite) |
| `desktop` | Interface | Electron main process, preload bridge |
| `api-contract` | Shared | Zod response schemas, Hono RPC types |
| `design-system` | Interface | React components + stories |
| `pipeline` | Infra | Async job execution (in-process `setInterval` services) |
| `eslint-plugin-design` | Tooling | Design system lint rules |

The kernel never imports from fabric. Fabric subscribes to kernel events via the EventBus.

---

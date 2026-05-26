## 5. Technology Summary

| Component | Default Technology | Scale Alternative |
|-----------|--------------------|-------------------|
| Primitive Store | SQLite (`hyperidle.db`) | Postgres |
| Knowledge (all layers) | SQLite (`knowledge_items` table in `hyperidle.db`) | Postgres + pgvector |
| Knowledge exports (human-readable) | Git repo (markdown exports from SQLite) | Same |
| Session context | TOON format ([github.com/toon-format/toon](https://github.com/toon-format/toon)) | Same |
| API Layer | Hono (TypeScript/Bun) | Same + load balancer |
| Event Bus | In-process EventBus (TypeScript) | Redis pub/sub or NATS |
| Scheduler | setInterval + EventBus + SQLite polling | BullMQ / Temporal |
| Harness (default) | Claude Agent SDK | Letta, Goose, OpenHands |
| Workspace (default) | Docker + gVisor | E2B, Daytona |
| Human Interface | React + TypeScript PWA | Same |
| Desktop shell | Browser tab (default) / Tauri (optional) | Same |
| Canvas (bet placement) | React DnD (or similar drag-and-drop) | — |
| Notifications | ntfy.sh / SMTP | APNs, Firebase |
| Observability | Console / no-op | OpenTelemetry (planned) |
| Auth | API keys + Tailscale | OAuth / passkeys |
| Version control | Git (for markdown artifacts) | Same |

### Language choices

**TypeScript** for the entire stack (meta layer + frontend). The meta layer (API, Scheduler, Adapters, Knowledge Fabric) runs on **Bun** with **Hono** as the HTTP framework. Reasons: single language across the monorepo, Bun's native SQLite driver, Drizzle ORM for type-safe queries, and the agent ecosystem's TypeScript SDK support (Claude Agent SDK).

**TypeScript + React** for the Factory app (frontend). Reasons: Tailwind + DaisyUI compose cleanly with React, the PWA ecosystem is TypeScript-native, and sharing types with the server eliminates API contract drift.

**No Rust, Go, or Java in the core.** Tauri is Rust under the hood but we treat it as a shell, not a development surface. The meta layer runs efficiently on Bun's optimized JavaScript runtime.

---

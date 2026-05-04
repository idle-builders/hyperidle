# Track A: Foundation

See `CLAUDE.md` for tech stack and `plans/work-packages/dependency-graph.md` for the dependency graph.

---

### A1 — Project Scaffolding

**Story.** As an agent, I want a working monorepo with TypeScript, testing, and database tooling configured, so that I can begin implementing features with type safety and confidence that changes are tested.

**Depends on.** None.

**Acceptance criteria.**
- `bun install` completes with zero errors.
- `bun test` runs Vitest across all packages with ≥3 tests per critical package (db, server, fabric).
- `bun dev` starts both Hono (port 3001) and Vite (port 5173).
- `GET /health` returns `{ status: "ok", timestamp: ... }`.
- React app renders at `localhost:5173`.
- Cross-package type import works: `packages/shared` type imported in both server and web.
- Drizzle connects to in-memory SQLite in a test and executes a query.

**Validation scenarios.**
- Given monorepo initialized, when running tests, then all tests pass and coverage is reported.
- Given app running, when requesting health endpoint, then response is valid and immediate.

**Contracts / constraints.**
- Test utilities (`createTestDb()`, `createTestApp()`) are exported and reusable by all downstream stories.
- Coverage targets: 80% unit, critical paths in integration.

**Effort.** M (~2d)

---

### A2 — Database Schema + Migrations

**Story.** As an agent, I want the complete database schema defined and migrated, with seed data in place, so that I can interact with the canonical stores (process primitives, knowledge, items, responses) as I build features.

**Depends on.** A1.

**Acceptance criteria.**
- `bun run db:migrate` applies migrations to fresh SQLite without errors.
- All tables insert/read/update correctly with full type safety.
- All five knowledge_items indexes exist.
- Seed script populates ≥1 row per major table (agents, teams, products, knowledge_items, factory_settings).
- Same schema works against PostgreSQL (via Docker) — dual-driver support proven.
- Foreign key constraints enforced.

**Validation scenarios.**
- Given empty database, when running migrations, then schema is created correctly.
- Given seeded database, when querying each table, then seed data is present and well-formed.
- Given PostgreSQL enabled, when running migrations, then schema created correctly in Postgres.

**Contracts / constraints.**
- Schema must be versionable (migrations as SQL files, numbered sequentially).
- Shared types (TaskState, KnowledgeLayer, etc.) must be importable from `packages/shared`.

**Effort.** M (~2d)

---

### A3 — Event Bus

**Story.** As an agent, I want typed events flowing through an in-process pub/sub system with per-stream ordering and at-least-once delivery, so that components can react to state changes without tight coupling.

**Depends on.** A1.

**Acceptance criteria.**
- Subscribers receive events in order for the same stream.
- Multiple subscribers to same event both receive it.
- Unsubscribe prevents future delivery.
- Type errors on malformed payloads fail at compile time.
- Throughput: 1000 events/sec without drops.
- Wildcard subscription (`bus.on('*', ...)`) receives all events.
- Per-stream ordering: 5 sequential events for same task arrive in order.
- At-least-once delivery: events emitted only after database write durability.

**Validation scenarios.**
- Given subscriber to `task_state_changed`, when event is emitted, then subscriber receives typed payload.
- Given 1000 events emitted, when throughput test runs, then all events delivered without loss.
- Given wildcard subscription, when event emitted, then wildcard subscriber receives it.

**Contracts / constraints.**
- Event types defined in `packages/shared/events.ts` as TypeScript union types.
- Redis adapter interface defined (implementation deferred).
- Synchronous emission after database durability (not async).

**Effort.** S (~1d)

---

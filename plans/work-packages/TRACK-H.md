# Track H: Operations

See `docs/work-packages/SHARED.md` for tech stack, shared contracts, and dependency graph.

---

### H1 — Git Export Routine

**Story.** As the knowledge system, I want human-readable knowledge items (L2 product docs, L4 factory docs) exported to a Git repository on schedule or after human edits, so that version history is preserved and documents are accessible outside the app.

**Depends on.** B1, G1.

**Acceptance criteria.**
- Human edit to L4 PRINCIPLES → Git export runs, commits new PRINCIPLES.md.
- Commit message includes which items changed.
- No commit if no changes since last export.
- Exported markdown matches item body exactly.
- Configurable: repo path, remote URL, branch.

**Validation scenarios.**
- Given PRINCIPLES item edited, when export runs, then commit created with message.
- Given no changes since last export, when export runs, then no commit created.

**Contracts / constraints.**
- Git operations: commit with message, push to remote.
- L2 exports: BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md per product.
- L4 exports: PRINCIPLES.md, FOCUS.md, PORTFOLIO.md, REFLECTIONS/ per factory.

**Effort.** S (~1d)

---

### H2 — Notification Adapter

**Story.** As the system, I want pluggable notification adapters (console for dev, ntfy.sh for self-hosted, SMTP for email fallback), so that blocking items and cost breaches reach humans via their preferred channel.

**Depends on.** E2, A3.

**Acceptance criteria.**
- Console adapter: blocking item logged to console.
- Ntfy adapter: push sent to ntfy.sh topic (integration test).
- SMTP adapter: email sent (integration test with MailHog).
- Silence mode: items queued during quiet hours, not pushed.
- Push policy: only blocking items + cost breaches (not low-risk).
- Daily digest: non-urgent items accumulated and sent.

**Validation scenarios.**
- Given blocking item, when ntfy adapter enabled, then push sent to topic.
- Given silence mode active during quiet hours, when item created, then item queued.

**Contracts / constraints.**
- Adapter interface: `send(recipient, notification)`.
- Configuration via factory_settings.

**Effort.** M (~2d)

---

### H3 — Observability Adapter

**Story.** As an operator, I want structured event logging with trace correlation (console or Langfuse), so that session execution, tool calls, cost, and state changes are observable for debugging and analysis.

**Depends on.** A3.

**Acceptance criteria.**
- Console adapter: structured JSON logs to stdout.
- Langfuse adapter: traces sent to Langfuse project (integration test).
- Trace correlation: all session events share same trace ID.
- Events logged: session start/end, tool calls, cost, state transitions, knowledge writes.
- Performance: 1000 events logged in <100ms (non-blocking).
- Adapter configurable via factory_settings.

**Validation scenarios.**
- Given session started, when logged, then trace ID in log.
- Given 1000 events, when logged, then <100ms elapsed.

**Contracts / constraints.**
- Event logging non-blocking (async or buffered).
- TraceID correlates all events within session.

**Effort.** S (~1d)

---

### H4 — Deployment Profiles + PostgreSQL Adapter

**Story.** As an operator, I want three deployment profiles (laptop, VPS, cloud) with corresponding database drivers (SQLite for laptop, Postgres optional for scale), workspace adapters (local, Docker, E2B), and a single-command setup, so that deployments are reproducible across contexts.

**Depends on.** A2, H1–H3.

**Acceptance criteria.**
- `bun run setup --profile laptop` creates SQLite DB, runs migrations, seeds, starts server.
- `bun run setup --profile vps` starts with Docker Compose (Postgres + server + web).
- All tests pass against PostgreSQL (full suite with Postgres driver).
- Switching SQLite → Postgres is a config change (no code changes).
- Postgres adapter uses connection pooling (10 connections default).
- Documentation exists for each profile's setup.

**Validation scenarios.**
- Given laptop profile, when setup runs, then SQLite database created and seeded.
- Given vps profile, when setup runs, then Docker Compose starts all services.

**Contracts / constraints.**
- Single schema definition (Drizzle) targets both SQLite and Postgres.
- Profile config in `.env` or CLI flag.
- Migrations work identically on both databases.

**Effort.** M (~2d)

---

## Previous Decisions Preserved

- Tailwind + DaisyUI + factory-dark theme
- TOON format for context packs (~40% token savings)
- Desktop-first UI (mobile deferred to v2); desktop = web app (Tauri optional later)
- 19-component budget (5 Tier 1, 6 Tier 2, 8 Tier 3)
- Rail as sole notification surface
- 10 verdict actions on review items
- 5 ArtifactView shapes
- 8-state task lifecycle
- D5 ↔ E2 sequencing (session_ended events trigger review item creation)
- B4 → E4 contract (workspace layout)
- A3 event ordering + C7 idempotency (cost cap warnings deduplicated by key)
- UI-31/UI-32 split (work/planning vs review)
- UI-42 Settings Panel (5 tabs, Profile/Products/Agents/Notifications/Appearance)
- UI-45 Global Search (⌘K, results grouped by type)
- E7 deferred UI (backend-only in v1)

---

## Critical Path Summary

**A1 → A2 → B1 → B2 → B4 → C3 → D5 → E6 → UI-00 → UI-10 → UI-20 → UI-30 → UI-31 → UI-32 → UI-40 → G1 → G2 → G3 → G4 → H4**

Approximately **32–36 story-weeks** (assuming M = 2d, S = 1d, L = 4d, adjusting for real parallelism and team coordination).

**First working system ("hello world"):** After D5, agents can be assigned work, materialize knowledge, and write back. This is the core loop.

**Human in the loop:** After UI-40, humans see and respond to agent work via Conversations and Review pages.

**Self-improving factory:** After G4, facilitators run automatically: practices accumulate, retros happen, knowledge curates.

---

*Companion to ARCHITECTURE.md (structure), REQUIREMENTS.md (what it must do), and design docs (why). This document is the bridge from design to implementation: each story is a unit an agent can decompose and execute.*

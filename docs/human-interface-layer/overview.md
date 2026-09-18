# The Human Interface Layer — Overview

Why this layer exists, what it ships, what it refuses to own, and how it builds trust.

---

## 1. One App, One Grammar

The settled decision: **one app, with well-defined views inside it, sharing one data model and one interaction grammar.** The human opens the app; the app presents the right thing — view routing does the deciding.

Two alternatives were rejected:

- **A single mega-dashboard** that conflates inbox, planner, diff reviewer, audit log, and strategy doc — it becomes none of them.
- **Four separate applications**, where the human decides which app to open based on what they want to do — a notification-tray zoo, exhausting.

As built: a single app shell with three views (`layers/core-ui/src/layouts/AppShell.tsx`, `layers/core-ui/src/shell/Sidebar.tsx` — Conversations / Work / Knowledge), one shared schema (`framework/db/src/schema.ts` — threads and messages serve all views), and one thread/verdict grammar (`framework/domain-model/src/thread.ts`). One threading renderer serves every thread type — see [part-model.md](part-model.md). Mode discipline (what belongs where) is enforced by view routing inside the app, not by shipping separate products; if a view should ever collapse into another, that's a route change, not a product change.

The app is meant to sit open on a side screen during the workday. One door — not "check the inbox, then the HUD, then the assistant."

## 2. Delivery and Shell Posture

One product: an Electron macOS desktop app with the Hono API server embedded in the main process (`applications/desktop/src/main.ts`, `boot-server.ts`) and PGlite as the local database — install, paths, and release details live in [deployment/](../deployment/index.md). Desktop is the only proven form factor: the embedded server binds `127.0.0.1` only (`applications/desktop/src/boot-server.ts`), so the mobile-browser access story has no code path today — the delivery claim is owned by [architecture/system-overview.md](../architecture/system-overview.md).

Shell layout structure (Sidebar, routes, sections, shortcuts) is owned by [information-architecture/app-shell-always-present.md](../information-architecture/app-shell-always-present.md). The posture facts that matter at this layer:

- Conversations is the default view; Work and Knowledge are destinations.
- Breadcrumbs live within a view, never across views — switching views is a clean context switch.
- The Sidebar is a plain React component subscribing to the same data as everything else. No daemon, no menu-bar binary, no separate deployment target.

## 3. What This Layer Ships

Three parts, as built:

1. **The Thread/Message data model.** PGlite-backed (embedded Postgres); typed messages `plain | review | questionnaire | verdict` (`framework/domain-model/src/thread.ts` MESSAGE_TYPES). Four actions — search a thread, open a thread, send a message, adjust a thread — are the whole public surface, over `POST /api/actions/<name>` and as agent tools alike. Owned by [thread-primitive.md](thread-primitive.md).
2. **One reference application.** The Electron desktop app above — Sidebar + Main pane, server in-process.
3. **Notification dispatch.** Channels are exactly console / ntfy / smtp (`layers/core-api/notifications/src/install.ts`); a blocked task fires immediately, FYI-grade events go ambient/digest. Owned by [notification-primitive.md](notification-primitive.md).

## 4. What This Layer Is Not

Negative scope — code matching any bullet has crossed a layer boundary and should stop:

- **The agent runtime.** Lives in the harness (claude-code CLI, codex, opencode, cursor-agent). See [agent-layer/](../agent-layer/index.md).
- **Skill execution.** Agents run tools on the host (opt-in sandbox is separate — [architecture/run-unit-model.md](../architecture/run-unit-model.md)); this layer only routes outputs to views.
- **Memory/knowledge storage.** Owned by the knowledge service (`layers/core-api/knowledge/`) — see [knowledge-architecture/](../knowledge-architecture/index.md).
- **Observability backends.** Emit to the configured adapter (console today, OTEL planned); never run them.
- **Workflow orchestration.** No DAGs. Thread actions plus event-bus listeners; that's it.
- **Multiple applications.** One app.
- **Per-deployer dashboards.** Built on the same thread-message store (verdicts are verdict-typed messages; there is no separate responses table).

## 5. User-Visible Trust Surfaces

The trust engine itself is owned by [review-primitive.md](review-primitive.md); this is what the user sees:

1. **Reasoning visible by default.** A review message shows *why* — `reasoning[]` on thread messages (`framework/domain-model/src/thread.ts`).
2. **Team transparency.** The WorkTeam summary strip (`layers/core-ui/src/pages/WorkTeam.tsx`) shows capacity and status.
3. **Reversibility rides the action, not the review.** An action a human or a learning marked consequential routes to review; everything else flows without one. The gate that routes a consequential action to a human is being rebuilt; no document describes a live mechanism for it until it lands.
4. **The trust dial is a track record, not a gate.** Approval rate from verdict history (`layers/core-api/policy/src/approval-rate.ts`) is rendered on the agent's profile. Nothing reads it to route, queue, or auto-resolve a review — every review waits for a human's own verdict.

The arc worth keeping: the human is in every loop, on every review, until a document describes a live mechanism that earns fewer.

## 6. Anti-Pattern Guardrails

Standing guidance the shipped app follows — don't build:

- A single dashboard that does everything.
- A zoo of separate apps and accounts.
- Chat-only interfaces that hide reasoning.
- Modal-confirmation notification fatigue.
- Spatial canvases forced onto list-shaped work.
- Flat card walls for knowledge — they collapse past a few hundred items; structure via topics and scopes (this is why Knowledge is a catalogue with Triage/Curated).

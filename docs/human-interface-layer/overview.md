# The Human Interface Layer — Overview

Why this layer exists, what it ships, what it refuses to own, and how it builds trust.

---

## 1. One App, One Grammar

The settled decision: **one app, with well-defined views inside it, sharing one data model and one interaction grammar.** The human opens the app; the app presents the right thing — view routing does the deciding.

Two alternatives were rejected:

- **A single mega-dashboard** that conflates inbox, planner, diff reviewer, audit log, and strategy doc — it becomes none of them.
- **Four separate applications**, where the human decides which app to open based on what they want to do — a notification-tray zoo, exhausting.

As built: a single app shell with three views (`layers/core-ui/src/layouts/AppShell.tsx`, `layers/core-ui/src/shell/Sidebar.tsx` — Conversations / Work / Knowledge), one shared schema (`framework/db/src/schema.ts` — threads, messages, and items serve all views), and one thread/verdict grammar (`framework/domain-model/src/thread.ts`). One threading renderer serves every thread type — see [part-model.md](part-model.md). Mode discipline (what belongs where) is enforced by view routing inside the app, not by shipping separate products; if a view should ever collapse into another, that's a route change, not a product change.

The app is meant to sit open on a side screen during the workday. One door — not "check the inbox, then the HUD, then the assistant."

## 2. Delivery and Shell Posture

One product: an Electron macOS desktop app with the Hono API server embedded in the main process (`applications/desktop/src/main.ts`, `boot-server.ts`) and PGlite as the local database — install, paths, and release details live in [deployment/](../deployment/index.md). Desktop is the only proven form factor: the embedded server binds `127.0.0.1` only (`applications/desktop/src/boot-server.ts`), so the mobile-browser access story has no code path today — the delivery claim is owned by [architecture/system-overview.md](../architecture/system-overview.md).

Shell layout structure (Sidebar, routes, sections, shortcuts) is owned by [information-architecture/app-shell-always-present.md](../information-architecture/app-shell-always-present.md). The posture facts that matter at this layer:

- Conversations is the default view; Work and Knowledge are destinations.
- Breadcrumbs live within a view, never across views — switching views is a clean context switch.
- The Sidebar is a plain React component subscribing to the same data as everything else. No daemon, no menu-bar binary, no separate deployment target.

## 3. What This Layer Ships

Five parts, as built:

1. **The Thread/Message data model.** PGlite-backed (embedded Postgres); typed messages `plain | review | questionnaire | verdict` (`framework/domain-model/src/thread.ts` MESSAGE_TYPES). Owned by [thread-primitive.md](thread-primitive.md).
2. **An item router.** Pure `routeItem({ riskTier, kind, verb })` → conversations / work / knowledge (`routeItem`, `framework/api-contract/src/core-api-port.ts`); default is conversations. Owned by [items-and-routing.md](items-and-routing.md).
3. **One reference application.** The Electron desktop app above — Sidebar + Main pane, server in-process.
4. **Notification dispatch.** Channels are exactly console / ntfy / smtp (`layers/core-api/notifications/src/install.ts`); blocking or medium/high-risk items fire immediately, low-risk items go ambient. Owned by [notification-primitive.md](notification-primitive.md).
5. **A policy engine.** Silence modes (`layers/core-api/notifications/src/silence-policy.ts`) plus approval-rate trust (AD4) gate which items push, queue, or auto-resolve (`layers/core-api/policy/src/policy-engine.ts`).

## 4. What This Layer Is Not

Negative scope — code matching any bullet has crossed a layer boundary and should stop:

- **The agent runtime.** Lives in the harness (builtin, claude-code CLI, codex, opencode, cursor-agent). See [agent-layer/](../agent-layer/index.md).
- **Skill execution.** Agents run tools on the host (opt-in sandbox is separate — [architecture/run-unit-model.md](../architecture/run-unit-model.md)); this layer only routes outputs to views.
- **Memory/knowledge storage.** Owned by the knowledge service (`layers/core-api/knowledge/`) — see [knowledge-architecture/](../knowledge-architecture/index.md).
- **Observability backends.** Emit to the configured adapter (console today, OTEL planned); never run them.
- **Workflow orchestration.** No DAGs. Pure item routing plus event-bus listeners; that's it.
- **Multiple applications.** One app.
- **Per-deployer dashboards.** Built on the same item/thread-message store (verdicts are verdict-typed messages; there is no separate responses table).

## 5. User-Visible Trust Surfaces

The trust engine itself is owned by [review-primitive.md](review-primitive.md); this is what the user sees:

1. **Reasoning visible by default.** Every item shows *why* — `items.reasoning` (`framework/db/src/schema.ts`) and `reasoning[]` on thread messages (`framework/domain-model/src/thread.ts`).
2. **Team transparency.** The WorkTeam summary strip (`layers/core-ui/src/pages/WorkTeam.tsx`) shows capacity and status.
3. **Reversibility rides Proposed Calls, not items.** Staged operations carry `reversibility` (`schema.ts`); irreversible calls route to review where a human or learning chose it, reversible calls flow without review. Mechanics: [process-layer/staged-operation.md](../process-layer/staged-operation.md).
4. **The trust dial is earned, not hand-set.** Approval rate from verdict history × riskTier (AD4, `policy-engine.ts`): rate ≥ 0.9 and low risk → auto-resolve; ≥ 0.7 and low risk → queue; high risk or skill_change → always push; fewer than 10 verdicts → always push (cold-start). Thresholds live in factory settings.

The arc worth keeping: the human is in every loop on day one and only in the loops that matter later — driven by earned approval rate. Routing of agent-produced review items to humans is soft and overridable: the mechanism is item-router plus policy-engine (risk tier × approval-rate trust), never a fixed responsibility table.

## 6. Anti-Pattern Guardrails

Standing guidance the shipped app follows — don't build:

- A single dashboard that does everything.
- A zoo of separate apps and accounts.
- Chat-only interfaces that hide reasoning.
- Modal-confirmation notification fatigue.
- Spatial canvases forced onto list-shaped work.
- Flat card walls for knowledge — they collapse past a few hundred items; structure via topics and scopes (this is why Knowledge is a catalogue with Triage/Curated).

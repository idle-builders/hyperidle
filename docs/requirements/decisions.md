## 6. Decisions

### Decided

- **Practice session mechanics** — three-turn conversation (1: all agents propose findings, 2: all agents react with context/relevance, 3: facilitator synthesizes — routing items to practice L3 or product L2 as appropriate).
- **Session notes** — continuous writing throughout the session, not just at end. Pre-compaction trigger where harness supports it. No rigid template; flight-level guidance on what to write about.
- **Skill hot-reload** — next session picks it up. No mid-session propagation.
- **Desktop shell** — web-first. Plain web app served by the API process. No Tauri, no PWA wrapper. Native apps can be added later.
- **Mobile** — online-first responsive web app. No dedicated native app or offline-first PWA in v1.
- **Canvas (bet placement)** — symbolic UI, not an actual canvas. Two-column layout (shaped / committed) with hard capacity cap, rendered as `BetCard`s. Standard React components on the DaisyUI stack (see UI_DESIGN.md).
- **TOON format** — using existing spec at github.com/toon-format/toon.
- **Scheduler** — async single-process (Python asyncio). Scale to separate worker only when measured latency demands it.
- **No external framework integrations in the meta layer.** No Letta, no Agent Mail, no Temporal, no Inngest. All agentic integrations happen through the Agent Runtime (Harness Adapters). Minimal dependencies.
- **Laptop minimum install** — Python + SQLite + Docker + Claude API key. 10-minute install bar.
- **Product Manager trajectory assessment** — reads task comments and notes to assess progress. No hardcoded signals or thresholds. Analytics can be layered in later.
- **No platform team.** HyperIdle is developed by a product team using HyperIdle — dogfooding its own framework.
- **Cross-product routine ownership** — Chief of Staff.
- **Routine migration** — an agent cannot leave a team while it has routines attached. Routines must be reassigned or retired first.
- **Team membership changes** — the Product Manager (team facilitator) can request changes on behalf of the team via Conversations to the Chief of Staff, who assesses and proposes to founders.
- **Knowledge Fabric sync** — continuous writeback via file watcher is v1. No session-boundary dependency. WebSocket push to Knowledge view tabs included.
- **Notifications** — TBD during development. Will need a notification adapter; specific technology decided at implementation time.

### Deferred

- **Heartbeat granularity** — minimum roughly hourly. Exact granularity determined during implementation.
- **Daytona Custom Regions** — parked until addressing self-hosted deployment profiles.

---

*This document captures what the system must do, not how it does it. The companion ARCHITECTURE.md captures the how.*

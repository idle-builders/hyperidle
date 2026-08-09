# Architecture Decisions

Code-verified decision log for the system architecture. Each entry records a settled choice and where it lives in code. Domain depth is never restated here — the owning doc is linked.

## Formats & protocols

- **TOON for context packs.** The existing TOON spec at [github.com/toon-format/toon](https://github.com/toon-format/toon); ~40% token savings over JSON for structured agent context packs. Codec: `framework/toon-codec/src/toon-codec.ts`. TOON is reserved for context packs — all inter-agent messages use JSON.
- **A2A-inspired handoff protocol.** Structured handoff messages with context IDs, task states, reason codes, and artifact references — JSON, never TOON (`layers/core-api/policy/src/handoff-protocol.ts`, `POST /tasks/:id/handoff`). Semantics: [handoff and lifecycle propagation](../process-layer/handoff-and-lifecycle-propagation.md).

## Sessions & agents

- **Session note quality.** No rigid template. LLMs write good prose; what matters is flight-level guidance on what to write about (goal, outcome, changes, next steps, hazards). Notes are stored as prose (`sessions.notes`) — the process layer never parses them structurally.
- **Context compaction detection.** Continuous session notes throughout the session (the agent writes to `work/session-notes.md` as it works, picked up by continuous writeback). Pre-compaction trigger where the harness supports it — part of the adapter contract ([harness capability descriptor](../agent-layer/harness-capability-descriptor.md)). Token-counting heuristic as fallback.
- **Hot-reload for skills.** The next session picks changes up. No mid-session propagation.
- **Cross-team routine ownership.** Routines that observe patterns beyond a single team belong to the assistant (individual agent).

## Runtime & process model

- **Scheduler architecture.** Single Node.js process: the API server and the in-process `setInterval` schedulers (`layers/core-api/routine/src/routine-scheduler.ts`) share one event loop; context assembly and session-start calls run as async tasks. Extract the scheduler to its own process (communicating via the event bus) only if measured latency degrades under load.
- **No external framework integrations in the process layer.** No Letta, no Agent Mail, no Temporal, no Inngest. All agentic integrations happen through harness adapters in the agent runtime. The process layer stays minimal: Postgres (PGlite), TypeScript/Node.js, the knowledge services, and the Hono API.
- **Postgres only.** PGlite locally, `postgres-js` against a managed server — one engine, one schema (`framework/db/src/schema.ts` is `pgTable`-only). SQLite is retired entirely. See [the canonical store](../knowledge-architecture/the-canonical-store.md).

## Delivery

- **Desktop shell.** Electron. The Hono server is embedded in the main process (`@hono/node-server`); storage is PGlite at `userData/hyperidle-pg` (`applications/desktop/src/main.ts`); auth via an auto-generated API key injected by the preload bridge. Distributed as a signed/notarized DMG via Homebrew cask. Architecture detail: [system overview](./system-overview.md).
- **Mobile strategy.** Desktop is the primary form factor; the same web app serves mobile browsers for review triage and agent unblocking. No native app, no offline support. The delivery claim is owned by [system overview](./system-overview.md).
- **Minimum install.** `brew install --cask hyperidle`; SetupFlow guides first-run configuration. Install steps: [deployment](../deployment/index.md).

## UI

- **Bet placement tech.** Plain React `BetCard` components in a simple symbolic layout with a hard capacity cap — no drawing-canvas or drag-and-drop library. Surface structure: [work view](../information-architecture/work-view.md); lifecycle: [bets](../process-layer/bets-shape-commit-change-ship.md).
- **Attention scores drive notifications and ambient indicators, not the Knowledge view.** The Knowledge view gives access to all knowledge; attention scores decide what notifies and what surfaces via Conversations filter chips — they never filter the Knowledge view. Scoring: [relevance and attention](../knowledge-architecture/relevance-and-attention.md).

## Process layer

- **Trust gating: approval rate × risk tier.** No fixed autonomy ladder. Surface and mechanism: [review primitive](../human-interface-layer/review-primitive.md).
- **Task dependencies: hold state.** Tasks with unmet upstream dependencies go to `hold` (`framework/domain-model/src/types.ts:13`); the Dependency Watcher (`layers/core-api/work/src/dependency-watcher.ts`) auto-transitions them to `accepted` when upstream clears. Distinct from `blocked` (runtime blocks). Semantics: [tasks and sessions](../process-layer/tasks-and-sessions.md).

## Knowledge

- **Knowledge fabric sync: continuous writeback.** A file watcher on `knowledge/` and `work/` writes back changes incrementally (500ms debounce, `layers/agent-orchestration/run-orchestration/src/file-watcher.ts:30`) with WebSocket push to open Knowledge view tabs — no session-boundary dependency. Mechanics: [sync and conflict resolution](../knowledge-architecture/sync-and-conflict-resolution.md).
- **Layer precedence: L4 > L3 > L2 > L1 > L0.** Taxonomy: [the five layers](../knowledge-architecture/the-five-layers.md); precedence rules: [sync and conflict resolution](../knowledge-architecture/sync-and-conflict-resolution.md).
- **Edit log for facilitator learning.** Every human edit is logged in `knowledge_edit_log` (`framework/db/src/schema.ts:912`) as a training signal for improving facilitator proposals over time.
- **Facilitators are not a SPOF.** Practice facilitation is an async self-improvement loop that never interferes with task execution; if a facilitator is down, agents keep working and simply miss new practice updates until the next context assembly.
- **Knowledge misses are acceptable.** Agents will sometimes miss relevant knowledge — a feature, not a bug; it's part of how new approaches get discovered. The system optimizes for relevance at context-assembly time and doesn't guarantee completeness.

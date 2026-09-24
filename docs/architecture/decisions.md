# Architecture Decisions

Code-verified decision log for the system architecture. Each entry records a settled choice and where it lives in code. Domain depth is never restated here — the owning doc is linked.

## Formats & protocols

- **TOON for context packs.** The existing TOON spec at [github.com/toon-format/toon](https://github.com/toon-format/toon); ~40% token savings over JSON for structured agent context packs. Codec: `framework/toon-codec/src/toon-codec.ts`. TOON is reserved for context packs — all inter-agent messages use JSON.
- **Handoff is an edit.** No separate handoff protocol, structured message shape, or escalation thread — handing a task to another user is `edit_task({ id, ownerAgentId })` (`layers/core-api/task/src/task-actions.ts`), recorded as an ordinary `changes` row. The predecessor's running session ends and the new owner's session starts through the same two orchestration calls an accept makes. Semantics: [handoff and lifecycle propagation](../process-layer/handoff-and-lifecycle-propagation.md).

## Sessions & agents

- **Session note quality.** No rigid template. LLMs write good prose; what matters is flight-level guidance on what to write about (goal, outcome, changes, next steps, hazards). Notes are stored as prose (`sessions.notes`) — the process layer never parses them structurally.
- **Context compaction detection.** Continuous session notes throughout the session (the agent writes to `work/session-notes.md` as it works, picked up by continuous writeback). Pre-compaction trigger where the harness supports it — part of the adapter contract ([harness capability descriptor](../agent-layer/harness-capability-descriptor.md)). Token-counting heuristic as fallback.
- **Hot-reload for skills.** The next session picks changes up. No mid-session propagation.
- **Cross-team subscription ownership.** A subscription that observes patterns beyond a single team belongs to a team-less, owner-less agent — its reach is every team.

## Runtime & process model

- **Scheduler architecture.** Single Node.js process: the API server and the in-process `setInterval` schedulers (`layers/core-api/user/src/subscription-clock.ts`) share one event loop; context assembly and session-start calls run as async tasks. Extract the scheduler to its own process (communicating via the event bus) only if measured latency degrades under load.
- **No external framework integrations in the process layer.** No Letta, no Agent Mail, no Temporal, no Inngest. All agentic integrations happen through harness adapters in the agent runtime. The process layer stays minimal: Postgres (PGlite), TypeScript/Node.js, the knowledge services, and the Hono API.
- **Postgres only.** PGlite locally, `postgres-js` against a managed server — one engine, one schema (`framework/db/src/schema.ts` is `pgTable`-only). SQLite is retired entirely. See [the canonical store](../knowledge-architecture/the-canonical-store.md).

## Delivery

- **Desktop shell.** Electron. The Hono server is embedded in the main process (`@hono/node-server`); storage is PGlite at `userData/hyperidle-pg` (`applications/desktop/src/main.ts`); auth via an auto-generated API key injected by the preload bridge. Distributed as a signed/notarized DMG via Homebrew cask. Architecture detail: [system overview](./system-overview.md).
- **Mobile strategy.** Desktop is the primary form factor; the same web app serves mobile browsers for review triage and agent unblocking. No native app, no offline support. The delivery claim is owned by [system overview](./system-overview.md).
- **Minimum install.** `brew install --cask hyperidle`; SetupFlow guides first-run configuration. Install steps: [deployment](../deployment/index.md).

## UI

- **Task placement tech.** Plain React task card components in a simple symbolic layout — no drawing-canvas or drag-and-drop library, no team-level cap. Surface structure: [work view](../information-architecture/work-view.md); lifecycle: [tasks and sessions](../process-layer/tasks-and-sessions.md).
- **There is no attention or relevance score anywhere in the product.** The Knowledge view gives access to all knowledge, unfiltered by any score; Triage is plain recency order, and inbox rows are driven by a person's own explicit subscriptions, never a computed score.

## Process layer

- **Trust gating: approval rate × risk tier.** No fixed autonomy ladder. Surface and mechanism: [review primitive](../human-interface-layer/review-primitive.md).
- **Task dependencies: hold state.** Tasks with unmet upstream dependencies go to `hold` (`framework/domain-model/src/types.ts:13`); the Dependency Watcher (`layers/core-api/task/src/dependency-watcher.ts`) auto-transitions them to `accepted` when upstream clears, via `edit_task`. Distinct from `blocked` (runtime blocks). Semantics: [tasks and sessions](../process-layer/tasks-and-sessions.md).

## Knowledge

- **Knowledge fabric sync: continuous writeback.** A file watcher on `knowledge/` and `work/` writes back changes incrementally (500ms debounce, `layers/agent-orchestration/run-orchestration/src/file-watcher.ts:30`) with WebSocket push to open Knowledge view tabs — no session-boundary dependency. Mechanics: [sync and conflict resolution](../knowledge-architecture/sync-and-conflict-resolution.md).
- **Conflict resolution: version check, refuse and discard.** There is no layer ladder, no precedence order, and no conflict record to review — a version mismatch on modify is refused outright and the losing edit is simply discarded; a document has no conflict object. Mechanics: [sync and conflict resolution](../knowledge-architecture/sync-and-conflict-resolution.md).
- **History is the `changes` table, not a dedicated edit log.** Every human edit and every agent `edit_document` call lands as one `document.created`/`document.changed` row in the shared `changes` table — no separate log to keep in sync.
- **Curation is not a SPOF.** The document-management plugin's librarian agent triages and decays documents on a schedule, entirely separate from task execution; if it is uninstalled or its subscriptions don't run, agents keep working and the tree simply accumulates `proposed` documents until someone or something curates it.
- **Knowledge misses are acceptable.** Agents will sometimes miss relevant knowledge — a feature, not a bug; it's part of how new approaches get discovered. The system optimizes for relevance at context-assembly time and doesn't guarantee completeness.

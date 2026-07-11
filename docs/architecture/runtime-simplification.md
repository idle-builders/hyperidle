# Runtime Simplification Frame

This is the strategic frame for Track AU. It replaces the older Kernel/Strategy/Fabric framing with two runtime boundaries and one configuration surface.

## Boundary

HyperIdle has a core app and an agent layer.

The core app owns the user-visible product domains: Work, Conversation, Knowledge, Users, and Settings. It stores the durable records, emits domain events, exposes editing surfaces, and shows state back to humans. Knowledge is a core app domain, not a separate Fabric layer.

The agent layer owns every LLM-capable run. It accepts session requests, chooses and provisions the agent run, starts and supervises the harness, exposes tools and MCP, captures output, writes session lifecycle events, and handles the decomposition of an agent run or session into observable results. Collaboration domains do not call harnesses or provisioning internals directly.

Plugins are preconfiguration bundles, not a third runtime layer. A plugin can contribute default agents, skills, routines, triggers, tools, MCP servers, harness descriptors, and settings metadata. Once installed, those contributions appear as editable app configuration; user configuration wins over plugin defaults.

Triggers are the single rule for "event -> agent work." Any event that can cause an LLM call is triggerable. If no user or plugin trigger matches, the agent layer attaches the default eligible agent with no event-specific prompt. If a user or plugin trigger matches, it supplies the specific agent and prompt for that event.

## Durable agent handoff

Core actions first persist an `agent_work_intents` row. The row identifies one of seven work families—assistant, explicit session, knowledge, routine, decomposition, task, or re-engagement—and contains source identity plus an idempotency key. It contains no model, tool, prompt, harness, or execution result.

Explicit session starts also persist `explicit_session_starts`, the authoritative command record for requested task, agent, and model tier. The neutral intent references that row; execution choices do not leak into the shared envelope.

The agent layer reconciles pending and expired leased intents at boot, then polls for new work. It creates one correlated `AgentSessionRequest` and checkpoints the request ID. Replaying after process death returns the same request through its stable idempotency key. In-memory events only reduce wake latency; the database row is the recovery contract.

Terminal request state is persisted before `agent_run_lifecycle_changed` is published. Domain projections observe completion, failure, and cancellation through this event or the lifecycle read model, never through an execution callback.

## Current State After AU11

The production runtime no longer registers or selects an active Strategy, and it no longer imports the Fabric package or minimal Strategy package to boot product behavior. AU7 first relocated the former Fabric service bundle wholesale into `packages/server/src/app-runtime/` — a transitional third runtime owner between core app and agent layer. AU11 dissolved that shell: every responsibility now lands in its should-graph home. There is no `app-runtime/` directory, barrel, boot shell, or package export — only the two owners this frame describes, plus editable config:

- **Core app** (`packages/server/src/knowledge/`, `packages/server/src/notifications/`, and core-owned files in `packages/server/src/services/`) — knowledge storage and scoring, notifications, policy engine, review routing, lifecycle propagation, retention, git export, and the routine scheduler (cron/due-eval + `agent_work_intents` recording).
- **Agent layer** (agent-owned files in `packages/server/src/services/`, sharing the directory with core services and distinguished by ownership, not a path segment) — context assembly, session-context, writeback, file/polling watchers, roster, contracts, agent selection, task/assistant dispatchers, cost cap/sentinel, sandbox and routine-session reapers, provision registry, and the builtin-routine execution handlers.
- **Editable config** (`packages/server/src/config/`) — the builtin-routine default records (stable IDs, cron, owner roles) and git-export defaults. Their *handlers* (provisioning, dispatch) are agent-owned, per the config-vs-execution split this frame draws for plugins.

The routine scheduler is the one documented residual edge: it stays Core (cron/due-eval is a core domain concern) but its fire-time agent-selection call (`isAgentAtWipLimit` / `selectAgentByAppDefaults`) still reaches directly into the agent-owned `agent-selection.ts` module, unchanged from AU7. This is tracked as an AU8 should-graph-guard boundary item, not reopened by AU11 — folding it into the intent-worker's drain-time resolver would move fire-time selection to drain-time, a real behavior change AU11's import-path-only invariant forbids.

A single narrow exception to "no app-runtime-shaped grouping": `packages/server/src/routines.ts` is a curated public package export (`@hyperidle/server/routines`) re-exporting exactly three functions (`checkAndFireRoutine`, `provisionTeamRoutines`, `runBuiltinRoutine`) for `packages/eval`, the one legitimate cross-package consumer that cannot deep-import `src/...`. It is not a grouping barrel — the `au11-runtime-ownership-guard.ts` lint check enforces its export list stays exactly these three.

The app has the durable primitives this frame keeps: users include humans and agents, routines are editable records, knowledge is stored in canonical tables, MCP and tools run through the server runtime, harness adapters are registered centrally, and domain events are emitted. Remaining drift should be handled as boundary enforcement work (AU8's should-graph guard), not by reintroducing a third runtime owner.

## Simplification Rule

When this track is complete:

- There is no Fabric runtime layer or Strategy concept.
- Core app domains do not know how an agent run is executed.
- The agent layer is the only owner of LLM execution.
- Triggers, routines, agents, skills, tools, and MCP are editable configuration in the app.
- Plugins only seed and extend that configuration; they do not become hidden global brains.

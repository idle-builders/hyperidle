# Runtime Simplification Frame

This is the strategic frame for Track AU. It replaces the older Kernel/Strategy/Fabric framing with two runtime boundaries and one configuration surface.

## Applications, Layers, and Services (2026-07-13 — AU19 frame)

**Supersedes the rest of this document for structural/package purposes.** The *behavioral* contract
below (which responsibilities belong to core app vs. agent layer) is unchanged — this section adds
the physical structure that enforces it, replacing AU17's founder-rejected two-package design (which
got the package boundary right but left each new package's internals as a flat, undifferentiated
`services/` dump instead of a real domain structure).

**Applications** — deployment units. Each Application bootstraps and composes one or more Layers
into a running process. An Application contains only wiring/bootstrap code, never business logic.

- `desktop` — Electron shell; composes `core-ui` + `core-api` + `agent-orchestration` +
  `agent-execution`, all embedded in one process, for laptop-solo mode. The only Application that
  composes `agent-execution` in-process — every other topology runs it as a separate `remote-worker`.
- `remote-server` — headless host process; composes `core-api` + `agent-orchestration` **only**.
  **Never composes `agent-execution`, unconditionally** — even a single-host shared-backend
  deployment runs execution as a separate `remote-worker` process (colocated or not), not embedded
  in `remote-server` itself. (Founder correction, 2026-07-13: the original draft of this frame had
  `agent-execution` as conditional on `remote-server` — wrong; the split is structural, not
  topology-dependent.)
- `ui` — the web frontend; composes `core-ui` only, talking to a remote `core-api` over HTTP/WS.
- `remote-worker` — composes `agent-execution` only; receives dispatched work from a remote
  `agent-orchestration` layer over the existing worker-ws/remote-harness-adapter channel (already
  built, zero DB coupling — confirmed by AU17's own topology research).

**Layers** — communication-pattern boundaries. A Layer may depend only on Layers/Services below it
in the stack; never sideways, never up. This refines the old two-tier "core app / agent layer" split
into four:

- `core-ui` — presentation (React components, pages, stories).
- `core-api` — HTTP surface + core domain orchestration; calls Services, never a table directly.
- `agent-orchestration` — trigger resolution, session request queue, run admission/custody,
  lifecycle projection, **context assembly and capture/writeback against Knowledge**. Decides *that*
  and *when* an agent run happens, and prepares/consumes everything a run needs *before/after*
  handing off to execution; never touches an LLM CLI, harness adapter, or MCP server directly.
  Always colocated with `core-api` in the same process today (every Application that composes one
  composes both). **Resolved by AU21 (`.pipeline/work/AU21/architecture.md`): bake-at-emit +
  agent-self-recovery + format-only orchestration.** `core-api` resolves and BAKES everything a run
  needs onto the emitted request at emit time (the target agent, its full config, the assembled
  session context/knowledge, the transcript where relevant) — `agent-orchestration` never reads core
  domain state back to build a session, not through a location-transparent seam, not through
  colocated DI, not at all. It claims the baked request, formats it into harness input, and dispatches
  — a pure transformation, zero core-api reads or writes. If the agent needs live detail beyond what
  was baked, it recovers it itself, live, via its OWN `CoreApiPort` MCP tools during the run — exactly
  the same seam a human UI client uses, "agent-as-user" (Decision A/C). Failures report back via
  explicit domain events (`AgentRunAdmissionFailedEvent`, session lifecycle events) that core-api
  subscribes to and reacts to; `agent-orchestration` is a blind, purely request-driven executor — it
  holds no mechanism, live or pushed, to learn about a core-side state change it did not itself
  request (Decision H/§12: the emit→deactivate→drain race needs no re-check and no push, because if
  an agent is deactivated core simply never sends it a new request). Mechanically enforced by
  `scripts/composition-edge-anti-regrowth-guard.ts`, wired into `npm run lint` as a hard failure.
- `agent-execution` — harness adapters, MCP, tool execution. **The only Layer permitted to invoke an
  LLM CLI, harness adapter, or MCP server — and the only Layer with zero Service/table access of any
  kind, including `knowledge`.** (Founder correction, 2026-07-13: the original draft gave
  `agent-execution` a `knowledge` edge for context providers/capture-writeback — wrong; that work
  belongs to `agent-orchestration`, which runs colocated with the database. `agent-execution` runs on
  a `remote-worker`, which may be a genuinely separate machine with no DB credentials at all —
  consistent with AU17's own finding that `worker-ws.ts`/`remote-harness-adapter.ts` already import
  nothing from `@hyperidle/db`. `agent-execution` receives an assembled context bundle and returns
  raw run output over the existing worker channel; it never queries a table itself.)

**Services (Domains)** — a bounded unit of functionality with a clear interface. **Every Layer
decomposes into Services, not just `core-api`** (founder correction, 2026-07-13: the first draft of
this frame limited "Service" to the seven SQL-table owners and implied it was a `core-api`-only
concept — too narrow. The naming itself is open: "Service" and "Domain" are both live candidates;
`/refine` should settle it). A Service that owns a SQL table is additionally ACL-enforced — the sole
code path permitted to read or write that table — but owning a table is not what makes something a
Service; having a clear interface is. This list is pulled from the as-should graph
(`plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`'s "As-Should Graph" +
"Detailed Comparison" tables) and AU12–AU18's real owning modules — **treat it as a floor, not a
ceiling**; `/architecture` will find more when it does the real file-by-file pass, the same way
AU17's own audit found 7x more files than its spec estimated:

- **`core-api` Services (SQL-owning, Table-ACL-enforced):** `work` (bets/tasks/items),
  `conversation` (threads/messages), `knowledge` (knowledgeItems), `users`, `settings`
  (server_config), `notifications` (notificationQueue), `routine` (routines/routine_runs).
- **`agent-orchestration` Services (not SQL-owning — call into `core-api`'s Services, e.g.
  `knowledge`, when they need one):** `trigger-resolution`, `session-requests` (the request queue),
  `run-orchestration` (admission/custody — `agent-run-boundary.ts`/`agent-session-runtime.ts`),
  `lifecycle-projection`, `agent-selection`/roster, `context-assembly`, `capture-writeback`, `cost`
  (cost-cap/cost-sentinel), `dispatch` (task/assistant dispatchers, routine-scheduler,
  builtin-routine-handlers), `session-lifecycle`/provisioning.
- **`agent-execution` Services (not SQL-owning, zero DB access):** `harness-registry`,
  `tool-provider`, `mcp-provider`.
- **`core-ui` Services — open question, not yet decided.** Whether `packages/web` should be
  organized into the same Service/Domain names (a `work/` UI folder alongside the `work` Service, a
  `knowledge/` UI folder alongside `knowledge`, etc.) instead of its current
  page/component-type structure is a real idea raised in review, but it's a bigger, separate
  question — `packages/web` is large and was never in AU17's scope at all. `/refine` must decide
  whether this WP takes a position on `core-ui`'s internal structure or explicitly defers it.

A Layer calls a Service through its exported interface; it never queries a table a Service doesn't
own. Only Services that own a table hold a Service reference to it — `agent-orchestration`'s own
Services call `core-api`'s `knowledge` Service when they need it (e.g. `context-assembly` reading
Knowledge to build a run's context bundle) rather than touching the table themselves.
`agent-execution`'s Services hold no Service reference of any kind, consistent with zero DB access.

**Package granularity — one npm workspace package per Service (2026-07-13, founder-settled).**
Resolved in favor of a real package per Service, nested under its owning Layer's directory
(`packages/<layer>/<service>/`, e.g. `packages/core-api/knowledge/`,
`packages/agent-orchestration/context-assembly/`), not a shared folder inside 4 monolithic Layer
packages. Both options were weighed:

- **Folder-per-Service inside 4 Layer packages** (the original draft of this frame) keeps Table ACL
  as a pure guard concern and Layer/execution boundary as the only `tsc`-enforced edge. Cheaper —
  4 packages instead of ~20-25 — but repeats the exact failure mode this session hit twice building
  AU17: a hand-maintained scan-root/ownership-list guard silently goes blind when files move and
  nobody re-roots it (7 guards missed round 1, 2 more round 2, 2 more found only by the builder). A
  guard is a promise someone kept the map current; a package boundary is a fact `tsc` checks on
  every build, unconditionally, with no map to go stale.
- **Package-per-Service** (chosen) additionally *strengthens* Table ACL rather than leaving it purely
  to a guard: if a Service's `index.ts` barrel never exports its raw Drizzle table object — only
  typed functions (`getBetById`, `createBet`, ...), the exact discipline AU12/13's owning modules
  already follow — then no other package can ever obtain a reference to that table, full stop,
  because packages can only import what's exported. The remaining guard shrinks to one check per
  Service ("does this package's own barrel export a table object — yes/no"), not a tree-wide scan
  with a scan-root to keep in sync.

**Two-level package hierarchy:**
- **4 Layer packages** (`@hyperidle/core-ui`, `@hyperidle/core-api`, `@hyperidle/agent-orchestration`,
  `@hyperidle/agent-execution`) are thin composition barrels: they depend on their own Layer's Service
  packages (nothing more) and re-export each Service's public surface. Applications import from these,
  matching the Composition tier already defined above. A Layer package's own `dependencies` list is
  the single place Mechanism 2 below checks "does this Layer reach anything from a Layer above it."
- **~20-25 Service packages**, nested one directory under their Layer (`packages/<layer>/<service>/`),
  hold the real implementation: `src/index.ts` (public barrel, functions only, never a raw table
  object for SQL-owning Services), `src/*.ts` implementation, `src/__tests__/*.test.ts`, and any
  private `src/lib/`/internal helpers a Service needs — resolving the "a domain also has tests and
  utils, it can't be one file" concern directly: a package is a bounded unit, not a single file: it
  holds as many files as the Service needs, all private by default unless the barrel exports them.
- `package.json`'s root `workspaces` glob needs `"packages/*/*"` added alongside the existing
  `"packages/*"` to pick up the nested Service packages (standard npm workspaces feature, no tooling
  change beyond the glob).

**Enforcement mechanism (AU19's job, not yet built):**

1. **Table ACL** — now two tiers instead of one guard: (a) *structural* — a SQL-owning Service's
   barrel never exports its raw table object, so no other package can reach it, checked per-package
   at build/lint time on that one file, no scan-root to go stale; (b) *residual guard* — one small,
   general, declarative check (does any package's barrel export a raw Drizzle table type) replacing
   the 9 separate hand-typed per-domain scan scripts AU12–AU18 each wrote independently.
2. **Layer/execution boundary** — Applications compose Layer packages, and Layer packages compose
   Service packages, both real `tsc`-module-resolution-enforced package boundaries (the technique
   AU17 already proved works, now applied one level deeper); only `agent-execution`'s Service packages
   may import an LLM-CLI/harness/MCP/tool-execution symbol — every other package is structurally
   forbidden from that surface, because it isn't a dependency of any Service package that imports it.
3. **Composition boundary — Services never import Services (2026-07-13, founder-added).** A Service
   package's `dependencies` may only ever be `@hyperidle/db` and `@hyperidle/shared` (plus a narrow
   shared "ports/contracts" package of TypeScript interfaces, if `/architecture` decides one is
   needed) — **never another Service package, and never a Layer package.** This closes the gap the
   other two mechanisms leave open: Mechanism 2 only names one forbidden *capability*
   (LLM-CLI/harness/MCP access); nothing before this stopped, say, `work` importing `conversation`
   directly, or `core-ui` importing `agent-execution`'s `harness-registry` for a non-execution reason.
   Composition — one Service's output feeding another Service's input — is never a Service's own job.
   It recurses the same rule `Applications` already had ("contains only bootstrap/wiring code, never
   business logic") one level down at each tier:
   - A **Service** does no composition. If `context-assembly` (an `agent-orchestration` Service) needs
     Knowledge, it takes a `KnowledgeReader` as a parameter — it does not import `@hyperidle/knowledge`
     itself.
   - A **Layer package** composes its own Services, and — if it needs a Service that belongs to a
     Layer below it — composes across that boundary too. `agent-orchestration`'s Layer package is the
     one that imports both `context-assembly` and `core-api`'s `knowledge`, and wires the concrete
     `knowledge` reader into `context-assembly`'s parameter. This is not a new pattern invented for
     AU19: it's the same shape the AU12/13 "decompose the cross-owned join" precedent already used —
     `findRetroItemByThreadIds` (owned by `work`) plus a caller-side `getThreadIdsByHost` (owned by
     `conversation`) were combined by the *route handler* (`core-api` Layer code), not by one Service
     importing the other. This mechanism makes that pattern mandatory everywhere, not something a
     reviewer has to notice case by case.
   - An **Application** composes Layers, same as already defined above — including choosing *which*
     concrete implementation of a cross-process boundary to wire in (e.g. `desktop` wires
     `agent-orchestration` directly to an in-process `agent-execution`; `remote-server` wires it to a
     `remote-worker` WebSocket client instead — the same `worker-ws.ts`/`remote-harness-adapter.ts`
     pattern that already exists today, now formalized as "only an Application may choose this," never
     a Layer or a Service).
   - **Enforcement**: the same `tsc`-negative-case technique as Mechanisms 1 and 2, scoped to a third
     edge class — a Service package listing another Service package (or a Layer package) in its own
     `dependencies` fails to resolve, structurally, no new guard type needed.
   - **Real cost, stated plainly**: every place in the current codebase where one Service-shaped module
     directly calls another's exported function (not just the ACL-relevant table joins — ordinary
     composition too) needs to become a dependency-injected parameter instead. Expect this to surface
     a meaningful amount of previously-invisible coupling once `/architecture` enumerates it — that's
     the point, not a side effect to minimize.

**AU8 and AU17 are retired, both superseded by AU19** (`.pipeline/work-packages/TRACK-AU.md`). AU8's
goal — one general ownership guard instead of many hand-typed ones — is subsumed into AU19's Table
ACL mechanism above. AU17's package-boundary technique is reused, but the internal shape it produced
(flat `services/`) is discarded in favor of the Layer/Service structure this section defines.

## Boundary (superseded above for structural purposes; behavioral contract still accurate)

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

Dispatch now exposes one bound `dispatchOps` object from the composition root. Eval and core callers use its coherent `fireRoutine`, `provisionTeamRoutines`, and lifecycle methods instead of a curated barrel of standalone routine functions.

The app has the durable primitives this frame keeps: users include humans and agents, routines are editable records, knowledge is stored in canonical tables, MCP and tools run through the server runtime, harness adapters are registered centrally, and domain events are emitted. Remaining drift should be handled as boundary enforcement work (AU8's should-graph guard), not by reintroducing a third runtime owner.

## Simplification Rule

When this track is complete:

- There is no Fabric runtime layer or Strategy concept.
- Core app domains do not know how an agent run is executed.
- The agent layer is the only owner of LLM execution.
- Triggers, routines, agents, skills, tools, and MCP are editable configuration in the app.
- Plugins only seed and extend that configuration; they do not become hidden global brains.

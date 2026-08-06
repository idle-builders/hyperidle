# Runtime Simplification Frame

> **Superseded on boundary rules.** This document's dependency rule — "a Layer may depend on the Layers below it" — and its cross-Layer dependency-injection pattern are both overturned. Dependency injection is legal only *within* a Layer; a Layer imports only from `shared` or from within itself; cross-Layer conversation goes through the API, MCP or the event bus. What may cross which boundary is machine-enforced and documented once, in [`governance/README.md`](../../governance/README.md) — read that, not this. The rest of this document (the Application / Layer / Service vocabulary, the behavioral split between core app and agent layer) still holds.

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

**Layers** — communication-pattern boundaries. A Layer is isolated: it imports only from `shared` or
from within itself, and reaches another Layer through the API, MCP or the event bus. The enforced
rule set is [`governance/README.md`](../../governance/README.md). This refines the old two-tier
"core app / agent layer" split into four:

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
  `scripts/governance-lint.ts`, wired into `npm run lint`.
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
Service; having a clear interface is. A Service is a directory under its Layer — run
`ls layers/*/` for the live set rather than trusting a list here. As of this writing:

- **`core-api` Services:** `connections`, `conversation`, `credentials`, `filesystems`,
  `git-export`, `knowledge`, `notifications`, `observability`, `org`, `policy`, `realtime`,
  `review`, `routine`, `settings`, `users`, `work`.
- **`agent-orchestration` Services:** `agent-run-config`, `connections`, `dispatch`,
  `filesystem-mounting`, `filesystems`, `run-orchestration`, `session-requests`, `tool-handlers`.
- **`agent-execution` Services (zero DB access):** `harness-registry`.
- **`core-ui` Services — open question, not yet decided.** Whether `layers/core-ui` should be
  organized into the same Service/Domain names (a `work/` UI folder alongside the `work` Service, a
  `knowledge/` UI folder alongside `knowledge`, etc.) instead of its current
  page/component-type structure is a real idea raised in review, but it's a bigger, separate
  question — `core-ui` is large and was never in AU17's scope at all. It has no nested Service
  packages today.

A Layer calls a Service through its exported interface; it never queries a table a Service doesn't
own. Only Services that own a table hold a Service reference to it — `agent-orchestration`'s own
Services call `core-api`'s `knowledge` Service when they need it (e.g. `context-assembly` reading
Knowledge to build a run's context bundle) rather than touching the table themselves.
`agent-execution`'s Services hold no Service reference of any kind, consistent with zero DB access.

**Package granularity — one npm workspace package per Service (2026-07-13, founder-settled).**
Resolved in favor of a real package per Service, nested under its owning Layer's directory
(`layers/<layer>/<service>/`, e.g. `layers/core-api/knowledge/`,
`layers/agent-orchestration/run-orchestration/`), not a shared folder inside 4 monolithic Layer
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
- **Service packages**, nested one directory under their Layer (`layers/<layer>/<service>/`),
  hold the real implementation: `src/index.ts` (public barrel, functions only, never a raw table
  object for SQL-owning Services), `src/*.ts` implementation, `src/__tests__/*.test.ts`, and any
  private internal helpers a Service needs — resolving the "a domain also has tests and
  utils, it can't be one file" concern directly: a package is a bounded unit, not a single file: it
  holds as many files as the Service needs, all private by default unless the barrel exports them.
- `package.json`'s root `workspaces` globs are `layers/*`, `layers/*/*`, `framework/*`,
  `applications/*` and `tools/*`; the second one picks up the nested Service packages.

**Enforcement.** Two things carry it: the package boundary itself (a package can only import what
another package exports, and `tsc` checks that on every build) and `scripts/governance-lint.ts`,
which decides every crossing the package graph cannot. What each role may cross, and why, is stated
once in [`governance/README.md`](../../governance/README.md) — do not look for a second copy, and do
not infer a rule from the imports in the code around you.

The structural half is worth naming because it is free: a Service that owns a SQL table never
exports the raw Drizzle table object from its barrel, only typed functions. No other package can
then obtain a reference to that table at all. An **Application** is also the only tier that chooses
which concrete implementation of a cross-process boundary to wire in — `desktop` runs
`agent-execution` in-process; `remote-server` reaches a `remote-worker` over the worker WebSocket
channel (`layers/agent-orchestration/run-orchestration/src/worker-ingress.ts`,
`layers/agent-execution/harness-registry/src/remote-harness-adapter.ts`) — never a Layer or a
Service.

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

## Current state

There is no Strategy registry and no Fabric package. Every responsibility this frame describes lives
in a Layer's Service directory, listed above.

Core-owned work — knowledge storage and scoring, notifications, policy, review routing, lifecycle
propagation, the routine scheduler — sits in `layers/core-api/<service>/`. Agent-owned work — run
admission and custody, context and capture, watchers, dispatch — sits in
`layers/agent-orchestration/<service>/`. Harness adapters, MCP and tool execution sit in
`layers/agent-execution/harness-registry/`.

Routine-firing lives in `layers/core-api/src/services/routine-scheduler-bindings.ts`'s `fireRoutine`,
with `provisionTeamRoutines` in `@hyperidle/routine` — both re-exported through `core-api`'s
`routines.ts` for cross-package callers, instead of a curated barrel of standalone routine functions.

The app has the durable primitives this frame keeps: users include humans and agents, routines are
editable records, knowledge is stored in canonical tables, MCP and tools run through
`agent-execution`, harness adapters are registered centrally, and domain events are emitted.

## Simplification Rule

When this track is complete:

- There is no Fabric runtime layer or Strategy concept.
- Core app domains do not know how an agent run is executed.
- The agent layer is the only owner of LLM execution.
- Triggers, routines, agents, skills, tools, and MCP are editable configuration in the app.
- Plugins only seed and extend that configuration; they do not become hidden global brains.

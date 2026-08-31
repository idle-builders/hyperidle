# AU21 — Seam the core-api ↔ agent-orchestration boundary; resolve agent-to-core coupling against it

**Status: not done.** Increments 0–13 have landed and CI is green; Increment 14 (Decision L) remains.

## What we need

`agent-orchestration → core-api` is the one Layer boundary in the system without a location-transparent
seam. The other three have one: `core-ui → core-api` (type-only RPC client), `agent-orchestration →
agent-execution` (`HarnessPort` — one Application-injected interface, in-process today, remote-capable
without a Service rewrite), and `core-api → agent-orchestration` against-grain (EventBus, or a named
permanent exception, never raw DI), which stays disciplined because a direct import fails to compile.
Downward, nothing pushes back: it is ordinary legal DI, so any orchestration Service can wire itself to
as many core-api Services as it likes and nobody has to ask whether the wire earns its keep — 45
Service-pair edges and 112 individually-challenged capabilities (49 justified / 52 questionable / 11
unjustified) at the start of this work. Legality is not legitimacy, and re-justifying edges one at a time
does not stop the next batch accumulating the same way. The fix is structural: give this direction the
same seam discipline, make the **clean loop** real in code, then judge every edge against the seam rule —
so the standing question becomes "does this go through the seam, ride the event payload, or meet the
permanent-exception bar?" rather than "is this edge individually justified?"

Done means: the seam exists and is the default way to cross; the clean loop runs end to end for
core-initiated agent work; every non-cleanly-justified edge has a disposition that survives the same
adversarial challenge the first pass applied; the dependency-graph baseline is regenerated with a
distinct edge type for seam calls versus raw DI; AU19's five permanent against-grain DI ports and three
EventBus inversions are not silently reopened; and a documented practice keeps the reduction from
regrowing. **Decision L (founder, 2026-08-03) raised the bar to genuinely zero:** *"as long as there is
any exception I don't think AU21 is done."* No allowlist, no stateless-provider or method carve-out; the
only shape that stays legal is the running agent acting like a user through the `CoreApiPort` seam, which
is not an orchestration decision-read.

No product behavior changes except where a named verified bug is fixed or confirmed-dead capability
removed; every removed edge must have its need served some other way, proven by tests. The seam must not
force a network hop where none exists — `desktop` keeps all four Layers in one process, so the seam is a
typed interface plus an Application-time wiring choice. Out of scope: the per-Service exposed-API audit
(AU20); reopening AU19's own rulings; redesigning `HarnessPort`; a per-agent authorization layer over the
now-unified write door; any UI-facing change.

## How it works

**The clean loop.** A core-api Service that needs an agent validates its own state and resolves the run
*at emit time* — agent identity and correlation, with the `ast-<userId>` assistant agent validated as a
real runnable AI rather than the human sender — and enqueues a fully baked request through the
against-grain `AgentWorkIntentRecorder` port. Orchestration claims and writes only its own dedup rows,
dispatches the baked request as given, and builds and deploys the session via `HarnessPort`. Execution
runs it. The running agent pulls current reality live over MCP through `CoreApiPort`, adjusting or
reporting the request stale if reality contradicts its instructions, and any write back to core-owned
data goes through the same route and middleware `core-ui` uses.

The hard rule that falls out: **any orchestration read of core-api domain state to make its own decision
is a defect.** Only four shapes are legal — core bakes at emit; orchestration acts on its own state plus
the baked request; the agent reads live through the seam like a user; a failure is reported by event and
the re-decision belongs to core.

**Failures come back on two explicit channels.** Pre-handoff — bad payload, max attempts, provisioning
failure, target agent not runnable — emits `agent_run_admission_failed`, and core-api Services finalize
their own state and decide retry or abandon. Post-session failures ride the existing `session_ended` /
`agent_run_lifecycle_changed`. Retry means core re-validates and pushes a fresh baked request; nowhere
does orchestration ask core a question.

**Facts that change while work is outstanding are pushed, never pulled.** Core re-emits the request; from
its own state orchestration either supersedes a not-yet-started request (freshest payload wins) or
delivers on the next turn as a follow-up session. Realtime works the same way: core pushes the changed
record and the client never re-reads. A value baked at emit that is stale by one already-authorized run
is accepted — orchestration acts only on what core sent, and core stops sending when it wants to stop.

**The mechanical graph was blind** to reads reaching core through composition bundles rather than declared
ports: a scanner folded into the graph generator and the anti-regrowth guard found 37 real edges where the
graph saw 15. The guard classifies edges by kind, not purpose, so a decision-read riding the `CoreApiPort`
seam can still hide from it — an accepted limitation.

Three durable rulings from the same pass. **Cost was never a real enforcement boundary** — the spend
ceiling lives at the upstream LLM account and HyperIdle's cap gate was lightweight informational
accounting, so blowing past a locally tracked cap is harmless; it is deleted outright, and every prior
note calling its allowlist rows "founder-signed" was wrong. **`model-gateway` is a pure function, not a
Service** — zero tables, types already in `@hyperidle/shared`. **`routeItem` is vestigial** — nothing
reads the `view` it returns and core already abandoned item routing, so deleting it completes that
removal rather than fulfilling the still-documented F-6.1 requirement.

## How we work on this

Each increment is an independently shippable cycle — tests red, code green, review, verify, clean commit
— with a fresh agent and `main` green between them. Increments 0–13 landed the seam and its contract-test
harness, `tool-handlers` and `dispatch` routed through it, resolve-at-emit with the drain collapsed to
claim-and-dispatch, the routine collapse and dispatch untangle, the realtime relocation of session
streaming, and the anti-regrowth guard promoted to a hard lint failure.

Increment 14 remains, in five sub-increments. **14a** hard-delete cost repo-wide, including a migration
dropping every cost column — done when a case-insensitive repo-wide grep returns no domain-meaningful
hits, every survivor individually justified with the founder. **14b** move `resolveModel` into
`@hyperidle/shared` and dissolve `model-gateway`. **14c** delete `route_item`, the `create_item` `view`
output, `item-router.ts` and the eval scenario, and reconcile the stale F-6.1 docs.
**14d** retire the generic `BROADCAST_ROUTES` forwarder, keep the WS transport the session stream needs,
re-home each domain's signal as a push of the changed record. **14e** delete the exemption apparatus so
the guard fails on any orchestration→core edge that is not an agent-as-user seam call, and re-baseline.

Named follow-ups, deliberately not folded in: true mid-run injection into a live harness session (blocked
— CLI adapters spawn with stdin closed by design); the cross-layer settings reorg, dependent on
`AgentOrchestrationPort` and needing its own design pass; MCP tool-call *response* streaming, parked
undecided; resumable harness sessions, which do not exist yet; and rebuilding lightweight cost accounting
from scratch, if it is ever wanted.

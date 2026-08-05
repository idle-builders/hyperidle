# AU31 — Only a composition root reaches across a layer, and only as far as its public face

## Work package

**Work package.** As a maintainer, I want cross-layer conversation to happen exclusively through the API, MCP or the bus — with the applications composing layers by their public faces and no layer naming another layer's insides — so that the boundary AU21 established in one direction holds in every direction. Today `core-api` imports thirty-six symbols directly out of `agent-orchestration`'s and `agent-execution`'s services, injects fourteen functions across the same boundary, and declares the dependency in its own manifest; `remote-server` composes by naming thirteen services rather than the two layer faces; `desktop` reaches into `remote-server`; and the MCP router is dialled from an application because `agent-execution` hosts no app of its own. When this ships, a layer's package manifest names no other layer, the applications name only layer faces, and the router is dialled only by the layer that owns the harness relationship.

**Why this matters.** AU21 closed `agent-orchestration → core-api` and proved the mechanism: core bakes what a run needs and emits; orchestration is a blind, request-driven executor. The reverse direction was never checked and never closed — `core-api`'s routes and reactors still reach sideways into `session-requests` (12 sites), `agent-run-config` (7), `run-orchestration` (6), `harness-registry` (5) and `tool-handlers` (2). The maintainer's cost of not fixing this is concrete and already paid once: AU21's guard reported zero findings for months while half the boundary was unguarded, and the same is true of every architectural claim made about this boundary since. This is also the largest single group of production violations — 89 of 221 — and the one whose fix is genuine architecture rather than placement.

**Type.** backend / infra.

**What exists today.** AU26 shipped (`f484b295`) and gave `agent-orchestration` its own Hono app, moving composition to the application tier; AU21 shipped the bake-at-emit mechanism, the `CoreApiPort`/`AgentOrchestrationPort` seam, and Increment 14's removal of every guard exemption. What neither closed is the forward direction. `layers/core-api/src/services/run-orchestration-composition.ts` and `layers/core-api/src/service-bootstrap.ts` are composition code still living inside a layer. `layers/core-api/src/app.ts:494`, `routes/bets.ts:684`, `routes/tasks.ts:254`, `routes/threads.ts:1678`, `routes/org.ts:306`, `service-bootstrap.ts:330,470` and `services/agent-run-admission-reactions.ts:115` inject across the boundary — chiefly `enqueueWorkIntent` from `session-requests` (5 sites). `applications/remote-server/src/create-server.ts` names 13 services at lines 34–109 and dials `createMcpToolBridge` at 551. `layers/agent-orchestration/run-orchestration/src/provisioner.ts` builds an `/api/mcp/` URL inline at 1349 and opens a router session at 1327, against a layer that hosts no HTTP API. `layers/core-api/package.json` declares `@hyperidle/agent-orchestration`; `layers/agent-orchestration/package.json` declares `@hyperidle/agent-execution`. The rule the model already states: cross-layer conversation goes through the API, MCP or the bus — dependency injection is legal only within a layer.

**What's genuinely missing.** For each of the five reached-into services, the legal replacement mechanism has not been chosen — `enqueueWorkIntent` is plainly an emit under AU21's own doctrine, but `agent-run-config`'s seven read sites and `harness-registry`'s five are not obviously events, an API, or a sign the service is in the wrong layer. That choice per service is the substance of this work package. `agent-execution` also has no app of its own, so the MCP router has nowhere legal to be dialled from.

**Depends on.** None. AU21 and AU26 are merged and are in this branch's base. Independent of AU29 and AU30 — no shared files.

**Complexity.** L

**Engineering tier.** production — live request paths in a shipped system.

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first. Two nouns are unsettled and both are load-bearing. **`session-requests`**: core-api writes into it from seven places, which is at least as consistent with "it is core's intake queue in the wrong layer" as with "core should be emitting" — apply AU26's own domain test rather than assuming the mechanism. **A layer's public face**: what an application is allowed to see when it composes a layer has never been written down, and the applications currently see everything.
- **Design:** Not required — backend/infra, no UI surface.

**Human review gates.** Yes — mandatory for every work package. Load-bearing here: the founder has stated this rule in absolute terms ("DI imports across layers are absolutely forbidden. zero exceptions"), and the same discipline AU21's Decision L received applies — architecture, independent critique, founder review, before any code moves.

**Plan calls.** Multi-version exploration on the mechanism, not one pass. Resolve each of the five reached-into services separately — emit, API, MCP, or relocate — and say which and why per service; a single blanket answer is the failure mode here. `/architecture` may well split this into two or three work packages once the per-service verdicts are in, and that is expected rather than a plan failure. Verify against the live tree before planning: AU26 moved real code and the `layers/core-api/connections` and `layers/agent-orchestration/connections` packages both exist today, which needs explaining before anything is built on top of it.

**Contracts / constraints.**
- Zero exceptions. No allowlist, no stateless-provider carve-out, no named method exemption — AU21's Decision L already overturned exactly that apparatus once and it does not come back.
- The end state is stated as the end state. No transitional facade, no "temporary" cross-layer import.
- A layer's package manifest names no other layer or another layer's service.
- Composition roots reach a layer's public face only — never a service, never another application.
- No production export may be added that only tests consume.
- Every baseline entry cleared is deleted from `governance/baseline.json`, never re-tagged.

**Out of scope.**
- Whether `connections`, `filesystems` or any other domain sits in the right layer — AU26's axis, already shipped; reopen only if this work package's own evidence forces it, and then as a finding, not a silent fix.
- Table ownership — AU30.
- The development world — AU32.

**Effort.** L (~5d)

## Acceptance criteria

- No layer names another layer, or another layer's service, in its imports or its package manifest.
- No function crosses a layer boundary by injection; every cross-layer conversation happens through the API, MCP or the bus.
- An application composes layers by their public faces only, and names no service and no other application.
- The MCP router is dialled only by the layer that owns the harness relationship and by the harness, and the layer serving it hosts the API being dialled.
- Every composition-root, cross-layer-import, cross-layer-DI, MCP and API entry is gone from `governance/baseline.json`, and those rules fail the build on reappearance.
- `npm run verify` is green and a real agent run completes end to end — proven by executing one, not by reading the code.

## Validation scenarios

**Given** the governance lint runs over the live tree, **when** it reports, **then** no production violation remains in any `layer → layer`, `layer → service (other layer)`, `application → service`, `application → application`, `di`, `mcp` or `api` group.

**Given** a developer adds `import { x } from "@hyperidle/session-requests"` to a file in `layers/core-api`, **when** `npm run lint` runs, **then** the build fails naming the file and the import.

**Given** a developer passes a function from one layer into a constructor in another, **when** `npm run lint` runs, **then** the build fails naming both packages and the symbol.

**Given** the application boots and a task-backed agent run is dispatched, **when** the run completes, **then** the work intent reached `session-requests`, the harness executed, and the result landed — with no cross-layer import anywhere in the path.

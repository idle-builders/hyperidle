# AU31 — Only a composition root reaches across a layer, and only as far as its public face

## What we need

As a maintainer, I want cross-layer conversation to happen exclusively through the API, MCP or the bus — with the applications composing layers by their public faces and no layer naming another layer's insides — so that the boundary AU21 established in one direction holds in every direction.

AU21 closed `agent-orchestration → core-api` and proved the mechanism: core bakes what a run needs and emits; orchestration is a blind, request-driven executor. The reverse direction was never checked and never closed. `core-api` imported thirty-six symbols straight out of the agent layers' services, injected fourteen functions across the same boundary, and declared the dependency in its own manifest; `remote-server` composed by naming thirteen services rather than layer faces; `desktop` reached into `remote-server`; and the MCP router was dialled from an application because `agent-execution` hosted no face of its own. The cost of leaving it was concrete and had already been paid once: AU21's guard reported zero findings for months while half the boundary was unguarded, and the same was true of every architectural claim made about this boundary since. It was also the largest single group of production violations.

Done meant:

- No layer names another layer, or another layer's service, in its imports or its package manifest.
- No function crosses a layer boundary by injection; every cross-layer conversation goes through the API, MCP or the bus.
- An application composes layers by their public faces only, and names no service and no other application.
- The MCP router is dialled only by the layer that owns the harness relationship and by the harness, and the layer serving it hosts the API being dialled.
- Every rule key this work cleared is deleted from the severity dial in the same pull request, so those rules are at error from that commit.
- `npm run verify` is green and a real agent run completes end to end — proven by executing one.

Zero exceptions: no allowlist, no stateless-provider carve-out, no named-method exemption. The end state is stated as the end state — no transitional facade, no temporary cross-layer import, no phase one. AU21's Decision L already overturned exactly that apparatus once and it does not come back.

Boundary: whether `connections`, `filesystems` or any other domain sits in the right layer is AU26's axis and stays shipped; table ownership is AU30; the development world is AU32.

## How it works

Core-api converses with the agent layers only through agent-orchestration's own HTTP app, dialled over the `AgentOrchestrationPort` seam. Results and lifecycle flow back the way they already did — bus events core subscribes to, and agent tool calls through core's API — so nothing changed on the return path.

Six services were reached into, and each got its own verdict; a single blanket answer was the identified failure mode.

- **`session-requests` — API for the conversation, relocate the wiring.** Submitting a work intent, starting an explicit session, requesting termination and reading a request's status became operations on orchestration's app. The emit stays the durable intake write: the handler runs it inside orchestration's own transaction, so the durability is byte-identical and only the doorway changed. Not the bus, because an emit is not durable and returns nothing while two call sites need the created intent back synchronously. Not relocation, because that reopens AU21's zero-read end state. The in-process abort registry never crosses — it is meaningless outside the layer that runs sessions, so aborting is an implementation detail of the termination op.
- **`agent-run-config` — API.** The admin routes stay core-hosted, because every write route gates on `users`, a core table, and moving them would make orchestration read core state. Only the persistence spelling changed, to port read/readBatch/write ops. The drain read relocated in-layer with the composition.
- **`run-orchestration` — API for the lifecycle verbs; relocate the composition and the tooling entry.** This supersedes AU26's ruling that the door stays read-only: the downward call is now the forbidden crossing, and the port is core's one door in both directions.
- **`harness-registry` — relocate behind faces.** `layer → agent-execution [api]` is forbidden, so the execution relationship rides the composition contract instead: orchestration receives adapter construction, return enforcement and harness provisioning as opaque, shared-typed runtime adapters supplied by the application.
- **`tool-handlers` — the wrapper file dies** and the dispatch moves to the definitions; the one core-owned port becomes an API call.
- **`filesystems` — API.**

`agent-execution` grew a genuine face — `bootAgentExecution` — owning the adapter pool, sandbox adapters, the return-enforcement registry, the MCP bridge and its router, and harness-environment provisioning. The MCP dial folded into `harness-registry`'s own session provisioning, which is the only actor with an allowed MCP row: it mints the token, writes the config, exposes the URL and closes on session end. The application now mounts a face handle rather than importing the router.

Each application boots `bootAgentExecution` → `bootCoreApi` → `bootAgentOrchestration`, mounts, listens, disposes. The application mediates every cross-face handoff; no layer imports another. `desktop` has its own composition root and no longer imports `remote-server`. The middleware and mount ordering, which probes showed is fragile, lives in a layer-blind Hono helper in the framework package — it names no layer.

The face is enforced two ways. Each layer's manifest export map shrank (core-api ends at `.`, `./boot` and `./app`), so Node's own encapsulation makes a deep service-path import fail to resolve — the least gameable teeth available. On top of that sit three census rules — exports must resolve inside the layer, service values must not escape the face, deep imports die with their entries — each shipped with a positive attack and a control twin.

Nine transactions committed a core write together with an agent-orchestration write. One rule applies to all of them: the core transaction commits, the seam call follows, and a seam failure surfaces as the operation's own failure with the core rows committed and the queued job missing. The window is named in code at every site. No outbox, no saga, no compensating write, no reconciler. Where the seam write needs nothing from the core transaction and its absence would strand something, the order is simply flipped — a free lever, used at the one site that qualifies. Two in-transaction reads of orchestration state, which deadlock the shared connection the same way, were hoisted above the transaction rather than relinquished.

Promotion landed with the work: all thirteen rule keys this work package owned were deleted from the severity dial, which is kept as an empty severity map because an absent key means error and the file lists only what is not yet clean.

## How we work on this

Shipped. Both waves landed on the same branch and PR (#467), CI green on both required checks, open and awaiting human merge. The plan originally split this into two sequential pull requests on a founder ruling, and the earlier text in this file described wave B as a later PR; the orchestrator running the work landed it on the same branch instead. The PR title and body still read as wave-A-only.

Final state: zero production and zero development governance violations across 23 rules. Both bite-proofs were reproduced live and reverted clean — a cross-layer import and a cross-layer injection each failing the build by name, file and symbol.

Founder rulings that still explain the shape of things:

- No outbox and no durable mechanism for the relinquished atomicity. Verbatim: keep it simple, no overengineering for things that do not matter in reality; this is a productivity tool without real users and the architecture is being cleaned up.
- The launder rule was scoped down to plain export declarations after four critique rounds spent on it. It does not read function bodies, class, enum or namespace members, mutation of an already-exported object, aliases, globals, or dynamic `import()`. **No completeness claim is made** — linting is engineering guidance, not protection against a malicious actor. The boundary itself holds by acquisition rather than by that rule: the census records an import edge for every acquisition spelling, verified independently.
- Two supersessions ratified: AU26's read-only door opens to port write ops, and AU21's `SessionActivityBuffer` placement relocates.

Watch items, all accepted rather than open work:

- The routine scheduler's site could not be relinquished as cheaply as the rest — a failed seam call would leave a `running` routine run with no session, which wedges that routine forever, since the coalescing guard reads exactly that row and the reaper keys on a session that never existed. It now catches the failure and marks the run failed so the next tick re-fires. Ordinary error handling, not machinery, but it is the one item worth a second look if routines ever misbehave in the wild.
- Two further sites relinquish atomicity with named failure windows in code.
- A leftover plpgsql helper function from one test outlives its trigger on the pooled instance; harmless, and the existing `finally` is the free place to drop it. Several smaller non-blocking review findings were deliberately left open.
- The harness lane is red for three files on real-binary flakiness (codex MCP readiness, one cursor-agent run). It is release-gated rather than part of per-merge CI, and it is documented as red on main for this same class. Four of five harnesses passed the identical wiring, which is evidence against a composition regression here.

Two lessons this work paid for. An audit that searches by function name found four of the nine cross-boundary transactions; following the transaction handle instead found all nine, and five sites were missing from the ruled inventory entirely — so the corrected audit method is kept alongside its first, wrong attempt. And two of the first fixes split apart writes that had nothing to do with the boundary, breaking atomicity nobody asked to break; review caught it, and each re-wrap now carries a test proven by reverse-applying the fix and watching exactly those tests fail.

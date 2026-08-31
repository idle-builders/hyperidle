# AU36 — What an agent can reach is permissions, not a property of its harness

## What we need

As a maintainer, I want what an agent can reach — its inherited logins, its connected services,
its filesystems — modelled as permissions rather than as a field on the harness that happens to
run it, so changing an agent's harness does not change what it can touch, and reading the
permissions model does not require reading the harness model.

A harness runs a model. What an agent may reach is a permission. Those are independent facts — the
same agent on the same harness can have completely different reach, and the same reach survives
switching harness — but the code bound them together, so every question about reach had to be
asked through a harness. The founder put it plainly: *"what the agent can reach is permissions or
filesystem not harness."* The cost of leaving it was that permissions had no model of their own:
nowhere to add a second inherited service, nowhere to express a per-agent grant, and no way to
answer the question without the harness registry — which also kept `agent-execution`, the layer
that runs models, in the business of describing GitHub logins.

Done means: reach is answerable without reading anything about harnesses, and a harness capability
descriptor carries no field describing reach; changing an agent's harness and changing it back
leaves reach identical, proven by exercising both; the Connections view shows the same services in
the same states, verified on the rendered surface rather than in the code; the environment probe
still never obtains a token value; and `npm run verify` is green with first boot on a machine with
a logged-in GitHub CLI detecting it exactly as before.

The end state is stated as the end state — no compatibility field left on the descriptor, no
dual-write. AN1 hard-rule 4 survives the move intact. HyperIdle remains not an OAuth app; inherited
reach stays inherited. This is placement, not a product change.

Out of scope: adding a second inherited service beyond GitHub (the model must permit one, not
provide it); per-agent permission grants (made expressible, not built); any change to held
connections' encryption or storage; and the governance work packages.

## How it works

**Reach is the question, not a new entity.** It has two kinds of answer, already modelled as two
concepts that compose. *Connections* are service reach — the fact of availability plus a pointer to
where the auth lives, per user × service, over the closed auth-source set `token | mcp | inherited`.
*Filesystems* are file reach — team-scoped file sources mounted at spawn, a separate primitive that
*consumes* a Connection for auth. The standing rule holds: compose, never merge.

**Inherited reach is a Connection fact.** It fits the connection definition exactly, and AN1
already filed it under `authSource: "inherited"`. So the destination is the existing `connections`
package — no new package. The concept already had a name, a doc, a closed vocabulary and a home
owning both halves; only the inherited facts' *source* still lived on the harness.

What moved: all four boot-time probes that produce inherited facts (the `gh` CLI probe and the
three harness MCP-config file readers) now serve the connections domain through
`createInheritedReach`. `InheritedToolDescriptor` became `InheritedConnectionFact` in
`domain-model`, and `HarnessCapabilityDescriptor.inheritedTools` was deleted outright with no alias.
`GET /api/connections` assembles its answer from connections-domain state alone — held rows plus
inherited facts — with no harness registry, descriptor or adapter-pool read in the path. A reach
fact may still carry a plain-string provenance saying which harness config the auth was found in,
because that is display data, not a dependency on the harness model.

The redetect trigger reaches the relocated probe as an opaque callback threaded from the
composition root, using the same deferred-binding closure pattern the transports already use, so
boot and `POST /api/harnesses/redetect` keep refreshing reach with identical observable effect.
`refresh` assembles facts in a fixed source order and atomically swaps a frozen snapshot.

## How we work on this

Shipped: two review rounds (round one blocked only on two introduced knip errors, closed at
source), all five acceptance criteria proven by the reviewer's own runs, maintainer approved, PR
#484 open against `main` with CI green, awaiting human merge.

Accepted limitation, known and recorded: the fixed source order reproduces today's display order
for every real configuration except one edge — no `claude` binary present but a project `.mcp.json`
present alongside other non-empty sources, where the claude facts used to be listed after
`environment`. In that edge the service set and every health value are still identical; only the
ordering of inherited entries can differ. Reproducing it exactly would require reach to read
harness registration state, which is the coupling this work removes.

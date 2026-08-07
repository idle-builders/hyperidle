# AU36 — What an agent can reach is permissions, not a property of its harness

## Work package

**Work package.** As a maintainer, I want what an agent can reach — its inherited logins, its connected services, its filesystems — modelled as permissions rather than as a field on the harness that happens to run it, so that changing an agent's harness does not change what it can touch, and reading the permissions model does not require reading the harness model. Today the answer to "what can this agent reach?" is assembled inside the harness capability descriptor: an environment probe writes `inheritedTools` onto the descriptor, each entry carries a `harness:` field, and the Connections view is a projection of that. When this ships, reach is its own thing with its own home, the harness descriptor describes only the harness, and the Connections view reads from the permissions model directly.

**Why this matters.** A harness runs a model. What an agent may reach is a permission. Those are independent facts — the same agent on the same harness can have completely different reach, and the same reach survives switching harness — but the code binds them together, so every question about reach has to be asked through a harness. The founder put it plainly: *"what the agent can reach is permissions or filesystem not harness."* The maintainer's cost of leaving it is that permissions have no model of their own: there is nowhere to add a second inherited service, nowhere to express a per-agent grant, and no way to answer "what can this agent reach" without going through the harness registry. It also keeps `agent-execution` — the layer that runs models — in the business of describing GitHub logins.

**Type.** backend + frontend.

**What exists today.** `inspectInheritedTools` (`layers/agent-execution/harness-registry/src/harness-discovery.ts:1067`) runs `gh auth status --json hosts` — one probe, one service, deliberately never `--show-token` (AN1 hard-rule 4: it learns *that* you are logged in and as whom, never the secret). Its result becomes `inheritedTools` on the harness capability descriptor (`framework/shared/src/harness/harness-capability-descriptor.ts:124`), where `InheritedToolDescriptor` carries `name`, `kind`, `harness` and `health`. `layers/agent-orchestration/connections/src/service-connection-projection.ts` flattens `descriptors[].inheritedTools` into `ServiceConnectionView[]` for the Connections surface. Alongside it, `layers/agent-orchestration/connections` already owns **held** connections — the encrypted-secret half of AN1 — with its own table and service. So half the concept already has a proper home; the inherited half is the part still living on the harness. AN1 settled the two kinds (held vs inherited) and the standing product decision that HyperIdle is never an OAuth app — reach is inherited from the user's own machine, not granted to us.

**What's genuinely missing.** A permissions model. `connections` owns held secrets, `filesystems` owns mounts, and nothing owns the question they are both answers to. Deciding whether "reach" is one concept spanning connections and filesystems, or two that stay separate, is the substance of this work package — and it determines whether `inheritedTools` moves into `connections` or into something new.

**Depends on.** None. Independent of the governance work packages — different files, different concern.

**Complexity.** M

**Engineering tier.** production — a live UI surface and the boot-time probe behind it.

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first, on the noun **reach** (or whatever it should be called). The open question is whether inherited logins, held connections and mounted filesystems are three faces of one permissions concept or genuinely separate things that merely appear together in one view. Getting that wrong either invents a false abstraction or leaves the split where it is. Apply AU26's test.
- **Design:** Light — the Connections view already exists and should not visibly change. Confirm the rendered surface against the design system rather than exploring variants.

**Human review gates.** Yes — mandatory for every work package. Load-bearing here: this decides where a domain lives, and the founder has already ruled once on the vocabulary.

**Plan calls.** Standard architecture pass, sequenced so the probe moves last. Establish the destination and the shape first, migrate the projection, then relocate `inspectInheritedTools` — moving the probe before its destination exists would strand it. Verify against the live tree that `connections` and `filesystems` are where this WP assumes: AU26 relocated real code and both a `layers/core-api/connections` and a `layers/agent-orchestration/connections` exist today.

**Contracts / constraints.**
- The end state is stated as the end state. No compatibility field left on the harness descriptor, no dual-write.
- A harness capability descriptor describes the harness. It carries no field about what an agent may reach.
- The probe never reads a token value. AN1 hard-rule 4 survives the move intact.
- HyperIdle remains not an OAuth app — inherited reach stays inherited.
- The Connections view shows the same thing to the user before and after; this is placement, not a product change.
- No production export may be added that only tests consume.

**Out of scope.**
- Adding a second inherited service beyond GitHub — the model should permit it; providing it is separate.
- Per-agent permission grants — this makes them expressible, it does not build them.
- Any change to held connections' encryption or storage.
- The governance work packages (AU29-AU32, AU34) and the `strategy` purge (AU35).

**Effort.** M (~1d)

## Acceptance criteria

- What an agent can reach is answerable without reading anything about harnesses, and a harness capability descriptor carries no field describing reach.
- Changing an agent's harness does not change what it can reach, and switching harness back leaves reach identical — proven by exercising both.
- The Connections view shows the same services, with the same states, as it does today — verified by looking at the rendered surface, not the code.
- The environment probe still never obtains a token value.
- `npm run verify` is green, and a first boot on a machine with a logged-in GitHub CLI detects it exactly as it does today.

## Validation scenarios

**Given** a machine with a logged-in GitHub CLI, **when** the app boots, **then** the Connections view shows GitHub as reachable through the user's own login, identically to `origin/main`.

**Given** an agent configured with one harness, **when** its harness is changed to another and back, **then** what it can reach is unchanged at every step.

**Given** a developer adds a field describing agent reach to the harness capability descriptor, **when** review or the type system sees it, **then** it is rejected as belonging to permissions.

**Given** the environment probe runs, **when** its command line is inspected, **then** it never requests a token value.

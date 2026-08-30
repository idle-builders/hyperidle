# AU29 — The framework stops acting: `db` exports only the database, `shared` stays off the bus

## What we need

As a maintainer, I want `framework/db` and `framework/shared` to be pure substrate again — `db` exporting nothing but database access, `shared` publishing nothing on the event bus — so that the two packages every other package may name unconditionally stop being places where behaviour hides.

These are the two targets with `reach: everyone`. That permission is only safe while they hold substrate. Every non-database export smuggled into `db` inherited that universal reach and became an unowned back-channel: agent scaffold configuration and system-prompt content were reachable from anywhere by nobody's decision. The cost of not fixing it was that the one rule the whole governance model rests on — "the shared substrate is the one target every role may name" — was quietly false, and every future reviewer trusting it was wrong. It was also the prerequisite for AU30: `factory-bootstrap`'s writes into service-owned tables could not be routed through their owning services while the code lived in `framework/`.

Done meant:

- Every export of `framework/db` resolves to a named database surface, with zero symbols falling to `db:unknown`.
- Nothing outside `framework/db` can reach a function that performs no database access through the database package.
- First-boot state is established by a composition root, and the database package writes no table owned by a service.
- The framework neither publishes to nor subscribes to the event bus.
- Every group key this work cleared is removed from the severity dial in the same pull request, so those rules bite from here on rather than being deferred to another work package.
- First boot on a clean database produces the same state it produced before — verified by running it, not by reading the code.

The end state is stated as the end state, never as a migration: no transitional re-export, no deprecation alias, no "temporary" surface entry, and no production export that only tests consume.

Boundary: splitting `framework/shared` as a whole is its own work package, and only the two bus sites were touched here. Assigning owners to unowned tables and routing service-owned writes through their owners is AU30. The development-world writes in `framework/db`'s own test files are AU32.

## How it works

Five things left `framework/db`, moved verbatim rather than improved, all to `framework/shared` because it is the only home legal for every consumer at once:

- `escapeLikePattern` — pure string escaping used by seven files across services and the layer.
- `resolveProfile` and the deployment-profile constants and types — pure env-string resolution.
- `resolveAgentScaffoldSpecs` together with the whole of `system-prompt-templates.ts`; they move as a pair because the scaffold resolver reads the templates. Their consumers span two layers, and the only surfaces both a `core-api` route and an `agent-orchestration` service may name are `shared` and `db` — and `db` is what this work package forbids. This introduced the first `fs.readFileSync` into `shared` production code. Its cwd-relative `docs/system-prompts/` resolution and its closed allowlist map are the traversal defense, which is why they moved byte-for-byte. The later shared-split work package is what gives these a narrower audience.
- `seed-fixtures.ts`'s pure constants, beside the factory roster that already documents their derivation.

`seed` turned out to be a phantom: `framework/db` exported no such symbol, and the `db:unknown` entry came from a desktop test that mocked `seed` into the package and destructured it back to assert desktop never calls it. The stale test was fixed rather than the export re-added.

First-boot state is defined once and consumed by two worlds. Two layer faces hold it — `applyFactoryCoreState` in `core-api` (the propagation user, the roster users, the agent-category backfill, the knowledge seed) and `applyFactoryRunConfigDefaults` in `agent-orchestration` — each writing through the services that own the tables. The desktop application's boot calls the two faces directly; a new `tools/setup` package calls the same faces, so there is no second implementation of first-boot truth to diverge. Two details there are load-bearing: the knowledge seed uses a dedicated factory writer rather than the repository's `create`, because that writer also writes the edit log and would change first-boot state; and the face returns the rows it queried rather than the roster constant, which is what preserves the upgrade-path semantics where an existing row's actual role decides which template it gets.

`tools/setup` picked up the relocated `setup-cli`, `bootstrap-pg`, `seed-pg-cli` and `demo-fixture`. It needed no registry edit — the existing `tools/*` glob already gives it the tooling role — and script names did not change. The demo fixture keeps its direct table writes: tooling touching any table is allowed, so rerouting it would have been invented scope.

On the bus: the admission-failure emit act moved into the two sibling services that were its only consumers, while the pure type guards and the event declarations stayed in `shared` — a guard is not a bus act. The observability dispatcher moved to `core-api`, beside the one site that wires it. Separately, `toolsForRole` was dissolved: its one-line filter is inlined at its three callers, which removes the last `framework → layer` crossing and leaves no framework file receiving layer values. Three copies of a one-line predicate beat a shared function that structurally invites layer values into the framework; the rule now lives as a sentence on the `RegisteredTool.roles` contract.

Enforcement went in with the change. The `db:util` and `db:bootstrap` surfaces were deleted outright, along with their six decided-rules rows, and a registered `db-symbols-all-placed` rule turns any barrel re-export from an unmapped module into an error that names the symbol — the detection already existed as a non-fatal note nothing read. Every group key this work cleared was removed from the severity dial in the same commit, which is what makes those rules bite.

## How we work on this

Shipped. Three review rounds; the last returned DONE with zero blocking findings.

After ship, `origin/main` moved: AU32 replaced the shrink-only baseline ratchet this was built against with a per-rule severity dial where an absent key means error. On rebase, every baseline edit was dropped with the file, and the architectural outcome was preserved through the new mechanism instead. Promotion was re-proved live rather than assumed — an `eventBus.emit` re-injected into `framework/shared` and an unmapped `framework/db` export imported from a layer both failed the build as errors, then were reverted.

Two founder rulings still explain shapes in the tree. Delete an unused surface entry rather than empty or relax it. And do not chase the hand-maintained `totals.differ` literal in the decided-rules file: what the linter outputs is what matters, the recorded count was already stale, and letting the derived value be the source of truth is a legitimate end state.

Named residuals and follow-ups, none of them chased here:

- A non-database function smuggled into an *already-mapped* `db:client` module is not statically decidable by the new rule and is not claimed as covered. One-door surface discipline and diff review are what guard it.
- `factory-roster.ts`'s `templateRole` documentation still points at the dropped `factory_settings` table, and the field has zero readers repo-wide. A dead field with stale docs — a genuine follow-up.
- The shared/remote server still has no in-process bootstrap: the deploy chart runs only the migration init-container, and `bootstrap-pg`'s "second init-container" comment is aspiration that nothing wires. The gap is recorded in the deployment docs and was deliberately left open, as no acceptance criterion covered it.

Operationally worth knowing: the worktree needs node >= 24, and `npm ci` fails on a lock that is out of sync on main, so bootstrap with `npm install`. Every task regenerates a shared governance file in its own commit, so the build ran sequentially with a single builder rather than parallel leaves that would collide.

One habit this run paid for: the regression guard added for the review's blocking finding was only believed after being run against the pre-fix source and watched fail, with a third run proving it was the added argument — not unrelated drift — that made it bite.

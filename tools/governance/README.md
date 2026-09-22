# tools/governance/

What may cross which boundary in this repo, and why. Governance is a tool like the other lint rules
under `tools/` — this package holds both the engine (`src/`) and the data it reads, kept as the four
JSON registries at this folder's own root, alongside this README.

**Do not restate any rule from here anywhere else** — not in `CLAUDE.md`, not in `docs/`, not in a
code comment. A second copy drifts from the enforced one and then agents follow the wrong copy.

**One rule is deliberately not here, and this is the reconciliation.** The instruction above and the
requirement to write the production/development split "where a developer hits it" pulled in opposite
directions, and the tension was never settled. It is settled now, by *when* a rule is needed:

- **A rule you need BEFORE you act** — which world a file is in, so you know what to name it and where
  to put it — is stated at the point of action, in `CLAUDE.md`. Pointing at this file would mean
  opening it before you can name a test file. That one rule lives there and is not repeated here.
- **A rule you need only WHEN the linter stops you** — what may cross which boundary — lives here, and
  everywhere else points at it. That is every other rule in this file.

The split holds because the two never overlap: the file rule decides which of the two rule tables
below applies to a file; the tables decide what that file may reach. Neither restates the other.

---

## The shape

Three things, and the split between them is the whole design:

| | what it is | changes when |
|---|---|---|
| **`src/lib/governance-model.ts`** | 15 clauses, checked in order, first match wins, default `forbidden` | the founder rules on the architecture |
| **`architecture.json` · `table-owners.json`** | the registries the clauses read — roles, surfaces, endpoints, table owners | packages, surfaces or owners change |
| **`decided-rules.json`** | 139 verdicts the founder decided one at a time | never, except by founder ruling |

**A clause is a principle. A registry is a fact. A decided rule is a decision.** Putting a fact in a
clause means a new package needs a code change; putting a principle in a registry means it can be
edited without anyone noticing the architecture moved.

Every architectural rule carries exactly one severity, and that severity is `error` — there is no dial.
A `rule-severity.json` rule key → `warn`/`error` declaration used to sit here, staging a
bulk migration of rules onto this model across several merges. That migration is finished: a new rule
now lands at `error` directly, with its violations fixed in the same pull request, and the file and the
loader that read it are gone.

## Why 15 clauses and not 139 rules

`decided-rules.json` is the **decision artifact** — every role pair × crossing kind, ruled on
separately for the production and development worlds. It is not the implementation. 139 hand-written
rules would each be free to disagree with their neighbours, and a single founder ruling would land as
a 139-way diff.

Instead the 139 rows are the **acceptance test**: the model is correct if and only if it reproduces
all 278 verdicts (139 rows × 2 worlds) exactly. `framework/db/src/__tests__/governance-model.test.ts`
asserts that, so a clause tuned to fix one crossing and silently breaking another cannot land.

## Totality, and its price

The model is **total** — every crossing gets a verdict, including combinations nothing in the repo
performs today. That removes the "this instance matched no rule" failure mode, which is the same
shape as a guard that scans nothing and reads as clean forever.

The price is that it answers questions the founder was never asked. `npm run governance:new-cells`
lists exactly those answers, grouped by the clause that produced them, so they can be read and
challenged rather than discovered later.

## The two worlds

Production and development are decided separately. Development is not a weaker copy of production —
it is production's verdict plus one relaxation:

> A development file may cross any boundary it needs in order to build the world and boot the system.
> It may not go around a door that production has only one of.

The doors it may not go around are listed in `architecture.json` under `oneDoorSurfaces`, with the
reason each one is held.

## Framework packages and each other

A framework package may name another framework package. That is a property of the model, not a
sibling entry threaded through every target's audience — so **a `reach` list says who *outside* the
framework role may name the surface**, and no list carries a framework package's own name.

It reaches `framework/<name>` surfaces and those only. `db:schema-ns`, `db:unknown` and `db:testing`
are surface targets too; they keep the audiences they declare, because the whole-schema door and the
undecided-surface catch-all are not something the framework role gets by being framework.

**Nothing may rebuild a per-file allowance, under any name.** `no-per-file-allowances` (registered like
every other rule) fails the build on any new file at the root of this folder, no exceptions, and on an
undeclared flag on a governance CLI — see that rule's own comments for exactly what it catches and what
it does not. The closed set is scoped to this folder's own root only; `src/` is the engine's real
source and grows by design.

## Every rule is break-tested, and that is a gate

`npm run lint` runs `governance-lint --attacks`: a table of attacks in
`src/lib/governance-attacks.ts`, each a piece of code someone would plausibly write, overlaid
onto the live repository through the census's injected `readFile` seam. Nothing is written to disk.

Four properties keep the harness from rotting into decoration:

1. every attack must produce its expected finding;
2. every attack has a **control twin** — the same act written the legal way, asserting nothing is
   reported, because a detector that flags everything would otherwise pass every attack;
3. an overlay path must not already exist and a mutated path must, so a rename fails loudly instead
   of quietly making a case test nothing;
4. **a registered rule with no attack case fails the build.**

Property 4 is the one that matters when you add a rule: it will not ship without a break-test.

## Changing something

- **A new package** → add it to `workspaces`; if its role folder is new, add the glob to
  `architecture.json` `roles.byWorkspacePattern`. Nothing else.
- **A new table** → give it an owner in `table-owners.json`. The build fails until you do; that is
  the point.
- **A new surface of an existing framework package** → declare it in `architecture.json` `surfaces`
  with its audience and the reason. An undeclared surface is forbidden, not ignored.
- **A verdict the founder changed** → edit `decided-rules.json`, then make the model reproduce it.
  If a clause has to grow an exception to get there, that is the signal to re-read the principle
  rather than bolt on the exception.

## A layer's face

A layer package's `exports` field IS its public face — a composition root reaches it and nothing
deeper. Three rules hold that mechanically, each with its own attack/control pair:

- **`layer-exports-resolve-inside-the-layer`** — a layer manifest's own `exports` entry may never
  resolve into a nested Service package. A face that "shortens" a deep path into a Service without
  actually closing the crossing would make the other two rules worthless.
- **`service-values-do-not-escape-the-face`** — in a layer's own modules reachable from that
  `exports` map, a Service-imported value may not reach the module's export surface. It reads
  export DECLARATIONS — what an `export … from`, a bare `export { local }`, a default export or an
  exported `const`/`let`/`var` names, holds, aggregates, or reaches through a top-level alias — with
  one positional exemption: a bare Service identifier in direct callee position, because calling a
  Service factory PRODUCES a value and producing values is composition. It does not read
  function-like bodies, class/enum/namespace members, mutation of an already-exported object,
  aliases of such an object, globals, or dynamic `import()` — the sanctioned face content is a bag
  of arrows over the layer's own Services, and a body that calls one is what a correct face looks
  like. A developer determined to route a Service symbol out through the face can; this rule stops
  the accident, not the deliberate act — judging the deliberate is a reviewer's job, not a linter's.
- **`deep-imports-die-with-their-entries`** — an import specifier of a layer package that resolves
  to a module absent from its `exports` map is a violation, file and specifier named, independent of
  whatever the census's own crossing detection would otherwise report — a specifier the manifest
  does not declare carries no crossing at all once the entry that used to carry it is gone, so this
  rule reads raw import specifiers directly rather than relying on resolved crossings.

The same "a face-produced value passed onward by its composition root is composition, not
injection" reading is proven on the existing `crossing-di` rule rather than a new one: an inline
call whose callee is imported from a foreign layer is a named crossing; the identical value bound to
a local first and passed on is not, because nothing about it carries foreign import provenance. See
`wire-within-one-layer`'s own `why` in `src/lib/governance-model.ts` for the exact reading.

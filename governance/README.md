# governance/

What may cross which boundary in this repo, and why.

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
| **`scripts/lib/governance-model.ts`** | 15 clauses, checked in order, first match wins, default `forbidden` | the founder rules on the architecture |
| **`architecture.json` · `table-owners.json`** | the registries the clauses read — roles, surfaces, endpoints, table owners | packages, surfaces or owners change |
| **`decided-rules.json`** | 124 verdicts the founder decided one at a time | never, except by founder ruling |

**A clause is a principle. A registry is a fact. A decided rule is a decision.** Putting a fact in a
clause means a new package needs a code change; putting a principle in a registry means it can be
edited without anyone noticing the architecture moved.

## Why 15 clauses and not 124 rules

`decided-rules.json` is the **decision artifact** — every role pair × crossing kind, ruled on
separately for the production and development worlds. It is not the implementation. 124 hand-written
rules would each be free to disagree with their neighbours, and a single founder ruling would land as
a 124-way diff.

Instead the 124 rows are the **acceptance test**: the model is correct if and only if it reproduces
all 248 verdicts (124 rows × 2 worlds) exactly. `framework/db/src/__tests__/governance-model.test.ts`
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

## There is no warn/error dial

Every rule is an error. `baseline.json` is the list of violations that already existed when the rule
landed, and **only what is on that list warns**. So a rule is enforced exactly when its group is
absent from the baseline — no severity field to set, and nothing to remember to flip.

**The baseline may only ever shrink**, in both directions, keyed by site:

- Fixing a violation and not committing the shrink **fails**, so the record cannot go stale.
- Adding one **fails**, so a rule that is clean today cannot quietly stop being clean.
- Fixing one violation while adding another **fails**, even though the total is unchanged.

`npm run governance:baseline` is the only writer, and it refuses to add a group or raise a count.
Clearing a group's last site deletes the entry, and from that commit the rule is at error —
**promotion is what fixing the violation does, not a later step.**

The one legitimate growth is a new rule landing over violations that already exist. That needs
`--adopt "<group key>"`, naming the group, so it shows up in the shell and in review.

The baseline records debt, never a plan: it does not say which work will clear a group. That mapping
lives with the work packages, so the enforced contract never goes stale when planning changes.

## The other shrinking record: `misplaced-files.json`

Same shape, different subject, and the two are **disjoint**. `baseline.json` holds crossing
violations keyed by `(group, site)`. `misplaced-files.json` holds **files the classifier calls
production that are really development and cannot move yet** — keyed by path. A path in one will
never appear in the other, which is why there are two files and not one.

Each entry names the reason the file is stuck, never the work that will unstick it — the same
principle the baseline follows, for the same reason. `resolvedFiles` is the committed count of
entries that resolve to a tracked file, and the lint fails when the live count is **above** it (new
debt parked here) or **below** it (a file was fixed and the shrink was not committed). Every entry is
printed as a warning on every run.

There is no generator, and there cannot be one: the baseline is derived from live violations, so a
generator refusing to grow it closes the laundering path, but whether a production-path file is
"really development" is a human judgement with nothing to derive it from. What stands in its place is
that growing the ledger is a two-line diff — the entry and the count — which review is expected to
challenge.

## Every rule is break-tested, and that is a gate

`npm run lint` runs `governance-lint --attacks`: a table of attacks in
`scripts/lib/governance-attacks.ts`, each a piece of code someone would plausibly write, overlaid
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
- **A production-path file that is really development and genuinely cannot move** → add it to
  `misplaced-files.json` with the reason, and raise `resolvedFiles` in the same commit. Fixing one
  deletes the entry and lowers the count; leaving the count is a build error either way.
- **A verdict the founder changed** → edit `decided-rules.json`, then make the model reproduce it.
  If a clause has to grow an exception to get there, that is the signal to re-read the principle
  rather than bolt on the exception.

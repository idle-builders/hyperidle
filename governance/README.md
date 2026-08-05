# governance/

What may cross which boundary in this repo, and why.

**Do not restate any rule from here anywhere else** — not in `CLAUDE.md`, not in `docs/`, not in a
code comment. A second copy drifts from the enforced one and then agents follow the wrong copy.

---

## The shape

Three things, and the split between them is the whole design:

| | what it is | changes when |
|---|---|---|
| **`scripts/lib/governance-model.ts`** | ~13 clauses, checked in order, first match wins, default `forbidden` | the founder rules on the architecture |
| **`architecture.json` · `table-owners.json`** | the registries the clauses read — roles, surfaces, endpoints, table owners | packages, surfaces or owners change |
| **`decided-rules.json`** | 125 verdicts the founder decided one at a time | never, except by founder ruling |

**A clause is a principle. A registry is a fact. A decided rule is a decision.** Putting a fact in a
clause means a new package needs a code change; putting a principle in a registry means it can be
edited without anyone noticing the architecture moved.

## Why 13 clauses and not 125 rules

`decided-rules.json` is the **decision artifact** — every role pair × crossing kind, ruled on
separately for the production and development worlds. It is not the implementation. 125 hand-written
rules would each be free to disagree with their neighbours, and a single founder ruling would land as
a 125-way diff.

Instead the 125 rows are the **acceptance test**: the model is correct if and only if it reproduces
all 250 verdicts (125 rows × 2 worlds) exactly. `framework/db/src/__tests__/governance-model.test.ts`
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

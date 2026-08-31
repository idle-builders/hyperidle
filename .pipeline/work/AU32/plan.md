# AU32 — Tests arrange worlds production can actually produce

## What we need

As a maintainer, I want every test fixture to build a database state the running application could
itself produce, and no test to go around a door production has only one of — so that a green suite
means the code works on states that can occur, not on states only a test can construct.

The bite is narrow and real. Where an owning service writes two rows in one call it is enforcing a
cross-row invariant, so a fixture writing one of them builds a world the application cannot reach: a
test asserting behaviour on a team with no members proves nothing about the product, and nobody finds
out until the invariant is relied upon. Sixty-odd fixtures did exactly that — a `knowledgeItems` row
with no `knowledgeAppProjection`, or a `teams` row with no `teamMembers`. Six more reached past a
single-door surface, importing the whole schema namespace or an undecided database export.

What had to hold when this shipped: no test fixture writes one row of a pair the owning service
always writes together, with **no** exception for any file (the plan's own carve-out clause was
withdrawn by the founder who would have signed it); no development file reaches past the database
door; no assertion weakens, and a test is deleted only where it depended on an unreachable arrangement
or probed an operation production has no path to perform; the development world holds zero known
violations and its rules fail the build on reappearance. Boundary: the development world only — the
221 production violations stay with AU29/AU30/AU31, and consolidating the ~135 hand-rolled base worlds
beyond the files this package touched is a developer-guide matter, not an access rule.

## How it works

Five founder rulings (A–E, recorded at the concept gate) settled the shape and supersede the earlier plan text wherever they collide.

**The one-seam requirement for AI requests is production-only (A).** The reasons the AI door exists —
recording, pricing, replay, provider-agnosticism — are properties the shipped product must have. So
the raw-runtime rule relaxes in the development world: a rule change derived from the world, not a
per-file exception. `tools/eval/src/judges.ts` stays as it is. The database door is *not* relaxed —
it is about migrations and connection handling, so development still routes through the database
package's own factory.

**Tests arrange only producible states, with no exceptions at all (C).** The exception mechanism was
refused outright on the grounds that one becomes twenty. Every arranged entity in every touched file
gets its companion. Where completing an entity over-determines an assertion, the resolution is
honest, never an exemption: make the assertion prove its own constraint alone, or — if production has
no path performing the probed operation — delete the test. **A dead test is deleted, never repointed
(B)**, and the touched files were swept for others that could not fail.

**An unreachable operation is dead code — delete the feature, not just the test (D).** Safety comes
from absence of the capability, not from a constraint guarding a capability nobody has. The mandated
investigation returned an **empty removal branch**: no deletion mechanism exists in any shape for
`users`, `threads`, `knowledgeItems` or `items`. The two that exist — `deleteTeam` and the knowledge
soft-archive — are production-reachable and stay, with their tests. Zero production files changed;
the schema was not touched, no FK dropped, no `onDelete` altered.

**The lint is a standard linter (E).** A rule carries one severity, `error` or `warn`, and nothing
keeps books. The shrink-only baseline, the `baseline-ratchet` rule, the generator script and the
`--adopt` escape hatch are deleted unconditionally — a red build as the reward for fixing violations
names no architectural fact. Severity lives in `governance/rule-severity.json`, keyed by the group
key the lint already prints (`<source> → <target> [<kind>] <world>`); an absent key means `error`, so
the file lists only what is not yet clean. Coarser keys were rejected from live data: the same rule is
clean in development and dirty in production, and the production cells span sibling packages, so no
sibling could flip anything until the last one landed. `severityOf(ruleKey)` sees the key and nothing
else, so restoring a per-file allowance means widening a signature at every call site; the
clean-but-`warn` report returns `readonly string[]` and prints as a NOTE, never a `Finding`, because a
`Finding` is the only thing that can carry a severity. Explicitly forbidden as the likeliest
regression: a check that a `warn` rule with zero live violations is an error — the stale baseline
reborn.

The companion groups are derived from the owning services' writers, never listed, so a service that
starts writing a pair picks up a group automatically. The detector credits a **file**, not an entity:
one companion write anywhere silences every site in that file. That is a laundering hazard, and this
work deliberately does not exploit it — completion is per arranged entity, and the review checks it
that way. In `core-api` the sites converge on `seedTeam` / `seedKnowledgeItem` in the package's own
test helpers, mirroring the owners' writers and their defaults; elsewhere the companion is inline.
No production export exists only for tests.

The single-door fixes compose two existing database-client exports — `applyMigrations` then
`createPgliteDb` over the same directory — in the ah1/ah5/ah6 test servers and the eval runner,
replacing hand-rolled schema-bound clients. That moved PGlite from in-memory to a per-boot temporary
directory. One rework carries the rulings' logic visibly: the team in the bets-FK rejection test
receives its membership companion, then the membership is removed in the owner's own order before the
act, so the bets FK is again the sole cause of the rejection — `deleteTeam` is non-transactional, so
production durably produces exactly that member-less-team state.

Accepted costs, on the record: a rule at `warn` warns for all its violations, new ones included, so
nothing blocks new debt on a rule that is not yet clean — the trade for a lint that never fails on
bookkeeping. The nine deleted constraint tests remove the only executable guard on those foreign keys,
and "the desktop migration path writes no seed data" becomes untested; it never actually was. Real
tests for either are separate work, not a repoint smuggled in here.

## How we work on this

`governance/misplaced-files.json` is a second shrink-only record whose rule can still fail the build
on a stale `resolvedFiles` count — the same shape Ruling E removed from the baseline. It is an open
founder decision, deliberately not actioned: the count and its two branches are byte-identical to
`origin/main`, and only the stale prose describing the deleted baseline was fixed. The recommendation
on record is to keep the four prose rows (each states an architectural judgement nothing can derive)
and delete the count; it also needs one sentence of `CLAUDE.md`, outside the bounds the rulings
authorize.

The per-boot PGlite temporary directories are removed on the graceful shutdown path only; a throw
between `mkdtemp` and signal registration leaks one. Development tooling, no acceptance criterion
governs it. Left as future work: `hint-progress.integration.test.ts`, `P2-org-edges.integration.test.ts`
and `O2-schema-migration.integration.test.ts` also delete rows the rulings would reach, but those files
carry no violation and were not touched here.

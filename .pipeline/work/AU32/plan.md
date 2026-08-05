# AU32 — Tests arrange worlds production can actually produce

## Work package

**Work package.** As a maintainer, I want every test fixture to build a database state the running application could itself produce, and no test to go around a door production has only one of — so that a green suite means the code works on states that can occur, not on states only a test can construct. Sixty-three fixtures today write one row of a pair the owning service always writes together: 34 insert a `knowledgeItems` row with no `knowledgeAppProjection`, 27 insert a `teams` row with no `teamMembers`. Six more reach past a single-door surface — four importing the whole schema namespace, one importing an undecided database export, one constructing a vendor SDK directly instead of going through the one recorded runtime path. When this ships, the development world holds zero known violations and the two development rules that survived Ruling 13 fail the build like any other.

**Why this matters.** Ruling 13 already made this rule narrow and real: a test may write any foreign table directly, because 63% of those writes would otherwise route through a function that is literally `insert(X).values(v)`. What survived is the part that bites — where the owner writes two rows in one call it is enforcing a cross-row invariant, and a fixture writing one of them builds a world the application cannot reach. `team-lookup.ts` documents in a comment that callers must use `createTeam`; the fixtures ignore it. The maintainer's cost of not fixing this is silent: a test asserting behaviour on a team with no members proves nothing about the product, and nobody finds out until the invariant is relied upon. The one-door breaches are worse in kind — a test that constructs a vendor SDK directly exercises a path the recording, pricing and replay machinery cannot see.

**Type.** backend / test infrastructure.

**What exists today.** `governance/baseline.json` holds 69 development-world entries across 46 files, a median of one per file. `_helpers.ts:58-83` already exposes `seedBase`, which establishes exactly the base world 135 files hand-roll; 38 files use it. `layers/core-api/work/src/__tests__/`, `layers/core-api/src/routes/__tests__/` and `layers/core-api/src/services/__tests__/` hold most of the `teams` cases; the `knowledgeItems` cases are spread across `core-api`'s knowledge, promotion and relevance suites. Ruling 13a already removed 51 false positives by deriving the criterion from the owners' own code — a companion the owner never *revises* is history, not state — so `knowledgeEditLog` and `knowledgeAccessLog` are correctly no longer reported. The remaining rule is derived, never listed: `buildCompanionGroups` reads the owning services' writers, so a service that starts revising a log picks up a companion automatically.

**What's genuinely missing.** Nothing conceptual — the rule is settled and the sites are named. The one real judgement is that roughly six of the 46 files are tests **of the schema itself**: `foreign-keys.integration.test.ts`, `schema.integration.test.ts`, `migration.integration.test.ts` and `seed-then-migrate.integration.test.ts` in `framework/db` insert deliberately minimal rows to prove a constraint fires or an old-shape row migrates. Adding a companion there changes what is under test and, in the foreign-key cases, could mask the very constraint being probed. Those need a decision, not a codemod.

**Depends on.** None. Independent of AU29 and AU31 — no shared files. Interacts with AU30 (assigning an owner can create new companion groups), but AU30 clears any development entries it creates, so neither blocks the other.

**Complexity.** M

**Engineering tier.** production — the suite is the proof the shipped system works.

**Pre-build gates.**
- **Refinement:** Not required — the rule is locked by Rulings 13 and 13a and the sites are enumerated in `governance/baseline.json`. The schema-test question is a decision to record, not a noun to sharpen.
- **Design:** Not required — no UI surface.

**Human review gates.** Yes — mandatory for every work package. Specifically needed on the schema-test carve-out: if any of those six files keeps a partial-state fixture, that is a founder decision recorded in `founder-rulings.md`, never an agent's judgement call.

**Plan calls.** Standard pass, but plan the schema-test question **first** and separately — decide whether those files change, get an explicit exception, or have the rule refined to exclude tests whose subject is the constraint itself, before touching the ~35 mechanical cases. The mechanical cases should converge on `seedBase` rather than each growing its own companion insert; that is a real duplication win the plan should take while it is in there, and 38 files already show the shape.

**Contracts / constraints.**
- A test's assertions must not weaken to accommodate a fixture change. If adding a companion row changes what a test proves, that is a finding to report, not a diff to land.
- No exception is added to the rule to make a file pass. If a file genuinely needs one, it is a founder ruling in `founder-rulings.md` with a written reason, and it is named — never a pattern or a directory.
- No production export may be added that only tests consume — `knip:production` deletes it as dead code.
- The companion groups stay derived from the owning services' writers; no hand-maintained list of table pairs.
- The baseline is shrink-only, so this work package promotes its own rules as it goes: clearing a group's last site deletes the entry and that rule is at error from the same commit. There is no separate promotion step to remember, and none to defer.
- Every baseline entry cleared is deleted from `governance/baseline.json`, never re-tagged.

**Out of scope.**
- The production world entirely — AU29, AU30, AU31.
- Consolidating the 135 hand-rolled base worlds onto `seedBase` beyond the files this work package already touches; the wider convention is a developer-guide matter, not an access rule.

**Effort.** M (~1d)

## Acceptance criteria

- No test fixture writes one row of a pair the owning service always writes together, except where a founder ruling names the file and the reason.
- No development file reaches past a single-door surface — no whole-schema import, no undecided database export, no directly-constructed vendor runtime.
- Every test whose fixture changed still proves what it proved before, with its assertions intact.
- `governance/baseline.json` holds zero development-world entries, and the development rules fail the build on reappearance.
- If clearing this work package's violations leaves `governance/baseline.json` empty, the file and the `--adopt` escape hatch are deleted in the same commit, and reintroducing either — under any name — fails the build. Exactly one of the four clearing work packages will trigger this; whichever gets there last owns it.
- `npm run test:all` is green and the integration suite's pass count is unchanged or higher.

## Validation scenarios

**Given** the governance lint runs over the live tree, **when** it reports, **then** the development world shows zero known violations.

**Given** a developer adds a test that inserts a `teams` row without a `teamMembers` row, **when** `npm run lint` runs, **then** the build fails naming the file and line.

**Given** the owning service stops writing two rows together, **when** the lint runs, **then** the companion rule stops reporting that pair — proving the groups are derived from the owner's code and not from a list.

**Given** the full test suite runs before and after, **when** the results are compared, **then** no test that passed now fails and no test that asserted a behaviour now asserts less.

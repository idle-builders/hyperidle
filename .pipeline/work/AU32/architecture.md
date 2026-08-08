# AU32 — architecture: tests arrange worlds production can actually produce

Authority: `.pipeline/work/AU32/plan.md` **as amended by `.pipeline/work/AU32/founder-rulings.md`
(Rulings A/B/C recorded at the concept gate 2026-08-08; Ruling D recorded 2026-08-08 after the
round-3 critique, overruling its blocking finding B1; **Ruling E recorded 2026-08-08 after the
build reached `27ccc8b8`**, revising AU28 Ruling 2 and replacing the baseline ratchet with plain
per-rule severity)** — those rulings supersede this file's
earlier revision, `schema-test-decision.md`'s earlier recommendation, and plan.md's AC-2/AC-3
wording and production-out-of-scope clause wherever they conflict. Also binding: `.pipeline/work/AU28/founder-rulings.md` Rulings
13/13a (companion rule), 14 (one runtime door — **narrowed to production-only for AI requests by
Ruling A**), 8 (two worlds). Rule mechanics: `governance/README.md`,
`scripts/lib/governance-model.ts:351-399` (development relaxation),
`scripts/lib/crossing-detectors.ts:366-451` (`buildCompanionGroups`), `:484+` (`buildWriteSets`).

**What the gate changed.** The concept gate did not approve the previous revision as written:

- **Ruling A** withdrew D6 (`judges.ts` is NOT rewritten; the AI one-seam requirement is
  production-only) and replaced it with a rule relaxation in the development world (D6′ below).
- **Ruling B** withdrew D5 (the dead `seed` test is deleted, never repointed) and imposed a
  dead-test sweep over every touched file (D5′ below).
- **Ruling C** rejected drafted Ruling 16 (no arranged entity stays partial, no per-file exceptions
  ever), withdrew plan.md's carve-out clause ("except where a founder ruling names the file and the
  reason"), and amended AC-3. The masking criterion of the previous revision is **gone as an
  exclusion mechanism**; the over-determination problem it identified is resolved per delete
  operation from production evidence (§1c, D1).
- **Ruling D** answered the round-3 blocking finding (B1, `architecture-critique-round3.md`) by
  **overruling its recommendation**: operation-reachability extends from the state a test arranges
  to the action it probes, and the nine contested constraint tests are deleted. The ruling goes
  further: where the probed deletion mechanism is itself dead code, the whole feature is removed —
  safety comes from the capability being absent, not from a constraint guarding a capability nobody
  has. It **amends plan.md's scope** (production world, previously out of bounds outright, is newly
  in-bounds narrowly for removing a dead deletion feature — NOT for any of the 221 production
  governance violations, which stay AU29/AU30/AU31's) and forbids schema changes (no FK dropped, no
  `onDelete` changed). The mandated investigation was executed (P18): **no deletion mechanism exists
  in any shape for `users`/`threads`/`knowledgeItems`/`items`; the two mechanisms that do exist —
  `deleteTeam` (teams+teamMembers) and the knowledge soft-archive — are live production paths and
  stay. Zero features are removed, zero production files change, and no migration is generated.**
  The scope amendment exercises to zero (D10).
- **Ruling E** withdrew **D7** and **D8** entirely. The lint stops keeping books: `governance/baseline.json`,
  the `baseline-ratchet` rule, the `governance:baseline` generator, the `--adopt` flag and every code
  path that reads a per-file allowance to compute severity are deleted **unconditionally**, and this
  work package owns the deletion rather than deferring it to whichever sibling finishes last. In their
  place: one severity — `error` or `warn` — per architectural rule (D7′), a closure that leaves no
  half-removed bookkeeping behind (D8′), a proportionate guard against rebuilding the mechanism (D11),
  and the development-world flip to `error` in this PR (D12). **AC-4 and AC-5 are rewritten**; AC-2 and
  AC-3 keep the amendments Rulings A and C already gave them. The second shrink-only record,
  `governance/misplaced-files.json`, is **surfaced for a founder decision, not folded in** (D13).

**What round 5 changed (the amendment's closure and evidence half only — the severity model and the
granularity choice were reproduced number-for-number and are untouched).** Three blocking findings, all
about proof rather than design:

- **The closure was incomplete and its own evidence could not see the gap.** `governance/misplaced-files.json`'s
  committed `note` — inside a *surviving* enforced artifact — describes the deleted record, its shrink-only
  check in both directions, its absent generator, and cites a path D8′ itself renames. The general question
  ("what other enforced artifact carries prose about the deleted mechanism?") is now asked mechanically and
  answered: **D8′ gains a residue sweep table** with that note, `misplacement-ledger.ts:85-86`,
  `crossing-report.ts:20`/`:71`, the `misplacement-ledger-ratchet` attack id, `.pipeline/AU.md:48,50,51,52`,
  and the three sibling plans' ACs — plus an explicit list of what shares the word `baseline` and is *not*
  residue. The note fix is unconditional and does **not** touch the founder's still-open D13 count question.
- **The residue proof could not fail, in the closure's primary file.** `scripts/rules/crossings.ts` holds a
  literal NUL byte, so ripgrep classifies it as binary and skips it: AC-5′'s central search read clean today
  with the ratchet fully present. The search is now `git grep -na`, its token set gains `baseline.json`, its
  file list gains `governance/`, and **a positive control run before the deletion is a required step** whose
  expected output names `crossings.ts`. Verified: the NUL byte is the only one under `scripts/` and it lives
  inside the block D7′ deletes, so the hazard is gone by construction — no delimiter change is planned.
- **A new test could not fail.** D9′ case 3 was green by construction (`crossingRules.evaluate` maps over
  `myViolations`). Ruling B forbids it. It is **replaced** by a falsifiable test of the D7′ report, whose
  shape D7′ now specifies exactly; the ban it was supposed to pin is held by a return type plus review, and
  AC-4′ no longer cites it as evidence.

**What round 6 changed (two narrow corrections; the granularity model, §1e's table and D12's flip set were
re-verified untouched for the third round and are untouched again).**

- **Three more stale sibling lines, the B1 class one more time — and the plan's own boundedness rule was
  telling the builder to leave them.** `AU29/plan.md:33` · `AU30/plan.md:35` · `AU31/plan.md:35` carry an
  identical bullet ending "There is no separate promotion step to remember, and none to defer", which Ruling E
  item 3 makes false — removing your keys from `governance/rule-severity.json` **is** that step, and it is
  what this closure already writes into `.pipeline/AU.md:52` for these same three work packages. Plus
  `AU30/plan.md:28` ("the ratchet records progress"). All four are now enumerated in D8′'s residue table and
  routed through T9b, and **"no other line of any sibling plan is touched" is replaced by an exhaustive table
  of the lines that *are* touched** — a prohibition that reads as licence to leave a false line standing is
  not boundedness. The token set gains **`shrink-only`**, the one token that reaches the bullet (the control
  moves from 74/19 to **78/20**); `ratchet` and `promot` are **declined with the measurement that shows why**,
  and `AU30:28`'s unreachability by any honest token is stated as a limit rather than papered over
  (feasibility P26).
- **A wrong measurement was making an unreachable branch look viable.** P23's "all five development files that
  insert `teams`" was one directory read as the whole development world: the real figure is **178** files, and
  **zero** of them lack `teamMembers`. D12 item 3's "append to an existing fixture" fallback is therefore
  **provably unreachable** (the write set is a superset of what a grep sees, and the grep-clean set is empty),
  and it is retained **only** as the diagnosis for a builder who tries it. The `*.probe.ts` route is
  unaffected — its write set is `{teams}` by construction and `trackedFiles()`'s
  `git ls-files -z --cached --others --exclude-standard` puts an unstaged file in the census, neither of which
  depends on the count.

Round 5's non-blocking corrections are folded in where they live: the false `decided-rules.json` support for
the grain (§1e), `severityOf` for the attack pass and knip's real reach (D8′), D11's population/floor,
flag-scan premise and blind-spot shape, the bite proof's write-set precondition (D12), and the understated
D13 cost. The granularity model and the flip set are **not** touched.

Everything the round-2 and round-3 critiques verified and no ruling touches is carried unchanged:
the census, the cascade fact, Ruling A's rule relaxation and its complete pin list (round-3 N3),
`seed-then-migrate` clean, `session-requests:59` unreferenced, the `seedBase` correction, D2's
mechanics, D3, D4, the three sound dead-test deletions (round-3 N5), the :114 rework
(round-3 N2 — strengthened below with the non-transactionality fact it found), and the round-2
N1–N4 closures. Round-3's non-blocking N1 (P15's false "type-breaks" claim about the crossings
literal) is fixed in P15 and noted in D6′. **D9 survives in substance and changes only in
mechanism** — its second case still pins the warn→error flip, now against the severity declaration
instead of a baseline allowance (D9′).

---

## 1. Live grounding — measured, not copied

### 1a. The violation census (unchanged from round 2; re-confirmed 2026-08-08)

`npx tsx scripts/governance-lint.ts` on this worktree (base `origin/main` bbe82e9a):

```
DEVELOPMENT — 67 violation(s) across 45 file(s), 7 rule group(s)
    38   25 file(s)  layer → db:table (other) [table:write]
    13   10 file(s)  service → db:table (other) [table:write]
    10    4 file(s)  framework → db:table (other) [table:write]
     3    3 file(s)  layer → db:schema-ns [import]
     1    1 file(s)  application → db:unknown [import]
     1    1 file(s)  tooling → db:schema-ns [import]
     1    1 file(s)  tooling → raw runtime [capability]
```

61 table-write sites across 39 files: 34 `knowledgeItems` without `knowledgeAppProjection`, 26
`teams` without `teamMembers`, 1 orphan projection update (full per-site list in `feasibility.md`
P1/P11). The 6 one-door sites: `layers/core-ui/__scripts__/ah{1,5,6}-test-server.ts` (`schema`
namespace import), `tools/eval/src/runner.ts:14` (same),
`applications/desktop/__tests__/migrate.test.ts:63` (`seed`, a `db:unknown` ghost),
`tools/eval/src/judges.ts:502` (dynamic `@anthropic-ai/sdk` — **no longer a violation to fix**;
cleared by rule relaxation under Ruling A, D6′).

`seed-then-migrate.integration.test.ts` is already clean
(`framework/db/src/__tests__/seed-then-migrate.integration.test.ts:38-43`). No action.

### 1b. How the companion rule decides (the builder must know this)

- A **site** is any `insert/update/delete(<table>)` in a development file where the table is in a
  companion group and the **file's whole write set** (including writes made through imported
  development helpers — `buildWriteSets`) does not contain the companion
  (`crossing-detectors.ts:781-783`, `governance-model.ts:372-389`, clause `write-the-whole-row-set`).
- One companion write anywhere in a file silences every site in that file. **That is a laundering
  hazard and this plan forbids exploiting it** — completion is per arranged entity (C6).
- Groups are derived from the owners' writers (`buildCompanionGroups`): live groups are
  `{teams ↔ teamMembers}` (`createTeam`, `layers/core-api/org/src/team-lookup.ts:230-259`) and
  `{knowledgeItems ↔ knowledgeAppProjection}` (`create`,
  `layers/core-api/knowledge/src/knowledge-repository.ts:254-301`).

### 1c. The delete-operation census: what production deletes, and what mechanisms exist at all

Ruling C removed the keep-partial escape hatch, so every over-determination has to be resolved
honestly, per delete operation, from production evidence. The op inventory comes from the P11 sweep
plus the round-2 independent re-sweep, widened again in P16 (`feasibility.md`) to every `.delete(`
call in the 49-file touched set. The production side is a full census of the production world
(direct Drizzle deletes, raw SQL, migrations, cascade paths, soft-delete routes, reapers — P16).

**Production delete facts (P16, each `file:line`-cited there):**

- `teams` / `teamMembers` **are deleted in production**: `deleteTeam`
  (`layers/core-api/org/src/team-lookup.ts:304-307`) deletes the membership rows first (:305), then
  the team (:306); its one production caller is the team-creation rollback
  (`layers/core-api/src/routes/teams-routes.ts:303`).
- `users` are **never deleted** in production — the agents DELETE route soft-retires
  (`layers/core-api/src/routes/agents.ts:480-497`, `status: "retired"`); no other path, no raw SQL,
  no cascade into `users` exists.
- `threads`, `knowledgeItems`, `items` are **never deleted** in production — zero direct deletes,
  zero raw-SQL deletes, zero migration deletes, and no cascade FK sits on any of those tables (the
  schema's 12 cascade FKs live on `teamRunConfigDefaults`, `agentRunConfig`, `orgEdges`,
  `knowledgeAppProjection`, `taskPlanningSignals`, `filesystemInjections`, `filesystemCaptures`,
  `hintProgress`, `loginSessions`, `serviceConnections` — none of them is a mechanism that removes
  a `users`/`threads`/`knowledgeItems`/`items` row).
- `filesystems` **are deleted** in production
  (`layers/agent-orchestration/filesystems/src/filesystem-registry.ts:64`).

**Mechanism existence (Ruling D, P18 — the stronger claim).** Beyond "production never performs the
operation": for `users`/`threads`/`knowledgeItems`/`items` **no deletion mechanism exists in code in
any shape** — no repository/service function, no route (the agents DELETE handler soft-retires via
`updateUser`, `agents.ts:495`; the routines DELETE handler soft-deletes via `updateRoutine`; no
handler deletes other than its named subject), no agent tool (all 21 tools in
`tool-handlers/src/tool-definitions.ts` enumerated — zero deletion-shaped), no reaper (reapers touch
only retention tables), no CLI/script path, no migration DML (0 `DELETE FROM` across all 56
migration files), no raw SQL, and no cascade FK sits on any of those tables. The knowledge `remove`
(`knowledge-repository.ts:1496-1527`, renamed from `archiveItem`) is a soft archive — an UPDATE plus
an edit-log INSERT, live via `POST /:id/archive` — not a deletion mechanism. There is therefore **no
dead deletion feature to remove**: the Ruling-D removal branch is empty, and the safety the ruling
names ("if there is no deletion feature the database is still save") already holds by absence.
**The schema is not touched: no FK is dropped, no `onDelete` action changes, and no migration is
generated by this work package.**

Per-operation resolutions are recorded in `schema-test-decision.md` (now a record of the gate's
decisions, not a request) and locked in D1. Summary: of the delete-rejection probes in touched
files, the two `teams` probes survive (production performs team deletion); every probe of a
user/thread/knowledge-item/item deletion is a development-only scenario and its test is deleted
under Ruling B; the one over-determination case (`foreign-keys:102-115`) is resolved by completing
the pair and then removing the membership row in the owner's own operation order — assertion
untouched, sole cause restored (D1).

### 1d. `seedBase` — the plan's convergence claim, verified (unchanged)

`seedBase` lives at `layers/core-api/src/__tests__/_helpers.ts:58-83` (not `framework/db`). It
establishes the `teams` pair (fixed ids `p1`/`t1`) plus one user and one thread, **nothing** for
the knowledge pair, and is reachable only inside `@hyperidle/core-api` (24 of the 39 violating
table-write files; the other 15 are separate packages — the helper is unexported and must stay so).
"Converge on seedBase" is honoured as intent with corrected mechanics (D2);
`promote-knowledge.integration.test.ts` — a `seedBase` caller still flagged for the knowledge pair
— is the direct disproof of the literal claim.

### 1e. Severity grounding — where severity lives, and the granularity the live data forces

Measured on the worktree at `27ccc8b8`, 2026-08-08. **The build has moved past the state
`progress.json` recorded**: everything `buildState.remaining` listed has landed.

```
npx tsx scripts/governance-lint.ts
governance-lint: PASS — 3309 tracked files (789 production, 2520 development), 33 packages,
  8114 crossings, 18 rules, 221 production + 0 development known violation(s) at warn
npx tsx scripts/governance-lint.ts --attacks   → PASS, 47 break-tests
npx tsx scripts/governance-lint.ts --fixtures  → PASS, 63 synthetic cases
```

- **The development world is already at zero.** T5 landed in `23eb1658` (the three `ah` test servers
  and the eval runner routed through the database package's own client factory), Ruling B's deletion in
  `ec1b933b`, T7's relaxation in `27ccc8b8`.
- `governance/baseline.json` at `27ccc8b8`: **31 groups, all production, 221 violations, 65 files.**
  `main` (`bbe82e9a`) held **38 groups — 221 production + 67 development**. The seven development
  groups are the difference, and they are the rules D12 flips.
- Production is unchanged from `main` at 221 across 31 group keys. This work package does not touch it.

**Where severity lives today: nowhere as a declaration.** `scripts/rules/crossings.ts:62-71` derives it
per violation — a `(group key, file)` pair with a recorded count in `governance/baseline.json` warns for
the first N occurrences and errors beyond them; `scripts/lib/crossing-report.ts:79-88` is the record's
shape and `:163-198` (`compareBaseline`) is what fails the build in **both** directions when the record
and reality disagree. So the dial is a 270-line file naming 65 file paths and 221 counts, and fixing the
last violation in a file turns the build red until the record is regenerated. That is the friction
Ruling E removes.

#### The granularity, settled from the data

Three candidate grains, each tested against the two things Ruling E requires: a clean rule at `error`
and a dirty one at `warn`; and **a work package that can clear its own set of rules and flip them in
its own pull request**.

1. **Per registered rule name** (`crossing-import`, `crossing-table-write`, … — nine crossing rules).
   **Rejected by the numbers.** Eight of the nine crossing kinds carry production violations; all nine
   carry zero development ones. Those eight would have to sit at `warn`, and then a fresh development
   violation of any of them would *warn* instead of failing the build — which is precisely what AC-2 and
   AC-4 exist to prevent. World-qualification is forced; per-rule-name alone does not work.
2. **Per (rule name, world)** — 18 cells, 8 of them at `warn`. Works for this work package. **Rejected
   for the track:** four of the eight production `warn` cells each contain violations owned by two or
   three different sibling work packages, and those four hold **195 of the 221 violations — 88%**. Under
   this grain no sibling can flip anything until the last one lands, which reinstates exactly the
   "promotion step to remember" Ruling E item 3 abolishes.
3. **Per architectural rule, keyed by the existing group key** — `<source> → <target> [<kind>] <world>`.
   31 cells at `warn` today, zero of them development. **Chosen.**

| registered crossing rule (production) | group keys inside it | violations | sibling work packages spanned |
|---|---|---|---|
| `crossing-import` | 11 | 92 | **3** (AU29 8, AU30 26, AU31 54) + 4 violations no sibling claims |
| `crossing-table-write` | 5 | 50 | **2** (AU29 17, AU30 29) + 4 unclaimed |
| `crossing-table-read` | 4 | 39 | **2** (AU29 2, AU30 34) + 3 unclaimed |
| `crossing-di` | 4 | 14 | **2** (AU29 1, AU31 13) |
| `crossing-manifest` | 3 | 21 | 1 (AU31) |
| `crossing-mcp` | 2 | 2 | 1 (AU31) |
| `crossing-event` | 1 | 2 | 1 (AU29) |
| `crossing-api` | 1 | 1 | 1 (AU31) |
| `crossing-capability` | 0 | 0 | — already at `error` |

Sibling scopes read off `.pipeline/AU.md:28-30` and its dependency notes at `:49-52`, not inferred:
AU29 is "the framework stops acting" plus the `db:util` anomaly and the unnamed `db` exports; AU30 is
the six unowned tables; AU31 is cross-layer reach. Per-key attribution: **AU29 8 keys / 30 violations,
AU30 6 keys / 89, AU31 13 keys / 91, unclaimed 4 keys / 11 — 31 keys, 221 violations.** The unclaimed
four are genuine foreign access to owned tables from `credentials` and `filesystem-mounting`; no
registered sibling names them, so they stay at `warn` until one does. That is an honest outcome of the
grain, not a gap in it.

**Exactly one key is shared between two siblings:** `framework → db:table (unowned) [table:write]
production` (2 violations, `framework/db/src/demo-fixture.ts` and `factory-bootstrap.ts`). AU29 moves
the file out of the framework role; AU30 gives the tables owners. `.pipeline/AU.md:49` already sequences
AU30 after AU29 for that exact file, so the flip lands in AU30. Every other key belongs to one sibling
or to none.

**The chosen grain introduces no new vocabulary — which is why it is also the smaller change.** The group
key is exactly what `groupKey` already produces (`scripts/lib/crossing-report.ts:72-73`) and what every
warn line already prints (`scripts/rules/crossings.ts:88`). Grain 2 would have required inventing a key
that exists nowhere today. That is the whole of the argument and it is sufficient.

**One supporting claim made earlier is withdrawn, because it is false.** The earlier text said the group key
is also "what `governance/decided-rules.json` already decides one row at a time", concluding that the unit
of severity is the unit of decision. Measured: `decided-rules.json` holds 124 rows and **never names
`db:table (unowned)` as a target at all** (`git grep -ci unowned governance/decided-rules.json` → 0; the 30
distinct targets are listed in `feasibility.md` P20). **Nine of the 31 live keys — the seven
`db:table (unowned)` keys plus `framework → db:table (other) [table:write]` and `[table:read]`, together 119
of the 221 violations — have no corresponding decided row**; their verdicts come from model clauses, not
from decided rows. The grain choice does not need the claim, so it is dropped rather than defended.

---

## 2. Decisions (locked)

**D1 — The schema-test files change per the verdicts the gate recorded; no table-rule change, no
baseline exception, ZERO founder rulings left open.**
Drafted Ruling 16 was **rejected**; plan.md's carve-out clause is withdrawn; nothing stays partial
and no keep-partial ruling exists. The per-file verdicts (full record with evidence:
`schema-test-decision.md`):

- **`foreign-keys.integration.test.ts`** (10 tests today; 41-test P3 baseline covers it):
  - *"rejects deleting a team while a teamMembers row references it"* (:76-84) — **stays.**
    Production deletes teams (`deleteTeam`, P16), so the operation is production-performed; the
    membership RESTRICT FK (`schema.ts:129`) is what forces `deleteTeam`'s members-first order, so
    the constraint is load-bearing for the production path. Arrange is simplified to insert exactly
    the pair (team + membership row) instead of the five-entity seeder followed by three deletes of
    tables production never deletes — same probe, same assertion, strictly simpler and every
    arranged entity complete.
  - *"rejects deleting a teamMembers row while a user references it (if FK exists)"* (:86-100) —
    **deleted under Ruling B.** It contains zero assertions; the probe sits in a `try/catch` that
    tolerates both outcomes (its own comment says so). It cannot fail. Found by the P17 sweep.
    Reported per Ruling D, not worked around: the probed operation **is** production-reachable
    (`deleteTeam` deletes `teamMembers` at `team-lookup.ts:305`, live via the POST /teams rollback)
    and the FK the title hedges on **does** exist (`users.teamId → teamMembers.id` RESTRICT,
    `schema.ts:69`) — so a live test here would stay. This one is not live: it asserts nothing, and
    Ruling B deletes a dead test outright, never rewrites it into a real one. The now-untested
    constraint is recorded as an accepted cost in §6; a real test of it is a separate work package.
  - *"rejects deleting a team while a bet references it"* (:102-115) — **stays, reworked.** The
    arranged team **receives its membership companion** (Ruling C, no exceptions — this is the
    entity the rejected Ruling 16 would have kept partial). That companion's own RESTRICT FK would
    over-determine the asserted rejection, so the honest resolution (Ruling C's first-preference
    option): after arranging team + membership + bet, the test removes the membership row —
    `db.delete(teamMembers).where(eq(teamMembers.teamId, "p1"))` — **mirroring the owner's own
    deletion order** (`team-lookup.ts:305` deletes members before `:306` deletes the team), then
    asserts exactly the assertion it asserts today: `expect(db.delete(teams)…).rejects.toThrow()`.
    At act time the only RESTRICT child is the bet — the assertion has a single sufficient cause
    again and proves precisely what it proved before. The act-time state is not merely transient:
    `deleteTeam` is **non-transactional** (`team-lookup.ts:305-306` — two sequential awaits on `db`,
    no `db.transaction`), so when the team delete at :306 rejects on the bets FK, the membership
    deletion at :305 has already committed — production **durably** produces a member-less team in
    exactly the scenario this test probes (round-3 N2, verified). A comment at the removal cites
    `team-lookup.ts:304-307` and the non-transactionality; the `@lore` note carries that fact as the
    actual proof of production-reachability. This is an arrangement change, not an assertion change; nothing becomes
    easier to satisfy.
  - *"rejects deleting an agent while a session references it"* (:117-128), *"…while a routine
    references it"* (:186-199) — **deleted under Ruling D.** Production never deletes `users` (P16:
    soft-retire only) and no user-deletion mechanism exists in code at all (P18). The round-3
    critique correctly showed Rulings B/C alone did not reach these; Ruling D now does, explicitly.
  - *"rejects deleting a thread while a message references it"* (:130-161), *"…while an item
    references it"* (:163-184) — **deleted under Ruling D.** Production never deletes `threads`
    (P16); no mechanism exists (P18).
  - *"rejects deleting a knowledge_items row while knowledge_edit_log rows reference it"*
    (:207-241), *"…while knowledge_conflicts rows reference it"* (:245-277) — **deleted under
    Ruling D.** Production never deletes `knowledgeItems` (P16); the only lifecycle verb is the
    soft archive (P18). The tests' own doc comment appeals to "operators must explicitly archive or
    soft-delete the log before removing the item" — an operator with database access, not a
    production code path, which is the ruling's criterion. Their four lint sites (:210, :233, :248,
    :270) clear by deletion, not by companion.
  - *"verdict messages survive item deletion"* (:284-341) — **deleted under Ruling D.** Production
    never deletes `items` (P16); no mechanism exists (P18).
  - Net: the file keeps 2 of 10 tests; the shared seeder and the now-unused imports
    (`sessions`, `routines`, `messages`, `threads`, `items`, `users`, `tasks`,
    `knowledgeEditLog`, `knowledgeConflicts`, `knowledgeItems`) are removed with them
    (builder trims mechanically; `bets`, `teams`, `teamMembers` remain).
- **`schema.integration.test.ts`** (4 sites: 438, 461, 474, 486) — **(a), companion added.** CRUD
  probes; a minimal projection row (`{ id, knowledgeItemId }`) is invisible to every assertion; the
  file's insert-FK rejection tests (:567-664) assert insert rejections on deliberately nonexistent
  ids that no companion row ever creates — inert (P11). Production inserts/updates knowledge items
  constantly; nothing here probes a delete.
- **`migration.integration.test.ts`** (1 site: 63) — **(a), companion added.** CRUD-after-migrate
  probe; a `teamMembers` row alongside changes nothing the test selects.
- **`session-requests.integration.test.ts`** (1 site: 59) — **(a), preferring deletion of the
  vestigial row.** The `teams` insert is referenced by nothing in the file; C1 permits removing
  proven-unreferenced arrange rows; builder re-runs the file to confirm no hidden FK needed it.

**D2 — Mechanical fixes complete the pair at the site; shared helpers only where a package already
has a shared dev-helper home.** (Mechanics unchanged from the approved round-2 revision; the
masking-exclusion clause is removed.)
- `layers/core-api` package (24 files, 37 sites): extend `layers/core-api/src/__tests__/_helpers.ts`
  with two parametrized pair-writing seeders mirroring the owners' writers — `seedTeam(db, {...})`
  → `teams` + `teamMembers` (defaults mirroring `createTeam`: capacity 5, activeBets 0,
  formedAt = createdAt) and `seedKnowledgeItem(db, {...})` → `knowledgeItems` + a minimal
  `knowledgeAppProjection` row (projection fields passthrough, others null, as the owner's `create`
  writes). **The helper is the default.** A site may keep its insert and add the companion inline
  only where a helper call would disturb surrounding arrange code, and then carries a one-line
  comment naming the specific disturbance. Review checks each core-api site mechanically: helper
  call, or comment — neither is a finding.
- All other packages (15 files — 4 of them D1's framework/db files): inline companion insert next
  to the existing insert. No new cross-package helper, no production export.
- New rows use ids derived from the entity they accompany (e.g. `<teamId>-members`), never
  colliding with ids the test already uses; `users.teamId` references `teamMembers.id`, so added
  membership rows must not shadow ids tests pass as `teamId` on users.
- **Per-entity completion is absolute — no exclusions** (Ruling C). If completing an entity makes
  an assertion over-determined somewhere the sweeps did not predict (P11 + P16 say the two
  `foreign-keys` team tests are the only live delete-rejection probes left in the touched set), the
  builder resolves it in Ruling C's order — make the assertion prove its own constraint alone
  (e.g. the D1 remove-in-owner-order shape), or show from production code that the probed operation
  has no path and delete the test under Ruling B — and **reports the resolution in the PR**. Never
  a silent skip, never a silent completion that second-causes an assertion, never an exception.

**D3 — The orphan-companion site is fixed by removing the raw write, not by adding one.**
(Unchanged.) `app-runtime-domain-observability.integration.test.ts:61-70` creates the item through
`POST /api/knowledge`, then raw-updates the projection for `layer`/`kind` plus three score fields
its assertions never read. Fix: pass `layer`/`kind` in the POST body (the owner's `create` accepts
them, `knowledge-repository.ts:280-289`); delete the raw update. Fallback if the route schema
rejects them: the owner's exported `update(db, id, changes, expectedVersion)`
(`knowledge-repository.ts:398`) for exactly the asserted fields.

**D4 — The four `drizzle(client, { schema })` hand-rolls route through the database package's own
factory; no new db export.** (Unchanged — and explicitly NOT relaxed: Ruling A covers AI requests
only; the database door stands for development.) `ah1/ah5/ah6-test-server.ts` and
`eval/src/runner.ts:68-79` compose two existing `db:client` exports —
`applyMigrations(dataDir, migrationsFolder)` (`framework/db/src/migrate.ts`) against a per-boot tmp
dir, then `createPgliteDb(dataDir)` (`framework/db/src/connection.ts:71`) on the same dir.
Alternative for the three ah scripts only (never `runner.ts` — its `@lore X7` records
`createTestDb` as vitest-coupled): `createTestDb()` from `@hyperidle/db/testing`. No new export on
`framework/db`, no surviving `schema` namespace import. Zero production `db.query.*` usage
repo-wide, so dropping the schema-bound client changes no runtime behavior.

**D5′ — Dead tests are deleted, never repointed (Ruling B; replaces the withdrawn D5).**
- `applications/desktop/__tests__/migrate.test.ts` — the test *"does NOT call seed() — desktop
  starts with empty database"* (:62-69) mocks and asserts on `seed`, a symbol
  `framework/db/src/index.ts` has not exported since `seed.ts` was deleted. The mock can never be
  invoked; the test is vacuously green forever. **Delete the test, the `seed` entry in the
  `vi.mock` factory (:34-37), and the `seed` dynamic import (:63).** That deletion is what closes
  the `application → db:unknown` entry (nothing imports the ghost anymore). It is NOT repointed at
  `seedDemoWorld`/`applyFactoryBootstrap`. Accepted cost, stated per the ruling: "the desktop
  migration path writes no seed data" becomes untested — it never actually was; a real test of that
  guarantee is a separate work package. The file's other eight tests assert on live symbols
  (`applyMigrations`/`isDowngrade` are real barrel exports) and real behavior; they stay.
- **Sweep results (P17, method recorded there):** across all 49 touched files —
  1. `foreign-keys.integration.test.ts:86-100` — zero `expect` calls, outcome-tolerant `try/catch`
     around the probe: cannot fail. Deleted (already in D1).
  2. `layers/core-api/src/__tests__/knowledge-access.integration.test.ts:172` —
     `expect(() => new Date(row?.accessedAt as string)).not.toThrow()`: the `Date` constructor
     never throws on any input (an invalid string yields `Invalid Date`), so the assertion is
     guaranteed by construction. **The assertion line is deleted**; the test itself has four live
     assertions above it and stays.
  3. Nothing else: `vi.mock`/`vi.doMock` exists in exactly one touched file (`migrate.test.ts`) and
     its other mocked symbols are live exports; zero literal-subject `expect` calls; zero other
     empty-catch probes; the remaining `not.toThrow`/`toBeDefined` hits are on calls that can
     genuinely reject or values a query can genuinely fail to return.

**D6′ — The AI one-seam requirement is production-only: the rule relaxes in the development world
(Ruling A; replaces the withdrawn D6).** `tools/eval/src/judges.ts` is **not rewritten** — a
development file may construct the vendor SDK directly. The `tooling → raw runtime [capability]
development` entry clears by a rule change, derived from the world, not a listed exception:

- **The change**, in the development relaxation itself (`governance-model.ts:351-399`): remove the
  `(target.sort === "raw-runtime" && arch.oneDoorSurfaces.rawRuntime)` arm from the `guarded`
  predicate (:369-375). A development crossing to `raw-runtime` then falls through to
  `development-may-arrange-the-world` — the same world-derived shape Ruling 13 gave table writes.
  The now-unread `oneDoorSurfaces.rawRuntime` boolean and its note are deleted from the
  `Architecture` interface (:126) and from `governance/architecture.json` (:131-132). The
  Ruling-14 comment at :365-368 is updated to record the narrowing (dated founder ruling,
  domain-worded, no WP ids).
- **What stays forbidden — the relaxation deletes nothing in production.** `decideProduction`
  branch 5 (`hold-one-runtime-door`, :259-261) reads `arch.rawRuntime.host`
  (`architecture.json:123`), not `oneDoorSurfaces`; it is untouched. Every production actor outside
  `harness-registry` remains forbidden from constructing a vendor SDK or spawning an agent CLI, and
  that stays attack-pinned by the three standing production attacks (`governance-attacks.ts:303`,
  `:313`, `:335`, all expecting `service → raw runtime [capability] production` violations) plus
  their clean control (:338-348) — none of which changes.
- **Verdict-data edits this requires** (Ruling A supersedes contract C2 for exactly these and
  nothing else): `governance/decided-rules.json` — the two rows with development `"forbidden"` for
  target `raw runtime` flip to `"allowed"` (`service →` at :1060, `tooling →` at :1072; the two
  owner rows :1367-1390 are already allowed/allowed and do not move); a dated ruling note is added
  beside the `ruling14` note recording the production-only narrowing. Row count stays 124.
- **Standing tests/attacks that pin the old behavior and must move with the rule:**
  `framework/db/src/__tests__/governance-model.test.ts:400-421` ("holds the one runtime door in
  BOTH worlds") is rewritten: outsider forbidden in production, **allowed** in development (clause
  `development-may-arrange-the-world`), owner allowed in both — the reproduction suite then passes
  against the edited rows. `governance-crossings.test.ts:525-531`'s synthetic architecture literal
  drops the deleted field — **edited by hand**: the literal is cast `as unknown as Architecture`
  (:532), so the compiler will NOT flag it after the interface field is deleted (round-3 N1; P15
  corrected). The attack `raw-runtime-in-a-test` (`governance-attacks.ts:349-363`),
  which expects a development violation, flips to a clean-expectation control (domain-named, detail
  text citing the production-only ruling) — the development relaxation becomes standing-pinned in
  the attack lane exactly as the production ban already is.
- **Proven by spike (P15):** with only the one-line model change, the lint reports
  `221 production + 66 development` (development groups 7 → 6; the `tooling → raw runtime` line is
  the only change; production delta measured `+0` by the baseline generator's dry run), and the
  only failures are the two this plan already schedules: the stale baseline entry (cleared by
  `npm run governance:baseline`) and the one development attack (flipped as above). 46/47 attacks —
  including all three production raw-runtime attacks — still pass under the spike.
- **Scope discipline:** this relaxation covers AI requests only. The `db:schema-ns` /
  `db:unknown` door work (D4, D5′) is untouched by it — those clear by fixes, not rule changes.

**D7′ — Severity is one value per architectural rule, declared in `governance/rule-severity.json`,
default `error` (Ruling E; replaces the withdrawn D7).**

- **The file.** `{ "governanceRuleSeverity": true, "note": "…", "severity": { "<rule key>": "warn", … } }`.
  Keys are group keys — `<source> → <target> [<kind>] <world>`, the strings `groupKey` already produces
  and the lint already prints. Values are `"error"` or `"warn"`, nothing else. **An absent key is at
  `error`**, so the file lists only what is not yet clean: **31 entries, every one `"warn"`, every one
  ending ` production`.** No file paths, no counts, no adoption dates, no notes about who will fix what.
  It is roughly 35 lines against the deleted file's 270, and — the difference that matters — it makes
  **no claim about reality**, so it can never disagree with reality and nothing ever regenerates it.
- **How it is read.** `loadRuleSeverity()` joins the other loaders in `scripts/governance-context.ts:162-165`;
  the `RuleSeverity` type joins `TableOwners` and `MisplacedFiles` in `scripts/lib/governance-registry.ts`.
  `crossingRules` (`scripts/rules/crossings.ts:51`) takes **`severityOf: (ruleKey: string) => Severity`**
  where it took `baseline: Baseline`, and its per-violation body becomes `severity: severityOf(violation.key)`.
  The `seenPerSite` / `isNewDebt` / `newness` block (`:56-71`) is deleted outright.
- **That signature is half the reintroduction guard, and it is the honest half.** `severityOf` can see the
  rule key and nothing else — no path, no line, no count, no census. Restoring a per-file allowance means
  widening it, which fails to compile at every call site and lands as a visible diff in a reviewed file.
  D11 covers the other half (the record files and the CLI).
- **What stays exactly as it is.** A `warn` finding still prints **one line per site** — AU28's founder
  ruling on that is untouched, because the sibling that clears a rule needs the sites — and still carries
  `world` and `group`, so `printKnownDebt`'s per-world totals and the summary line's
  "… production + … development known violation(s) at warn" keep working with no change. `--errors-only`
  keeps meaning "the gate without the debt".
- **What must NOT be built, because it is the likeliest way this regresses.** A check that a rule sitting
  at `warn` with **zero** live violations is an *error* is the stale-baseline check reborn: a red build as
  the reward for fixing the last violation, naming no architectural fact. **It is forbidden.**
  Symmetrically, nothing anywhere compares a live count to a stored one.
- **The report that replaces it, specified exactly — "the lint reports it" was too vague to build and too
  vague to test.** One pure function beside `loadRuleSeverity`:
  `readyToFlip(severity: RuleSeverity, liveKeys: ReadonlySet<string>): readonly string[]` — every key the
  severity map holds at `"warn"` that appears in no live violation, returned as a message line
  (`<key> — clean; this rule can go to error`). `runLive` prints them as a `NOTE` block in exactly the shape
  `unplacedDbSymbols` already uses (`scripts/governance-lint.ts:282-285`). Three properties, each
  deliberate:
  - **It returns `readonly string[]`, never `Finding[]`, and that is the structural half of the ban.** A
    `Finding` is the only thing in this lint that can carry a severity, so turning the report into a gate
    means changing the return type and routing it through `runRules` — a compile-visible diff in a reviewed
    file. Same argument as `severityOf`'s signature, and it is the honest half.
  - **It cannot perturb AC-4′'s numbers.** `printKnownDebt` counts warn findings that carry a `group`
    (`:78`) and the summary counts warn findings by `world` (`:292-293`); a plain string carries neither, so
    `221 production + 0 development known violation(s) at warn` is unaffected **by construction**. That
    matters because nothing fires today — all 31 keys carry violations — and the first sibling to clear a
    key would otherwise move a number this plan asserts as fixed.
  - **It is the unit D9′ case 3 tests** (rewritten — see there), which is what makes the report falsifiable
    rather than decorative.
- **Accepted cost, restated from the ruling so the next reader does not rediscover it as a bug:** a rule at
  `warn` warns for **all** its violations, new ones included. Nothing blocks new debt on a rule that is not
  yet clean. That is the trade the founder made for a lint that never fails on bookkeeping.

**D8′ — The deletion closure: what goes, and everything that names it (Ruling E; replaces the withdrawn
D8, which deferred the deletion and is now unconditional and owned here).**

Enumerated so that a half-removal shows up as an omission rather than as a lint that still reads as if it
keeps books. Every line below was located by reading the file, not by recalling the design.

**Deleted outright — 2 files**

| path | what it is |
|---|---|
| `governance/baseline.json` | 270 lines, 31 groups, 221 counted sites. Unconditionally, not "if it empties". |
| `scripts/governance-baseline.ts` | 86 lines — the generator, and the only writer of the above. |

**Code deleted — by file**

| file | what goes |
|---|---|
| `scripts/lib/crossing-report.ts` | `BaselineGroup` (`:79-82`), `Baseline` (`:84-88`), `RatchetVerdict` (`:90-96` — already dead, nothing reads it), `LiveGroup` (`:98-101`), `refuseGrowth` (`:104-140`), `compareBaseline` (`:142-198`), the “the baseline” banner (`:75-77`), and the three `@lore` blocks that document the mechanism (`:2-15`, `:106-117`, `:148-162`). What survives is `targetLabel`, `sourceLabel`, `groupKey` — **and their own doc comments name the deleted
record too**: `:20` ("how a target is named in a finding and in the baseline key") and `:71` ("the stable key
a violation is grouped and **baselined** under"). Both are rewritten; a surviving symbol documented against a
deleted record is the same half-removal as a surviving module. **The file is renamed `scripts/lib/crossing-keys.ts`** and its header rewritten: a module called `crossing-report` that only builds keys is exactly the residue Ruling E's closure is about. Importers to update: `scripts/rules/crossings.ts`, `scripts/governance-lint.ts`, `scripts/governance-context.ts`, `scripts/lib/governance-attacks.ts`, `framework/db/src/__tests__/governance-crossings.test.ts`. |
| `scripts/rules/crossings.ts` | `baselineRatchet` (`:99-124`), `liveGroups` (`:40-49` — its only consumers were the generator and the ratchet), `CrossingRuleInput.baseline` (`:21`), the `seenPerSite`/`isNewDebt`/`newness` block (`:56-71`), and the module header's severity paragraph (`:7-8`), rewritten to state the new dial. `violationsOf` stays (the lint and the attack harness both use it). |
| `scripts/governance-context.ts` | `loadBaseline` (`:163`), the `Baseline` type import (`:19`), and the `@lore` at `:9-10` whose whole subject is that the lint and the generator share this module. Add `loadRuleSeverity`. |
| `scripts/governance-lint.ts` | the `loadBaseline` import (`:41`), the `Baseline` type import (`:49`), the `baselineRatchet` import (`:59`), `EMPTY_BASELINE` (`:158-159`), `baseline: EMPTY_BASELINE` in `buildRules` (`:152`), the `buildRules` `@lore`'s ratchet sentence (`:125-126`), `alsoRegistered: ["baseline-ratchet"]` and its comment (`:171-173`), `const baseline = loadBaseline()` and `baseline` in `ruleInput` (`:227-231`), `baselineRatchet(ruleInput)` (`:251`). |
| `scripts/lib/governance-attacks.ts` | the `Baseline`/`compareBaseline` import (`:48`), the `baseline-growth` standalone case (`:1023-1039`), **the `AttackTree.alsoRegistered` field itself** (`:663-676`) and its use at `:919` — an escape hatch whose doc says "today just the ratchet" invites refilling, and with the ratchet gone the list is empty; the runner `@lore` at `:884-886` and the comment at `:828`. |
| `scripts/lib/crossing-detectors.ts` | the comment at `:35` ("a baseline entry for that would be nonsense") — rewritten to say the same thing about the census refusing a verdict, without naming a mechanism that no longer exists. |
| `scripts/rules/no-laundered-re-exports.ts` | the comment at `:52` justifying a deferral by "it re-keys live baselined imports". The justification evaporates. Rewrite it to state the deferral's real remaining reason, or say plainly that the reason is now weaker — **do not silently keep a stale justification**. |
| `scripts/rules/misplacement-ledger.ts` · `scripts/lib/governance-registry.ts` | the `@lore` blocks that describe the baseline as this record's sibling mechanism (ledger `:10-27`, three blocks; registry `:27-34`). These are rewritten **whatever the founder decides in D13** — they describe a mechanism that will not exist. |

**Registration, scripts, tests, docs**

| where | what goes |
|---|---|
| `package.json:36` | the `"governance:baseline"` script entry. **Verified safe to delete:** nothing invokes it — not `lint`, not `verify`, not `.github/`. It was manual-only by design. |
| `framework/db/src/__tests__/governance-crossings.test.ts` | the whole `describe("AU28 — the ratchet")` block, `:689-842` — five top-level cases plus the seven-case `describe("the baseline may only shrink")`, which is where `--adopt` is exercised (`:813-840`); **12 tests**. The `Baseline`, `compareBaseline` and `refuseGrowth` imports (`:20-23`; `groupKey` and `targetLabel` stay). The file header's "and the ratchet" (`:2`). The warn→error flip case at `:1108-1176` is **rewritten, not deleted** — see D9′. |
| `governance/README.md` | the section "There is no warn/error dial" (`:69-89`) — replaced by the severity dial; the shape table (`:27-31`) gains `rule-severity.json`; the `misplaced-files.json` section (`:91-108`) and the "Changing something" bullet at `:135-137` describe the baseline as their sibling and must be rewritten under either D13 outcome. |
| `docs/guides/developer/commands.md` | `:69` lists `baseline.json` among the governance files; `:75` is the `governance:baseline` table row naming `--adopt`. Both go; the file list gains `rule-severity.json`. |
| `docs/guides/developer/linting-and-formatting.md` | `:40` ("No warn/error dial") and `:41` ("The baseline may only shrink", naming `--adopt`) — two bullets, both false after this change, both rewritten. |
| `CLAUDE.md` | one sentence in the production/development section states that `misplaced-files.json` "warns on every lint run, and the count only shrinks". Touched **only if** the founder approves D13. The other `baseline` occurrence in that file ("don't drain a pre-existing baseline you didn't cause") is about lint debt generally and is not this mechanism. |

**Prose that outlives the code — the completed residue sweep (B1).**

Round 5 found a residue that both AC-5′ searches were built so they could not see, and the real defect was
that the general question had not been asked: *what other enforced artifact carries prose about the
mechanism being deleted?* It has now been asked mechanically — every tracked file under `governance/`, every
`@lore` block, every rule-file comment, every README and developer-guide page, and `.pipeline/AU.md` —
searching `baseline`, `ratchet`, `--adopt`, `baseline.json`, `governance:baseline`, `shrink-only` with
`git grep -na` (commands and raw output in `feasibility.md` P22/P26). Everything the tables above enumerate is
confirmed and unchanged. **Round 6 found that asking it mechanically was still not enough**: three sibling
bullets name the mechanism by its *property* ("the baseline is shrink-only") and one names it as "the
ratchet", so the round-5 sweep — keyed to identifiers, filenames and npm scripts — could not see them. The
token set gained `shrink-only`; the `ratchet` phrasing has no addable token and is closed by this table and
review alone, which clause 5 below states as a limit. **These are the sites the sweeps missed, rounds 5 and 6
together:**

| where | what is stale, and what replaces it |
|---|---|
| `governance/misplaced-files.json:3` — the committed `note` of a **surviving enforced artifact** | Four separate false statements after this PR: that it is "disjoint from `baseline.json`" (a file that will not exist); that it follows "the same principle as the baseline, **see the lore at the top of `scripts/lib/crossing-report.ts`**" — a path D8′ itself renames, pointing at lore D8′ itself deletes; that the lint "fails when the live count is ABOVE it … or BELOW it" (the shrink-only mechanism, in both directions); and "There is no generator: **unlike the baseline**, nothing derives this file". Rewritten to describe this record on its own terms — no sibling mechanism, no cross-file lore pointer. **Planned unconditionally, and deliberately independent of the founder's open D13 question:** the note's description *of the baseline* is stale whether or not `resolvedFiles` survives. If D13 is declined, the sentence about the count stays true and stays; if D13 is approved, that sentence leaves with the count. Either way the four baseline references go, and **the count decision stays open where it is.** |
| `scripts/rules/misplacement-ledger.ts:85-86` | The comment introducing the count check calls it "The ratchet. Both directions … the second is what turns a ratchet into a rubber stamp" — an argument borrowed from a mechanism that will not exist. Rewritten to state what the check does on its own terms. D13-independent (if D13 is approved, check and comment both go). |
| `scripts/lib/crossing-report.ts:20` and `:71` | Doc comments on two **surviving** symbols (`targetLabel`, `groupKey`) that name "the baseline key" and "baselined under". Folded into that file's row above. |
| `scripts/lib/governance-attacks.ts:1041` | The attack id `misplacement-ledger-ratchet` names the deleted mechanism for a check that is not it. Renamed after the check it actually drives. The id is D13-independent; its two count assertions are D13's. |
| `.pipeline/AU.md:48`, `:50`, `:51`, `:52` — the **track registry**, which is where the three siblings look for how to flip their rules | `:48` tells `AU29` it clears "baseline entries … using … the `governance:baseline` generator"; `:50` tells `AU31` it "needs the crossing model and the baseline"; `:51` describes this work package creating "new development entries"; `:52` is false in every clause — "whichever of the four clears the last entry deletes `governance/baseline.json` and the `--adopt` escape hatch in the same commit. Since the baseline is shrink-only, each work package already promotes its own rules to error as it goes, so there is nothing to defer to a final step." Rewritten to Ruling E's model: each work package clears its own group keys, removes those keys from `governance/rule-severity.json`, and its rules bite with its own PR; the record and the generator are gone, deleted here, not by whoever finishes last. |
| `.pipeline/work/AU29/plan.md:11,34,35,50,51` · `AU30/plan.md:36,51,52` · `AU31/plan.md:36,51,52` — the lines that **name** the mechanism | The three siblings' own acceptance criteria still instruct the deleted mechanism ("every baseline entry cleared is deleted from `governance/baseline.json`", "`npm run governance:baseline` is the only way the baseline file is written", and the identical "whichever gets there last owns it" clause). **Ruling E already amends these** — it says the deletion is unconditional and this work package owns it "rather than falling to whichever of the four clearing work packages finishes last", which directly contradicts `AU29:51`/`AU30:52`/`AU31:52`. So correcting them executes a founder ruling rather than expanding scope. Each is replaced by the severity-dial instruction. **`AU29:11` is the one that is not a bullet**, and it needs naming precisely because it is also where `AU29`'s file set and symbol list live (round-6 N2): the edit there is **exactly one sentence** — "`governance/baseline.json` holds every one of these as a known violation tagged `W1` or `W5-W6`, and `npm run governance:baseline` regenerates the file" — restated as: these sites are the violations under `AU29`'s group keys, and those keys carry `"warn"` in `governance/rule-severity.json` until `AU29` clears them and removes them. Everything else in that paragraph — the thirteen `architecture.json` modules, the `db:util` anomaly and its three symbols, the four `db:unknown` symbols, `factory-bootstrap.ts`'s write and read sites, the two `framework/shared` bus sites — **is the file set and is not touched.** |
| **`.pipeline/work/AU29/plan.md:33` · `AU30/plan.md:35` · `AU31/plan.md:35`** — the identical promotion bullet, which named no token of the round-5 set (round-6 B4) | Verbatim in all three, under **Contracts / constraints**: "The baseline is shrink-only, so this work package promotes its own rules as it goes: clearing a group's last site deletes the entry and that rule is at error from the same commit. **There is no separate promotion step to remember, and none to defer.**" Under **Ruling E item 3 there is a promotion step**, and it is the single thing the ruling asks a sibling to do — clear your group keys, then **remove those keys from `governance/rule-severity.json`** so the rule bites with your own pull request. That is precisely the instruction this closure writes into `.pipeline/AU.md:52` for these same three work packages, so leaving the bullet standing would make each sibling's own plan contradict the track registry on its most consequential line. Rewritten to Ruling E's model: promotion **is** a step, it is one key removed from `governance/rule-severity.json`, and it belongs in the same pull request as the last cleared site — nothing is deferred to another work package, and there is no record to delete. **Missed by enumeration, not excluded by judgement:** the bullet sits directly above an enumerated line in all three files (`AU29:34`, `AU30:36`, `AU31:36`). |
| `.pipeline/work/AU30/plan.md:28` — a **Plan calls** clause, same class | "Sequence the five cheap assignments first so **the ratchet records progress** while the sessions question is still open; the plan should say explicitly that **no rule promotes until the last one lands**." **First clause: false, and it goes.** There is no ratchet and nothing records intermediate progress — a rule leaves `rule-severity.json` only once every site under its group key is clear. **Second clause: true, and it stays — re-grounded rather than deleted.** The reason changes, and the correct reason is one `AU30` already gives twice: the group key carries no table name (`service → db:table (unowned) [table:write] production`; verified against the seven live `(unowned)` keys, all six unowned tables under each), so the key cannot be removed until the last table is owned. That is the same aggregation `AU30/plan.md:7` and `.pipeline/AU.md:29` cite for this being one work package rather than six. **Those two lines are correct today and after this pull request, and are not touched** — restating this clause as "each rule promotes as it goes" would have contradicted them, which is why the correction is a re-grounding and not a replacement with the sibling bullet's new text. |

**The sibling-plan edit stated as what it touches, not as what it forbids (round-6 B4).** The round-5 form
— "no other line of any sibling plan is touched" — was a rule that read as licence to leave a false line
standing, and it did exactly that for four lines. Replaced by an exhaustive list of the lines this work
package edits in a sibling plan, and it is the whole set:

| file | lines touched | nature of each edit |
|---|---|---|
| `.pipeline/work/AU29/plan.md` | `:11` (one sentence only) · `:33` · `:34` · `:35` · `:50` · `:51` | one prose sentence; the promotion bullet; three mechanism bullets/ACs; the "whichever gets there last" AC |
| `.pipeline/work/AU30/plan.md` | `:28` (one clause re-grounded, one clause removed) · `:35` · `:36` · `:51` · `:52` | the Plan-calls clause; the promotion bullet; the mechanism bullet; two ACs |
| `.pipeline/work/AU31/plan.md` | `:35` · `:36` · `:51` · `:52` | the promotion bullet; the mechanism bullet; two ACs |

Every edit above replaces a statement **made false by Ruling E** with the statement Ruling E makes true, in
the same place, at the same length. **What no edit may change, in any sibling plan:** its scope, its
out-of-scope list, its file set or symbol list, any violation count, any dependency edge, its complexity or
tier, and any line not in the table above — including `AU30/plan.md:7` and `.pipeline/AU.md:29`, which state
the aggregation correctly and stay verbatim. A builder who finds a further false line **reports it rather
than fixing it silently**, because the count of lines edited in a sibling's plan is itself reviewable.

**Deliberately not touched:** `.pipeline/work/AU28/plan.md:177` ("No warn/error dial. Every rule is an
error; `governance/baseline.json` lists the violations …"). That is the shipped record of what `AU28`
actually built, and Ruling E revises `AU28` Ruling 2 rather than rewriting its history. Editing a completed
work package's spec to match a later ruling would destroy the only account of why the mechanism existed.

**Checked and confirmed NOT residue** — a different mechanism that happens to share a word, listed so the
next reader does not re-open them: `scripts/obs.ts:10,73` (an A/B arm literally named `baseline`);
`scripts/typecheck-gate.ts:11` and `framework/api-contract/src/__tests__/typecheck-verdict.test.ts:15,167`
(the **typecheck** debt ratchet, an unrelated mechanism, also named in `CLAUDE.md:53`); `CLAUDE.md:40`
("don't drain a pre-existing baseline you didn't cause" — lint debt generally);
`.claude/rules/testing.md:73,77` (the harness model matrix and the deleted honest-harness allowlists);
`.claude/skills/visual-polish/SKILL.md:73` and `.claude/process/compound-candidates.md` (visual snapshot
baselines and lint-debt prose); `eslint.config.ts:67,114,234,292,546` (`eslint-plugin-design`'s own
warn→error plans); the drizzle journal's re-baselining; `docs/architecture/runtime-simplification.md:114`
and every CSS `shrink-0`. Round 5's finding that the sweep needs no reach into `.claude/**` or `tools/**`
is re-confirmed, now with the reason recorded per site.

**Mechanical consequences of the deletion, checked rather than assumed**

- **Rule count is unchanged at 18.** 8 non-crossing + 9 crossing + `baseline-ratchet` today; 9 non-crossing
  (the new D11 rule) + 9 crossing after. `runRules` refuses an empty rule set and duplicate ids; neither
  is at risk.
- **Attack coverage (property 4) still closes.** Deleting the ratchet removes the one rule that needed
  `alsoRegistered`; the new D11 rule is a normal registered rule and gets its cases the normal way. Live
  count today is 47; the builder reports the new number.
- **The census count does not move, so no floor is at risk.** Stated as arithmetic rather than a
  transcribed number, because the tree moves between rounds (3309 at round 4, 3310 at round 5, **3311
  measured now**): −2 tracked files (`governance/baseline.json`, `scripts/governance-baseline.ts`), +1
  (`governance/rule-severity.json`), +1 (`scripts/rules/no-per-file-allowances.ts`), the rename net 0 →
  **net zero**, against `MIN_TRACKED_FILES = 2976` (`scripts/governance-context.ts:45`). `floors-tight`
  judges that floor by band, not by equality. No floor is rewritten.
- **`knip` must stay green, but it is NOT the gate on the leaving exports — say so rather than trusting it.**
  `knip.json`'s root workspace declares `entry: ["scripts/*.ts!", "scripts/lib/**/*.ts!",
  "scripts/rules/**/*.ts!"]` and sets no `includeEntryExports`, so knip does not report unused *exports* of
  entry files. Proof from the live tree: `RatchetVerdict` (`crossing-report.ts:90-96`) is exported, read by
  nothing, and knip is green. A leftover `refuseGrowth`/`compareBaseline` left **defined but unused** would
  therefore pass knip and pass typecheck; the residue search below is what catches it, and review is the
  only other gate. (knip should not newly *fail* either — no entry names the deleted module and the rename
  keeps the glob — but run both anyway.)
- **The new D11 rule must be registered in BOTH rule lists.** Once `baseline` leaves `CrossingRuleInput`,
  `buildRules` (`governance-lint.ts:128-156`) and `runLive`'s hand-written `RULES` array (`:235-252`) differ
  only by `EMPTY_BASELINE` vs `loadBaseline()` — i.e. no longer at all. Registering `no-per-file-allowances`
  in one and not the other makes it run in a single lane, and the coverage gate reads its rule ids from the
  attack pass (`governance-attacks.ts:919`), so a live-only rule is not even coverage-checked. Collapsing
  the two lists into one is optional; registering in both is not.
- **`buildRules` passes `severityOf: () => "error"`** where it passed `baseline: EMPTY_BASELINE` — the
  honest analogue of the deleted constant's own comment ("an overlaid tree has no debt, so the crossing
  rules judge it against nothing"). Do **not** wire `loadRuleSeverity()` in there. The reason is stated
  accurately rather than inherited: it is *not* that a live map would let a dirty control pass, because the
  `clean` control judgement lists raw crossing violations irrespective of severity
  (`governance-attacks.ts:853-855`) and only its second spread filters `f.severity === "error"` (`:855`), so
  a `warn`-keyed crossing on a control is still reported. What a live map would really buy is a break-test
  suite whose verdicts change when a sibling edits a record file. That is the reason to pin it.

**How the closure is proven — the search, its positive control, and the control-character hazard (B2).**

Round 5 established that AC-5′'s central proof could not fail on the file that matters most. Four fixes,
each measured on the live tree.

1. **The search reads every tracked file, whatever bytes it holds.** `scripts/rules/crossings.ts` carries a
   **literal NUL byte at line 64** — the site separator is written as a raw `\0` inside a template literal
   (`` const siteKey = `${key}<NUL>${file}` ``). `file scripts/rules/crossings.ts` reports `data` and
   **ripgrep silently skips it**. Measured over AC-5′'s own file list: plain `rg -n` returns **39** hits and
   **nothing from that file**; `rg -na` returns **43**; `git grep -na` returns the same 43, byte-identical.
   The four invisible hits are `crossings.ts:12` (the import), `:105` (`baselineRatchet` defined), `:115`
   (`compareBaseline` called) and `:119` (`governance:baseline` in the message). **The canonical form is
   `git grep -na`**: `-a` defeats the binary heuristic and `git grep` is bounded to tracked files, so no
   `node_modules` noise and no untracked scratch file can pad the result. `rg -na` over the same list is
   verified equivalent and acceptable. `CLAUDE.md` names this hazard; the plan now obeys it.
2. **The token set and the file list both widen.** Tokens become `baselineRatchet`, `compareBaseline`,
   `refuseGrowth`, `--adopt`, `governance:baseline`, `baseline-ratchet`, **`baseline.json`** and
   **`shrink-only`**. `baseline.json` is what reaches the `misplaced-files.json` note, and its absence was
   half of why B1 was invisible. **`shrink-only` is added in round 6 and it is the token that would have
   caught B4**: the three sibling bullets say "The baseline is shrink-only" — they name the record in prose
   and the mechanism by its property, so no token keyed to an identifier or a filename could see them.
   Measured on the live tree, `git grep -nai 'shrink.only'` over the same list returns **6 lines in 6 files**
   and reaches all three (`AU29:33`, `AU30:35`, `AU31:35`) plus `.pipeline/AU.md:52` and
   `docs/guides/developer/commands.md:75`, both already enumerated. The list becomes
   `scripts/ governance/ package.json docs/guides/developer/ framework/db/src/__tests__/ .pipeline/AU.md
   .pipeline/work/AU29/plan.md .pipeline/work/AU30/plan.md .pipeline/work/AU31/plan.md` — `governance/` was
   **omitted** from the second search, which is the other half.
   `.pipeline/work/AU28/plan.md` is deliberately excluded (see above).
3. **The search must be seen reporting the ratchet before it is trusted to report its absence.** A required
   step, run **before** any deletion, output committed to `probes/residue-search-positive-control.txt`:

   ```
   git grep -na -e baselineRatchet -e compareBaseline -e refuseGrowth -e 'governance:baseline' \
     -e '\-\-adopt' -e 'baseline\.json' -e 'baseline-ratchet' -- <the list above>
   ```

   **Expected, measured on the live tree with the eight-token set: 78 lines across 20 files, and the file
   list MUST contain `scripts/rules/crossings.ts` (7 hits), `governance/misplaced-files.json` (1) and all
   three sibling plans at 6/4/4 hits (`AU29`/`AU30`/`AU31`).** Those clauses are the whole point —
   `crossings.ts` is the file plain `rg` cannot see, `misplaced-files.json` is the residue the round-4 token
   set could not reach, and the sibling counts are what the `shrink-only` token buys (the seven-token set
   reports 74 lines across 19 files with the siblings at 5/3/3; both numbers are recorded so the builder can
   tell a broken search from a stale one). An output missing any of them is the broken search, and the builder
   stops there rather than proceeding to a proof that cannot fail. Re-run unchanged after the closure →
   **zero hits**, with the one permitted exception named in clause 5 below. A check nobody has watched fail is
   not evidence.

   **And the search doubles as the completeness check on D8′ itself:** all 20 files it reports today appear
   in the closure's edit-or-delete set (`feasibility.md` P22a lists them against the tables, and P26 records
   which rows the search covers and which only the enumeration does). Search and enumeration agreeing is what
   makes "zero hits after" mean *closed* rather than *unlooked-at* — for the rows the search reaches. For the
   rows it cannot (clause 5), only the enumeration and review apply, and that is stated rather than implied.
4. **The NUL byte does not survive, and that is verified rather than hoped.** It sits inside the
   `seenPerSite`/`isNewDebt` block that D7′ deletes outright (`crossings.ts:62-71`), and a byte-level sweep
   of every tracked file under `scripts/` finds **exactly one NUL byte in the entire tree** — that one
   (`feasibility.md` P21: command, output, count). So after T8/T9 nothing under `scripts/` is ungreppable
   and the hazard is gone **by construction**: no delimiter replacement is needed and none is planned. Three
   other tracked non-image files do carry NUL bytes — `framework/shared/src/blocks/block-id.ts` (3),
   `framework/shared/src/__tests__/blocks/derive-blocks.test.ts` (1),
   `layers/core-ui/src/layouts/AppShell.tsx` (1). None is in this work package's search list or edit set, so
   they are **reported as a finding for a future work package, not fixed here** — a file no tool can search
   is a trap, and the next agent should know these three exist.

5. **What this search covers and what it cannot — stated, because a limit read as coverage is how B1 and B4
   both happened.** The eight tokens reach every identifier, filename, npm script, flag and property-name
   phrasing of the deleted mechanism. **They do not reach the bare words `ratchet` and `promotion`, and no
   honest token set can**, because in this repository both words have live non-residue owners that the search
   list contains: `git grep -lai ratchet` over the same list reports `scripts/typecheck-gate.ts` (the
   unrelated typecheck debt ratchet) and `scripts/rules/misplacement-ledger.ts` (the second record, whose
   fate is the founder's under D13), and `git grep -nai promot` reports `.pipeline/AU.md:29` and
   `.pipeline/work/AU30/plan.md:7`, both of which state `AU30`'s rule aggregation **correctly** and must
   survive. Adding either token would make "zero hits after" unachievable without carve-outs for true
   statements, which is worse evidence than an accurately stated limit. **The consequence, named:
   `.pipeline/work/AU30/plan.md:28` is reachable by neither the eight tokens nor any addable ninth. It is
   caught by enumeration and review — it is a row of the residue table above and a step of T9b — and by
   nothing mechanical.** One further honest exception on the other side: the new `shrink-only` token reports
   `framework/db/src/__tests__/governance-lint.test.ts:641`, a `describe` title about the *second* record's
   own shrink-only behaviour, not the baseline's. If the founder declines D13 that line stays true and is
   **permitted residue, named in the report**, alongside `resolvedFiles`; if D13 is approved it becomes false
   and D13's task rewrites it (see D13's cost, which round 5 did not enumerate it in).

**D9′ — Three unit cases in `framework/db/src/__tests__/governance-crossings.test.ts` (D9's second
case re-pointed at the severity declaration; Ruling E).** (1) derivation negative — an owner inserting
only `teams` yields no companion group (unchanged, already committed in `7c6839e5`). (2) **the
warn→error flip, rewritten**: `crossingRules` over one synthetic development companion violation — with
a `"warn"` entry for that rule key the finding is `warn`; **with the key absent it is `error`**. Same
property the old case proved, one input instead of a keyed-by-file allowance, and it is the standing
proof that absent means `error`. (3) **rewritten, because as first written it was a test that could not fail (B3).**
The original — "a `"warn"` entry whose rule key has zero live violations produces no error" — is green
before the change, green after, and green under every implementation of the forbidden check.
`crossingRules.evaluate` maps over `myViolations` (`crossings.ts:82-94`), so a key with zero violations
emits nothing **by construction**, whatever the severity map says; and the forbidden check would reappear
exactly where the old one lived — as its own registered rule about the record file
(`crossings.ts:99-104`: "Separate from the per-kind rules because it is about the baseline FILE rather than
the code") — which the case would never touch. **Ruling B applies as a principle and forbids adding it.**

**The replacement tests the report D7′ now specifies**, which is real new behavior and therefore falsifiable:
`readyToFlip` over a severity map holding two `"warn"` keys, against a live violation set containing only
one of them, returns **exactly one** line and it names the clean key. It goes red if the predicate is
inverted, if the report is dropped, or if the wrong key is named — and, being a red-phase test of a function
that does not exist yet, **it is observed failing before T8 lands**, which is the same standard B2 imposes
on the residue search.

**What is still not pinned by a test, said plainly rather than papered over:** the *ban itself* — that a
clean-rule-at-`warn` must never become an error. No test can assert the absence of a future rule without
being an inverted-coverage check that names its own evasion, and this project has ruled that governance
rules are guidance against honest mistakes, never walls. What holds the ban is (i) `readyToFlip`'s return
type — `readonly string[]`, not `Finding[]`, so the gate cannot be built without a compile-visible
signature change, (ii) the prohibition written into `governance/README.md` where the next agent will read
it, and (iii) **review**. Same posture as D11's stated blind spot, and deliberate.

Test names domain-worded, no work-package ids.

**D10 — No deletion feature is removed: the Ruling-D investigation returned empty (P18).**
Per operation the deleted tests probe:

| Operation | Mechanism in code? | Production-reachable? | Consequence |
|---|---|---|---|
| delete `users` | none, any shape | n/a | nothing to remove; tests deleted |
| delete `threads` | none | n/a | nothing to remove; tests deleted |
| delete `knowledgeItems` | none hard; soft archive is an UPDATE | soft archive live (stays) | nothing to remove; tests deleted |
| delete `items` | none | n/a | nothing to remove; test deleted |
| delete `teamMembers` | `deleteTeam` (`team-lookup.ts:305`) | **yes** (`teams-routes.ts:303`) | mechanism live, untouched; its only test is dead (no assertions) → Ruling B deletion |
| `agentRunConfig` cascade | FK only (`schema.ts:113`); store exports no delete | no (parent never deleted) | schema untouched; nothing else exists; test deleted |

Consequences, locked:
- **Zero production-world files change in this work package.** Every touched file is
  development-named (tests, `__scripts__`), `tools/`, `scripts/`, or `governance/` data. The D6′
  rule edits live in `scripts/lib/` + `governance/` — outside the shipping-root production world.
- **No migration is generated**; `framework/db/src/schema.ts` and `framework/db/drizzle/` are not
  touched. No FK dropped, no `onDelete` changed (Ruling D's own bound).
- **Evidence for the empty removal set** (because Ruling D newly authorized production change, the
  absence must be proven, not asserted): at ship, `git diff --name-only origin/main` is checked to
  contain zero production-world files and zero `framework/db/drizzle/` entries; `npm run verify`
  (which runs knip, knip:production, deps:check, web + desktop builds) passes exactly as it would
  for a development-only change — no removal-specific knip/build/boot obligations arise, and P18
  records why (no production caller existed to sever because no mechanism existed to remove).
- **Governance counts do not move on account of Ruling D:** production stays at the rebase base's
  count (221 today) — before and after identical; development 67 → 0 via the already-planned
  D1–D6′ work. No removal clears or creates a violation in either world.
- **Entanglement: none to report.** The one reachable mechanism (`deleteTeam`) is live and stays;
  no removal shares code with anything because no removal exists.

**D11 — Reintroducing the mechanism fails the build: one registered rule, four shape checks, and a
stated blind spot (Ruling E).**

Ruling E requires that bringing back a baseline, an adopt flag, or any per-file allowance — under any
name — fails. This is designed as a guard against an honest engineer or agent rebuilding the mechanism,
and **not** as a defence against someone deliberately disguising one: the standing project rule is that a
governance rule is guidance for honest mistakes, never a security boundary, and a prior work package
burned five critique rounds learning that. No exotic spellings are chased.

**One new registered rule, `no-per-file-allowances`** — in `scripts/rules/`, taking its inputs injected
like every other rule (no `node:fs`, no globbing; population from the census, sources through the
injected `readFile`). Population: the tracked files under `governance/` plus the surviving governance CLI
entry points — **measured at 9 after the change, not the 5 an earlier draft transcribed**: six record files
(`README.md`, `architecture.json`, `decided-rules.json`, `table-owners.json`, `rule-severity.json`,
`misplaced-files.json`) plus the three CLIs a `package.json` script invokes (`governance-lint.ts`,
`governance-floors.ts`, `governance-new-cells.ts` — `governance-context.ts` is a shared loader, not a CLI,
and `governance-baseline.ts` is deleted). **`minScope: 8`**, one below the live 9: tight enough that losing
an input trips the floor, loose enough that the D13 branch (`misplaced-files.json` retired outright, giving
8) still passes. A floor of 4 against 9 would let the rule lose five of nine inputs and still read as
passing, which is precisely the `au6` failure mode `minScope` exists to prevent
(`governance-rules.ts:9-15`). **The builder re-measures the population at build time and states the number**
rather than transcribing 9.

What it checks, plainly:

1. **`governance/` is a closed set of record files.** Declared: `README.md`, `architecture.json`,
   `decided-rules.json`, `table-owners.json`, `rule-severity.json`, and `misplaced-files.json` while it
   survives. **Any other file under `governance/` is an error**, naming the closed set. This is an
   allowlist of what may exist, not a denylist of names, which is what makes it catch a returning
   record whatever it is called — `baseline.json`, `known-violations.json`, `allowances.json`, `debt.json`.
2. **Every value in `rule-severity.json`'s `severity` map is the string `"error"` or `"warn"`.** A nested
   object, an array, a number, or a value carrying `sites`/`files`/`count` is an error. This is where a
   per-file allowance would most naturally grow back — as a second level under a rule key — and the shape
   check refuses the shape rather than the word.
3. **Every key in that map is a well-formed rule key** — it must parse as
   `<source> → <target> [<kind>] <world>` with `<kind>` drawn from the `Kind` union and `<world>` from
   `World`, both read from the model rather than re-spelled. A path-shaped key fails because it has no
   arrow, no bracketed kind and no world. **Note for the builder: a rule key may legitimately contain
   `/`** — surface targets are named `framework/db`, `framework/design-system` — so "contains a slash" is
   *not* a usable test for a path, and the positive parse is why this check is written as a parse.
4. **The governance CLIs accept no undeclared flag.** The earlier draft's premise was wrong and is
   corrected from measurement: `governance-floors.ts` and `governance-new-cells.ts` parse **no flags at
   all** — zero `--` occurrences in either file — so the declared set is exactly the lint's three,
   `--fixtures`, `--attacks`, `--errors-only` (`governance-lint.ts:303-307`). There is no "whatever the
   other CLIs legitimately take".
   **The check reads argv comparisons, not `--…` text**, and that distinction is load-bearing: a textual
   scan of the surviving lint matches `--quiet` inside a comment about ESLint (`governance-lint.ts:30`) and
   every flag in the usage banner (`:23-25`), so a prose-matching version fails on a sentence. The rule
   collects the string literals compared against `process.argv` — `process.argv.includes("…")` and equality
   against a `process.argv` element — and fails on any that is not declared. It **hard-fails if that scan
   finds zero argv comparisons**, because a scan matching nothing reads as passing forever; the expected
   count today is exactly 3. Still an allowlist: it catches `--adopt`, `--allow`, `--accept`,
   `--grandfather` without naming any of them, and a genuinely new flag costs a one-line declaration —
   the right amount of friction for adding an escape hatch to a governance CLI.

Plus the type-level half already stated in D7′: `severityOf: (ruleKey: string) => Severity` cannot be
handed a file, so a per-file allowance does not compile.

**Break-tests** (property 4 requires them): one overlay case adding `governance/known-violations.json`
and expecting a `no-per-file-allowances` finding, with the untouched `governance/` directory as its clean
control; one standalone case driving checks 2-4 directly — a nested value, a path-shaped key, an
undeclared flag — each expected to fail and the well-formed equivalents expected to be silent.

**What this does not catch, stated so nobody trusts it further than it goes:**

- An allowance written into `architecture.json` or `decided-rules.json` under an innocuous key. Those
  files are inside the closed set and only `rule-severity.json`'s shape is checked.
- **A carve-out written into a clause of `governance-model.ts` for one package or one target name**, making
  a specific crossing `allowed`. This is the largest blind spot, and it is **restated because the earlier
  draft named the wrong shape.** `decide(arch, crossing, world)` (`governance-model.ts:402`) receives a
  `Crossing` of `{kind, source, target}` (`:94-98`) — **no file path**. A path-based carve-out therefore
  cannot be written at all without widening the type or the signature, which is a compile-visible diff at
  every call site. What genuinely is undetectable is a clause keyed on `Actor.name` (`:51`) or a
  `Target`'s surface/table (`:59`) — because that **mirrors the legitimate `scope: "named"` rows already in
  `decided-rules.json`** (e.g. `harness-registry → raw runtime`) and so reads as native to the model rather
  than as a smell. The 248-verdict reproduction suite would not catch it either: a clause-level carve-out
  changes no decided row. **What a reviewer looks for is a clause testing a specific package or table name
  that no decided row asked for.**
  Ruling C bans it outright and **review is the only gate. This is deliberately NOT closed.** The standing
  project rule is that a governance rule is guidance against an honest mistake and never a security
  boundary; a sibling work package burned five critique rounds learning that. An honestly stated blind spot
  is the deliverable — a rule that reasons about the shape of the model's own source is not.
- A shrink-only record placed outside `governance/`.
- Deliberate disguise of any of the above. Out of scope by standing project rule.

**D12 — The development-world flip: six rules go to `error`, one rule ceases to exist in that world
(Ruling E scope).**

The seven rules that stood at `warn` on `main` (`bbe82e9a`), with the evidence that each is clean at flip
time. None of them appears in `rule-severity.json`, so each is at `error` from this pull request.

| rule (group key) | on `main` | why it is clean now | landed in |
|---|---|---|---|
| `layer → db:table (other) [table:write] development` | 38 in 25 files | companion rows completed at every arranged entity (D1/D2/D3) | `70e78761`, `a9a77083`, `2a8b7291`, `60e8135d`, `1e11e657`, `68cfbdd4` |
| `service → db:table (other) [table:write] development` | 13 in 10 | same | same |
| `framework → db:table (other) [table:write] development` | 10 in 4 | same, in `framework/db`'s own fixtures | same |
| `layer → db:schema-ns [import] development` | 3 in 3 | the three `ah` test servers route through the database package's own client factory (D4) | `23eb1658` |
| `tooling → db:schema-ns [import] development` | 1 in 1 | the eval runner routes through the same factory (D4) | `23eb1658` |
| `application → db:unknown [import] development` | 1 in 1 | the dead `seed` test deleted, which removed the `seed` import (D5′, Ruling B) | `ec1b933b` |
| `tooling → raw runtime [capability] development` | 1 in 1 | **not fixed — withdrawn.** Ruling A made this crossing `allowed` in the development world, so the rule does not exist there and has no severity at all (D6′) | `27ccc8b8` |

**That last row is a real distinction and the founder should see it as one:** six rules flip from `warn`
to `error` because the violations are gone; the seventh is not a rule in the development world any more.
Its evidence is the decided-rules rows and `governance-model.test.ts`, not a cleared file.

**Production-world rules stay at `warn`** — all 31 keys, all 221 violations, untouched, for AU29/AU30/AU31
to clear and flip the same way.

**The flip must be shown to bite, not asserted.** Three proofs, all required (AC-4′):

1. `npx tsx scripts/governance-lint.ts` — exit 0, summary `221 production + 0 development known
   violation(s) at warn`, and no line whose group ends ` development`.
2. `jq '[.severity | keys[] | select(endswith("development"))] | length' governance/rule-severity.json`
   → `0`; `jq '[.severity[] | select(. != "warn")] | length'` → `0`; `jq '.severity | length'` → `31`.
3. **The end-to-end bite, run once and recorded — with its precondition named, because the obvious file
   choice silently produces nothing.** The companion clause credits the **whole file's** write set (§1b,
   `crossing-detectors.ts:781-783`, `governance-model.ts:372-389`), so a `teams` insert appended to a file
   that already writes `teamMembers` **anywhere** yields no finding at all. **Measured, and round 5's number
   was wrong in a way that mattered:** the count is not five files under `framework/db/src/__tests__/` (that
   was one directory read as the whole set) — `git grep -l 'insert(teams)' -- '*__tests__*'` reports **178
   development files**, and **not one of them fails to name `teamMembers`**. The trap is therefore universal
   rather than local, which makes the conclusion stronger, not weaker: every existing development file that
   inserts `teams` is guaranteed to produce nothing.
   **So the probe is a new file, whose write set is `{teams}` by construction and needs no search:** create
   a development file under a `layers/core-api/**/__tests__/` folder (a `__` path segment makes it
   development; name it `*.probe.ts` so vitest does not collect it) holding one schema import and one bare
   `insert(teams)` call. It enters the census without being staged — `trackedFiles()` runs
   `git ls-files -z --cached --others --exclude-standard` (`governance-context.ts:152-159`), so an untracked
   new file is seen. `npx tsx scripts/governance-lint.ts` then exits **non-zero** with a line reading
   `ERROR  [crossing-table-write] <file>:<line> …` — file and line both present, group ending
   ` development` — and the probe file is deleted. This is also a truer reading of plan.md's scenario 2 ("a
   developer **adds a test** that inserts a `teams` row without a `teamMembers` row") than editing an
   existing fixture.
   **The "append to an existing fixture" branch is unreachable today, and is kept only as the diagnosis for
   a builder who tries it anyway.** Its precondition is that the file's write set — its own writes plus those
   of every development helper it imports, which is what `buildWriteSets` computes — contains no
   `teamMembers`. That write set is a superset of what a grep of the file alone sees (this is how a
   `seedBase`-importing fixture launders a bare insert), so the grep-clean files are an **over-approximation**
   of the eligible ones — and the grep-clean set is **empty across all 178 files**. An empty
   over-approximation makes the eligible set provably empty: **no existing development file in the tree can
   satisfy this precondition.** It is retained, marked unreachable, for one reason only — a builder who
   appends to a fixture and gets a green lint would otherwise read it as the flip having failed. It is the
   diagnosis ("the file laundered it"), never an option. **The `*.probe.ts` route is the only route**, and it
   does not rest on this count: the probe's write set is `{teams}` because the file is new and contains one
   import and one insert, and it enters the census unstaged because `trackedFiles()` runs
   `git ls-files -z --cached --others --exclude-standard` (`governance-context.ts:152-159`) — both facts hold
   whatever the number of existing fixtures is.
   This was optional corroboration under the old AC-4; with the ratchet gone it is the **only** end-to-end
   evidence that absent-means-error holds over the live tree, so it is mandatory and its output is
   committed to `probes/`.

**D13 — The second shrinking record (`governance/misplaced-files.json`) is surfaced for a founder
decision and is NOT folded in.**

Ruling E names the baseline. Its *principle* — a guard failure must name an architectural fact, nothing
keeps books — reaches this record too, and the reading is not the planner's to make unilaterally. The
facts, the options and a recommendation are in
**`.pipeline/work/AU32/misplacement-ledger-decision.md`** (founder-facing, one page).

The finding in one line: **`misplacement-ledger` can emit a bookkeeping-only build failure.**
`scripts/rules/misplacement-ledger.ts:94-98` errors when the live entry count falls **below** the committed
`resolvedFiles` — fixing a misplaced file turns the build red until a number is lowered, which is verbatim
the friction Ruling E removed. The recommendation is to **keep the record and delete the count**; the
architectural facts it reports (four production-path files that are really development, each with its
reason) survive as warnings and are not derivable any other way.

**Consequence for this plan:** no task below implements it. If the founder approves, it adds one task —
drop `resolvedFiles` and the two count branches, restate the three fact-naming errors without their
"lower `resolvedFiles`" instruction, trim the attack case's two count assertions, and edit
`governance/README.md` plus one sentence of `CLAUDE.md`. That last file is outside the `scripts/` +
`governance/` bounds these rulings authorize, which is itself a reason the founder decides rather than
the planner.

**Two corrections to what the founder is being asked to weigh, because the cost was understated.**

- **The cost includes a whole test file the earlier statement omitted.**
  `framework/db/src/__tests__/governance-lint.test.ts:641-708` holds **eight** unit tests over the ledger,
  three of them specifically about the count — `:670` "is clean when the live count matches the committed
  one", `:673-677` "fails when the ledger GROWS past its committed count", `:679-682` "fails when a
  misplacement is cleared and the shrink is not committed" — and its `ledger()` helper constructs
  `resolvedFiles` (`:650-655`), so dropping the field **breaks compilation in that file** and the helper
  plus those three tests go with it. One more line goes with them, surfaced by the round-6 token
  widening: the enclosing `describe` title at `:641` reads "shrink-only, in both directions", which is false
  once one of the two directions is gone, so it is rewritten too. The honest cost is therefore: ~15 lines in
  the rule, **three unit tests, one test helper and the enclosing `describe` title**, two attack assertions,
  one attack id, the `governance/README.md` section, and one sentence of `CLAUDE.md` — not "~15 lines in one
  rule, two attack assertions, README".
- **"Nothing goes red" is narrower than stated, and the recommendation does not fully close the friction
  shape.** With `resolvedFiles` gone, `misplacement-ledger.ts:65-71` **still errors when the classifier now
  calls a ledgered file development** — that is, exactly when someone *fixes* a misplaced file by renaming
  it — instructing them to edit the record. Same friction shape as the count, one step removed. It is a
  smaller instance (it names a real disagreement between the record and the classifier, which *is* an
  architectural fact, where the count named only a number), so the recommendation stands; but the founder
  should decide knowing the shape survives rather than discovering it later.

---

## 3. Contracts (carried from plan.md as amended, made operational)

- **C1 — assertions never weaken; deletion only under a ruling's criterion (carries amended AC-3
  exactly).** Diffs to test files may add arrange rows, remove vestigial arrange rows proven
  unreferenced, reroute an arrange write through the owning service, or perform an
  owner-order-mirroring removal (D1's reworked team test). An assertion **may** change and a test
  **may** be deleted **only** where it depended on an unreachable arrangement (Ruling C) or probes
  an operation production has no path to perform (**Ruling D — explicit founder authority; the
  round-3 critique was right that AC-3's amendment alone could not carry this currency, and the
  founder has now established it directly**) — each instance named and justified in the diff by the
  impossible state or the missing production path (the P16/P18 evidence). What survives
  unconditionally is the ban on weakening: no assertion may become easier to satisfy, and no test
  may be made to pass by proving less. A test that *fails* after a companion is added is a finding
  to report, not a diff to force green. Over-determination is weakening with zero `expect`-line
  changes — C6 carries its check.
- **C2 — no rule exceptions; one scoped supersession.** No edit to `governance-model.ts`,
  `crossing-detectors.ts` clauses, `decided-rules.json`, or `architecture.json` verdict data —
  **except the D6′ edit set, which Ruling A explicitly authorizes**: the development-relaxation arm
  removal, the dead `oneDoorSurfaces.rawRuntime` field, the two development verdict flips for
  target `raw runtime`, and the standing tests/attacks that pin them. Nothing else. In particular:
  no table-rule edit, no per-file allowance anywhere — the exception
  *mechanism* is refused outright (Ruling C: "no one time manual exceptions"), and under Ruling E it is
  now also refused *mechanically* (D11). **Ruling E authorizes one further edit set, and only it**: the
  severity path under `scripts/` and `governance/` enumerated in D8′. The 15 clauses, the detectors and
  every decided verdict except D6′'s two rows stay exactly as they are — Ruling E's own words, "the
  architectural rules themselves stay exactly as they are. Only the bookkeeping goes."
- **C3 — no production export that only tests consume.** Every new helper lives in a development
  file (`_helpers.ts`) or inline in the test. `framework/db`'s barrel and subpaths unchanged.
- **C4 — companion groups stay derived.** No hand-maintained pair list anywhere; helpers name the
  owners' writers as the thing they mirror.
- **C5 — severity is declared, never derived, and nothing keeps books (replaces the baseline
  contract; Ruling E).** `governance/rule-severity.json` is hand-edited and hand-read: no generator, no
  npm script writes it, no code path derives it from live violations, and no check compares it to a
  count. A rule leaves the file when its violations are gone, in the pull request that removes them.
  Adding a rule to it is a severity downgrade and a one-line diff review is expected to challenge —
  that is the whole of the protection, deliberately (D7′). **The one thing the lint may say about a
  clean-but-`warn` rule is a `readonly string[]` NOTE, never a `Finding`** — the type is the contract, and
  a diff that changes it is the diff review must stop.
- **C6 — honest completion, per arranged entity, no exclusions.** Because the detector credits a
  file, not an entity (§1b), the builder completes the pair **for every arranged entity** — a file
  inserting five items seeds five projections; the entity at `foreign-keys` test 3 receives its
  membership row like every other. Where completion would second-cause an asserted rejection, the
  resolution is D1/D2's Ruling-C procedure — restore sole cause or delete under the
  production-path criterion — reported, never silent, never an exemption. Review checks
  per-entity completion **and** re-runs the delete-rejection scan over the touched files (post-
  change expected answer set: exactly the two `teams` tests in `foreign-keys`) confirming no added
  row is a non-cascade child of a deleted parent at act time.
- **C7 — no work-package ids in enforced artifacts.** New helper names, test names, attack ids,
  ruling-note keys in governance data: domain vocabulary only.
- **Out of scope.** The 221 production violations (AU29/30/31); consolidating the ~135 hand-rolled
  base worlds beyond files this package touches; the three `readSystemPromptTemplate*` `db:unknown`
  production sites; and **test files outside the touched set** — e.g.
  `hint-progress.integration.test.ts:99` and `P2-org-edges.integration.test.ts:248` also delete
  `users` rows, but those files have no violation and are not touched by this package; applying
  Ruling C's sweep there is future work, not silent scope growth here. **`misplaced-files.json` is no
  longer simply out of scope** — Ruling E's principle reaches it, so it is surfaced as a founder decision
  (D13) rather than silently excluded; it stays out of the task list until the founder rules.

---

## 4. AC → obligation → evidence (restated end to end against the amended ACs)

| AC (plan.md as amended) | Obligation | Evidence — exact command and expected observation |
|---|---|---|
| 1. No fixture writes one row of a pair — **carve-out clause withdrawn; no ruling, no exception** | D1/D2/D3 clear all 61 table-write sites (some by companion, four by test deletion, one by vestigial-row deletion, one by owner-path rewrite); every arranged entity complete | `npx tsx scripts/governance-lint.ts` prints no `crossing-table-write … development` line; summary reads `… 0 development known violation(s) at warn` (production stays whatever the rebase base carries, 221 today). **No founder ruling is cited and none exists** — AC-1's evidence no longer depends on the withdrawn clause. Per-entity review per C6 |
| 2. No development file past a single-door surface — **amended by Ruling A: no longer covers the AI-runtime door; still covers the database door** | D4 clears the 4 `db:schema-ns` sites; D5′ clears `db:unknown`; D6′ clears `raw runtime` by rule relaxation | Same run: no `db:schema-ns` or `db:unknown` development line; the `db:unknown` NOTE no longer lists `seed`; no `raw runtime` development line **because the rule no longer holds it in development** (P15 before/after: 67 → 66, production `+0`); the three production raw-runtime attacks still PASS (the door stands where the AC still points) |
| 3. Every changed test still proves what it proved — **amended by Ruling C**: an assertion that depended on an unreachable arrangement may change and its test may be deleted; nothing may become easier to satisfy; no test may pass by proving less | C1; C6; D1's per-test verdicts; D5′'s deletions | Diff review in three named categories the diff must keep visible: **(i) arrange-only diffs** — companion rows added, zero `expect` lines touched; **(ii) deletions** — each deleted test named with its justification (dead under Ruling B: `migrate` seed test, `foreign-keys:86-100`; unreachable operation under **Ruling D**: the six probes of user/thread/knowledge-item/item deletion in `foreign-keys` + the user-deletion cascade test in `agent-run-config-store`, each backed by a P16 citation and P18's no-mechanism finding) — the reviewer checks each against P16/P18, not against trust; **(iii) the one rework** — `foreign-keys` test 3: assertion line byte-identical, arrange completes the pair then removes the membership row in the owner's order with the `team-lookup.ts:304-307` citation in a comment. Plus the post-change delete-rejection re-scan (C6) and AC-6's count reconciliation. Anything outside these three categories is a review finding |
| 4′. **No development-world rule is at `warn`, and a development-world violation fails the build naming file and line** (rewritten by Ruling E — there is no baseline to hold zero entries) | D7′; D12; D9′ case 2 | Three proofs, all required, exactly as listed in D12: (i) `npx tsx scripts/governance-lint.ts` exits 0 with `221 production + 0 development known violation(s) at warn` and no group ending ` development` — a number the D7′ report cannot perturb, because it is a plain string carrying neither `group` nor `world`; (ii) `jq` over `governance/rule-severity.json` — 31 keys, all `"warn"`, none ending ` development`; (iii) **the end-to-end bite, mandatory, with D12 item 3's precondition observed**: the probe is a **new** `*.probe.ts` development file whose write set is `{teams}` by construction — never an existing fixture, because **all 178 development files that insert `teams` also name `teamMembers`** and would produce nothing — and the lint exits non-zero with `ERROR  [crossing-table-write] <file>:<line>`, group ending ` development`; output committed to `probes/`, probe deleted. Plus the standing break-tests: `--attacks` PASS including `missing-companion` and its control, and D9′ case 2 in `test:full`. **The evidence for the forbidden stale check is review, not a test** — D9′ case 3 was withdrawn as vacuous (B3) and now tests the D7′ report instead; AC-4′ no longer cites it |
| 5′. **The bookkeeping mechanism is gone, unconditionally, and cannot come back by accident** (rewritten by Ruling E: no longer conditional on the baseline emptying, and no longer deferred to whichever sibling finishes last — this work package owns it) | D8′ (the closure + the residue sweep); D11 (the guard) | `git ls-files governance/` → **6** paths (`README.md`, `architecture.json`, `decided-rules.json`, `misplaced-files.json`, `rule-severity.json`, `table-owners.json`), no `baseline.json`; `test ! -f scripts/governance-baseline.ts`; `npm run governance:baseline` → npm exits non-zero, "Missing script". **The residue search, in the form D8′ specifies and only that form** — `git grep -na` (never plain `rg`/`git grep`: `scripts/rules/crossings.ts` holds a NUL byte and is silently skipped), tokens `baselineRatchet compareBaseline refuseGrowth --adopt governance:baseline baseline-ratchet baseline.json shrink-only` (the last added in round 6 — it is the only token that reaches the three siblings' promotion bullet, which names the mechanism by its property rather than by any identifier), over `scripts/ governance/ package.json docs/guides/developer/ framework/db/src/__tests__/ .pipeline/AU.md .pipeline/work/AU29/plan.md .pipeline/work/AU30/plan.md .pipeline/work/AU31/plan.md`. **Two runs, both required: (a) the positive control before the deletion** — **78 lines across 20 files**, its file list containing `scripts/rules/crossings.ts` (7 hits), `governance/misplaced-files.json` (1) and the three sibling plans at 6/4/4, committed to `probes/residue-search-positive-control.txt`; a search missing any of those is broken and the builder stops. **(b) after the closure → zero hits, with exactly two named exceptions permitted and both reported:** if the founder declines D13, `resolvedFiles` and the one sentence describing it remain, and `framework/db/src/__tests__/governance-lint.test.ts:641`'s `describe` title remains (it describes the *second* record's shrink-only check, which is still true of it) — the `misplaced-files.json` note's four *baseline* references go either way. **`.pipeline/work/AU30/plan.md:28` is not covered by this search in either direction and its correction is proven by the D8′ enumeration and review, not here** (D8′ clause 5). Then `git grep -nai baseline -- governance/README.md docs/guides/developer/linting-and-formatting.md docs/guides/developer/commands.md` → zero hits. **`knip` is not evidence here** — it does not report unused exports of entry files (D8′), so a symbol left defined-but-unused is caught by the search above and by review, and by nothing else. Guard proven by break-test, not by inspection: `npx tsx scripts/governance-lint.ts --attacks` PASS with the `no-per-file-allowances` overlay case and its standalone shape case, and property 4 satisfied at 18 registered rules |
| 6. `test:all` green; integration pass count unchanged or higher — **amended by founder authority, not derivation**: Rulings B and D mandate the named test deletions (the round-3 objection that no ruling covered the nine is closed by Ruling D), so the comparison nets out exactly those; nothing else may drop | C1; before/after capture; the deletion ledger of AC-3(ii) | **Before** (committed probes, base bbe82e9a): unit `test:full` 6203 passed / 0 failed; integration service 2835 passed / 0 failed; 7 pre-existing env-dependent harness-lane failures (P10 — not this package's baseline). **After**: `npm run test:full` and `npm run test:integration:service` captured to `probes/`. **Projection the builder must reconcile against the actual diff:** unit = 6203 − 1 (migrate seed test) + 3 (D9′) − 12 (the deleted ratchet block: five top-level cases plus the seven `the baseline may only shrink` cases) = **6193**; service integration = 2835 − 9 (8 `foreign-keys` deletions + 1 `agent-run-config-store` deletion) = **2826**; zero failures in either lane; zero deltas outside the named deletions; harness lane shows no NEW failure in touched paths. If the builder's counts differ, each difference must map to a named deletion or addition in the diff — unexplained drift is a stop |
| Validation scenario 3 (derived groups) | D9′ case 1 (already committed, `7c6839e5`) | `npx vitest run framework/db/src/__tests__/governance-crossings.test.ts` (unit lane; verified at base: 68 passed, 2.2s) — new case green |

**Real-path executions this change must not break (live-proof lanes):**
- ah servers (D4): boot each modified script and observe the ready line plus one authenticated HTTP
  round trip.
- eval db (D4): execute `createEvalDb()` once — migrated handle returned, `close()` clean.
- desktop migrate (D5′): `npx vitest run applications/desktop/__tests__/migrate.test.ts` green
  (eight tests).
- governance lanes (D6′): `npx tsx scripts/governance-lint.ts` PASS, `--attacks` 47/47 PASS,
  `--fixtures` PASS, `npx vitest run framework/db/src/__tests__/governance-model.test.ts` green
  after the verdict-row edits.
- (The judge live-proof lane is withdrawn with D6 — `judges.ts` does not change.)
- severity path (D7′, D8′, D11): `npx tsx scripts/governance-lint.ts` PASS, `--attacks` PASS with the
  new cases, `--fixtures` PASS, `npx vitest run framework/db/src/__tests__/governance-crossings.test.ts`
  green after the ratchet block is removed and D9′'s three cases land, `npm run knip` and
  `npm run knip:production` green after six exports and one module leave `scripts/` (green, but **not** the
  gate on those exports — D8′). Two observations are required *before* the change, not after:
  **the residue search reporting the ratchet** (AC-5′(a)) and **D9′ case 3 red** against a tree where
  `readyToFlip` does not yet exist. Neither is optional; a proof nobody has watched fail is not a proof.
- Ruling D scope amendment, proven exercised-to-zero (D10): ship-time check that
  `git diff --name-only origin/main` lists zero production-world files and nothing under
  `framework/db/drizzle/`; `npm run verify` green (knip, knip:production, web + desktop builds run
  there as they would for any change).

---

## 5. Tasks — one builder leaf, ordered

**Resume point: `27ccc8b8` on `pipeline/AU32`, working tree clean of code changes.** The build has moved
past what `progress.json` recorded — **T1 through T7 are all committed and the development world measures
zero** (§1e). What remains is the Ruling E work plus the final sweep. `T8` as originally written (regenerate
the baseline) **no longer exists**; the tasks that replace it are T8-T12.

Done, verified by measurement rather than by commit message (§1e):

- **T0-T4** — evidence baselines, the derivation + flip cases, the schema-test files per the recorded
  verdicts, the core-api seeders and every companion completion. `7c6839e5` · `70e78761` · `a9a77083` ·
  `2a8b7291` · `60e8135d` · `1e11e657` · `68cfbdd4`. All 61 table-write sites clear.
- **T5** — the four hand-rolled database clients (`ah1`/`ah5`/`ah6` test servers, `tools/eval/src/runner.ts`)
  route through the database package's own factory. `23eb1658`.
- **T6** — the dead `seed` test deleted with its mock entry and import; the guaranteed-by-construction
  assertion line removed. `ec1b933b`.
- **T7** — Ruling A's relaxation: the raw-runtime arm out of `relaxForDevelopment`, the dead
  `oneDoorSurfaces.rawRuntime` field out of the interface and `architecture.json`, the two decided-rules
  development verdicts flipped with a dated note, `governance-model.test.ts` rewritten, the hand-edit at
  the cast synthetic literal, the attack flipped to a clean control. `27ccc8b8`.
  **Re-checked against Ruling E:** T7 was expressed partly as "the entry clears by relaxing the rule", and
  it did clear it — but the *entry* was a baseline row, and D8′ deletes the file that held it. T7's substance
  survives intact (the rule change, the verdict rows, the tests, the attack); only its accounting changes,
  and D12's last table row records the consequence: that rule has no severity entry because it is not a rule
  in the development world.

Remaining, ordered. T8 and T9 are one commit if the builder prefers — they cannot be split cleanly, because
the lint does not run between them.

- **T8 — declare severity (D7′).** Write `governance/rule-severity.json` from the 31 group keys the lint
  reports today, every value `"warn"`. **Derive the keys from the live lint output, never by transcribing
  `baseline.json`** — the two agree today and transcription is how a stale key would arrive. Add
  `RuleSeverity` to `scripts/lib/governance-registry.ts` and `loadRuleSeverity` to
  `scripts/governance-context.ts`. Re-point `crossingRules` onto `severityOf: (ruleKey: string) => Severity`
  and delete the `seenPerSite`/`isNewDebt`/`newness` block.
- **T9 — the deletion closure (D8′).** **First, before deleting anything: run the AC-5′(a) positive control
  and commit its output** — `git grep -na` over the declared token set and file list, non-empty, file list
  containing `scripts/rules/crossings.ts`. If it does not contain that file the search is broken; stop and
  fix the search, not the closure. Then every row of **all three** D8′ tables, including the rename to
  `scripts/lib/crossing-keys.ts` and its five importers, the `:20`/`:71` doc comments on the surviving
  symbols, the `package.json` script entry, the 12 ratchet tests, `buildRules` taking
  `severityOf: () => "error"`, and every `@lore`/comment that describes the mechanism. Then `npm run knip` +
  `npm run knip:production` (green, not evidence) and the AC-5′(b) run → zero hits.
- **T9b — the residue sweep's own rows (B1), which are prose, not code.** `governance/misplaced-files.json`'s
  `note` (the four baseline references — **unconditional, independent of D13**, and the sentence about
  `resolvedFiles` stays until the founder rules), `misplacement-ledger.ts:85-86`, the
  `misplacement-ledger-ratchet` attack id, and `.pipeline/AU.md:48,50,51,52`. Then the sibling-plan
  correction, **line by line off D8′'s "what it touches" table and nothing outside it**:
  - `AU29:34,35,50,51` · `AU30:36,51,52` · `AU31:36,51,52` — the bullets and ACs naming `baseline.json`,
    `--adopt` or the generator, replaced by Ruling E's instruction (clear your group keys, remove them from
    `rule-severity.json`, the rule bites with your own PR).
  - `AU29:33` · `AU30:35` · `AU31:35` — the identical promotion bullet (round-6 B4). Its last sentence
    ("There is no separate promotion step to remember, and none to defer") is now false; rewritten so the
    bullet says promotion **is** a step and names the one line that performs it.
  - `AU30:28` — remove the "so the ratchet records progress" clause; **keep** "no rule promotes until the
    last one lands" and re-ground it on the group key's aggregation over all six unowned tables. Do not
    replace it with the promotion bullet's new wording — for `AU30`'s table rules the last-one-lands shape
    is real, and `AU30:7` and `.pipeline/AU.md:29` already say why.
  - `AU29:11` — **one sentence only**: "`governance/baseline.json` holds every one of these … and
    `npm run governance:baseline` regenerates the file". This is a *What exists today* paragraph and the
    rest of it is `AU29`'s file set and symbol list; the module list, the `db:util` anomaly, the four
    `db:unknown` symbols, `factory-bootstrap.ts`'s sites and the two `framework/shared` bus sites are
    **read-only here**. Editing anything else in that paragraph is a scope change, not a correction.

  No other line of any of the three files changes, and `AU30:7` / `.pipeline/AU.md:29` stay verbatim. A
  further false line found while editing is **reported, not fixed** — the number of sibling-plan lines this
  work package touches is itself reviewable. `.pipeline/work/AU28/plan.md` is left alone by design.
- **T10 — the reintroduction guard (D11).** The `no-per-file-allowances` rule, its declared closed set, its
  flag allowlist (read off the surviving CLIs; hard-fail on a zero-match scan), the overlay break-test with
  its control, and the standalone shape case.
- **T11 — D9′'s three cases.** Case 1 already exists; rewrite case 2 onto the severity declaration; add
  case 3 in its **rewritten** form — the `readyToFlip` report test, written red-phase and **observed red
  before T8's function exists** (B3: the original case 3 could not fail and is not built). While in these
  files, apply Ruling B's sweep to anything else touched and report each vacuous test found.
- **T12 — docs and final gates.** `governance/README.md` (the dial section, the shape table, the
  sibling-record paragraphs, **the written prohibition on ever making a clean-rule-at-`warn` an error**, and
  the re-keying case F2 names so a sibling is not surprised by it),
  `docs/guides/developer/linting-and-formatting.md:40-41`, `docs/guides/developer/commands.md:69,75`.
  Then `npm run check && npm run lint && npm run test:all`, the AC-4′ three-part proof including the
  recorded bite **on a new `*.probe.ts` file, never an existing fixture**, the AC-5′ residue search in the
  `git grep -na` form only, the AC-6 count reconciliation against the 6193 projection, and the
  production-unchanged proof (`221 production + 0 development`, `git diff --name-only origin/main` listing
  zero production-world files and nothing under `framework/db/drizzle/`).
- **T13 — the second ledger. NOT STARTED, NOT AUTHORIZED.** Exists only if the founder approves D13.
  Contents in `misplacement-ledger-decision.md`.

Dependency notes: **T9's positive control runs first of all, before T8** — it must observe the ratchet
present. Then T8 before T9 (the lint has no dial in between); T9b with or after T9; T10 after T8; T11's red
observation before T8 and its green after; T12 last. Nothing here depends on T1-T7, which are done.

---

## 6. Failure behavior, security, docs

**Changed failure behavior.** None in production — no production file changes at all (D10: the
Ruling-D removal branch is empty; the scope amendment exercises to zero): every touched test/script
file is development-world, and the D6′ rule edits change only what the *lint* permits in the
development world (production verdicts proven unchanged: P15's `+0` production delta and the three
still-passing production attacks). **No database migration is generated; the schema is untouched.** Added companion rows participate in FK graphs; the P16
census shows no touched test successfully deletes a `teams` row, so no added membership row can
break a passing delete; the one asserted team-delete rejection that a membership row could
second-cause is exactly D1's reworked test.

**Accepted costs, enumerated (the honesty Rulings B/C/D demand).** These constraints/behaviors lose
their tests because production has no path — and (P18) no code mechanism in any shape — that
exercises them; the schema keeps every constraint, and per Ruling D the safety claim is that the
capability is **absent**, not that a guard protects it. If a guarantee is wanted as *tested*, that
is a future work package, not a repoint here: `users`-deletion RESTRICT probes (sessions,
routines), `threads`-deletion RESTRICT probes (messages, items), `knowledgeItems`-deletion RESTRICT
probes (edit log, conflicts — the audit-outlives-subject contract, `foreign-keys:25-28`), the
verdict-survives-item-deletion contract, the user-deletion → `agentRunConfig` cascade, "the desktop
migration path writes no seed data" (never actually tested), and — new with the :86-100 deletion —
the `users.teamId → teamMembers.id` RESTRICT (`schema.ts:69`), which IS production-load-bearing
(it is what would make `deleteTeam`'s members-first delete reject while a user still references the
membership row) but was never actually tested: the deleted test asserted nothing. The residual risk
all of these share: a future migration flipping one of these FK actions ships green through every
lane — accepted by Ruling D with eyes open (the round-3 critique put exactly this cost in front of
the founder, and the ruling chose deletion).

**Security.** No state-changing endpoint, no untrusted input, no new credential path. The
development world may now construct vendor SDKs directly (Ruling A — the recorded/priced/replayable
properties are shipped-product properties); production's one door is unchanged and attack-pinned.

**Documentation made false — and now there is a lot of it, because Ruling E deletes a documented
mechanism.** Every location is enumerated in D8′'s third table **and its residue sweep**, and each is a task
in T9b/T12, not a grep at build time: `governance/README.md` (the "There is no warn/error dial" section, the
shape table, and both paragraphs that describe `misplaced-files.json` as the baseline's sibling),
`docs/guides/developer/linting-and-formatting.md:40-41`, `docs/guides/developer/commands.md:69` and `:75`,
plus the four sites the first enumeration missed — `governance/misplaced-files.json:3`'s `note`,
`scripts/rules/misplacement-ledger.ts:85-86`, `scripts/lib/crossing-report.ts:20` and `:71`, and the
`misplacement-ledger-ratchet` attack id — and the operating instructions in `.pipeline/AU.md:48,50,51,52`
and the three sibling plans. The `governance/README.md` shape table needs a **fourth** noun rather than a
fourth row: its stated thesis is "a clause is a principle, a registry is a fact, a decided rule is a
decision", and a severity is none of the three — name what a severity *is*.
`CLAUDE.md`'s one `misplaced-files.json` sentence moves only if D13 is approved. The instruction in
`governance/README.md:5-6` — do not restate a rule anywhere else — means the severity dial gets **one**
description, there, and the two `docs/guides/` files point at it rather than paraphrasing it; the current
`linting-and-formatting.md` bullets are a second copy that already drifted, which is the argument.
For the earlier rulings: `governance/README.md` states mechanics rather than per-world raw-runtime
verdicts, so Ruling A falsified nothing there (checked, T7).

**Lore.** Three `@lore` captures: the owner-order removal in `foreign-keys` test 3 (why the
membership row must be removed before the act, citing `team-lookup.ts:304-307`); a note on
`_helpers.ts`'s new seeders naming the owners' writers they mirror (C4); a note at the flipped
development raw-runtime attack recording the production-only ruling so the next agent does not
"restore" the development ban. Ruling E adds two: one at `severityOf` in `scripts/rules/crossings.ts`
recording that severity is per rule and deliberately cannot see a file, count or census — with the reason
(a red build as the reward for fixing the last violation names no architectural fact); and one at the
`no-per-file-allowances` rule recording what it catches, what it does not, and that it is guidance for an
honest mistake rather than a boundary against a determined one.

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
key is what `groupKey` already produces (`scripts/lib/crossing-report.ts:72-73`), what the lint already
prints as a "rule group", and — the same tuple before label rendering — what `governance/decided-rules.json`
already decides one row at a time **per world** (124 rows of `source`/`target`/`kind` ×
`production`/`development`). Grain 2 would have required inventing a key that does not exist anywhere
today. The unit of severity is the unit of decision.

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
  the reward for fixing the last violation, naming no architectural fact. **It is forbidden.** The lint
  *reports* such a rule as a `warn` line — "clean; this rule can go to `error`" — which is information,
  not a gate. Symmetrically, nothing anywhere compares a live count to a stored one.
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
| `scripts/lib/crossing-report.ts` | `BaselineGroup` (`:79-82`), `Baseline` (`:84-88`), `RatchetVerdict` (`:90-96` — already dead, nothing reads it), `LiveGroup` (`:98-101`), `refuseGrowth` (`:104-140`), `compareBaseline` (`:142-198`), the “the baseline” banner (`:75-77`), and the three `@lore` blocks that document the mechanism (`:2-15`, `:106-117`, `:148-162`). What survives is `targetLabel`, `sourceLabel`, `groupKey`. **The file is renamed `scripts/lib/crossing-keys.ts`** and its header rewritten: a module called `crossing-report` that only builds keys is exactly the residue Ruling E's closure is about. Importers to update: `scripts/rules/crossings.ts`, `scripts/governance-lint.ts`, `scripts/governance-context.ts`, `scripts/lib/governance-attacks.ts`, `framework/db/src/__tests__/governance-crossings.test.ts`. |
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

**Mechanical consequences of the deletion, checked rather than assumed**

- **Rule count is unchanged at 18.** 8 non-crossing + 9 crossing + `baseline-ratchet` today; 9 non-crossing
  (the new D11 rule) + 9 crossing after. `runRules` refuses an empty rule set and duplicate ids; neither
  is at risk.
- **Attack coverage (property 4) still closes.** Deleting the ratchet removes the one rule that needed
  `alsoRegistered`; the new D11 rule is a normal registered rule and gets its cases the normal way. Live
  count today is 47; the builder reports the new number.
- **The census floor is not at risk.** Deleting two tracked files takes `trackedFiles()` from 3309 to 3307
  against `MIN_TRACKED_FILES = 2976` (`scripts/governance-context.ts:45`) — 331 of slack, and `floors-tight`
  judges that floor by band, not by equality. No floor is rewritten.
- **`knip` and `knip:production` are a gate on this task, not an afterthought.** Six exported symbols leave
  `crossing-report.ts` and one module leaves `scripts/`; run both and fix what they surface rather than
  discovering it in CI.

**D9′ — Three unit cases in `framework/db/src/__tests__/governance-crossings.test.ts` (D9's second
case re-pointed at the severity declaration; Ruling E).** (1) derivation negative — an owner inserting
only `teams` yields no companion group (unchanged, already committed in `7c6839e5`). (2) **the
warn→error flip, rewritten**: `crossingRules` over one synthetic development companion violation — with
a `"warn"` entry for that rule key the finding is `warn`; **with the key absent it is `error`**. Same
property the old case proved, one input instead of a keyed-by-file allowance, and it is the standing
proof that absent means `error`. (3) **new, the anti-stale pin**: a `"warn"` entry whose rule key has
**zero** live violations produces **no error** — the case that fails if anyone rebuilds the stale-record
check D7′ forbids. Test names domain-worded, no work-package ids.

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
injected `readFile`). Population: the tracked files under `governance/` plus the surviving governance
CLIs. `minScope: 4`, against a live 5.

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
4. **The governance CLIs carry no undeclared flag.** The rule reads the surviving governance scripts and
   fails on any `--flag` outside a declared set (`--fixtures`, `--attacks`, `--errors-only`, plus whatever
   the surviving `governance:floors` / `governance:new-cells` CLIs legitimately take — the builder reads
   them and populates the set, and **hard-fails if the scan finds zero flags**, because a scan that
   matches nothing reads as passing forever). Again an allowlist: it catches `--adopt`, `--allow`,
   `--accept`, `--grandfather` without naming any of them. A genuinely new flag costs a one-line
   declaration, which is the right amount of friction for adding an escape hatch to a governance CLI.

Plus the type-level half already stated in D7′: `severityOf: (ruleKey: string) => Severity` cannot be
handed a file, so a per-file allowance does not compile.

**Break-tests** (property 4 requires them): one overlay case adding `governance/known-violations.json`
and expecting a `no-per-file-allowances` finding, with the untouched `governance/` directory as its clean
control; one standalone case driving checks 2-4 directly — a nested value, a path-shaped key, an
undeclared flag — each expected to fail and the well-formed equivalents expected to be silent.

**What this does not catch, stated so nobody trusts it further than it goes:**

- An allowance written into `architecture.json` or `decided-rules.json` under an innocuous key. Those
  files are inside the closed set and only `rule-severity.json`'s shape is checked.
- **A file path hardcoded into a clause in `governance-model.ts`** to make one file's verdict `allowed`.
  Nothing detects that. The 248-verdict reproduction suite would not either — a path-specific carve-out
  changes no decided row. Ruling C bans it outright and **review is the only gate.** This is the largest
  blind spot and it is deliberate: detecting it would mean a rule that reasons about the shape of the
  model's own source.
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
3. **The end-to-end bite, run once and recorded:** append a bare `teams` insert to a development fixture
   → `npx tsx scripts/governance-lint.ts` exits **non-zero** with a line reading
   `ERROR  [crossing-table-write] <file>:<line> …` — file and line both present → revert. This was
   optional corroboration under the old AC-4; with the ratchet gone it is the **only** end-to-end
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
  that is the whole of the protection, deliberately (D7′).
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
| 4′. **No development-world rule is at `warn`, and a development-world violation fails the build naming file and line** (rewritten by Ruling E — there is no baseline to hold zero entries) | D7′; D12; D9′ cases 2 and 3 | Three proofs, all required, exactly as listed in D12: (i) `npx tsx scripts/governance-lint.ts` exits 0 with `221 production + 0 development known violation(s) at warn` and no group ending ` development`; (ii) `jq` over `governance/rule-severity.json` — 31 keys, all `"warn"`, none ending ` development`; (iii) **the end-to-end bite, now mandatory rather than optional**: a bare `teams` insert appended to a development fixture makes the lint exit non-zero with `ERROR  [crossing-table-write] <file>:<line>`, output committed to `probes/`, then reverted. Plus the standing break-tests: `--attacks` PASS including `missing-companion` and its control, and D9′ case 2 in `test:full` |
| 5′. **The bookkeeping mechanism is gone, unconditionally, and cannot come back by accident** (rewritten by Ruling E: no longer conditional on the baseline emptying, and no longer deferred to whichever sibling finishes last — this work package owns it) | D8′ (the closure); D11 (the guard) | `git ls-files governance/` → 5 paths, no `baseline.json`; `test ! -f scripts/governance-baseline.ts`; `npm run governance:baseline` → npm exits non-zero, "Missing script"; `rg -n 'baselineRatchet|compareBaseline|refuseGrowth|--adopt|governance:baseline' scripts/ governance/ package.json docs/guides/developer/ framework/db/src/__tests__/` → **zero hits** (if the founder declines D13, `resolvedFiles` remains and is the one permitted residue, named in the report); `rg -ni 'baseline' governance/README.md docs/guides/developer/linting-and-formatting.md docs/guides/developer/commands.md` → zero hits. Guard proven by break-test, not by inspection: `npx tsx scripts/governance-lint.ts --attacks` PASS with the `no-per-file-allowances` overlay case and its standalone shape case, and property 4 satisfied at 18 registered rules |
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
  `npm run knip:production` green after six exports and one module leave `scripts/`.
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
- **T9 — the deletion closure (D8′).** Every row of both D8′ tables, including the rename to
  `scripts/lib/crossing-keys.ts` and its five importers, the `package.json` script entry, the 12 ratchet
  tests, and every `@lore`/comment that describes the mechanism. Then `npm run knip` +
  `npm run knip:production`.
- **T10 — the reintroduction guard (D11).** The `no-per-file-allowances` rule, its declared closed set, its
  flag allowlist (read off the surviving CLIs; hard-fail on a zero-match scan), the overlay break-test with
  its control, and the standalone shape case.
- **T11 — D9′'s three cases.** Case 1 already exists; rewrite case 2 onto the severity declaration; add
  case 3, the anti-stale pin.
- **T12 — docs and final gates.** `governance/README.md` (the dial section, the shape table, the sibling-record
  paragraphs), `docs/guides/developer/linting-and-formatting.md:40-41`, `docs/guides/developer/commands.md:69,75`.
  Then `npm run check && npm run lint && npm run test:all`, the AC-4′ three-part proof including the
  recorded bite, the AC-5′ residue greps, the AC-6 count reconciliation against the 6193 projection, and the
  production-unchanged proof (`221 production + 0 development`, `git diff --name-only origin/main` listing
  zero production-world files and nothing under `framework/db/drizzle/`).
- **T13 — the second ledger. NOT STARTED, NOT AUTHORIZED.** Exists only if the founder approves D13.
  Contents in `misplacement-ledger-decision.md`.

Dependency notes: T8 before T9 (the lint has no dial in between); T10 and T11 after T8; T12 last. Nothing
here depends on T1-T7, which are done.

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
mechanism.** Every location is enumerated in D8′'s third table and each is a task in T12, not a grep at
build time: `governance/README.md` (the "There is no warn/error dial" section, the shape table, and both
paragraphs that describe `misplaced-files.json` as the baseline's sibling),
`docs/guides/developer/linting-and-formatting.md:40-41`, `docs/guides/developer/commands.md:69` and `:75`.
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

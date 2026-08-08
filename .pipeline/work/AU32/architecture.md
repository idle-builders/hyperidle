# AU32 — architecture: tests arrange worlds production can actually produce

Authority: `.pipeline/work/AU32/plan.md` **as amended by `.pipeline/work/AU32/founder-rulings.md`
(Rulings A/B/C recorded at the concept gate 2026-08-08; Ruling D recorded 2026-08-08 after the
round-3 critique, overruling its blocking finding B1)** — those rulings supersede this file's
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

Everything the round-2 and round-3 critiques verified and no ruling touches is carried unchanged:
the census, the cascade fact, Ruling A's rule relaxation and its complete pin list (round-3 N3),
`seed-then-migrate` clean, `session-requests:59` unreferenced, the `seedBase` correction, D2's
mechanics, D3, D4, D7, D8, D9, the three sound dead-test deletions (round-3 N5), the :114 rework
(round-3 N2 — strengthened below with the non-transactionality fact it found), and the round-2
N1–N4 closures. Round-3's non-blocking N1 (P15's false "type-breaks" claim about the crossings
literal) is fixed in P15 and noted in D6′.

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

**D7 — Baseline mechanics: regenerate, never edit.** (Unchanged.) `npm run governance:baseline` is
the only legal writer; each commit that clears sites carries its shrink; clearing a group's last
site deletes the group and that rule is at error from the same commit.

**D8 — AC-5 (delete the baseline file + `--adopt`) is dormant for this work package.** (Unchanged.)
31 production groups / 221 sites remain (AU29/30/31 all `planned`); clearing every development
group cannot empty the file. Ship-time `jq '.groups | length'` check; if 0, deletion happens here.

**D9 — Two unit cases are added** to `framework/db/src/__tests__/governance-crossings.test.ts`
(unchanged): (1) derivation negative — an owner inserting only `teams` yields no group; (2)
baseline severity flip — `crossingRules` over one synthetic development companion violation:
allowance present ⇒ `warn`, group absent ⇒ `error` (`scripts/rules/crossings.ts:59-87`). Test names
domain-worded.

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
  no table-rule edit, no baseline hand-edit, no per-file allowance anywhere — the exception
  *mechanism* is refused outright (Ruling C: "no one time manual exceptions").
- **C3 — no production export that only tests consume.** Every new helper lives in a development
  file (`_helpers.ts`) or inline in the test. `framework/db`'s barrel and subpaths unchanged.
- **C4 — companion groups stay derived.** No hand-maintained pair list anywhere; helpers name the
  owners' writers as the thing they mirror.
- **C5 — baseline shrink-only, entries deleted never re-tagged.** Only `npm run
  governance:baseline` writes it (D7).
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
  production sites; `misplaced-files.json`; and **test files outside the touched set** — e.g.
  `hint-progress.integration.test.ts:99` and `P2-org-edges.integration.test.ts:248` also delete
  `users` rows, but those files have no violation and are not touched by this package; applying
  Ruling C's sweep there is future work, not silent scope growth here.

---

## 4. AC → obligation → evidence (restated end to end against the amended ACs)

| AC (plan.md as amended) | Obligation | Evidence — exact command and expected observation |
|---|---|---|
| 1. No fixture writes one row of a pair — **carve-out clause withdrawn; no ruling, no exception** | D1/D2/D3 clear all 61 table-write sites (some by companion, four by test deletion, one by vestigial-row deletion, one by owner-path rewrite); every arranged entity complete | `npx tsx scripts/governance-lint.ts` prints no `crossing-table-write … development` line; summary reads `… 0 development known violation(s) at warn` (production stays whatever the rebase base carries, 221 today). **No founder ruling is cited and none exists** — AC-1's evidence no longer depends on the withdrawn clause. Per-entity review per C6 |
| 2. No development file past a single-door surface — **amended by Ruling A: no longer covers the AI-runtime door; still covers the database door** | D4 clears the 4 `db:schema-ns` sites; D5′ clears `db:unknown`; D6′ clears `raw runtime` by rule relaxation | Same run: no `db:schema-ns` or `db:unknown` development line; the `db:unknown` NOTE no longer lists `seed`; no `raw runtime` development line **because the rule no longer holds it in development** (P15 before/after: 67 → 66, production `+0`); the three production raw-runtime attacks still PASS (the door stands where the AC still points) |
| 3. Every changed test still proves what it proved — **amended by Ruling C**: an assertion that depended on an unreachable arrangement may change and its test may be deleted; nothing may become easier to satisfy; no test may pass by proving less | C1; C6; D1's per-test verdicts; D5′'s deletions | Diff review in three named categories the diff must keep visible: **(i) arrange-only diffs** — companion rows added, zero `expect` lines touched; **(ii) deletions** — each deleted test named with its justification (dead under Ruling B: `migrate` seed test, `foreign-keys:86-100`; unreachable operation under **Ruling D**: the six probes of user/thread/knowledge-item/item deletion in `foreign-keys` + the user-deletion cascade test in `agent-run-config-store`, each backed by a P16 citation and P18's no-mechanism finding) — the reviewer checks each against P16/P18, not against trust; **(iii) the one rework** — `foreign-keys` test 3: assertion line byte-identical, arrange completes the pair then removes the membership row in the owner's order with the `team-lookup.ts:304-307` citation in a comment. Plus the post-change delete-rejection re-scan (C6) and AC-6's count reconciliation. Anything outside these three categories is a review finding |
| 4. Baseline holds zero development entries; rules fail the build on reappearance | D7; all 7 development groups deleted by the generator (6 by fixes, 1 by D6′'s relaxation); D9 case 2 pins the flip | `jq '[.groups | keys[] | select(endswith("development"))] | length' governance/baseline.json` → `0`. Reappearance: (i) standing break-tests — `npx tsx scripts/governance-lint.ts --attacks` PASS includes `missing-companion` and its control (`governance-attacks.ts:506-533`), plus the flipped development raw-runtime control and the three untouched production raw-runtime attacks; (ii) the warn→error flip pinned standing by D9 case 2 in `test:full`; (iii) optional one-off corroboration: append a bare `teams` insert to a development file → lint exits non-zero naming file/line → revert |
| 5. If the baseline empties, delete file + `--adopt` same commit | D8 — dormant, ship-time check | `jq '.groups | length' governance/baseline.json` after final regen: expected `> 0` (31 production groups) → recorded as vacuous; if `0`, the deletion commit happens here |
| 6. `test:all` green; integration pass count unchanged or higher — **amended by founder authority, not derivation**: Rulings B and D mandate the named test deletions (the round-3 objection that no ruling covered the nine is closed by Ruling D), so the comparison nets out exactly those; nothing else may drop | C1; before/after capture; the deletion ledger of AC-3(ii) | **Before** (committed probes, base bbe82e9a): unit `test:full` 6203 passed / 0 failed; integration service 2835 passed / 0 failed; 7 pre-existing env-dependent harness-lane failures (P10 — not this package's baseline). **After**: `npm run test:full` and `npm run test:integration:service` captured to `probes/`. **Projection the builder must reconcile against the actual diff:** unit = 6203 − 1 (migrate seed test) + 2 (D9) = **6204**; service integration = 2835 − 9 (8 `foreign-keys` deletions + 1 `agent-run-config-store` deletion) = **2826**; zero failures in either lane; zero deltas outside the named deletions; harness lane shows no NEW failure in touched paths. If the builder's counts differ, each difference must map to a named deletion or addition in the diff — unexplained drift is a stop |
| Validation scenario 3 (derived groups) | D9 case 1 | `npx vitest run framework/db/src/__tests__/governance-crossings.test.ts` (unit lane; verified at base: 68 passed, 2.2s) — new case green |

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
- Ruling D scope amendment, proven exercised-to-zero (D10): ship-time check that
  `git diff --name-only origin/main` lists zero production-world files and nothing under
  `framework/db/drizzle/`; `npm run verify` green (knip, knip:production, web + desktop builds run
  there as they would for any change).

---

## 5. Tasks — one builder leaf, ordered

**One leaf, sequential — unchanged by the rulings.** The work trees (fixtures, one-door db fixes,
the rule relaxation, dead-test deletions) still all funnel through `governance/baseline.json`
regeneration and one final verification; the rulings removed work (D5, D6, the founder gate) and
added strictly less than they removed. **Ruling D adds no tasks**: the mandated investigation ran at
plan time (P18) and its removal branch is empty — there is no T for feature removal because there is
no feature to remove (D10). Splitting still buys no schedule and still creates a merge
seam on the baseline. **The concept gate is done — nothing below is blocked on anything.**

- **T0 — evidence baseline (done at plan time, keep committed).** `probes/` test baselines and
  per-site lint list; spike measurements in P15. Builder re-captures only on rebase.
- **T1 — derivation + severity-flip tests (D9).** Two cases in `governance-crossings.test.ts`;
  green immediately; independent of everything else.
- **T2 — schema-test files per the recorded verdicts (D1).** `foreign-keys`: delete the eight
  tests named in D1 with their per-test justifications in the commit message (the six
  unreachable-operation deletions cite Ruling D's criterion + the P16/P18 evidence; the dead test
  cites Ruling B); simplify test 1's
  arrange to the bare pair; rework test 3 (companion + owner-order removal + unchanged assertion +
  citation comment + `@lore`); trim dead imports and the seeder. `schema` (+ minimal projection
  rows), `migration` (+ `teamMembers` row), `session-requests` (delete the vestigial `teams`
  insert; prove the file green).
- **T3 — core-api package fixtures (D2).** `seedTeam`/`seedKnowledgeItem` in `_helpers.ts`; clear
  the 24 files (37 sites) including D3's owner-path fix. Per-entity completion; helper-or-comment
  rule per site.
- **T4 — other-package fixtures (D2 inline) + the swept deletions in those files.** 11 files:
  `core-api/work` ×3, `core-api/routine` ×3, `agent-orchestration/agent-run-config` ×1 (also
  **deletes the "deleting the agent cascades the config row away" test** — Ruling D: production
  never deletes users (P16), no user-deletion mechanism exists (P18), and the store exports no
  delete function at all — the cascade can never fire), `filesystems` ×2, `filesystem-mounting` ×1,
  `layers/agent-orchestration/src` ×1. Inline companion inserts.
- **T5 — one-door database fixes (D4).** `ah1/ah5/ah6-test-server.ts`, `eval/src/runner.ts`.
  Boot-prove each.
- **T6 — dead-test deletions outside T2/T4 (D5′).** `migrate.test.ts`: delete the seed test + mock
  entry + import; `knowledge-access.integration.test.ts:172`: delete the guaranteed-by-construction
  assertion line.
- **T7 — the AI-door development relaxation (D6′).** The model edit, the architecture.json field
  deletion, the two decided-rules verdict flips + dated ruling note, the `governance-model.test.ts`
  rewrite, the `governance-crossings.test.ts` literal fix, the attack flip. Run the governance
  lanes (evidence table). `judges.ts` is not touched.
- **T8 — baseline regeneration + gates (D7, D8).** `npm run governance:baseline`; AC-4/AC-5
  evidence; `npm run check && npm run lint && npm run test:all`; after-capture and AC-6
  reconciliation against the deletion ledger. Intermediate regenerations during T2–T7 are fine and
  encouraged; T8 is the final sweep.

Dependency notes: T1–T7 are mutually independent; T3 before T4 only because the helpers land in
T3; each site-clearing commit carries its baseline shrink (D7).

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

**Documentation made false.** None found: `governance/README.md` states mechanics, not per-world
raw-runtime verdicts in prose the change would falsify — builder greps it for "raw runtime"
one-door claims during T7 and updates the sentence if one names both worlds (UNVERIFIED which
exact sentence, checked at build time); `CLAUDE.md` states the world rule; no doc enumerates the
development baseline.

**Lore.** Three `@lore` captures: the owner-order removal in `foreign-keys` test 3 (why the
membership row must be removed before the act, citing `team-lookup.ts:304-307`); a note on
`_helpers.ts`'s new seeders naming the owners' writers they mirror (C4); a note at the flipped
development raw-runtime attack recording the production-only ruling so the next agent does not
"restore" the development ban.

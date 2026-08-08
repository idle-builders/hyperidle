# AU32 — the schema-test question: RECORD OF DECISION

**Status: decided.** The concept gate ruled on 2026-08-08, and a fourth ruling (D) was recorded the
same day after the round-3 critique, overruling its blocking finding. This document is no longer a
request — it records the four binding rulings (`.pipeline/work/AU32/founder-rulings.md`, verbatim
there), what each changed against the earlier draft, and the per-file verdicts as they now stand.
It asks the founder nothing.

The earlier draft recommended (a) — add the companion — for every lint-flagged site, plus **one**
founder ruling (drafted "Ruling 16") keeping a single un-flagged `teams` row partial under a
masking criterion. The gate **did not approve that as written**: it rejected the drafted ruling and
withdrew two of the architecture's decisions.

---

## The four rulings, and what each changed

### Ruling A — the one-seam requirement for AI requests is production-only

> "the AI grading system is development only. Only production cases all have to go through the same
> seam for AI requests."

- Decision D6 (rewrite `tools/eval/src/judges.ts:501-512` through `callLlm`) is **withdrawn**. The
  eval judge is development tooling and may construct the vendor SDK directly.
- The `tooling → raw runtime [capability] development` baseline entry clears by **relaxing the rule
  in the development world** — a world-derived rule change (the same shape Ruling 13 gave table
  writes), never a per-file exception. Concretely: the raw-runtime arm leaves the development
  relaxation's `guarded` predicate (`scripts/lib/governance-model.ts:369-375`), the two decided
  rows with development `forbidden` for target `raw runtime` flip to `allowed`, and the standing
  test/attack that pinned "both worlds" move with the rule (architecture D6′ has the full edit set;
  contract C2 is superseded for exactly those edits and nothing else).
- Production is untouched: `hold-one-runtime-door` reads `architecture.json`'s `rawRuntime.host`,
  not the relaxation data; the spike measured `221 production + 66 development` after the change
  (production delta `+0`), and all three production raw-runtime attacks still pass
  (`feasibility.md` P15).
- **Scope:** AI requests only. The database door is NOT relaxed — the four `db:schema-ns`
  hand-rolled clients still route through the database package's own factory (architecture D4).
- plan.md **AC-2 is amended**: "no development file reaches past a single-door surface" no longer
  covers the AI-runtime door; it continues to cover the database door.

### Ruling B — a dead test is deleted, never repointed

> "dead tests just delete."

- Decision D5 (repoint the `seed` test at `seedDemoWorld`/`applyFactoryBootstrap`) is
  **withdrawn**. The test in `applications/desktop/__tests__/migrate.test.ts` that mocks `seed` — a
  symbol the barrel has not exported since `seed.ts` was deleted — is **deleted outright**, with
  the mock-factory entry and the `seed` import. That deletion closes the
  `application → db:unknown` entry. Accepted cost, on the record: "the desktop migration path
  writes no seed data" becomes untested — it never actually was.
- Applied as a principle, the touched files were swept for other tests that cannot fail
  (`feasibility.md` P17). Found and deleted: the assertion-free
  `foreign-keys.integration.test.ts:86-100` (its probe sits in an outcome-tolerant `try/catch`;
  zero `expect` calls) and the guaranteed-by-construction assertion
  `knowledge-access.integration.test.ts:172` (`new Date(…)` never throws; the assertion line goes,
  the test's four live assertions stay). Nothing else met the criterion.

### Ruling C — tests arrange only states production can reach; no per-file exceptions, ever

> "if a team cannot exist without a memeber in produdction also a test should not create and test
> that scenario, tests should only exist for things that realistically exist in production no
> development only scenarios."
> "and surely no one time manual exceptions that turns into 20 exceptions in no time"

- **Drafted Ruling 16 is REJECTED.** No arranged entity stays partial — the `teams` row at
  `foreign-keys.integration.test.ts:104` included. The exception mechanism itself is refused (one
  becomes twenty); plan.md's carve-out clause ("except where a founder ruling names the file and
  the reason") is withdrawn by the founder who would have signed it. AC-1's evidence no longer
  cites any ruling.
- The masking criterion the earlier draft derived survives only as a *diagnosis* of
  over-determination, never as an exclusion. Every over-determination is resolved honestly, per
  delete operation, in this order: make the assertion prove its own constraint alone; or, where
  **production has no path that performs the operation the test probes**, delete the test under
  Ruling B.
- plan.md **AC-3 is amended**: an assertion that depended on an unreachable arrangement may change
  and its test may be deleted; what survives is the ban on weakening — nothing may become easier to
  satisfy, and no test may be made to pass by proving less. Every change/deletion is justified in
  the diff by the impossible state or missing production path it depended on.

### Ruling D — an unreachable operation is dead code; delete the feature, not just the test

> "if this action cannot be reached from production we can remove the tests. if its not a used
> interface we can remove the entire deletion mechanism so please check if this is true dead code
> and remove the entire feature if possible."
> "like if there is no deletion feature the database is still save."

- **The round-3 blocking finding (B1) is overruled.** The reviewer recommended keeping the nine
  constraint tests because no ruling established the operation-reachability deletion criterion; the
  founder has now established it explicitly. The nine tests go, on Ruling D's own authority — the
  round-3 factual work (the census is right, the tests are live, the coverage loss is total) stands
  and is accepted as a cost, with the §6 cost list on the record.
- **The deletion-mechanism investigation the ruling mandates was executed** (`feasibility.md` P18):
  for every probed operation, every shape a mechanism could take was swept — Drizzle deletes and
  raw SQL in all worlds, every HTTP DELETE handler read in full, the complete 21-tool agent
  catalog, reapers/scheduled jobs, CLI/script paths, all 56 migration files, and all 12 cascade
  FKs. **Finding: the removal branch is empty.** No deletion mechanism exists in any shape for
  `users`/`threads`/`knowledgeItems`/`items`; the two mechanisms that exist — `deleteTeam`
  (`team-lookup.ts:304-307`, live via the POST /teams rollback) and the knowledge soft-archive
  (`knowledge-repository.ts:1496-1527`, an UPDATE, live via `POST /:id/archive`) — are reachable
  production paths and stay. Zero features are removed; the safety the ruling names already holds
  by absence of the capability.
- **The schema is not touched**: no FK dropped, no `onDelete` changed, no migration generated.
- **plan.md's scope is amended**: the production world, previously out of bounds outright, is
  newly in-bounds narrowly for removing a dead deletion feature. The amendment **exercises to
  zero** (no such feature exists) and authorizes nothing toward the 221 production governance
  violations, which remain AU29/AU30/AU31's.
- Entanglement to report: none — no removal was planned, so none is entangled.

---

## The production evidence the resolutions rest on (`feasibility.md` P16 + P18)

Full census of the production world (direct Drizzle deletes, raw SQL, migration files, cascade
FKs, soft-delete routes, reapers):

| Operation | Production path? | Evidence |
|---|---|---|
| delete a `teams` row | **YES** | `deleteTeam` (`layers/core-api/org/src/team-lookup.ts:304-307`) — members first (:305), team second (:306); called from the team-creation rollback (`layers/core-api/src/routes/teams-routes.ts:303`) |
| delete a `teamMembers` row | **YES** | same path, `:305` |
| delete a `users` row | **NO** | the agents DELETE route soft-retires (`layers/core-api/src/routes/agents.ts:480-497`, `status: "retired"`); no other delete, no raw SQL, no cascade FK on `users` |
| delete a `threads` row | **NO** | zero production deletes; no cascade FK on `threads` |
| delete a `knowledgeItems` row | **NO** | zero production deletes (only `knowledgeAccessLog` is reaped, `relevance-service.ts:246`); no cascade FK on `knowledgeItems` |
| delete an `items` row | **NO** | zero production deletes; no cascade FK on `items` |
| delete a `filesystems` row | **YES** | `filesystem-registry.ts:64` |

("No cascade FK on X" is exhaustive: the schema's 12 cascade FKs were attributed table by table —
they live on `teamRunConfigDefaults`, `agentRunConfig`, `orgEdges`, `knowledgeAppProjection`,
`taskPlanningSignals`, `filesystemInjections`, `filesystemCaptures`, `hintProgress`,
`loginSessions`, `serviceConnections` — none can remove a row of the tables above.)

P18 extends each "NO" from "no production path performs it" to "**no mechanism exists in code at
all**, in any shape" — searched by primitive (every Drizzle `.delete(`, every raw `DELETE FROM`,
positive controls included), by name (`dissolve/purge/prune/reap/forget/discard/hardDelete/destroy`,
`delete|remove|archive + entity`), by surface (all six HTTP DELETE handlers read in full, the
complete agent tool catalog, reapers, migrations, cascades), and by knip exemption (none hides
anything; no deletion export exists to hide). Full method and per-operation table in
`feasibility.md` P18.

---

## Per-file verdicts as they now stand

### foreign-keys.integration.test.ts — every delete operation resolved

| Test (line) | Operation probed | Verdict | Why |
|---|---|---|---|
| "rejects deleting a team while a teamMembers row references it" (:76-84, delete at :83) | delete `teams` | **STAYS** | Production performs team deletion; the membership RESTRICT FK (`schema.ts:129`) is what forces `deleteTeam`'s members-first order — load-bearing for the production path. Arrange simplifies to inserting exactly the pair (today it seeds five entities then deletes three of them through operations production never performs); assertion untouched |
| "rejects deleting a teamMembers row while a user references it" (:86-100, delete at :96) | delete `teamMembers` | **DELETED — Ruling B** | Zero assertions; outcome-tolerant `try/catch`; cannot fail. Reported per Ruling D, not worked around: the operation IS production-reachable (`deleteTeam`, `team-lookup.ts:305`) and the hedged FK exists (`users.teamId → teamMembers.id` RESTRICT, `schema.ts:69`), so a live test here would stay — this one asserts nothing, and Ruling B deletes dead tests outright, never rewrites them. The now-untested constraint is an accepted cost (architecture §6); a real test is a separate work package |
| "rejects deleting a team while a bet references it" (:102-115, delete at :114) | delete `teams` | **STAYS — REWORKED** | The formerly-partial team at :104 **receives its membership companion** (Ruling C, no exceptions). Because that companion's own RESTRICT FK would be a second sufficient cause of the asserted rejection, the test then removes the membership row in the owner's own order (`team-lookup.ts:305` before `:306`) before the act — the assertion (`rejects.toThrow()`, byte-identical) regains its single cause, the bets FK. Stronger than "intermediate state": `deleteTeam` is **non-transactional** (two sequential awaits, no `db.transaction`), so when :306 rejects, the :305 membership deletion has already committed — production **durably** produces exactly this member-less-team state (round-3 N2, verified). Comment + `@lore` at the removal cite the production path and the non-transactionality |
| "rejects deleting an agent while a session references it" (:117-128) | delete `users` | **DELETED — Ruling D** | Production never deletes users (P16); no user-deletion mechanism exists in code (P18) |
| "rejects deleting a thread while a message references it" (:130-161) | delete `threads` | **DELETED — Ruling D** | Production never deletes threads (P16); no mechanism exists (P18) |
| "rejects deleting a thread while an item references it" (:163-184) | delete `threads` | **DELETED — Ruling D** | Same |
| "rejects deleting an agent while a routine references it" (:186-199) | delete `users` | **DELETED — Ruling D** | Same as :117 |
| "rejects deleting a knowledge_items row while knowledge_edit_log rows reference it" (:207-241, delete at :233) | delete `knowledgeItems` | **DELETED — Ruling D** | Production never deletes knowledge items (P16); the only lifecycle verb is the soft archive, an UPDATE (P18). The test's own comment appeals to an *operator* archiving the log before removing the item — an operator with DB access is not a production code path, which is the ruling's criterion. Lint sites :210/:233 clear by deletion |
| "rejects deleting a knowledge_items row while knowledge_conflicts rows reference it" (:245-277, delete at :270) | delete `knowledgeItems` | **DELETED — Ruling D** | Same; lint sites :248/:270 clear by deletion |
| "verdict messages survive item deletion" (:284-341, delete at :334) | delete `items` | **DELETED — Ruling D** | Production never deletes items (P16); no mechanism exists (P18) |

Net: 2 of 10 tests remain; the shared seeder and dead imports go with the deleted eight. The
earlier draft's verdict "(a) for the four flagged sites" is superseded — those four sites clear
because their tests are deleted, not because companions are added to them.

### schema.integration.test.ts — 4 sites (438, 461, 474, 486): **(a), companion added**

CRUD probes reading only `knowledgeItems`/`knowledgeEditLog`; a minimal projection row
(`{ id, knowledgeItemId }`) is invisible to every assertion; the insert-FK rejection tests
(:567-664) assert insert rejections on deliberately nonexistent ids no companion ever creates.
Assertions byte-identical. No delete is probed anywhere in the file.

### migration.integration.test.ts — 1 site (63): **(a), companion added**

CRUD-after-migrate probe; a `teamMembers` row alongside changes nothing the test selects and
exercises a second migrated table for free.

### session-requests.integration.test.ts — 1 site (59): **(a), preferring deletion of the vestigial row**

The inserted `teams` row is referenced by nothing in the file. Delete the insert (a row nothing
references proves nothing; builder re-runs the file to confirm no hidden FK needed it), or add the
companion — either way assertions untouched.

### Other touched files reached by the rulings

- `applications/desktop/__tests__/migrate.test.ts` — the `seed` test deleted (Ruling B, above).
- `layers/agent-orchestration/agent-run-config/src/__tests__/agent-run-config-store.integration.test.ts`
  — "deleting the agent cascades the config row away" **DELETED — Ruling D**: it probes the
  `agentRunConfig.agentId → users.id` cascade (`schema.ts:113`), which can only fire on a user
  deletion; production never deletes users (P16) and no user-deletion mechanism exists in code
  (P18). Nor is there any direct `agentRunConfig` deletion feature to remove — the store's full
  export surface is `DEFAULT_AGENT_RUN_CONFIG` / `readAgentRunConfig` / `readAgentRunConfigs` /
  `writeAgentRunConfig` (`agent-run-config-store.ts:44,75,94,121`); the cascade exists only as the
  FK, and the schema is untouched per Ruling D. The file's separate `teams` companion site is fixed
  per D2 as planned.
- `layers/core-api/src/__tests__/knowledge-access.integration.test.ts:172` — the
  cannot-fail assertion line deleted (Ruling B, above); the test stays.
- `tools/eval/src/judges.ts` — **untouched** (Ruling A).
- Out of the sweep's reach, on the record: `hint-progress.integration.test.ts:99` and
  `P2-org-edges.integration.test.ts:248` also delete `users` rows, and
  `O2-schema-migration.integration.test.ts:923/:977` raw-deletes `knowledge_items`/`tasks` rows
  (found by P18's all-worlds sweep) — those files are not touched by this work package (no
  violation, no planned edit); applying Rulings C/D there is future work, not silent scope growth
  here.

### What is deliberately NOT decided here

Option (c) — refining the table rule to exempt constraint-subject tests — stays off the table, now
doubly: it was already rejected as an underivable intent carve-out, and Ruling C refuses the
exception mechanism outright. No rule change touches the companion rule; the only rule change in
this work package is Ruling A's development relaxation of the AI door.

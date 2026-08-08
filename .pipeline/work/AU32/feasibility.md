# AU32 — feasibility: what was actually run, and what it proved

Worktree `.worktrees/pipeline-AU32`, branch `pipeline/AU32` at `origin/main` bbe82e9a, Node 24.
Every command below was executed on this tree on 2026-08-07. Scratch outputs live under
`.pipeline/work/AU32/probes/`.

## P1 — live violation census

**Question.** What are the development-world violations, exactly, today?
**Method.** `npx tsx scripts/governance-lint.ts` (full run; per-site output preserved at
`probes/lint-development-sites.txt`).
**Result.** PASS (all known-debt at warn): `221 production + 67 development known violation(s)`;
development = 67 sites / 45 files / 7 groups — 61 table-write sites (39 files) + 3
`layer → db:schema-ns` + 1 `tooling → db:schema-ns` + 1 `application → db:unknown` + 1
`tooling → raw runtime`. plan.md's "69/46" and its naming of `seed-then-migrate` as a violator are
stale; `session-requests.integration.test.ts` is in the framework group instead.
**Verdict.** Architecture works from these measured numbers. ACs are count-independent, so no
amendment.

## P2 — the masking question has a schema answer

**Question.** Would adding the `knowledgeAppProjection` companion mask the RESTRICT foreign keys
probed by `foreign-keys.integration.test.ts`?
**Method.** Read the live table definition.
**Result.** `knowledgeAppProjection.knowledgeItemId` → `knowledgeItems.id` is `onDelete: "cascade"`
(`framework/db/src/schema.ts:1004-1027`). A cascade FK cannot cause a delete to reject; the asserted
`rejects.toThrow()` can only come from the RESTRICT FKs under probe (`knowledgeEditLog.itemId`,
`knowledgeConflicts.itemId`).
**Verdict.** Option (a) is safe for the foreign-key file; the founder-gate document rests on this.

## P3 — the four schema-question files are green today

**Method.** `npx vitest run --config vitest.integration.config.ts --project service` over
`foreign-keys`, `schema`, `migration`, `session-requests`, `seed-then-migrate` in
`framework/db/src/__tests__/`.
**Result.** 5 files, **41 tests, all passed**, 4.2s.
**Verdict.** A known-green starting point for the most sensitive files; any post-change delta in
these files is attributable to the change.

## P4 — `seedBase` coverage and reachability (the plan's convergence claim)

**Question.** Does `seedBase` establish the companion rows for BOTH pairs, and can the ~35 mechanical
sites actually reach it?
**Method.** Read `layers/core-api/src/__tests__/_helpers.ts:58-83`; grep `seedBase` consumers; map
each violating file to its npm package.
**Result.** `seedBase` writes `teams`+`teamMembers` (pair complete) plus one user and one thread —
**nothing for `knowledgeItems`/`knowledgeAppProjection`**. It is unexported (correctly — a
production export only tests consume dies under knip:production) and reachable only within the
`@hyperidle/core-api` package: 24 of 39 violating table-write files. 15 violating files live in
other packages (`core-api/work`, `core-api/routine`, three `agent-orchestration` services, the
`agent-orchestration` layer, `framework/db`). One violating file (`promote-knowledge`) already calls
`seedBase` and is still flagged — for the knowledge pair.
**Verdict.** Literal convergence on `seedBase` is impossible for the knowledge pair and for 14 of 39
files. Honoured as intent: two new parametrized pair-writing helpers in the same `_helpers.ts` for
the core-api package; inline companion inserts elsewhere (architecture D2). The helper change is
owned by this work package's builder; it is a development file.

## P5 — the companion rule's mechanics, from source

**Method.** Read `scripts/lib/crossing-detectors.ts:366-451` (`buildCompanionGroups`), `:484+`
(`buildWriteSets`), `:781-783` (missing-companion computation), `governance-model.ts:351-399`.
**Result.** (i) Groups are derived from owners' exported unconditional multi-inserts, filtered to
tables the owner revises (Ruling 13a); live groups are exactly `{teams↔teamMembers}` and
`{knowledgeItems↔knowledgeAppProjection}`. (ii) The violation check is **file-grained**: any
insert/update/delete of a grouped table is a site unless the file's total write set (including
imported development helpers) contains the companion. So one companion write per file silences all
its sites — architecture contract C6 forbids exploiting that; completion is per arranged entity.
(iii) Updates and deletes are flagged the same as inserts, which is why
`app-runtime-domain-observability`'s projection-only update and `foreign-keys`' deletes appear.
**Verdict.** Fix shapes in D2/D3 follow directly; no rule change needed for any live site.

## P6 — the detection-and-clean-way evidence already executes on every lint

**Method.** `npx tsx scripts/governance-lint.ts --attacks` and `--fixtures`.
**Result.** `--attacks: PASS — 47 break-tests against the live tree` (includes `missing-companion`,
which overlays a teams-without-members test file and expects the finding, and its control twin
`attack-companion-supplied` expecting clean — `scripts/lib/governance-attacks.ts:506-533`);
`--fixtures: PASS — 63 synthetic cases`. Both run inside `npm run lint` (package.json:39).
**Verdict.** AC "a developer adding a `teams` insert without `teamMembers` fails naming file and
line" is already break-tested on every lint run; the attack fixture belongs where it is, and no new
attack case is required since this work package registers no new rule. The remaining post-clear
proof (warn→error flip once the baseline group is deleted) is a one-off recorded manual check named
in the architecture's evidence table.

## P7 — derivation-proof coverage gap

**Method.** Read `framework/db/src/__tests__/governance-crossings.test.ts:900-1075`.
**Result.** Real tests exist for group formation, the switch negative control, the append-only drop
(Ruling 13a), the foreign-seeder exclusion, and helper-write crediting. The specific direction
"owner stops writing the two rows together ⇒ the pair stops being reported" (validation scenario 3)
has no direct case — it is implied by `written.size < 2 → continue` but not pinned.
**Verdict.** One new test case (architecture D9), in the existing describe block, imports
`buildCompanionGroups` and asserts an owner inserting only `teams` yields no group. A real test of
runtime behavior through imports, not an assertion.

## P8 — one-door sites, each read in full

- **ah1/ah5/ah6** (`layers/core-ui/__scripts__/`): `schema` is used for exactly one thing —
  `drizzle(client, { schema })` before drizzle's `migrate` (ah1:28/52-53, ah5:38/63, ah6:46/92).
  ah6's seeding uses named table imports and already writes the teams pair. Zero production code
  uses drizzle's relational `db.query.*` API (repo-wide grep over non-test sources: no hits), so the
  schema-bound client is not load-bearing at runtime. `createPgliteDb(dataDir)`
  (`connection.ts:71-81`) + `applyMigrations(dataDir, folder)` (`migrate.ts` — opens/closes its own
  client at that path, hence the tmp-dir composition in D4) replace the hand-roll with existing
  `db:client` exports, no casts, no new export.
- **eval/src/runner.ts:14** — same single pattern (`createEvalDb`, :68-79); same fix.
- **desktop/__tests__/migrate.test.ts:34,63** — imports and mocks `seed`, which
  `framework/db/src/index.ts` does not export (verified: barrel read end to end; `seed.ts` deleted
  under AU28 Ruling 9 step 1). The assertion is vacuous today. Live seeding symbols are
  `seedDemoWorld` (index.ts:19) and `applyFactoryBootstrap` (index.ts:20), both `db:bootstrap`
  (reach: composition roots — desktop qualifies even in production). Repointing the test closes the
  `db:unknown` entry with **no** export decision — the NOTE's `seed` line disappears because nothing
  imports the ghost anymore.
- **eval/src/judges.ts:502** — `await import("@anthropic-ai/sdk")` inside `judgeLlmQuality`, built
  from `ctx.resolvedModel` (`apiKey`/`baseUrl`/`model`). `callLlm(options)` at
  `layers/agent-execution/harness-registry/src/llm-client.ts:670` takes the same `ResolvedModel`,
  supports `maxTokens` and plain user messages, dispatches per provider, and is the interceptable
  one-door path. eval already declares and imports `@hyperidle/harness-registry`
  (`tools/eval/package.json:17`, `src/provision-harness.ts:20`) — no new manifest row; a tooling
  development file importing a service is allowed in the development world (verified against
  `governance-model.ts` branch order: not a one-door target ⇒ `development-may-arrange-the-world`).

## P9 — AC-5 liveness

**Method.** `governance/baseline.json` read in full; `.pipeline/AU.md` registry statuses.
**Result.** 31 production groups / 221 sites remain, all owned by AU29/AU30/AU31 (statuses:
planned). Clearing all 7 development groups cannot empty the file.
**Verdict.** AC-5 is **vacuous for this work package today**; it survives only as the ship-time
`jq '.groups | length'` check in the architecture's evidence table, with the deletion obligation
attaching only if the other three ship and this branch rebases onto a production-clean baseline
first.

## P10 — test baseline capture (AC-6 "before" leg), measured

**Method.** On the clean tree at base bbe82e9a: `npm run test:all > probes/test-baseline-full.txt`
and `npm run test:integration:service > probes/test-baseline-integration-service.txt` (both
committed under `.pipeline/work/AU32/probes/`).
**Result.**
- Unit + component (`test:full` leg): **562 files / 6203 tests, all passed**.
- Integration, service project only: **320 files passed, 1 skipped / 2835 tests passed, 4 skipped,
  0 failed** — exit 0.
- Integration, both projects (inside `test:all`): 325 passed / **7 failed / 1 skipped** files; 2855
  passed / 1 failed / 5 skipped tests — exit 1. **Every failing file is in the release-gated
  `|harness|` project** (AL7-two-session-trust-first, AU9-assistant-handoff-realbinary,
  assistant-reply-live-harness, real-harness-return-enforcement-realbinary, AM2-builtin-gateway,
  AM2-real-harness-discovery, AN2-connection-provisioning) — live-LLM/real-binary tests that
  hard-fail by design when the key/env is absent in the invoking shell (verify does not auto-load
  `.env`), plus one real codex MCP probe failure. All pre-existing at base; none touches a file this
  work package changes.
**Verdict.** The deterministic AC-6 comparison is `test:full` + `test:integration:service` (6203 +
2835 passes). The harness lane is recorded as-found; it is release-gated, env-dependent, and not
this work package's baseline to drain — the builder compares like-for-like and treats any NEW
harness-lane delta in touched paths as a finding, not a fix-target.

## Not probed / UNVERIFIED

- PGlite's exact in-memory `dataDir` spelling for `createPgliteDb` (docblock says `":memory:"`,
  PGlite convention is `memory://`) — irrelevant to the locked tmp-dir shape, noted only for the
  D4 alternative; builder verifies if chosen.
- Whether `POST /api/knowledge`'s route validation accepts `layer`/`kind` (D3's primary shape) —
  named as a builder verification with the repository-`update()` fallback locked.
- The judge path's live LLM execution — deliberately deferred to the builder as a named live-proof
  obligation (it costs a real model call and proves the changed code, not this plan).

---

Probes P11–P13 below were run on 2026-08-08 during the critique-revision pass (same tree, same base).

## P11 — masking sweep: which arranged entities must NOT receive their companion

**Question.** Per-entity completion (contract C6) must not add a companion row that would itself
participate in a rejection a test asserts. Where, across every file this work package touches, can
that happen — and is the `foreign-keys` line-104 team the only instance?

**Criterion (derived from the schema, not from paths).** An arranged entity is excluded from
completion when (i) the test asserts that deleting the entity rejects, and (ii) the companion table
references the entity through a non-cascade FK. Schema facts bounding the sweep: the only
non-cascade companion FK is `teamMembers.teamId → teams.id` (`onDelete: "restrict"`,
`framework/db/src/schema.ts:127-129`); `knowledgeAppProjection.knowledgeItemId` is
`onDelete: "cascade"` (`schema.ts:1004-1027`) and can never cause a rejection — so only `teams`
entities under asserted delete-rejections can ever collide.

**Method.** File set = every file this package touches: the 39 table-write files from the live lint
output (the four schema-question files are among them), plus `ah1/ah5/ah6-test-server.ts`,
`tools/eval/src/runner.ts`, `tools/eval/src/judges.ts`, `applications/desktop/__tests__/migrate.test.ts`.
Five greps over the set, every hit then read in context:
1. `delete\((teams|teamMembers|knowledgeItems|knowledgeAppProjection)\b` — deletes of grouped tables;
2. `\.rejects\.` — every rejection assertion, whatever its subject;
3. raw-SQL delete/truncate (`execute(...delete|truncate`, `` sql`...delete|truncate ``) — zero hits;
4. HTTP deletes (`"DELETE"`, `method: DELETE`) — zero hits;
5. service-level delete calls (`deleteTeam|removeTeam|deleteKnowledge|archiveKnowledge`) — zero hits.

**Result — deletes of grouped tables.** Exactly one file contains any:
`framework/db/src/__tests__/foreign-keys.integration.test.ts`, five operations:
- `:83` — `delete(teams p1)` asserted to reject; arranged via the shared seeder (`:40-43`) which
  writes the **full pair**, and the membership FK **is** the constraint under probe. Complete
  already; nothing for C6 to add. Not a collision.
- `:96` — `delete(teamMembers t1)` inside try/catch, tolerant of both outcomes, no assertion.
  Not a collision.
- `:104/:114` — **the entity.** `teams p1` arranged bare; asserted rejection (`:114`, no matcher)
  probes `bets.teamId → teams.id` RESTRICT; a membership companion's own RESTRICT FK would
  over-determine it. Meets the criterion. Must stay partial.
- `:233`, `:270` — `delete(knowledgeItems ki-1)` asserted to reject; companion is the cascade
  projection — inert to the assertion (P2). Not a collision.

**Result — all other rejection assertions in the set, classified.** None is a delete of a
grouped-table parent; no companion row can be a cause of any of them:
- `schema.integration.test.ts:581/615/645/661` — **insert**-FK rejections on deliberately
  nonexistent ids (`betId:"nonexistent-bet"`, `agentId:"nonexistent-agent"`,
  `senderId:"nonexistent-agent"`, `itemId:"nonexistent-ki"`). Companion rows write
  `teamMembers`/`knowledgeAppProjection`, tables none of those FKs reference, and companions are
  only ever created for *arranged* entities, never for the nonexistent ids. Inert.
- `session-requests.integration.test.ts:50` — idempotency **unique-constraint** insert rejection on
  `agentSessionRequests`. Inert.
- `routine-run-resolver.integration.test.ts:170/190/211/232/253/393/416` — service-level
  `resolveRoutineRunRequest` rejections (run absent, outcome not running, soft-deleted, inactive,
  paused, delegate not runnable); causes read routines/runs/users state, not membership. Inert.
- `routine-scheduler-completeness.integration.test.ts:131/162` — scheduler-startup failures
  (malformed trigger JSON, `setInterval` mocked to throw). Inert.
- `filesystems-completeness-contract.integration.test.ts:120` — duplicate-injection
  unique-constraint rejection. Inert.
- `core-api-port-increment2-knowledge.integration.test.ts:418/541` — auth rejections
  (no-credential port calls). Inert.
- `migrate.test.ts:87/109` — migration-path errors under mocks, no DB rows arranged. Inert.

Also checked the reverse (visible) direction: no test in the set **successfully** deletes a `teams`
row, so no added membership row can newly break a passing delete (which C1 would catch as a
finding anyway).

**Verdict.** Exactly **one** arranged entity in the whole touched set meets the masking criterion:
`foreign-keys.integration.test.ts:104`. The claim "the masking fear is empty" is corrected to
per-pair: empty for the knowledge pair (cascade), real for the teams pair with this single live
instance. Architecture §1 states the criterion; C6 carries the exclusion; T2 owns the entity;
`schema-test-decision.md` puts the keep-partial decision (drafted Ruling 16) in front of the
founder, as plan.md's gate clause requires.

## P12 — scenario-3 evidence command corrected and verified

**Question.** The evidence table's original command ran `governance-crossings.test.ts` through
`vitest.integration.config.ts --project service`, whose include is `*.integration.test.*` only —
it would match zero tests. Does the plain unit-lane command actually run the file?
**Method.** `npx vitest run framework/db/src/__tests__/governance-crossings.test.ts` (Node 24, base
tree).
**Result.** 1 file, **68 tests, all passed**, 2.2s.
**Verdict.** Evidence table updated to this command; it runs in the default/unit config and in
`test:full`.

## P13 — the warn→error flip: what the standing lanes can and cannot prove

**Question.** AC-4 claims the development rules fail the build on reappearance once their baseline
groups are deleted. The standing `missing-companion` attack passed at base with the group still
baselined — can any standing lane prove the severity flip?
**Method.** Read the severity assignment and the attack runner's judging.
**Result.**
- Severity is per (group, file) allowance: `allowed = baseline.groups[key]?.sites[file] ?? 0`; the
  first N findings are `warn`, everything beyond is `error` (`scripts/rules/crossings.ts:59-87`).
- The attack lane runs the rules against `EMPTY_BASELINE` (`scripts/governance-lint.ts:152-159` —
  "the attack overlay is never debt"), **but** the `sort: "violation"` expectation used by
  `missing-companion` judges the raw `violationsOf` output — pre-baseline, severity-agnostic
  (`scripts/lib/governance-attacks.ts:841-846`). So the standing attack proves detection, not the
  flip; the critique's N2 is confirmed.
- `crossingRules` is exported (`scripts/rules/crossings.ts:51`, imported by
  `governance-lint.ts:59`), and `governance-crossings.test.ts` already deep-imports scripts modules
  (`:11-32`) — a unit case can run it twice over one synthetic companion-group violation
  (allowance present ⇒ `warn`; group absent ⇒ `error`) and pin the flip in `test:full` on every
  run.
**Verdict.** D9 gains a second case (the severity flip); the one-off manual probe is demoted to
optional corroboration in the AC-4 evidence row.

## P14 — D4 alternative scoped away from `runner.ts`

**Question.** Is the `createTestDb()` per-file alternative in D4 available to every one of the four
schema-ns files?
**Method.** Read `tools/eval/src/runner.ts:64-68`.
**Result.** The file carries its own `@lore X7`: `createTestDb` is vitest-coupled (worker pool, IPC
disconnect handler) and the eval runs as a standalone tsx script.
**Verdict.** D4's alternative is scoped to the three ah scripts only; `runner.ts` takes the tmp-dir
composition, the only shape that works for it.

---

Probes P15–P17 below were run on 2026-08-08 during the post-gate rework (same tree, same base
bbe82e9a), applying founder Rulings A/B/C (`founder-rulings.md`).

## P15 — Ruling A rule-relaxation spike: before/after lint, measured then reverted

**Question.** Does removing the raw-runtime arm from the development relaxation clear the
`tooling → raw runtime [capability] development` entry without touching any production verdict —
and what else pins the old behavior?

**Method.** Temporary one-line edit to `scripts/lib/governance-model.ts` — removed
`(target.sort === "raw-runtime" && arch.oneDoorSurfaces.rawRuntime) ||` from the `guarded`
predicate in `relaxForDevelopment` (:369-375) — then `npx tsx scripts/governance-lint.ts`,
`npm run governance:baseline` (dry run), and `--attacks`; then `git checkout` reverted the edit and
a final lint confirmed the tree back at baseline.

**Result.**
- **Before:** `PASS — … 221 production + 67 development known violation(s) at warn` (7 development
  groups, incl. `1 tooling → raw runtime [capability]`).
- **After the one-line edit:** `221 production + 66 development` — the `tooling → raw runtime`
  development group is gone from the summary; every other group byte-identical. The run FAILs with
  exactly one error, and it is the scheduled one:
  `[baseline-ratchet] … tooling → raw runtime [capability] development — tools/eval/src/judges.ts:
  0 violation(s) now, baseline still records 1 … run npm run governance:baseline`.
- **Baseline generator dry run:** `production 221 … delta +0; development 66 … delta -1` — the
  production world is provably untouched by the relaxation (the raw-runtime rule has zero
  production known-debt sites; its 4 production instances live inside the owner,
  `harness-registry`, allowed by `hold-one-runtime-door`, which reads `architecture.json`'s
  `rawRuntime.host`, not the relaxation data).
- **Attack lane under the spike:** `46/47` — the only failure is `raw-runtime-in-a-test`
  (`governance-attacks.ts:349-363`), which expects a development violation the relaxed rule no
  longer emits; the three production raw-runtime attacks (`:303/:313/:335`, all
  `service → raw runtime [capability] production`) and the clean spawn control (`:338-348`) still
  PASS — the production door demonstrably stands.
- **Revert confirmed:** final lint `PASS … 221 production + 67 development`.

**Other pins found (builder edits these with the rule, per architecture D6′):**
`governance/decided-rules.json:1055-1076` — `service → raw runtime` and `tooling → raw runtime`
both carry development `"forbidden"` (the only two; the owner rows :1367-1390 are allowed/allowed);
`framework/db/src/__tests__/governance-model.test.ts:400-421` — asserts the door holds "in BOTH
worlds" and that the development clause contains `held: one door`;
`framework/db/src/__tests__/governance-crossings.test.ts:525-531` — synthetic architecture literal
sets `oneDoorSurfaces.rawRuntime: true` (correction, round-3 N1: the literal is cast
`as unknown as Architecture` at :532, so deleting the interface field does **not** type-break it —
the builder edits this pin by hand in T7; relying on the compiler to surface it would miss it);
`governance/architecture.json:131-132` — the `rawRuntime` boolean + note inside `oneDoorSurfaces`
(unread once the arm goes); `governance/baseline.json:337` — the development group (regenerated
away, D7).

**Verdict.** The relaxation is exactly one predicate arm plus its data/test/attack pins; production
verdicts cannot move (different code path, measured `+0`); the lint before/after is the AC-2
evidence shape.

## P16 — production deletion paths, per delete operation the sweep found

**Question.** Ruling C: for every delete operation a touched test performs or probes, does any
production path perform that operation at all?

**Method.** Full census of the production world (shipping roots `layers/ framework/ applications/`,
excluding all development-named files): (1) every Drizzle `.delete(` call, read in context;
(2) raw SQL — case-insensitive `delete from` over `.ts` and `.sql` (includes
`framework/db/drizzle/` migrations): zero hits outside tests; (3) every `onDelete: "cascade"` FK in
`framework/db/src/schema.ts`, attributed to its owning table by `awk` against the `pgTable`
definitions; (4) soft-delete routes read in full (`agents.ts`, `routines-routes.ts`);
(5) reapers/cleanup (`credentials-reaper.ts`, `relevance-service.ts:246`, `notification-queue.ts`,
`work-service.ts:105`, `service-bootstrap.ts:136`).

**Result — the complete production delete surface:** `teamMembers`+`teams`
(`team-lookup.ts:305-306`, sole caller `teams-routes.ts:303`, the POST /teams rollback), `orgEdges`
(`org-edges.ts:57`), `serverCredentials` (`credential-store.ts:119`), `notificationQueue`,
`knowledgeAccessLog`, `taskDispatchAttempts`, `propagationLog`, `loginSessions`, `inviteCodes`,
`agentLifecycleInbox`, `agentWorkIntents`, `explicitSessionStarts`, `serviceConnections`,
`filesystems`+`filesystemInjections` (`filesystem-registry.ts:64,80`). **Not on the list, by any
mechanism (direct, raw SQL, migration, cascade): `users` (agents DELETE route soft-retires,
`agents.ts:495`), `threads`, `knowledgeItems`, `items`, `bets`, `tasks`.** Cascade attribution: the
12 cascade FKs live on `teamRunConfigDefaults:54`, `agentRunConfig:113`, `orgEdges:865`,
`knowledgeAppProjection:1011`, `taskPlanningSignals:1052`, `filesystemInjections:1255/1258`,
`filesystemCaptures:1288/1291`, `hintProgress:1437`, `loginSessions:1461`,
`serviceConnections:1742` — no cascade can remove a `users`/`threads`/`knowledgeItems`/`items`
row.

**Per-op resolutions** (the op inventory = P11's five grouped-table deletes + everything the wider
sweep surfaced in touched files): recorded in full in `schema-test-decision.md`. Summary: teams
deletes (:83, :114) production-performed → tests stay (:114 reworked for sole cause);
teamMembers delete (:96) sits in an assertion-free test → deleted under Ruling B; user deletes
(foreign-keys :127/:198, agent-run-config-store:157), thread deletes (:160/:183), knowledgeItems
deletes (:233/:270), items delete (:334) → no production path → tests deleted (label updated:
these deletions now ride **Ruling D**, recorded after this probe — see P18);
`capture-provenance:149` deletes `filesystems` — production-performed (`filesystem-registry.ts:64`),
no change. Out-of-set note: `hint-progress:99` and `P2-org-edges:248` also delete `users` but are
not touched files — named as future work, not swept here.

## P17 — dead-test sweep over the touched set (Ruling B as a principle)

**Question.** Which tests in the files this work package touches cannot fail?

**Method.** Touched set = the 49 files from the per-site lint probe (39 table-write + 6 one-door +
overlap-adjusted) — list derived mechanically from `probes/lint-development-sites.txt`. Four
sweeps, every hit read in context: (1) `vi.mock`/`vi.doMock` in any touched file, each mocked
symbol checked against the live barrel exports; (2) multiline empty-`catch` blocks
(`rg -U 'catch(\s*\([^)]*\))?\s*\{\s*(//[^\n]*)?\s*\}'`); (3) literal-subject assertions
(`expect(true|false|<number>|"literal")`); (4) `not.toThrow()` / `resolves.*` / `toBeDefined()`
occurrences, read for whether the subject can actually throw/reject/be undefined.

**Result.**
- `vi.mock` exists in exactly one touched file, `applications/desktop/__tests__/migrate.test.ts`.
  Its `electron`, `applyMigrations`, `isDowngrade` mocks target live symbols; its `seed` mock
  targets a symbol `framework/db/src/index.ts` does not export — **the "does NOT call seed()" test
  (:62-69) cannot fail. Delete** (test + mock entry :34-37 + import :63). The file's other eight
  tests can all fail and stay.
- Empty catches: two. `foreign-keys.integration.test.ts:97` — inside the assertion-free test
  :86-100 whose probe tolerates both outcomes: **cannot fail, delete** (the file's only
  assertion-free test). `migrate.test.ts:98` — a legitimate expected-throw guard followed by a live
  assertion (:101); not dead.
- Literal-subject assertions: zero.
- Guaranteed-by-construction: one — `knowledge-access.integration.test.ts:172`,
  `expect(() => new Date(row?.accessedAt as string)).not.toThrow()`: the `Date` constructor never
  throws for any input (invalid input yields `Invalid Date`). **The assertion line is deleted**;
  the test keeps its four live assertions (row defined, itemId, accessorKind, typeof string) and
  can still fail. The other `not.toThrow`/`resolves` hits (`relevance-service:214`,
  `agent-run-admission-failed-subscribers:464`) await real async functions that can reject — they
  can fail; the ~25 `toBeDefined()` hits assert on query results that can genuinely be undefined —
  they can fail and were not itemized further.

**Verdict.** Three findings total: one dead test in `migrate.test.ts`, one dead test in
`foreign-keys` (also independently condemned by its lack of assertions), one dead assertion line in
`knowledge-access`. The sweep found nothing else; the credibility of "nothing else" rests on the
four named searches being re-runnable verbatim over the same file list.

---

Probe P18 below was run on 2026-08-08 after founder Ruling D (`founder-rulings.md`), which overruled
the round-3 blocking finding and mandated a deletion-mechanism investigation per probed operation.

## P18 — deletion-mechanism census per probed operation (Ruling D)

**Question.** For each operation the contested tests probe — delete a `users` row, a `threads` row, a
`knowledgeItems` row, an `items` row, a `teamMembers` row, and the `agentRunConfig` cascade fired by
deleting an agent — does a deletion mechanism exist **in code at all** (any shape: repository/service
function, HTTP route including soft-delete routes and handlers deleting other than their named
subject, agent/MCP tool, event handler, scheduled job/reaper, CLI or script path, migration-time
cleanup, cascade side effect of a parent production does delete, raw SQL)? Is it reachable from
production? If dead, what is the whole-feature removal and its orphan closure?

**Why these searches would have found a mechanism if one existed.** In this stack every hard row
delete bottoms out in exactly two primitives: a Drizzle `db.delete(<table>)` call or raw SQL
`DELETE FROM`. Any wrapper — service function, route handler, tool handler, reaper, CLI — must
contain or transitively call one of the two. Sweeps 1–2 enumerate both primitives exhaustively across
**all worlds** (production and development, `layers/ framework/ applications/ tools/ scripts/
governance/`); sweeps 3–8 then attack the wrapper layer by name and by surface so that a mechanism
whose primitive sits behind an import is still surfaced at its entry point. Grep-binary hazard
handled: `rg` over typed globs with positive controls (below) proving each search reaches the
relevant file population.

**Sweep 1 — Drizzle deletes of the six tables, all worlds.**
`rg -n "delete\((users|threads|knowledgeItems|items|teamMembers|agentRunConfig)\b"` over
`layers framework applications tools scripts`: **13 hits.** Twelve are development test files
(`foreign-keys.integration.test.ts` :81/:96/:127/:160/:183/:198/:233/:270/:334,
`hint-progress.integration.test.ts:99`, `P2-org-edges.integration.test.ts:248`,
`agent-run-config-store.integration.test.ts:157`) — a test's own arrange/probe is not a mechanism
and not a consumer. Exactly **one** production hit: `layers/core-api/org/src/team-lookup.ts:305`
(`teamMembers`, inside `deleteTeam`). Zero hits in `tools/` or `scripts/` (no CLI/script path).

**Sweep 2 — raw SQL, all worlds including migrations.**
`rg -in "delete\s+from" -g '*.ts' -g '*.sql'` over the same roots plus `governance/`: hits are one
detector doc comment (`crossing-detectors.ts:244`), one synthetic fixture string
(`governance-crossings.test.ts:192`), and two development-test raw deletes
(`layers/core-api/src/__tests__/O2-schema-migration.integration.test.ts:923` `knowledge_items`,
`:977` `tasks`). Zero production hits. **Positive control:** the same glob set reaches all 56
migration files under `framework/db/drizzle/*.sql` — 4 of them match `DROP TABLE` (the retired-table
drops round-3 N4 attributed), 0 match `DELETE FROM` — so the search demonstrably reads the migration
population and migration-time row cleanup is excluded by evidence, not silence.

**Sweep 3 — full production `.delete(` enumeration, every table.** All `.delete(` in shipping roots
minus development-named files, each hit read and attributed: Drizzle deletes exist only on
`propagationLog` (`service-bootstrap.ts:136`), `serverCredentials` (`credential-store.ts:119`),
`notificationQueue` (`notification-queue.ts:201`), `loginSessions` (`credentials-reaper.ts:39`),
`inviteCodes` (`credentials-reaper.ts:65`), `teamMembers`+`teams` (`team-lookup.ts:305-306`),
`orgEdges` (`org-edges.ts:57`), `taskDispatchAttempts` (`work-service.ts:105`),
`knowledgeAccessLog` (`relevance-service.ts:246`), `filesystems`+`filesystemInjections`
(`filesystem-registry.ts:64,80`), `agentLifecycleInbox`/`agentWorkIntents`/`explicitSessionStarts`
(`session-requests/service.ts:271,1042,1045`), `serviceConnections`
(`service-connection-store.ts:108`). Every other `.delete(` hit is an in-memory `Map`/`Set`/
searchParams delete. Identical to P16's census (independently re-verified by the round-3 critique,
N4). Also re-checked for the referencing children: zero production `delete(sessions|routines|
messages|bets|tasks)` anywhere.

**Sweep 4 — name-based wrapper hunt.** (a) `dissolve|purge|prune|reap|forget|discard|hardDelete|
destroy` over production files: every hit is a retention reaper of the tables in sweep 3, an
in-memory handle eviction, tiptap `destroy()`, or prose (`dissolvedAt` on `teamMembers`
(`schema.ts:135`) is a soft timestamp — set by nothing that deletes rows). (b)
`(delete|remove|archive)(User|Thread|Item|Knowledge|Agent|Member)`: the only production hit is
`remove` in `knowledge-repository.ts:1496-1527` (renamed from `archiveItem`) — read in full: an
**UPDATE** to `status:"archived"` plus a `knowledgeEditLog` INSERT, never a row delete; its live
production consumer is `POST /:id/archive` (`routes/knowledge.ts:28,839`). Not a deletion mechanism;
not dead; not removed.

**Sweep 5 — HTTP DELETE routes.** Every `router.delete("` registration in shipping roots — seven —
each handler read end to end for deletes of anything other than its named subject:
`agents.ts:481-497` (soft-retire: `updateUser(db, id, { status: "retired" })` at :495 — no row
delete of any table), `routines-routes.ts:186-203` (soft delete: `updateRoutine … deletedAt`),
`org.ts:206-215` → `orgEdges` only, `credentials.ts:242` → `serverCredentials` only,
`filesystems.ts:325-337` → `filesystems` + DB-level injection cascade only,
`filesystems.ts:340-354` (`/:id/injections/:agentUserId` → `deleteInjection` →
`filesystem-registry.ts:80`) → `filesystemInjections` only,
`connections.ts:339-355` → `serviceConnections` only. No handler deletes a row of the six tables.

**Sweep 6 — agent/MCP tool surface.** The complete tool catalog is
`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` (`buildToolDefinitions`, :1617);
its 22 tool names enumerated (:70-:1527): `read_inbox, send_message, reply, query_practice,
write_memory, handoff_to, create_item, write_session_notes, create_task, submit_review,
score_attention, promote_knowledge, create_conflict_review, create_team, add_agent, create_bet,
edit_bet, create_routine, update_routine, commit_file, log_task, create_artifact` — zero
deletion-shaped tools; knowledge lifecycle "archived" appears only as a status-transition value.
`harness-registry/src/mcp/*` contains no delete-named tool either. One further tool is registered
outside `tool-definitions.ts`: `return_status` (`harness-registry/src/return-status-tool.ts:110`) —
status-reporting only, no DB access, not deletion-shaped.

**Sweep 7 — scheduled jobs/event handlers.** The retention reaper (`service-bootstrap.ts:513-539`)
calls `reapExpiredCredentials`/`reap` (notificationQueue)/`reapAccessLog`/`reapPropagationLog`/
`reapTerminalTaskDispatchAttempts`; the credentials reaper covers `loginSessions`/`inviteCodes`.
All targets are sweep-3 tables; none is one of the six. Event-reaction files (`*-reactions.ts`)
contain only in-memory `registeredBuses.delete(...)`.

**Sweep 8 — cascade side effects of parents production DOES delete.** All 12 `onDelete: "cascade"`
FKs enumerated from `schema.ts` (attribution per P16, re-read): none sits ON `users`, `threads`,
`knowledgeItems`, `items`, or `teamMembers` — so no production-performed parent delete (teams,
teamMembers, orgEdges, filesystems, …) can remove a row of those five. The only cascade on a
contested subject is `agentRunConfig.agentId → users.id` (`schema.ts:113`), and its parent has no
deletion mechanism (this probe). `users.teamId → teamMembers.id` is `onDelete: "restrict"`
(`schema.ts:69`) — a rejection, never a removal.

**knip check.** `knip.json` read in full: the `ignore` list is test infra/fixtures, `ignoreIssues`
covers one component's exports — no exemption names any deletion symbol. The question "does knip
hide a dead deletion export" is **vacuous**: no deletion export for the six operations exists to
hide. The deletion-adjacent exports that do exist are all live: `deleteTeam`
(`org/src/index.ts:48`, consumed by `teams-routes.ts:31,303`), knowledge `remove`
(consumed by `routes/knowledge.ts:28`); `agent-run-config-store.ts` exports **no delete function
at all** (`DEFAULT_AGENT_RUN_CONFIG`:44, `readAgentRunConfig`:75, `readAgentRunConfigs`:94,
`writeAgentRunConfig`:121 — the full export surface).

**Per-operation verdicts.**

| Operation | Mechanism in code? | Production-reachable? | Verdict | Orphan closure |
|---|---|---|---|---|
| delete `users` row | **NO** — no primitive anywhere in production; agents DELETE soft-retires (update) | n/a | nothing to remove; tests deleted (Ruling D) | none |
| delete `threads` row | **NO** — no primitive; `messages` has soft-delete (`deletedAt`), threads not even that | n/a | nothing to remove; tests deleted (Ruling D) | none |
| delete `knowledgeItems` row | **NO** hard delete — `remove` is a soft archive (UPDATE + log INSERT), live via `POST /:id/archive` | n/a (the soft archive IS reachable and is not a deletion) | nothing to remove; tests deleted (Ruling D) | none |
| delete `items` row | **NO** — no primitive | n/a | nothing to remove; test deleted (Ruling D) | none |
| delete `teamMembers` row | **YES** — `deleteTeam` (`team-lookup.ts:305`) | **YES** — `teams-routes.ts:303` (POST /teams rollback) | operation reachable → a live test would STAY under Ruling D; the only test probing it (`foreign-keys:86-100`) asserts nothing and cannot fail → deleted under Ruling B (independent criterion; Ruling B forbids rewriting) | none — the mechanism is live and untouched |
| `agentRunConfig` cascade on agent deletion | the only "mechanism" is the FK itself (`schema.ts:113`); no code deletes `agentRunConfig` rows and no code deletes its parent | **NO** — unreachable (parent never deleted) | schema untouched per Ruling D (no FK dropped, no `onDelete` changed, **no migration generated**); nothing else exists to remove; test deleted | none |

**Net finding.** The Ruling-D "dead deletion feature" branch is **empty**: for the four
never-deleted tables no mechanism exists in any shape, and both mechanisms that do exist
(`deleteTeam`, knowledge soft-archive) are live production paths that stay. **Zero features are
removed; zero production files change; no migration is generated.** The codebase is already in the
state the ruling's second sentence describes — the capability is absent, which is the safety. The
scope amendment Ruling D makes to plan.md (production world newly in-bounds for removing a dead
deletion feature) is noted and exercises to zero; the 221 production governance violations remain
AU29/AU30/AU31's, untouched. Entanglement to report back: **none** — no removal was planned, so no
removal is entangled.

**Effect on counts.** Governance: production 221 → 221 (this package changes no production-world
file; the D6′ rule edits live in `scripts/`/`governance/`, development world); development 67 → 0
by the already-planned fixes — no removal moves either number. AC-6 projection unchanged and now
fully ruling-backed: unit 6203 − 1 + 2 = **6204**; service integration 2835 − 9 (8 `foreign-keys` +
1 `agent-run-config-store`) = **2826**.

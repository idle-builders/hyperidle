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

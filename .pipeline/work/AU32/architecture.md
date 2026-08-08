# AU32 — architecture: tests arrange worlds production can actually produce

Authority: `.pipeline/work/AU32/plan.md`. Binding rulings: `.pipeline/work/AU28/founder-rulings.md`
Rulings 13/13a (the surviving companion rule), 14 (one runtime door), 8 (two worlds). Rule mechanics:
`governance/README.md`, `scripts/lib/governance-model.ts:351-399` (development relaxation),
`scripts/lib/crossing-detectors.ts:366-451` (`buildCompanionGroups`), `:484+` (`buildWriteSets`).

Founder gate input: `.pipeline/work/AU32/schema-test-decision.md` (options + recommendation per
schema-test file, **plus one drafted keep-partial ruling** — see §1 masking criterion). Nothing in
Task 2 below lands before that gate.

---

## 1. Live grounding — measured, not copied

`npx tsx scripts/governance-lint.ts` on this worktree (base `origin/main` bbe82e9a), 2026-08-07:

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

plan.md's prose ("69 entries across 46 files", "seed-then-migrate is a violator", "34 knowledge / 27
teams") is stale. Live decomposition of the 61 table-write sites across 39 files, from the per-site
lint output (full list in `feasibility.md`):

| pair / shape | sites | files |
|---|--:|--:|
| `knowledgeItems` written without `knowledgeAppProjection` (insert/update/delete) | 34 | 19 |
| `teams` written without `teamMembers` (insert) | 26 | 19 |
| `knowledgeAppProjection` updated without the file writing `knowledgeItems` (orphan side) | 1 | 1 |

(One file, `foreign-keys`, contributes to knowledge with both inserts and deletes; files overlap
none across pairs except via shared totals: 39 distinct files.)

The 6 one-door sites: `layers/core-ui/__scripts__/ah{1,5,6}-test-server.ts` (`schema` namespace
import), `tools/eval/src/runner.ts:14` (same), `applications/desktop/__tests__/migrate.test.ts:63`
(`seed`, a `db:unknown` symbol), `tools/eval/src/judges.ts:502` (dynamic `@anthropic-ai/sdk`).

`seed-then-migrate.integration.test.ts` is **already clean** — it writes `teams`+`teamMembers`
together (`framework/db/src/__tests__/seed-then-migrate.integration.test.ts:38-43`). No action.

None of these deltas changes an AC (the ACs say "zero", not "69"); no plan amendment needed.

### How the rule actually decides (the builder must know this)

- A **site** is any `insert/update/delete(<table>)` in a development file where the table is in a
  companion group and the **file's whole write set** (including writes made through imported
  development helpers — `buildWriteSets`) does not contain the companion
  (`crossing-detectors.ts:781-783`, `governance-model.ts:372-389`, clause `write-the-whole-row-set`).
- Consequence: one companion write anywhere in a file silences every site in that file. **That is a
  laundering hazard, and this plan forbids exploiting it** — see contract C6.
- Groups are derived: an exported function in the owning package that unconditionally inserts ≥2
  owned tables, both of which the owner also revises (`buildCompanionGroups`). Live groups today:
  `{teams ↔ teamMembers}` (from `createTeam`, `layers/core-api/org/src/team-lookup.ts:230-259`) and
  `{knowledgeItems ↔ knowledgeAppProjection}` (from `create`,
  `layers/core-api/knowledge/src/knowledge-repository.ts:254-301`).

### Where completion must NOT happen — the masking criterion, swept

Per-entity completion (C6) has exactly one honest exception, and it is derived from the schema's
delete behaviour, never from a file path or directory:

> **Masking criterion.** An arranged entity is **excluded from companion completion** when the test
> asserts that deleting that entity rejects (an asserted failure of `db.delete(<parent>)` — via
> `.rejects.*`, an asserted error status on a delete route, or any equivalent) AND the companion
> table references the parent through a **non-cascade** FK (`restrict`/`no action`). Adding the
> companion there over-determines the assertion: the test stays green even if the constraint under
> probe were dropped, because the companion's own FK now also rejects the delete. Byte-identical
> `expect` lines, strictly weaker test — the exact violation plan.md's first contract forbids.

On the live schema the criterion is narrow: of the two companion FKs, only
`teamMembers.teamId → teams.id` is non-cascade (`onDelete: "restrict"`,
`framework/db/src/schema.ts:127-129`); `knowledgeAppProjection.knowledgeItemId` is
`onDelete: "cascade"` (`schema.ts:1008-1011`) and can never cause a rejection. So only a **teams**
entity whose delete-rejection is asserted with a *different* FK under probe can collide.

**The sweep (feasibility P11) covered every file this package touches** — all 39 table-write files
(the four schema-question files among them), the three ah scripts, `runner.ts`, `judges.ts`, and
`migrate.test.ts` — reading every delete of a grouped table, every `.rejects.` assertion, and
checking for raw-SQL deletes, HTTP `DELETE` calls, and service-level delete calls (zero of each).
Result: deletes of grouped tables exist in exactly one file, `foreign-keys.integration.test.ts`
(five operations), and **exactly one arranged entity meets the criterion**: the `teams` row `p1` at
`foreign-keys.integration.test.ts:104`, in "rejects deleting a team while a bet references it" —
the asserted rejection (:114, no matcher) probes `bets.teamId → teams.id`; a membership row's own
RESTRICT FK would over-determine it. Every other rejection assertion in the swept set is an
insert-FK, unique-constraint, service-state, auth, or migration rejection that no companion row can
cause (per-assertion classification in P11). The same file's test 1 (:76-84) needs nothing: it
seeds the full pair and the membership FK **is** its probe.

That entity is invisible to the lint (the file's write set is file-grained and already contains
`teamMembers` via the shared seeder at :41-43), so it is not one of the 61 sites — it is reached
only by C6's per-entity obligation. It **stays partial**, under the founder ruling drafted in
`schema-test-decision.md` (plan.md: a kept partial-state fixture in these files is a founder
decision, never an agent's). This is not a rule exception and not a baseline entry — the lint never
flagged it.

### `seedBase` — the plan's convergence claim, verified

`seedBase` lives at `layers/core-api/src/__tests__/_helpers.ts:58-83` (not `framework/db`; a
near-copy exists at `layers/agent-orchestration/tool-handlers/src/__tests__/_helpers.ts`, irrelevant
here — no tool-handlers file violates).

- It **does** establish the `teams` pair — fixed rows `p1`/`t1` — plus one user and one thread.
- It establishes **nothing** for the knowledge pair. No helper anywhere seeds
  `knowledgeItems`+`knowledgeAppProjection` together.
- It is **reachable only inside the `@hyperidle/core-api` package** (`src/**/__tests__` — 24 of the
  39 violating files). The 15 files in `core-api/work`, `core-api/routine`,
  `agent-orchestration/{agent-run-config,filesystems,filesystem-mounting}`,
  `layers/agent-orchestration/src`, and `framework/db` are separate packages: the helper is not
  exported (and must not be — knip:production would delete a production export only tests consume;
  a cross-package relative import is banned by `.claude/rules/typescript.md`).
- Its world is **fixed-id** (`p1`, `t1`). Violating files insert teams/items under their own ids that
  their assertions reference; rehoming them onto `p1` would rewrite assertions, which contract C1
  forbids chasing.

**So "converge on seedBase" is honoured as intent (shared seeding, no 60 copy-pasted blocks), with
corrected mechanics** (Decision D2). One violating file, `promote-knowledge.integration.test.ts`,
already calls `seedBase` and is still flagged — for the knowledge pair, which `seedBase` cannot cover.
That is the direct disproof of the literal claim.

---

## 2. Decisions (locked)

**D1 — Schema-test files change per the founder-approved verdicts; no rule change, no baseline
exception; one keep-partial ruling.**
Recommendation is (a) for **every lint-flagged site** in all four files (`schema-test-decision.md`):
for the knowledge pair the masking fear is empty because
`knowledgeAppProjection.knowledgeItemId` is `onDelete: "cascade"`
(`framework/db/src/schema.ts:1008-1011`) — a cascade FK cannot cause the rejection those tests
assert — and no flagged teams site sits under a delete-rejection assertion (sweep, §1). **Plus one
founder ruling**: the un-flagged `teams` entity at `foreign-keys.integration.test.ts:104` stays
partial under the masking criterion (§1); ruling text drafted in `schema-test-decision.md` for the
gate. If the founder instead keeps any *flagged* file partial, that file gets a named ruling in
`founder-rulings.md` and its baseline entry stays; the rest of this plan is unchanged.

**D2 — Mechanical fixes complete the pair at the site; shared helpers only where a package already
has a shared dev-helper home.**
- `layers/core-api` package (24 files, 37 sites): extend `layers/core-api/src/__tests__/_helpers.ts` with two
  parametrized seeders that write the full pair, mirroring the owners' writers —
  `seedTeam(db, {...})` → `teams` + `teamMembers` (defaults mirroring `createTeam`: capacity 5,
  activeBets 0, formedAt = createdAt) and `seedKnowledgeItem(db, {...})` → `knowledgeItems` + a
  minimal `knowledgeAppProjection` row (`{ id, knowledgeItemId }`, projection fields passthrough,
  others null — the owner's own `create` writes null for absent fields). Sites in this package call
  the helper with their existing ids/values. **The helper is the default.** A site may instead keep
  its insert and add the companion insert alongside **only where a helper call would disturb
  surrounding arrange code, and then the site carries a one-line comment naming the specific
  disturbance** (e.g. an assertion reads a column value the arrange interleaves with other inserts).
  Review checks each core-api site mechanically: helper call, or comment — a site with neither is a
  review finding. This keeps the escape from degenerating into a third all-inline convention.
  `seedBase` itself is untouched; a file already on `seedBase` whose extra `teams` insert is
  genuinely the base world may drop it in favour of `seedBase`'s rows only if no assertion
  references its ids.
- All other packages (15 files, 1–4 sites each — 4 of them the framework/db schema-question files owned by T2): add the companion insert inline next to the
  existing insert. No new cross-package helper, no new package, no production export — the
  no-test-only-production-export constraint structurally forbids a shared "test fixtures" production
  surface, and 1–4 sites per package does not justify one.
- New rows use ids derived from the entity they accompany (e.g. `<teamId>-members`), never colliding
  with ids the test already uses; `users.teamId` references `teamMembers.id`, so added membership
  rows must not shadow ids tests pass as `teamId` on users.
- **No companion for an entity meeting the masking criterion (§1)** — the one live case is owned by
  T2; if the builder hits a new one, it is a finding to report for a ruling, never a silent skip
  and never a silent completion.

**D3 — The orphan-companion site is fixed by removing the raw write, not by adding one.**
`layers/core-api/src/__tests__/app-runtime-domain-observability.integration.test.ts:61-70` creates
the item through `POST /api/knowledge` (the owner writes both rows), then raw-updates the projection
to set `layer`/`kind` plus three score fields **its assertions never read** (assertions at :76-88
read only `knowledgeItemId`, `layer`, `kind`). Fix: pass `layer`/`kind` in the POST body — the
owner's `create` accepts and writes them (`knowledge-repository.ts:280-289`) — and delete the raw
update and the unasserted score fields. Builder verifies the route schema accepts `layer`/`kind`; if
it does not, fall back to the owner's exported `update(db, id, changes, expectedVersion)`
(`knowledge-repository.ts:398`) for exactly the asserted fields. Either way the file makes zero
direct writes to the pair and the arranged state is produced by the owner itself.

**D4 — The four `drizzle(client, { schema })` hand-rolls route through the database package's own
factory; no new db export.**
`ah1/ah5/ah6-test-server.ts` and `eval/src/runner.ts:68-79` import the `schema` namespace for exactly
one act: assembling their own client (`drizzle(client, { schema })` + drizzle's `migrate`). The
`db:schema-ns` surface is reach-nobody (`governance/architecture.json` `surfaces`), and the lint's
own message names the remedy: the database's client factory. Composition of two **existing**
`db:client` exports does the whole job with zero casts:
`applyMigrations(dataDir, migrationsFolder)` (`framework/db/src/migrate.ts`) against a per-boot
tmp dir, then `createPgliteDb(dataDir)` (`framework/db/src/connection.ts:71`) on the same dir. The
named-table imports these files also make (`serverCredentials`, `teams`, `teamMembers`, `users` —
ah6 already writes the teams pair, ah5/ah6 seeding stays as is) are legal development table writes
and stay. Alternative **for the three ah scripts only**, where on-disk PGlite is measurably
unacceptable: `createTestDb()` from `@hyperidle/db/testing` (a development subpath; these are
development files) — builder's choice per ah file. **`runner.ts` is excluded from that
alternative:** its own `@lore X7` (`tools/eval/src/runner.ts:64-68`) records `createTestDb` as
vitest-coupled (worker pool, IPC disconnect handler) while the eval runs as a standalone tsx
script — the tmp-dir composition is the only shape for it. Either way, **no new export on
`framework/db` and no surviving `schema` namespace import**. Verified: zero production code uses
drizzle's relational `db.query.*` API, so dropping the schema-bound client changes no runtime
behavior; the `HyperIdleDb` type is schema-bound statically either way. Note `applyMigrations`
opens and closes its own client at `dataDir` (`migrate.ts:52-80`), which is why the tmp-dir shape
works and a pure in-memory instance cannot be migrated through it.

**D5 — `seed` in `migrate.test.ts` is a ghost; the test is repointed at the live seeding symbols,
and no db-surface decision is needed or made.**
`applications/desktop/__tests__/migrate.test.ts:34,63` mocks and imports `seed` from `@hyperidle/db`
— a symbol the barrel does not export (`framework/db/src/index.ts`; `seed.ts` was deleted under
Ruling 9 step 1). The "does NOT call seed()" test asserts a mock of a nonexistent export was never
called — vacuously green forever. Closing the `db:unknown` entry means fixing the test, not deciding
an export: replace `seed` with the two seeding symbols that exist, `seedDemoWorld` and
`applyFactoryBootstrap` (both on `db:bootstrap`, reach "composition roots" — desktop is an
application, so even the production verdict allows it), mock both to throw, assert `runMigrations`
calls neither. That preserves the test's actual claim — the desktop migration path writes no seed
data — against live symbols, at equal or greater strength. The lint NOTE's other three `db:unknown`
symbols (`readSystemPromptTemplate*`) are production sites owned by AU29; out of scope here.

**D6 — `judges.ts` goes through the one runtime door: `callLlm`.**
`tools/eval/src/judges.ts:501-512` dynamically imports `@anthropic-ai/sdk` and hand-builds a client
from `ctx.resolvedModel`. Replace with `callLlm({ model: ctx.resolvedModel, messages: [{ role:
"user", content: prompt }], maxTokens: 256 })` from `@hyperidle/harness-registry`
(`layers/agent-execution/harness-registry/src/llm-client.ts:670`; `CallLlmOptions.model` is the same
`ResolvedModel` type judges already hold). Same prompt, same model, same token cap, same
catch-returns-score-0 error path; text extracted from the response blocks instead of
`response.content[0]`. This is exactly Ruling 14's point — the call becomes recordable, priced,
replayable, and provider-agnostic instead of Anthropic-locked. eval already depends on and imports
`@hyperidle/harness-registry` (`tools/eval/package.json:17`, `src/provision-harness.ts:20`), so no
new manifest row; a tooling development file importing a service is `development-may-arrange-the-
world` — allowed, and the `raw runtime [capability]` site disappears.

**D7 — Baseline mechanics: regenerate, never edit.** After each batch of fixes the builder runs
`npm run governance:baseline` (the only legal writer; it deletes cleared sites and refuses
additions) and commits code + shrink together — lint fails in both directions otherwise. Clearing a
group's last site deletes the group and that rule is at error from the same commit; there is no
promotion step.

**D8 — AC-5 (delete the baseline file + `--adopt`) is dormant for this work package — determined
from the live tree.** `governance/baseline.json` holds 31 production groups / 221 sites this work
package may not touch (AU29/AU30/AU31 are all still `planned` per `.pipeline/AU.md`). Clearing every
development group cannot empty the file. The AC stays as a ship-time check, not a work item: after
the final regeneration, if `jq '.groups | length' governance/baseline.json` is `0` (only possible if
the other three ship first and this branch rebases onto them), this work package owns deleting the
file and the `--adopt` path in that same commit; otherwise record the count as the evidence that the
criterion is vacuously satisfied ("whichever gets there last owns it" — this one is not last today).

**D9 — Two unit cases are added** to `framework/db/src/__tests__/governance-crossings.test.ts`
(the existing "companion rows" describe block at :900):
1. **Derivation negative:** an owner whose `createTeam` inserts **only** `teams` yields no group for
   either table (`buildCompanionGroups` returns no entry — the `written.size < 2` path). The block
   already proves group formation, the switch negative control, the append-only drop, the seeder
   exclusion and helper crediting; the "owner stops writing both → pair stops being reported"
   direction of validation scenario 3 is the one case not yet pinned.
2. **Baseline severity flip:** run the exported `crossingRules`
   (`scripts/rules/crossings.ts:51`; severity assignment at :59-87 — per (group, file) allowance
   from `baseline.groups[key]?.sites[file]`) over one synthetic development companion-group
   violation, twice: with the (group, file) allowance present in a synthetic baseline the finding is
   `warn`; with the group absent it is `error`. This pins AC-4's warn→error flip as standing
   evidence in the unit lane — the file already deep-imports scripts modules
   (`governance-crossings.test.ts:11-32`), so `crossingRules` is one more import of the same shape.
Test names stay domain-named (no work-package ids — the no-WP-numbers rule).

---

## 3. Contracts (carried from plan.md, made operational)

- **C1 — assertions never weaken.** Diffs to test files may add arrange rows, remove vestigial
  arrange rows proven unreferenced, or reroute an arrange write through the owning service. They may
  not touch an `expect`, delete a test, or change what a test reads — with one audited exception: the
  dead-symbol repoint in D5, where the asserted symbol no longer exists and the replacement asserts
  strictly more. Any test that fails after a companion is added is a **finding to report** (it relied
  on an unreachable state), not a diff to force green. Weakening includes **over-determination**: an
  added arrange row that becomes a second sufficient cause of an asserted rejection weakens the test
  with zero `expect`-line changes — the masking criterion (§1) is C1's silent case, and C6 carries
  its check.
- **C2 — no rule exceptions.** No edit to `governance-model.ts`, `crossing-detectors.ts` clauses,
  `decided-rules.json`, or `architecture.json` verdict data. A genuine exception is a founder ruling
  naming file and reason in `founder-rulings.md` — the recommendation needs **zero rule or baseline
  exceptions**. The one ruling it does need (the masking-criterion entity, §1) touches neither rule
  nor baseline: the lint never flagged that entity, so nothing is excepted from enforcement — the
  ruling records a plan-level keep-partial decision, as plan.md's gate clause requires.
- **C3 — no production export that only tests consume.** Every new helper lives in a development
  file (`_helpers.ts`) or inline in the test. `framework/db`'s barrel and subpaths are unchanged.
- **C4 — companion groups stay derived.** No hand-maintained pair list anywhere, including in the
  new helpers' docs — helpers name the owners' writers as the thing they mirror.
- **C5 — baseline shrink-only, entries deleted never re-tagged.** Only `npm run governance:baseline`
  writes it (D7).
- **C6 — honest completion, bounded by the masking criterion.** Because the detector credits a
  file, not an entity (§1), the builder completes the pair **for every arranged entity**, not once
  per file. A file inserting five items seeds five projections. **One exception, derived from the
  schema, never from a path:** an entity meeting the masking criterion (§1) must NOT receive its
  companion — the one live case is `foreign-keys.integration.test.ts:104`, kept partial under the
  founder ruling drafted in `schema-test-decision.md`; any new one the builder encounters is a
  finding to report for a ruling. Review checks both directions per-entity — completion everywhere
  else, exclusion here — since the lint can see neither.
- **C7 — no work-package ids in enforced artifacts.** New helper names, test names, comments in
  governance code: domain vocabulary only. Existing WP-id filenames are left alone; none added.
- **Out of scope.** The 221 production violations (AU29/30/31); consolidating the ~135 hand-rolled
  base worlds beyond files this package already touches; the three `readSystemPromptTemplate*`
  `db:unknown` production sites; the `misplaced-files.json` ledger (not part of the 67).

---

## 4. AC → obligation → evidence

| AC (plan.md) | Obligation | Evidence — exact command and expected observation |
|---|---|---|
| 1. No fixture writes one row of a pair (except named ruling) | Tasks 2–4 clear all 61 table-write sites; one named ruling covers the masking-criterion entity (not a lint site) | `npx tsx scripts/governance-lint.ts` prints no `crossing-table-write … development` line; summary reads `… 0 development known violation(s) at warn` (production count stays whatever the rebase base carries, 221 today); `founder-rulings.md` contains the approved keep-partial ruling for the foreign-key file |
| 2. No development file past a single-door surface | Tasks 5–6 clear the 6 sites | Same run: no `db:schema-ns`, `db:unknown`, or `raw runtime` development line; the `db:unknown` NOTE no longer lists `seed` |
| 3. Every changed test still proves what it proved, assertions intact | C1; per-entity completion C6 including its masking exclusion | Diff review: zero `expect` lines changed/removed (except D5's repoint, itself strengthening); **plus the masking re-check the expect-line diff is structurally blind to**: for every delete-rejection assertion in touched files (full swept list: feasibility P11 — live, `foreign-keys.integration.test.ts` only), confirm no added row is a non-cascade child of the deleted parent, and confirm the :104 entity received no companion; plus AC-6's count comparison |
| 4. Baseline holds zero development entries; rules fail the build on reappearance | D7; all 7 development groups deleted by the generator; D9 case 2 pins the flip | `jq '[.groups | keys[] | select(endswith("development"))] | length' governance/baseline.json` → `0`. Reappearance: (i) standing break-tests — `npx tsx scripts/governance-lint.ts --attacks` PASS includes `missing-companion` (expects the finding) and its control twin `attack-companion-supplied` (expects clean), `scripts/lib/governance-attacks.ts:506-533`; runs on every `npm run lint` — this proves **detection**; (ii) the warn→error **severity flip** is pinned standing by D9 case 2 (`crossingRules` at error when the (group, file) allowance is absent, `scripts/rules/crossings.ts:59-87`), running in `test:full` on every run — the attack lane alone cannot prove it because its `sort:"violation"` judge reads raw `violationsOf` output, severity-agnostic (`governance-attacks.ts:841-846`, feasibility P13); (iii) optional corroboration post-clear: append `await db.insert(teams).values({id:"zz",name:"z",phase:"build",createdAt:NOW});` to any development test file → lint exits non-zero naming the file/line and `writing teams without teamMembers` → revert. No new attack case is required because no rule is added (a registered rule without an attack already fails the build) |
| 5. If the baseline empties, delete file + `--adopt` same commit | D8 — dormant, ship-time check | `jq '.groups | length' governance/baseline.json` after final regen: expected `> 0` (31 production groups today) → criterion vacuous, recorded; if `0`, the deletion commit happens here |
| 6. `test:all` green; integration pass count unchanged or higher | C1; before/after capture | **Before** (measured at plan time, clean tree at base bbe82e9a, committed under `probes/`): unit `test:full` **6203 passed / 0 failed**; integration service project **2835 passed / 0 failed** (exit 0); harness project has 7 pre-existing env-dependent failing files at base (all live-LLM/real-binary; recorded in `feasibility.md` P10 — not this package's baseline to drain). **After** (builder, work complete): `npm run test:full > probes/test-after-unit.txt` and `npm run test:integration:service > probes/test-after-integration-service.txt`; expected: service-lane passes ≥ 2835 with zero failures, unit passes = 6203 ± D5's test-for-test repoint + 2 for D9's two cases; zero newly failing tests anywhere. "Green" for the AC is read against the deterministic lanes; the harness lane must simply show no NEW failure in any touched path (judges/runner changes live in `tools/eval`, outside that lane) |
| Validation scenario 3 (derived groups) | D9 case 1 | `npx vitest run framework/db/src/__tests__/governance-crossings.test.ts` (the file is a `.test.ts` unit file — it runs in the default/unit config, NOT the integration config, whose include is `*.integration.test.*` only; command verified at base: 68 passed, 2.2s) — new case green: owner writing one table ⇒ no group; existing cases prove formation/append-only/switch directions |

**Real-path executions this change must not break (live-proof lanes):**
- ah servers (D4): boot each modified script (`npx tsx layers/core-ui/__scripts__/ah1-test-server.ts`
  etc.) and observe the `ready on http://localhost:<port>` line plus one authenticated HTTP round
  trip — or run their Playwright configs where present. A test server that no longer boots is
  exactly the broken wire this catches.
- eval db (D4): execute `createEvalDb()` once (any eval unit that touches it, or a two-line tsx
  invocation) — migrated handle returned, `close()` clean.
- judge door (D6): execute the changed judge path once with a live resolved model (smallest
  configured model) and observe a numeric score with reasoning — the path makes a real LLM call and
  must be run before DONE, per the live-proof rule. Cassette/interceptor replay is acceptable if the
  eval smoke lane already records this call; a stub is not.
- desktop migrate (D5): `npx vitest run applications/desktop/__tests__/migrate.test.ts` green.

---

## 5. Tasks — one builder leaf, ordered

**One leaf, sequential.** The two work trees (fixtures vs one-door) are independent by file but both
funnel through `governance/baseline.json` regeneration and one final verification; splitting them
buys no schedule (M-size total) and creates a merge seam on the baseline for two builders to trip
over. Critical path: **Task 0 → founder gate → Tasks 1–7**. All writes owned by the single builder.

- **T0 — evidence baseline (done at plan time, keep committed).**
  `probes/test-baseline-full.txt` (test:all at base), `probes/lint-full.txt` equivalent (development
  site list). Builder re-captures only if the branch rebases.
- **T1 — derivation + severity-flip tests (D9).** Two cases in `governance-crossings.test.ts`;
  green immediately (they pin existing behavior). May land first; independent of the gate.
- **T2 — schema-test files per the founder-approved verdicts (D1).** `foreign-keys`: + projection
  row for `ki-1` in each of the two knowledge RESTRICT tests, with the one-line cascade comment;
  the bare team in "rejects deleting a team while a bet references it" (:104) **stays partial** —
  masking criterion (§1), under the approved ruling — and gets a domain-worded comment at the
  insert stating why no membership row may be added (test 1 at :76-84 needs nothing: full pair
  seeded, membership FK is its probe). `schema` (+ minimal projection rows), `migration`
  (+ `teamMembers` row), `session-requests` (delete the vestigial `teams` insert; prove the file
  green). **Blocked on the concept gate.**
- **T3 — core-api package fixtures (D2).** Add `seedTeam`/`seedKnowledgeItem` to
  `layers/core-api/src/__tests__/_helpers.ts`; clear the 24 files in this package (37 sites),
  including D3's owner-path fix for `app-runtime-domain-observability`. Per-entity completion (C6);
  helper-or-comment rule (D2) per site.
- **T4 — other-package fixtures (D2 inline).** 11 remaining files: `core-api/work` ×3,
  `core-api/routine` ×3, `agent-orchestration/agent-run-config` ×1, `filesystems` ×2,
  `filesystem-mounting` ×1, `layers/agent-orchestration/src` ×1 (session-stream-hub). The four
  framework/db files are T2's. Inline companion inserts.
- **T5 — one-door: client factories (D4).** `ah1/ah5/ah6-test-server.ts`, `eval/src/runner.ts`.
  Boot-prove each (evidence table).
- **T6 — one-door: `migrate.test.ts` repoint (D5) and `judges.ts` through `callLlm` (D6).**
  Execute the judge path live once.
- **T7 — baseline regeneration + gates (D7, D8).** `npm run governance:baseline`; verify AC-4/AC-5
  evidence; `npm run check && npm run lint && npm run test:all`; after-capture and comparison
  (AC-6). Intermediate regenerations during T2–T6 are fine and encouraged (lint fails on
  uncommitted shrink); T7 is the final sweep.

Dependency notes: T2–T6 are mutually independent once the gate passes; the builder may interleave,
but each commit that fixes sites carries its baseline shrink (D7). T3 before T4 only because the
helpers land in T3.

---

## 6. Failure behavior, security, docs

**Changed failure behavior.** None in production — no production file changes at all (every touched
file is development-world; verified per site in §1). The one behavioral edge: added companion rows
participate in FK graphs (`teamMembers.teamId` RESTRICT, projection cascade), so a test that deletes
its team must not be surprised by a membership row — C1 turns any such surprise into a finding, and
the sweep (P11) found no test that successfully deletes a `teams` row, so no such surprise is
expected. `judges.ts` error handling is shape-preserved (catch → score 0 with message), and
`callLlm` retries transient failures where the raw SDK did not — strictly more robust for a bench;
timeout default 120s vs SDK default is the only latency-profile change, bounded per call.

**Security.** No state-changing endpoint, no untrusted input, no new credential path. The judge's
API key moves from a hand-built vendor client into `callLlm`, the audited one-door path (also the
recorded/replayable one). ah-server changes keep their existing test-only keys and ports. Nothing
here touches the production credential or provisioning surfaces.

**Documentation made false.** None found: `governance/README.md` states mechanics, not counts;
`CLAUDE.md` states the world rule; no doc enumerates the development baseline. `plan.md`'s stale
counts are superseded by this file's measured census (no amendment needed — ACs are
count-independent).

**Lore.** Three `@lore` captures for the builder: the cascade-not-mask note in `foreign-keys`'s two
knowledge RESTRICT tests (D1), the masking-exclusion note at the partial team in "rejects deleting
a team while a bet references it" (T2 — why that entity must never receive a membership row), and a
note on `_helpers.ts`'s new seeders naming the owners' writers they mirror (C4).

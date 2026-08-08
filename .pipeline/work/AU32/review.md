# AU32 — implementation review

**Reviewed:** `git diff origin/main...HEAD` at `84a5ae5f` (branch `pipeline/AU32`, base `origin/main`), 12 commits.
**Authority:** `founder-rulings.md` A–E, `plan.md` as amended, `architecture.md` D1–D13 / C1–C7, `.claude/rules/testing.md`, `.claude/rules/typescript.md`, `governance/README.md`, `CLAUDE.md`.
**Method:** every changed file read; per-entity companion completion computed twice with independent TypeScript AST passes (id-matched and per-test-scope count-balance); every added/removed `expect` and every deleted test checked against P16/P18 by re-sweeping production myself; the bite proof re-executed with a fresh probe; `check`, `lint`, `knip`, `knip:production`, `deps:check`, `mock-inventory:check`, `test:full`, `test:integration:service` all run.

**Verdict: NOT DONE.** Three blocking findings.

---

## BLOCKING

### B1 — Contract C6 violated: eight arranged `teams` entities have no companion (`framework/db/src/__tests__/schema.integration.test.ts`)

**Evidence.** Bare `teams` inserts, each the sole team in its own test (the DB is truncated per test, so no other test's row covers them):

| line | test |
|---|---|
| 73 | `inserts and reads teams (formerly products)` |
| 136 | `inserts and reads bets` |
| 159 | `inserts and reads tasks` |
| 190 | `updates tasks correctly` |
| 221 | `inserts and reads sessions` |
| 268 | `inserts and reads routines` |
| 582 | `rejects task with invalid bet_id` |
| 600 | `rejects session with invalid agent_id` |

Only the entity at `:114` has its `teamMembers` companion (`:115`, pre-existing). The file's own diff completed all three `knowledgeItems` entities (`:447-451`, `:474-478`, `:503-507`) and left every `teams` entity untouched — the eight are invisible to the lint solely because `buildWriteSets` credits the whole file for the one `teamMembers` write at `:115` (`scripts/lib/crossing-detectors.ts:779-783`).

**Governing authority.** Ruling C: "**Every arranged entity in every touched file receives its companion.**" Architecture C6: "Because the detector credits a file, not an entity (§1b), the builder completes the pair **for every arranged entity** — a file inserting five items seeds five projections"; §1b: "One companion write anywhere in a file silences every site in that file. **That is a laundering hazard and this plan forbids exploiting it.**" `schema-test-decision.md` records this file as "4 sites (438, 461, 474, 486): (a), companion added" — the four lint-visible `knowledgeItems` sites — and never accounts for the eight `teams` entities at all.

**Impact.** Eight tests still assert on a member-less team, the exact state Ruling C says a test may not build, in the file the plan singled out for human judgement. AC-1 fails at the per-entity level the plan explicitly holds the reviewer to.

**No over-determination stands in the way.** Six of the eight select `teams`/`bets`/`tasks`/`sessions`/`routines` and assert `toMatchObject`; `:582`/`:600` assert insert rejections on deliberately nonexistent `bet_id`/`agent_id`. A `teamMembers` row is invisible to all eight, and the file probes no delete, so C6's "restore sole cause or delete" procedure is not engaged — the companions simply need adding.

### B2 — `npm run knip` regressed to exit 1

**Evidence.**
```
Unused devDependencies (2)
@electric-sql/pglite  layers/core-ui/package.json:28:4
drizzle-orm           layers/core-ui/package.json:42:4
```
Commit `23eb1658` (T5) removed the only importers of both — `layers/core-ui/__scripts__/ah{1,5,6}-test-server.ts` previously held `import { PGlite } from "@electric-sql/pglite"` and `import { drizzle } from "drizzle-orm/pglite"` (confirmed against `origin/main`); the manifest was not updated. `layers/core-ui` now has zero references to either package.

**Impact.** `npm run verify` = `check && lint && knip && knip:production && deps:check && …`. It stops at `knip`. Main is protected on verify-green, so this cannot merge.

**Aggravating.** `progress.json` `buildState.done` asserts "knip and knip:production unaffected (byte-identical to pre-change baseline)". No knip probe exists in `probes/`; the claim was not measured. `knip:production` is in fact clean (exit 0) — `knip` is not.

### B3 — `npm run deps:check` regressed to exit 1 (same root cause, one further site)

**Evidence.**
```
Declared but never referenced (3):
  layers/core-ui  drop  @electric-sql/pglite
  layers/core-ui  drop  drizzle-orm
  tools/eval      drop  @electric-sql/pglite
```
`tools/eval/src/runner.ts:13` was the only `@electric-sql/pglite` importer in `tools/eval`; `fe02a97d`'s rewrite of `createEvalDb()` removed it. `scripts/dep-manifest-lint.ts` exits 1.

**Impact.** Also chained in `verify` (and `verify:quick`). Independent of B2 — fixing the two `core-ui` entries leaves this one red.

---

## NON-BLOCKING DEFECTS

### D1 — `probes/ah1-boot.log` is empty; no live-proof evidence recorded for the ah1 lane
The architecture's live-proof list requires "boot each modified script and observe the ready line plus one authenticated HTTP round trip". `probes/ah1-boot.log` is 0 bytes. `ah5-boot.log` and `ah6-boot.log` carry a ready line but no HTTP round trip either. I executed the lane myself: `npx tsx layers/core-ui/__scripts__/ah1-test-server.ts` prints `[ah1-test-server] ready on http://localhost:3099` and `GET /api/teams` returns `401 {"error":"Missing or invalid API key"}` — the server, the migrated handle and the auth middleware are all live. The lane passes; only the evidence was missing, so this does not fail an AC.

### D2 — the rerouted PGlite data dirs are never removed
`tools/eval/src/runner.ts:72-76`, `layers/core-ui/__scripts__/ah1-test-server.ts:49-50`, `ah5`/`ah6` equivalents each `mkdtemp(join(tmpdir(), …))` per boot and only `close()` the handle. The previous in-memory `new PGlite()` left nothing on disk. Development tooling accumulates one PGlite directory per eval scenario / per server boot.

### D3 — the "absent key ⇒ error" default is pinned only by a deleted manual probe
`scripts/governance-lint.ts:225` (`severity.severity[ruleKey] ?? "error"`) is the single line that makes an absent key bite. `framework/db/src/__tests__/governance-crossings.test.ts:1010,1019` re-spell that `?? "error"` inline in the test rather than importing the live `severityOf`, so flipping the production default to `?? "warn"` would leave the suite green. The live evidence is the bite probe, which I reproduced (see below) but which is by design not committed as a check. AC-4′ explicitly accepts a manual probe here, so this is not blocking — recording it because the automated pin reads stronger than it is.

---

## FOLLOW-UP / NOTES

- **`misplaced-files.json` still fails the build on a stale count.** `governance/misplaced-files.json:4` (`resolvedFiles: 4`) plus both branches in `scripts/rules/misplacement-ledger.ts:82-98` can error because a live count disagrees with a committed number — the same shape Ruling E removed from the baseline. Correctly parked as an open founder decision (architecture D13, `misplacement-ledger-decision.md`, `progress.json` `remaining: "T13 — NOT AUTHORIZED"`), so no agent acted on it. Needs a founder ruling, not a code change here.
- **`ah6-test-server.ts:264-281` fixes a pre-existing runtime break outside the plan's edit set.** The assistant seed wrote `harnessType`/`modelId`/`modelProvider`/`systemPrompt`/`maxConcurrentSessions` onto `users`, columns that moved to `agentRunConfig`; `probes/ah6-orig-boot.log` shows the resulting `DrizzleQueryError: syntax error at end of input` (an empty `SET` clause). The fix is bounded to one seed, documented with `@lore`, and necessary for the boot live-proof to pass — but it is a behaviour change the plan did not enumerate.
- **Work-package ids in prose comments in governance code:** `scripts/rules/no-per-file-allowances.ts:1` ("AU32 —"), `scripts/rules/crossings.ts:26` (`@lore AU32:`), `framework/db/src/__tests__/governance-model.test.ts:178` ("AU32 Ruling A"). C7 restricts names, ids and keys rather than prose, and these mirror roughly twenty pre-existing `AU28 —` headers in the same directory, so this is consistency rather than a new breach. Raised only because a standing project rule bans WP numbers in code.
- **`scripts/lib/crossing-keys.ts:55` `sourceLabel` is exported with no external reader.** Carried over unchanged from `crossing-report.ts`, which had the same property on `origin/main` — pre-existing, not introduced here, and `knip` does not gate `scripts/**` entry-file exports.

---

## What holds — verified independently, not taken from the probes

**Ruling E — the bookkeeping is gone and cannot return.**
- `governance/baseline.json`, `scripts/governance-baseline.ts` and `scripts/lib/crossing-report.ts` are deleted; `package.json` no longer defines `governance:baseline`.
- `git grep -na` over `refuseGrowth compareBaseline loadBaseline baselineRatchet baseline-ratchet baseline.json crossing-report governance-baseline governance:baseline --adopt shrink-only` returns exactly one hit — `framework/db/src/__tests__/governance-lint.test.ts:641`, the permitted second-record exception.
- `scripts/rules/crossings.ts` no longer contains a NUL byte (`origin/main`'s copy held one), so plain `rg` now sees it too.
- `readyToFlip` (`scripts/governance-context.ts:176-181`) returns `readonly string[]`, is consumed only by `console.error` at `scripts/governance-lint.ts:284-291`, and cannot carry a severity. No rule errors because a `warn` key is clean. The live run prints no `ready to flip` NOTE, because all 31 declared keys still have live violations.

**The severity split is real.** `governance/rule-severity.json` holds 31 keys, all `"warn"`, all ending ` production` — byte-for-byte the same 31 group keys `origin/main`'s baseline recorded, and the 221 production sites are unchanged. All 7 former development group keys are absent, so they are at `error`. `npm run lint` exits 0 with `governance-lint: PASS — … 221 production + 0 development known violation(s) at warn`.

**The bite reproduces.** I wrote a fresh single-table probe (`layers/core-api/src/__tests__/reviewer-bite-check.probe.ts`, write set `{teams}`), ran `npx tsx scripts/governance-lint.ts --errors-only` → exit **1**, `ERROR [crossing-table-write] layers/core-api/src/__tests__/reviewer-bite-check.probe.ts:3: layer → db:table (other) [table:write] development`, then deleted it; `git status --porcelain` clean. The builder's own probe (`au32-bite.probe.ts`) is gone from the tree.

**Ruling A stayed on its side of the line.** `tools/eval/src/judges.ts` is untouched (zero-line diff). `decideProduction`'s `hold-one-runtime-door` branch is intact (`scripts/lib/governance-model.ts:257-261`) and the clause is still registered (`:417`). Exactly two `decided-rules.json` rows changed, both `development: forbidden → allowed`, and they are exactly the two Ruling A names — `service → raw runtime [capability]` and `tooling → raw runtime [capability]`; no row added, removed or re-keyed (124 rows before and after). The census pin at `governance-model.test.ts:178-179` (116 allowed / 8 forbidden) is the true live split, recomputed from `decided-rules.json`: production 56 forbidden / 68 allowed, development 116 / 8.

**Every deletion is justified, and I checked the claim rather than the report.** Independent sweep of the whole repository: zero `.delete(users|threads|knowledgeItems|items)` and zero raw `DELETE FROM` for those tables in any production file — the only hits are three development files (`hint-progress.integration.test.ts:99`, `P2-org-edges.integration.test.ts:248`, `O2-schema-migration.integration.test.ts:923`), all recorded as out of the touched set. All ten `onDelete: "cascade"` FKs live on `teamRunConfigDefaults`, `agentRunConfig`, `orgEdges`, `knowledgeAppProjection`, `taskPlanningSignals`, `filesystemInjections`, `filesystemCaptures`, `hintProgress`, `loginSessions`, `serviceConnections` — none can remove a `users`/`threads`/`knowledgeItems`/`items` row. P16/P18 hold; the seven Ruling-D deletions are sound. `migrate.test.ts`'s `seed` test was genuinely dead (`seed` is absent from `framework/db/src/index.ts` and `seed.ts` no longer exists — the `vi.mock` factory created the symbol it then asserted on). `knowledge-access.integration.test.ts:172`'s `expect(() => new Date(…)).not.toThrow()` was genuinely unfailable.

**The one rework reads honestly.** `foreign-keys.integration.test.ts:72` is byte-identical to the assertion it replaces. The arrange completes the pair (`:65-67`), then removes the membership row in the owner's own order (`:70`, mirroring `team-lookup.ts:305` before `:306`); no `users` row is inserted, so that delete cannot itself be blocked, and with the membership gone `bets.teamId` is the only remaining referent — sole cause restored, not weakened. The non-transactionality argument in the comment checks out: `deleteTeam` is two sequential awaits with no `db.transaction`.

**No assertion weakened anywhere else.** Every `+`/`-` line matching `expect|toBe|toEqual|toThrow|toHaveLength|toMatchObject` or a `test(`/`it(`/`describe(` declaration was read. The set is exactly: the two Ruling-B deletions, the seven Ruling-D deletions, the 12-case ratchet block (dead with its subject), the three new governance cases, the census pin, and the rewritten one-runtime-door case. Every other fixture diff adds arrange rows only — 40 files, zero `expect` lines touched. The `session-requests.integration.test.ts:59` vestigial-row removal is proven unreferenced (the `teams` import is gone and `check` passes).

**Sibling edits are bounded.** `AU29/AU30/AU31/plan.md` and `.pipeline/AU.md` changed only statements the rulings made false; no scope, out-of-scope, file set, count or dependency edge moved. `AU30/plan.md:28`'s "no rule promotes until the last one lands" was kept and re-grounded in the group key carrying no table name, and its citations to `AU30/plan.md:7` and `.pipeline/AU.md:29` are accurate (both discuss the six unowned tables). No contradiction was introduced.

**Scope discipline.** Zero production-world files changed: every changed source path is `__tests__`/`__scripts__`, or under `scripts/`, `governance/`, `tools/`, `docs/`, `.pipeline/`. `framework/db/src/schema.ts` and `framework/db/drizzle/` are untouched — no migration, no FK dropped, no `onDelete` changed, exactly as Ruling D requires.

**Gate results measured by me.**

| gate | result |
|---|---|
| `npm run check` | PASS — 34/34 packages |
| `npm run lint` | exit 0 — biome + eslint + fixtures/attacks/default governance passes (49 attacks, 63 fixtures) |
| `npm run knip` | **exit 1** — B2 |
| `npm run knip:production` | exit 0 |
| `npm run deps:check` | **exit 1** — B3 |
| `npm run mock-inventory:check` | exit 0 |
| `npm run test:full` | 562 files, **6193 passed / 0 failed** — matches the projection exactly |
| `npm run test:integration:service` | 320 files, **2826 passed / 4 skipped / 0 failed** — matches the projection exactly |
| harness lane (builder's log) | 7 files failed, all env-dependent, none touched by this change (`AM2-builtin-gateway`, `AM2-real-harness-discovery`, `AL7-two-session-trust-first`, `AU9-assistant-handoff-realbinary`, `assistant-reply-live-harness`, `real-harness-return-enforcement-realbinary`, `AN2-connection-provisioning`) |
| `npx tsx scripts/governance-lint.ts` | PASS — 221 production + 0 development at warn |

---

## AC table

| AC (as amended) | Verdict | Evidence / gap |
|---|---|---|
| **1.** No test fixture writes one row of a pair the owning service always writes together — carve-out clause withdrawn, no exception | **FAIL** | Lint-level evidence passes (0 development violations, no `crossing-table-write … development` line) but the per-entity review C6 mandates fails: eight `teams` entities in `schema.integration.test.ts` (`:73,136,159,190,221,268,582,600`) still have no `teamMembers` companion, silenced by file-level detector credit. **B1** |
| **2.** No development file reaches past a single-door surface — AI-runtime door excluded by Ruling A, database door still covered | **PASS** | No `db:schema-ns` / `db:unknown` development line; `db:unknown` NOTE lists only the three `readSystemPromptTemplate*` production symbols; ah1/ah5/ah6 + `tools/eval/src/runner.ts` route through `applyMigrations` + `createPgliteDb`; `judges.ts` untouched; production raw-runtime door intact and its attacks pass |
| **3.** No assertion weakened; a test may be deleted only where it depended on an unreachable arrangement or probed an operation production cannot perform | **PASS** | All nine deletions verified against an independent production sweep, not against the report; the one rework's assertion is byte-identical with sole cause restored; the remaining 40 fixture diffs touch zero `expect` lines. (B1 is a completeness failure under AC-1, not a weakening under AC-3.) |
| **4′.** No development-world rule is at `warn`, and a development-world violation fails the build naming file and line | **PASS** | 31 keys, all `"warn"`, all ` production`; 7 development keys absent ⇒ error; bite reproduced independently (exit 1, file:line, group ending ` development`); `--attacks` PASS including `missing-companion` and its control |
| **5′.** The bookkeeping mechanism is gone, unconditionally, and cannot come back by accident | **PASS** | 6 files in `governance/`, no `baseline.json`; generator and `crossing-report.ts` deleted; `governance:baseline` script gone; residue search returns exactly the one permitted hit; `no-per-file-allowances` registered in both `buildRules()` and `runLive()`, break-tested by an overlay pair plus a standalone shape case, and hard-fails on a zero-match argv scan |
| **6.** `test:all` green and the integration pass count unchanged or higher, netting exactly the named deletions | **PASS** | 6193/0 unit and 2826/0 service integration, both matching the projected numbers exactly; harness failures all pre-existing and untouched |
| Validation scenario 3 (companion groups derived from the owners' code) | **PASS** | `governance-crossings.test.ts:917-945` — an owner writing one table yields no group at all; live derivation confirmed to produce exactly `{teams ↔ teamMembers}` and `{knowledgeItems ↔ knowledgeAppProjection}` |
| Project gate: `npm run verify` green | **FAIL** | `knip` (**B2**) and `deps:check` (**B3**) both exit 1 on dependency declarations this change orphaned |

---

# AU32 — implementation review, ROUND 2 (focused re-review of the three blocking findings)

**Reviewed:** `git diff 84a5ae5f..HEAD` (HEAD `8d0599f7`, branch `pipeline/AU32`, base `origin/main`) — one commit, 20 files.
**Scope:** B1, B2, B3 and the two non-blocking fixes (D1, D2) only. Round 1's confirmations are not re-derived.
**Method:** all eight companion sites read in place; the builder's checker executed and then attacked with an independent, strictly stronger AST audit (per-function balance, whole-file totals, count-based rather than presence-based, plus every non-touched local module the touched files import); both dependency removals traced to zero importers in both worlds; lockfile consistency dry-run; `ah1` boot + graceful and non-graceful termination reproduced live; the eval cleanup probe re-executed; all seven gates run in the foreground.

**Verdict: DONE.** No blocking findings. Three residual non-blocking items, all record- or hygiene-level.

## The three blocking findings are closed

**B1 — all eight `teams` entities now carry a companion.** `framework/db/src/__tests__/schema.integration.test.ts` — every one read in place:

| entity (`insert(teams)`) | companion (`insert(teamMembers)`) | test |
|---|---|---|
| `:73` | `:79-85` | inserts and reads teams (formerly products) |
| `:143` | `:144-150` | inserts and reads bets |
| `:173` | `:174-180` | inserts and reads tasks |
| `:211` | `:212-218` | updates tasks correctly |
| `:249` | `:250-256` | inserts and reads sessions |
| `:303` | `:304-310` | inserts and reads routines |
| `:624` | `:625-631` | rejects task with invalid bet_id |
| `:649` | `:650-656` | rejects session with invalid agent_id |

The pre-existing pair (`:121` teams / `:122` teamMembers, the round-1 `:114`/`:115`) is **not** duplicated — that test still holds exactly one companion insert, and its id stays `team-1` because it is the subject of its own assertion.

The rows mirror the owner faithfully: `id: "<teamId>-members"`, `capacity: 5`, `activeBets: 0`, `formedAt: now`, identical to `_helpers.ts:126-132`'s `seedTeam`, which itself documents (`:108-109`) matching `createTeam` (`team-lookup.ts:230-259`).

**No test now passes for a different reason.** Zero `expect`/`test(`/`describe(` lines in the file changed (the diff is eight pure arrange blocks). The file contains **no** `.delete(` and **no** raw `DELETE FROM` (scanned), and no assertion in it counts rows — every `select` is `.where(eq(<table>.id, …))` on `teams`/`bets`/`tasks`/`sessions`/`routines`/`teamMembers`, so a membership row is invisible to all eight. The two `rejects.toThrow()` tests reject on a deliberately absent `bet_id`/`agent_id`; the added companion inserts succeed before the act (its `teamId` FK resolves to the team just written) and add no second cause. `teamMembers.id` is unique inside each test and the fixture truncates per test. C6's post-change delete-rejection re-scan over the touched set returns exactly the two `teams` deletes in `foreign-keys.integration.test.ts:44,72` — the expected answer set, both in the file round 1 verified — so no added row is a non-cascade child of a deleted parent at act time.

**B2/B3 — both gates green, both removals genuinely orphaned.**
- `layers/core-ui`: zero `@electric-sql/pglite` imports and zero `drizzle-orm` references of any kind anywhere in the package, production or development — the only surviving hits are prose in comments/config docstrings. Both `devDependencies` entries correctly dropped.
- `tools/eval`: zero `@electric-sql/pglite` imports (prose only); `drizzle-orm` is imported by 26 files (`judges.ts:28`, `runner.ts:182`, 24 scenarios) — **keeping it is right**, and dropping it would have broken the package.
- Lockfile: the diff is exactly the three declaration lines, with no version, resolution or package-entry change — correct, since both packages remain in the tree for other workspaces. `npm install --dry-run` reports "up to date", so manifests, lockfile and installed tree agree, and `npm install` dragged in nothing unrelated. Working tree clean (`git status --porcelain` empty).

## Gates, all run in the foreground by me

| gate | result |
|---|---|
| `npm run check` | PASS — 34/34 packages, 0 errors |
| `npm run lint` | exit 0 — `governance-lint: PASS — 3326 tracked files (789 production, 2537 development), 33 packages, 8125 crossings, 18 rules, **221 production + 0 development** known violation(s) at warn` |
| `npm run knip` | **exit 0** (was 1 — B2 closed) |
| `npm run knip:production` | exit 0 |
| `npm run deps:check` | **exit 0** — `33 packages, imports and manifests agree (1 justified exception)` (was 1 — B3 closed) |
| `npm run test:full` | 562 files, **6193 passed / 0 failed** |
| `npm run test:integration:service` | 320 passed + 1 skipped files, **2826 passed / 4 skipped / 0 failed** |

Scope: no production-world source file changed. Every source path in the branch is `__tests__`/`__scripts__`, or under `scripts/`, `governance/`, `tools/`, `docs/`, `.pipeline/`. `framework/db/src/schema.ts` and `framework/db/drizzle/` untouched — no migration, no FK, no `onDelete`. The one production-path file in this commit is `layers/core-ui/package.json`, and the edit removes two **unused devDependencies** (never shipped, required for the two gates to pass) — not a production code change.

## The mechanical check, attacked

I executed it: `npx tsx .pipeline/work/AU32/probes/per-entity-companion-check.mts` → **48 files, 361 test scopes, PASS, exit 0**. The committed output says 46 files; the same commit added the two `package.json` manifests to the diff after the probe ran. Immaterial (a manifest has no test scope) and the load-bearing number, 361 scopes / 0 findings, reproduces exactly.

**What the checker is blind to** (reported, not asked to be closed — it is evidence, not a guard):

1. **Anything arranged outside a `test()`/`it()` body.** `visitTop` only matches a `CallExpression` whose callee is the bare identifier `test`/`it`. The touched set contains **31 owner inserts in exactly that position** — 30 inside named file-local seed helpers (e.g. `work-completeness.integration.test.ts:14 seedWork()`, `routine-scheduler-relocation.integration.test.ts:186 seedManualRoutine()`, `retention-reaper.integration.test.ts:67 seedTaskDispatchAttempt()`, `_helpers.ts:68,118,171`) and one at **module top level** (`layers/core-ui/__scripts__/ah6-test-server.ts:115`). None is examined.
2. **A call into a helper that is not literally `seedTeam`/`seedKnowledgeItem`/`seedBase`.** A scope calling a file-local `seedTask()` that inserts a bare team records *neither* owner nor companion, so it passes silently — a false green, not a false alarm.
3. **Presence, not count.** `written` is a `Set`. A scope with three `insert(teams)` and one `insert(teamMembers)` passes. The same hole covers the seeder credit exactly as you suspected: one `seedBase()` plus three further bare `insert(teams)` in the same scope passes.
4. **Modifier and table-generator forms.** `test.each(...)`, `test.skip`, `it.only`, `test.for` are `PropertyAccessExpression` callees and invisible; `insert(<non-identifier>)` (`insert(schema.teams)`, a variable table) is skipped by the `isIdentifier` guard.

**None of those blind spots hides an actual violation.** My independent audit over the same touched set, strictly stronger on every axis above, finds **zero**:
- per-**function** balance (every named function/arrow, not just test bodies), **count**-based: 30 owner-writing functions, **0 unbalanced**;
- **whole-file** owner-vs-companion totals: **0 unbalanced files** (this is what covers the module-level `ah6-test-server.ts:115` site and any `beforeEach`);
- per-scope **count** balance with helper credits counted per call rather than as a set: **0 imbalances** — the `seedBase`-plus-extra-teams hole is not exercised anywhere;
- `insert(<non-identifier>)` occurrences in the touched set: **0**; `test.each`/`.skip`/`.only`/`.for` occurrences: **0**;
- the 34 non-touched local modules the touched files import contain **zero** `insert(teams)`/`insert(knowledgeItems)` — no laundering through an untouched helper.

Its sanity-break also holds independently: the committed FAIL run names the same eight sites at the same pre-fix lines the round-1 review derived by hand, so the checker is not vacuously green.

## NON-BLOCKING DEFECTS

### R2-D1 — `progress.json` overclaims the checker's coverage
`progress.json` (B1 entry): "*Result: 46 files, 361 test scopes, PASS — zero unbalanced entities anywhere in the diff.*" The checker cannot establish "anywhere in the diff": 31 owner inserts in the diff sit outside every scope it walks (see blind spot 1). The **conclusion happens to be true** — I proved it by the three independent passes above — but the cited evidence does not reach it. The probe's own header and PASS line are correctly hedged ("inside one `test(...)`/`it(...)` scope", "in every checked scope"); only the progress record generalises past them. Fix is one clause in the record, not code. Also stale-by-two: the recorded "46 file(s)" predates the manifest fix in its own commit (live: 48).

### R2-D2 — the tmp-dir cleanup covers the graceful path only (residual of D1/D2)
In all three servers the `rm` sits inside `shutdown()`, which is reachable only from `process.once("SIGTERM")` / `("SIGINT")` (`ah1-test-server.ts:89-93` + `:98-99`, and the identical shape in `ah5`/`ah6`). There is no `try/finally` around boot and no `exit`/`uncaughtException`/`unhandledRejection` hook, so a throw between `mkdtemp` (`ah1:50`) and signal registration (`ah1:98`) leaks the directory, as does any non-catchable termination. Reproduced live: `SIGTERM` → directory gone; `SIGKILL` → `…/T/ah1-e2e-db-CXalWK` left behind (unavoidable for `SIGKILL`; the boot-throw window is not). `tools/eval` is the better shape — `runner.ts:311-314`'s `finally { await close() }` covers the scenario-failure path, leaving only a throw inside `createEvalDb` itself (between `mkdtemp` at `:72` and the return) uncovered. Development tooling, no AC governs it; D2 was non-blocking and remains so at a smaller size.

### R2-D3 — the ah\* headers still describe an in-memory database
`ah1-test-server.ts:4-8` ("in-memory PGlite database", "Flow: create in-memory PGlite → …") and `:13`, plus the `ah5`/`ah6` headers and `playwright.ah1/ah5/ah6.config.ts`, contradict the same files' new `@lore` at `ah1:86-88` ("*replaced the in-memory `new PGlite()` … with a per-boot `mkdtemp` directory*"). Drift introduced by this change's own reroute; a reader of the header now learns something false about where the data lives.

## Record accuracy — spot-checks

The corrected `progress.json` entry now matches reality: it names the false claim, says plainly it was never measured, and records `knip` exit 0 / `knip:production` exit 0 / `deps:check` exit 0 — all three of which I reproduced independently. Every probe backing a claim in this commit is non-empty and carries a measured artefact; there are no zero-byte files left in `probes/`:
- `probes/knip-after-fix.txt`, `knip-production-after-fix.txt`, `deps-check-after-fix.txt` — real command output ending in `EXIT=0 (measured)`; my own runs match line for line.
- `probes/ah1-boot.log` — 916 bytes, real: ready line, scheduler start with a live timestamp, a genuine `401 {"error":"Missing or invalid API key","code":"UNAUTHORIZED"}` with server headers, the tmp dir named while up and absent after `SIGTERM`. I reproduced the ready line and the `SIGTERM` cleanup myself.
- `probes/eval-db-cleanup-check.mts` — re-executed: `before: []` → `during: ['eval-db-onQhGG']` → `after: []`, no leftovers. It imports and calls the real `createEvalDb`, so it is a genuine behavioural check.
- `probes/per-entity-companion-check-output.txt` — both the PASS run and the revert-and-rerun FAIL run reproduce (modulo the 46/48 staleness noted above).
- `createPgliteDb` (`framework/db/src/connection.ts`, production) is untouched by the branch — confirmed against the full changed-file list.

## AC table — deltas from round 1 only

| AC | Round 1 | Round 2 |
|---|---|---|
| **1.** No fixture writes one row of a pair; no exception | **FAIL** (B1) | **PASS** — all eight entities completed; per-entity completeness independently re-derived three ways over the whole touched set, plus its imported helpers; 0 development violations at lint level |
| Project gate: `npm run verify` green | **FAIL** (B2/B3) | **PASS** — `check`, `lint`, `knip`, `knip:production`, `deps:check` all exit 0 |
| **3.** / **6.** | PASS | Unchanged and re-confirmed: zero `expect` lines touched by this commit; 6193/0 and 2826/0, identical to round 1 — the eight added rows move no count |
| **2.** / **4′.** / **5′.** | PASS | Not re-derived (out of this round's scope); nothing in this commit touches their evidence |

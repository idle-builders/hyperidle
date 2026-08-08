# AU32 — architecture critique

Artifact: `.pipeline/work/AU32/architecture.md` (+ `feasibility.md`, `schema-test-decision.md`, `probes/`).
Authority: `.pipeline/work/AU32/plan.md`; Rulings 13/13a/14 (`.pipeline/work/AU28/founder-rulings.md`).
Every empirical claim below was re-checked against the live tree at `pipeline/AU32` (base bbe82e9a),
not taken from the artifacts.

## Verdict

**REVISE — one blocking finding.** The architecture is unusually well-grounded: the census, the
cascade fact, the `seedBase` correction, the ghost-symbol claim, the vestigial-row claim, the
AC-5 dormancy and the test baselines all check out exactly as written. But the masking argument —
the single argument standing between "zero founder rulings" and "founder rulings needed" — is
argued only for the knowledge pair, while the architecture's own contract C6 drives a builder into
a **teams-pair masking** inside the very file the argument covers. That contradiction must be
resolved (and put in front of the founder, per the plan's own gate clause) before Task 2 lands.

---

## BLOCKING

### B1 — C6 per-entity completion collides with `foreign-keys` test 3 and produces the exact masking D1 declares impossible

**Evidence.**
- `framework/db/src/__tests__/foreign-keys.integration.test.ts:102-115` — test
  "rejects deleting a team while a bet references it" inserts `teams` `p1` (line 104) with **no**
  `teamMembers` row and asserts `db.delete(teams)…rejects.toThrow()` (line 114) with no error
  matcher. The rejection under probe is the `bets.teamId → teams.id` RESTRICT FK.
- `framework/db/src/schema.ts:127-129` — `teamMembers.teamId → teams.id` is
  `onDelete: "restrict"`.
- `architecture.md` C6: "the builder completes the pair **for every arranged entity**, not once per
  file … Review checks this per-entity, since the lint cannot." Stated globally, no carve-out.
- `architecture.md` T2 / `schema-test-decision.md` §foreign-keys: enumerate only the two knowledge
  RESTRICT tests ("+ projection row for `ki-1`"); the teams entity at line 104 is not mentioned
  anywhere in either document.
- `schema-test-decision.md` line 12-17: "the masking fear is empty on the live schema" — argued
  solely from `knowledgeAppProjection.knowledgeItemId` being cascade (`schema.ts:1008-1011`, which
  I verified). The claim is stated universally; it is true for the four lint sites but **false for
  the teams pair in the same file**.

**Why it blocks.**
The line-104 `teams` insert is not a lint site (the file's write set contains `teamMembers` via the
shared seeder at lines 41-43, and the detector is file-grained — `crossing-detectors.ts:781-783`,
verified). So the two instructions diverge and the architecture is silent on which wins:

1. Builder follows **C6 literally** → adds a `teamMembers` row for `p1` in test 3 → the
   `rejects.toThrow()` at line 114 becomes over-determined: it now passes even if the `bets`
   RESTRICT FK — the constraint under probe — were dropped, because the added membership row's own
   RESTRICT FK rejects the delete. Assertions byte-identical, suite green, test proves strictly
   less. That is the precise violation of plan.md's contract ("a test's assertions must not weaken
   … if adding a companion row changes what a test proves, that is a finding to report, not a diff
   to land"), AC-3, and validation scenario 4 ("no test that asserted a behaviour now asserts
   less") — and it is the failure mode the diff-review evidence for AC-3 ("zero `expect` lines
   changed") is structurally blind to.
2. Builder follows **T2's enumerated diffs** → test 3's team keeps its partial state. A team with
   no membership row is a state production cannot produce (`createTeam`,
   `team-lookup.ts:230-267`, always writes both). plan.md's human-gate clause is explicit: "if any
   of those six files keeps a partial-state fixture, that is a founder decision recorded in
   `founder-rulings.md`, never an agent's judgement call." The architecture instead asserts "the
   recommendation needs zero" rulings (C2) — which resolution 2 contradicts.

Either path breaks an approved contract as currently written. The fix is small but must be made
before the founder gate, because `schema-test-decision.md` is the artifact the founder approves and
it currently contains an overbroad claim: **scope C6** (per-entity completion never applies to an
entity whose RESTRICT-delete rejection is itself the assertion under probe — masking), **name the
line-104 entity in `schema-test-decision.md`** with the RESTRICT counter-fact so the founder decides
it with eyes open, and **correct "the masking fear is empty"** to "empty for the knowledge pair;
real for the teams pair, which is why test 3's team stays minimal". Same treatment check for
test 1 (lines 76-84) is already satisfied — it seeds the full pair and probes the membership FK
itself.

---

## NON-BLOCKING DEFECTS

### N1 — Scenario-3 evidence command targets the wrong lane and would run zero tests
`architecture.md` §4 last row: `npx vitest run --config vitest.integration.config.ts --project
service framework/db/src/__tests__/governance-crossings.test.ts`. That file is a `.test.ts` unit
file; the service project's include is `**/*.integration.test.{ts,tsx}` only
(`vitest.integration.config.ts:63`), so the command as written matches nothing. The same table's
AC-6 row correctly counts D9 in the **unit** lane ("+1 for D9"). Fix the command to a plain
`npx vitest run framework/db/src/__tests__/governance-crossings.test.ts` (or the `test:full` slice).

### N2 — The warn→error flip after baseline deletion is pinned only by a one-off manual probe
AC-4 evidence: the standing `missing-companion` attack (`governance-attacks.ts:506-533`, verified
present and wired into `npm run lint` via package.json:39) proves *detection*, but it passed at
base while the group sat in the baseline at warn — it cannot prove the severity flip. The flip is
covered by a "recorded manual check" (append an insert, observe non-zero exit, revert). That is
ephemeral evidence for the one property AC-4 actually adds. A synthetic `--fixtures` case pinning
"companion group absent from baseline ⇒ non-zero exit" would be standing. Not required by any
authority — noting, not blocking.

### N3 — D4's `createTestDb()` alternative is unavailable to `runner.ts` and the text doesn't say so
`tools/eval/src/runner.ts:64-68` carries an explicit `@lore X7`: createTestDb is vitest-coupled
(worker pool, IPC disconnect handler) and the eval runs as a standalone tsx script. D4 offers
"`createTestDb()` from `@hyperidle/db/testing` … builder's choice per file" without excluding the
runner. Harmless if the builder reads the lore, but the alternative should be scoped to the ah
scripts explicitly.

### N4 — Helper adoption is left to builder discretion and can degenerate
D2 allows a site to "keep their insert and add the companion insert alongside where a helper call
would disturb surrounding arrange code." Legitimate, but with no criterion this can quietly become
all-inline, leaving `seedTeam`/`seedKnowledgeItem` near-unused — a third convention rather than the
duplication win the plan asked for. Code review should check adoption isn't token in the 24
core-api files.

---

## VERIFIED — claims checked and confirmed

- **Census (task item 5).** Re-ran `npx tsx scripts/governance-lint.ts`: exactly
  `67 violation(s) across 45 file(s), 7 rule group(s)` development, 221 production, group-by-group
  identical to §1's table. Recounted the per-site probe (`probes/lint-development-sites.txt`)
  against the live output: 61 table-write sites = 34 knowledge + 26 teams + 1 orphan projection
  update; 39 distinct files = 24 in `@hyperidle/core-api` (37 sites) + 15 elsewhere; T4's 11-file
  list + T2's 4 framework/db files = the 15 exactly. The 6 one-door sites match file:line.
- **Cascade fact (task item 1).** `schema.ts:1008-1011`: `onDelete: "cascade"` on
  `knowledgeAppProjection.knowledgeItemId` — confirmed. For the **four lint sites** in
  `foreign-keys` (210/233/248/270) and the four in `schema.integration.test.ts` (438/461/474/486 —
  all read only `knowledgeItems`/`knowledgeEditLog`, none reads the projection) and
  `migration.integration.test.ts:63` (reads back only `teams`), adding the companion is inert to
  every assertion and cannot produce the asserted rejection. The masking argument **holds for every
  lint-flagged assertion**; the failure is the un-flagged entity B1 names.
- **`seed-then-migrate` already clean (task item 2).** Lines 38-43 write `teams`+`teamMembers`
  together; the file is absent from the live lint output. Its `import * as schema` is same-package,
  not a crossing. Confirmed.
- **`session-requests` teams row vestigial (task item 2).** Line 59 inserts `teams` "team-1";
  nothing in the file references it — the user row carries no `teamId` (nullable,
  `schema.ts:69`), the request and session rows have no team column. Deletion is safe and C1
  explicitly permits removing proven-unreferenced arrange rows; the builder re-run is named.
- **`seed` is a ghost (task item 2).** `framework/db/src/index.ts` exports `seedDemoWorld` (:19),
  `applyFactoryBootstrap` (:20), `applyMigrations`/`isDowngrade` (:22) — no `seed`.
  `migrate.test.ts:34,63` mocks and asserts on the nonexistent symbol; the "does NOT call seed()"
  test is vacuously green today. D5's repoint (mock both live seeding symbols to throw, assert
  neither called) asserts strictly more; the C1 exception is honestly audited.
- **`seedBase` correction (task item 3).** `layers/core-api/src/__tests__/_helpers.ts:58-83`:
  teams pair + one user + one thread, fixed ids `p1`/`t1`, unexported, package-local — nothing for
  the knowledge pair; `promote-knowledge` (a `seedBase` caller) is indeed still flagged for the
  knowledge pair. The two new helpers stay in the same development file (no production export —
  C3 holds; knip:production untouched), other packages get inline inserts (no cross-package
  relative import — typescript.md holds). Defaults mirror `createTeam`
  (`team-lookup.ts:233-234,265`: capacity 5, activeBets 0, formedAt ?? createdAt) and the owner's
  `create` (`knowledge-repository.ts:280-289`: nulls for absent projection fields). This is less
  duplication than 37 hand-rolled companion blocks, subject to N4.
- **Derivation proof (task item 4).** `buildCompanionGroups` is the live derivation point, wired
  into the real lint (`scripts/lib/crossings.ts:249`); the `written.size < 2 → continue` path
  exists (`crossing-detectors.ts`, unconditional-inserts loop). The existing describe block
  (`governance-crossings.test.ts:900-1075`) covers formation, the switch negative, append-only
  drop, seeder exclusion, helper crediting — the "owner stops writing both ⇒ no group" direction
  is genuinely unpinned. D9's case exercises the real function against a synthetic owner; a
  hardcoded pair list inside the detector would fail it. It pins the direction at the unit that
  the lint consumes. Adequate.
- **AC-5 vacuous (task item 6).** `governance/baseline.json` live: 38 groups, 7 development, 31
  production; lint reports 221 production sites. Clearing all 7 development groups cannot empty
  the file; AU29/30/31 are `planned` in `.pipeline/AU.md`. The ship-time `jq` check with the
  recorded count, plus the "if 0, delete here" obligation, discharges the AC as written
  ("whichever gets there last owns it").
- **D3.** `app-runtime-domain-observability.integration.test.ts:44-88`: item created via
  `POST /api/knowledge` (owner writes both rows); the raw projection update sets three score
  fields no assertion reads (assertions at :76-88 read `knowledgeItemId`/`layer`/`kind` only);
  `create` accepts `layer`/`kind` (`knowledge-repository.ts:283-285`); the route-schema
  verification and the repository-`update` fallback are both named. Sound.
- **D4.** All four files use `schema` for exactly `drizzle(client, { schema })` + migrate
  (verified at ah1:28/52, ah5:38/63, ah6:46/92, runner:14/68-79). `applyMigrations(dataDir,
  folder)` opens/closes its own client (`migrate.ts:63-79`) — the tmp-dir composition is the only
  shape that works, correctly noted. `createPgliteDb` (`connection.ts:71-81`) binds schema
  internally, so the resulting handle is behaviorally identical; **zero** `db.query.*` usage
  repo-wide including development (re-grepped). `db:client` is not a one-door surface
  (`governance/architecture.json:130`), so the composition is legal for these development files.
  Boot-proof obligations named.
- **D6.** `callLlm` (`llm-client.ts:670`) takes `{ model: ResolvedModel, messages, maxTokens }`
  (`CallLlmOptions`, :33-49) — same `ResolvedModel` judges hold; eval already depends on
  harness-registry. Error path shape preserved; retry/timeout delta honestly disclosed. The live
  judge execution is a named pre-DONE obligation, matching the live-proof rule.
- **Test baselines (AC-6).** `probes/test-baseline-full.txt`: 562 files / 6203 passed;
  `probes/test-baseline-integration-service.txt`: 320+1 skipped files / 2835 passed, 0 failed;
  the 7 failing files in the combined run are all in the release-gated harness project. Matches
  feasibility P10 exactly. The like-for-like comparison rule is the right reading of "green".
- **Contracts survival.** All six plan contracts survive into C1-C7 operationally, including
  shrink-only/never-re-tagged (D7, generator-only writes), no hand-maintained pair list (C4), no
  rule edits (C2 — and D1's recommendation indeed requires none *for the lint sites*), and
  no-WP-ids (C7; helper/test names domain-named). One-leaf sequential build is justified: both
  work trees funnel through baseline regeneration, and an M-size package does not repay a
  two-builder merge seam on `governance/baseline.json`.
- **Proportionality.** Nothing over-built: two development-file helpers, one derivation test case,
  zero new exports, zero new packages, and D3/D5 fix by deletion/repoint rather than mechanism.
  Scope runs neither over nor under the plan.

## What must change before build

1. Resolve B1: scope C6, name the `foreign-keys:104` entity in `schema-test-decision.md` with the
   `teamMembers` RESTRICT counter-fact, correct the universal "masking fear is empty" sentence,
   and route the keep-partial decision through the founder gate as plan.md requires.
2. Fix the N1 evidence command; consider N2's standing fixture; scope N3's alternative.

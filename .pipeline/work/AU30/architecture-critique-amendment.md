# AU30 — Architecture critique, amendment pass (Ruling 4: deleting `user_skills`)

**Scope.** Only the deletion plan and its consequences: `architecture.md` §11 plus everything the
deletion touches (§7.1, §7.2, §7.4, §9, §10), and `feasibility.md`. The settled parts —
`sessions` → `run-orchestration`, the two registry corrections, the two new test files, the §8.3.3
mutation reds — were verified in the prior pass and are not re-litigated. Where the amendment changed
something previously verified (arithmetic, commit order) it is re-checked below.

**Verdict: BLOCKING.** Four blocking findings. The ruling itself is sound and the deletion is the right
call; three of the four blockers are gaps in the *evidence* and the *file list*, and one is a false
"zero callers" claim that would strand a builder mid-commit. None of them touches the decision to
delete.

Every finding below is verified live in this worktree unless marked `INFERRED`.

---

## BLOCKING

### B1 — The migration's red demonstration cannot go red, and the drop's real failure mode is caught by nothing

`architecture.md:1250-1256` (§11.7 mechanism 3) instructs the builder:

> **Remove `"user_skills"` from both lists first, before writing the migration, and run them: they fail,
> because the table is still there.** … a missing or misnamed migration leaves the table present and the
> list assertion fails.

Both sentences are false. All three table-list assertions are **inclusion** assertions, not exact-list
assertions:

- `framework/db/src/__tests__/migration.integration.test.ts:31-32` — `expect(tableNames).toEqual(expect.arrayContaining([… "user_skills" …]))`
- `framework/db/src/__tests__/pg-migration.integration.test.ts:35-37` — same shape
- `framework/db/src/__tests__/schema.integration.test.ts:38-40` — same shape

`arrayContaining` passes when the received array contains the listed elements; extra elements are
tolerated. So removing `"user_skills"` from the expected array is a **no-op in both directions**: the
test passes with the table present and passes with it absent. The floor assertion at
`migration.integration.test.ts:56` (`expect(tableNames.length).toBeGreaterThanOrEqual(15)`) is likewise
a floor, not a count.

**The concrete risk this leaves open.** §11.3 correctly tells the builder to hand-author both the SQL
file *and* a `meta/_journal.json` entry, because the migrator resolves files by journal `tag`
(`framework/db/src/__testing__/test-pool.ts:55`, `migrate(db, { migrationsFolder })` over
`framework/db/drizzle`). If the journal entry is omitted, mis-indexed, or its `tag` does not match the
filename, the migrator silently skips the file. Then:

- every integration test still passes (inclusion assertions tolerate the surviving table);
- `npm run check` passes — the source no longer references the symbol;
- governance-lint passes — `liveTables` is derived by parsing `pgTable(` calls out of `schema.ts`
  (`scripts/lib/db-surfaces.ts:88`), i.e. from **source**, never from a database, so `totals.tables`,
  `phantom` and `missing` all agree at 44.

The table survives in every real and test database and **nothing in `verify` reports it**. That is
precisely the silent-orphan failure Ruling 4 exists to correct, reproduced one level down.

**The repo already has the assertion that goes red**, from the last whole-table drop (`0049` dropped
`factory_settings`) — and it is in all three files:

- `migration.integration.test.ts:55`, `pg-migration.integration.test.ts:63`,
  `schema.integration.test.ts:63` — `expect(tableNames).not.toContain("factory_settings")`

§11.7 must name that line for `"user_skills"` as the red demonstration (it fails with the table present,
passes after the drop, and fails again if the journal entry is lost), and §11.9's fixture-edit rows for
`migration.integration.test.ts` / `pg-migration.integration.test.ts` must carry it. As written, §11.7
tells the builder a false thing about what proves the only schema change in the work package.

*Authority:* `plan.md` AC #7 ("`npm run verify` is green, and the behaviour … is proven"); the
architecture skill's requirement that named end-to-end evidence actually be able to fail.

### B2 — §11.9's "exact list" omits three test files the cascade breaks; §11.2 asserts nothing outside its list changes

`architecture.md:993` — *"Every file the deletion touches. Nothing outside this list changes."*
`architecture.md:1311` — *"Tests — the exact list."* Three files are missing, all verified live:

**(a) `layers/core-api/routine/src/__tests__/routine-run-resolver.integration.test.ts`** — the dedicated
test file for `resolveRoutineRunRequest`, the very function whose delegation branch §11.2 deletes
(`routine-service.ts:366-378`). It is not named anywhere in §11.2, §11.9 or §10.

- **Six test cases have the deleted branch as their subject** and will fail: `:260` ("delegates to a
  fallback agent when the owner is at capacity, delegation is allowed, and a skillId is set"), `:285`,
  `:308`, `:331`, `:356`, `:400` ("rejects when the delegated fallback agent is not a runnable AI
  agent"). Per §11.9's own stated rule — *a test whose subject is deleted is deleted, never repointed* —
  those six go.
- **All fifteen tests** in the file are wired through `fakeAgentSelection` (`:117-125`) and
  `buildDeps` (`:127-129`), both of which exist only to supply `agentSelection`. The nine survivors need
  the helper rewritten.
- `:496-497` passes a **fresh object literal** `{ agentSelection: fakeAgentSelection({…}), … }`, which
  is the one spot in the file where excess-property checking bites.

**(b) `layers/core-api/routine/src/__tests__/routine-scheduler-completeness.integration.test.ts:71-74`** —
`inertPorts(): RoutineSchedulerPorts` returns a fresh literal containing
`agentSelection: { isAtCapacity: unreachable(…), selectAgent: unreachable(…) }`. Dropping `agentSelection`
from `RoutineSchedulerPorts` (§11.2, `ports.ts:118-136`) makes this a compile error. Not listed.

**(c) `framework/db/src/__tests__/zod-schemas.test.ts:44,144-146`** — imports and asserts on
`selectUserSkillSchema`, which §11.2 deletes at `zod-schemas.ts:58`. Compile error. Not listed.

The count in `architecture.md:1348` is also wrong: *"Thirteen test files touch `userSkills` today and two
more are reached by the delegation cascade."* Live count is **16** files containing `userSkills` /
`user_skills` under `layers/`+`framework/`+`tools/`, and **four** more reached by the cascade
(`concurrency.integration.test.ts`, plus (a), (b), (c) above). All 16 `userSkills` files *are* in fact
covered by §11.9's three tables — the miscount is cosmetic — but the four cascade-reached files are not,
and three of them are unlisted work.

*Authority:* `plan.md` AC #7; `.claude/rules/testing.md`; §11.2's and §11.9's own completeness claims.

### B3 — `seedAgentSkill` does not have zero callers; it has eleven

`architecture.md:1335` states, of `layers/core-api/src/__tests__/policy-engine.integration.test.ts`:

> the `seedAgentSkill` helper (`:238-247`) and the `userSkills` import … it has **zero callers** —
> verified. Deleting it removes dead code, not coverage

Verified live: `seedAgentSkill` is **called eleven times in that same file** — `:341, :355, :382, :401,
:416, :436, :476, :497, :527, :552, :577` (plus a referencing comment at `:369`). The helper's
`@deprecated` banner says the *rows* no longer drive policy decisions; it does not say the helper is
uncalled, and it is not.

Consequence: a builder following §11.9 literally deletes the function and lands on eleven broken tests
with no instruction for them. The right disposition is almost certainly to delete the eleven call lines
too — spot-checking `:341` (AC3), `:355` (AC4) and `:416` (AC5) confirms none of their assertions depend
on the seeded row, and stale trailing comments like `// Would normally push` (`:416, :476, :497`) are
already dead — but that is a determination the plan must make and record, not one a builder should
improvise mid-commit. Note also `:369`'s comment (`// No seedAgentSkill call — defaults to L1`) becomes
meaningless and needs removing.

*Authority:* the architecture skill blocks when a load-bearing factual claim is false; `plan.md` AC #7.

### B4 — Deleting `agent-delegation.ts` leaves a zero-match ESLint block, the exact anti-pattern this file already documents

`eslint.config.ts:813` is a config block whose entire scope is:

```
files: ["layers/core-api/routine/src/agent-delegation.ts"],
```

carrying the two AK7 AC2 `no-restricted-syntax` rules (`:824`, `:829`). §11.2 deletes that file. After
the deletion the block matches zero files and reports clean forever.

This is not a hypothetical: the `@lore` comment immediately above it (`eslint.config.ts:798-806`)
records the repo hitting this exact failure once already and correcting it —

> The block survived the deletion pointing at a file that no longer exists, which in ESLint is a silent
> no-op: it reported clean forever and read as coverage. Deleted rather than repointed — there is no
> successor file performing that selection, so there is nothing left to police.

The same disposition applies verbatim here: with `selectRoutineDelegate` gone there is no successor
performing routine-delegate selection, so the block is deleted, not repointed. But `eslint.config.ts`
appears in **neither** §11.2's "complete file list" nor §9's in-scope comment table nor §9's
out-of-scope list, and §11.2 asserts "Nothing outside this list changes."

*Authority:* `CLAUDE.md` § Monorepo — *"hard-fail when a scan finds nothing — a guard that silently
matches zero files reads as passing forever"*; `governance/README.md` as the source of truth for what
lint enforces.

---

## NON-BLOCKING DEFECTS

### N1 — §11.6's enum-coupling argument is false (the conclusion survives; the stated reason does not)

`architecture.md:1216-1217`:

> `agent-behavior-config-impl.ts:56` declares `Record<ConfigurationKind, AgentBehaviorConfigKind>`, a map
> that is **total over `ConfigurationKind`**. While `ConfigurationKind` keeps `skill`, the UI union cannot
> shed it without weakening that map to a partial record

The live declaration at `layers/core-api/src/routes/agent-behavior-config-impl.ts:55-57` is:

```ts
const CONFIG_KIND_TO_AGENT_BEHAVIOR_KIND: Partial<
	Record<ConfigurationKind, AgentBehaviorConfigKind>
> = { … };
```

It is **already `Partial`** — deliberately, because `harness_descriptor` (`configuration.ts:7`) has no UI
counterpart. There is nothing to weaken and no coupling in that direction. The reverse map
`AGENT_BEHAVIOR_KIND_TO_CONFIG_KIND` (`:66`) is total over `AgentBehaviorConfigKind`, but that is the UI
union constraining itself, not `ConfigurationKind` pinning it.

The **conclusion is still right** on the plan's other two grounds, both verified: removing the member
would require a second migration rewriting the two CHECK constraints (`schema.ts:1388`, `:1415`), and
`founder-rulings.md:76-78` names the slot as a live destination. And this is a declared non-goal
(`architecture.md:961-963`), so no builder acts on the false sentence. Fix the sentence.

### N2 — §11.6's "zero UI change" is correct — verified

Not a defect; recording it because it is load-bearing and was checkable.
`layers/core-ui/src/settings/SettingsAgentBehavior.tsx:218` renders
`{Object.entries(CATEGORY_LABELS).map(…)}` — tiles come from the **static** map (`:28-35`), with
`counts.get(kind) ?? 0` at `:225`. The Skills tile therefore renders "Skills — 0 items" regardless of
data, before and after. Combined with the verified absence of any production insert, the response bytes
and the screen are identical. VERIFIED.

### N3 — §11.7 mechanism 1 over-claims what the type system proves

`architecture.md:1234-1236`: *"`npm run check` is therefore the proof that no production file and no test
still names the table. There is no way to be partially done."*

True for anything naming `userSkills`, but the cascade reaches further than the symbol. B2(a) is the
counter-example: `routine-run-resolver.integration.test.ts` never names `userSkills`, and its deps come
from `buildDeps(...)` — a **call expression**, not a fresh object literal — so excess-property checking
does not apply and `npm run check` stays green while six tests fail at runtime. Those failures surface
only in `test:integration:service`; `npm run test` excludes the integration lane entirely
(`CLAUDE.md` § Which command to use when). The claim should be scoped to "every reference to the table
symbol", with the cascade's consequences carried by the enumerated file list instead.

### N4 — §11.7 mechanism 2 and §11.10 over-state what the registry validator enforces

`validateTableOwners` (`scripts/lib/governance-registry.ts:117-150`) checks `missing`, `phantom`, owner-is-
a-real-package, a ≥20-char reason per unowned entry, and `registry.totals.tables !== liveTables.size`.
It does **not** validate `totals.owned` or `totals.unowned`. So of the ladder `44/39/5 → … → 44/44/0`,
only the leading `44` is machine-checked; the other two are honour-system bookkeeping. Worth stating so
the builder keeps them honest deliberately rather than assuming a check will catch a slip.

### N5 — `governance/table-owners.json`'s `unowned` block: §11.10 is right, and AC #1 still holds

Verified: `TableOwners.unowned` is a **required** field (`governance-registry.ts:22`), and
`validateTableOwners` dereferences `registry.unowned.tables` unconditionally — at `:122` building
`claimed`, and again at `:141` iterating. A `{ note, tables: {} }` block must therefore survive.
§11.10's correction of `plan.md`'s "empty `unowned` block" wording is accurate.

**Judgement on AC #1:** still satisfied on its own terms. The AC's substance is "every table names
exactly one owning service", and an `unowned.tables` map with zero entries delivers exactly that; the
surviving `note` is schema scaffolding, not a recorded unowned table. Not a blocker, and the plan is
right to flag the wording rather than quietly diverge.

---

## FOLLOW-UP / NOTE

- **AL9's registration is left open.** This work package executes AL9's charter
  (`founder-rulings.md:41`), and §11.10 correctly rewrites `docs/process-layer/staged-operation.md:72`
  to state the fact rather than swap in another id. But AL9 remains registered at
  `.pipeline/work-packages/TRACK-AL.md:349` and `.pipeline/work-packages/pipeline-manifest.yaml:1205`.
  Retiring it is `.pipeline/` bookkeeping, outside `architecture.md`'s remit — noted so it is not lost.
- **`scripts/typecheck-gate.ts:502-503`** names both `agent-delegation.ts` and `concurrency.ts` in a
  `@lore` comment. Comment only — the surrounding list is of package directories, not files, so nothing
  breaks. Covered by §9's "no repo-wide sweep" rule; recorded because it is the one other place the two
  deleted filenames appear in tooling.
- **Deleting `concurrency.ts` is orphan-removal, not compiler-forced** — and §11.5.3 is honest about
  this, presenting it as a *"Recommendation"* with three reasons. Every earlier link in the chain is
  genuinely forced (see C1 below); this last one is a judgement call. It is the right one: it is the only
  step that crosses from `core-api` into `agent-orchestration`, and leaving an orphan behind a deletion
  is the exact mistake Ruling 4 cites AD4 for. Recorded so the boundary is explicit.

---

## Claim-by-claim audit

| # | claim | verdict | evidence |
|---|---|---|---|
| C1 | the cascade is forced, not opportunistic | **VERIFIED** (with the §11.5.3 nuance above) | `agent-delegation.ts:20,34` — `selectRoutineDelegate`'s only candidate source is `deps.listAgentIdsBySkill(db, input.skillId)`; it cannot survive the table. `concurrency.ts` holds exactly two exports (`:50`, `:58`) and imports only `sessions` (`:33`); repo-wide `rg -a 'isAgentAtCapacity\|ConcurrencyBoundReader'` returns **one** production consumer — `routine-scheduler-bindings.ts:39,153,159` — plus the barrel line `run-orchestration/src/index.ts:21` and three `__tests__` files. No DI, no port, no second barrel, no application-root use. `provisioner.ts`'s Phase-3 gate is a separate check and is untouched |
| C2 | routine delegation is unreachable in production | **VERIFIED, and by more than four ways** | `routine-service.ts:367` gates on `routine.delegationAllowed && routine.skillId`. Only production `skillId` writer is `routine-scheduler.ts:211`, with `delegationAllowed: false` at `:213`. `createRoutineSchema` (`routines-routes.ts:48-56`) / `updateRoutineSchema` (`:58-67`) accept neither. `InsertRoutineRequest` / `UpdateRoutineRequest` (`core-api-port.ts:457-465`, `:483-491`) accept neither. Every other `delegationAllowed` write in the tree is `false`: `tools/setup/src/demo-fixture.ts:201`, schema default `schema.ts:630`; `routines-routes.ts:265` is a read into a response. **Paths I checked that the author did not:** no migration ever sets the column (only `0000_easy_ted_forrester.sql:148` default 0 and `0004_boolean_coerce.sql:32-35` a type coercion); no admin/debug route writes it; the only `true` writers are eval scenarios (`tools/eval/src/scenarios/delegation.ts:149,263`) and test/story fixtures — development world |
| C3 | no production insert; no client calls the deleted endpoints | **VERIFIED** | `rg -a 'skill' framework/api-contract/src` → exit 1, no match. Client calls to `/api/users/…` are exactly three and none is `GET /:id`: `SettingsProfile.tsx:67` (PATCH), `SettingsAgents.tsx:253` (PATCH `/assistant`), `SetupFlow.tsx:267` (POST). `/api/users/me` and `/api/auth/me` appear only in test stubs. No OpenAPI/contract artifact names `skills`. `rg -a 'insert(userSkills)'` → tests + `tools/eval/src/seeding.ts:609` only |
| C4 | `autonomy_change` stays; `skill_change` routing is NOT dead | **VERIFIED — the architecture's correction of the brief is right, the brief was wrong** | `skill_change` is a member of `ITEM_KINDS` at `tool-handlers/src/tool-definitions.ts:427`, the `create_item` tool's closed kind vocabulary, and `create_item` is a live wired tool (`tool-handlers-bindings.ts:55`, `create-item.integration.test.ts:37`, five eval scenarios). `policy-engine.ts:121` routes on it (`if (item.kind === "skill_change") return "push"`). The producer is reachable end to end, so the four docs stay true. `autonomy_change` (`:432`) keeps the same independent producer after `routes/users.ts:351,363` go |
| C5 | `db:generate` unusable; migrations hand-authored from `0043`; no `CASCADE`; `users` untouched | **VERIFIED** | `meta/` snapshots stop at `0042_snapshot.json`; `_journal.json` has 56 entries (idx 0-55) and files run to `0055_AU26_agent_run_config.sql`. Spacing confirmed at 3 600 000 ms (`…625200000 → …628800000 → …632400000`), so the next `when` is `1785636000000`. FK is outbound: `user_skills.user_id → users.id` (`schema.ts:833-835`); nothing references `user_skills`, so a bare `DROP TABLE` suffices and `users` is not modified. `0049` is a real one-line whole-table-drop precedent |
| C6 | keep `"skill"` in `ConfigurationKind` + both CHECKs; delete only the seed; zero UI change | **CONCLUSION VERIFIED; one stated reason REFUTED** | Zero UI change verified — see N2. The coupling argument is false — see N1. The seed at `plugin-configuration.ts:744-760` is a plain `select().from(userSkills)` loop and nothing else in the file depends on it |
| C7 | test disposition: 3 files + 1 scenario deleted, 7 lose a describe/case, 6 lose fixture lines | **REFUTED in two places** | `seedAgentSkill` has 11 callers, not zero — **B3**. Three cascade-reached test files are unlisted — **B2**. The `agent-work-intent-worker.routine-selection` coverage claim **VERIFIES**: its five tests are `:137` (owner not at WIP → bakes + drains to owner), `:156`/`:173`/`:199` (all three delegation), `:216` (idempotency); the surviving behaviour is genuinely carried by `routine-scheduler-baked-emit.integration.test.ts:206` ("bakes the full resolved request onto the enqueued routine_run intent") and `:231` ("drainIntents uses the baked payload directly"). Nothing is repointed anywhere in the plan — that discipline holds |
| C8 | eval disposition | **VERIFIED** | `judgeUserSkillLevel` — `rg` returns only its definition (`judges.ts:609`). Zero callers, confirmed dead. `seedUserSkill` — 7 call sites, all inside the two scenario files the plan handles (`skill-autonomy.ts:54,165,276`; `delegation.ts:118,123,244,245`). `ska-l1-review-required` duplication verified: `routine-sessions.ts:242-313` (`rs-human-review-flag`) seeds the same `humanReview: true` routine and asserts a review item exists for the owner (`:298-310`). `ska-l4-silent`'s negative is genuinely unduplicated — `rg 'no_review_item'` over `tools/eval/src/scenarios/` returns **only** `skill-autonomy.ts:219`, so the rework rather than the cheaper outright delete is the right call. `delegation.ts`'s five judges all survive: I read `intent_recorded_owner_hint` (`:186-200`), which asserts `requestedBy === delSuccessOwnerAgentId` — the **owner**, not a delegate — and stays green after the branch is gone; the file's own note at `:328` is accurate |
| C9 | the `unowned` block survives as `{ note, tables: {} }`; AC #1 still met | **VERIFIED** | See N5. `totals.tables` is the only machine-checked figure — see N4 |
| C10 | 13 violations cleared; final 90; `layer → service (other layer) [import]` ends at 35, below its 36 baseline | **VERIFIED — reproduced** | Baseline is **191** production / 0 development, group tally `layer → service (other layer) [import]` = **36**. The 13: nine `userSkills` findings (`plugin-configuration.ts:2,745`; `routes/users.ts:2,241,309,321,327`; `routine-scheduler-bindings.ts:20,76`) plus `routine-scheduler-bindings.ts:18` and `:39` plus `concurrency.ts:33` and `:67`. I confirmed the two bindings imports genuinely become unused: `readAgentRunConfig` is used only at `:61` and `isAgentAtCapacity` only at `:153,:159`, all inside deleted blocks; `requireRunnableAgent` survives at `:164` so `@hyperidle/users` stays. 191 − 13 = **178**. Group: 36 + 1 (Ruling 5) − 2 = **35**, genuinely below its baseline. Final 91 − 2 + 1 = **90**, internally consistent, no double-count (the `concurrency.ts` pair are table findings, already inside the 16 subtracted) |
| C11 | the deletion goes first and is indivisible; PASS at every commit boundary | **VERIFIED** | Indivisible in both directions: schema drop without the registry edit trips `totals.tables !== liveTables.size` (`governance-registry.ts:147-149`); registry edit without the schema drop trips `missing` (`:124-130`); the reverse order trips `phantom` (`:132-135`). Commit 1 ends at 178 warnings / 0 errors — the four table rule keys are still absent from the promotion until commit 8, and the deletion introduces no error-severity group (`layer → db:table (other)` never applies to a table that no longer exists). §7.1's "Ruling 4 removes five of those errors before any owner is named, leaving 15" is consistent with the five layer-world `userSkills` sites in the baseline (`routes/users.ts:2,241,309,321,327`) |

---

## Scope, boundary, and contracts

**Does the deletion stay inside Ruling 4's grant?** Yes. The ruling's in-scope list
(`founder-rulings.md:60-65`) names the table and migration, the two endpoints, the `listAgentIdsBySkill`
port, the `plugin-configuration.ts` seed, the Settings category, and the eval scenarios. The delegation
cascade goes past the literal words, but every link is a forced consequence of removing that port (C1),
and the ruling's own rationale — *"AD4 shipped the removal and deliberately left the table"* — is an
instruction not to leave orphans. Nothing is deleted that the ruling does not reach.

**The two deliberate non-deletions are correct.** Leaving `ITEM_KINDS` alone (§11.4) is right:
`skill_change` is live (C4), and `autonomy_change` keeps an independent `create_item` producer, so
shrinking the list would narrow an agent-facing tool contract for no gain. Leaving `routines.skillId` /
`delegationAllowed` alone (§11.5.4) is right: that is a second schema change on a live table with real
rows, and §11.5.4 records the residue explicitly so it does not read as an oversight. Both are properly
listed as non-goals (`architecture.md:956-963`).

**Doc boundary — four lines, correct.** All four verified as real and genuinely falsified:
`as-implemented-domain-architecture.md:388` ("45 tables … user_skills"),
`staged-operation.md:72` ("Removing vestigial per-skill autonomy data is **AL9** (not built)"),
`functional-requirements.md:11` ("skills (`users.skills`)"), `teams.md:19` ("`users.skills`, schema.ts").
The exclusions are right too: `docs/archive/kernel-strategy-split.md` is archive; `agent-model.md:15`,
`staged-operation.md:147` and `product-decisions.md:13` say autonomy is *not* a per-skill dial and stay
true; `product-decisions.md:24` keeps the skills-as-knowledge question open, which Ruling 4 explicitly
does not foreclose. Nothing is made false and left standing, and nothing is corrected that this change
did not falsify.

**Hard contracts.**
- *No production export only tests consume* — the deletion strictly shrinks the surface
  (`routine`'s barrel loses `selectRoutineDelegate` + `AgentDelegationDeps`; `run-orchestration`'s loses
  `isAgentAtCapacity`). §11.8's insistence on **deleting** `skill-autonomy.ts` rather than unexporting it
  is right — knip reports unused files, and an unexported scenario becomes one.
- *Production never imports development* — untouched; no production file gains an import.
- *Work-package ids stay inside `.pipeline/**`* — §11.3's deliberate break from the `0049_AU18_…`
  neighbour pattern (`0056_drop_user_skills.sql`, header citing `product-decisions.md:13` rather than a
  WP id) is correct and well argued, as is §9's rule for the comments this PR rewrites. I found no WP-id
  leak proposed anywhere in §11.

**Under-specification a builder would have to invent around.** Three, all of them the blockers above:
the disposition of `policy-engine.integration.test.ts`'s eleven `seedAgentSkill` call sites (B3), the
disposition of `routine-run-resolver.integration.test.ts`'s six delegation cases and its shared helpers
(B2a), and whether `eslint.config.ts:813` is deleted or repointed (B4). Everything else in §11 is
specified to file and line.

---

## What is solid

Recorded because thoroughness cuts both ways, and most of §11 is unusually well evidenced:

- **The unreachability proof (§11.5.1) is the strongest part of the plan.** Four independent checks, all
  reproduced, and I could not find a fifth path — not through migrations, seeds, the HTTP schemas, the
  agent-facing seam, or a debug route. The conclusion that the branch is dead in production is solid.
- **The cascade reasoning (§11.5.3) is honest about where forcing stops** and does not over-claim
  `concurrency.ts` as compiler-forced.
- **The commit-order argument (§7.2) survives the amendment.** Putting the deletion first is right for
  the reasons given: the `unowned` ladder stays monotone, the `userSkills` relocation commit is never
  planned-then-withdrawn, and the barrel shrinks before commit 6 grows it.
- **The arithmetic is reproducible end to end** and the one counter-intuitive figure — a group ending
  *below* its baseline — is correct.
- **The eval reasoning (§11.8) does the right thing**: it corrects the ruling's own scope in the
  ruling's favour (`routine-sessions.ts` seeds routine `skillId`, not user skills), argues each scenario
  separately, and carries over the one genuinely unduplicated assertion instead of taking the cheaper
  delete. Treating an eval deletion as a product decision rather than a test cleanup is the right frame.
- **§11.6 reaches the right answer** on the `"skill"` slot even though one of its two supporting facts is
  wrong (N1).

---

## What closing the blockers requires

No redesign — the deletion plan's shape is right. Four additions:

1. **B1** — §11.7 names `expect(tableNames).not.toContain("user_skills")` as the red demonstration, in
   `migration.integration.test.ts` and `pg-migration.integration.test.ts` (and `schema.integration.test.ts`
   for symmetry with the existing `factory_settings` precedent), and §11.9's fixture rows carry it.
   Correct the two false sentences about `arrayContaining` going red.
2. **B2** — add the three files to §11.2/§11.9 with a per-case disposition, in particular which six
   `routine-run-resolver` cases are deleted and what replaces `fakeAgentSelection`/`buildDeps` for the
   nine survivors. Fix the "thirteen"/"two more" counts.
3. **B3** — replace the "zero callers" claim with the eleven call sites and state their disposition.
4. **B4** — add `eslint.config.ts:807-833` to §11.2 as a deletion, citing the precedent already in that
   file.

N1, N3, N4 are sentence-level corrections and do not change any decision.

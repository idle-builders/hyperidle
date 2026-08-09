# AU30 — implementation review

Reviewed: `origin/main...HEAD` (merge base `0791c4fd`, HEAD `271eb76d`), 92 files, +6232/−2422.
Read-only. Working tree confirmed clean after every probe.

**Note on scope measurement.** The brief's "183 files / +6661/−2767" is the two-dot
`origin/main..HEAD` diff, which also reverses the two commits `origin/main` has gained since the
merge base (`59b9299a`, `f2552361` — the CL1 palette). The real change is the 92-file three-dot
diff; the design-system / `tokens.css` / `core-ui` churn in the two-dot view is not this branch's.

---

## Verdict

**NOT DONE** — one blocking finding. All seven acceptance criteria pass; the block is a concrete
coverage regression the change's own architecture justified on a false premise.

---

## What I verified live, versus what I took as reported

**Verified live (ran it myself):**

- `npx tsx scripts/governance-lint.ts` → `PASS`, **90 production + 0 development** known violations,
  **13 rule groups, zero `db:table` groups**, `layer → service (other layer) [import]` = **35**.
- `governance-lint --attacks` → PASS, 51 break-tests. `--fixtures` → PASS, 63 synthetic cases.
- **Red probe, write direction.** Created `layers/core-api/work/src/zz-probe-foreign.ts`
  (`insert(teams)`): two **ERROR**s — `service → db:table (other) [import]` and
  `service → db:table (other) [table:write]` — and `exit=1`. Deleted; tree clean.
- **Red probe, read direction.** `layers/core-api/work/src/zz-probe-read.ts` (`from(sessions)`):
  `service → db:table (other) [import]` + `service → db:table (other) [table:read]`, both ERROR,
  build fails, message names `run-orchestration` as owner. This is `plan.md`'s validation scenario
  3 proven directly. Deleted; tree clean.
- **Pin probe.** Removed `sourceKnowledgeItemId` from `betListItemSchema` and typechecked
  `layers/core-api`: `bet.schema.ts(139,6): error TS1360: Type 'true' does not satisfy the expected
  type 'false'`. The conditional-type pin bites. Restored; tree clean.
- `npm run verify` → **exit 0**. Attestation leg ran `test:all`: **322 test files passed / 1 skipped,
  2786 tests passed / 4 skipped**, then the e2e leg, then wrote the attestation. (I restored
  `.verify-attestations/` to its committed state afterwards.)
- Exhaustive `rg` of every `enqueueWorkIntent` call in every test file (see BLOCKING-1).
- `rg -a` for `userSkills|user_skills` across `layers/ framework/ applications/ tools/` excluding the
  two migration archives → only the three `@lore`-tagged `not.toContain` assertions remain.
- Consumer census of every new barrel export (see NON-BLOCKING-2).

**Taken as reported / inferred, not independently measured:**

- The **191 → 90** production figure. I measured 90 on this tree; I did not re-run the lint against
  `0791c4fd`, because standing up a second checkout would have touched the primary repository. The
  36 → 35 claim for `layer → service (other layer) [import]` I did reconstruct arithmetically from
  the diff and it is exact — see AC-4 / Ruling 5 below.
- `npm run test:integration:harness` and the release-gated lanes did not run (per-merge scope).

---

## BLOCKING

### BLOCKING-1 — a formally protected test was deleted, its subject survives, and no successor exists

**Location.** `layers/core-api/src/services/__tests__/agent-work-intent-worker.routine-selection.integration.test.ts`
— deleted whole in commit `f3d43fa6`. The case in question was at `:216`,
`"enqueueWorkIntent is idempotent on (kind, sourceId, idempotencyKey)"`.

**Evidence.**

1. The file held **five** tests (`:137, :156, :173, :199, :216`). `.pipeline/work/AU30/architecture.md:1451`
   justifies deleting it with: *"the describe is 'routine agent-selection…' and **three of its four
   tests** are delegation … so **nothing is lost silently**."* The count is wrong by one, and the
   uncounted test is the only one whose subject is not delegation.
2. `.pipeline/work/AU21/architecture.md:1534-1538`, **§14 Protected tests**, names this exact file:
   *"**Idempotency/dedup — STAY GREEN UNCHANGED.** `agent-session-requests.integration.test.ts` …
   and `agent-work-intent-worker.routine-selection.integration.test.ts` (idempotent record)."*
   The sibling protected file survives; this one does not.
3. The subject survives untouched: `layers/agent-orchestration/session-requests/src/service.ts:943-955`,
   `insertIntentInternal`'s early return —
   `const existing = await db.select()… .where(and(eq(kind), eq(sourceId), eq(idempotencyKey))).limit(1); if (existing[0]) return existing[0];`
4. No successor. I enumerated `await enqueueWorkIntent(` in every test file in the repository. The
   only files calling it twice are `agent-work-intent-supersede.integration.test.ts` (two
   *different* `idempotencyKey`s — `wave0-supersede-v1` / `-v2`, deliberately testing the *non*-dedup
   path) and `agent-work-intent-baked-payload.integration.test.ts` (two different sources/keys).
   `framework/db/src/__tests__/session-requests.integration.test.ts:6` covers the DB unique index on
   `agentSessionRequests`, a different table and a different mechanism (it asserts the second insert
   *throws*, where the deleted test asserted the service *returns the existing row*).
   Nothing anywhere now asserts that a duplicate `enqueueWorkIntent` returns the same intent id and
   writes no second `agentWorkIntents` row.
5. The rest of the deleted file's justification does hold: the fire→bake→drain-to-owner path is
   genuinely covered by `routine-scheduler-baked-emit.integration.test.ts:162` and `:187`.

**Impact.** The dedup guarantee for agent work intents — the thing that stops one routine run
becoming two agent sessions — is now untested. `npm run verify` is green precisely because the test
that would notice is gone; this is the green-signal shape the review method calls out.

**Governing authority.** AU21 `architecture.md` §14's protected-test list (an approved in-scope
constraint carried forward), plus a concrete coverage regression introduced by this change, approved
on a factually incorrect premise in this work package's own `architecture.md` §11.9.

**Remedy is small and bounded.** Re-home that one ~20-line case into a surviving file whose subject
is the intent queue (e.g. `agent-work-intent-baked-payload.integration.test.ts` or
`agent-work-intent-supersede.integration.test.ts`), unchanged. Nothing else about the deletion is in
question.

---

## NON-BLOCKING DEFECTS

### NBD-1 — a comment made false by this change, in a file this change edits

`layers/core-api/src/service-bootstrap.ts:490-491`:

> `// owning services (users/notifications/knowledge). propagation_log is`
> `// UNOWNED_SHARED_TABLES so its delete stays a direct @hyperidle/db call.`

Both halves are now false: `propagation_log` is owned by `policy`
(`governance/table-owners.json`), and the delete is no longer a direct `@hyperidle/db` call — this
commit replaced it with `reapTerminalPropagationLog` eighteen lines below, and rewrote the *inline*
comment there (`:508`) while leaving this block comment. `architecture.md:880-881` sets the rule this
misses: *"fix the comment at every file this pull request already edits."* The two other stale
`UNOWNED_SHARED_TABLES` citations I found that this change falsifies —
`layers/core-api/work/src/__tests__/task-run-resolver.integration.test.ts:9-10` (`taskDispatchAttempts`)
and `layers/agent-orchestration/run-orchestration/src/__tests__/runtime-reapers-routine-collapse.integration.test.ts:13`
(`sessions`) — are explicitly declared out of scope by `architecture.md:912-914` ("four `__tests__`
files"), so I do not count them.

### NBD-2 — three new public exports with zero consumers

- `layers/agent-orchestration/run-orchestration/src/index.ts:56` — `type EndSessionByCasInput`
- `layers/agent-orchestration/run-orchestration/src/index.ts:62` — `type RunSummary`
- `layers/core-api/policy/src/index.ts:29` — `type LogPropagationEntry`

Each is used only inside its defining module. Nothing outside the package names any of them —
production or test. `knip` cannot see this, because a package barrel is an entry point. The plan's
constraint bans an export only tests consume; these are one step further out (nobody consumes them),
so they are new dead public surface rather than a constraint breach. Drop them from the barrels.

### NBD-3 — `tools/eval/src/scenarios/delegation.ts:1-28` header is now false

The header states *"The actual delegate/owner selection is proven by the real service-integration
suite (`agent-work-intent-worker.routine-selection.integration.test.ts`), not this eval."* That suite
is deleted by this change and delegate selection no longer exists anywhere in the tree. The two
scenarios themselves remain valid — they assert fire-time does not gate on WIP and the recorded hint
is always the owner, both still true — only the header lies about why.

### NBD-4 — a read widened during relocation

`layers/agent-orchestration/src/services/session-stream-hub.ts:72` previously selected
`{ id: sessions.id }`; it now calls `findSessionById`, which selects all 18 columns, to answer an
existence question on every WebSocket subscribe. Behaviourally identical, marginally wasteful. This
is the honest cost of "each accessor is a specific question moved verbatim" and it is the only place
I found where the shared accessor is wider than its caller needs.

---

## Acceptance criteria

| # | criterion | verdict | evidence |
|---|---|---|---|
| 1 | every table names exactly one owner; `unowned` empty | **PASS** | `governance/table-owners.json` `totals` 44/44/0, `unowned.tables` `{}`. `validateTableOwners` (`scripts/lib/governance-registry.ts:122-149`) fails the build on any table absent from the registry and on `totals.tables !== liveTables.size`, and is wired into the lint via `scripts/rules/registries-honest.ts:53`. `framework/db/src/__tests__/governance-model.test.ts` gains a case asserting `unowned.tables` is `[]`, `totals.unowned` is 0, and `ownerOf` is non-null for **every** live table; the pre-existing unowned-branch case was rebuilt against a synthetic registry instead of being pinned to a real table, which is the right fix. Judged on its own terms: the surviving `{ note, tables: {} }` block carries no unowned table, so the criterion is met. Owners verified to actually hold the SQL — `filesystemCaptures`→`filesystem-mounting/src/mounter-registry.ts`, `serverCredentials`→`core-api/credentials/src/credential-store.ts`, `teamRunConfigDefaults`→`agent-run-config/src/team-run-config-defaults-store.ts`. |
| 2 | every production read and write reaches its table through the owner | **PASS** | Measured live: zero `db:table` groups in the lint's 13 remaining production groups. Both red probes fail the build naming the owner. No package other than the owner names any table. |
| 3 | no cross-owned-table query in production | **PASS** | Subsumed by AC-2 and stronger: with zero foreign table reads, a join whose second table has a different owner cannot compile past the lint. Spot-checked the relocated accessors — every query in `session-store.ts`, `lifecycle-propagation.ts`'s two new doors and `taskDispatchAttemptStore.insertAttempt` is single-table. |
| 4 | the four table rules and two table-symbol import rules fail the build in both directions, with no baseline entry | **PASS** | `governance/rule-severity.json` holds 13 keys, none of them `db:table`; README states an absent key is at `error`. Proven red, not assumed: both probes produced `ERROR` and `exit=1`, on read and on write, for the table rule and the table-symbol import rule. Proven green: the live tree is at zero table violations, and `--attacks` (51 break-tests, each with a control twin that must stay clean) passes. `scripts/**` is untouched by this change, so the model and the attack table are the ones already break-tested. |
| 5 | every `db:table (unowned)` and production `db:table (other)` key removed | **PASS** | Ten keys removed, 23 → 13, exactly matching the 13 groups the lint now reports. No key re-tagged, no new key added. |
| 6 | AU28 bookkeeping gone and unreintroducible under any name | **PASS** (inherited, not delivered here) | `governance/` contains only `README.md` + four JSON registries; no adoption/allowance record. `no-per-file-allowances` is registered at `scripts/governance-lint.ts:63` and carries three attack entries (`governance-attacks.ts:670,684,1150`). AU30 changed nothing in this mechanism, which is what the criterion asks. |
| 7 | `verify` green; every relocated accessor's behaviour proven through the owner | **PASS** | `npm run verify` exit 0, live. Relocation evidence, per accessor: **`endSessionByCas`** — new `session-store.integration.test.ts` (213 lines) asserting the three properties, including the outcome-override trap where persisted `"stopped"` and emitted `"completed"` diverge, which no prior test touched; **`findSessionById`/`listSessions`/`countActiveRunsByAgent`/`listLatestOutcomeByTask`/`listRunSummaries`/`recordSessionMetadata`** — `agent-orchestration-run-reads.integration.test.ts` and the sessions route suites, **not modified by this change**, still green through the real routes; **`writeSessionNotes`** — `write-session-notes.integration.test.ts`, **not modified**, and it imports the real production `toolHandlersPorts` (`:20`), so the new port is exercised for real rather than through `STUB_TOOL_HANDLERS_PORTS`; **`recordPropagationHop`** — `AF12-bet-cascade.integration.test.ts` rewired to the real owner's builder, assertions untouched; **`reapTerminalPropagationLog`** — `retention-reaper.integration.test.ts`, predicate assertions untouched; **`insertAttempt`** — new `task-dispatch-attempt-store.integration.test.ts` (5 cases). |

---

## The six attack points in the brief

**1. The terminal session transition.** Sound. `endSessionByCas`
(`run-orchestration/src/session-store.ts:181-220`) is verbatim of the route's `:178-212`, field for
field — I diffed the payload construction, the `input.outcome ?? outcome` split, the
`actor ?? agentId` fallback and the read-back. The CAS predicate **cannot be dropped**: there is no
`where` parameter, and `session-store.ts` is the only write door onto `sessions` outside the package
(the route now performs no `sessions` write of any kind, verified by import — `sessions.ts:27` is
`import type { HyperIdleDb, Session }`, the table symbol is gone). The emit **cannot fire on zero
rows**: it sits inside `if (transitioned.length > 0)` in the same function as the `.returning()`.
It **cannot double-fire**: `rg` over the whole tree shows `endSessionByCas` has exactly one caller
(`routes/sessions.ts:184`), and the accessor is idempotent besides — the store test's second call
against a settled row produces no write and no second event.

Transaction boundaries: neither the old nor the new code opens a transaction, so there is no
emit-succeeds/write-rolls-back window and none was introduced. The emit follows a committed
single-statement `UPDATE`; an emit throw leaves the row terminal, exactly as before.

Everything the brief asked me to confirm did **not** move, did not move: the 409 already-terminal
guard (`sessions.ts:97-106`), the live-runtime abort branch (`:119-149`, still returns 202 and still
writes nothing), and **both** `transitionRun` request-terminalize calls (`:157-163` request-termination,
`:170-176` terminalize). Ordering is preserved — the request side still runs **before** the session
CAS (`:155-177`, then `:182-195`), and its `conflict`/`terminal` early return still short-circuits
before any `sessions` write.

`session_ended` has four production emitters, unchanged in count: `session-store.ts:208` (this one),
`transition-run.ts:202` and `:275`, `runtime-reapers.ts:200`. The two `transition-run` emitters are
genuinely CAS-gated — `updateSessionRow` (`:365-377`) carries `eq(sessions.state, "active")` and
returns a boolean the emit is gated on.

**2. The dispatch-attempt ordinal.** Semantics preserved exactly. `work-service.ts`'s `insertAttempt`
runs the identical `select({id}).where(eq(taskId))` + `existing.length + 1`, on the executor the
caller passes — so the count and the insert observe the caller's `tx` snapshot, which is what the old
caller-side code did. `policy` no longer names the table
(`handoff-protocol.ts:1` is now `import type { HyperIdleDb }`), and the port's input deliberately
omits `ordinal` so a caller cannot supply one. The flakiness fix did **not** weaken the proof: A3
still seeds a lone row at `ordinal: 9`, inserts, and asserts the new row is **2** — addressed by
`ordinalOf(db, inserted.id)`, so a `max(ordinal)+1` implementation yields 10 and fails. The
identity-addressing change only removed the file's reliance on `createdAt` ordering at millisecond
resolution; it added assertions (`ordinalOf` on the seeded row, `toHaveLength(2)`) rather than
removing any. A4 proves same-`tx` visibility, A5 proves rollback.

**3. The `user_skills` deletion.** Nothing surviving depends on what was removed. The migration is
correct and consistent: `0056_drop_user_skills.sql` exists, `meta/_journal.json` gains
`{ idx: 56, version: "7", when: 1785636000000, tag: "0056_drop_user_skills" }` — tag matches the
filename, `when` is monotonic (+1h on 0055), `version` matches its neighbours. The mis-tag hazard the
brief names is closed by a real assertion against a real post-migration database:
`migration.integration.test.ts:63`, `schema.integration.test.ts:65` and `pg-migration.integration.test.ts:66`
each add `expect(tableNames).not.toContain("user_skills")` — necessary because the surrounding
expectation is `arrayContaining`, which tolerates both extras and removals. `GET /api/users/:id`'s
shape change breaks nothing: no `skills` reference exists in `layers/core-ui/src`, in any api-contract
package, or in any non-archive production file. `isAgentAtCapacity` (the `concurrency.ts` cascade) has
zero remaining references, and `admitSession`'s own Phase-3 capacity gate is a materially different
check that was correctly left alone. The three eval scenarios are handled rather than broken:
`skill-autonomy.ts` deleted with its judge, `delegation.ts` de-seeded (its two scenarios never
asserted that delegation occurs), and the one assertion pair worth keeping from the retired scenario
was re-homed as `rs-silent-no-review-item` in `routine-sessions.ts` — coverage moved, not dropped.

One consequence worth stating plainly, because it is larger than "deleting a table": routine
**delegation** is gone as a behaviour. `resolveRoutineRunRequest` now always targets
`routine.ownerAgentId`. Ruling 4 authorises this on the ground that the path was unreachable — no
production insert into `user_skills` ever existed, so `listAgentIdsBySkill` always returned `[]` and
`selectRoutineDelegate` always returned `null`. I checked that premise and it holds: every insert in
the tree was a test or `tools/eval/src/seeding.ts`. The `routines.skillId` and
`routines.delegationAllowed` columns survive as now-unread storage; that is out of scope here.

The `eslint.config.ts` AK7 block deletion is correct rather than a lost guard — its only `files:`
target was `agent-delegation.ts`, and an ESLint block pointing at a non-existent file reports clean
forever, which is the failure mode the block's own `@lore` described.

**4. The hand-written bet wire schema.** The new schema matches what the route emits.
`routes/bets.ts:293-296`'s `normalizeBet` spreads the whole row and overwrites `atRisk` with
`b.atRisk === 1`, so the wire item is every `bets` column with `atRisk` boolean — precisely
`Omit<Bet,"atRisk"> & { atRisk: boolean }`. The pin genuinely bites: I removed one field and
typechecking failed with `TS1360` at `bet.schema.ts:139`. It is mutual (`Wire extends BetListItem`
**and** the converse), so an added field, a dropped field and a retyped field all fail. The
false-green it replaced is fixed at the root: `typed-routes.integration.test.ts` now inserts a real
bet and asserts `body.draft` has length 1 **before** `safeParse`, so the parse can no longer succeed
against four empty arrays. Nothing else depended on the old shape — `selectBetSchema` has no other
importer, and the `design/no-unknown-cast` suppression the old line needed is gone with it.

**5. Ruling 5's accepted warning.** Confirmed, and confirmed as the *only* net-new production
violation anywhere. I enumerated every added and removed `@hyperidle/*` import line across
`layers/`, `framework/` and `applications/` production files. Exactly one net-new cross-layer service
import from a layer package: `tool-handlers-bindings.ts:31` → `@hyperidle/run-orchestration`. Against
it, `routine-scheduler-bindings.ts` **lost two** (`@hyperidle/agent-run-config`,
`@hyperidle/run-orchestration`). Net −1, and the group measures **35** live — below its 36 baseline,
as claimed. Every other new import is same-layer (`routes/bets.ts` → `@hyperidle/policy`,
`service-bootstrap.ts` → `@hyperidle/policy`, the `agent-orchestration` routes →
`@hyperidle/run-orchestration`) and legal.

**6. Contract compliance.** Clean.
- **Zero exceptions**: no allowlist, ceiling, carve-out or suppression. No `eslint-disable`,
  `biome-ignore` or `@ts-expect-error` was added anywhere in the change — the only suppressions in
  the touched files are pre-existing naming/complexity ones, and the change **removed** one
  (`design/no-unknown-cast` in `bet.schema.ts`).
- **Reads as well as writes**: proven by the read probe, which is `plan.md`'s own validation scenario.
- **No test-only production export**: every added function export has a real production caller
  (checked one by one). Three added *type* exports have no caller at all — NBD-2.
- **Production never imports development**: governance-lint reports 0 development violations, and
  `no-production-imports-development` is a registered rule in the same pass.
- **No work-package id in code**: every occurrence of `AU30` outside `.pipeline/**` is inside an
  `@lore` tag (9 of them, all in comments), which is the stated exemption. Filenames are clean —
  `0056_drop_user_skills.sql`, `session-store.ts`, `task-dispatch-attempt-store.integration.test.ts`.
  No commit message in the twelve references the id. No identifier does.

**7. Regressions.** One found — BLOCKING-1. Everything else I probed came back clean. Specifically:
every deleted `expect` I traced has a deleted subject (the `skills` assertions, the autonomy-PATCH
describes, the six delegation resolver cases, the `selectUserSkillSchema` case, the profile-with-seeded-rows
cases); no assertion was weakened to pass; `AF12-bet-cascade.integration.test.ts` was strengthened,
not loosened, by wiring the **real** `recordPropagationHop` into `testDeps` so its AC3/AC6 row
assertions now run against the production builder; `retention-reaper.integration.test.ts` keeps every
predicate and cutoff. `writeCascadeRow`'s move to the shared builder is field-identical — I checked
the three defaults that used to be written explicitly (`attempts: 1`, `failureReason: null`,
`appliedAt: now` under `status: "applied"`) all reproduce through
`recordPropagationHop`'s `?? 1`, `?? null` and `entry.status === "applied" ? now : null`.
`plans/mock-data-purge/*` is a mechanical line-number regeneration required by `mock-inventory:check`.
The four `docs/` edits are accurate (45 → 44 tables, the AL9 line, two `users.skills` field
references).

---

## Follow-up / notes (not assigned)

- **`runtime-reapers.ts:193-209` is honestly *placed* but not honestly *characterised*.** It writes
  terminal with `.where(eq(sessions.id, …))` only — no `active` predicate, no rowcount gate on the
  emit — behind a pre-read filtered on `state = "active"`, which is a TOCTOU window. Pre-existing,
  inside the owner, correctly out of scope, and I do not report it as new. But `architecture.md:279-283`
  lists it among the paths where "`run-orchestration` performs the terminal write", framing the
  invariant as merely *split* between packages. After this change the split across packages is
  closed; the split *inside* the owner is not, and one of the owner's four `session_ended` emitters
  still lacks the gate the other three carry. Worth naming in whatever closes it.
- **The branch is two commits behind `origin/main`** (`59b9299a`, `f2552361`). `59b9299a` — "Close
  every test fixture arranging a state production can't produce, and make the lint that catches it a
  real linter" — introduces a linter this branch's two new fixture-heavy integration tests have never
  been run against. Re-run verify after the rebase rather than trusting this one.
- **Ruling 5's standing instruction is still outstanding**: on rebase onto AU31, the
  `tool-handlers-bindings.ts` sessions wiring must be resolved by copying AU31's pattern, not by
  inventing a second one.
- `transition-run.ts:365` and `session-store.ts:201` now hold two near-identical CAS helpers inside
  the owner. The code says consolidating them is a separate judgement; I agree, and it is not this
  work package's.

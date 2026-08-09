# AU30 — Architecture critique

**Phase:** architecture critique (read-only). **Evaluated:** `.pipeline/work/AU30/architecture.md`,
`.pipeline/work/AU30/feasibility.md`.
**Against:** `.pipeline/work/AU30/plan.md` (authority), `.pipeline/work/AU30/requirements.md` (revision 1),
`governance/README.md`, `.claude/rules/typescript.md`, `.claude/rules/testing.md`, `CLAUDE.md`.
**Worktree:** `/Users/tg/hyperidle/.worktrees/AU30` @ `0791c4fd`.

**Method.** Every load-bearing claim below was re-derived from the source, not from the artifact. One
measurement probe was run (`governance/table-owners.json` rewritten with all eight owners,
`npx tsx scripts/governance-lint.ts`, reverted); `git status --porcelain` afterwards shows only this work
package's untracked artifacts and no tracked modification.

**Verdict: BLOCKED — one blocking finding.** The plan is otherwise unusually well-evidenced: the
mechanical model, the ordering, the crossing arithmetic and the cross-owned-read survey all reproduce
exactly. The single blocker is an evidence claim that is false for the one relocation that is not a
verbatim move.

---

## BLOCKING

### B1 — the named evidence for `insertAttempt` does not test the ordinal, and nothing else does

**Where.** `architecture.md:684` (§8.3 row 9): *"`insertAttempt` from the handoff |
`layers/core-api/src/__tests__/handoff-to.integration.test.ts` | the attempt row, and the **ordinal** —
the invariant that moved into `work`"*. Repeated at `architecture.md:758` (§8.6 row 3):
*"`handoff-to.integration.test.ts` asserts the ordinal"*.

**Verified live — the claim is false.**

- `rg -a 'ordinal' layers/core-api/src/__tests__/handoff-to.integration.test.ts` → no match.
- `rg -a 'taskDispatchAttempt|task_dispatch' layers/core-api/src/__tests__/handoff-to.integration.test.ts`
  → no match. The file (378 lines) never names the table.
- Repo-wide, `ordinal` appears in exactly three test files and in all three it is a **seeded fixture
  value**, never an assertion: `layers/core-api/work/src/__tests__/task-run-resolver.integration.test.ts:130`,
  `layers/core-api/src/services/__tests__/work-session-end-reactions.integration.test.ts:178`,
  `layers/core-api/src/services/__tests__/agent-run-admission-failed-subscribers.integration.test.ts:183`.
- `ordinal` is read by **no production code** either: the only two occurrences outside the schema are the
  two computations themselves (`layers/core-api/policy/src/handoff-protocol.ts:329`,
  `layers/core-api/work/src/task-state-machine.ts:125`). `task-run-resolver.ts` does not read it.

**Why this blocks.** `insertAttempt` is the **only** relocation in the plan that is not a verbatim move.
Every other accessor is "the same statement, one package over"; this one deletes a caller-side
`select` (`handoff-protocol.ts:317-320`) and re-derives its result inside the owner
(`architecture.md:185,189`). The architecture itself names the ordinal as *"the invariant that moved into
`work`"*. `plan.md:53` requires *"the behaviour of every relocated accessor is proven unchanged by tests
that exercise it through the owner"*, and `architecture.md:672` binds the whole work package to
*"import-path edits only. No assertion may change"* — so as written, no assertion covering the ordinal
will ever exist.

**The named test cannot go red on this.** `handoff-to.integration.test.ts` does reach the insert (it
asserts `data.targetAgentId === "agent-b"` at `:173`, which is the branch guard at
`handoff-protocol.ts:315`), and a failed insert would roll the tx back — so it proves the row is written
and valid. It cannot detect a **wrong ordinal value**. The `uniqueIndex("task_dispatch_attempts_task_ordinal_uq")`
on `(task_id, ordinal)` (`framework/db/src/schema.ts:522`) does not rescue it: the test seeds no prior
attempt for the task, so `existing.length` is 0 and an off-by-one (`existing.length` instead of
`existing.length + 1`, or a `count()` written against the wrong predicate) collides with nothing and
passes green. There is no `check` constraint on `ordinal`.

**Governing authority.** `plan.md:53` (AC #7); `CLAUDE.md` First Principle ("a test imports code and
asserts on its behavior"). A check that is green before the change it exists to prove is not evidence for
that change — the same standard `requirements.md:368-374` correctly applied to `--attacks`, applied
inconsistently here.

**What is missing, not how to fix it:** the plan states *"One new test, and only one"* (`architecture.md:687`).
The ordinal is a second relocated invariant with no evidence, and the artifact must say what proves it.

---

## Claims re-tested — result per claim

| # | claim | result |
|---|---|---|
| 1 | the terminal transition is safe | **VERIFIED**, with one imprecision (N1) |
| 2 | zero cross-owned-table reads | **VERIFIED** |
| 3 | 14 accessors, each with a named production caller; the knip hole is real | **VERIFIED** |
| 4 | `insertAttempt` preserves the ordinal semantics and needs the caller's `tx` | **VERIFIED** (semantics + `tx`); its **evidence** is REFUTED → B1 |
| 5 | the two `propagationLog` row builders are equivalent | **VERIFIED** (equivalence); the stated signature contradicts it → N3 |
| 6 | eight commits, PASS after each, 4/5/6 inseparable | **VERIFIED**, reproduced independently |
| 7 | ten named tests exist and cover the relocated behaviour | **PARTLY REFUTED** — nine hold, one does not (B1); one is weaker than stated (N4) |
| 8 | requirements' `filesystemCaptures` reason is wrong; the barrel is the real evidence | **VERIFIED** |
| 9 | B1/B2/B3 from the refinement critique are closed; `--attacks` is severity-blind | **VERIFIED** |
| 10 | zero development-world companion violations | **VERIFIED**, reproduced independently |

### 1 — the terminal transition · VERIFIED

Read `layers/agent-orchestration/src/routes/sessions.ts:89-213` in full.

- The three branches are exactly as described (`:97-105` 409, `:118-148` live-runtime abort, `:154-212`
  the no-live-runtime path). Branch 3 is the only one that writes `sessions` ✓.
- `endSessionByCas`'s specified body is verbatim `:179-212`, including the detail that matters most:
  the DB `outcome` takes `input.outcome ?? derived` (`:183`) while the **event** carries the derived
  `outcome` only (`:207`). `architecture.md:311,316-317` reproduces that asymmetry correctly.
- The three properties hold. The CAS predicate cannot be dropped because the accessor takes no `where`
  and is the only write door on `sessions` outside the owner after commit 6 (reproduced: with all owners
  named, `layer → db:table (other) [table:write]` is at `error`, exit 1). The emit is gated on the same
  `transitioned.length` inside the same function. The accessor takes an `EventBus`, which is what makes
  a setter impossible ✓.
- **Concurrency:** two concurrent PATCHes both read `existing` as `active`, both pass the 409 guard, both
  reach the CAS; one gets rowcount 1, one gets 0 → one emit. A route CAS racing a runtime teardown
  (`transition-run.ts:363-380`, same `where`, same `.returning({id})`) resolves the same way. Identical
  before and after the move — **no new race**.
- **Transaction boundary:** the CAS, the emit and the read-back are three separate statements with no
  transaction today, and the plan does not add one. A crash between CAS and emit leaves a terminal row
  with no event — pre-existing, unchanged, not a regression.
- **Ordering:** the request-side `terminalize` at `:169-175` genuinely precedes the session CAS, and
  `architecture.md:342-345` flags the hazard. `transitionRun` here is the layer binding
  (`layers/agent-orchestration/src/services/run-transition.ts`), which touches `agentSessionRequests`
  and the in-memory registry, not `sessions` ✓.
- **`session_ended` single-caller:** `endSessionByCas` will have exactly one caller ✓. The *event* will
  not be single-caller — see N1.

### 2 — no cross-owned-table reads · VERIFIED, independently and more broadly than the artifact claims

I did not rely on `leftJoin`/`innerJoin`. I extracted the **table symbols each file imports from
`@hyperidle/db`** across `layers/` and `applications/` (excluding tests), which catches subqueries,
`inArray` fed by another owner's table, and two-table `.from()` as well as joins.

Every file that touches one of the eight tables imports **exactly one** table symbol, with two
exceptions, both cleared:

- `layers/core-api/work/src/work-service.ts` imports `artifacts, bets, items, taskDispatchAttempts,
  tasks` — all five owned by `work`. Its four `taskDispatchAttempts` statements (`:60-115`) are
  single-table; the file contains no join.
- `layers/core-api/settings/src/plugin-configuration.ts` imports `configurationOverrides,
  pluginConfigurationDefaults, plugins, userSkills`. Its join at `:524-525` is over the three `settings`
  tables; `:745` is a bare `db.select().from(userSkills)` ✓.

The two `inArray`/raw-SQL uses inside the affected files are both single-table:
`request-run-stop-for-tasks.ts:46` (`inArray(sessions.taskId, [...taskIds])` — a caller-supplied array,
not a subquery) and `runtime-reapers.ts:182` (`sql\`${sessions.routineId} is not null\``).
`layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts:96-215` — the four route reads —
are all single-table, including the `count()`+`groupBy` and the `RUN_SUMMARY_COLUMNS` projection.
`architecture.md:353-366` is correct.

### 3 — fourteen accessors, fourteen production callers · VERIFIED

Each named caller exists and is a production file:

| accessor | caller checked | production |
|---|---|---|
| `findSessionById` | `routes/sessions.ts:273,285,316,362`; `agent-orchestration-sessions.ts:98`; `session-stream-hub.ts:73` | ✓ |
| `listSessions` | `routes/sessions.ts:242-250` | ✓ |
| `countActiveRunsByAgent` | `agent-orchestration-sessions.ts:147` | ✓ |
| `listLatestOutcomeByTask` | `agent-orchestration-sessions.ts:177` | ✓ |
| `listRunSummaries` | `agent-orchestration-sessions.ts:204` | ✓ |
| `endSessionByCas` | `routes/sessions.ts:192-212` | ✓ |
| `recordSessionMetadata` | `routes/sessions.ts:358-360` | ✓ |
| `writeSessionNotes` | `tool-handlers-bindings.ts` port wiring; `writeback-processor.ts:338` | ✓ (see N5) |
| `findUserSkill` | `routes/users.ts:304-311` | ✓ |
| `listUserSkills` | `routes/users.ts:241`; `routine-scheduler-bindings.ts:73-79`; `plugin-configuration.ts:745` | ✓ |
| `setSkillAutonomyLevel` | `routes/users.ts:320-330` | ✓ |
| `reapTerminalPropagationLog` | `service-bootstrap.ts:536` (`reapPropagationLog`'s only non-test caller) | ✓ |
| `recordPropagationHop` | `bet-kill-cascade.ts:134` via port; `lifecycle-propagation.ts`'s own uses | ✓ |
| `taskDispatchAttemptStore.insertAttempt` | `handoff-protocol.ts:317-330` | ✓ |

The knip hole is real, confirmed by reading the configuration: `knip.json` sets no `includeEntryExports`,
and `package.json:61`'s production lane is `--include files,dependencies,unlisted,binaries` — `exports`
absent. A test-only **barrel export** is invisible to both lanes.

**Is "a named caller per accessor, checked at review" sufficient?** For this work package, yes. All
fourteen callers are verifiable in one pass and I verified them; `plan.md:33` is a review-checked
constraint, not a machine one, and the artifact is explicit that it is not claiming otherwise
(`architecture.md:712,727`). Refusing to widen `knip.json` is correct — that is a repo-wide change with
repo-wide fallout and is not in `plan.md`.

### 4 — the ordinal semantics and the `tx` · VERIFIED (evidence REFUTED, see B1)

`handoff-protocol.ts:316-330` is `select({id}).from(taskDispatchAttempts).where(eq(taskId, task.id))` →
`ordinal: existing.length + 1`, and the whole sequence sits inside `tx` alongside
`deps.work.updateTaskById(tx, …)` at `:311` with `deps.taskRunResolver.resolve(tx, attemptId)` at `:337`
consuming the returned id. Moving the count into the owner **on the same `exec`** is semantically
identical, including under concurrency: two concurrent transactions could already both read N and both
attempt N+1 today, and `task_dispatch_attempts_task_ordinal_uq` already resolves that by failing one.
The `exec: WriteExecutor` shape is required and matches the store's four existing methods
(`work-service.ts:60-115`) ✓. The insert field set in `architecture.md:185` is complete against
`:322-331` ✓.

### 5 — the two `propagationLog` builders · VERIFIED equivalent

`bet-kill-cascade.ts:123-147` vs `lifecycle-propagation.ts:199-216`, read field by field. For the
cascade's inputs (`sourceEvent:"bet_killed"`, `status:"applied"`, `targetTransition` always a string, no
`failureReason`, no `attempts`) the two produce **byte-identical rows**: `id` uuid, `attempts: 1`
(`?? 1`), `failureReason: null` (`?? null`), `appliedAt = now` (`status === "applied" ? now : null`),
`createdAt = now`. The consolidation is genuinely behaviour-preserving ✓. The *stated signature* of the
public accessor contradicts this — N3.

### 6 — the commit order · VERIFIED, reproduced

I reproduced F2 independently (all eight owners written, lint run, reverted):

```
governance-lint: FAIL — 20 error(s). 3359 tracked files (788 production, 2571 development),
34 packages, 8215 crossings, 19 rules, 107 production + 0 development known violation(s) at warn.
```

The 20 errors are exactly the distribution in `architecture.md:560-563` and `feasibility.md:52-61`,
file-for-file and line-for-line: `sessions` 14 (`agent-orchestration-sessions.ts:98,149,179,206`;
`sessions.ts:211,246,250,273,285,316,362` + writes `:193,359`; `session-stream-hub.ts:73`), `userSkills`
5 (`users.ts:241,309,327,321`; `routine-scheduler-bindings.ts:76`), `propagationLog` 1
(`service-bootstrap.ts:136`). 16 warnings remain, total 36 table crossings.

The arithmetic also closes independently against the baseline: 100 table crossings at baseline
(25+20+18+16+6+4+4+3+3+1 from the group summary), minus the owner's own now-legal sites — 30
`run-orchestration`/`sessions`, 9 `policy`/`propagationLog`, 8 `work`/`taskDispatchAttempts`, 4
`agentRunConfig`, 3 `teamRunConfigDefaults`, 8 `serverCredentials`, 2 `filesystemCaptures` = 64 — leaves
exactly 36 ✓.

**Inseparability is exactly right, and nothing else is inseparable.** Only reads and writes fall into the
two absent-from-`rule-severity` keys; `layer → db:table (other) [import]` is present at `warn`
(`governance/rule-severity.json:10`). So commits 1, 2, 3 and 7 are individually safe (commit 3's policy
sites land in `service → db:table (other)`, all three at `warn`), and 4, 5, 6 must land registry +
relocation together. I found no other commit that is inseparable and unflagged.

Commit 8 is achievable: every db:table finding in the baseline belongs to one of the eight tables or to
`bet.schema.ts:15`, so the ten keys have no site outside this work package's reach. After the probe the
lint reported the six `(unowned)` keys as `NOTE … ready to flip to error`, confirming the mechanism.

### 7 — the test evidence · PARTLY REFUTED

All ten cited files exist at their cited paths ✓. Nine are honest:

- `layers/core-api/src/__tests__/sessions.integration.test.ts:181-340` genuinely drives the
  no-live-runtime CAS path end to end through the real app and the real bus: `state:"done"` asserts
  status 200, `body.state/endedAt/outcome/notes`, and **`expect(emitted).toHaveLength(1)`** on a live
  `session_ended` subscription; `state:"crashed"`, 404 and 400 follow. This is real coverage for the
  most delicate relocation, and "import-path edits only" is credible for it — the test drives HTTP and
  likely needs no edit at all.
- `retention-reaper.integration.test.ts:46,322` imports and calls `reapPropagationLog`; retargeting the
  import to `@hyperidle/policy` is an import-path edit ✓. `service-bootstrap.ts:536` is its only other
  caller, so the export is not lost.
- `write-session-notes.integration.test.ts:130-139` asserts both the disk write and `session?.notes` ✓.
- `session-stream-hub.integration.test.ts` covers the authorizer, whose fail-closed shape
  (`session-stream-hub.ts:70-76`, `return row !== undefined`) depends exactly on `findSessionById`
  returning `undefined` rather than throwing ✓.
- `P2-user-routes.integration.test.ts:166,214`, `AC1-session-effectiveness`,
  `two-app-mount-session-routes` all exist and cover their cited surfaces ✓.

One is false (B1) and one is weaker than stated (N4).

The new test's home is viable: `layers/agent-orchestration/run-orchestration` is a registered vitest
project (`vitest.config.ts`) and already holds ~20 `*.integration.test.ts` files using
`@hyperidle/db/test-fixtures` and an `eventBus` fixture ✓.

**Is one new test enough for the rowcount invariant?** For the transition itself, yes — the three
assertions in `architecture.md:692-698` (zero-row CAS writes nothing and emits nothing; exactly one emit
on a real transition and none on a repeat; the returned row is the post-write row) are the invariant, and
each can fail. See N2 for the one sub-case it would not catch.

### 8 — `filesystemCaptures` · VERIFIED, both halves

The refutation is correct: `filesystemCaptures` is imported by exactly one production file
(`mounter-registry.ts:17`) and its only statement is an `insert` at `:339`. The row is never read in
production, so `requirements.md:506`'s "the mounting engine is the operational consumer" does point at
nothing.

The substitute is correct and stronger: `layers/agent-orchestration/filesystem-mounting/src/index.ts:1-21`
is the package's own barrel header, tagged `@lore AU26 F1 (§D-I)`, and states verbatim *"SQL-owning
Service — owns `filesystem_captures`"* and *"`filesystem_captures` comes WITH the engine: the engine is
its only writer, its FK points at `sessions`, and `listCaptures` had zero non-test readers"* ✓.
`governance/table-owners.json:47` still says `filesystems`, which never names the table ✓. The stated
counter-argument (symmetric twin of `filesystemInjections`, FKs to both) is real and correctly weighed.

Item 6.1 checks out too: `wire-within-one-layer` at `scripts/lib/governance-model.ts:262-288` returns
`forbidden` for a cross-layer `di` with exactly the quoted `why`. So leaving `serverCredentials` at
`connections` really does leave no legal same-process form for `core-api/credentials`' eight sites ✓.

### 9 — B1/B2/B3 closed · VERIFIED

- **B1 (AC #4's proof).** `scripts/governance-lint.ts:154-161` — the attack suite builds its rules with
  `severityOf: () => "error"` under the comment *"An overlaid tree has no debt … every crossing on an
  attack overlay is an error, whatever a live severity declaration would say"*. Severity-blind by
  construction ✓. Live enforcement is `severity.severity[ruleKey] ?? "error"` at `:229-230` ✓, matching
  `governance/README.md:73-76`. The replacement probe (add a real `from(sessions)` read to a
  non-owning `layers/core-api/src/**` file; expect `ERROR` + exit 1) **can go red** — I demonstrated the
  identical mechanism in the F2 run, where 20 crossings in those two absent keys produced `FAIL` and exit
  1 while all ten present keys stayed at `warn`. `--attacks` is correctly demoted to proving the detector
  still recognises the crossing, and `governance/README.md:122` property 4 ("a registered rule with no
  attack case fails the build") is genuinely unaffected by deleting a severity key ✓.
- **B2 (terminal-writer sizing).** The qualifier is in the source (`routes/sessions.ts:78-88`,
  `:326-328`), the `otherwise` branch is real layer code at `:192-196` + `:199-209`, and the owner's
  surface is sized as a transition carrying an `EventBus` ✓.
- **B3 (§7/§8/§9 consistency).** The 46/38/36 ladder states its condition; `plan.md:11`'s eleven
  `(other)` sites reconcile group-for-group with the baseline (7+4+3+2 = 16 at F2, 11 at baseline);
  `serverCredentials` is escalated with the DI prohibition attached ✓.

### 10 — zero development-world companion violations · VERIFIED

My reproduction reports `0 development known violation(s) at warn` and no development error ✓. The
mechanism at `scripts/lib/crossing-detectors.ts:366-450` requires an **exported top-level function
declaration** in the owning package that inserts ≥2 tables the package both owns and revises, on every
path. `endSessionByCas` is an `update`, so it cannot form one ✓. Two further protections I confirmed
by reading the detector: `taskDispatchAttemptStore` is a `const` object literal, so
`ts.isFunctionDeclaration` skips it and `insertAttempt` cannot create a group; and `run-orchestration`
will own exactly one table. The residual risk the artifact names — re-measure after the relocation, not
only after the registry edit (`architecture.md:541-543`) — is correctly stated as a gate.

---

## NON-BLOCKING DEFECTS

**N1 — `architecture.md:329` undercounts the other terminal-write paths, and one of them is not
rowcount-gated.** The cell says *"the two other terminal-write paths (`transition-run.ts`'s
`endSession`/`crashSession`) already emit inside `run-orchestration`"*. There are **three**:
`transition-run.ts:202` (endSession), `:275` (crashSession), and
`layers/agent-orchestration/run-orchestration/src/runtime-reapers.ts:193-209`, which does
`db.update(sessions).set({state:"crashed", endedAt}).where(eq(sessions.id, session.id))` — **no `active`
predicate** — and emits `session_ended` **unconditionally**, not gated on rowcount. §4.1 lists that site
correctly (`architecture.md:281`), so the artifact contradicts itself. The conclusion *"after the move
every `session_ended` emit in the tree is inside one package"* is still true (all four sites end up in
`run-orchestration`) and this is pre-existing and out of scope per `architecture.md:810`, but the plan
should not read as though the rowcount invariant becomes universal — after AU30 the owner still holds one
un-CAS'd terminal write and one un-gated emit.

**N2 — the `outcome` asymmetry has no evidence that would go red.** `endSessionByCas` writes
`input.outcome ?? derived` to the row but emits the **derived** outcome
(`routes/sessions.ts:183` vs `:207`; correctly reproduced at `architecture.md:311,316-317`). The named
existing test passes `outcome:"success"` and asserts `body.outcome === "success"`
(`sessions.integration.test.ts:246,253`) but never inspects the emitted event's `outcome`, and the new
test's spec (`architecture.md:694-695`) does not require exercising the override. A builder who
"tidied" the two into one value would ship green.

**N3 — `recordPropagationHop`'s stated signature contradicts the function it is said to be.**
`architecture.md:158` declares `hop: { sourceLevel; sourceId; sourceEvent; targetLevel; targetId;
targetTransition: string | null; status: string }` and says *"the owner fills `id`, `attempts: 1`,
`createdAt`, `appliedAt` and `failureReason: null`"*. `architecture.md:160` then says it **is**
`lifecycle-propagation.ts:199-216`'s `logPropagation` made public — but that function's
`LogPropagationEntry` (`:187-197`) also carries `failureReason?` and `attempts?`, and it computes
`appliedAt = entry.status === "applied" ? now : null`, not unconditionally. Its own in-package callers
pass `failureReason` (e.g. `:243-251`). Taken literally the declared shape would break `policy`'s
internal callers (typecheck catches it) or write `appliedAt = now` for a `skipped` row (typecheck does
not). The cascade's only inputs make either reading harmless today; the artifact should say which of the
two contracts the builder is to implement.

**N4 — `AF12-bet-cascade.integration.test.ts` asserts less than "the row".**
`architecture.md:683,759` claims it *"asserts the row"*. It asserts `sourceEvent` and `targetLevel` (via
the `where`), `targetId`, `status` and `targetTransition`, plus the idempotency / no-phantom-row property
(`:237-330`). It does **not** assert `attempts`, `failureReason`, `appliedAt`, `createdAt`,
`sourceLevel` or `sourceId`. The gap is narrow because I verified the two builders field-identical
directly (claim 5), but the evidence sentence is stronger than the test.

**N5 — §3.1 row 8 and §10 disagree about `writeback-processor.ts:338`.** `architecture.md:93` names
`run-orchestration/src/writeback-processor.ts:338` as a production caller of `writeSessionNotes`, which
implies retargeting it. `architecture.md:810-811` says the owner's existing in-package table sites *"are
not touched"*. Both cannot hold. The accessor has a genuine production caller either way (the
`tool-handlers` port wiring), so `plan.md:33` is satisfied regardless — but the builder needs to know
which rule wins.

**N6 — under-specified contracts a builder would otherwise invent.**
- `UserSkillRow` (`architecture.md:131`) does not exist. `@hyperidle/db` exports `type UserSkill`
  (`framework/db/src/schema.ts:1658`, barrel `framework/db/src/index.ts:153`). `SessionRow` is likewise
  `type Session` (`schema.ts:1631`, barrel `:125`), which §3 does define as an alias but §3.2 does not.
  Both are `db:row-type` reaches, correctly (`scripts/lib/db-surfaces.ts:157,193`), so the layer can name
  the return type without a table reach — the mechanism claim holds, only the names are wrong.
- `recordSessionMetadata` takes `effectivenessScore?: string` (`architecture.md:92`) while
  `endSessionByCas` takes `effectivenessScore?: number` (`:302`). Both are verbatim of their own call
  sites (`routes/sessions.ts:352` vs `:188`, both `.toString()` at the route), so this is consistent —
  but two accessors on one table taking different types for one column should be stated, not discovered.
- `listRunSummaries` returns an owner-side `RunSummary[]` while the route keeps
  `satisfies AgentRunsResponse` (`architecture.md:90,107-109`). Structurally fine, but nothing says what
  happens if the two shapes diverge.

**N7 — small factual drifts.** `architecture.md:70` says *"`run-orchestration`'s 31 `sessions` sites"*;
the baseline holds **30** (10 imports, 10 reads, 10 writes). `architecture.md:493` says the
`layer → service (other layer) [import]` group *"holds roughly twenty entries"*; the baseline summary
reads **36 across 24 files**. `architecture.md:495` cites `tool-handlers-bindings.ts:31-32` for the two
existing entries; the imports are at `:30-31` (and `:30` is type-only). None changes an outcome.

---

## FOLLOW-UP / NOTE

**F1 — `insertAttempt` leaves a second ordinal computation inside `work`.**
`layers/core-api/work/src/task-state-machine.ts:115-128` performs the same
`select … → ordinal: existing.length + 1 → insert` by hand, and `architecture.md:388` explicitly leaves
it unrelocated. So the work package removes a hand-mirrored duplicate for `propagationLog` (a stated
virtue, `architecture.md:160-166`) while creating one for `taskDispatchAttempts`. This is correct scope
discipline under `architecture.md:810` (owner in-package sites are not refactored) and under
`plan.md:41`, and I am not asking for it here — but it is worth a note so the next reader does not read
"the ordinal invariant moved into the owner" as meaning there is now one copy of it.

**F2 — the `plan.md:5,13` "one piece of new construction" amendment.** `architecture.md:33-41` carries it
forward correctly and routes it to the human-review gate rather than absorbing it. On the authority
question: `plan.md:23` delegated *"what a sessions service owns, where it lives"* to refinement and
`plan.md:28` told that phase to apply AU26's operational-consumer test *"rather than defaulting to
'whoever touches it most'"* — a test whose whole purpose is to name an existing consumer. Concluding
"no new package" is inside the delegation, not outside it, and the plan correctly declines to decide it
unilaterally. Not a scope violation; a maintainer ruling.

**F3 — one builder, sequential, is the right call.** I agree with `architecture.md:593-617`. Every step
edits `governance/table-owners.json`; commit 8 is a strict join point that requires the whole tree clean;
and step 6 alone is 17 of the 36 sites in three files that all import the same module. The one seam
named (agent-orchestration leaf / core-api leaf) is real — I confirmed the two file sets are
package-disjoint apart from `tool-handlers-bindings.ts` and the registry — but the saving is bounded by
the sessions leaf, which is over half the work and cannot be split. Nothing is being left on the table.

**F4 — owner surfaces are minimal, with one exception worth watching.** Eight `sessions` accessors for
17 sites is proportionate: each corresponds to a distinct query shape, `findSessionById` correctly
absorbs seven get-by-id sites including the authorizer rather than growing a `sessionExists`, and
`architecture.md:135-137` correctly refuses a `userSkills` insert path that has no production caller
(confirmed: `rg -a 'insert(userSkills)'` finds only tests and `tools/eval/src/seeding.ts`). The one
avoidable export is `writeSessionNotes`, whose behaviour is a strict subset of `recordSessionMetadata`'s
patch — `requirements.md:213` treated it as a reuse of #8, the architecture splits it into a ninth symbol.
One extra barrel export in a work package whose direction is removing debt, in a package `plan.md:41`
says may not be shrunk later by this work.

**F5 — the `bets` zod re-export is sound but should be understood for what it is.**
`scripts/lib/db-surfaces.ts:118-133` resolves `createSelectSchema(bets)` to a `db:table` reach
deliberately, *"because allowing the generated schema while forbidding the table would be a hole straight
around the ownership rule"*. Re-exporting it from `@hyperidle/work` clears the finding because the
resolver tracks symbols out of `@hyperidle/db`'s own modules and does not follow a second hop — not
because the reach stopped. That is legitimate (the owner is sanctioning access to its own table's schema,
which is the whole point of ownership) and the artifact's argument that a Zod object carries no Drizzle
table reference is correct. `feasibility.md:270-272` marks the knip/lint behaviour `UNVERIFIED` with a
stated fallback; that is an acceptable reversible local choice.

**F6 — comment edits must not carry the work-package id.** `architecture.md:777-785` directs the builder
to rewrite six production comments. Work-package ids stay inside `.pipeline/**`; only `@lore` tags are
exempt. The artifact does not say so.

---

## What works

- The mechanical model is right where it matters most and is the thing `plan.md` did not know: naming an
  owner **converts a layer-world site from `warn` to a hard `error`**, because
  `layer → db:table (other) [table:read|table:write]` are absent from `governance/rule-severity.json` and
  resolve to `error` (`scripts/governance-lint.ts:229-230`, `governance/README.md:73-76`). Everything in
  §7 follows from that one fact, and it holds.
- The measurements reproduce exactly — 20 errors file-for-file, 107 production warnings, 0 development,
  36 remaining table crossings — and the 100 → 64 → 36 arithmetic closes independently against the
  baseline group summary.
- The cross-owned-read survey is correct and, when re-done by a method the artifact did not use
  (per-file table-symbol import extraction rather than join-grep), still returns zero. `plan.md:31` is
  absolute and is met.
- `plan.md`'s hard contracts are held: no allowlist, no ceiling, no carve-out anywhere in the plan;
  ownership covers reads (`architecture.md:57`, and the reads are where 16 of the 20 errors are); no
  production file imports a development file; `governance/`'s closed six-file set
  (`scripts/rules/no-per-file-allowances.ts:32-39`) is respected — the only edits proposed are the
  contents of `table-owners.json` and deletions from `rule-severity.json`.
- The §6 open decisions are honestly framed. §6.1 in particular is not a preference: I confirmed
  `wire-within-one-layer` forbids cross-layer DI, so there really is no legal same-process alternative.
- §8.2 correctly refuses to present `--attacks` as the proof, and the substitute probe can genuinely go
  red — the same standard the refinement critique demanded, applied without flinching.
- §8.5 reasons about security from the surfaces the change actually reaches (the socket authorizer's
  fail-closed contract, the two `requireBoundary`-guarded PATCH routes, one agent-authored field) rather
  than deferring to an absent rule, and the instruction that an accessor must never grow an auth check is
  the right call.

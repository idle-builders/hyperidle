# AU30 — Feasibility

**Phase:** `/architecture`. Companion to `architecture.md`.
**Worktree:** `/Users/tg/hyperidle/.worktrees/AU30`, branch `backend/AU30-table-ownership`, base
`origin/main` @ `0791c4fd` (AU29 and AU32 already shipped).

**Revision 3 — the founder rulings.** `.pipeline/work/AU30/founder-rulings.md` (2026-08-09) settled all
five open questions. Rulings 1, 2, 3 and 5 confirm probes F2-F4 and change nothing measurable. **Ruling 4
is a scope change** — `user_skills` is deleted rather than owned — and it needed real measurement, not a
recorded decision. Probes **F11-F15** are new in this revision and all of them serve Ruling 4. Revision 2
closed the architecture critique's blocking finding B1 and its non-blocking items N1-N7; probes F8-F10
date from there and are unchanged.

**Method.** Every count below was produced in this worktree by editing a tracked file, running
`npx tsx scripts/governance-lint.ts`, and reverting with `git checkout`. After the last probe
`git status --porcelain` showed only the untracked `.pipeline/work/AU30/` artifacts — no tracked
modification. This revision's probes (F11-F15) were **read-only**: one clean `governance-lint` run plus
`rg` and file reads. Nothing I did not observe directly is asserted; anything inferred is marked
`INFERRED` or `UNVERIFIED`.

---

## 1. Probes run in this phase

### F1 — baseline reproduced

Read from the supplied baseline (`au30-baseline-lint.txt`) rather than re-run:
**191 production violations, 60 files, 23 rule groups; 0 development. Exit PASS** — every one at `warn`.
Consistent with `requirements.md` §2 and with the critique's independent re-measurement.

### F2 — all eight owners assigned

**Question.** What does the tree report with the six unowned tables owned *and* the two stale registry
entries corrected?

**Method.** Wrote into `governance/table-owners.json`: `sessions → run-orchestration`,
`propagationLog → policy`, `taskDispatchAttempts → work`, `userSkills → users`,
`agentRunConfig → agent-run-config`, `teamRunConfigDefaults → agent-run-config`,
`serverCredentials → credentials`, `filesystemCaptures → filesystem-mounting`; `totals` → 45/45/0;
`unowned.tables` → `{}`. Ran `npx tsx scripts/governance-lint.ts`.

**Result.**

```
governance-lint: FAIL — 20 error(s). 3357 tracked files (788 production, 2569 development),
34 packages, 8215 crossings, 19 rules, 107 production + 0 development known violation(s) at warn.
```

Exit code **1**.

- **36 table crossings remain** — 20 `error` + 16 `warn`. Enumerated below.
- **Development world: 0.** No companion violation is created by the registry edit, in this shape.
- Six `(unowned)` keys reported as `NOTE … clean; this rule can go to error`.

**Verdict.** Confirms `requirements.md` §7's 36-site work list exactly, and confirms §5.1's 20 hard
errors file-for-file. This is the third independent reproduction of that number.

**The 20 errors** (`layer → db:table (other) [table:read|table:write]`, absent from
`rule-severity.json` ⇒ `error`):

| file:line | kind | table |
|---|---|---|
| `layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts:98,149,179,206` | read ×4 | `sessions` |
| `layers/agent-orchestration/src/routes/sessions.ts:211,246,250,273,285,316,362` | read ×7 | `sessions` |
| `layers/agent-orchestration/src/services/session-stream-hub.ts:73` | read | `sessions` |
| `layers/agent-orchestration/src/routes/sessions.ts:193,359` | write ×2 | `sessions` |
| `layers/core-api/src/routes/users.ts:241,309,327` | read ×3 | `userSkills` |
| `layers/core-api/src/services/routine-scheduler-bindings.ts:76` | read | `userSkills` |
| `layers/core-api/src/routes/users.ts:321` | write | `userSkills` |
| `layers/core-api/src/service-bootstrap.ts:136` | write | `propagationLog` |

**The 16 warnings:** imports at `agent-orchestration-sessions.ts:25`, `sessions.ts:27`,
`session-stream-hub.ts:36`, `tool-definitions.ts:22`, `handoff-protocol.ts:2`,
`plugin-configuration.ts:2`, `users.ts:2`, `bet.schema.ts:15`, `service-bootstrap.ts:24`,
`routine-scheduler-bindings.ts:20`, `bet-kill-cascade.ts:1` (11); reads at `handoff-protocol.ts:319`,
`plugin-configuration.ts:745` (2); writes at `tool-definitions.ts:592`, `handoff-protocol.ts:322`,
`bet-kill-cascade.ts:134` (3).

### F3 — the two registry corrections clear ten sites

Contained within F2: with `serverCredentials → credentials` and
`filesystemCaptures → filesystem-mounting` applied, **no `serverCredentials` or `filesystemCaptures`
finding appears at all** — the 8 `credentials` sites (`credential-resolver.ts:15,52`;
`credential-store.ts:21,54,59,92,110,119`) and the 2 `filesystem-mounting` sites
(`mounter-registry.ts:17,339`) are gone from the report. Matches `requirements.md` §7's
117 → 109 → 107 ladder.

### F4 — the `tool-handlers` wiring costs exactly one warning

**Question.** What does adding a `@hyperidle/run-orchestration` import to
`layers/core-api/src/services/tool-handlers-bindings.ts` cost?

**Method.** With F2's owners in place, inserted `import { transitionRun } from "@hyperidle/run-orchestration";`
above the existing `@hyperidle/tool-handlers` import. Re-ran the lint.

**Result.** `107 → 108` production warnings; **20 errors unchanged; 0 development unchanged.** The new
finding:

```
WARN [crossing-import] layers/core-api/src/services/tool-handlers-bindings.ts:31:
layer → service (other layer) [import] production — imports @hyperidle/run-orchestration
```

**Verdict.** The cost of §6.4's recommended option is exactly one warning, in a group at `warn`
(`governance/rule-severity.json:16`) that this work package neither clears nor can clear. The file
already carries two entries in that same group at `:31-32`. Reverted.

### F5 — the DI edges themselves cost nothing

**Not re-measured; verified by reading the mechanism and the live baseline.**
`scripts/lib/crossing-detectors.ts:930-935` classifies a `di` crossing by the recipient and provider
packages, never by the file doing the wiring, and the baseline confirms it —
`applications/remote-server/src/create-server.ts:505` is reported as `settings → agent-run-config`, not
as an application crossing. All four new DI pairs are same-layer
(`tool-handlers`/`run-orchestration` in agent-orchestration; `settings`/`users`, `work`/`policy`,
`policy`/`work` in core-api), so `wire-within-one-layer` (`scripts/lib/governance-model.ts:265-289`)
makes them silent. `INFERRED` from the mechanism plus one live confirming instance — the specific new
edges were not written and measured.

### F6 — the `knip` hole

**Not re-run; `requirements.md` §6 measured it and I read the configuration to confirm the mechanism.**

- `package.json:61` — `knip:production` is `npx knip --include files && npx knip --production --include
  files,dependencies,unlisted,binaries --preprocessor ./scripts/knip-production-test-files.mjs`.
  `exports` is **absent** from the `--include` list.
- `knip.json` sets no `includeEntryExports`, so knip does not report exports from an entry file.

Therefore a test-only production **module** is caught (`Unused files (1)`, as measured in refinement) and
a test-only **barrel export** is caught by neither lane. Confirmed by reading both files.

### F7 — no production insert on `userSkills`

`rg -a 'insert(userSkills)'` across `layers/`, `applications/`, `framework/` with tests excluded returns
nothing. Every insert in the repo is a test or `tools/eval/src/seeding.ts:609`. In production the table
is update-and-read only.

### F8 — the baseline re-run in this phase, and the two counts the critique disputed

**Question.** `architecture.md` (revision 0) claimed `run-orchestration` holds 31 `sessions` sites and
that `layer → service (other layer) [import]` holds "roughly twenty entries". The critique said 30 and
36-across-24. Who is right?

**Method.** Ran `npx tsx scripts/governance-lint.ts` on the clean worktree in this phase (revision 0 read
the numbers from the supplied baseline file rather than re-running).

**Result.**

```
governance-lint: PASS — 3360 tracked files (788 production, 2572 development), 34 packages,
8215 crossings, 19 rules, 191 production + 0 development known violation(s) at warn.
```

Exit code **0**. Reproduces F1 exactly.

- **`run-orchestration` × `sessions`: 30 findings, not 31.** Counted from the report
  (`rg 'run-orchestration/src' | rg 'sessions' | wc -l` → 30). The critique is right and revision 0 was
  wrong. The correction propagates: it is 30 in `architecture.md` §3 and §10. The 100 → 64 → 36
  arithmetic closes on 30, not on 31.
- **`layer → service (other layer) [import]`: 36 production entries across 24 files**, from the group
  summary block. "Roughly twenty" was wrong; corrected in `architecture.md` §6.4. The direction of the
  §6.4 conclusion is unchanged and is in fact strengthened — the group is larger than stated and this
  work package clears none of it, so one more entry is proportionally smaller than revision 0 implied.
- **The `tool-handlers-bindings.ts` line cite: revision 0 was right, the critique was wrong.** The two
  existing entries are at `:31` and `:32`, both `@hyperidle/tool-handlers` — confirmed both in the lint
  report and by reading the file: `:31` is `import type { ToolHandlersPorts } …`, `:32` is
  `import { buildToolDefinitions } …`. `:30` is the closing `} from "@hyperidle/api-contract";` of a
  four-name type import that begins at `:26`, and it is reported in a different group. The critique's
  substantive observation — that one of the two is type-only — is correct and now stated in §6.4; only
  its line numbers were off by one. F4's probe reported the *new* import at `:31` because inserting a
  line above `:31` shifted the two existing entries to `:32`/`:33`.

### F9 — the ordinal has no evidence anywhere in the repo · the critique's B1 confirmed

**Question.** Does anything assert `task_dispatch_attempts.ordinal`?

**Method + result.** `rg -a` across the whole tree, `.md` excluded:

- `layers/core-api/src/__tests__/handoff-to.integration.test.ts` — **zero** hits for `ordinal`, **zero**
  for `taskDispatchAttempt`. The file never names the table. Revision 0's claim that it "asserts the
  ordinal" (§8.3 row 9, §8.6 row 3) was **false**, and it was false about the one relocation in this work
  package that is not a verbatim move. Corrected in `architecture.md` §8.3.1.
- Repo-wide, `ordinal` appears in **five** test files and in every one it is a seeded fixture value, not
  an assertion: `layers/core-api/work/src/__tests__/task-run-resolver.integration.test.ts:130`,
  `layers/core-api/src/services/__tests__/work-session-end-reactions.integration.test.ts:178`,
  `layers/core-api/src/services/__tests__/agent-run-admission-failed-subscribers.integration.test.ts:183`,
  `layers/core-api/src/services/__tests__/context-bundle-sandbox-byte-parity.integration.test.ts:103`,
  `layers/core-api/src/__tests__/retention-reaper.integration.test.ts:107`. (The critique found three;
  there are five. Same conclusion.)
- No production read either. Outside `framework/db/src/schema.ts:512,522` and the migration
  `drizzle/0047_AU9_durable_custody.sql`, the only occurrences are the two computations themselves:
  `layers/core-api/policy/src/handoff-protocol.ts:328` and
  `layers/core-api/work/src/task-state-machine.ts:125`.

**What `handoff-to.integration.test.ts` does cover, read to confirm.** The insert's *arguments* are
covered transitively: `deps.taskRunResolver.resolve(tx, attemptId)` at `handoff-protocol.ts:337` calls
`resolveTaskRunRequest`, which throws `TaskRunSourceUnavailableError` when the attempt is missing or not
`"requested"`, when the task is missing or not in `ready`/`accepted`/`in_progress`, or when
`task.ownerAgentId !== attempt.agentId` (`layers/core-api/work/src/task-run-resolver.ts:178-192`). A throw
inside the `tx` rolls the handoff back and fails `expect(result.success).toBe(true)`
(`handoff-to.integration.test.ts:169`). Nothing anywhere reads `ordinal`, so it is invisible to that
chain. **Verdict: the critique is right; a new owner-side test file is required.** Specified in
`architecture.md` §8.3.2 (test 2) with its mutation-red table in §8.3.3.

### F10 — the new test's home is viable

`layers/core-api/work` is a registered vitest project (`vitest.config.ts:34`) and already holds five
`*.integration.test.ts` files. `task-run-resolver.integration.test.ts` is the shape to follow: it imports
`describe, expect, test` from `@hyperidle/db/test-fixtures`, receives `{ db }` per test, and seeds
`taskDispatchAttempts` rows directly. `taskDispatchAttemptStore`'s four existing methods all take
`exec: WriteExecutor` (`framework/db/src/write-executor.ts:29` — the union of `HyperIdleDb` and a `tx`
handle), so a test can pass either `db` or a `tx` from `db.transaction(...)` without any new fixture.
`layers/agent-orchestration/run-orchestration` is likewise a registered project holding ~20
`*.integration.test.ts` files on the `{ db, eventBus }` shape — the home for test 1.

### F11 — Ruling 4 clears **13** production findings, not 9 · measured

**Question.** How many governance findings does deleting `user_skills` actually remove, and does it
create any?

**Method.** Ran `npx tsx scripts/governance-lint.ts` on the clean worktree and read the full report, then
traced every file the deletion touches back to the report.

**Result.** The clean run reproduces the baseline exactly:

```
governance-lint: PASS — 3361 tracked files (788 production, 2573 development), 34 packages,
8215 crossings, 19 rules, 191 production + 0 development known violation(s) at warn.
```

`rg 'userSkills' <report>` returns **exactly 9** findings, no more, no fewer:

| file:line | kind |
|---|---|
| `layers/core-api/settings/src/plugin-configuration.ts:2` | `service → db:table (unowned) [import]` |
| `layers/core-api/settings/src/plugin-configuration.ts:745` | `service → db:table (unowned) [table:read]` |
| `layers/core-api/src/routes/users.ts:2` | `layer → db:table (unowned) [import]` |
| `layers/core-api/src/routes/users.ts:241,309,327` | `layer → db:table (unowned) [table:read]` ×3 |
| `layers/core-api/src/routes/users.ts:321` | `layer → db:table (unowned) [table:write]` |
| `layers/core-api/src/services/routine-scheduler-bindings.ts:20` | `layer → db:table (unowned) [import]` |
| `layers/core-api/src/services/routine-scheduler-bindings.ts:76` | `layer → db:table (unowned) [table:read]` |

**Four more come from the cascade** (`architecture.md` §11.5.3), and they are the part a count of
`userSkills` findings misses:

| file:line | kind | why it goes |
|---|---|---|
| `routine-scheduler-bindings.ts:18` | `layer → service (other layer) [import]` — `@hyperidle/agent-run-config` | `readAgentRunConfig` is used **only** at `:61`, inside `concurrencyBoundReader`, which the cascade deletes |
| `routine-scheduler-bindings.ts:39` | `layer → service (other layer) [import]` — `@hyperidle/run-orchestration` | `isAgentAtCapacity` is used **only** at `:153` and `:159`, both in the deleted `agentSelection` literal |
| `run-orchestration/src/concurrency.ts:33` | `service → db:table (unowned) [import]` — `sessions` | the file is deleted |
| `run-orchestration/src/concurrency.ts:67` | `service → db:table (unowned) [table:read]` — `from(sessions)` | same |

**Total: 13.** `191 → 178`.

**Nothing new appears.** I checked the full baseline finding list for all three call-site files: apart
from the nine above, `routes/users.ts` carries one finding (`:1`, `@hyperidle/agent-run-config`, which
survives — `writeAgentRunConfig` is still used by `orgUsers`), `routine-scheduler-bindings.ts` carries
`:18`, `:39`, `:40` (`:40`, `@hyperidle/session-requests`, survives), and
`settings/src/plugin-configuration.ts` carries nothing else. The other imports the deletion removes from
`routes/users.ts` — `@hyperidle/work`, `@hyperidle/conversation`, `drizzle-orm` — produce **no** finding
at baseline (same-layer or non-crossing), so removing them changes nothing either way.

**Consequences for the arithmetic.**

- Two of the 13 (`routine-scheduler-bindings.ts:18,39`) sit in the **non-table** residue, so they change
  the *final* number: `91 → 89`, and the end state is `89 + 1` (Ruling 5) = **90**, against the 92 this
  plan projected before the rulings.
- `layer → service (other layer) [import]` goes **36 → 35** across the whole work package — Ruling 5's
  one net-new entry is more than absorbed by Ruling 4's two deletions.
- Five of the 13 are the `userSkills` **errors** F2 measured under the all-owners-assigned state. That
  state's `20 errors` becomes **15**, and its `107 warnings` becomes `107 − 4 − 2 = 101`. Both ladders
  close on the same final 90.

### F12 — the migration is hand-authored; `db:generate` output is not usable

**Question.** How is a drop migration produced and ordered in this repo?

**Method + result.** Read `framework/db/drizzle.config.ts`, `framework/db/drizzle/meta/_journal.json`, and
the three most recent destructive migrations.

- The journal declares `postgresql`, **56 entries** (`idx` 0-55), spaced 3 600 000 ms apart in `when`.
  `0055_AU26_agent_run_config` is the tail.
- `drizzle/meta/` holds snapshots only up to `0042_snapshot.json`. **Everything from `0043` on is
  hand-authored SQL tracked by the journal alone.** `0054_AU21_cost_hard_delete.sql`'s own header says
  so: *"`drizzle-kit generate` against the stale 0042 snapshot re-detects every 0043-0053 change as new,
  so its output is NOT usable verbatim here"*. `0049` and `0053` carry the same note.
- The whole-table-drop precedent is `0049_AU18_drop_factory_settings.sql`, whose entire body after a
  ~28-line data-preservation header is `DROP TABLE "factory_settings";`.

**Verdict.** `npm run db:generate` must **not** be used for this. Hand-author
`0056_drop_user_skills.sql` and append one journal entry. `UNVERIFIED` only in one respect: I did not
run the migrator, because that would modify a tracked file. §11.7 states how the build proves it —
every service integration test runs the real migrator over `framework/db/drizzle`
(`framework/db/src/__testing__/test-pool.ts:41,55`, `__testing__/test-utils.ts:45,92`).

### F13 — the delegation path really is unreachable in production · confirmed four ways

**Question.** The research brief asserted this. I was told to verify it independently.

**Method + result.** Four separate reads, each of which alone would sink the claim if it failed:

1. `rg 'skillId' layers/core-api/routine/src/routine-scheduler.ts` → the only production writer of
   `routines.skill_id` is the builtin-routine seeder at `:201-213`, and the **same object literal** sets
   `delegationAllowed: false` at `:213`. Four specs, `:137,148,159,170`.
2. `createRoutineSchema` (`layers/core-api/src/routes/routines-routes.ts:48-56`) declares
   `id, name, description, teamId, ownerAgentId, triggerType, triggerConfig`. It is a **non-strict** zod
   object, so an unknown `skillId` or `delegationAllowed` is silently stripped rather than rejected —
   which matters, because it means no error would ever surface to tell you the field was ignored.
   `updateRoutineSchema` (`:58-67`) declares `active, triggerConfig, autonomyLevel, silent, state, name,
   description`.
3. The agent-facing seam is no wider: `InsertRoutineRequest`
   (`framework/api-contract/src/core-api-port.ts:457-465`) and `UpdateRoutineRequest` (`:483-491`) carry
   the same field sets, and `create_routine`'s handler goes through them
   (`tool-handlers-bindings.ts:167-168`, `widenInsertRoutineInput` at `:75-77` being a plain cast).
4. `rg 'delegationAllowed' --glob '!*.md' --glob '!**/__tests__/**'` over the whole tree → every write is
   `false`: `routine-scheduler.ts:213`, `tools/setup/src/demo-fixture.ts:201`,
   `schema.ts:630` (`.default(false)`), plus stories and an e2e fixture. `routines-routes.ts:265` is a
   **read** into a response body.

**Verdict.** `routine.delegationAllowed && routine.skillId` (`routine-service.ts:367`) is never true in
production. The tests and eval scenarios that exercise it (`delegation.ts:149,263`) do so by inserting
the routine row directly, bypassing every schema above. **The brief's claim is confirmed.**

### F14 — the two endpoints have no declared contract and no caller

**Method + result.**

- `rg 'skills' framework/api-contract/src` → **no match.** No contract type, no seam method, no
  `CoreApiPort` surface names them, so `GET /api/users/:id`'s `skills` key is undeclared anywhere.
- `rg '/api/users' layers/core-ui/src applications --glob '!**/__e2e__/**'` → three real call sites:
  `SettingsProfile.tsx:67` (`PATCH /api/users/:id`), `SettingsAgents.tsx:253`
  (`PATCH /api/users/:userId/assistant`), `SetupFlow.tsx:267` (`POST /api/users`). **No client performs
  `GET /api/users/:id`, and none performs the skills `PATCH`.**
- `layers/core-ui/src/pages/AgentProfile.tsx` mentions "skills" only in its file-header prose; it renders
  `/api/agents/:id/profile`, which has never exposed them —
  `AD4-agent-profile.integration.test.ts:270-271` asserts exactly that and needs no change.

**Verdict.** Deleting both endpoints is observable by nothing that ships.

### F15 — `concurrency.ts` is orphaned by the cascade, and it says so itself

**Question.** How far does removing `listAgentIdsBySkill` actually reach?

**Method + result.** `rg 'isAgentAtCapacity|ConcurrencyBoundReader|concurrencyBoundReader'` over the whole
tree.

- Production consumers: **only** `layers/core-api/src/services/routine-scheduler-bindings.ts:39,153,159` —
  and `:153`/`:159` are both inside the `agentSelection` literal the cascade deletes.
- `layers/agent-orchestration/run-orchestration/src/concurrency.ts` exports exactly two symbols
  (`ConcurrencyBoundReader` at `:50`, `isAgentAtCapacity` at `:58`) and nothing else.
- The module's own header (`:1-9`) states its single purpose verbatim: *"This is the ONE canonical
  implementation `routine`'s delegation decision (`@hyperidle/routine`'s `agent-delegation.ts`) is
  injected"*, and `:11-18` explains that `provisioner.ts`'s Phase-3 admission gate is a **materially
  different** check deliberately left untouched.
- Remaining references are three `__tests__` files that wire it for the scheduler ports, plus its own
  `__tests__/concurrency.integration.test.ts`.

**Verdict.** After the cascade the file has zero production callers, and **no lane would catch it**:
`knip --include files` sees a file still reachable from `run-orchestration`'s barrel, and neither knip
lane reports entry-file exports (F6). Deleting it is a decision, not a detection. It takes
`run-orchestration` from **30 `sessions` sites to 28** and §5.1's "10 reads" to 9 — corrected in
`architecture.md` §3, §5.1, §10.

### F16 — the drop's red demonstration did not exist, and the failure it must catch escapes everything

**Question.** The critique's B1: can removing `"user_skills"` from the expected table lists actually go
red?

**Method + result.** Read all three assertions in full.

- `framework/db/src/__tests__/migration.integration.test.ts:28-50`,
  `pg-migration.integration.test.ts:34-58`, `schema.integration.test.ts:37-57` are every one
  `expect(tableNames).toEqual(expect.arrayContaining([… "user_skills" …]))`. **Inclusion, not equality** —
  extras pass. Removing a name from the expected array is a no-op in both directions.
- `migration.integration.test.ts:56` is `expect(tableNames.length).toBeGreaterThanOrEqual(15)` — a floor.
  `pg-migration.integration.test.ts:64` is the same at 19.
- **The assertion that bites is already in all three files**, from the `factory_settings` drop (`0049`):
  `expect(tableNames).not.toContain("factory_settings")` at `migration:55`, `pg-migration:63`,
  `schema:63`.
- The failure that escapes everything else is a missing or mis-tagged `_journal.json` entry: the migrator
  resolves by journal `tag` (`framework/db/src/__testing__/test-pool.ts:55`), `npm run check` reads only
  source, and governance-lint's `liveTables` is parsed out of `schema.ts` **source**
  (`scripts/lib/db-surfaces.ts:88`) and never from a database. Nothing else in `verify` reads the actual
  post-migration table list.
- All three files run in `test:integration:service` (per-merge verify's lane) and none is gated on an
  external Postgres — `pg-migration.integration.test.ts:1-9` builds its own PGlite database via
  `createTestDb()` and additionally asserts the chain is idempotent.

**Verdict.** The critique is right and revision 3 was wrong. The red is
`expect(tableNames).not.toContain("user_skills")`, added beside the `factory_settings` line in **all
three** files and run **before** the migration exists. The expected-list edit is still required, but it
is the green side. `architecture.md` §11.7 mechanism 3 and §11.9 rewritten. **`UNVERIFIED` in one
respect:** I did not execute the lane, because writing the assertions would modify tracked files in a
planning phase. The direction is proven by the `factory_settings` precedent doing exactly this today.

### F17 — the cascade-reached test files, enumerated by symbol rather than by name

**Question.** The critique's B2 named three unlisted files. Are there more? Enumerating by "files
containing `userSkills`" cannot find them — that is the mistake that produced the gap.

**Method + result.** Enumerated by every symbol the deletion removes, not by the table's name.

- `rg -al 'userSkills|user_skills' layers/ framework/ tools/ applications/` → 49 files, of which
  **16 are test files**; the rest are 3 `framework/db/src` sources, 3 production call sites, 2 cascade
  sources, 3 eval sources, and 22 migration-archive files (`framework/db/drizzle/**` plus
  `framework/db/drizzle-sqlite-archive/0018_P2_rename_agents_to_users.sql`).
- `rg -ln 'UserSkill'` adds `framework/db/src/__tests__/zod-schemas.test.ts` (`:44`, `:144-146`) and
  `tools/eval/src/scenarios/delegation.ts` — the first is new work, the second was already listed.
- `rg -ln 'isAgentAtCapacity|ConcurrencyBoundReader|selectRoutineDelegate|AgentDelegationDeps'` → 11
  files, all already listed.
- `rg -ln 'agentSelection'` → 14 files. Three are **not** hits:
  `layers/core-api/src/services/durable-agent-queue.ts:16-17`,
  `layers/agent-orchestration/tool-handlers/src/ports.ts:54-56` and
  `…/__tests__/core-api-port-increment2-org-routine-handoff.integration.test.ts:44` all name the
  *scaffold* `agentSelection` (`resolveScaffoldSpecs`), removed by an earlier work package, in past-tense
  comments. Two are new work:
  `layers/core-api/routine/src/__tests__/routine-run-resolver.integration.test.ts` and
  `layers/core-api/routine/src/__tests__/routine-scheduler-completeness.integration.test.ts:71-74`.
- A filename sweep for the deleted files outside the code roots
  (`rg -ln 'agent-delegation|concurrency\.ts|skill-autonomy'`) returns `eslint.config.ts` (F19),
  `scripts/typecheck-gate.ts:499-503` (a `@lore` annotating a list of package **directories** — comment
  only) and archive docs.

**Verdict.** Exactly **four** cascade-reached test files, no fifth:
`concurrency.integration.test.ts` (already listed), `routine-run-resolver.integration.test.ts`,
`routine-scheduler-completeness.integration.test.ts`, `zod-schemas.test.ts`. Twenty test files in total.
`routine-run-resolver.integration.test.ts` holds **fourteen** cases (`grep -c '\ttest('` → 14; the
critique said fifteen, which changes no disposition): six delegation cases go, eight stay, and both
helpers are reshaped. Per-case table in `architecture.md` §11.9.

### F18 — `seedAgentSkill` has eleven callers, and all eleven rows are inert

**Question.** The critique's B3 — revision 3 claimed zero callers.

**Method + result.** `rg -an 'seedAgentSkill'` → the definition at
`layers/core-api/src/__tests__/policy-engine.integration.test.ts:240` and **eleven** calls at
`:341, :355, :382, :401, :416, :436, :476, :497, :527, :552, :577`, plus a referencing comment at `:369`.
**The claim was false.** The `@deprecated AD4` banner says the *rows* no longer drive policy decisions; it
never said the helper was uncalled.

Whether deleting the eleven lines costs coverage, checked two ways rather than spot-checked:

1. `rg -n 'userSkills' layers/core-api/src --glob '!**/__tests__/**'` → only `routes/users.ts` and
   `services/routine-scheduler-bindings.ts`. **Nothing in the policy path reads the table**, so the
   seeded `autonomyLevel` reaches no decision.
2. The file contains its own control: `AC4: no agentSkills defaults to L1 -> push` (`:367-378`) seeds no
   row and expects the identical single push as `AC3` (`:339`, L2) and `AC4` (`:353`, L1).

I read all eleven enclosing cases. Six expect a push the seed does not cause (`:341, :355, :382, :401,
:436, :552`); four expect a queue the seed does not prevent (`:416, :476, :497, :527`); `:577` expects a
high-risk push through silence mode.

**Verdict.** Delete the helper, all eleven call lines, four stale trailing comments, the orphaned comment
at `:369` and the `userSkills` import. **No assertion changes and no test is deleted.** One title
(`:367`) names a table that will not exist and is restated. `architecture.md` §11.9 records the
per-call-site disposition; the file moves from the "deleted cases" group to "fixture-line edits only".

### F19 — deleting `agent-delegation.ts` leaves a zero-match ESLint block

**Question.** The critique's B4.

**Method + result.** Read `eslint.config.ts:778-836`.

- `:806-833` is a flat-config object whose `files` array is exactly
  `["layers/core-api/routine/src/agent-delegation.ts"]` (`:813`), carrying the two AK7 AC2
  `no-restricted-syntax` rules (`:822`, `:827`). After the deletion it matches zero files and reports
  clean forever — `CLAUDE.md` § Monorepo names that failure mode explicitly.
- `:791-796` (the AK7 header) and `:798-805` (a `@lore`) exist only to explain that block. The `@lore`
  records this repo hitting the identical failure once before, with the AC1 half of the same guard, and
  the correction taken: *"Deleted rather than repointed — there is no successor file performing that
  selection, so there is nothing left to police."* The same applies verbatim.
- `rg -ln 'AK7'` → only `eslint.config.ts` and archive docs, so no other block enforces AK7 AC2 and none
  is affected. The rule's two targets were `work`'s `agent-assignment.ts` (already deleted) and this one.
- **A pre-existing splice sets the deletion range.** The AK7 comment sits *inside* the preceding AJ3
  preview-harness comment: `:778-790` breaks off mid-sentence at *"…so it must re-state the full"* and
  resumes at `:835` (*"server+db ban itself rather than relying on any earlier block."*) above the block
  it describes (`:836`). Deleting `:791-834` rejoins that sentence — which is also the builder's check
  that the range was right.

**Verdict.** Delete `eslint.config.ts:791-834`, no replacement comment (the lesson is already the
repo-wide rule in `CLAUDE.md` § Monorepo). Added to `architecture.md` §11.2, §9's comment table, and
§10 as a pinned non-goal so no other lint rule moves. **`UNVERIFIED`:** I did not run `npm run lint`
after the deletion, because that requires deleting tracked source. The change removes an `error`-severity
block that matches nothing, so it cannot introduce a finding.

### F20 — the registry validator checks one of the three totals

**Question.** The critique's N4. §7.2 tracks a `44/39/5 → 44/44/0` ladder — how much of it is machine-checked?

**Method + result.** Read `validateTableOwners` (`scripts/lib/governance-registry.ts:117-150`) end to end.
It checks `missing`, `phantom`, owner-is-a-real-package, a ≥20-character reason per unowned entry, and
`registry.totals.tables !== liveTables.size` (`:147-149`). **`totals.owned` and `totals.unowned` are never
read.**

**Verdict.** Only the leading figure of each rung is enforced; the other two are hand-kept bookkeeping.
Stated in `architecture.md` §11.7 mechanism 2 so the builder keeps them honest deliberately rather than
assuming a check will catch a slip. No change of plan — the ladder is still right, it is just not
self-policing.

---

## 2. What I verified live in the source

Each of these was read, not inferred.

| claim | evidence |
|---|---|
| the terminal CAS + emit sit in the layer route, not the owner | `layers/agent-orchestration/src/routes/sessions.ts:192-196` (the `update … where(and(eq(id), eq(state,"active"))).returning({id})`) and `:199-209` (the gated emit) |
| the owner already holds an identically-shaped CAS | `run-orchestration/src/transition-run.ts:363-380`, `updateSessionRow` — same `where`, same `.returning({id})`, narrower field set |
| the owner already emits `session_ended` | `transition-run.ts`'s `endSession`/`crashSession`, reached through `transitionRun` at `:340-352` |
| the layer already imports its own service's accessors | `routes/sessions.ts:28` imports `findSessionRequest`, `sessionRunRegistry` from `@hyperidle/session-requests` |
| the layer already depends on the owner | `layers/agent-orchestration/package.json` declares `@hyperidle/run-orchestration` |
| all 12 layer-world `sessions` reads are single-table | read each of `routes/sessions.ts:211,246,250,273,285,316,362`, `routes/agent-orchestration-sessions.ts:98,149,179,206`, `session-stream-hub.ts:73`. The activity route composes with an in-process buffer (`routes/sessions.ts:290`), not a second table |
| `run-orchestration`'s own 10 reads are single-table | `rg 'leftJoin\|innerJoin\|rightJoin\|fullJoin' run-orchestration/src/*.ts` → no matches |
| `routes/sessions.ts:273` is a plain get-by-id, not a distinct shape | `:270-277` — inside `if (start.status === "admitted" && start.sessionId)`, a `where(eq(sessions.id, start.sessionId)).limit(1)` |
| `RUN_SUMMARY_COLUMNS` names `sessions.*` and must move with its accessor | `routes/agent-orchestration-sessions.ts:227-236` |
| the socket authorizer is fail-closed on a missing row | `session-stream-hub.ts:70-75` returns `row !== undefined` |
| the tool context is built **inside the owner**, with a precedent for an injected capability | `run-orchestration/src/provisioner.ts:1182-1201`; `onAbortSession` baked at `:1195`; the field is declared on `framework/shared/src/tool.ts:65` |
| `ToolHandlersPorts` has exactly one wiring site | `layers/core-api/src/services/tool-handlers-bindings.ts` builds `toolHandlersPorts` and `allToolDefinitions` at module scope (`:198-201`) |
| `handoff-protocol`'s two `taskDispatchAttempts` statements are inside the caller's `tx`, alongside a `work` port call | `handoff-protocol.ts:311-337` — `deps.work.updateTaskById(tx, …)` at `:311`, the read at `:317-320`, the insert at `:322`, `deps.taskRunResolver.resolve(tx, attemptId)` at `:337` |
| the handoff read exists only to compute the ordinal | `:320` → `ordinal: existing.length + 1` at `:329` |
| `work` already exposes `exec: WriteExecutor`-shaped dispatch-attempt methods | `work-service.ts:60-115` — `get`, `updateIfActive`, `markFailed`, `reapTerminal` |
| `BetKillCascadeDeps` already carries a cross-service port wired at `routes/bets.ts` | `bet-kill-cascade.ts:16-24` (`runOrchestration.requestRunStopForTasks`) and its `@lore AU26 H2` |
| `bet-kill-cascade`'s row builder is a hand-maintained duplicate of `policy`'s | `bet-kill-cascade.ts:120-123` says so; the two builders are field-identical for the cascade's inputs (`policy`'s at `lifecycle-propagation.ts:199-216`) |
| `PolicyDeps` is built in the core-api layer, which already imports `@hyperidle/work` | `service-bootstrap.ts:217` (`const policyDeps: PolicyDeps`), `:47` (`import * as work from "@hyperidle/work"`) |
| `settings` already has a narrow `users` read port | `settings/src/ports.ts:9-11` — `SettingsUserDirectory.listUsersByKind` |
| the settings backfill is wired at the application root, which already imports `@hyperidle/users` | `applications/remote-server/src/create-server.ts:497`, `:104` |
| `routine` deliberately does not own the `userSkills` read today | `routine-scheduler-bindings.ts:67-72` — "this composition root keeps the read here so `selectRoutineDelegate`'s `listAgentIdsBySkill` port stays an injected Mechanism-C capability" |
| `hintProgress` is the per-user-attribute precedent for `users` ownership | `governance/table-owners.json:48`; accessors in `layers/core-api/users/src/hint-progress.ts` |
| a zod select schema is a table reach, deliberately | `scripts/lib/db-surfaces.ts:118-133` — "`createSelectSchema(bets)` is a reach into `bets`. Allowing the generated schema while forbidding the table would be a hole straight around the ownership rule." |
| `bet.schema.ts:15` is the only `@hyperidle/db/zod-schemas` consumer outside `framework/db` | `rg 'from "@hyperidle/db/zod-schemas"'` over `layers/`, `applications/`, `framework/` excluding tests → one hit |
| `@hyperidle/db/zod-schemas` is a declared subpath export | `framework/db/package.json:8` |
| a core-api layer file naming a core-api service is silent | `service-bootstrap.ts:47` imports `@hyperidle/work` with no finding in the baseline |
| `filesystem-mounting`'s own barrel already claims ownership of `filesystem_captures` | `layers/agent-orchestration/filesystem-mounting/src/index.ts:2-20`, recorded as founder-approved AU26 F1 |
| `filesystemCaptures` is write-only in production | `rg 'filesystemCaptures'` over `layers/` excluding tests → `mounter-registry.ts:17` (import) and `:339` (insert). No read |
| `filesystemCaptures` carries FKs to **both** `filesystems` and `sessions` | `framework/db/src/schema.ts:1284-1291` |
| `connections` never touches `serverCredentials`, and its comment says so | `connections/src/index.ts:7-9` (false present-tense sanction) and `:16-18` ("genuinely stays core-side") |
| `credentials`' barrel claims the table | `layers/core-api/credentials/src/index.ts:1-19` |
| the two joins near this work stay inside one owner | `plugin-configuration.ts:524-525` (`settings` tables only); `filesystem-registry.ts:41` (`filesystems` tables only) |
| ten table keys sit in `rule-severity.json`; two more are absent | `governance/rule-severity.json:10-13,20-25` — 23 keys total, of which 10 are table keys |
| `--attacks` is severity-blind by construction | `scripts/governance-lint.ts:155-160` — `severityOf: () => "error"` |
| severity resolution is `?? "error"` | `scripts/governance-lint.ts:229-230` |
| the tests named in the evidence plan exist at their cited paths | `sessions.integration.test.ts:182-340` (`AC11: PATCH`), `P2-user-routes.integration.test.ts:166,214`, `write-session-notes.integration.test.ts:130-139`, `retention-reaper.integration.test.ts` (imports `reapPropagationLog`), `AF12-bet-cascade.integration.test.ts`, `handoff-to.integration.test.ts`, `two-app-mount-session-routes.integration.test.ts`, `AC1-session-effectiveness.integration.test.ts`, `session-stream-hub.integration.test.ts` |
| **but one of them does not cover what revision 0 said it covered** | `handoff-to.integration.test.ts` — F9. Corrected |
| `@hyperidle/db`'s row types are named `Session` and `UserSkill`, not `SessionRow`/`UserSkillRow` | `framework/db/src/schema.ts:1631,1658`; barrel `framework/db/src/index.ts:125,153`. Revision 0 invented both names |
| `AF12-bet-cascade.integration.test.ts` asserts five fields plus idempotency, not "the row" | `:248-256` and `:269-280` (`sourceEvent` + `targetLevel` via the `where`, `targetId`, `status`, `targetTransition`); `:298-318` (`toHaveLength(1)` twice). No assertion on `attempts`, `failureReason`, `appliedAt`, `createdAt`, `sourceLevel`, `sourceId` for the cascade rows |
| `logPropagation`'s parameter interface carries `failureReason?` and `attempts?`, and `appliedAt` is conditional | `lifecycle-propagation.ts:187-197` (`LogPropagationEntry`) and `:199-216`; `appliedAt: entry.status === "applied" ? now : null` at `:215`; an in-package caller passing `failureReason` at `:243-251` |
| there is a **third** other terminal-write path, and it holds neither half of the invariant | `run-orchestration/src/runtime-reapers.ts:193` — `db.update(sessions).set({state:"crashed", endedAt}).where(eq(sessions.id, session.id))`, no `active` predicate — and `:198-209`, an unconditional `session_ended` emit. Pre-existing, inside the owner, out of scope |
| `writeback-processor.ts:338` is an in-package `run-orchestration` write, so it does not move | `writeback-processor.ts:334-339` — `handleSessionNotes` does `config.db.update(sessions).set({ notes: body })`. Legal by the registry line alone |
| the DB write takes the `outcome` override while the event carries the derived value | `routes/sessions.ts:179` (derived), `:183` (`outcome: input.outcome ?? outcome` — the row), `:207` (`outcome` — the event) |
| `layers/core-api/work` is a registered vitest project with existing integration tests | `vitest.config.ts:34`; five `*.integration.test.ts` files under `layers/core-api/work/src/__tests__/` |
| `WriteExecutor` accepts either `HyperIdleDb` or a `tx` handle, so a test can drive `insertAttempt` on both | `framework/db/src/write-executor.ts:29` |
| `ToolContext` is constructed in ~30 test files | `rg -l 'ToolContext'` over `layers/`, `framework/`, `applications/`, `tools/` — one production constructor (`provisioner.ts`), one production widener (`run-orchestration-composition.ts:137`), the rest tests |
| **Ruling 4 · `user_skills` is `agent_skills` renamed** | `framework/db/drizzle/0013_P2_rename_agents_to_users.sql:11-15` — `ALTER TABLE "agent_skills" RENAME TO "user_skills"` directly after the `agents`→`users` rename, then `RENAME COLUMN "agent_id" TO "user_id"` |
| **no production insert on `userSkills`, and no insert zod schema** | `rg -a 'insert\(userSkills\)'` → 11 files: 10 `*.test.ts` + `tools/eval/src/seeding.ts:609`. Zero in `layers/`/`framework/`/`applications/` outside `__tests__`. `zod-schemas.ts:58` declares only `selectUserSkillSchema` |
| the table has **no inbound FK**, so the drop touches nothing else | `rg 'userSkills\.' framework/db/src/schema.ts` → only `:1658-1659`, the two `$infer*` type lines. Its own FK (`:833-835`) is outbound to `users` with `onDelete: "restrict"` and dies with the table |
| the registry rejects both halves of a half-done deletion | `scripts/lib/governance-registry.ts:124-130` (`missing`), `:132-135` (`phantom`), `:147-149` (`totals.tables !== liveTables.size`) |
| the `unowned` **block** cannot be deleted when its map empties | `governance-registry.ts:22` declares `unowned` required; `:141` iterates `registry.unowned.tables` unconditionally. An earlier draft of §9 said the block is deleted — corrected |
| `selectRoutineDelegate`'s only input is the skill | `agent-delegation.ts:30-40` — `input: { skillId, excludeAgentId }`, first statement `await deps.listAgentIdsBySkill(db, input.skillId)`. There is no other candidate source |
| deleting the delegation branch orphans `agentSelection` entirely | `routine-service.ts:366` — the `isAtCapacity` call is the *condition* of the `if` whose only body is the delegation branch at `:367-378`. `rg 'agentSelection'` finds the field only at `routine-service.ts:287`, `ports.ts:127`, `routine-scheduler.ts:607` and the bindings literal |
| `"skill"` is enforced by two DB CHECK constraints | `framework/db/src/schema.ts:1388` (`plugin_configuration_defaults_kind_ck`), `:1415` (`configuration_overrides_kind_ck`) — both enumerate the seven `ConfigurationKind` members in SQL |
| the Settings category union is **separate** from `ConfigurationKind`, but coupled by a total map | `framework/shared/src/agent-behavior-config.ts:85-92` — six members (`mcp`, not `mcp_server`; no `harness_descriptor`); `layers/core-api/src/routes/agent-behavior-config-impl.ts:56` declares `Record<ConfigurationKind, AgentBehaviorConfigKind>`, total over the *seven*-member enum |
| the Settings "Skills" tile is already permanently empty | `SettingsAgentBehavior.tsx:28-35` renders from a static label map, `:218-228` shows `counts.get(kind) ?? 0`; the only producer of `kind: "skill"` rows is the seed at `plugin-configuration.ts:745`, over a table with no production insert |
| `routine-sessions.ts` does **not** seed skills | `rg 'seedUserSkill' tools/eval` → `skill-autonomy.ts` (3 calls) and `delegation.ts` (4). `routine-sessions.ts:65,175,257` pass `skillId` to `seedRoutine`, i.e. `routines.skill_id` |
| `delegation.ts`'s judges never read `userSkills` | read all five judges (`:170,186,284,300,378`); the file's own note at `:328` says "fire-time no longer evaluates delegation at all" |
| `judgeUserSkillLevel` is already dead | `rg 'judgeUserSkillLevel' tools/eval` → the declaration at `judges.ts:609` and nothing else |
| `policy-engine.integration.test.ts`'s `seedAgentSkill` is already dead | `rg 'seedAgentSkill'` in that file → the declaration at `:238` and nothing else. Its own comment says it is `@deprecated AD4 … Kept only for tests that verify userSkills rows are still accepted by the DB schema` |
| `autonomy_change` and `skill_change` keep an independent producer | `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:424-433` — both are members of `ITEM_KINDS`, the `create_item` tool's kind enum. `policy-engine.ts:121` routes `skill_change`; nothing routes `autonomy_change` |
| every integration test builds its DB from the real migration chain | `framework/db/src/__testing__/test-pool.ts:41,55`; `__testing__/test-utils.ts:45,92` — `migrate(db, { migrationsFolder })` over `framework/db/drizzle` |
| the two migration tests assert the post-migration table list by name | `migration.integration.test.ts:30-34`, `pg-migration.integration.test.ts:36-40` — both contain the literal `"user_skills"` |

---

## 3. Did revision 1 close the three blocking findings?

**Yes, all three. I re-checked each against the artifact and the tree.**

### B1 — AC #4's proof · **CLOSED**

`requirements.md:366-392` now states plainly that `--attacks` "is not [the honest proof], and the critique
is right", cites `scripts/governance-lint.ts:155-160` for why (`severityOf: () => "error"`), records that
it passes on the pristine tree today with all ten keys still at `warn`, and relocates it to what it does
prove — that the detector still recognises the crossing. The enforcement is stated as key absence with
the resolution cited (`:229-230`), and the artifact carries a **demonstrated red**: the same violation
reported `WARN` / exit 0 with the keys present and `ERROR` / `FAIL — 8 error(s)` / exit 1 with them
deleted. §6 row 4 no longer mentions `--attacks`. Nothing left open.

### B2 — the terminal-writer sizing · **CLOSED**

`requirements.md:121-132` restates the claim with the qualifier the code carries ("for a running session"
/ "for a session it is actively running", citing `routes/sessions.ts:79-80` and `:327-328`), names the
`otherwise` branch as real code in the layer at `:192-196` plus the conditional emit at `:199-210`, and
concludes that the invariant is "**already split** between the layer and `run-orchestration` today". §3.3
reason 2 is rewritten accordingly. Critically, the consequence the critique asked for is present:
`requirements.md:197-225` (§3.4) sizes the owner's surface as **six read shapes, one non-terminal
metadata write, and one state transition that owns an event**, and says explicitly that surface #7
"carries an event bus dependency, not just a `db` handle" and that "the rowcount invariant … moves with
it or it is lost". I verified every line cite in that section against the source; they are correct.

### B3 — §7/§8/§9 consistency · **CLOSED**

All three sub-problems are fixed. (1) §7 now states one delta with its condition attached — a three-row
ladder (46 / 38 / 36) naming which registry correction each row assumes, and "the work list below is the
36-site case, i.e. it assumes both corrections". (2) `plan.md:11` is cited where the eleven `(other)`
sites are discussed (`requirements.md:425-430`), and the scope is correctly declared settled by the plan
with only the *means* open. (3) `serverCredentials` is now §9 item 1, with both candidate resolutions and
the cross-layer-DI prohibition (`governance-model.ts:265-289`) that makes one of them illegal. §8's
preamble now separates one amendment (§8.1) from findings (§8.2-§8.5).

The four non-blocking defects are also addressed: N1 gets §6 row 8 with the measured knip hole; N2 gets
§5.2 with the measured wiring price; N3 — §4 now defers `userSkills` to §9 rather than contradicting it;
N4/N5/N6 — the file count is restated as 17 with the filter named, and 117 is reported with "the run
exits FAIL" attached in §3.3 and §7.

---

## 4a. Corrections this revision makes to `architecture.md` revision 0

Recorded plainly rather than silently patched. One was blocking.

1. **BLOCKING — `handoff-to.integration.test.ts` does not assert the ordinal** (§8.3 row 9, §8.6 row 3).
   It never names the table. F9. Replaced by a new owner-side test file with a mutation-red table
   (`architecture.md` §8.3.1-§8.3.3). The plan now commits to **two** new test files, not one.
2. **`SessionRow` / `UserSkillRow` do not exist.** The real exports are `Session` and `UserSkill`.
   Corrected everywhere; the `db:row-type`-not-`db:table` mechanism is unaffected.
3. **`recordPropagationHop`'s declared signature contradicted the function it claims to be.** It is
   `logPropagation` with its existing `LogPropagationEntry` parameter unchanged, including
   `failureReason?`, `attempts?` and a **conditional** `appliedAt`.
4. **`AF12-bet-cascade.integration.test.ts` asserts less than "the row".** The exact field list is now
   stated, and the residue is attributed to the move being verbatim rather than to the test.
5. **§4.3 said "the two other terminal-write paths"; there are three.** `runtime-reapers.ts:193-209`
   holds neither the `active` predicate nor a rowcount gate. §4.3 now states the precise post-condition:
   every terminal write and every `session_ended` emit ends up inside the owner — **not** that every one
   of them is CAS-guarded.
6. **§3.1 row 8 contradicted §10 about `writeback-processor.ts:338`.** §10 wins; it is an in-package
   owner site and is not retargeted.
7. **`run-orchestration` holds 30 `sessions` sites, not 31**, and
   `layer → service (other layer) [import]` holds 36 across 24 files, not "roughly twenty". F8.
8. **The `outcome` asymmetry had no evidence that could go red.** Now assertion 4 of new test 1, with a
   mutation red in each direction.
9. **The comment rewrites in §9 carried no instruction about work-package ids.** Added: no comment this
   pull request writes may carry one; `@lore` is the only exception.
10. **Contested, and left as revision 0 had it:** the critique's N7 claim that
    `tool-handlers-bindings.ts`' two existing group entries are at `:30-31` and that `:30` is type-only.
    They are at `:31` and `:32`. F8. Its underlying point (one of the two is a type-only import) is
    correct and is now stated.

## 4b. Corrections this revision makes

Recorded plainly rather than silently patched. Three are corrections to the research brief that seeded
Ruling 4's execution, not to the ruling.

1. **The deletion clears 13 findings, not 9.** The four extra are the cascade's:
   `routine-scheduler-bindings.ts:18,39` and `concurrency.ts:33,67` (F11). Two of them are non-table, so
   the *final* production-warning count moves 92 → **90**, and
   `layer → service (other layer) [import]` ends at **35**, below its 36 baseline, even after Ruling 5
   adds one.
2. **`tools/eval/src/scenarios/routine-sessions.ts` does not seed skills.** The ruling lists it among the
   three scenarios that must be reworked or removed; `rg 'seedUserSkill' tools/eval` shows only
   `skill-autonomy.ts` and `delegation.ts`. Its `skillId` arguments set `routines.skill_id`, a different
   column on a table that stays. It needs no change for the deletion (§11.8).
3. **`skill_change`'s routing is NOT dead, and the four docs describing it are NOT false.** The brief
   said otherwise. `skill_change` is a member of `ITEM_KINDS`, the `create_item` tool's kind enum
   (`tool-definitions.ts:427`), so an agent can still produce one and `policy-engine.ts:121` still routes
   it to push. The same holds for `autonomy_change` (`:432`). Nothing in the item-routing surface becomes
   dead, and `architecture.md` §11.4 says so rather than deleting a live enum member.
4. **Ten test files insert into the table, not twelve; thirteen touch it.** `rg 'insert\(userSkills\)'`
   → 10 test files plus `tools/eval/src/seeding.ts`. Three more read it without inserting
   (`routine-scheduler-baked-emit`, `routine-scheduler-relocation`,
   `agent-run-admission-failed-routine-run-migration`). Two further test files are reached only by the
   cascade (`agent-delegation.test.ts`, `concurrency.integration.test.ts`). The exact per-file verdicts
   are `architecture.md` §11.9.
5. **The `unowned` block is not deleted when its map empties.** `architecture.md` §9 (revision 2) said
   `unowned.note` is "deleted with the block". `TableOwners` declares `unowned` required
   (`governance-registry.ts:22`) and `validateTableOwners` iterates `registry.unowned.tables`
   unconditionally (`:141`), so the block stays with `tables: {}` and a rewritten note. Corrected in
   §2's AC table, §9 and §11.10.
6. **`run-orchestration` holds 28 `sessions` sites after this work package, not 30.** The cascade deletes
   `concurrency.ts` and its two (F15). Corrected in `architecture.md` §3, §5.1 and §10. F8's measurement
   of 30 on the pristine tree stands and is not retracted — the number changes because the code changes.
7. **The migration must not be generated.** Revision 2 said "no schema change, no migration" and
   therefore said nothing about how one is produced. `npm run db:generate` output is unusable against the
   stale `0042` snapshot chain (F12); the file is hand-authored and journal-tracked, and its name carries
   no work-package id even though `0043`-`0055` all do.
8. **Three of §3's fourteen accessors are not written.** §8.4's "fourteen accessors, fourteen named
   callers" becomes **eleven**; `@hyperidle/users` grows nothing at all.

**This revision (4) — the amendment critique's four blockers, all additive. No decision moved.**

9. **BLOCKING — the drop's red demonstration could not go red.** Revision 3 told the builder that
   removing `"user_skills"` from the expected table lists fails while the table is present. All three
   lists are `expect.arrayContaining`, so the edit is a no-op in both directions, and the failure that
   actually matters — a missing or mis-tagged `_journal.json` entry — is caught by nothing in `verify`
   (F16). Replaced by `expect(tableNames).not.toContain("user_skills")` in **three** files, added before
   the migration is written. §11.7 mechanism 3 and §11.9.
10. **BLOCKING — three cascade-reached test files were missing from the "exact list."**
    `routine-run-resolver.integration.test.ts` (six of fourteen cases deleted, both helpers reshaped),
    `routine-scheduler-completeness.integration.test.ts:71-74`, `zod-schemas.test.ts:44,144-146` (F17).
    The first is the dedicated test file for the very function whose branch is deleted, and it was the
    largest gap in the plan. Counts corrected: **16** test files name the table, not thirteen; **four**
    are cascade-reached, not two; **twenty** in total, all enumerated.
11. **BLOCKING — `seedAgentSkill` has eleven callers, not zero.** Revision 3's "zero callers — verified"
    was false and would have stranded a builder on eleven broken tests with no instruction (F18). Every
    call site now carries a disposition; nothing is improvised.
12. **BLOCKING — deleting `agent-delegation.ts` leaves a zero-match ESLint block.** `eslint.config.ts`
    appeared in no list in the plan (F19). Added to §11.2 (with the deletion range and the sentence-repair
    check), §9's comment table, and §10 as a pinned non-goal.
13. **§11.6's enum-coupling argument was false.** `agent-behavior-config-impl.ts:55-57` is already
    `Partial<Record<ConfigurationKind, AgentBehaviorConfigKind>>` — deliberately, because
    `harness_descriptor` has no UI counterpart — so nothing pins the UI union. **The conclusion is
    unchanged** (keep `"skill"`, delete only the seed): it rests on the two CHECK constraints and on the
    ruling naming the slot as a live destination, and on the screen being byte-identical either way.
    The reasoning in §11.6 is rewritten, the answer is not.
14. **§11.7 mechanism 1's "no way to be partially done" over-claimed.** `check` proves the *symbol* is
    gone. Thirteen of `routine-run-resolver`'s fourteen cases pass deps through `buildDeps(...)`, a call
    expression with no excess-property check, so six would compile and fail at runtime; `check` flags the
    file only via the one fresh literal at `:496-501`, and those runtime failures appear only in
    `test:integration:service`. The claim is now scoped, and the file list carries the cascade.
15. **`totals.owned` / `totals.unowned` are not validated** (F20). Only `totals.tables` is compared to the
    live schema. Stated in §11.7 mechanism 2.
16. **The post-commit sweep excluded one migration archive too few.** Revision 3's
    `rg -a 'userSkills|user_skills' --glob '!framework/db/drizzle/**'` would still match
    `framework/db/drizzle-sqlite-archive/0018_P2_rename_agents_to_users.sql`. Both archives are now
    excluded and the sweep is scoped to the four code roots. Found while checking F17, not raised by the
    critique.
17. **`routine-run-resolver.integration.test.ts` holds fourteen cases, not fifteen.** The critique said
    fifteen; `grep -c '\ttest('` returns 14. Recorded because the file's per-case table must add up; it
    changes no disposition.

---

## 4. Corrections to `requirements.md` made by this phase

None changes an outcome; recorded so the reviewer can trace them.

1. **`requirements.md` §3.4 lists nine surfaces; there are eight.** Surfaces #1 and #2 are the same
   accessor — `routes/sessions.ts:273` is a plain get-by-id (`:270-277`), not a distinct shape. Read to
   confirm.
2. **§9 item 2's stated reason for correcting `filesystemCaptures` does not hold.** It argues "under
   AU26's own test the mounting engine is the operational consumer". The engine is the sole *writer* and
   the row is **never read in production**, so AU26's test points nowhere. `architecture.md` §6.2 reaches
   the same recommendation on different evidence — the package's own barrel already records the
   founder-approved AU26 F1 split — and states the genuine counter-argument (`filesystemCaptures` is the
   symmetric twin of `filesystemInjections`, which `filesystems` owns, and it carries FKs to both).
3. **§9 item 3's question is answered "no".** `routine`'s `listAgentIdsBySkill` is *not* the only read
   that matters — `settings/plugin-configuration.ts:745` and `routes/users.ts:241` are two more
   independent consumers. That strengthens rather than weakens `users` as a pure record owner, because
   with three consumers there is no consumer locus to defer to.
4. **§7's `bets` row calls `bet.schema.ts:15` a table import; it is a zod-schema import** resolved to a
   table reach by `scripts/lib/db-surfaces.ts:118-133`. The distinction matters because it decides the
   remedy (`architecture.md` §3.7).

---

## 5. What would invalidate this plan

Ranked by how likely each is to bite.

**The two risks that topped this list in revision 2 are gone.** The `sessions` owner and the
`serverCredentials` correction were the two decisions that could have changed the shape of the work;
Rulings 1 and 3 settle both. What remains is ranked below, and the deletion introduces three new entries
at the top.

1. **The `user_skills` drop runs against a database that is not empty.** F7 and F11 establish that no
   production insert path exists, so a database built by any shipped code has the table empty. The
   residual case is a self-hosted instance seeded by a build predating AD4's removal — and those rows are
   the dead autonomy score sheet the product decision discarded. **`UNVERIFIED` by construction**: I
   cannot inspect somebody else's database. It belongs in the migration header, not hidden.
2. **The delegation cascade reaches further than a reviewer expects.** F13 proves the branch is
   unreachable and F15 proves `concurrency.ts` is orphaned by removing it, but the chain runs
   `listAgentIdsBySkill → selectRoutineDelegate → agentSelection.selectAgent → the whole port →
   isAgentAtCapacity → concurrency.ts`, crossing from `core-api` into `agent-orchestration`. Every link is
   forced by the previous one (`architecture.md` §11.5.3) and none is an opportunistic cleanup — but it is
   the one place in this work package where a deletion propagates across a layer boundary, and it deserves
   the reviewer's attention rather than a skim.
3. **The eval rework is a product decision wearing a test-hygiene costume.** Evals need real LLM calls and
   deleting one removes coverage no unit test replaces. §11.8 argues each affected scenario separately and
   carries `ska-l4-silent` over rather than losing its uncovered negative. If the founder disagrees with
   the carry-over, that is a one-line change; if the founder disagrees with deleting `ska-success-tracking`,
   that would reopen Ruling 4 itself, since the scenario's only subject is the score sheet.
4. **A companion violation appears after the relocation, not after the registry edit** (§6.6). Measured
   at **0** for the registry edit in this shape; **unmeasured for the finished relocation**, because the
   code has not moved. The mechanism (`crossing-detectors.ts:362-451`) requires an exported function
   declaration that unconditionally inserts two or more owned-and-revised tables, and §4's
   `endSessionByCas` is an **update**, so I judge the risk low — but it is genuinely unmeasured, every
   development rule is at `error`, and any such violation must clear in this same pull request.
5. **A `(other)` group key I have not enumerated holds a site outside this work package's scope.** I read
   the full F2 report and every remaining table crossing is on the 36-site list; but the ten keys leave
   `rule-severity.json` for the *whole repo*, so a site landing on `main` between now and the merge would
   re-open a key. Mitigation: commit 8 runs last, on a freshly rebased tree.
6. **A mutation in §8.3.3's table does not actually go red.** The table is derived, not executed — I did
   not write the accessors or the tests in this phase, so every row is `UNVERIFIED` as an observation
   even though each is mechanically implied by the assertion beside it. If a mutation runs green, the
   assertion is not load-bearing and the test is not evidence: the correct response is to strengthen the
   assertion, never to drop the mutation from the record. The builder records the observed red output in
   the pull request.
7. **An existing integration test needs an assertion change.** The evidence plan's contract is
   import-path edits only, with exactly **two** sanctioned exceptions, both in §11.7 and both because the
   assertion's subject changed: three **additions** of
   `expect(tableNames).not.toContain("user_skills")` (`migration.integration.test.ts:55`,
   `pg-migration.integration.test.ts:63`, `schema.integration.test.ts:63`) — the drop's red — and the
   removal of `"user_skills"` from the three expected table lists, which is required for green and proves
   nothing on its own (F16). If any *relocation* forces an assertion edit, the relocation is not
   behaviour-preserving and the design of that accessor is wrong — the correct response is to change the
   accessor, not the test.
8. **`@hyperidle/work` re-exporting `betRowSchema` trips a knip or lint rule I did not probe.** Not
   measured. `UNVERIFIED`. The fallback is to declare the schema shape locally in `work` rather than
   re-export it; both satisfy the ownership rule.
9. **`framework/db`'s `selectBetSchema` becomes reachable only through `work`.** No knip lane reports
   entry-file exports (F6), so this should be inert, but the symbol should be left in place rather than
   deleted — deleting it is a separate judgement about a family of sibling exports.
10. **The `_journal.json` entry is written wrong and the drop silently does not happen.** Promoted to the
    list by F16: with no journal entry, a wrong `idx`, or a `tag` that does not match the filename, the
    migrator skips the file, `check` passes, governance-lint passes (it parses `schema.ts` source, never a
    database), and every other integration test passes. The three `not.toContain` assertions are the only
    thing standing between that and a green `verify` with the table still live in every database. If the
    builder writes them last, or skips the pre-migration red run, this risk is uncovered.
11. **The six deleted `routine-run-resolver` delegation cases are dropped from a file the compiler barely
    flags.** `npm run check` reports one error there (the fresh deps literal at `:496-501`), not six, and
    the runtime failures appear only in `test:integration:service` — a lane `npm run test` excludes. The
    per-case table in §11.9 is the control; if a builder edits that file by chasing compile errors alone,
    it will be edited wrong.

---

## 6. Worktree state

**Revision 4's probes (F16-F20) modified nothing either.** They are `rg`, `grep -n`, `grep -c` and file
reads over `eslint.config.ts`, the three migration integration tests, `policy-engine.integration.test.ts`,
`routine-run-resolver.integration.test.ts`, `routine-scheduler-completeness.integration.test.ts`,
`zod-schemas.test.ts`, `agent-behavior-config-impl.ts` and `scripts/lib/governance-registry.ts`. No
tracked file was opened for writing, so none needed reverting; `git status --porcelain` still lists only
untracked `.pipeline/work/AU30/` artefacts.

**Revision 3's probes (F11-F15) modified nothing.** They are one `npx tsx scripts/governance-lint.ts`
run on the clean tree (which writes no file), plus `rg` and file reads. No tracked file was edited in
this revision, so none needed reverting.

`git status --porcelain`:

```
?? .pipeline/work/AU30/architecture-critique.md
?? .pipeline/work/AU30/architecture.md
?? .pipeline/work/AU30/feasibility.md
?? .pipeline/work/AU30/progress.json
?? .pipeline/work/AU30/requirements-critique.md
?? .pipeline/work/AU30/requirements.md
```

No tracked file is modified. `governance/table-owners.json` and
`layers/core-api/src/services/tool-handlers-bindings.ts` were reverted with `git checkout` after
revision 2's probes and have not been touched since. `founder-rulings.md` is the founder's file and was
read only. Nothing was committed. **No production code, no test, no migration and no eval scenario was
written in this phase** — every artefact of the deletion is a plan, not a diff.

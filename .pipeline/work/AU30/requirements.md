# AU30 — Requirements

**Phase:** requirement clarification (`/refine`). **Authority:** `.pipeline/work/AU30/plan.md`.
Nothing here adds an outcome. Where the live tree contradicts `plan.md`, it is recorded under
[§8 Findings against `plan.md`](#8-findings-against-planmd) and left for the maintainer.

**DOC-CLASS: none** — the ownership facts live in `governance/table-owners.json`, and
`governance/README.md:5-6` forbids restating any governance rule in `docs/`, `CLAUDE.md` or a code
comment. A second copy is the failure mode this project already ruled against.

**Revision 1.** Three blocking findings from `requirements-critique.md` are closed here: AC #4's proof
(§6), the terminal-writer claim and the owner's true surface (§3.2, §3.3, §3.4), and the §7/§8/§9
inconsistency (§7, §8, §9). Two of the critique's own claims did not survive re-measurement and are
corrected in §8.4 with evidence.

---

## 1. Value and intended impact

Today "who is allowed to change this data" is answerable for 39 of 45 tables and unanswerable for six.
That is not a style gap. An unowned table is one where any package may invent its own invariants and no
package is responsible for keeping them, and `sessions` — the product's own **Session** primitive — is
the largest of the six.

The second cost is enforcement. The table rules aggregate across every table, so a single unowned table
holds ten rule keys at `warn`. A rule at `warn` warns for **every** violation including new ones
(`governance/README.md:78-80`), so until the last table is owned nothing stops fresh table debt landing.
The system is 87% enforced and reviewers stop checking the part they assume holds.

When this ships: `governance/table-owners.json` has an empty `unowned` block, every production read and
write reaches its table through the owning service, and the table rules bite in both directions.

---

## 2. What exists today — measured, not remembered

Live governance-lint over this worktree (`origin/main` @ `0791c4fd`, AU29 and AU32 already shipped):
**191 production violations across 60 files in 23 rule groups; 0 development violations.** The run
exits **PASS** — every one of the 191 is at `warn`.

**100 of the 191 are table crossings** — 89 against the six unowned tables, 11 against tables whose
registry owner already exists.

| table | import | read | write | total | who touches it |
|---|---|---|---|---|---|
| `sessions` | 14 | 22 | 13 | **49** | `run-orchestration` (10 files), the `agent-orchestration` layer itself (3 files), `tool-handlers` (1) |
| `propagationLog` | 4 | 1 | 8 | **13** | `policy` (9 sites / 3 files), the `core-api` layer (2), `work` (2) |
| `taskDispatchAttempts` | 3 | 3 | 5 | **11** | `work` (8 sites / 2 files), `policy` (3) |
| `userSkills` | 3 | 5 | 1 | **9** | the `core-api` layer (7 sites / 2 files), `settings` (2) |
| `agentRunConfig` | 1 | 2 | 1 | **4** | `agent-run-config` only |
| `teamRunConfigDefaults` | 1 | 1 | 1 | **3** | `agent-run-config` only |

The other 11 are `db:table (other)`: `core-api/credentials` → `serverCredentials` (8 sites, 2 files),
`agent-orchestration/filesystem-mounting` → `filesystemCaptures` (2 sites, 1 file), and
`layers/core-api/src/schemas/bet.schema.ts:15` importing the `bets` zod schema (1 site). These eleven
are **in scope by `plan.md:11`**, which enumerates them exactly — see §7.

### 2.1 Ten table rule keys are at `warn`, and two are already at `error`

`governance/rule-severity.json:10-25` holds **ten** table keys, not six:

```
layer   → db:table (other)   [import]                     service → db:table (other)   [import|table:read|table:write]
layer   → db:table (unowned) [import|table:read|table:write]   service → db:table (unowned) [import|table:read|table:write]
```

`layer → db:table (other) [table:read]` and `[table:write]` are **absent from the file, therefore at
`error`** (`governance/README.md:74-76`; resolution is `severity.severity[ruleKey] ?? "error"`,
`scripts/governance-lint.ts:229-230`). This is the single most load-bearing mechanical fact in this
work package and `plan.md` does not mention it — see §5.1.

---

## 3. The load-bearing noun: `sessions`

### 3.1 What it is — resolved, not assumed

`sessions` **is** the product primitive **Session**: "A single agent's bounded run"
(`docs/process-layer/the-five-primitives.md:91-93`), "one bounded run by one agent"
(`docs/process-layer/tasks-and-sessions.md:29`). The schema matches — `agentId` notNull, nullable
`taskId` for task-free runs, `state`, `startedAt`/`endedAt`, `outcome`, `notes`, `effectivenessScore`
(`framework/db/src/schema.ts:241-296`).

**Rejected interpretations, each ruled out against the tree:**

- *A login/auth session.* No — that is `loginSessions`, a separate table already owned by `users`
  (`governance/table-owners.json:23`).
- *A request record.* No — that is `agentSessionRequests`, owned by `session-requests`
  (`framework/db/src/schema.ts:298`, `governance/table-owners.json:42`). A request is the durable
  intake artifact; a session is the run that a request is admitted into. They are 1:1 at admission
  (`sessions.requestId` carries a unique index, `schema.ts:290`) but distinct lifecycles: a request can
  be `failed` with no session at all, and `create-bare-run.ts` creates a session with no request.
- *A harness process.* No — the process is `sessionRunRegistry`, in-memory and abort-only
  (`layers/agent-orchestration/session-requests/src/session-run-registry.ts`). The table survives the
  process; the registry does not.

**The layer question is already settled and is not reopened here.** No package outside
`agent-orchestration` reads or writes `sessions` in production — all 14 importing files are in that
layer. `core-api` reads the row through `AgentOrchestrationPort.sessions.getById`, an HTTP door
(`layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts:86-105`;
`layers/core-api/src/routes/sessions-routes.ts:53-63`), and gets its three session **writes** by
calling down into `run-orchestration` (`createBareRun`, `endRunForHandoff`, `requestRunStopForTasks` —
`layers/agent-orchestration/run-orchestration/src/index.ts:40,41,50`). The open question is only
*which service inside `agent-orchestration`*.

### 3.2 Applying AU26's test

> Does anyone operationally consume this for their own purpose, or only administer it?

| toucher | verdict | evidence |
|---|---|---|
| `run-orchestration` | **operational consumer** — it *is* the session state machine | capacity gate reads active sessions (`concurrency.ts:67`); boot recovery reads running sessions (`start-runtime.ts:22`); it performs the terminal write on every path where a runtime is live — `end-run-for-handoff.ts:40` (`done`), `runtime-reapers.ts:193` (`crashed`), `transition-run.ts:371`, `request-run-stop-for-tasks.ts:55`, `start-runtime.ts:37` |
| the `agent-orchestration` layer's own routes | **administers / exposes — and holds one real state transition** | list, detail, activity, run-history reads for the UI (`routes/sessions.ts`, `routes/agent-orchestration-sessions.ts:116-133`); **plus** the no-live-runtime terminal CAS and its `session_ended` emit (`routes/sessions.ts:150-212`) — see below |
| `services/session-stream-hub.ts` | **administers** — one existence check to authorize a socket subscription (`session-stream-hub.ts:70-75`, inside the authorizer at `:62-77`) |
| `tool-handlers` | **agent-authored content** — one `notes` update from the `write_session_notes` tool (`tool-definitions.ts:592-594`) |
| `session-requests` | **does not touch it at all** — zero production sites |

The test points at `run-orchestration` and at nothing else. It is the only toucher that reads the row to
decide its own behaviour.

**The "sole terminal-state writer" claim, with the qualifier the code actually carries.** The source
does not say `run-orchestration` is the sole terminal writer. It says the runtime is the sole
terminal-state writer **for a running session** (`routes/sessions.ts:79-80`) / **"for a session it is
actively running"** (`routes/sessions.ts:327-328`). The route spells out the other branch itself: if a
live runtime entry exists it aborts and lets teardown do the terminal write, **otherwise** it does a
CAS-guarded direct write (`active` → terminal only) and emits `session_ended` iff the CAS affected a
row. That "otherwise" is real code in the layer, not in `run-orchestration`:
`routes/sessions.ts:192-196` is the `update(sessions) … where(and(eq(id), eq(state,"active")))
.returning({id})`, and `:199-210` is the conditional emit.

So the invariant is **already split** between the layer and `run-orchestration` today. That is a
consequence for sizing, not a reason to move the owner — see §3.3 reason 2 and §3.4.

### 3.3 Design it twice

Two shapes are genuinely available. Both were **measured** by writing the candidate owners into
`governance/table-owners.json` and running `npx tsx scripts/governance-lint.ts` (reverted afterwards;
`git status` shows no tracked modification).

**Shape A — `run-orchestration` owns `sessions`.** The service that runs a session owns the row that
records it. The layer's own routes import accessors from it (legal: `reach-your-own-contents`,
`scripts/lib/governance-model.ts:315-317`, and already the established shape — `routes/sessions.ts:28`
imports `findSessionRequest` straight out of `session-requests`). `tool-handlers` gets one new DI port
method, which is Mechanism C, the pattern that package already runs on
(`layers/agent-orchestration/tool-handlers/src/ports.ts`).

- Measured: production warnings **191 → 117** on the registry edit alone — but the run **exits FAIL,
  20 error(s)** (exit code 1). 117 is not a green intermediate state; see §5.1.
- All 31 `run-orchestration` sites become legal with **zero code change**.
- Remaining `sessions` work: 17 layer-world sites + 2 `tool-handlers` sites.
- Cost: `@hyperidle/run-orchestration`'s public barrel grows by roughly six to eight session
  accessors, and a package whose exports include `startRuntime` and `mountFilesystemsForAgent` becomes
  the door a read-only UI route knocks on.

**Shape B — a new `sessions` service owns the record; `run-orchestration` becomes a consumer.** This
mirrors `session-requests` exactly: a thin record service, with the runtime reaching it through
`RuntimePorts` (`run-orchestration` already receives `ports.sessionRequests` this way —
`start-runtime.ts:17`, and carries `@hyperidle/session-requests` as a **devDependency only**,
`run-orchestration/package.json:22`). It keeps the runtime's public face small and gives the row a home
that reads as a record rather than an engine.

- Measured (owner set to a service other than `run-orchestration`): production warnings **191 → 147**,
  same **20 error(s)**, same FAIL. Exactly **30 additional production sites** — 10 imports, 10 reads,
  10 writes, all inside `run-orchestration`.
- Every one of those 30 must be rerouted through an **injected port**, not an import: a service may
  never name a sibling service (`scripts/lib/governance-model.ts:154-164` — "Two services of the same
  layer are siblings, not contents"; restated in `tool-handlers/src/ports.ts:38-40`).
- It adds a package to the tree, which `plan.md:26` flags as human-review-load-bearing.

**Recommendation: Shape A — `run-orchestration` owns `sessions`.**

Three reasons, in order of weight:

1. **AU26's test answers it outright.** `run-orchestration` operationally consumes the row for its own
   purpose; no other candidate consumes it at all. Shape B would place the record with a service that
   has no reason of its own to read it — the exact failure the test exists to prevent.
2. **Shape A is the only shape under which the split terminal write can close.** The invariant is
   already split (§3.2): `run-orchestration` writes the terminal state on every live-runtime path, and
   the layer route writes it on the no-live-runtime path (`routes/sessions.ts:192-196` + emit
   `:199-210`). Under Shape A the layer imports the owner's transition directly
   (`reach-your-own-contents`) and the split closes. Under Shape B a port is interposed between the
   layer's terminal write and the row, which institutionalises the split rather than closing it.
3. **30 extra relocations, all of them indirection.** Shape B's cost is measured, not estimated, and it
   buys a smaller barrel on `run-orchestration` — which is **AU20's axis, explicitly out of scope here**
   (`plan.md:41`).

**What would overturn this.** If the maintainer's intent is that `run-orchestration` be dissolved or
split (its barrel already spans runtime, provisioning, filesystem mounting and file watching), Shape B
is the better landing ground and the recommendation should be revisited at `/architecture`. Nothing in
`.pipeline/AU.md` registers such a work package today.

**Note on `plan.md`'s expectation.** `plan.md:13` states "A service that owns `sessions` does not exist
and has to be created — that is the one piece of new construction here." The evidence says an existing
service is the honest owner. **This work package then contains no new package at all**, which removes
its only piece of new construction and materially reduces its risk. Recorded in §8.1.

### 3.4 What the owner's surface actually is — the sizing `/architecture` inherits

Under Shape A the relocated surface is **not** read accessors plus a note setter. It is six read shapes,
one non-terminal metadata write, and **one state transition that owns an event**. All 17 layer-world
sites and 2 `tool-handlers` sites are accounted for:

| # | surface | drawn from | note |
|---|---|---|---|
| 1 | get by id | `routes/sessions.ts:211,285,316,362`; `routes/agent-orchestration-sessions.ts:98`; `services/session-stream-hub.ts:73` | one accessor serves six call sites, including the socket authorizer's existence check |
| 2 | get by id, for an admitted explicit start | `routes/sessions.ts:273` | same shape as #1; listed separately only because the caller may pass a null start |
| 3 | list, filtered by agent / task / state, with limit+offset | `routes/sessions.ts:246,250` | |
| 4 | active run counts grouped by agent | `routes/agent-orchestration-sessions.ts:149` | `count()` + `groupBy` — an aggregate, not a row read |
| 5 | latest outcome per task id, newest first | `routes/agent-orchestration-sessions.ts:179` | |
| 6 | run summaries by task id or agent id list, newest first | `routes/agent-orchestration-sessions.ts:206` | projects `RUN_SUMMARY_COLUMNS` |
| 7 | **terminal transition:** CAS `active` → terminal, plus the `session_ended` emit iff the CAS affected a row | `routes/sessions.ts:192-196` + `:199-210` | **the largest piece of behaviour this work package relocates.** It carries an event bus dependency, not just a `db` handle. The rowcount invariant (§4.3 of the cited contract) moves with it or it is lost. |
| 8 | non-terminal metadata write (`outcome`, `notes`, `effectivenessScore` + recorded-at/by) | `routes/sessions.ts:359` | never ends a session (`routes/sessions.ts:346`) |
| 9 | notes write for the `write_session_notes` tool | `tool-handlers/src/tool-definitions.ts:592-594` | reuses #8; the owner **already has this write** at `run-orchestration/src/writeback-processor.ts:338`, so this is a port over an existing accessor, not a new one |

**Two consequences for `/architecture`.**

- Surface #7 is a state transition, so "prove the relocated accessor behaves identically" for it means
  proving the CAS still refuses a non-`active` row and that `session_ended` is emitted exactly once —
  not that a getter returns the same row.
- **Every one of the 12 layer reads is single-table.** I read each: `routes/sessions.ts:246-250`,
  `:273-280`, `:285`, `:316-322`, `:362`; `routes/agent-orchestration-sessions.ts:96-100`, `:149-159`,
  `:179-186`, `:206-215`; `session-stream-hub.ts:70-75`. None joins `sessions` to another table, so
  AC #3's "no cross-owned-table query in production" is not at risk from the `sessions` reads. The
  activity route composes the session row with an **in-process buffer**, not a second table
  (`routes/sessions.ts:285-300`).

---

## 4. Owner for the other five — four recorded, one open

`plan.md:23` scopes refinement to `sessions` alone. Four of these are recorded with evidence and are not
open domain questions. **`userSkills` is the exception: it is open, and §9 item 3 is the single place it
is decided.** (Revision 1: the previous draft recorded `userSkills` here as settled *and* listed it as
open in §9. The measurement below says it is not settled, so this section defers.)

| table | owner | evidence |
|---|---|---|
| `agentRunConfig` | **`agent-run-config`** | sole production toucher (`agent-run-config-store.ts:21,81,104,147`). One-line assignment, zero code change. |
| `teamRunConfigDefaults` | **`agent-run-config`** | sole production toucher (`team-run-config-defaults-store.ts:17,47,60`). Already decided in the schema itself: *"the ACL owner is `layers/agent-orchestration/agent-run-config`"* (`framework/db/src/schema.ts:47-48`). One-line assignment, zero code change. |
| `taskDispatchAttempts` | **`work`** | FK to `tasks`, which `work` owns (`schema.ts:501-503`); `work` already declares it — *"Queue-facing operations for the **work-owned** dispatch-attempt table"* (`work-service.ts:60`). `policy` holds 3 sites (`handoff-protocol.ts:2,319,322`) that call through. |
| `propagationLog` | **`policy`** | not a log despite the name — it is the durable **retry queue** the propagation engine drains: `retryFailedPropagations` (declared `lifecycle-propagation.ts:581`) selects `pending_retry` rows at `:589` and CAS-resolves them in place at `:601`. `policy` operationally consumes it; `work` (`bet-kill-cascade.ts:134`) and the layer's retention reaper (`service-bootstrap.ts:136`) call through. |
| `userSkills` | **open — see §9 item 3** | candidate is `users`: per-user attribute keyed `(userId, skillId)` with FK to `users` (`schema.ts:830-845`), and the only production write is the autonomy-level PATCH on the user route (`routes/users.ts:321`). **But `layers/core-api/users/src/` holds zero `userSkills` sites today (measured, `rg -a`), so naming `users` clears nothing** — it converts all 9 sites from `(unowned)` to `(other)`, of which 5 become hard errors (§5.1). The operational consumers are `routine` (delegate selection, `routine-scheduler-bindings.ts:66-80`) and `settings` (configuration projection, `plugin-configuration.ts:745`). This is not the "cheap assignment" `plan.md:11` framed it as. |

**One finding worth carrying forward:** `userSkills` has **no production insert anywhere** — every
`insert(userSkills)` in the repo is a test or `tools/eval/src/seeding.ts:609`. In production the table
is update-and-read only. That does not change the need for an owner (an owner is required for the empty
`unowned` block), but the owning service must not invent a create path it has no caller for, and
`/architecture` should confirm rather than assume that no production path creates a skill row.

---

## 5. Constraints this work package must carry

### 5.1 The registry edit and the layer-side relocation are one commit, per table

**Measured, and not in `plan.md`.** Writing the six owners in produces **20 hard `error`s and an exit
code of 1**, because naming an owner reclassifies a layer-world site from `layer → db:table (unowned)`
(at `warn`) to `layer → db:table (other) [table:read|table:write]` — which is **absent from
`governance/rule-severity.json` and therefore at `error`**.

| table | layer-world sites that become errors |
|---|---|
| `sessions` | 14 — `agent-orchestration/src/routes/sessions.ts` (7 reads + 2 writes), `routes/agent-orchestration-sessions.ts` (4 reads), `services/session-stream-hub.ts` (1 read) |
| `userSkills` | 5 — `core-api/src/routes/users.ts` (3 reads + 1 write), `core-api/src/services/routine-scheduler-bindings.ts` (1 read) |
| `propagationLog` | 1 — `core-api/src/service-bootstrap.ts:136` |
| `taskDispatchAttempts`, `agentRunConfig`, `teamRunConfigDefaults` | 0 — no layer-world site |

Consequence: `plan.md:28`'s "sequence the five cheap assignments first" holds only for the three tables
with no layer-world site. `userSkills` and `propagationLog` are **not** one-line assignments; their
registry edit and their layer relocation must land in the same commit or the build breaks. Only
`agentRunConfig` and `teamRunConfigDefaults` are genuinely one-line.

### 5.2 A service may not name a sibling service — and the wiring site has a measured price

`scripts/lib/governance-model.ts:154-164`. Every cross-service door inside one layer is an **injected
port**, wired by the composition root; a layer may import its own services directly. This decides the
mechanism at every remaining site:

- layer → its own owning service: **direct import** (already the shape at `routes/sessions.ts:28`).
- `tool-handlers` → `sessions` write, `settings` → `userSkills` read, `work` → `propagationLog` write,
  `policy` → `taskDispatchAttempts`: **DI port** (`tool-handlers/src/ports.ts`, `work/src/ports.ts`,
  `policy/src/ports.ts` all exist).

**What the DI edges themselves cost: zero.** The `di` crossing is classified by the *recipient* and
*provider* packages, never by the file doing the wiring — `scripts/lib/crossing-detectors.ts:930-935`
states this outright, and the live tree confirms it (`applications/remote-server/src/create-server.ts:505`
is reported as `settings → agent-run-config`, not as an application crossing). All four pairs above are
same-layer (`tool-handlers`/`run-orchestration` in `agent-orchestration`; `settings`/`users`,
`work`/`policy`, `policy`/`work` in `core-api`), so `wire-within-one-layer` allows them outright
(`governance-model.ts:265-289`) and no new `service → service (other layer) [di]` finding appears.

**What the wiring *import* costs: one net-new warning, for `tool-handlers` only.** `ToolHandlersPorts`
has exactly one wiring site in the tree — `layers/core-api/src/services/tool-handlers-bindings.ts:200`
(`rg -a` over `layers/` and `applications/`, excluding tests). That is a **core-api layer** file, and it
already carries two `layer → service (other layer) [import]` warnings for importing
`@hyperidle/tool-handlers` (`:31`, `:32`). Adding a session accessor to those ports means that file also
imports `@hyperidle/run-orchestration`, which adds **one** finding to a group at `warn`
(`rule-severity.json:16`) — net-new production debt in a work package whose direction is removing it.

The three `core-api`-internal pairs cost nothing: their wiring lives in the `core-api` layer, and a layer
naming its own service is `reach-your-own-contents` (`governance-model.ts:315-317`), which is silent.

`/architecture` must decide: accept the one warning, or move the `tool-handlers` sessions wiring to a
site inside `agent-orchestration` (where the import is free for the same reason). This is a real choice
with a measured price, not a detail.

### 5.3 Two doors must accept a caller-supplied transaction

`policy/handoff-protocol.ts:317-330` inserts `taskDispatchAttempts` inside a `tx` alongside
`deps.work.updateTaskById(tx, …)`, and `work/task-state-machine.ts:115-128` does the same inside its own
`tx`. A door that opens its own transaction would split an atomic write. `work` already has the right
shape — `taskDispatchAttemptStore`'s methods take `exec: WriteExecutor` (`work-service.ts:60-105`).

### 5.4 Standing constraints, restated because they bind every decision below

- **Zero exceptions.** No allowlist, no foreign-import ceiling, no named carve-out however small. A
  cross-owned-table join decomposes into one call per owning service.
- **Exclusivity covers reads as well as writes.**
- **No production export may be added that only tests consume.** Verification and its measured hole:
  §6 row 8.
- **No production file may import a development file** (`CLAUDE.md`, production/development split).
- **Work-package ids stay inside `.pipeline/**`** — never in code, comments or identifiers, `@lore`
  tags excepted.
- **Nothing new under `governance/`.** `no-per-file-allowances` holds `governance/` to a closed set of
  six files (`scripts/rules/no-per-file-allowances.ts:32-39`); a seventh file, a nested value under a
  severity key, or a path-shaped key fails the build. The only legal edits are the contents of
  `table-owners.json` and deletions from `rule-severity.json`.
- **Promotion is a deletion, in the same pull request.** Clearing a group key's last site removes that
  key from `rule-severity.json` in the commit that clears it (`governance/README.md:78-82`). There is no
  generator and no later step.

### 5.5 The AU32 interaction is measured and is clear

Naming an owner can create development-world companion violations, and every development rule is at
`error` with no `warn` entry, so any such violation must be cleared in this same pull request
(`plan.md:34`, `.pipeline/AU.md:51`).

**Measured: zero.** With all six owners assigned, governance-lint reports **0 development violations**
— in Shape A, in Shape B, and after both registry corrections. The mechanism explains it: a companion
group needs an exported *function declaration* in the owning package that unconditionally inserts **two
or more tables the same package owns and revises** (`scripts/lib/crossing-detectors.ts:362-451`).
`run-orchestration` and `policy` would own exactly one table each; `agent-run-config`'s two tables are
inserted from two separate files; `users` and `work` gain one table each with no shared unconditional
insert.

This must be **re-measured after the accessor relocation**, not only after the registry edit: moving a
write into an owner can create a new multi-table exported writer that did not exist before. Surface #7
(§3.4) is the specific risk — it moves a `sessions` write into `run-orchestration` alongside whatever
that package already writes.

---

## 6. Success, mapped to every acceptance criterion

| # | AC (`plan.md:47-53`) | What "met" means here | How it is verified |
|---|---|---|---|
| 1 | Every table names exactly one owning service; `unowned` is empty | six owners written; `totals` reads 45/45/0 | `governance-lint` — the schema-derived completeness check already fails on a missing table |
| 2 | Every production read and write reaches its table through the owner | every remaining table crossing cleared (§7) | `governance-lint`: zero production findings in any `db:table` group |
| 3 | A service needing foreign data asks the owner; no cross-owned-table query in production | each door is a DI port or a layer-to-own-service import per §5.2; §5.3's two doors take a `tx` | `governance-lint` + code review; no allowlist may appear |
| 4 | The table rules fail the build in both directions on any new violation, with no baseline entry | all ten table keys absent from `rule-severity.json`; the two already-`error` keys stay absent | **absence from `rule-severity.json` is the whole of "fails the build"** — see the demonstration below |
| 5 | Every `db:table (unowned)` and production `db:table (other)` key this WP owns is removed | ten keys deleted from `rule-severity.json` in this PR | diff of `rule-severity.json`; lint's "ready to flip to error" NOTE must be empty for table keys |
| 6 | The AU28 bookkeeping mechanism stays gone | no new file under `governance/`, no nested severity value, no path-shaped key | `no-per-file-allowances`, already registered and attack-tested |
| 7 | `npm run verify` green; relocated accessor behaviour proven unchanged through the owner | every relocated accessor exercised through its owner by a test that imports it; for surface #7 (§3.4) that means the CAS refuses a non-`active` row and `session_ended` fires exactly once | `npm run verify` + `npm run test:all`. Behaviour is runtime, so it is a test, not a lint rule — `CLAUDE.md` First Principle |
| 8 | *(constraint, `plan.md:33`)* No production export added that only tests consume | every accessor added to `@hyperidle/run-orchestration`'s barrel and to the other owners' barrels has a named production caller | `npm run knip:production` inside `npm run verify` — **with a measured hole**, see below |

### AC #4 — the proof, and how it goes red

**Revision 1 correction.** The previous draft called `governance-lint --attacks` "the honest proof" that
the rules bite. It is not, and the critique is right. The attack runner overlays a synthetic tree and
hardcodes `severityOf: () => "error"` (`scripts/governance-lint.ts:155-160`), so it is blind to severity
by construction. I ran it on the pristine tree: **`--attacks: PASS — 51 break-tests`, today, with all
ten table keys still at `warn`.** A check that is already green before the change it is supposed to
prove is not evidence for that change. `--attacks` proves only that the *detector* still recognises the
crossing, and that is where AC #4 should keep it.

**The enforcement is key absence, and nothing else.** The live run resolves
`severity.severity[ruleKey] ?? "error"` (`scripts/governance-lint.ts:229-230`).

**Demonstrated red, in this worktree, then reverted.** I introduced a genuine new violation — a
`from(bets)` read plus its table-symbol import inside `layers/core-api/settings`, a service that does
not own `bets`:

- With `service → db:table (other) [import|table:read]` present in `rule-severity.json` at `warn`:
  both crossings reported as `WARN`, and the run ended
  `PASS — … 193 production … violation(s) at warn`, **exit 0**. The rule did not bite.
- With those two keys deleted and nothing else changed: the same two crossings reported as `ERROR`,
  and the run ended `FAIL — 8 error(s)`, **exit 1**.

That is the verification for AC #4, and it can fail: **delete the key, introduce a violating access, and
the build must exit non-zero.** It is the same probe `plan.md:61` already writes as a validation
scenario ("a `select` against `sessions` from a package that does not own it → the build fails"), and it
is red today for exactly the reason AC #4 exists.

### AC #8 — the test-only-export contract, and where the machine cannot see it

**Measured in this worktree, then reverted.** Two probes:

- A production module reachable only from a test — `run-orchestration/src/au-probe-accessor.ts`
  imported solely by a `__tests__` file. `npm run knip` (plain lane) is silent, because a test counts as
  a consumer there. `npm run knip:production` reports it: `Unused files (1)`. The mechanism is
  `scripts/knip-production-test-files.mjs` plus `--production`, which drops test files as entry points.
  **This proof goes red, and I saw it red.**
- A test-only export added to an owning package's **barrel** — `export { auProbeTestOnlyAccessor }` in
  `run-orchestration/src/index.ts`. **Both lanes stayed green.** `knip.json` does not set
  `includeEntryExports`, so knip does not report exports from an entry file; and the production lane's
  `--include files,dependencies,unlisted,binaries` (`package.json:61`) omits `exports` entirely.

So the contract is machine-enforced at the *file* level and **not** at the *barrel-export* level — which
is precisely where Shape A grows (§3.3: six to eight accessors onto `@hyperidle/run-orchestration`).
`/architecture` must therefore name, per accessor it adds to an owner's barrel, the production caller
that consumes it; an accessor with no production caller is not added. Review checks that list against
the barrel diff. Stating this as a knip guarantee would repeat the AC #4 mistake.

**Validation scenarios** (`plan.md:57-63`) are all mechanical except the last: "observable results
identical to `origin/main`" is proven by the existing integration suites over the relocated paths,
notably the session routes (`layers/agent-orchestration/src/routes/__tests__/`), the propagation retry
path (`layers/core-api/src/__tests__/policy-engine.integration.test.ts`,
`retention-reaper.integration.test.ts`) and the dispatch-attempt path
(`layers/core-api/work/src/__tests__/`).

---

## 7. The genuine delta — what actually has to move

**Scope is settled by `plan.md`, not by an amendment.** `plan.md:11` enumerates the non-unowned work
exactly: *"four service writes, three service reads, three service imports and one layer import, all
against tables whose owner already exists."* That is 4+3+3+1 = **eleven**, and it matches the eleven
`db:table (other)` sites I measured, group for group. `plan.md:5`'s "exactly one is a genuine foreign
access" contradicts `plan.md:11`; `:11` is the line that describes work, so all eleven are in scope and
AC #2 requires them cleared. What is open is the **means**, not the scope — §9 items 1 and 2.

**One delta, stated with its condition.** After the six owners are written the run reports **117
warnings + 20 errors, exit 1**, of which **46 are table crossings** (26 `warn` + the 20 `error`s from
§5.1). Correcting the two stale registry entries dissolves ten of them. Each correction was measured
separately:

| assumption | table crossings left | measured |
|---|---|---|
| six owners only | **46** | 117 warn + 20 error, FAIL |
| + `serverCredentials` → `credentials` (§9 item 1 — **no legal alternative exists**) | **38** | 109 warn + 20 error, FAIL |
| + `filesystemCaptures` → `filesystem-mounting` (§9 item 2 — a genuine choice) | **36** | 107 warn + 20 error, FAIL |

**The work list below is the 36-site case**, i.e. it assumes both corrections. If §9 item 2 resolves the
other way, add back the 2 `filesystemCaptures` sites as a sibling-port relocation inside
`agent-orchestration`. §9 item 1 has no other resolution that satisfies AC #2 and AC #3 at all, so 38 is
the floor.

| group | sites | mechanism |
|---|---|---|
| `sessions`, layer-world — `routes/sessions.ts` (import `:27`, reads `:211,246,250,273,285,316,362`, writes `:193,359`), `routes/agent-orchestration-sessions.ts` (import `:25`, reads `:98,149,179,206`), `services/session-stream-hub.ts` (import `:36`, read `:73`) | 17 | import accessors from the owning service; `:193` is the terminal transition of §3.4 |
| `sessions`, `tool-handlers` `write_session_notes` (`tool-definitions.ts:22,592`) | 2 | DI port — wiring cost measured in §5.2 |
| `userSkills`, layer-world — `routes/users.ts` (import `:2`, reads `:241,309,327`, write `:321`), `services/routine-scheduler-bindings.ts` (import `:20`, read `:76`) | 7 | import accessors from the owner named in §9 item 3 |
| `userSkills`, `settings` config projection (`plugin-configuration.ts:2,745`) | 2 | DI port |
| `propagationLog`, layer-world retention reaper (`service-bootstrap.ts:24,136`) | 2 | import `policy`'s reaper |
| `propagationLog`, `work` bet-kill cascade (`bet-kill-cascade.ts:1,134`) | 2 | DI port |
| `taskDispatchAttempts`, `policy` handoff (`handoff-protocol.ts:2,319,322`) | 3 | DI port, `tx`-carrying (§5.3) |
| `bets` zod schema import (`core-api/src/schemas/bet.schema.ts:15`) | 1 | the last site in `layer → db:table (other) [import]` at baseline; see §8.3 |

**Non-goals**, per `plan.md:38-41` and not to be widened:

- `framework/db`'s own production table writes — AU29, shipped.
- The development-world companion violations — AU32, shipped; the development world is at 0 today and
  must still be at 0 at the end (§5.5).
- Reducing any service's exposed method surface — AU20's axis. Shape A grows
  `@hyperidle/run-orchestration`'s barrel; that is a known, accepted, out-of-scope consequence.
- Splitting, renaming or relocating `run-orchestration`.
- Any schema change. No column, index, FK or migration is in scope.

---

## 8. Findings against `plan.md`

**Revision 1.** The previous draft titled this section "Proposed plan amendments" and said none was
adopted, while §7 computed its work list as though §8.2 were adopted. That is fixed: §7 now states its
condition explicitly, and the items below are separated into **one amendment** (§8.1 — a `plan.md` edit
the maintainer must make or decline) and **findings** (§8.2-§8.5 — facts inside existing scope, whose
open choices are escalated in §9, not here).

### 8.1 Amendment: no new package is needed

`plan.md:5,13` states a sessions service "does not exist and has to be created — that is the one piece
of new construction here", and `plan.md:26` makes creating it human-review-load-bearing. The evidence
(§3) recommends an existing owner. If accepted, this work package contains **no new package and no new
construction**; it is placement throughout. This is the one item that changes `plan.md`'s text about
what gets built; the owner decision itself was delegated to this phase by `plan.md:23,28`.

### 8.2 Finding: both `db:table (other)` clusters are stale registry entries, not foreign accesses

`plan.md:5` says "exactly one is a genuine foreign access". `plan.md:11` correctly counts eleven, and
**neither cluster is a service reaching into someone else's data** — both are the registry pointing at
the wrong package:

- **`serverCredentials` is registered to `connections` (`table-owners.json:32`) but `connections` never
  touches it.** `rg -a` over `layers/agent-orchestration/connections/src/` returns exactly one hit, and
  it is a comment that says the opposite of the registry: the credential catalog *"(`server_credentials`)
  … genuinely stays core-side on J2's consumer-locus argument"*
  (`layers/agent-orchestration/connections/src/index.ts:16-18`). The code itself documents that the
  table did not move when the package split. The 8 production sites are all in `layers/core-api/credentials`
  (`credential-resolver.ts:15,52`; `credential-store.ts:21,54,59,92,110,119`), whose barrel calls itself
  the *"core-api Layer, SQL-owning Service"* for `server_credentials` (`credentials/src/index.ts:1-19`).
  Correcting the entry to `credentials` clears **8 sites** (measured: 117 → 109) with one line and no
  code change. **There is no alternative** — see §9 item 1.
- **`filesystemCaptures` is registered to `filesystems` (`table-owners.json:47`) but `filesystems`
  never touches it.** The sole production toucher is `agent-orchestration/filesystem-mounting`, which
  writes a capture row when a mount is captured back (`mounter-registry.ts:339-347`). Under AU26's own
  test the mounting engine is the operational consumer. Correcting it clears **2 sites** (measured:
  109 → 107). Here an alternative *is* legal — see §9 item 2.

Clearing these sites is inside AC #2 and AC #5 as `plan.md:11` scopes them. What is not settled is the
*means*, because re-assigning an already-owned table is a durable domain decision rather than filling an
empty slot. Escalated in §9, not assumed here.

### 8.3 Finding: the `(other)` group keys are as all-or-nothing as the `(unowned)` ones

`plan.md:7,28` argues the six tables are one work package because the table rules aggregate. The same
argument applies to `db:table (other)`, and `plan.md` does not draw it: the six assignments put new
entries into the very group keys that already hold the `credentials`, `filesystemCaptures` and
`bet.schema.ts` violations. **No `(other)` key can leave `rule-severity.json` until all eleven
pre-existing sites are cleared too**, including `layers/core-api/src/schemas/bet.schema.ts:15` — at
baseline the *only* site in `layer → db:table (other) [import]`, a zod-schema import of `bets`
unrelated to any of the six. This is a mechanical consequence of `plan.md:11`'s scope, not an extension
of it.

### 8.4 Correction: the mechanical facts in `plan.md`, and two of my own

Stated for the record; none changes an outcome.

- `plan.md:5,7` — "ninety of the ninety-one production table violations". Live: **100 table violations,
  89 unowned + 11 other**, out of 191 production total. AU29 and AU32 shipped after `plan.md` was
  written.
- `plan.md:50` — "The four table rules and the two table-symbol import rules". Live:
  **ten** table keys at `warn` and **two more already at `error`** (§2.1).
- `plan.md:11` — `propagationLog` "policy 9, core-api 3, work 2". Live: policy 9 ✅, core-api **2**,
  work 2 ✅ — 13 total, not 14. The one-site drift is `core-api`.
- **My revision-0 draft was wrong twice, and the critique did not catch either.**
  `plan.md:11`'s `userSkills` figures — "core-api 7 sites, settings 2" — are **exactly right**
  (measured: `routes/users.ts` 5 + `routine-scheduler-bindings.ts` 2 = 7 core-api layer-world, plus
  `settings` 2 = 9). Revision 0 reported this as drift by miscounting `routine-scheduler-bindings.ts`
  as a third party rather than as core-api. Likewise revision 0 attributed `propagationLog` as
  "7 policy + 2 core-api + 2 work + 2" — the correct split is policy 9 (`lifecycle-propagation.ts` 7,
  `policy-engine.ts` 2), core-api 2, work 2.
- `plan.md:11`'s `taskDispatchAttempts` — "work(8), policy(3)" — is exactly right
  (`work-service.ts` 5 + `task-state-machine.ts` 3 = 8; `handoff-protocol.ts` 3).

### 8.5 Finding: a retired mechanism is still cited in seventeen files

`UNOWNED_SHARED_TABLES` and `scripts/table-ownership-guard.ts` are referenced in **17 files** outside
`plans/` and `.pipeline/` — 12 production, 4 test, 1 script — measured with
`rg -a -l "UNOWNED_SHARED_TABLES|table-ownership-guard"` (revision 0 said "eleven", with the filter left
unstated; that was an unmeasured number in a section headed "measured, not remembered"). Production:
`framework/db/src/schema.ts`, `agent-orchestration/connections/src/index.ts`,
`agent-orchestration/filesystem-mounting/src/mounter-registry.ts`,
`agent-orchestration/run-orchestration/src/transition-run.ts`,
`agent-orchestration/tool-handlers/src/tool-definitions.ts`, `core-api/routine/src/agent-delegation.ts`,
`core-api/src/service-bootstrap.ts`, `core-api/src/services/routine-scheduler-bindings.ts`,
`core-api/users/src/hint-progress.ts`, `core-api/work/src/bet-state-machine.ts`,
`core-api/work/src/ports.ts`, `core-api/work/src/session-start-resolver.ts`. Plus
`scripts/mock-inventory.ts` and four `__tests__` files.

`scripts/table-ownership-guard.ts` **does not exist**. Some of the 17 describe the removed exemption in
the past tense and are merely historical; at least one asserts present-tense sanction and is now
provably false — `agent-orchestration/connections/src/index.ts:7-9` says *"This package is the sole
importer of that table; `scripts/table-ownership-guard.ts`'s `TABLE_OWNER` names it"*, which is the same
comment whose next paragraph contradicts the `serverCredentials` registry entry (§8.2). Correcting the
comment **at each site this work package already touches** is in scope and costs nothing; a repo-wide
comment sweep is not, and is not proposed.

---

## 9. Open decisions — escalated to the maintainer

Each of these changes what gets built. None can be settled from the code alone.

1. **`serverCredentials` — the item with no legal alternative.** Either correct
   `table-owners.json:32` from `connections` to `credentials`, **or** AC #2 and AC #3 cannot be
   satisfied for those 8 sites at all. The alternative is *not* "route through the owner": the owner as
   registered is `agent-orchestration/connections` and the toucher is `core-api/credentials`, so the
   call would be cross-layer, where dependency injection is **forbidden** — *"dependency injection is
   legal only within a layer; cross-layer conversation goes through the API, MCP or the bus"*
   (`scripts/lib/governance-model.ts:265-289`). No legal same-process form exists. The remaining
   non-correction option is to move 8 credential reads and writes onto an HTTP hop between layers for a
   table the code itself says stayed core-side (`connections/src/index.ts:16-18`). Recommendation:
   correct the registry. **Settled by:** the maintainer accepting a registry correction as the means, in
   human review. Cost of the correction: one line, zero code, 8 sites cleared (measured 117 → 109).
2. **`filesystemCaptures`.** Correct the registry to `filesystem-mounting`, or keep `filesystems` and
   route the write through a sibling port. Both are legal — both packages are in `agent-orchestration`,
   so the port form is available here in a way it is not for item 1. Settled by a human-review verdict
   on whether a capture is filesystems-domain state or mounting-engine state; the code evidence favours
   correcting the registry. Cost either way: 2 sites (measured 109 → 107).
3. **`userSkills`' owner.** The record is a user attribute with an FK to `users`, but `users` holds zero
   sites today (§4), so naming it clears nothing and converts all 9 sites to `(other)` — 5 of them
   straight to hard errors. The operational consumers are `routine` and `settings`. Recommendation
   stands at `users` as a pure record owner *if* `/architecture` confirms `routine`'s
   `listAgentIdsBySkill` is the only read that matters; otherwise the consumer-locus argument points
   elsewhere. Settled by `/architecture` naming the door each consumer calls. This is the only place
   `userSkills` is decided — §4 defers here.
4. **The `tool-handlers` sessions wiring site** (§5.2). Accept one net-new
   `layer → service (other layer) [import]` warning at
   `layers/core-api/src/services/tool-handlers-bindings.ts`, or relocate that wiring into
   `agent-orchestration` where the import is free. Settled by `/architecture`; the price of each option
   is measured.
5. **Whether `run-orchestration` is due to be split.** If it is, Shape B becomes the better answer
   (§3.3). Settled by the maintainer; nothing in `.pipeline/AU.md` registers such a work package today.
6. **Companion violations after relocation** (§5.5) — measured at zero for the registry edit, unmeasured
   for the finished relocation, and surface #7 (§3.4) is the specific risk. Settled by re-running
   `npx tsx scripts/governance-lint.ts` once the accessors have moved; the development world must
   read 0.

---

## 10. Method note

Every count in §2, §3.3, §3.4, §5.1, §5.5 and §7 was produced by writing candidate owners into
`governance/table-owners.json` in this worktree, running `npx tsx scripts/governance-lint.ts`, and
reverting with `git checkout`. Revision 1 added three further probes, each reverted the same way:

- **AC #4** (§6): a real `bets` read inserted into `layers/core-api/settings`, run once with the
  `service → db:table (other)` keys present (`WARN`, exit 0) and once with them deleted (`ERROR`,
  `FAIL — 8 error(s)`, exit 1).
- **AC #8** (§6): a test-only-reachable production module (caught by `knip:production` as
  `Unused files (1)`) and a test-only barrel export (**not** caught by either knip lane).
- **`--attacks`** (§6): run on the pristine tree — `PASS — 51 break-tests` with all ten table keys still
  at `warn`.

`git status` shows no tracked modification from this phase; the only untracked files are this
work package's own artifacts. Anything not directly observed is marked as such above.

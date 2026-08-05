# AU28 — the development-world access rules

Derived from the 121 production verdicts in `.pipeline/work/AU28/rule-set.json` (census `4af3c0e6`,
789 production files / 2,473 development files, 6,165 boundary-crossing development instances, of
which 4,481 sit on rules production forbids). Production verdicts are carried through unchanged; only the
development column is new.

Every claim below is either a `file:line` from the repo or is marked as reasoning from the principle.

---

## 1. The principle

> **A development file may cross any boundary it needs in order to build the world and boot the
> system. It may not go around a door that production has only one of.**

Two halves, in the founder's vocabulary:

**Crossing a boundary to arrange the world.** A test imports a service from another layer, injects a
real implementation into a port, boots the application, holds a database client, reads a table it
does not own. None of these fakes anything — they are how a test gets a real system stood up. A rule
that forbids them does not make the tests better, it makes them lie about what they exercise.
**Relax.**

**Going around the one door.** Reaching a raw LLM SDK instead of `callLlm`; pulling the whole
`schema` namespace instead of the database's own client factory; writing a row into a table whose
owning service already has the write function production uses. These do not arrange the world — they
build a *different* world, one production cannot produce. **Hold.**

### One amendment the evidence forced

The principle as first stated ("may not bypass a mechanism production depends on") is not enough on
its own, because it does not say what to do when the mechanism does not exist. The founder's
constraint settles it:

> we can only change the test pattern, we cannot add methods to production code that only tests need

So the rule is not "always go through the owner". It is:

> **Where the door already exists and production already uses it, the test walks through it. Where
> there is no door, the test writes directly and we do not build one.**

A production export that only tests reach is dead code — `knip:production` deletes it, and the repo's
standing rule says test-only-reachable code gets deleted, not kept. Any development rule that
*requires* a new production export is therefore self-defeating: it would mandate code the build
removes. Every recommendation below was checked against that.

### Enforcement level is a separate dial (Ruling 12)

Each rule states the end state. Where the migration is large the dial starts at **warn**. Warn is
marked per rule.

---

## 2. Two corrections to the model, before any verdict

Both are mechanical, both change what the two worlds even mean, and both should land before the rules
are written down.

### 2.1 A manifest row's world comes from its dependency block, not from its file

`package.json` files in `layers/`, `framework/` and `applications/` are classified **production**, so
today every dependency row in them is a production crossing — including the ones that exist purely to
let a test import something. The census already records which block each row sits in: **96
`dependencies`, 28 `devDependencies`** rows.

Twenty-five of those 28 `devDependencies` rows land on a rule production forbids, and every one of
them serves a development import this document relaxes:

| declared at | package | rule it lands on |
|---|---|---|
| `layers/core-api/package.json:57-58` | `@hyperidle/connections`, `@hyperidle/filesystem-mounting` | layer → service (other layer) |
| `layers/core-api/work/package.json:19-22` | `conversation`, `knowledge`, `org`, `users` | service → service (same layer) |
| `layers/core-api/review/package.json:19-22` | same four | service → service (same layer) |
| `layers/core-api/routine/package.json:19-21` | `knowledge`, `org`, `users` | service → service (same layer) |
| `layers/agent-orchestration/tool-handlers/package.json:20-21` | `settings`, `work` | service → service (other layer) |
| `layers/core-api/package.json:59`, `layers/core-ui/package.json:31` | `@hyperidle/remote-server` | layer → application |
| `applications/desktop/package.json:21-23` | `harness-registry`, `remote-server`, `remote-worker` | application → service, application → application |
| `layers/core-ui/package.json:30` | `@hyperidle/eval` | layer → tooling |

**The last row is Ruling 8.1's single remaining production→tooling breach.** Ruling 8.1 recorded it as
"exactly one production→tooling reference exists repo-wide — a manifest row that exists only to serve
`packages/web/scripts/`". It is `@hyperidle/eval` in `layers/core-ui`'s **devDependencies**
(`layers/core-ui/package.json:26,30`), serving `layers/core-ui/__scripts__/ah5-resolve-model.ts:27`.
Under the corrected attribution the breach count for that rule goes to **zero** and the rule is clean
today rather than clean-except-one.

**Rule:** a `dependencies` row is a production crossing; a `devDependencies` row is a development
crossing. Nothing else changes.

### 2.2 The two `db:testing` rows are redundant — delete them

`layer → db:testing` and `service → db:testing` carry **0 production / 64 development** instances.
That zero is not luck. `@hyperidle/db/testing` resolves through the exports map
(`framework/db/package.json`: `"./testing" → "./src/__testing__/test-utils.ts"`) to a file that is
development by the `__` clause, and `scripts/rules/no-production-imports-development.ts` matches on
resolved file→file edges (`repo-census.ts:404` `resolvePackageSpecifier` handles the exports map). So
a production file importing it is **already** an error under the one enforced rule.

The 64 development instances are development→development, which is not a crossing at all. Both rows
express something already enforced and should come out of the set rather than be given a second,
weaker statement. The related Ruling 9 breach is closed: `framework/shared/src/harness/index.ts:59-62`
no longer re-exports `MockHarnessAdapter`.

---

## 3. Category by category

Counts are development instances. Full per-rule table in §7.

### Relaxed as structural — 42 rules, 1,852 development instances

Every one is a test constructing, booting, wiring or observing the real system. Grouped by the act:

**The test imports a foreign service or layer to seed and assert.** `layer → service (other layer)`
147, `service → service (same layer)` 24, `service → layer (other)` di 49, `service → service (other
layer)` 3+1, `layer → layer (other)` 2, `layer → service (other layer)` di 2. All test bodies —
e.g. `layers/core-api/src/__tests__/AD1-create-item-routing.integration.test.ts:30` imports
`@hyperidle/tool-handlers`; `layers/agent-orchestration/run-orchestration/src/__tests__/agent-run-boundary.integration.test.ts:4`
imports `@hyperidle/users`. This relaxation is also the precondition for §4: it is what lets a test
seed through the owning service instead of hand-inserting.

**The test is the composition root.** `layer → application` 10
(`app-runtime-route-boot.integration.test.ts:3` imports `@hyperidle/remote-server/create-server`),
`application → service` di 12 (`createSandboxAdapter` wired into the booted server),
`layer → MCP router` 11, `layer → db:bootstrap` 1, `application → application` 1
(`applications/desktop/__tests__/boot-server.test.ts:36`). The repo already says this out loud:
`layers/core-api/src/__testing__/test-utils.ts:32-38` — *"Mounting is an APPLICATION decision… A test
harness IS an Application, so the hook belongs here."*

**The test injects a real implementation into a declared port.** `framework → service` di 29,
`framework → framework` di 12, plus the di rows above. Every instance is `wired-in (factory)` in a
test body. The 12 `framework → framework` ones all sit on the AK6 roster seam that Ruling 9 step 6
already deletes; relaxing the rule does not keep the seam alive — dead-code removal does that.

**The test tests the mechanism itself.** `framework → EventBus` 31 — all four files are the bus's own
tests: `framework/shared/src/__tests__/event-bus.test.ts` (22), `thread-events.test.ts` (5),
`observability-dispatcher.test.ts` (3), `AL7-proposed-call-types.test.ts` (1). Production forbids
`framework` from being a bus participant; a test *of* the bus is not a participant. (When Ruling 12.3
moves the observability dispatcher out of `framework/shared`, three of these move with it.)

**The test imports the repo-root script it is testing.** `framework → repo root` 13, `layer → repo
root` 1 — `framework/db/src/__tests__/ar1-attestation-floor.test.ts:29` and siblings import
`scripts/lib/*`. There is no package to hold these tests. Worth noting for later: the cleaner end
state is `scripts/__tests__/`, at which point the rows go to zero on their own.

**Foreign-table reads and the table symbol import.** `layer|service → db:table (other)` `import`
1,269+148. See §4 — reads stay open, so the symbol has to be importable.

**Zero-instance rules relaxed by the same reasoning** (stated from principle, no instances to cite):
`application → service` import/manifest, `service → MCP router`, `application → MCP router`,
`framework → layer` di, `service → agent-execution` api, and all eight `manifest` rows that
correspond to a relaxed import (see §2.1).

### Held as mechanism — 12 rules, 2,629 development instances

Of these 2,629, **742 are foreign-table reads that §4 explicitly re-opens** — they are counted here
only because the `table` kind does not yet separate read from write. The genuine holds:

| what | dev | evidence | the door that already exists |
|---|---|---|---|
| foreign-table **writes** | 1,872 | §4 | the owner's exported writer (1,839 of 1,872) |
| `db:schema-ns` | 6 + 2 | `layers/core-ui/__scripts__/ah1-test-server.ts:28` and `:52`, `ah5-test-server.ts:37`, `tools/eval/src/runner.ts:14,71` — all four do `drizzle(client, { schema })` | `framework/db/src/connection.ts:71-74` `createPgliteDb` does exactly that line inside `db`; `createTestDb()` (`framework/db/src/__testing__/test-utils.ts:141`) does it for in-memory |
| `raw runtime` | 1 | `tools/eval/src/judges.ts:502` — `await import("@anthropic-ai/sdk")` then `new Anthropic({apiKey: ctx.resolvedModel.apiKey})` | `callLlm` (`layers/agent-execution/harness-registry/src/llm-client.ts:670`). Ruling 8.4 already named this: no cassette replay, locked to one provider |
| `db:unknown` | 6 | `applications/desktop/__tests__/migrate.test.ts:54,63,72,84` import `seed` | `applyFactoryBootstrap`; Ruling 9 step 1 deletes `seed.ts` outright |
| `db:util`, `framework/design-system` | 0 | — | reasoning from principle; `db:util` is not database code (Ruling 12.3 moves it out), and only `core-ui` may reach the design system (named row) |

`db:schema-ns` is the clearest case in the set: it is one import that hands over all 45 tables at
once, the replacement lives in the owning package and is one call, and the whole population is eight
lines in three files. It costs nothing to hold and holding it is what keeps §4 checkable at all.

### Unchanged — 67 rules, 1,684 development instances

Allowed in production, allowed in development. Nothing in the development world narrows any of them.
The largest: `layer → framework/shared` 218, `layer → db:client` 204, `layer → service (same layer)`
190, `layer → EventBus` 134, `service → db:table (own)` 130, `tooling → db:table (other)` 233+96
(Ruling 7).

### Needs a product decision — 3 items

Listed in §6. None of them blocks adopting the other 118.

---

## 4. The big block: `→ db:table (other)`, 4,031 development instances

Split first, because the two halves are not the same act:

- **1,872 writes** (`insert` 1,814, `update` 51, `delete` 7)
- **742 reads**
- **1,417 symbol imports** that serve both

And by where they live: **2,370 of 2,380** `layer → table` instances are in a `.test.ts` body, only 4
in a test helper. **3,619 of 4,031** are in one folder, `layers/core-api/src/__tests__/`. So this is
not scattered infrastructure — it is the layer-level route/integration suite building its world by
hand, 249 files of it.

### 4.1 Reads: allowed

A read cannot create a state production could not produce. It can only couple the test to the schema,
and in exchange it gives a truer assertion than reading back through the same service that did the
write — a service that reads back its own bad write still looks correct. The founder's stated hazard
("a test can pass against a shape production could never produce") is a statement about writes.

**Recommend: `db:table (other)` reads allowed in development, and the `table` kind split into
`table:read` / `table:write` so the rule can say so.** Both split rows are in the JSON at the end.

*This is the one place I diverge from the standing "service ownership covers reads as well as writes"
correction. That correction is about production services. If you want the development world to match
it exactly, flip `table:read` to forbidden and the count moves by 742.*

### 4.2 Writes: sorted by whether a production path already exists

This is the empirical question. For every table that development writes, I looked for a function in
production source that writes it, whether it is exported from the owning package's barrel, and
whether production itself calls it.

**Group 1 — the door exists and production uses it. The test pattern changes; no production code is
added.**

| table | dev writes | existing writer | defined at | barrel | production callers |
|---|---|---|---|---|---|
| `users` | 436 | `insertUser` | layers/core-api/users/src/user-store.ts:143 | users/src/index.ts:45 | routes/users.ts, routes/agents.ts, routes/org.ts |
| `teams` | 271 | `createTeam` | layers/core-api/org/src/team-lookup.ts:230 | org/src/index.ts:47 | routes/teams-routes.ts, routes/org.ts |
| `teamMembers` | 247 | `createTeam` | layers/core-api/org/src/team-lookup.ts:230 | org/src/index.ts:47 | same call — the 1:1 invariant |
| `bets` | 186 | `create` | layers/core-api/work/src/work-service.ts:627 | work/src/index.ts:106 | routes/bets, bet-state-machine |
| `tasks` | 146 | `create` | layers/core-api/work/src/work-service.ts:627 | work/src/index.ts:106 | task-state-machine |
| `threads` | 103 | `insertThread` | layers/core-api/conversation/src/conversation-store.ts:125 | conversation/src/index.ts:70 | service-bootstrap, routine-scheduler-bindings |
| `sessions` | 57 | `createBareRun` | layers/agent-orchestration/run-orchestration/src/create-bare-run.ts:41 | run-orchestration/src/index.ts:40 | core-api/src/routes/sessions-routes.ts:263 |
| `knowledgeItems` | 53 | `create` | layers/core-api/knowledge/src/knowledge-repository.ts:254 | knowledge/src/index.ts:78 | knowledge routes |
| `routines` | 45 | `insertRoutine` | layers/core-api/routine/src/routine-service.ts:64 | routine/src/index.ts | routines-routes, routine-scheduler |
| `messages` | 39 | `insertMessage` | layers/core-api/conversation/src/conversation-store.ts:137 | conversation/src/index.ts:69 | policy-bindings, assistant-turn-coherence-trigger |
| `agentRunConfig` | 35 | `writeAgentRunConfig` | layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts:147 | agent-run-config/src/index.ts:31 | core-api agents routes |
| `agentWorkIntents` | 30 | `enqueueWorkIntent` | layers/agent-orchestration/session-requests/src/service.ts:1590 | session-requests/src/index.ts:11 | core-api intent producers |
| `agentSessionRequests` | 25 | `createSessionRequest` | layers/agent-orchestration/session-requests/src/service.ts:1630 | session-requests/src/index.ts:7 | run admission |
| `knowledgeAppProjection` | 25 | `create` | layers/core-api/knowledge/src/knowledge-repository.ts:280 | knowledge/src/index.ts:78 | byproduct of knowledge.create |
| `artifacts` | 25 | `create` | layers/core-api/work/src/work-service.ts:643 | work/src/index.ts:106 | tool-handlers create-artifact |
| `items` | 17 | `create` | layers/core-api/work/src/work-service.ts:640 | work/src/index.ts:106 | work routes |
| `serviceConnections` | 15 | `insertConnection` | layers/agent-orchestration/connections/src/service-connection-store.ts:70 | connections/src/index.ts:48 | connections routes |
| `proposedCalls` | 11 | `recordProposedCall` | layers/core-api/review/src/proposed-call-workflow.ts:409 | review/src/index.ts | AL7 review flow |
| `serverCredentials` | 8 | `writeCredential` | layers/core-api/credentials/src/credential-store.ts:92 | credentials/src/index.ts:50 | settings routes |
| `filesystems` | 8 | `saveFilesystem` | layers/agent-orchestration/filesystems/src/filesystem-registry.ts:22 | filesystems/src/index.ts:19 | filesystem routes |
| `routineRuns` | 9 | `insertRoutineRun` | layers/core-api/routine/src/routine-service.ts:144 | routine/src/index.ts | routine-scheduler |
| `tailoredGrants` | 7 | `transitionProposedCall` | layers/core-api/review/src/proposed-call-workflow.ts:524 | review/src/index.ts | workflow byproduct |
| `knowledgeConflicts` | 7 | `recordConflict` | layers/core-api/knowledge/src/knowledge-conflicts.ts:49 | knowledge/src/index.ts | conflict detection |
| `knowledgeAccessLog` | 7 | `recordAccess` | layers/core-api/knowledge/src/knowledge-repository.ts:1547 | knowledge/src/index.ts | read path byproduct |
| `explicitSessionStarts` | 6 | `createSessionRequest` | layers/agent-orchestration/session-requests/src/service.ts:1630 | session-requests/src/index.ts:7 | explicit-start flow |
| `filesystemInjections` | 6 | `saveInjection` | layers/agent-orchestration/filesystems/src/filesystem-registry.ts:71 | filesystems/src/index.ts:20 | filesystem routes |
| `orgEdges` | 5 | `upsertOrgEdge` | layers/core-api/org/src/org-edges.ts:84 | org/src/index.ts | org routes |
| `serverConfig` | 4 | `updateServerConfig` | layers/core-api/settings/src/server-config.ts:283 | settings/src/index.ts | settings routes |
| `knowledgeEditLog` | 2 | `create` | layers/core-api/knowledge/src/knowledge-repository.ts:292 | knowledge/src/index.ts | byproduct |
| `inviteCodes` | 2 | `createInvite` | layers/core-api/users/src/invite-code.ts:32 | users/src/index.ts | invite flow |
| `operationOutcomes` | 1 | `transitionProposedCall` | layers/core-api/review/src/proposed-call-workflow.ts:605 | review/src/index.ts | workflow byproduct |
| `loginSessions` | 1 | `createLoginSession` | layers/core-api/users/src/login-session.ts:41 | users/src/index.ts | auth flow |

**Subtotal: 1,839 of 1,872 development writes (98.2%).**

**Group 2 — there is no production path. The direct write stays. Do not build one.**

| table | dev writes | why there is no production path |
|---|---|---|
| `taskPlanningSignals` | 10 | NONE — the table has no production writer anywhere. `layers/core-api/work/src/task-planning-signals.ts:9-11` says so in its own @lore: "there is no production writer anywhere in the repo yet (only test/seed fixtures insert rows directly)". |
| `userSkills` | 10 | NONE usable — the only production write is inside a route factory (`createUserRoutes`); the table is one of the six unowned ones (Ruling 12.2). |
| `propagationLog` | 6 | NONE usable — writers are private to `policy` (`policy-engine.ts:38`, `lifecycle-propagation.ts:215`); unowned table. |
| `taskDispatchAttempts` | 5 | NO public INSERT — `work.taskDispatchAttemptStore` (work/src/index.ts:110) exposes update/reap only; the insert lives in `policy/src/handoff-protocol.ts:322`. Unowned table. |
| `agentLifecycleInbox` | 2 | NONE — `appendLifecycleFactInternal` is deliberately private; the session-requests barrel exposes no append. |

**Subtotal: 33 of 1,872 development writes (1.8%).**

`taskPlanningSignals` is the purest case and it documents itself:
`layers/core-api/work/src/task-planning-signals.ts:9-11` — *"this is `work`'s only accessor for the
table today — there is no production writer anywhere in the repo yet (only test/seed fixtures insert
rows directly)."* Inventing `insertTaskPlanningSignal` for the tests would be exactly the dead code
the constraint forbids.

### 4.3 Is switching Group 1 worth it? Honestly: it varies

Two of the writers enforce something real:

- `layers/core-api/org/src/team-lookup.ts:225-230` — *"The 1:1 invariant makes a team without a
  membership group invalid, so both rows are inserted in one call. Callers that previously called
  `createTeam` + `createTeamMembersGroup` separately should migrate to this single call."*
  **159 test files insert `teams` and `teamMembers` as two separate statements** — including
  `layers/core-api/src/__tests__/bets.integration.test.ts:22-33` and the shared helper
  `layers/core-api/src/__tests__/_helpers.ts:60-63`. That is the founder's hazard, live, in the
  majority of the suite. Nothing today stops a test inserting `teams` alone and asserting on a state
  the product cannot reach.
- `layers/core-api/users/src/user-store.ts:136-144` — the docblock records that an agent's identity
  row and its `agent_run_config` row are two writes wrapped in one transaction, which is why the
  function takes a `WriteExecutor`.

Others are thin. `work.create` (`work-service.ts:627-645`) is a `switch` over four
`exec.insert(t).values(v)` calls. Calling it instead of `db.insert(bets)` buys the typed
`WorkEntityCreateMap` shape and the ownership seam — not an invariant. I am not going to claim
otherwise.

So the honest recommendation is graduated, not uniform:

1. **State the rule at the end state** — a development file writes a foreign table through the
   owner's existing exported writer. It is the same sentence as the production rule, which is what
   Ruling 12 asks for, and 98.2% of the population can satisfy it with the code that exists today.
2. **Set the dial to warn.** 1,839 call sites is a migration, and Ruling 12 says warn while a
   migration is in flight and never bend the rule to fit the mess.
3. **Sequence the migration by what it buys.** `teams`/`teamMembers` (518 sites, real invariant) and
   `users` (436 sites, transaction shape) first. The thin wrappers last, or never — that is a
   judgement call for whoever picks up the migration, and it is legitimate to leave the tail warning
   indefinitely rather than churn 300 lines for a typed alias.
4. **Group 2 (33 sites) is compliant by construction** — the rule reads "through the owner's writer
   *where one exists*", so a table with no writer is not a violation.

### 4.4 On fixture modules — the pattern already exists, and it is a convention, not a rule

The founder's alternative was to confine direct writes to fixture modules. I read what is there:

- `framework/db/src/__testing__/test-fixtures.ts` — the `db` fixture only (pool checkout + a Proxy
  that unwraps Drizzle's error wrapping). No domain data.
- `layers/core-api/src/__testing__/test-fixtures.ts` — `db` + `eventBus` + `app`, and it wires the
  three reactions production wires in `registerCoreDomainServices`. No domain data.
- `layers/core-api/src/__testing__/test-utils.ts` — `createTestApp`, the second of the repo's two
  composition roots. No domain data.
- `layers/core-api/src/__tests__/_helpers.ts:58-83` — **this one does seed**: `seedBase(db)` inserts
  `teams`, `teamMembers`, `users`, `threads`. Its own docblock (lines 6-14) says a near-identical copy
  lives in `layers/agent-orchestration/tool-handlers/src/__tests__/_helpers.ts` and explains why it
  was not extracted into a shared package.

So the pattern exists, works, and is development code end to end — it just is not used by most of the
suite. The duplication is measurable: **135 of the 249 files that insert rows seed the identical
`teams + teamMembers + users` base world**, and each one hand-rolls it (`bets.integration.test.ts:22-33`,
`bet-state-machine.integration.test.ts:24-60`, and so on).

**Recommendation: extend `seedBase` and have those 135 files call it — but do not make it an access
rule.** Reasons, plainly:

- It is a real duplication win, 135 copies of the same four inserts.
- It is *not* the fix for the founder's hazard. A fixture module that inserts `teams` without
  `teamMembers` is exactly as wrong as a test doing it, just wrong in one place. Only §4.2 closes that.
- It is not mechanically checkable as a boundary rule without inventing a "fixture module" file class,
  and there is no reason to add a file class to the classifier for a style preference.
- Where a test needs an unusual shape, inlining the insert is clearer than a fixture with eleven
  optional parameters. Forcing every write into a fixture would be churn.

Treat it as a convention in the developer guide, not as a row in the rule set.

---

## 5. The cases the founder flagged as uncertain

> not sure how tests that do eventing do or mcp or… that all depends on what tests actually test and
> what they need access to

Read them; they split cleanly.

**Eventing.** `layer → EventBus` (134 dev) and `service → EventBus` (17 dev) are **allowed in
production already** — no question arises. The only forbidden event rule is `framework → EventBus`,
31 instances, and all 31 are in `framework/shared/src/__tests__/`: the EventBus's own unit tests
(`event-bus.test.ts` 22), the thread-event type tests (5), the observability dispatcher's tests (3),
and one AL7 type test. Every one is a test **of** the event mechanism. None is a test that merely
needed state and reached for the bus to get it. **Relax.**

**MCP.** 11 instances, two distinct acts:
- **Tests of the bridge — 7.** `mcp-bridge-registry.test.ts` (3), `return-status-route.test.ts` (3),
  `mcp-bridge.test.ts` (1) call `createMcpToolBridge()` and exercise token mint/revoke
  (`mcp-bridge-registry.test.ts:39-47`). Legitimate — but note they sit in
  `layers/core-api/src/__tests__/` while the bridge lives in
  `layers/agent-execution/harness-registry/src/mcp/index.ts:18`. The crossing is an artifact of test
  placement, and Ruling 12.3's "give `agent-execution` its own app so it hosts the MCP router" is
  where it resolves.
- **Tests that boot the real bridge for a real subprocess — 4.**
  `assistant-reply-live-harness.integration.test.ts:113` mounts it through
  `createTestApp`'s `registerPreAuthRoutes` hook, at the same point production mounts it, because a
  spawned CLI makes real HTTP calls to it. The test is acting as the Application.

Both are legitimate; **relax**. The related `layer → agent-execution` api row (14 dev, all
`/api/mcp/` raw dials in `real-harness-return-enforcement-realbinary.integration.test.ts:380,468,560,635`)
is the same story from the other side — the test builds the URL it hands to the harness so the harness
dials the endpoint production also gives it. **Relax.**

**Raw runtime.** The one development instance outside `harness-registry` is
`tools/eval/src/judges.ts:502`, and it is not "a test that needs access" — it is a bench choosing a
different LLM path than the product's. **Hold.** Inside `harness-registry` the named row already
allows it, and its development instances are the real ones you would want: `execFileSync("claude")`
at `AN2-connection-provisioning.integration.test.ts:263`, `spawn("gh")` at `:699`, real MCP SDK
imports at `:172-173`.

---

## 6. Where development would be stricter than production — and the open decisions

**Nothing in the 121 comes out stricter in development than in production.** Every rule is either the
same verdict or looser. That is the expected shape and it held.

Three things deserve a founder call, none of them a change to an existing row:

**6.1 Ruling 7 and the Tooling role are now entirely a development-world question.** `tools/eval` is a
wholly-development package, so every Tooling row has **prod = 0**. The production verdicts for
`tooling → *` govern nothing. Two consequences:

- Ruling 7 grants Tooling blanket foreign-table access (329 dev instances). §4.2 would put
  layer/service development files under a narrower rule. That asymmetry is defensible only if there is
  a reason a bench cannot call an owner's writer — and today there partly is: Ruling 7 explicitly
  reserved `tooling → service` as still forbidden, which is precisely the import a bench would need.
  **If you apply §4.2 to Tooling as well, development becomes stricter than production for that role —
  the only place in the set where that shape arises.** My recommendation is to leave Ruling 7 as
  written and revisit when a bench actually seeds a table with a real invariant.
- I am **reversing Ruling 7's reservation on `tooling → service` for the development world**
  (4 imports, 3 manifest rows: `tools/eval/src/provision-harness.ts:16,21`). Ruling 7 reserved it when
  eval's files still counted as production; there is no production world for eval to breach. Flagging
  it because it is a reversal of a written ruling, not a gap in it.

**6.2 Harness honesty is a development-only rule with no production counterpart, and Ruling 10 stripped
its authority.** The repo enforces "a harness-facing test drives the real installed binary, never a
stub" through `layers/agent-execution/harness-registry/src/__tests__/require-harness.ts`,
`scripts/lib/honest-harness-predicate.ts` and the attestation agentic floor. Ruling 10 says no
inherited rule carries weight until re-argued. It is the one genuine candidate for a rule the
development world has and the production world does not. It is **not** in the 121 (no census row
covers "which adapter did the test use"), so it needs its own decision rather than a column in this
table.

**6.3 `sessions` (57 dev writes) sits on the completeness violation, not on this rule.** It has a
usable public creator (`createBareRun`, `run-orchestration/src/index.ts:40`, called from
`core-api/src/routes/sessions-routes.ts:263`), so it is in Group 1 — but the table has no owner
(Ruling 12.2), so "the owner's writer" has no referent until the sessions-ownership work package
lands. Same for `agentRunConfig` (35), which does have `writeAgentRunConfig` but no owner assignment.

---

## 7. Every rule

#### Relaxed as structural — the 25 of 42 rules that have development instances (1,852 instances)

| from | to | via | scope | prod | dev | dev instances | why |
|---|---|---|---|---|---|---|---|
| `layer` | `db:table (other)` | import | general | forbidden | **allowed** | 1269 | the symbol is needed for foreign READS (742) and for the 33 writes with no production path |
| `service` | `db:table (other)` | import | general | forbidden | **allowed** | 148 | same |
| `layer` | `service (other layer)` | import | general | forbidden | **allowed** | 147 | test wiring: 139 test bodies import a foreign-layer service to construct or seed it (AD1-create-item-routing.integration.test.ts:30) |
| `service` | `db:testing` | import | general | forbidden | **allowed** | 53 | same — 53 test bodies importing the db fixture surface; fully covered by the enforced rule |
| `service` | `layer (other)` | di | general | forbidden | **allowed** | 49 | 49 instances, all test bodies wiring toolHandlersPorts (AD1-create-item-routing.integration.test.ts:42) |
| `framework` | `EventBus` | event | general | forbidden | **allowed** | 31 | all 31 are the bus’s own tests in framework/shared/src/__tests__ — a test OF the mechanism, not a package using it |
| `framework` | `service` | di | general | forbidden | **allowed** | 29 | 29 instances, all test bodies injecting a real service into a framework-declared port |
| `service` | `service (same layer)` | import | general | forbidden | **allowed** | 24 | a test imports a sibling service to seed through its writer — the crossing that makes the table rule affordable (agent-run-boundary.integration.test.ts:4) |
| `layer` | `agent-execution` | api | named | forbidden | **allowed** | 14 | all 14 are in one file, real-harness-return-enforcement-realbinary.integration.test.ts:380,468,560,635 — the test builds the URL it hands to a real CLI subprocess so the harness dials the endpoint production also gives it |
| `framework` | `repo root` | import | general | forbidden | **allowed** | 13 | 13 tests of scripts/lib/* governance code that have nowhere else to live (ar1-attestation-floor.test.ts:29) |
| `framework` | `framework` | di | general | forbidden | **allowed** | 12 | test wiring; all 12 sit on the AK6 roster seam Ruling 9 step 6 already deletes |
| `application` | `service` | di | general | forbidden | **allowed** | 12 | test boots the server and injects a real sandbox adapter (app-runtime-route-boot.integration.test.ts:14) |
| `layer` | `db:testing` | import | general | forbidden | **allowed** | 11 | the target is development; the production column is 0 because the enforced Ruling 8.1 rule already covers it — this row is redundant, delete it |
| `layer` | `MCP router` | mcp | general | forbidden | **allowed** | 11 | 7 instances are tests OF the bridge, 4 are the test acting as the Application that mounts it (test-utils.ts:32-38) |
| `layer` | `application` | import | general | forbidden | **allowed** | 10 | the test IS the composition root: it imports create-server to boot the real app (app-runtime-route-boot.integration.test.ts:3) |
| `tooling` | `service` | import | general | forbidden | **allowed** | 4 | a bench provisioning a harness must reach the registry (tools/eval/src/provision-harness.ts:16,21) — reverses Ruling 7's reservation for the development world, see §6.1 |
| `service` | `service (other layer)` | import | general | forbidden | **allowed** | 3 | 3 test bodies (create-artifact.test.ts:27) |
| `tooling` | `service` | manifest | general | forbidden | **allowed** | 3 | tools/eval/package.json:17,19,21 — an all-development package |
| `layer` | `layer (other)` | import | general | forbidden | **allowed** | 2 | a development file boots a sibling layer to compose the system under test — test-utils.ts:3, two-app-mount-session-routes.integration.test.ts:31 |
| `layer` | `service (other layer)` | di | general | forbidden | **allowed** | 2 | test injects a real implementation into a port (assistant-reply-live-harness.integration.test.ts:315) |
| `service` | `service (other layer)` | di | general | forbidden | **allowed** | 1 | test wiring (agent-work-intent-production.integration.test.ts:652) |
| `layer` | `db:bootstrap` | import | general | forbidden | **allowed** | 1 | a test of applyFactoryBootstrap must call it (AF17-propagation-bootstrap.integration.test.ts:11); the function has a production caller in desktop/src/main.ts |
| `application` | `application` | import | general | forbidden | **allowed** | 1 | applications/desktop/__tests__/boot-server.test.ts:36 boots the real server |
| `layer` | `tooling` | import | general | forbidden | **allowed** | 1 | core-ui/__scripts__/ah5-resolve-model.ts:27 — a development file importing a development package |
| `layer` | `repo root` | import | general | forbidden | **allowed** | 1 | a test of a repo script imports it (review-trust.test.ts:13 → scripts/validation-composition.ts) |

#### Held as mechanism — the 6 of 12 rules that have development instances (2,629 instances, of which 742 are the reads §4.1 re-opens)

| from | to | via | scope | prod | dev | dev instances | why |
|---|---|---|---|---|---|---|---|
| `layer` | `db:table (other)` | table | general | forbidden | **forbidden** | 2380 | WRITE half only — 1,839 of 1,872 foreign-table development writes already have a barrel-exported, production-used owner writer; READS stay allowed. Split the kind. Warn, not fail. |
| `service` | `db:table (other)` | table | general | forbidden | **forbidden** | 234 | same |
| `layer` | `db:schema-ns` | import | general | forbidden | **forbidden** | 6 | `drizzle(client,{schema})` reimplements framework/db’s own createPgliteDb (connection.ts:71-74); use createTestDb() — core-ui/__scripts__/ah1-test-server.ts:28 |
| `application` | `db:unknown` | import | general | forbidden | **forbidden** | 6 | 6 instances import `seed`, which Ruling 9 step 1 already deletes (applications/desktop/__tests__/migrate.test.ts:54) |
| `tooling` | `db:schema-ns` | import | named | forbidden | **forbidden** | 2 | tools/eval/src/runner.ts:14,71 — same reimplementation, same one-line fix |
| `tooling` | `raw runtime` | capability | general | forbidden | **forbidden** | 1 | tools/eval/src/judges.ts:502 constructs @anthropic-ai/sdk directly, bypassing callLlm (harness-registry/src/llm-client.ts:670) — no cassette replay, locked to one provider (Ruling 8.4) |

#### Unchanged (allowed in both worlds) — the 35 of 67 rules that have development instances (1,684 instances)

| from | to | via | scope | prod | dev | dev instances | why |
|---|---|---|---|---|---|---|---|
| `tooling` | `db:table (other)` | table | general | allowed | **allowed** | 233 | allowed in production; nothing in the development world narrows it |
| `layer` | `framework/shared` | import | general | allowed | **allowed** | 218 | allowed in production; nothing in the development world narrows it |
| `layer` | `db:client` | import | general | allowed | **allowed** | 204 | allowed in production; nothing in the development world narrows it |
| `layer` | `service (same layer)` | import | general | allowed | **allowed** | 190 | allowed in production; nothing in the development world narrows it |
| `layer` | `EventBus` | event | general | allowed | **allowed** | 134 | allowed in production; nothing in the development world narrows it |
| `service` | `db:table (own)` | table | general | allowed | **allowed** | 130 | allowed in production; nothing in the development world narrows it |
| `tooling` | `db:table (other)` | import | general | allowed | **allowed** | 96 | allowed in production; nothing in the development world narrows it |
| `service` | `framework/shared` | import | general | allowed | **allowed** | 86 | allowed in production; nothing in the development world narrows it |
| `core-ui` | `framework/design-system` | import | named | allowed | **allowed** | 57 | allowed in production; nothing in the development world narrows it |
| `service` | `layer (own)` | di | general | allowed | **allowed** | 56 | allowed in production; nothing in the development world narrows it |
| `service` | `db:table (own)` | import | general | allowed | **allowed** | 55 | allowed in production; nothing in the development world narrows it |
| `service` | `db:client` | import | general | allowed | **allowed** | 48 | allowed in production; nothing in the development world narrows it |
| `framework` | `framework/shared` | import | general | allowed | **allowed** | 28 | allowed in production; nothing in the development world narrows it |
| `layer` | `service (same layer)` | di | general | allowed | **allowed** | 19 | allowed in production; nothing in the development world narrows it |
| `service` | `EventBus` | event | general | allowed | **allowed** | 17 | allowed in production; nothing in the development world narrows it |
| `tooling` | `framework/shared` | import | general | allowed | **allowed** | 12 | allowed in production; nothing in the development world narrows it |
| `service` | `framework` | di | general | allowed | **allowed** | 12 | allowed in production; nothing in the development world narrows it |
| `repo root` | `layer` | import | general | allowed | **allowed** | 12 | allowed in production; nothing in the development world narrows it |
| `layer` | `core-api` | api | named | allowed | **allowed** | 12 | allowed in production; nothing in the development world narrows it |
| `service` | `service (same layer)` | di | general | allowed | **allowed** | 10 | allowed in production; nothing in the development world narrows it |
| `tooling` | `db:client` | import | general | allowed | **allowed** | 10 | allowed in production; nothing in the development world narrows it |
| `harness-registry` | `MCP router` | mcp | named | allowed | **allowed** | 7 | allowed in production; nothing in the development world narrows it |
| `layer` | `db:row-type` | import | general | allowed | **allowed** | 6 | allowed in production; nothing in the development world narrows it |
| `application` | `db:client` | import | general | allowed | **allowed** | 6 | allowed in production; nothing in the development world narrows it |
| `tooling` | `layer` | import | general | allowed | **allowed** | 6 | allowed in production; nothing in the development world narrows it |
| `harness-registry` | `raw runtime` | capability | named | allowed | **allowed** | 6 | allowed in production; nothing in the development world narrows it |
| `service` | `db:row-type` | import | general | allowed | **allowed** | 3 | allowed in production; nothing in the development world narrows it |
| `repo root` | `tooling` | import | general | allowed | **allowed** | 3 | allowed in production; nothing in the development world narrows it |
| `layer` | `agent-orchestration` | api | named | allowed | **allowed** | 2 | allowed in production; nothing in the development world narrows it |
| `application` | `framework/shared` | import | general | allowed | **allowed** | 1 | allowed in production; nothing in the development world narrows it |
| `tooling` | `framework/shared` | manifest | general | allowed | **allowed** | 1 | allowed in production; nothing in the development world narrows it |
| `tooling` | `db:row-type` | import | general | allowed | **allowed** | 1 | allowed in production; nothing in the development world narrows it |
| `tooling` | `framework/db` | manifest | general | allowed | **allowed** | 1 | allowed in production; nothing in the development world narrows it |
| `layer` | `framework` | di | general | allowed | **allowed** | 1 | allowed in production; nothing in the development world narrows it |
| `tooling` | `layer` | manifest | general | allowed | **allowed** | 1 | allowed in production; nothing in the development world narrows it |

#### Rules with no development instance — 55 rules

| from | to | via | scope | prod | dev | why |
|---|---|---|---|---|---|---|
| `application` | `development file` | import | general | forbidden | **allowed** | development→development is not a crossing; the enforced rule is one-directional and only binds production files |
| `application` | `MCP router` | mcp | general | forbidden | **allowed** | the Application is the production mounting site and a test harness is an Application |
| `application` | `service` | import | general | forbidden | **allowed** | no development instance; same act as application→service di |
| `application` | `service` | manifest | general | forbidden | **allowed** | devDependencies — applications/desktop/package.json:21 |
| `application` | `application` | manifest | general | forbidden | **allowed** | devDependencies — applications/desktop/package.json:22-23 |
| `framework` | `development file` | import | general | forbidden | **allowed** | development→development is not a crossing; the enforced rule is one-directional and only binds production files |
| `framework` | `layer` | di | general | forbidden | **allowed** | same act as framework→service di; no development instance today |
| `layer` | `development file` | import | general | forbidden | **allowed** | development→development is not a crossing; the enforced rule is one-directional and only binds production files |
| `layer` | `layer (other)` | manifest | general | forbidden | **allowed** | the declaration sits in devDependencies; see §Manifest world |
| `layer` | `service (other layer)` | manifest | general | forbidden | **allowed** | devDependencies rows — layers/core-api/package.json:57-58 |
| `layer` | `application` | manifest | general | forbidden | **allowed** | devDependencies — layers/core-api/package.json:59, layers/core-ui/package.json:31 |
| `layer` | `tooling` | manifest | general | forbidden | **allowed** | layers/core-ui/package.json:30 is a devDependency — this is Ruling 8.1’s last production→tooling breach and it dissolves under the manifest-world fix |
| `service` | `development file` | import | general | forbidden | **allowed** | development→development is not a crossing; the enforced rule is one-directional and only binds production files |
| `service` | `service (same layer)` | manifest | general | forbidden | **allowed** | 14 devDependencies rows serving exactly those test imports |
| `service` | `service (other layer)` | manifest | general | forbidden | **allowed** | devDependencies rows — tool-handlers/package.json:20-21 |
| `service` | `MCP router` | mcp | general | forbidden | **allowed** | same act; no development instance today |
| `service` | `agent-execution` | api | named | forbidden | **allowed** | same act; no development instance today |
| `application` | `db:util` | import | general | forbidden | **forbidden** | same |
| `layer` | `framework/design-system` | import | general | forbidden | **forbidden** | only core-ui may (named row); zero development instances |
| `layer` | `framework/design-system` | manifest | general | forbidden | **forbidden** | same |
| `layer` | `db:util` | import | general | forbidden | **forbidden** | db:util is not database code; Ruling 12.3 moves it out of db |
| `layer` | `db:unknown` | import | general | forbidden | **forbidden** | db:unknown is not a surface — nothing can be permitted against it |
| `service` | `raw runtime` | capability | general | forbidden | **forbidden** | harness CLI spawn / raw LLM SDK / MCP SDK belong to harness-registry alone; no development instance |
| `agent-execution` | `MCP router` | mcp | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `agent-execution` | `raw runtime` | capability | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `framework/shared` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `db:row-type` | import | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `db:bootstrap` | import | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `framework/db` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `EventBus` | event | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `layer` | import | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `layer` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `agent-orchestration` | api | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `application` | `core-api` | api | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `core-ui` | `framework/design-system` | manifest | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `deployment` | `framework/shared` | import | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `deployment` | `framework/shared` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `deployment` | `db:row-type` | import | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `framework` | `framework/shared` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `harness` | `MCP router` | mcp | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `harness-registry` | `harness` | capability | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `layer` | `service (same layer)` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `layer` | `framework/shared` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `layer` | `framework/api-contract` | import | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `layer` | `framework/api-contract` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `layer` | `framework/db` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `service` | `framework/shared` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `service` | `db:util` | import | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `service` | `framework/db` | manifest | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `service` | `agent-orchestration` | api | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `service` | `core-api` | api | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `tooling` | `db:bootstrap` | import | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `tooling` | `EventBus` | event | general | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `tooling` | `agent-orchestration` | api | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |
| `tooling` | `core-api` | api | named | allowed | **allowed** | allowed in production; nothing in the development world narrows it |

---

## 8. Paste-ready export

Worksheet shape — `{from, to, via, prod, dev, why}`. Production verdicts are carried through from
`rule-set.json` unchanged. The last four entries are the recommended `table` kind split from §4.1 and
are **additions**, not replacements — adopt them together with the `db:table (other) | table` rows
they refine.

```json
{
 "au28Rulings": true,
 "census": "4af3c0e6",
 "at": "2026-08-05",
 "world": "development",
 "rules": [
 {"from":"layer","to":"development file","via":"import","prod":"forbidden","dev":"allowed","why":"development→development is not a crossing; the enforced rule is one-directional and only binds production files"},
 {"from":"service","to":"development file","via":"import","prod":"forbidden","dev":"allowed","why":"development→development is not a crossing; the enforced rule is one-directional and only binds production files"},
 {"from":"framework","to":"development file","via":"import","prod":"forbidden","dev":"allowed","why":"development→development is not a crossing; the enforced rule is one-directional and only binds production files"},
 {"from":"application","to":"development file","via":"import","prod":"forbidden","dev":"allowed","why":"development→development is not a crossing; the enforced rule is one-directional and only binds production files"},
 {"from":"layer","to":"layer (other)","via":"import","prod":"forbidden","dev":"allowed","why":"a development file boots a sibling layer to compose the system under test — test-utils.ts:3, two-app-mount-session-routes.integration.test.ts:31"},
 {"from":"layer","to":"layer (other)","via":"manifest","prod":"forbidden","dev":"allowed","why":"the declaration sits in devDependencies; see §Manifest world"},
 {"from":"layer","to":"service (same layer)","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"service (same layer)","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"service (same layer)","via":"di","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"service (other layer)","via":"import","prod":"forbidden","dev":"allowed","why":"test wiring: 139 test bodies import a foreign-layer service to construct or seed it (AD1-create-item-routing.integration.test.ts:30)"},
 {"from":"layer","to":"service (other layer)","via":"manifest","prod":"forbidden","dev":"allowed","why":"devDependencies rows — layers/core-api/package.json:57-58"},
 {"from":"layer","to":"service (other layer)","via":"di","prod":"forbidden","dev":"allowed","why":"test injects a real implementation into a port (assistant-reply-live-harness.integration.test.ts:315)"},
 {"from":"service","to":"layer (own)","via":"di","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"layer (other)","via":"di","prod":"forbidden","dev":"allowed","why":"49 instances, all test bodies wiring toolHandlersPorts (AD1-create-item-routing.integration.test.ts:42)"},
 {"from":"service","to":"service (same layer)","via":"import","prod":"forbidden","dev":"allowed","why":"a test imports a sibling service to seed through its writer — the crossing that makes the table rule affordable (agent-run-boundary.integration.test.ts:4)"},
 {"from":"service","to":"service (same layer)","via":"manifest","prod":"forbidden","dev":"allowed","why":"14 devDependencies rows serving exactly those test imports"},
 {"from":"service","to":"service (same layer)","via":"di","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"service (other layer)","via":"import","prod":"forbidden","dev":"allowed","why":"3 test bodies (create-artifact.test.ts:27)"},
 {"from":"service","to":"service (other layer)","via":"manifest","prod":"forbidden","dev":"allowed","why":"devDependencies rows — tool-handlers/package.json:20-21"},
 {"from":"service","to":"service (other layer)","via":"di","prod":"forbidden","dev":"allowed","why":"test wiring (agent-work-intent-production.integration.test.ts:652)"},
 {"from":"layer","to":"framework/shared","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"framework/shared","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"framework/shared","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"framework/shared","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"framework/shared","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"framework/shared","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"framework/shared","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"framework/shared","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"deployment","to":"framework/shared","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"deployment","to":"framework/shared","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"framework","to":"framework/shared","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"framework","to":"framework/shared","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"framework/api-contract","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"framework/api-contract","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"framework/design-system","via":"import","prod":"forbidden","dev":"forbidden","why":"only core-ui may (named row); zero development instances"},
 {"from":"layer","to":"framework/design-system","via":"manifest","prod":"forbidden","dev":"forbidden","why":"same"},
 {"from":"layer","to":"db:row-type","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"db:row-type","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"db:row-type","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"db:row-type","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"deployment","to":"db:row-type","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"db:schema-ns","via":"import","prod":"forbidden","dev":"forbidden","why":"`drizzle(client,{schema})` reimplements framework/db’s own createPgliteDb (connection.ts:71-74); use createTestDb() — core-ui/__scripts__/ah1-test-server.ts:28"},
 {"from":"application","to":"db:client","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"db:client","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"db:client","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"db:client","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"db:bootstrap","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"db:bootstrap","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"db:bootstrap","via":"import","prod":"forbidden","dev":"allowed","why":"a test of applyFactoryBootstrap must call it (AF17-propagation-bootstrap.integration.test.ts:11); the function has a production caller in desktop/src/main.ts"},
 {"from":"layer","to":"db:util","via":"import","prod":"forbidden","dev":"forbidden","why":"db:util is not database code; Ruling 12.3 moves it out of db"},
 {"from":"service","to":"db:util","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"db:util","via":"import","prod":"forbidden","dev":"forbidden","why":"same"},
 {"from":"layer","to":"db:testing","via":"import","prod":"forbidden","dev":"allowed","why":"the target is development; the production column is 0 because the enforced Ruling 8.1 rule already covers it — this row is redundant, delete it"},
 {"from":"service","to":"db:testing","via":"import","prod":"forbidden","dev":"allowed","why":"same — 53 test bodies importing the db fixture surface; fully covered by the enforced rule"},
 {"from":"layer","to":"db:unknown","via":"import","prod":"forbidden","dev":"forbidden","why":"db:unknown is not a surface — nothing can be permitted against it"},
 {"from":"application","to":"db:unknown","via":"import","prod":"forbidden","dev":"forbidden","why":"6 instances import `seed`, which Ruling 9 step 1 already deletes (applications/desktop/__tests__/migrate.test.ts:54)"},
 {"from":"layer","to":"framework/db","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"framework/db","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"framework/db","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"framework/db","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"db:table (own)","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"db:table (own)","via":"table","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"db:table (other)","via":"import","prod":"forbidden","dev":"allowed","why":"the symbol is needed for foreign READS (742) and for the 33 writes with no production path"},
 {"from":"layer","to":"db:table (other)","via":"table","prod":"forbidden","dev":"forbidden","why":"WRITE half only — 1,839 of 1,872 foreign-table development writes already have a barrel-exported, production-used owner writer; READS stay allowed. Split the kind. Warn, not fail."},
 {"from":"service","to":"db:table (other)","via":"import","prod":"forbidden","dev":"allowed","why":"same"},
 {"from":"service","to":"db:table (other)","via":"table","prod":"forbidden","dev":"forbidden","why":"same"},
 {"from":"tooling","to":"db:table (other)","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"db:table (other)","via":"table","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"framework","to":"layer","via":"di","prod":"forbidden","dev":"allowed","why":"same act as framework→service di; no development instance today"},
 {"from":"framework","to":"service","via":"di","prod":"forbidden","dev":"allowed","why":"29 instances, all test bodies injecting a real service into a framework-declared port"},
 {"from":"layer","to":"EventBus","via":"event","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"EventBus","via":"event","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"EventBus","via":"event","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"EventBus","via":"event","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"framework","to":"EventBus","via":"event","prod":"forbidden","dev":"allowed","why":"all 31 are the bus’s own tests in framework/shared/src/__tests__ — a test OF the mechanism, not a package using it"},
 {"from":"layer","to":"framework","via":"di","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"framework","via":"di","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"framework","to":"framework","via":"di","prod":"forbidden","dev":"allowed","why":"test wiring; all 12 sit on the AK6 roster seam Ruling 9 step 6 already deletes"},
 {"from":"layer","to":"MCP router","via":"mcp","prod":"forbidden","dev":"allowed","why":"7 instances are tests OF the bridge, 4 are the test acting as the Application that mounts it (test-utils.ts:32-38)"},
 {"from":"service","to":"MCP router","via":"mcp","prod":"forbidden","dev":"allowed","why":"same act; no development instance today"},
 {"from":"application","to":"MCP router","via":"mcp","prod":"forbidden","dev":"allowed","why":"the Application is the production mounting site and a test harness is an Application"},
 {"from":"harness","to":"MCP router","via":"mcp","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"raw runtime","via":"capability","prod":"forbidden","dev":"forbidden","why":"harness CLI spawn / raw LLM SDK / MCP SDK belong to harness-registry alone; no development instance"},
 {"from":"tooling","to":"raw runtime","via":"capability","prod":"forbidden","dev":"forbidden","why":"tools/eval/src/judges.ts:502 constructs @anthropic-ai/sdk directly, bypassing callLlm (harness-registry/src/llm-client.ts:670) — no cassette replay, locked to one provider (Ruling 8.4)"},
 {"from":"application","to":"layer","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"layer","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"service","via":"import","prod":"forbidden","dev":"allowed","why":"no development instance; same act as application→service di"},
 {"from":"application","to":"service","via":"manifest","prod":"forbidden","dev":"allowed","why":"devDependencies — applications/desktop/package.json:21"},
 {"from":"application","to":"service","via":"di","prod":"forbidden","dev":"allowed","why":"test boots the server and injects a real sandbox adapter (app-runtime-route-boot.integration.test.ts:14)"},
 {"from":"application","to":"application","via":"import","prod":"forbidden","dev":"allowed","why":"applications/desktop/__tests__/boot-server.test.ts:36 boots the real server"},
 {"from":"application","to":"application","via":"manifest","prod":"forbidden","dev":"allowed","why":"devDependencies — applications/desktop/package.json:22-23"},
 {"from":"tooling","to":"layer","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"layer","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"service","via":"import","prod":"forbidden","dev":"allowed","why":"a bench provisioning a harness must reach the registry (tools/eval/src/provision-harness.ts:16,21) — reverses Ruling 7's reservation for the development world, see §6.1"},
 {"from":"tooling","to":"service","via":"manifest","prod":"forbidden","dev":"allowed","why":"tools/eval/package.json:17,19,21 — an all-development package"},
 {"from":"layer","to":"application","via":"import","prod":"forbidden","dev":"allowed","why":"the test IS the composition root: it imports create-server to boot the real app (app-runtime-route-boot.integration.test.ts:3)"},
 {"from":"layer","to":"application","via":"manifest","prod":"forbidden","dev":"allowed","why":"devDependencies — layers/core-api/package.json:59, layers/core-ui/package.json:31"},
 {"from":"layer","to":"tooling","via":"import","prod":"forbidden","dev":"allowed","why":"core-ui/__scripts__/ah5-resolve-model.ts:27 — a development file importing a development package"},
 {"from":"layer","to":"tooling","via":"manifest","prod":"forbidden","dev":"allowed","why":"layers/core-ui/package.json:30 is a devDependency — this is Ruling 8.1’s last production→tooling breach and it dissolves under the manifest-world fix"},
 {"from":"repo root","to":"layer","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"repo root","to":"tooling","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"repo root","via":"import","prod":"forbidden","dev":"allowed","why":"a test of a repo script imports it (review-trust.test.ts:13 → scripts/validation-composition.ts)"},
 {"from":"framework","to":"repo root","via":"import","prod":"forbidden","dev":"allowed","why":"13 tests of scripts/lib/* governance code that have nowhere else to live (ar1-attestation-floor.test.ts:29)"},
 {"from":"tooling","to":"db:schema-ns","via":"import","prod":"forbidden","dev":"forbidden","why":"tools/eval/src/runner.ts:14,71 — same reimplementation, same one-line fix"},
 {"from":"core-ui","to":"framework/design-system","via":"import","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"core-ui","to":"framework/design-system","via":"manifest","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"harness-registry","to":"harness","via":"capability","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"agent-execution","to":"MCP router","via":"mcp","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"harness-registry","to":"MCP router","via":"mcp","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"harness-registry","to":"raw runtime","via":"capability","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"agent-execution","to":"raw runtime","via":"capability","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"agent-orchestration","via":"api","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"application","to":"core-api","via":"api","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"agent-execution","via":"api","prod":"forbidden","dev":"allowed","why":"all 14 are in one file, real-harness-return-enforcement-realbinary.integration.test.ts:380,468,560,635 — the test builds the URL it hands to a real CLI subprocess so the harness dials the endpoint production also gives it"},
 {"from":"layer","to":"agent-orchestration","via":"api","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"core-api","via":"api","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"agent-execution","via":"api","prod":"forbidden","dev":"allowed","why":"same act; no development instance today"},
 {"from":"service","to":"agent-orchestration","via":"api","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"service","to":"core-api","via":"api","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"agent-orchestration","via":"api","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"tooling","to":"core-api","via":"api","prod":"allowed","dev":"allowed","why":"allowed in production; nothing in the development world narrows it"},
 {"from":"layer","to":"db:table (other)","via":"table:read","prod":"forbidden","dev":"allowed","why":"RECOMMENDED SPLIT of the `table` kind. A read creates no state production could not produce; 708 development reads."},
 {"from":"layer","to":"db:table (other)","via":"table:write","prod":"forbidden","dev":"forbidden","why":"RECOMMENDED SPLIT. 1,672 development writes; the owner already exports a production-used writer for all but ~30. Warn, not fail."},
 {"from":"service","to":"db:table (other)","via":"table:read","prod":"forbidden","dev":"allowed","why":"RECOMMENDED SPLIT. 34 development reads."},
 {"from":"service","to":"db:table (other)","via":"table:write","prod":"forbidden","dev":"forbidden","why":"RECOMMENDED SPLIT. 200 development writes. Warn, not fail."}
 ]
}
```

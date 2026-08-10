# AU31 wave A — code review

**Scope reviewed.** `git diff origin/main...HEAD` at `78996283` (base `59b9299a`), 59 production files
+ artifacts, four builder sessions, reviewed as one integrated change. Wave B's file set
(`run-orchestration-composition.ts`, `tool-handlers-bindings.ts`, `tool-provider-bindings.ts`,
`session.ts`, the application rows, §2.5's `CoreApiPort` workflow ops), the three known-open
lifecycle-drain sites (`service-bootstrap.ts:38`, `services/durable-agent-queue.ts:83`,
`service-bootstrap.ts:339`) and R2's launder rule are out of scope by orchestrator decision and are
not assessed here.

**Verdict: NOT DONE** — 2 blocking findings.

---

## What I re-ran, not took on trust

| Gate | Result | Builder's claim |
|---|---|---|
| `npm run check` | **PASS** — `typecheck-gate: PASS — all 34 packages checked` | 34/34 ✓ matches |
| `npm run lint` | **PASS** — `187 production + 0 development known violation(s) at warn`; fixtures 63 PASS, attacks 49 PASS | zero errors, 187 ✓ matches |
| `npm run test:full` | **PASS** — 562 files, 6193 tests | 6193 ✓ matches |
| `npm run test:integration:service` | **PASS** — 322 files, 2842 passed / 4 skipped | 2842 + 4 pre-existing skips ✓ matches |
| `npm run mock-inventory:check` | **PASS** | not claimed |
| `npm run deps:check` | **FAIL, exit 1** | not claimed — see B1 |
| `npm run knip` | **FAIL, exit 1** | not claimed — see B1 |
| `npm run knip:production` | **FAIL, exit 1** | not claimed — see B1 |
| The WP's own transaction-threading probe, re-run on this tree (`.pipeline/work/AU31/probes/p3b-transaction-threading/find-tx-threaded-calls.mjs`) | 20 tx bodies, **zero** orchestration callees remaining inside any core transaction | — |
| The four inverted suites + the new port-writes suite, run alone | 5 files, 60 tests passed | — |

Every numeric claim the builder made is true. Three gates that `npm run verify` chains were not run and
are red.

---

## AC-by-AC

Wave A owns no plan AC end-to-end except the "green tree" half of AC 7 — §12 assigns every key
deletion and every face/composition obligation to wave B. Stated plainly per AC:

| AC (`plan.md:47-53`) | Owner | Status |
|---|---|---|
| 1 — no layer names another layer or its services (imports + manifest) | **wave B** completes it; wave A owed its own call-site + manifest share | **Wave A share met.** Every §2.2/§2.3/§2.6/§3.1 call site converted; the 12 remaining `layer → service (other layer) [import]` sites are exactly `run-orchestration-composition.ts` (×4), `tool-handlers-bindings.ts` (×2), `tool-provider-bindings.ts` (×2), `session.ts` (×2) and the two known-open drain sites — the post-wave-A inventory §12 predicted, nothing extra. `layers/core-api/package.json` lost its `filesystems` row. **But** the new `layers/agent-orchestration/src/routes/agent-orchestration-intake.ts` needs a manifest row nobody added (B1). |
| 2 — no cross-layer DI | **wave B** | Wave A share met: `policy-bindings.ts`, `routine-scheduler-bindings.ts`, `org.ts`, `users.ts`, `assistant.ts`, `teams-routes.ts`, `bets.ts`, `tasks.ts`, `app.ts` all inject seam-backed adapters now. 3 di sites remain, all wave-B/known-open. |
| 3 — applications compose faces only | **wave B** | Not wave A. |
| 4 — MCP router dialled by the harness-owning layer | **wave B** | Not wave A. |
| 5 — every owned key removed from `governance/rule-severity.json` | **wave B** | `governance/rule-severity.json` is unchanged — **correct** per §12.1/§12 ("Wave A deletes no key"), not an omission. |
| 6 — AU28 bookkeeping gone | moot upstream (AU32) | Nothing built, nothing needed. |
| 7 — `npm run verify` green + one real agent run | wave A owes the green tree; the run is ship-time | **FAILS.** `deps:check`, `knip` and `knip:production` are red on this tree, all three from files this diff introduced (B1). |

Beyond the plan, the architecture's own locked contracts:

| Contract | Status |
|---|---|
| §3.1 — nine relinquishments, window named in code, core-commits-first order, failure surfaces | **7 of 9 fully correct; 2 violate the rule's own first clause** (B2). Sites 1, 3, 5, 6, 7, 8, 9 are exact. |
| §3.1 — site 7's reorder ahead of the transaction ("free lever") | **Correct**, with the residue named in both `handoff-protocol.ts` and `policy/src/ports.ts`. |
| §3.1 — site 8's founder-ruled error handling | **Correct**: `catch` → `updateRoutineRun(db, runId, {outcome:"error", endedAt, errorMessage}, {onlyIfRunning:true})` → `throw` (`routine-scheduler.ts:658-671`). No outbox, saga, sweeper, reconciler, retry loop or new table; the owning service's existing entry point; nothing new exported for it. |
| §3.1 — the two reads hoisted, not relinquished | **Correct and genuinely value-identical.** |
| §3.1 — the shipped suites inverted, none bent back, none deleted | **Correct**, all four. |
| §3.2 — the module singleton deleted, port per composition, in a function body | **Correct.** |
| §2.8 — `validateAgentConfig` relocation | **Correct.** |
| §3 clause 2 — `intents.createExplicitStart` stays atomic orchestration-side | **Correct.** |
| §10 — "each of the nine relinquished windows gets a targeted test" | **Partially met** — N2. |

---

## BLOCKING

### B1 — `npm run verify` is red: three gates fail, all on files this diff adds

`npm run deps:check` exits 1:

```
Imported but not declared (4) — resolves only by workspace hoisting:
  layers/agent-orchestration  needs  @hyperidle/agent-run-config
    e.g. layers/agent-orchestration/src/routes/agent-orchestration-intake.ts
  tools/eval  needs  @hyperidle/agent-orchestration
  tools/eval  needs  @hyperidle/api-contract
  tools/eval  needs  hono
    e.g. tools/eval/src/agent-orchestration-fixture.ts
Declared but never referenced (1):
  layers/agent-orchestration/agent-run-config  drop  @hyperidle/shared
```

`npm run knip` and `npm run knip:production` both exit 1 on the same causes
(`Unused dependencies (1) @hyperidle/shared layers/agent-orchestration/agent-run-config/package.json:15:4`;
`Unlisted dependencies (1) hono tools/eval/src/agent-orchestration-fixture.ts:23:27`).

**All five are caused by this diff, not inherited.**
- `layers/agent-orchestration/src/routes/agent-orchestration-intake.ts:21-28` imports
  `@hyperidle/agent-run-config`; the file is new here and the layer manifest
  (`layers/agent-orchestration/package.json:14-25`) never gained the row, so it resolves only by hoisting.
- `tools/eval/src/agent-orchestration-fixture.ts` is new here and imports `@hyperidle/agent-orchestration`,
  `@hyperidle/api-contract` and `hono`; `tools/eval/package.json:13-20` declares none of them.
- `@hyperidle/shared` became unreferenced in `agent-run-config` the moment §2.8 moved
  `validate-agent-config.ts` out — it was that file's import
  (`git show origin/main:layers/agent-orchestration/agent-run-config/src/validate-agent-config.ts:23`),
  and `rg "@hyperidle/shared" layers/agent-orchestration/agent-run-config/src/` now returns nothing.

**Impact.** AC 7 fails on this tree and `npm run verify` cannot be green, so wave B inherits a red
baseline and CI cannot pass. Wave A's own leaf A3 is "manifest rows whose last import cleared" — this is
that leaf, in both directions.

**Smallest fix.** Four manifest lines and one deletion:
add `"@hyperidle/agent-run-config": "*"` to `layers/agent-orchestration/package.json` dependencies
(same-layer service, so no governance manifest crossing); add `"@hyperidle/agent-orchestration"`,
`"@hyperidle/api-contract"` and `"hono"` to `tools/eval/package.json` dependencies; delete
`"@hyperidle/shared"` from `layers/agent-orchestration/agent-run-config/package.json:15`. Then re-run
`deps:check`, `knip`, `knip:production`.

### B2 — Sites 2 and 4 deleted the core transaction as well as the cross-layer one

§3.1's one rule is explicit about what survives: *"The core transaction commits; the seam call
follows."* Seven sites do exactly that — `threads.ts:1441` (site 5), `task-state-machine.ts:89` (site 6),
`handoff-protocol.ts:131` (site 7), `routine-scheduler.ts:620` (site 8) and
`proposed-call-workflow.ts:536` (site 9) all keep their `db.transaction` and hoist only the seam write
out of it. Two sites removed the transaction entirely, and both wrap **two core writes**:

1. `layers/core-api/src/routes/teams-routes.ts:276` — `await createTeam(db, {...})`.
   `createTeam` is not internally transactional: `layers/core-api/org/src/team-lookup.ts:252` inserts
   `teams`, `:260` inserts `teamMembers`, on whatever executor it is handed. On `origin/main` those two
   inserts committed together (`await createTeam(tx, …)` inside `db.transaction`). Now a failure between
   them leaves a `teams` row with **no `teamMembers` companion** — the exact state the project's own
   governance model calls one "production cannot produce" (`write-the-whole-row-set`,
   `scripts/lib/governance-model.ts:377-389`), and the state `deriveTeamStatus` and every capacity read
   join against. The architecture's named repair for site 2 ("the team settings edit repairs it") repairs
   the run-config defaults; **nothing repairs a missing `teamMembers` row**, so this residue is not the
   one that was ruled and named.
2. `layers/core-api/src/routes/knowledge.ts:890` — `await knowledgeTransition(db, item.id, {target:"flag", …})`.
   The `flag` case is likewise two unwrapped writes on the handle it is given
   (`layers/core-api/knowledge/src/knowledge-repository.ts:1295` UPDATE `knowledgeItems`, `:1299` INSERT
   `knowledgeEditLog`) — the only transition case in that switch with no transaction of its own. Previously
   both committed together; now a flagged item can exist with no audit-log row.

The founder ruling relinquishes **cross-layer** atomicity ("no overengineering for things that don't
matter in reality"). Nothing ruled that two core writes may stop committing together, and preserving it
is free — it is the shape the other five sites already use. The inverted test for site 4 in fact asserts
both core writes landed (`editLogCountBeforeFlag + 1`), which is exactly the pair that is no longer atomic.

**Smallest fix**, per site: re-wrap the core write(s) in `db.transaction`, leave the seam call after it,
keep the window comment as written. E.g.

```ts
await db.transaction(async (tx) => {
  await createTeam(tx, { /* unchanged */ });
});
await agentOrchestration.runConfig.writeTeamDefaults(teamId, { /* unchanged */ });
```

and the same shape around `knowledgeTransition` in `knowledge.ts`. No test changes needed — the
inverted assertions hold either way.

---

## NON-BLOCKING DEFECTS

**N1 — a new production export with zero consumers.**
`layers/core-api/routine/src/index.ts:91` re-exports `resolveRoutineRunTargetAgent`, but the only
production consumer imports it relatively (`routine-scheduler.ts:74`, `from "./routine-service.js"`) and
the only test consumer does too (`routine-run-resolver.integration.test.ts:149`,
`await import("../routine-service.js")`). Nothing reads it through the barrel. `plan.md:34` forbids adding
a production export only tests consume; this one has no consumer at all, and knip's `--include files` scope
does not catch it. Fix: delete the line.

**N2 — §10's per-window test obligation is met for six of nine sites.**
Failure-window tests exist for sites 1 and 2 (`agent-and-team-creation-atomicity`), 4, 5 and 8
(`agent-work-intent-production`, two cases) and 7 (`handoff-to:354` + `handoff-protocol:694`). Sites 3, 6
and 9 have only positive-path coverage (`agent-work-intent-production:316,:640,:676`). The positive paths
are the ones that matter most — each drives the real seam through the real route, so a mis-hoisted call
would deadlock the suite rather than pass it — which is why this is not blocking. But §10 says "each of
the nine", and three windows are asserted by reading the code only.

**N3 — on a seam failure the committed core row emits no domain event.**
Sites 4, 5 and 6 place the seam write before the post-commit `eventBus.emit`
(`knowledge.ts:890-950`, `threads.ts:1497-1543`, `task-state-machine.ts:171-184`), so a failed submit
throws past the emit: the row is committed but `thread_message_appended` / `task_state_changed` never
fire, and the SSE push gateway and event-driven reactions never see it. §3.1 says "the post-commit events
that exist today emit in the order they emit today" and describes the residue as *visible*; here it is
committed-but-unannounced. Cheap fix if wanted: emit before the seam call at those three sites.

**N4 — the ignored-executor parameter is a live trap.**
`buildSeamBackedWorkIntentRecorder`'s `record(_tx, …)`
(`agent-orchestration-port-composition.ts:474`) and `buildSeamBackedAgentRunConfigWriter`'s
`writeAgentRunConfig(_db, …)` (`:496`) silently discard the executor, and
`transitionProposedCall`'s first parameter is still **named `tx`** while `:594`'s
`ports.intentRecorder.record(tx, pendingIntent)` now requires it to be a pooled handle
(`proposed-call-workflow.ts:496`). A future caller who passes a real transaction handle gets a silent
relinquishment plus the deadlock this WP root-caused twice by bisection. The seam is now the only
implementation of both interfaces, so dropping the parameter — or at minimum renaming `tx` to `exec`
at `proposed-call-workflow.ts:496` — removes the trap rather than documenting it.

**N5 — the eval fixture leaks its boot.**
`tools/eval/src/agent-orchestration-fixture.ts:39-42` calls `bootAgentOrchestration` and never disposes
it; the `SessionActivityBuffer` and session-activity gateway stay subscribed to the bus
(`layers/agent-orchestration/src/boot.ts:100-104`). Its twin in
`layers/core-api/src/__testing__/test-fixtures.ts:112` does call `orchestrationBoot.dispose()`.

**N6 — two `@lore` blocks now contradict the code they sit next to.**
`layers/core-api/work/src/ports.ts:80-91` still states the recorder port is "RULED PERMANENT" *because*
`deps.workIntents.record(tx, {...})` runs "**inside the same `db.transaction`**" — that is now false for
site 6 in the very same package, and the file it cites (`bet-decomposition.ts`) no longer exists.
`layers/core-api/work/src/bet-kill-cascade.ts:13` still says `routes/bets.ts` wires it to
`@hyperidle/run-orchestration`, which `bets.ts:692-696` no longer does.

**N7 — a defensive default for a branch the code says cannot happen.**
`layers/core-api/src/routes/agents.ts:88-96` hand-mirrors `DEFAULT_AGENT_RUN_CONFIG` as
`EMPTY_RUN_CONFIG_VIEW` purely as the `??` fallback at `:204`, and its own comment says
`runConfig.readBatch` "already fills every requested id". Either the fallback is reachable (then the
comment is wrong) or it is not (then it is dead code duplicating a constant that must now be kept in sync
by hand).

**N8 — the fixture can boot two orchestration layers onto one bus.**
`layers/core-api/src/__testing__/test-fixtures.ts` boots one in the `eventBus` fixture (`:79`) and a second,
independent one in the `agentOrchestration` fixture (`:112`); a test requesting both gets two
`SessionActivityBuffer`s and two activity gateways subscribed to the same `EventBus`. Harmless today
(each buffer feeds its own hub, both are disposed), but it is a duplicate-subscription flake waiting for a
reaction that is not idempotent.

---

## FOLLOW-UP / NOTES (not assigned)

- `AppOptions.agentOrchestration` is optional in the type with a runtime throw
  (`layers/core-api/src/app.ts:374-381`). §3.2 clause 2's "required, not optional" is honoured where it
  matters (`registerCoreDomainServices`/`registerAgentLayerServices` ctx are required), and the throw is
  named and loud; a `db`-carrying variant would make it a compile error instead. Wave B's `bootCoreApi`
  reshaping is the natural place, not here.
- The new intake routes declare `requireBoundary({ kind: "public-data" })` like their sibling read routes,
  and §9 already ruled the abuse case ("an authenticated agent calling the intake door directly — that is
  the trust model working as designed"). The new suite even proves the door is real
  (`agent-orchestration-port-writes.integration.test.ts:423`, "a raw call with no credentials is rejected").
  Recorded so the next reviewer does not re-litigate it.
- `filesystems.getTeamId` conflating "absent" with "no team" was checked and is safe:
  `filesystems.team_id` is `notNull` (`framework/db/src/schema.ts:1217-1219`), so `null` means absent and
  the 404 is faithful.

## What is demonstrably right

Worth stating because it is the bulk of the change and it is sound:

- **No seam callee is left inside a core transaction.** Re-running the WP's own probe on this tree returns
  20 transaction bodies threading their handle, and every callee in every core one resolves to a core
  service (`work`, `conversation`, `knowledge`, `review`, `users`, `settings`, `org`, `routine`). The four
  core service packages (`work`, `policy`, `routine`, `review`) contain zero `@hyperidle/session-requests`
  / `agent-run-config` / `run-orchestration` / `filesystems` imports — only comment references. The one
  `enqueueWorkIntent(tx, …)` that remains is orchestration-side and in-layer, inside the atomic-pair op
  (`agent-orchestration-intake.ts:169`).
- **The hoisted reads are genuinely identical.** Site 8's transaction writes `routineRuns` (plus core
  thread/item rows); the hoisted reads touch `sessions` (`runs.isAtCapacity`) and `agent_run_config`
  (`runConfig.read` inside the concurrency-bound reader). Neither table is written in that transaction, and
  the coalescing guard still runs before the hoist (`routine-scheduler.ts:606-617`), so ordering is
  preserved. `selectRoutineDelegate`'s reads (`userSkills`, capacity) are likewise untouched by the
  transaction.
- **Site 8's error handling is ordinary error handling.** One `catch`, one guarded state write through
  the owning service's existing `updateRoutineRun`, then `throw`. The recovery claim is proven rather than
  asserted: `agent-work-intent-production` pins `outcome:"error"` on both the manual and scheduler paths,
  and `routine-scheduler.au15.integration.test.ts:232-296` proves a non-`running` run stops blocking the
  next fire.
- **The inversions are honest.** Every removed assertion in the diff is one of the six deliberate
  inversions and each is replaced by an equal-or-stronger one; test-case counts are balanced file by file
  (−4/+4, −10/+10, −2/+2, −1/+1) with +16 net new, so nothing was deleted to avoid a problem. The AU26
  review W10 reversal is explicit in the suite header and matches §3.1's own instruction. The
  concurrency case honestly re-asserts the wider consequence of site 7's reorder (both racing sessions
  end, not one) rather than hiding it.
- **§3.2 is clean.** `registerAgentOrchestrationTransport`/`getRegisteredAgentOrchestrationTransport` are
  gone from the tree (only a `@lore` naming them survives); production and the test harness each close the
  construction cycle with a root-local `let` inside a function body
  (`create-server.ts:697-713`, `test-utils.ts:70-88`) with a named error before the binding is filled; the
  `CoreApiPort` singleton is untouched, as clause 7 allows; and no layer function is injected into another
  layer anywhere in the new wiring — the seam-backed adapters are built from the port, in core, and passed
  down to core-owned services only.
- **§2.8 is complete.** File and suite moved (git records both as renames), both barrel exports deleted
  from `agent-run-config/src/index.ts`, zero residual references, and both call sites still validate before
  any side effect (`agents.ts:248` before the FK probe and `insertUser`; `assistant.ts:412` before the user
  lookup and `persistScaffoldedAgents`), so a bad triple is still a clean 422.
- **Both manifest respells are correct**: `@hyperidle/filesystems` and `@hyperidle/harness-registry` now
  have only development importers in their respective packages.

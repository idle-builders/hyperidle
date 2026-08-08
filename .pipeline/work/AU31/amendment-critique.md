# AU31 amendment critique — confined scope (§3.1, §3.2, §3 clauses 1–2, §5 row, §10, §12, §13, feasibility P3/P3b/P10, probes/p3b-transaction-threading/)

Scope respected: the six per-service verdicts, the 93-site accounting, the wave split, the face
definition, the `db:util`/AU29 rulings, §11's evidence run and **R2** were not read for findings.

## GAP 1 — corrected atomicity inventory: **PASS** (method sound, hoist safe)

**Reproduction.** `node .pipeline/work/AU31/probes/p3b-transaction-threading/find-tx-threaded-calls.mjs`
re-run at HEAD reproduces the recorded `output.txt` exactly as a set: 24 files, 25 tx-threaded bodies,
same bodies, same call lines (block order differs only because `rg -l` file order is not stable — a
recorded-run note, not a defect). 9 cross-boundary transactions, 10 orchestration writes confirmed.

**Brace caveat is real and handled.** `layers/core-api/work/src/task-state-machine.ts:73` is
`async (tx): Promise<{ fromState: TaskState } | null> => {`. A body match anchored on the first `{`
after `.transaction(` lands on the annotation and truncates the body at `TaskState }` — site 6 would
vanish with no output change. The script anchors after `=>` (`find-tx-threaded-calls.mjs:41-43`), and
my independent re-implementation computes the body as `72..152`, which covers `:141`.

**Attempts to break "the handle's reach is the complete universe" — all failed.**
- *Other transaction openings:* zero raw `BEGIN`/`COMMIT` anywhere in production. Every production
  `.transaction(` (30 occurrences, 4 of them inside comments) is accounted for; the 24 real bodies map
  1:1 onto the script's 21 reported + 1 orchestration-internal expression body + the 4 zero-hit bodies
  I read by hand (`knowledge-repository.ts:407,:1244`, `promotion-pipeline.ts:378,:602` — inline
  `tx.select/update/insert` only, no callee at all).
- *Handle in a later argument position:* zero occurrences of `, tx`/`, innerTx`/`, txDb` as a
  non-first argument in any production file. Executor-first is enforced by `WriteExecutor`.
- *Handle stored on an object and read back:* zero `\w+: tx` object captures inside any transaction
  body (checked all 24 bodies).
- *Handle captured in a later-invoked closure:* the callee regex scans the whole body text, so
  `items.map((i) => foo(tx, i))` is reported; no `.transaction(namedFn)` form exists except
  `session-requests/src/service.ts:609` (`(tx) => finishRequestInTxInternal(tx, input)`), flagged as
  an expression body and orchestration-internal.
- *Transaction opened inside a callee:* covered by construction, because the sweep enumerates every
  `.transaction(` repo-wide — that is exactly how sites 6, 7 and 9 surface.
- *Transitive frame (a core callee forwarding its executor into a seam call):* the residual hole. I
  closed it by hand on the plausible carriers. Only `layers/core-api/src/**` imports an
  agent-orchestration package in production; the service packages reach the seam only through
  injected ports, so the question reduces to the reported callees. All six emit-time resolvers
  checked: `resolveTaskRunRequest` (`work/src/task-run-resolver.ts:178`, deps
  knowledge/org/settings/users), `resolveKnowledgeActionRequest`, `resolveAssistantTurnRequest`,
  `resolveReengagementRequest` (wired core-only at `threads.ts:1678-1694`), `resolveSessionStartRequest`
  — all core-only; **only** `resolveRoutineRunRequest` (`routine/src/routine-service.ts:378`) reaches
  orchestration, via `deps.agentSelection.isAtCapacity`, which is the pair the amendment names. Also
  checked and clean: `createReviewItem` (`review/src/review-item-factory.ts:71-119` forwards the
  executor only to `conversation.insertThread` + `work.createItem`), so
  `attention-service.ts:251` is genuinely core-only; and `deps.work.transitionTaskState`
  (`service-bootstrap.ts:234`) binds to the work service, not to `transitionTask`, so
  `lifecycle-propagation.ts:44` does not nest site 6.

**Resolution step spot-checked on 3 of the 5 new sites (plus 2 more).**
- Site 2 — `teams-routes.ts:280` `writeTeamRunConfigDefaults` → `@hyperidle/agent-run-config`
  (`layers/agent-orchestration/agent-run-config/src/team-run-config-defaults-store.ts:54`). The
  team-defaults op pair added to §3 clause 2 has real wave-A consumers: write `:280`, read `:540`.
- Site 6 — `task-state-machine.ts:141` `deps.workIntents.record` → `enqueueWorkIntent`
  (`@hyperidle/session-requests`) at `tasks.ts:254`, `bets.ts:684`, `app.ts:494`,
  `work-session-started-reactions.ts:63`.
- Site 7 — `handoff-protocol.ts:128,:338` → `policy-bindings.ts:105` (`runOrchestration:
  { endRunForHandoff }`, `@hyperidle/run-orchestration`) and `:88` (`sessionRequests.record` →
  `enqueueWorkIntent`).
- Site 8 — `routine-scheduler.ts:619` → `routine-scheduler-bindings.ts:151`.
- Site 9 — `proposed-call-workflow.ts:578` → `threads.ts:1678` / `service-bootstrap.ts:470`.

**Reverse direction clean — confirmed.** The only orchestration-owned transactions with threaded
calls are `session-requests/src/service.ts:874,:1022`, `transition-run.ts:67` and
`agent-orchestration-intake.ts:135`; every callee inside them is orchestration-owned. `writeback-processor.ts`
and `tool-handlers/**` contain no `.transaction(` at all, so nothing wraps a future `CoreApiPort` write.

**Hoist non-interference — safe.** Site 8's transaction (`routine-scheduler.ts:599..627`) writes
`routine_runs` (`insertRoutineRun` `:600`) and then the orchestration intent. The two hoisted reads
touch `sessions` (`isAgentAtCapacity`) and `agent_run_config` (`readAgentRunConfig` via
`concurrencyBoundReader`, `routine-scheduler-bindings.ts:54-61,:153,:159`) — neither table is written
by that transaction, before or after the read point, so the hoisted value is bit-identical to today's.
The inputs the hoist needs (`routine.ownerAgentId`, `delegationAllowed`, `skillId`) are on the
`routine` argument `fireGenericRoutine` already holds before opening the transaction, so the hoist is
constructible without moving the run-row read. No observed value changes.

**Site 7's reorder — evidence checks out.** `end-run-for-handoff.ts:40` is an unconditional
`update sessions set state='done', endedAt` with no CAS ⇒ idempotent as claimed; the quoted
"no safety net" header (`:25-29`) is verbatim; `runtime-reapers.ts:170-186` does select
`routineId is not null`. `endRunForHandoff` is step 1 of the transaction, before the
toAgent/toRole/toHuman split (`handoff-protocol.ts:116-128`), so the reorder affects every branch.

**Site 8's wedge — reported honestly.** `resolveRoutineRunRequest` does read its own row back and
require `outcome === "running"` (`routine-service.ts:353-357`), the coalescing guard is
`listRoutineRuns({running:true})` at `routine-scheduler.ts:574-579`, and the routine reaper keys on an
`active` session. §13.9(b) states the real consequence rather than the softer summary. Correct handling.

**P3 marked wrong and left visible — confirmed.** `feasibility.md` P3 keeps the original table and
verdict text and appends the strike + P3b; §1's preamble names the audit as the one thing five rounds
got wrong. Its deferred build-time re-check is withdrawn with a reason.

## GAP 2 — transport acquisition: **PASS**

- **Not a singleton in disguise.** Both composition roots are functions (`createServer`,
  `createTestApp`), so a `let` in the root body is per-invocation; two compositions in one process
  cannot see each other's. This is materially different from
  `agent-orchestration-port-composition.ts:447` (`let registeredTransport` at module scope, the thing
  being deleted).
- **No cross-layer DI reintroduced.** What crosses is a `Request → Response` arrow typed
  `AgentOrchestrationTransport` (`framework/api-contract`), supplied by the application — the
  permitted `application → layer` direction and the seam's existing shape. The 93 sites are core
  importing orchestration *domain functions* and running them on core's DB handle; nothing here does.
- **One instance is sufficient.** The credential is read per call
  (`agent-orchestration-port-composition.ts:145-163`, `process.env.HYPERIDLE_API_KEY` inside the
  wrapper), and `withActorTransport` exists only on the `CoreApiPort` side
  (`core-api-port-composition.ts:756`), so this port has no per-actor variant.
- **The fixture claim holds in substance.** Reactions registered on bare `{ db, eventBus }`
  (`test-fixtures.ts:39-48`) would call a port whose transport is AO's own app over the same PGlite
  db, so a reaction test asserts a real row written by the real route. See non-blocking defect 2 for
  the one thing that is under-specified.
- Every cited line is accurate: `create-server.ts:834`, `test-utils.ts:101`, `sessions-routes.ts:62`,
  `tasks.ts:286-287`, `service-bootstrap.ts:295/:339/:416`, and the in-code note at
  `agent-orchestration-port-composition.ts:402` already diagnoses the fixture-with-no-app failure.

## BLOCKING (1)

**B-A1. §3.1's shipped-test block declares a suite unaffected that site 7's reorder inverts.**
`layers/core-api/src/__tests__/handoff-protocol.integration.test.ts:664` — *"rolls back session, task,
auditTrail when messages INSERT throws"* — is listed under "assert core-only rollback within one
transaction and stay as they are". It does not. Its assertions at `:727-729` are

```
const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-atomic"));
expect(session?.state).toBe("active");
expect(session?.endedAt).toBeFalsy();
```

That is the *orchestration*-side guarantee `endRunForHandoff` gives up: the test forces the
`messages` insert inside `handoff-protocol.ts:116`'s transaction to throw, and with the run-end write
moved ahead of the transaction (§3.1's reorder lever) the session is already `done`/ended when the
rollback happens. It is the toAgent twin of `handoff-to.integration.test.ts:354`, which the amendment
*does* name. Impact: a builder executing §10 as written ("the four files listed at the end of §3.1")
leaves this suite asserting the pre-ruling guarantee and meets an unexplained red on a shipped
atomicity test — the exact situation the block exists to prevent — and §13.9(c)'s founder record
undercounts the reorder's cost as four suites when it is five. Governing authority: §10's test
strategy and §13.9(c)'s own commitment that the rewrite "reads as the ruling being executed".
Fix (one line): move this file into §3.1's rewrite list, naming the inverted assertion (session ends
before the transaction, so a rolled-back handoff leaves an ended run — same residue
`handoff-to.integration.test.ts:354` now asserts), and drop it from the "stay as they are" sentence.

## NON-BLOCKING DEFECTS (3)

1. **§3.2 clause 4's cycle justification is factually wrong** (the decision it justifies is right).
   "that app is agent-orchestration's, which boots *after* core because it needs core's `resolveModel`"
   — today `bootAgentOrchestration` runs at `create-server.ts:692`, *before* `bootCoreApi` at `:712`,
   and `resolveModel` comes from `@hyperidle/shared` (`create-server.ts:105`), wrapped by the
   application-local `makeResolveModel(db, credentialResolver)`; AO's boot consumes nothing from
   core's boot result. The lazy binding is still required, for two better reasons: the transport
   targets the **composed** app (`create-server.ts:812,:834`), which does not exist while either
   layer boots; and in wave B the `CoreApiPort` over core's app and the `AgentOrchestrationPort` over
   AO's app are mutually dependent. Replace the reason, keep the mechanism.
2. **§3.2 clause 6 under-specifies the fixture transport's path base.** AO's app mounts its routes at
   `/agent-orchestration/...` (`layers/agent-orchestration/src/app.ts:57,:60`) and only the
   application's `/api` router adds the prefix; the port client issues `/api/agent-orchestration/...`
   (`SEAM_PLACEHOLDER_BASE_URL`, `agent-orchestration-port-composition.ts:132`). A transport bound
   directly to AO's bare app 404s. Say that the fixture mounts AO's app under `/api` (or rewrites the
   path) so the builder does not rediscover it. Self-revealing (a 404, not a deadlock), hence
   non-blocking. Worth also noting that this deliberately bypasses the middleware stack the
   production transport traverses.
3. **"three expression-body callbacks" is four.** `probes/.../README.md` and §3.1 both say three;
   `output.txt` reports four (`work-service.ts:12`, `attention-service.ts:21`,
   `write-executor.ts:5` — all matches inside comments — plus `session-requests/src/service.ts:609`,
   orchestration-internal). Nothing is dropped (`:609` is listed in §3.1's orchestration-only line),
   but in a section whose whole subject is a miscount, the count should be right. Related: the script
   prints nothing for a body with zero threaded calls (`find-tx-threaded-calls.mjs:88`), so a genuinely
   clean body and a parse failure look identical in `output.txt` — the same silent-drop shape as the
   method it replaces. I verified the four silent bodies by hand; a one-line "0 threaded calls" print
   would make the next reader's job mechanical.

## FOLLOW-UP / NOTE

- `end-run-for-handoff.ts:28-29` carries an explicit in-code directive — *"It must therefore be called
  with the caller's `tx` handle"* — that site 7's reorder deliberately reverses. §3.1 argues the
  reversal well but does not mention that the `@lore` at the call's own definition will then be
  wrong. The site-comment work §3.1 already requires should include it.
- Wave A's builder-scope verdicts check out. `runs.requestTermination`: the only core-side occurrence
  is `run-orchestration-composition.ts:184`; every consumer is already in-layer
  (`start-runtime.ts:239,:346`, `transition-run.ts:347`), and the landed contract already documents
  its absence (`framework/api-contract/src/agent-orchestration-port.ts:239`) — struck, correctly.
  `CoreApiPort` workflow ops: `services/tool-provider-bindings.ts` and `@hyperidle/review` are both
  inside core-api today, and the first consumer appears only when B2 moves the dispatch into
  `@hyperidle/tool-handlers`; §2.7's writeback wire (`create-server.ts:545-562` → a
  `run-orchestration` file) has both ends outside wave A's write set. Moving both to B2 does not
  weaken wave A's "core's only remaining cross-layer imports are composition files", because
  `tool-handlers-bindings.ts` *is* one of those composition files.
- Confinement: the amendment touches six files, all under `.pipeline/work/AU31/`. No `governance/`
  file changed, so no rule was softened and no WP identifier could leak there. No allowlist,
  carve-out, facade or "phase 1" language introduced; §3.2 clause 5 states re-adding a module-level
  seam variable is a review failure rather than a suppression.

## Verdicts

- GAP 1 (corrected inventory + method + hoist): **PASS** — method sound, result reproduced, hoist safe.
- GAP 2 (port acquisition): **PASS** — with defects 1 and 2 above.
- Blocking count: **1** (B-A1).
- Recommendation: fix B-A1 (add `handoff-protocol.integration.test.ts:664` to §3.1's rewrite list and
  correct §13.9(c)'s count), then resume the build. Defects 1–3 can ride the same edit.

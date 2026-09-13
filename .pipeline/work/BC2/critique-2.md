# BC2 — architecture critique, round 2

Delta-only. Re-tests the seven blockers and ten defects of `critique.md` against the amended
`architecture.md` (750 lines), plus §6 (six writers through `edit_task`), §7 (one composed tool list;
the rule with `pending` and `legacyEvents`) and §8 B4 (handoff is an edit). Everything round 1 passed
stays passed. Every citation below is checked at the branch base `efa28dd59`; a claim I could not
resolve is marked UNVERIFIED.

## Round-1 findings — re-tested

| # | Round-1 claim | Verdict now |
|---|---|---|
| B1 | five seam methods deleted, three surviving tools break | **Resolved in substance.** All five call sites confirmed: `tool-definitions.ts:207` (`write_memory` :189), `:487` (`create_task` :466), `:708`/`:773` (`submit_review` :699), `:1538` (`create_artifact` :1489). §8 B1 re-points the three survivors before the deletion. One gap left — see defect 3. |
| B2 | UI consumer list short by five | **Resolved.** All seven surfaces verified: `useTaskLookup.ts:53`, `useTaskSearch.ts:56`, `useAgentRunState.ts:77`, `KnowledgeDetail.tsx:850`, `WorkTaskCreate.tsx:85`, `TaskDependencyField.tsx:44`, `WorkTaskPage.tsx:554`. `ids`/`excludeIds` are in `SearchTasksInput` (§3). |
| B3 | tools reach the registry but not `toolsForRole` | **Resolved and feasible.** `buildToolProvider` at `run-orchestration-composition.ts:375`, `buildToolRegistry` :380-387, `toolsForRole` :389-395; both return `readonly RegisteredTool<HyperIdleDb>[]` (`tool-handlers-bindings.ts:225`), so one spread serves both. `roles === undefined` passes every role filter (`tool-registry.ts:46-47`). `bootCoreApi` precedes `bootAgentOrchestration` in both roots (desktop `create-server.ts:231`/:266, remote-server :326/:382) and `runtime:` already exists. |
| B4 | §7 deletes the file the plan keeps | **Half resolved.** §8 B4 + §6 row 4 now split `lifecycle-propagation.ts` correctly (private helper `:18-76` deleted, subscriptions `:419`/`:435` kept). But the cut list is still incomplete — see BLOCKING 4. |
| B5 | five live writers outside `edit_task` | **Resolved as a list, broken as a design.** All six call sites verified: `work-session-started-reactions.ts:79`, `dependency-watcher.ts:89` and `:164`, `lifecycle-propagation.ts:164` and `:271`, `task-kill-cascade.ts:138`. Rows 3 and 6 contradict each other — see BLOCKING 5. |
| B6 | `export const taskActions` cannot leave the face | **Resolved correctly.** `tools/governance/README.md` "A layer's face": the positional exemption is a bare Service identifier in direct callee position, and the rule "does not read function-like bodies". `buildCoreActions(bindings)` calling `createTaskActions(...)` is the sanctioned shape. |
| B7 | event clause deferred to BC5 | **Resolved, and the population is honest.** `EVENT_TYPES` is at `framework/event-bus/src/events.ts:637-668` with the compile-time completeness assertion at `:669-675`, exactly as cited. The array holds 29 names; 8 are the platform events; the remaining **21 are exactly the `legacyEvents` list, name for name**. The clause is complete and green at this base. |
| d1 | wrong base, stale citations | **Resolved.** Base is `efa28dd59`; `routes/tasks.ts` is 736 lines there and all eight route lines (:238, :275, :298, :335, :473, :652, :682, :696) are exact. |
| d2 | `deps.workIntents.record` | **Resolved.** §1 names the callable and the `.record` `@lore` at `task-state-machine.ts:206`. |
| d3 | table registry short one row | **Half resolved** — see defect 1. |
| d4 | no attack case | **Resolved in shape.** Property 4 is at `governance-attacks.ts:24-29`; the overlay/mutate rule is property 3 (:21-23); `ATTACK_ANCHORS.serviceDir`/`.serviceBarrel` are at :119-122 and do point at `layers/core-api/work/src`. The control's mutate-not-overlay reasoning is right. |
| d5 | route population misses four files | **Resolved, and round 1 was partly wrong.** The derived `router.<verb>(` scan is the right call. `app.ts:272` (`api.get("/health"`) and `mcp-route.ts:82` are real misses of the glob, correctly named. Round 1's claim that `layers/core-api/src/auth/**` defines routers is **false** — `authorize.ts:33,54` and `access-boundary.ts:53` are `c.get("userId")`, not routes. `routes/auth.ts` has exactly three routes (:55, :80, :107), matching the three plumbing entries. |
| d6 | `core-ui` has no zod | **Resolved.** Confirmed absent from `layers/core-ui/package.json`; every other package pins `^4.3.6`, so the manifest row is a fact, not a new dependency. |
| d7 | `notes` loses atomic append | **Resolved well.** The overload is at `work-service.ts:682-687`, `AppendNoteOp` at `:449`. `appendNote` as a separate input is the right shape. |
| d8 | size understated | **Resolved.** §13 states 2,300-2,500 and the founder accepted it on 2026-09-13. |
| d9 | `0082` collides on rebase | **Resolved.** Last migration is `0081_drop_items_layer.sql`; §13 overlap 3 says renumber. |
| d10 | test churn under-named | **Resolved.** All fourteen deleted test files exist at the base; the re-point lists name real files. |

Also re-checked and true: `system:propagation` is seeded **unconditionally at every boot**
(`bootstrap/factory-state.ts:36-48`, `insertUserIfAbsent`), so it is a real FK target for
`changes.actor` (`lifecycle-propagation.ts:86` holds the same constant). `updatedAt` is
`text` (`schema.ts:184`), so §3's stated `version` limit is real. `validateBody` is at
`domain-model/src/http.ts:100`. `AgentOrchestrationRunsPort.endForHandoff(sessionId, endedAt)` is at
`api-contract/src/agent-orchestration-port.ts:190` and its route at
`agent-orchestration-intake.ts:241`.

**The re-entrancy question, answered.** The loop is real at the base and the architecture does not
create it: `lifecycle-propagation.ts:435` subscribes to `task_state_changed`, and `:271`'s transition
emits `task_state_changed` for the ancestor, which re-enters the same handler — self-documented at
`:205-212`. It terminates on `SKIP_ANCESTOR_STATES`, the all-children-terminal check, and the CAS.
`app.ts:429`'s dependency watcher re-enters likewise and terminates because a just-accepted task is
not `done`. This is the loop ETHOS allows (AI in the middle, not a routine re-triggering itself).
Routing those writers through `edit_task` preserves the shape: the refusal changes from a thrown
`TaskInvalidTransitionError` to a returned problem list (§9), which stops the walk the same way, and
`cascade: true` is preserved (§5 step 5). **One place does create a new loop — see BLOCKING 5.**

---

## BLOCKING

### 1. `tools/governance/actions.json` cannot exist, and `pending` is the shape one rule exists to refuse

- **Claim.** §7 puts the new registry at `tools/governance/actions.json` and closes with "**No clause
  change in `governance-model.ts` — no founder ruling needed.**" Both halves are wrong. The file
  cannot be added without editing a rule's source, and what it contains is the thing that rule guards.
- **Evidence.** `tools/governance/src/rules/no-per-file-allowances.ts:52-62` — `CLOSED_SET` is seven
  paths (`README.md`, `architecture.json`, `decided-rules.json`, `table-owners.json`,
  `misplaced-files.json`, `package.json`, `tsconfig.json`) and `:117-126` reports **every** direct
  child of `tools/governance/` that is not in it: *"is a new file at the root of tools/governance/,
  which is a closed set. This is the shape a per-file allowance or a new bookkeeping record would
  take."* The census is `git ls-files --cached --others --exclude-standard` over the whole repo
  (`governance-context.ts:158-168`), so a `.json` at that root is in scope. The file's own header
  states the principle: *"the bookkeeping does not come back (D11) … a new architectural rule lands at
  `error`, its violations fixed in the same pull request, so there is no longer a legitimate reason
  for that file to exist"* (`:1-13`). §7's `pending` map is a path-keyed exemption list — clause 2
  passes a route file **because it is listed** — which is a per-file allowance by function.
- **Authority.** `.pipeline/rules/architecture.md:16-28` (say which kind of change you are proposing;
  a new clause is a founder ruling, a registry is a fact); `tools/governance/README.md:87-91`.
- **Smallest fix.** Either (a) carry the map as a constant under `tools/governance/src/rules/` — `src/`
  is outside the closed set by design — and say so in §7, or (b) name the `CLOSED_SET` edit explicitly
  and put the question *"is a per-object pending map a returning allowance?"* to the founder as a
  ruling. Do not ship it as a registry edit.

### 2. §11 makes the rule green for every object; `plan.md` requires it red for the others, at the gate

- **Claim.** §11 closes with "the new rule green for task and **red for nothing** — `pending` and
  `legacyEvents` cover the rest." The plan says the opposite, twice, and one of them is the gate.
- **Evidence.** `plan.md:51-52` — "the rule is green for task and **red for every other object** —
  that red is the to-do list for BC3–BC6." `plan.md:120-121` (the single gate) — the founder sees
  "the governance rule green for task and **red for the other objects**". The architecture never
  names the divergence; `pending` silently converts the intended red into a list.
- **Authority.** `plan.md:51-52`, `plan.md:118-122`. Memory: a cut or deferral needs explicit founder
  approval; the verdict is the goal, no silent scope change.
- **Smallest fix.** One paragraph in §7 or §11 saying it plainly: a rule at `error` that is red fails
  `npm run lint` and therefore `verify`, so the red cannot ship — the `pending` map is the to-do list
  in its place. That is a plan amendment; take it to the founder at the gate rather than letting the
  gate line quietly become untrue.

### 3. `edit_task` has no way to learn the session id `endRunForHandoff` needs, and a wrong one is destructive

- **Claim.** §5 step 5b: "if the owner changed **off an agent that has a running session**,
  `deps.agentOrchestration.endRunForHandoff(sessionId, ctx.now)`". Neither the condition nor the
  argument is obtainable by the module as §5 locks it.
- **Evidence.** `ActionContext` (§5) is `{ actor, db, eventBus, now }` — no session. The `tasks` table
  has no session column (`framework/db/src/schema.ts`, the `tasks` block). The seam read side is
  `AgentOrchestrationSessionsPort.getById(sessionId)` **only**
  (`api-contract/src/agent-orchestration-port.ts:64-69`), and §5 explicitly promises "no new port
  operation and no new client method". Today the id comes from the caller's own
  `sessionContext.sessionId` (`handoff-protocol.ts:118`), which exists only on the tool path, and
  `ToolContext.sessionId` (`tool-seam.ts:52`) is not carried into `ActionContext`. The nearest
  core-owned candidate, `taskDispatchAttempts.sessionId`, carries no liveness signal — and
  `endRunForHandoff` is deliberately **un-guarded**: `run-orchestration/src/end-run-for-handoff.ts:39`
  is a bare `update(sessions).set({state:"done", endedAt}).where(eq(sessions.id, sessionId))`, with
  `:14-17` stating "**No CAS on `state = "active"`**". A guessed or stale id silently closes the wrong
  session. §5's `TaskActionsDeps` therefore cannot be implemented as written.
- **Authority.** `plan.md:101-103` (the running session still ends through the existing seam) — the
  behaviour is approved, the mechanism is not named. `.pipeline/rules/architecture.md:5-11`.
- **Smallest fix.** Name the source in §5, in one sentence, and accept its cost: either the target is
  read from `taskDispatchAttempts` (state the stale-id risk against the missing CAS), or `ActionContext`
  grows an optional caller `sessionId` supplied by the MCP loop only (and say the UI path ends no run),
  or the port grows one operation (and say the header's "two seam directions" becomes three).
- **Also.** §8 B4 calls the new residue "task updated, run still live … the repairable direction".
  `end-run-for-handoff.ts:25-28` says the opposite: *"there is NO safety net behind this write …
  a handed-off run left `active` stays `active` forever."* Either support the claim or drop it.

### 4. Handoff stops handing work over: the re-dispatch is cut without being named

- **Claim.** §8 B4 lists what dies with `handoff-protocol.ts` "so the founder sees the whole cut in one
  place". The list omits the part that makes a handoff a handoff.
- **Evidence.** `handoff-protocol.ts:322-344` — after the owner is written, the file inserts a dispatch
  attempt (`occasion: "owner_handoff"`, `predecessorSessionId: sessionContext.sessionId`), bakes the
  run request in the same transaction, and post-commit records the work intent (`:362-371`) so the
  **new** owner's session starts; `:383` then calls `deps.sessionRequests.abort(sessionId)`. Under §5,
  `edit_task` submits a work intent only "if the edit **accepted** a task with an agent owner"
  (step 5c), and the same is true of the code it moves (`task-state-machine.ts` inserts the attempt
  only `if (toState === "accepted" && task.ownerAgentId)`). A handoff targets a task already
  `in_progress`. After this item, changing the owner ends the old run and starts nothing. The
  registry abort (`AgentOrchestrationRunsPort.abort`, `agent-orchestration-port.ts:192`) is named
  nowhere at all.
- **Authority.** `plan.md:101-103` authorises exactly three cuts (role targeting, the escalation
  thread, the caller names a user). Re-dispatch is not among them. `CLAUDE.md` ABSOLUTE RULE 2.
- **Smallest fix.** §5 step 4/5 gains one branch: when `ownerAgentId` changes to an agent on a live
  task, insert the dispatch attempt with `occasion: "owner_handoff"` and `predecessorSessionId`, bake
  in-tx, submit the intent post-commit; and §8 B4 states whether `runs.abort` is kept or cut. If the
  intent is to cut re-dispatch, say that to the founder in those words — it is a feature deletion.

### 5. §6 rows 3 and 6 contradict each other: the cascade re-enters `edit_task` from inside its own transaction

- **Claim.** Row 6 moves the kill cascade *inside* `edit_task`'s transaction with "its awaited
  `handleDependencyKilled` call (:145-150) … unchanged". Row 3 re-points the transition **inside**
  `handleDependencyKilled` to `edit_task.run`. Together they make `edit_task` call itself from inside
  its own open transaction.
- **Evidence.** `task-kill-cascade.ts:138` transitions, `:150` awaits `handleDependencyKilled`;
  `dependency-watcher.ts:164` — the row-3 site — is inside `handleDependencyKilled`. `edit_task.run`
  opens `db.transaction` (§5 step 4), so the inner call runs on a second connection: it cannot see the
  outer tx's uncommitted kills (its dependency invariant would still see the killed task alive), and it
  commits before the outer, so an outer rollback leaves dependents reset against a kill that never
  happened. The two rows also assign two different actors to the same code path (`system:propagation`
  in row 3, "the root kill's actor" in row 6).
- **Second half.** Row 6 says "its downward run-stop dep … moves with it unchanged", but
  `TaskActionsDeps` (§5) declares only `submitWorkIntent` and `endRunForHandoff`. The run-stop is a
  **third live core→orchestration direction**: `task-kill-cascade.ts:114` calls
  `deps.runOrchestration.requestRunStopForTasks`, bound at `routes/tasks.ts:59` to
  `agentOrchestration.runs.stopForTasks` — and `routes/tasks.ts` is deleted by this item. It is also
  not post-commit-able as §5 step 5 lists it: today it runs *before* the kills, and it is a seam call
  the header says does not exist ("Two seam directions survive this item … Nothing else on the seam
  grows"), which contradicts `plan.md:76` as much as §5 does.
- **Authority.** `plan.md:71-76` ("never a shared transaction"; "those two ports are all that is left
  of the seam"); `plan.md:30-32`.
- **Smallest fix.** Say, in §6 row 6, exactly where the boundary is: the run-stop and
  `handleDependencyKilled` run **outside** the transaction (before and after respectively), the
  cascade's task writes and `changes` rows run inside it, and `handleDependencyKilled`'s own transition
  is a nested `edit_task` call made after commit. Add `stopForTasks` to `TaskActionsDeps` and correct
  the header to three seam directions.

---

## NON-BLOCKING DEFECT

1. **The table registry needs a fourth edit nobody named: the totals.** `validateTableOwners`
   (`tools/governance/src/lib/governance-registry.ts:165-169`) throws when
   `registry.totals.tables !== liveTables.size`; `table-owners.json:4-8` says `34`/`34`. Adding
   `changes` means 35/35 as well as the owner rows. §4 says "Three rows, not two" and §13 says "the
   four `table-owners.json` rows"; neither is the totals block. (The three moves are real:
   `table-owners.json:15,16,41`.)
2. **§5 step 4 loses the dispatch-attempt insert and the bake.** `task-state-machine.ts:331-355`
   inserts the `taskDispatchAttempts` row and calls `resolveTaskRunRequest` **inside** the
   transaction, precisely because the bake reads the row it just wrote (`@lore` AU31 §3.1 site 6 at
   `:203-213`). §5 step 4's contents are enumerated and this is not among them; step 5c names only the
   post-commit `submitWorkIntent`. State it, or a builder will move the whole thing post-commit.
3. **§8 B1 says "in-process" but not through what.** The three surviving tools live in
   `layers/agent-orchestration/tool-handlers`; `open_task` lives in `core-api`. The re-point must be a
   new entry on `ToolHandlersPorts` bound at the composition root (the same shape
   `tool-handlers-bindings.ts:112` uses for the method being deleted), never an import of
   `@hyperidle/core-api` from that layer. One sentence prevents a layer violation. (Topologically it
   is sound — `remote-worker` composes `agent-execution` only, so both roots co-boot the two layers.)
4. **"Only shrinks" has no ratchet.** §7 says `legacyEvents` and `pending` shrink "same discipline as
   `misplaced-files.json`". That file's discipline is mechanical — a committed `resolvedFiles` count
   the lint fails on in both directions (`tools/governance/README.md:96-101`). As specified, nothing
   stops a name being added back to either list. Either carry a count, or drop the comparison and call
   it what it is: a convention review has to hold.
5. **The `pending` map is asserted complete but was never scanned.** §7 requires "every production
   route file found by the scan appears under exactly one key or is `plumbing`" and then writes the map
   out in full. It is plausible but unproven against the base: the plumbing table at
   `plans/reviews/ACTIONS.md:275-291` is fourteen rows / sixteen routes, and the unlisted route-bearing
   files are `routes/auth.ts` (3), `routes/health.ts` (3), `app.ts` (1), `mcp-route.ts` (1) and
   `agent-orchestration-intake.ts` (5 router calls, of which ACTIONS.md names five as seam plumbing).
   Say the map is derived by running the scan, not typed from ACTIONS.md — the same discipline §13
   already applies to the plumbing list.

---

## FOLLOW-UP / NOTE

- Round 1's defect 5 was partly wrong and the amended §7 is better than the finding that prompted it:
  `layers/core-api/src/auth/**` holds no routers. Worth not re-litigating in review.
- `one-work-primitive`'s banned-token table carries the `why` "`audit_trail` is the one audit
  mechanism" (`tools/governance/src/rules/one-work-primitive.ts:50-53`). Dropping the column makes that
  prose false without breaking the rule. A one-line `why` edit belongs in this PR.
- §7's four clauses are sound, but clause 4 can only go red when a **new** `EventType` is added — at
  this base it is exactly satisfied by construction. That is real (a new event must be classified), not
  a check that cannot fail, but it proves nothing about task in BC2. Worth saying so at the gate rather
  than letting "the event clause ships green" read as evidence.
- `endRunForHandoff`'s signature on the port is `(sessionId, endedAt)` while core's current dep takes
  `(exec, sessionId, endedAt)` (`handoff-protocol.ts:118`). §5's `TaskActionsDeps` uses the port shape,
  which is right; just noting the two spellings so the builder does not thread an exec.
- `WorkTaskPage`'s second attachment read (§Confusions 2) and `useTaskSessions` staying (§1) are both
  correctly deferred, and the founder ruling that keeps sessions out of `open_task` is faithfully
  applied — `AgentOrchestrationSessionsPort` stays `getById` only.

---

## Verdict

BLOCKED

---

## Confusions

1. Is `pending` acceptable at all? It is the cleanest way to ship a rule at `error` over a half-migrated
   repo, and it is also the exact shape AU32 closed. The architecture should not decide this for the
   founder in a parenthesis — it is one question, asked once.
2. What starts the new owner's session after a handoff (BLOCKING 4)? If the answer is "nothing until
   BC5's subscriptions", that is a fourth confirmed carry-over and `plan.md`'s "How we work on this"
   should name it.
3. If the run-stop is a third surviving seam direction (BLOCKING 5), `plan.md:76`'s "those two ports are
   all that is left of the seam" is already false at the base. Say three, or say which one BC2 removes.

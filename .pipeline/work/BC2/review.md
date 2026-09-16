# BC2 — review (fresh reviewer, two passes over the integrated diff)

Base `efa28dd59` → HEAD `260145c6e`, branch `feature/task-action-list`.
Read: `plan.md`, `architecture.md`, `.pipeline/rules/{typescript,testing,architecture,security,frontend}.md`,
`tools/governance/README.md`, then the whole diff (205 files, +5,558 / −10,062).

Mechanical checks I ran myself (Node 24, this worktree):

- `npx tsx tools/governance/src/governance-lint.ts` → **PASS**, 24 rules, 0 violations.
- `npx tsx tools/governance/src/governance-lint.ts --attacks` → **PASS**, 70 break-tests (the new
  `actions-projected` pair included).
- `npx vitest run --config vitest.integration.config.ts --project service layers/core-api/src/__tests__/task-actions.integration.test.ts`
  → **11 passed**.
- `npx vitest run layers/core-ui framework/harness-protocol layers/agent-execution` → **330 files / 3,154 tests passed**.
- `npm run check` → **PASS**, all 39 packages.

## What works

- The mechanism is real and is one list. `buildCoreActions` (`layers/core-api/src/actions/compose.ts`)
  builds the three actions once; `createActionsRouter` mounts them in a loop; `actionsAsTools` projects
  the same values onto the MCP seam; `call.ts` types the UI door off `TASK_ACTIONS`. The tool list is
  threaded into **both** `buildToolRegistry` and `toolsForRole`
  (`run-orchestration-composition.ts:392-428`), which is the split the architecture warned about, and
  the `APP_ACTION_TOOLS` WeakMap is keyed on the same `api` Hono instance `createCoreApiApp` returns
  (`app.ts:340,395,491`) — no silent empty list.
- The migration is full and destructive: `0082_changes_and_task_edit.sql` creates `changes` and drops
  `tasks.audit_trail` in one file, journal entry present, `schema.ts` declares the table, four
  `table-owners.json` rows plus the `34 → 35` totals bump. No compat column, no dual-write, no
  `audit_trail` reference left anywhere in code.
- `taskInvariants` is genuinely pure and genuinely shared — the same function greys the Save button
  (`WorkTaskPage.tsx:469-492,592`) and runs as `edit_task`'s first pass
  (`task-actions.ts:427`). `task-transition.ts` is deleted, not duplicated.
- Problems, not throws: `edit_task.run` returns `{ok:false, problems}` for every refusal I traced; the
  router maps that to 422 and `apiFetch` does not throw on 422, so the UI really does see the problem
  list.
- The kill/dependents split of §6 is implemented as specified — descendants are collateral inside the
  one transaction with the root's actor, dependents are separate post-commit edits as
  `system:propagation` — and the seam test asserts the two apart (`task-actions.integration.test.ts:300-367`).
- The governance rule is honest where it scans: clauses 2–4 derive their populations from the tree and
  cannot pass while empty (a zero-result route scan makes all 107 `LEGACY_ROUTES` entries fire; a
  missing `EVENT_TYPES` block throws). The 107/17/21 lists are the real live set — the rule is green at
  HEAD with no unclassified registration, so nothing was typed out of a document.
- Deletions I checked are complete: `useTaskPatch`, `useTaskTree`, `core-ui/src/types/task.ts`,
  `routes/tasks.ts`, `handoff-protocol.ts`, the five `CoreApiWorkPort` task methods, the four tools and
  `@hyperidle/work` all gone, with no shim, alias or `@deprecated` marker introduced by this change.
- **(b) `task/src/__tests__/test-fixtures.ts` deleted rather than re-pointed — correct.** The three
  surviving tests in that package import `@hyperidle/db/test-fixtures`; nothing referenced the local
  file. No finding.
- **(d) no production path is wired to a throwing `open_task` stub.** `THROWING_OPEN_TASK` appears only
  in `__tests__` files; `unusableOpenTask()` is reached only from `toolsForRole`, which lists names and
  never runs a handler.
- **(e) `mcp-route.ts` is classified exactly as the architecture locked it**: `POST /mcp/:token/return-status`
  is plumbing (`actions-projected.ts:51`), `ALL /mcp/:token` is a `LEGACY_ROUTES` transport entry
  (`:90`). Plumbing totals 17 registrations, matching §7.
- No demo data or fabricated fallback in the UI; no new security surface (actions sit behind the
  existing auth middleware, actor from `c.get("userId")` / `ToolContext.agentId`, never the body).

---

## BLOCKING

### B1 — `insertAttempt` returns a fabricated id when the unique index swallows the insert; the edit then 500s

- **Claim tested:** §5 step 4 — "A swallowed conflict means no new attempt row, and therefore no intent in 5d."
- **Evidence:** `layers/core-api/task/src/task-service.ts:117-119`

  ```ts
  .onConflictDoNothing()
  .returning({ id: taskDispatchAttempts.id });
  return { id: inserted[0]?.id ?? id };
  ```

  On conflict `inserted` is empty and the function returns `id` — a `randomUUID()` for a row that was
  never written. `task-actions.ts:652-668` and `:676-693` then call
  `resolveTaskRunRequest(tx, { kind: "task_run", attemptId: inserted.id }, …)`, which does
  `taskDispatchAttemptStore.get(db, input.attemptId)` and `throw new Error("Task dispatch attempt is
  unavailable")` when the row is absent (`task-run-resolver.ts:256-258`). The throw is inside
  `ctx.db.transaction`, so the whole edit rolls back and leaves `edit_task.run` throwing rather than
  returning problems — a 500, not a `Problem`.
  The conflicting index is real: `framework/db/drizzle/0047_AU9_durable_custody.sql:45`
  `UNIQUE (task_id, occasion, COALESCE(predecessor_session_id,''), agent_id)`. Two reachable paths hit
  it: a task parked to `hold` and re-accepted twice by the same owner (`occasion: "retry"`, null
  predecessor, same agent), and the same two agents handing a session-less task back and forth
  (`occasion: "owner_handoff"`).
- **Authority:** `architecture.md` §5 step 4 (locked); `.pipeline/rules/typescript.md` § "No fabricated
  content in production code" — a shipping path may never invent a value it does not have.
- **Smallest fix:** return `{ id: inserted[0]?.id }` (or `undefined`) and, in `task-actions.ts`, skip the
  bake and skip step 5d when no row was inserted — which is what §5 already says happens.

### B2 — cascade-killed descendants emit a fabricated `fromState: "proposed"`

- **Claim tested:** §5 step 5c — "emit the old event … with today's payload … `cascade: true` preserved
  on the descendants of a kill."
- **Evidence:** `layers/core-api/task/src/task-actions.ts:714-725` emits every collateral kill with a
  hardcoded `fromState: "proposed"`. The real prior state is in hand — `killSubtreeInTx` reads each row
  and uses `t.state` for its guard (`:323-327`) — and is then discarded, because the function returns
  only ids. The deleted implementation emitted the true value: `task-kill-cascade.ts` called
  `transitionTask(db, eventBus, task.id, "killed", …)`, which read the row's state and emitted it.
  A live consumer reads the field: `layers/core-api/routine/src/routine-scheduler.ts:354-357` derives
  `{from, to}` from `rec.fromState`/`rec.toState` to match routine transition constraints — so a routine
  constrained on `in_progress -> killed` no longer fires on a cascade kill, and one constrained on
  `proposed -> killed` fires when it should not.
- **Authority:** `.pipeline/rules/typescript.md` § "No fabricated content in production code";
  `architecture.md` §5 step 5c; concrete regression against `efa28dd59`.
- **Smallest fix:** have `killSubtreeInTx` return `{ id, fromState }` pairs and emit the real value.

### B3 — a production writer still touches `tasks` outside the module, with no `changes` row

- **Claim tested:** §6 — "After this item **nothing writes `tasks` outside the task module, and nothing
  outside `edit_task` appends a task `changes` row.**"
- **Evidence:** `layers/core-api/src/services/work-session-end-reactions.ts:72`

  ```ts
  await update(db, "task", taskId, { tokensActualJson: JSON.stringify({ byTier: merged }) });
  ```

  imported straight from `@hyperidle/task` (`:25`). It is the only remaining production write to `tasks`
  outside `task-actions.ts` (I grepped every `update|create|transition(x, "task"` and every raw
  `update(tasks)`/`insert(tasks)` in production; `tools/eval` and `tools/setup` are development seed
  paths and are fine). It writes no `changes` row, so a token writeback is invisible to the record the
  item exists to create.
- **Authority:** `architecture.md` §6 (locked, absolute wording); `plan.md:27-31` "Edit is the only write".
- **Note for the orchestrator:** this cannot simply be routed through `edit_task` — `tokensActualJson`
  is not a field on the locked `EditTaskInput` (§3). Closing it needs either a field on the edit input
  or an explicit, written exception. Either way it is an architecture amendment the founder should hear,
  not a silent gap.
- **Smallest fix:** add `tokensActualJson` to `EditTaskInput` and route the writeback through
  `edit_task` as the session's own agent; or state the exception in §6 and get it approved.

### B4 — `RETURN_ACTION_NAMES` gains `edit_task`: an unauthorised public-contract change that regresses return enforcement

- **Deviation (a), judged.** Something had to change here (`handoff_to` is deleted), but the chosen
  replacement widens the terminal set onto a very common call.
- **Evidence:** `framework/harness-protocol/src/harness/return-actions.ts:40,90-95` — `edit_task` is a
  member, terminal whenever `args.ownerAgentId` is a non-empty string. For a `task_run` session
  `requiredReturnActions` is `undefined` (`provisioner.ts:1562-1563` only sets `["reply"]` for
  thread-only sessions), so `isRequiredReturnAction` falls back to plain membership
  (`return-actions.ts:115-118`) and the gate flips `returned = true`
  (`return-enforcement.ts:41-48`). The predicate looks only at the arguments — never at *which* task.
  Concretely: creating a subtask is now `edit_task` with no `id`, and the tool it replaced
  (`create_task`) always set `ownerAgentId: ctx.agentId`. So an agent that decomposes its task and
  assigns an owner has "returned", the forcing message never fires, and the turn ends without
  `submit_review`/`send_message`. That is a real loss of the feature `force-return` exists for.
- **Authority:** `plan.md`/`architecture.md` name no change to this framework contract (exposure dial:
  public contract); concrete regression in return enforcement.
- **Smallest fix (reviewer does not choose):** either drop the set to the three unconditional members,
  or gate `edit_task` on it being the session's *own* task changing owner (the gate has `ctx.taskId`);
  either way it needs to be a stated decision, and the harness lane must be re-run for it.

### B5 — item ids leak outside `.pipeline/`

- **Evidence** (`rg -n "\bBC[0-9]\b" -g '!.pipeline' -g '!*.md'`, none inside an `@lore` tag):
  - `framework/db/drizzle/0082_changes_and_task_edit.sql:4,11,12`
  - `framework/db/src/schema.ts:562`
  - `layers/core-api/task/src/task-actions.ts:37`
  - `tools/governance/src/rules/actions-projected.ts:230`
- **Authority:** standing project rule — work-package ids belong in `.pipeline/**` only; `@lore` tags are
  the sole exemption. Always blocking.
- **Smallest fix:** reword the six comments in product terms ("until subscriptions replace the old
  event", "the migration number is renumbered at rebase", …).

### B6 — the §12 documentation sweep was not done

- **Claim tested:** §12 — "The builder greps `PATCH /api/tasks`, `handoff_to` and `create_task` under
  `docs/` and fixes each hit in the same PR."
- **Evidence:** not one of the four documents §12 names was touched. The five docs that *were* edited
  (`as-implemented-domain-architecture.md`, `data-flow-examples.md`, `guides/user/agents.md`,
  `product/how-work-flows.md`, `requirements/functional-requirements.md`) are a different set. Still
  false at HEAD:
  - `docs/process-layer/handoff-and-lifecycle-propagation.md:15,18,48` — an entire authoritative page
    describing the `handoff_to` tool and `layers/core-api/policy/src/handoff-protocol.ts`, a file this
    change deletes, including a code block from it;
  - `docs/process-layer/tasks-and-sessions.md:4,12,18,25` — `@source layers/core-api/src/routes/tasks.ts`
    (deleted), `POST /api/tasks`, `PATCH /api/tasks/:id`, `layers/core-api/work/src/dependency-watcher.ts`;
  - `docs/process-layer/the-four-primitives.md:89`, `docs/information-architecture/work-view.md:76,85`,
    `docs/architecture/system-overview.md:100,127`, `docs/architecture/decisions.md:8`,
    `docs/product/human-ai-collaboration.md:17`, `docs/agent-layer/agent-model.md`,
    `docs/agent-layer/return-gate-enforcement.md`.
- **Authority:** `architecture.md` §12, step 7 of §13; `CLAUDE.md` § Migrations are full — no stale
  caller left behind. `docs/` is stated ground truth, and a wrong authoritative doc is the exact failure
  mode this repo has been burned by before.
- **Smallest fix:** run the three greps §12 names and fix every hit; `handoff-and-lifecycle-propagation.md`
  needs its handoff half rewritten as "handoff is `edit_task({ownerAgentId})`" or deleted.

### B7 — the repair §1 called the item's prerequisite ships with no test, and the one test that touches it seeds the column by hand

- **Claim tested:** §11 — "a session-started event fills that attempt's `sessionId`, and an owner change
  off that agent then calls `endRunForHandoff` with exactly that id"; and §11's re-point of
  `services/__tests__/work-session-end-reactions` — "its fixture stopped being a fixture — production
  now fills `requestId`, so the test asserts the real path".
- **Evidence:**
  - `layers/core-api/src/services/__tests__/work-session-started-reactions.integration.test.ts` never
    sets `requestId` on the emitted event (grep: no `requestId` anywhere in the file), so the guard
    `if (event.requestId && event.sessionId)` in `work-session-started-reactions.ts:63` is never true and
    `taskDispatchAttemptStore.markRunning` is never executed by any test.
  - `layers/core-api/src/services/__tests__/work-session-end-reactions.integration.test.ts` is
    **unchanged by this branch** (`git diff` is empty for it) and still fills `requestId` in its own
    fixture (`:167,178,194,215`).
  - The seam test's handoff case hand-inserts the attempt row with `sessionId: "ta-handoff-session"`
    already set (`task-actions.integration.test.ts:484-494`) instead of emitting `session_started`.
  §1 diagnoses the original defect as having survived precisely because "its integration test fills
  `requestId` in its own fixture". The same shape is shipping again: the repair is unproven, and step 5b
  is proven only against a value the test wrote itself.
- **Authority:** `architecture.md` §11 and `plan.md` § Verification (unproven AC);
  `.pipeline/rules/testing.md` — a test that stands in for the integration point under test is a false
  green.
- **Smallest fix:** in the started-reactions test emit `session_started` with a real `requestId` and
  assert the attempt row goes `running` with `sessionId` set; then drive the seam test's handoff case
  through that event instead of seeding the column.

### B8 — the governance rule's clause 1 hardcodes the action names instead of deriving them

- **Claim tested:** §7 clause 1 — "Every `name` declared in `framework/domain-model/src/actions/*` is
  referenced as a string in `core-ui/src/**`."
- **Evidence:** `tools/governance/src/rules/actions-projected.ts:28`

  ```ts
  const TASK_ACTION_NAMES: readonly string[] = ["search_tasks", "open_task", "edit_task"];
  ```

  and `:375` iterates that constant. Nothing reads the declarations directory. Clauses 2–4 all derive
  their populations from the tree; clause 1 alone does not, so a fourth action added in BC3 that is
  never wired to the UI leaves the rule green, and a renamed action leaves a stale name that clause 1
  would report as unreachable for the wrong reason. This rule is the template BC3–BC6 copy, and the
  one clause that is a list is the clause that guards the projection a loop cannot guarantee.
- **Authority:** `architecture.md` §7 clause 1 (locked); `.pipeline/rules/architecture.md` § "Scans, not
  lists" — "Never hardcode … discover by scanning, and hard-fail when a scan finds nothing", which names
  this repo's own repeated history of guards wired to a subset.
- **Smallest fix:** scan `framework/domain-model/src/actions/*.ts` for `name: "<snake_case>"` (the file
  already has `TOOL_NAME_LINE` for exactly this shape), hard-fail on zero, and iterate that.

---

## NON-BLOCKING DEFECT

### N1 — `search_tasks` silently drops declared filters depending on which other field is present

`layers/core-api/task/src/task-actions.ts:257-284`. The implementation is three mutually exclusive
branches: if `ids` is present, `state`/`teamId`/`text`/`excludeKilled`/`limit` are all ignored; if `text`
is present, `parentTaskId`/`ownerAgentId`/`state`/`teamId` are ignored; `excludeKilled` is honoured only
in the `text` branch. The declaration (`framework/domain-model/src/actions/task.ts:111-123`) advertises
all of them as independent optional filters. No live caller is broken today — the only `excludeKilled`
caller is `useTaskSearch.ts:83`, which uses the `text` branch — so this is latent. It is the same
"schema was simply lying" defect the deleted `edit_task` tool's own `@lore` recorded, and it will bite
the first BC3+ caller that combines filters. Fix: one query builder over the whole filter set, or
narrow the declaration to the combinations that work.

### N2 — an owner change to `null` leaves the predecessor's run live

`task-actions.ts:555-561` only resolves `predecessorSessionId` when `input.ownerAgentId` is truthy, and
`:701-703` only calls `endRunForHandoff` when a dispatch with `occasion: "owner_handoff"` exists. So
unassigning a running task (`ownerAgentId: null`) ends nothing and starts nothing; §5 step 5b's wording
is "changed **off** an agent". §8 B4 already records that a handed-off run left `active` stays `active`
forever. Worth naming as a deliberate limit or fixing.

### N3 — `lifecycle-propagation`'s `transitionTask` flattens every problem into `TaskInvalidTransitionError`

`layers/core-api/policy/src/lifecycle-propagation.ts:41-43` maps any `!result.ok` to
`TaskInvalidTransitionError`, so a capacity refusal, an unknown owner or a `stale` version is logged and
reported as an invalid transition. §9 says each error class "becomes a `Problem` code"; here the
direction is reversed and the code is lost. Cosmetic today (the caller only catches and drops), but it
throws away the diagnostic the `Problem` list exists to carry.

### N4 — `buildOpenTaskBinding` degrades silently when the action list is empty

`run-orchestration-composition.ts:392-401` returns `undefined` for every `open_task` lookup when
`actionTools` is empty, and `write_memory`/`create_artifact` then scope their memory to `factory`
instead of the task's team (`tool-definitions.ts:202-208,1273-1279`). Both production roots thread the
list, so this is unreachable in the shipping app — but it is a quiet wrong answer rather than a refusal,
where `toolsForRole`'s twin (`unusableOpenTask`) correctly throws. Make the registry path throw too.

### N5 — `call()` does not distinguish a transport failure from a refusal

`layers/core-ui/src/services/call.ts:20-25` parses `res.json()` unconditionally and casts it to
`ActionResult`. A 401/500 (non-`ActionResult` body, or a non-JSON body) becomes either a thrown parse
error or an object with `ok === undefined`, which every caller treats as `!ok` with `problems[0]`
undefined — an error message of `null`. Check `res.status` / the shape before casting.

---

## FOLLOW-UP / NOTE

- **F1 — the eval scenarios still drive deleted tools.** `tools/eval/src/scenarios/handoff-to.ts` (a
  whole file, 6 scenarios) instructs agents to call `handoff_to`; `tool-authorization.ts:42` lists
  `create_task`/`log_task`/`handoff_to`; `force-return.ts:56,66,297,307` tells the agent not to call
  `handoff_to`; `judges.ts:265-280` judges "handoff_to called". These are development-world files and
  nothing in the gates reads them, so they do not block — but the eval lane is the benchmark, and these
  scenarios can now only ever fail. Worth an explicit carry-forward rather than a silent rot.
- **F2 — `tools/trace/trace.test.ts:16,22,35,46,55`** uses `POST /api/tasks/:id/handoff` and
  `TOOL handoff_to` as its fixture labels. Harmless (they are synthetic fixtures), noted so nobody reads
  them later as evidence those doors exist.
- **F3 — the task module's barrel still exports the seven task error classes**
  (`layers/core-api/task/src/index.ts:16-24`). `CapacityExceededError`/`InvalidTransitionError` still
  have a real consumer (`middleware/error-handler.ts:4`); I did not confirm live throw sites for
  `TaskCycleError`, `TaskDependencyBlockedError`, `TaskDependencyKilledError`,
  `TaskDependencyNotFoundError`, `TaskInvalidTransitionError` beyond `lifecycle-propagation`'s own
  re-declared copy. §9 says each of those "loses its throw sites"; if they are now unreachable they are
  dead code to delete, but that is a knip question, not a review finding, and knip was not in my run set.
- **F4 — `edit_task` now emits `task_state_changed` on create** (`task-actions.ts:704-713`, with
  `fromState === toState === "proposed"`), because the guard is `prev === null || prev.state !== resolvedState`.
  The deleted `create_task` tool emitted the same shape by hand, so this is not new behaviour on the tool
  path; it is new for the HTTP create path. Noted, not judged.
- **F5 — the attack pair is genuinely live.** The positive overlay's route matches the scan's key format
  and the control's `mutate` target string exists (`layers/core-api/src/routes/threads.ts:767`), so the
  control is not passing vacuously. The ratchet's second direction (an entry whose route is gone) is
  implemented (`actions-projected.ts:409-418`) and I did not break-test it live, as that needs an edit.
- **F6 — `WorkTaskPage` hides the client-side invariant message once a save has failed** — it renders
  only while `status === "idle"` (`WorkTaskPage.tsx:605`). The Save button stays correctly disabled, so
  the control is greyed with no reason shown after an error. Polish, mentioned because the founder gate
  looks at exactly this screen.
- **F7 — the plan amendments the architecture already flagged are still owed at the gate**: the rule
  ships green rather than red (§7), and the size band moved to 2,550–2,750 (§13). Neither is a review
  finding; both need the founder to hear them.

---

## Verdict

**BLOCKED** — 8 blocking findings, 5 non-blocking defects, 7 follow-ups.

The mechanism itself is sound and the hard parts (one composed list reaching both provider sites, the
in-transaction change row, collateral-vs-reaction, the destructive migration, a lint rule whose scans
cannot read as green while empty) are done well and are worth copying in BC3–BC6. What blocks is a
fabricated dispatch-attempt id that turns a reachable retry into a 500, a fabricated event field that
regresses routine matching, one surviving out-of-module task write, an unapproved widening of the
harness return contract, work-package ids in shipped source, an undone documentation sweep, an unproven
repair the architecture itself called the prerequisite, and the one lint clause that is a list where
every other is a scan.

## Confusions

1. **B3 cannot be fixed inside the locked contracts.** `tokensActualJson` is written by the session-end
   reaction and is not a field on `EditTaskInput` (§3). Either the input grows a field or §6's absolute
   sentence gains a stated exception. I did not choose; the orchestrator should route it as an
   amendment, not as a code fix.
2. **B4 has no obviously right answer.** Deleting `handoff_to` forced *some* change to
   `RETURN_ACTION_NAMES`, and neither `plan.md` nor `architecture.md` says which. Three members, or
   `edit_task` gated on the session's own task, are both defensible; the decision is the founder's, and
   whichever it is, the harness lane has to be re-run against it because the tool roster and the forcing
   message both changed.
3. **I could not break-test the ratchet's second direction or the `--attacks` isolation of the new pair
   without editing the tree**, which is outside my role. Both read correct and the suite passes; I am
   reporting that as read, not as executed.
4. **The `search_tasks` branching (N1) may be deliberate** — it mirrors what `WorkFilter` supports today
   — but the declaration does not say so. If it is deliberate, the declaration should narrow; if not, the
   query should widen. I judged it non-blocking because no current caller combines the dropped filters.
5. **I did not run `npm run lint`'s biome/eslint passes, knip, `test:integration:service` in full, the
   e2e suite, or the harness lane.** The harness lane is obligatory before ship (§11) and, given B4
   changes the return contract and the tool roster, it is the one lane whose result I would not assume.

---

# Round 2 — the fix delta, re-tested against the tree

Delta read: `6802e58e1..HEAD` (`85b9fad13` fixes, `2e7d09061` formatting, `a35e86134` plan) plus the
rebase onto `origin/main` `286628f7b` (222 files, +8,041 / −10,351 whole-branch). Every R1 blocker
re-tested as a claim; nothing taken from the R1 text.

Mechanical checks I ran myself (Node 24, this worktree):

- `npm run check` → **PASS**, all 39 packages (exit 0).
- `npm run lint` → **PASS** (exit 0). `governance-lint: PASS — 2543 files, 25 rules, 0 violations`;
  `governance-lint --attacks: PASS — 72 break-tests` (was 70; the new pair is live).
- `npx vitest run --config vitest.integration.config.ts --project service` over
  `task-actions.integration.test.ts` + `work-session-started-reactions.integration.test.ts` +
  `work-session-end-reactions.integration.test.ts` → **3 files / 28 tests passed**.
- `npx vitest run return-actions-required-subset.test.ts return-actions.closure.test.ts
  return-gate.test.ts` → **3 files / 72 tests passed** (exit 0).

## Per-blocker verdict

**B1 — fabricated dispatch-attempt id → RESOLVED.** `task-service.ts:92,122` now returns
`{ id: string | undefined }` and yields `inserted[0]?.id` with no `?? id` fallback; both dispatch
branches (`task-actions.ts:675`, `:703`) guard the bake and the `dispatch` assignment on
`if (inserted.id)`, so a swallowed conflict produces no `resolveTaskRunRequest` call, no throw
inside the transaction and no intent in 5d — exactly §5 step 4. Post-commit `endRunForHandoff` is
also skipped, because it keys off `dispatch?.occasion === "owner_handoff"`.

**B2 — fabricated `fromState` on cascade kills → RESOLVED.** `killSubtreeInTx` returns
`{ id, fromState }` pairs carrying the row's real `t.state` (`task-actions.ts:350`), and the emit
loop uses `killed.fromState` (`:743`). The root's own pair takes `prev?.state`, and the root is
skipped in that loop anyway (`:738`), so `routine-scheduler.ts`'s `{from,to}` matching sees the true
prior state again.

**B3 — a production writer outside the module → RESOLVED.** `tokensActualJson` is a field on
`EditTaskInputSchema` (`framework/domain-model/src/actions/task.ts:204-212`), threaded through
`candidateTask` (`:155`) and the transaction's `patch` (`:586`), so the writeback lands with its
`changes` row through the shared diff. `work-session-end-reactions.ts` no longer imports `update`;
it calls `editTask({ actor: event.agentId, … })` and logs a refusal. Proof:
`rg "(update|insert|delete)\(\s*tasks\s*\)"` over `layers/ framework/ applications/ tools/`
(production only) returns writes in `layers/core-api/task/src/task-service.ts` and nowhere else —
`tools/eval`, `tools/setup` are development seed paths; `rg 'update\((db|tx|exec)[^)]*"task"'`
returns only the explanatory comment in the reaction.

**B4 — return-gate widening → RESOLVED as decided.** `isReturnAction(name, args, taskId)` is
terminal for `edit_task` only when `args.id === taskId` **and** (owner changes to a non-empty id, or
`state` is `review`/`done`) — `return-actions.ts:100-108`; absent `taskId` is never terminal. The id
is threaded `provisioner.ts:1573-1576` (`params.taskId ?? undefined`) → `boot.ts:186` →
`return-enforcement.ts:44-52`. Covered by unit tests for own-task-owner-change, own-task
review/done, subtask-create (no `id`), other-task (`id` mismatch), ordinary field edit, and absent
`taskId`. **The harness lane is still owed** — the tool roster and the forcing message both changed
and no lane result exists yet in this worktree.

**B5 — item ids outside `.pipeline/` → NOT RESOLVED (still BLOCKING).** See below.

**B6 — documentation sweep → RESOLVED.** `rg -n "PATCH /api/tasks|handoff_to|create_task" docs/`
returns **zero hits** (exit 1). The rewrites are substantive, not cosmetic:
`handoff-and-lifecycle-propagation.md` §1 is rewritten as "handoff is an `edit_task` that sets
`ownerAgentId`" with the deleted wire shape, role targeting and human escalation removed and the
accepted `active`-session limit stated; `tasks-and-sessions.md`'s `@source` now points at
`task-actions.ts` and its dependency-watcher path at `core-api/task`.

**B7 — the repair shipped unproven → RESOLVED.** `work-session-started-reactions.integration.test.ts`
gains a case that seeds a `requested` attempt with **no** `requestId`/`sessionId`, emits a real
`session_started` carrying a real `requestId`, and asserts the row goes `running` with
`sessionId` set — plus the legacy no-`requestId` case asserting the row is untouched while the
`in_progress` transition still fires. `work-session-end-reactions`' `seedAttempt` lost its
`requestId`/`status` parameters entirely; every finalize case now primes through
`primeAttemptRunning`, which registers the started reaction and emits the event. The seam test's
handoff case does the same instead of hand-inserting `sessionId` (`task-actions.integration.test.ts`).

**B8 — clause 1 hardcoded the names → RESOLVED.** `scanDeclaredActionNames`
(`tools/governance/src/rules/actions-projected.ts:36-66`) filters the census to production
`framework/domain-model/src/actions/*.ts(x)`, collects every `name: "<snake_case>"`, and **throws**
on an empty set with a message naming the directory. Clause 1 and clause 3 both iterate the scanned
set; `TASK_ACTION_NAMES` is gone. The scan yields exactly `search_tasks · open_task · edit_task` at
HEAD.

## Rebase resolutions — checked

- `core-api-port.ts`: `TaskView`/`CreateTaskRequest`/`UpdateTaskRequest`/`CreateTaskResponse`/
  `HandoffTaskRequest`/`HandoffTaskResponse` deleted, `CoreApiWorkPort` down to the three item
  methods. `core-api-port-composition.ts`: the `tasks` hc-client block and every task/handoff type
  import gone. **`findItemByReasoningMarker` and `handoffTask` are both absent from the port and its
  composition** — the only surviving mentions are explanatory comments, `retired-surfaces-absent`'s
  own detection token, and the core-internal task-service helper of the same name.
- `governance-lint.ts`: `actionsProjected` registered in **both** lists (`buildRules` :133,
  `runLive` :253) — break-tested and run.
- `governance-attacks.ts`: `ATTACK_ANCHORS.serviceDir`/`.serviceBarrel`/`.serviceManifest` and the
  R1 manifest mutation all re-pointed to `layers/core-api/task`; the attack pair is registered. The
  control is **not** vacuous — its mutate target `router.get("/", async (c) => {` exists at
  `layers/core-api/src/routes/threads.ts:735`, so the replace really applies.
- `table-owners.json`: `33 → 34` (main dropped a table since the base), `changes → "changes"`,
  `tasks`/`items`/`taskDispatchAttempts → "task"`. `registries-honest` is green, so the schema
  declaration and the registry agree.
- Migration renumbered `0083_changes_and_task_edit.sql` with journal `idx: 83` after main's
  `0082_drop_hint_progress_and_attention_score`. No duplicate index, no orphan entry.
- The three roster tests move `18 → 14` tools with the four deletions and drop the `log_task`
  handler suite; `work-completeness` is a one-line re-point. No assertion was weakened beyond the
  deleted tools.
- **The legacy lists carry no entry BC1 deleted.** All three clauses implement the reverse direction
  (`:437`, `:459`, `:487`), the rule is green, so every one of the 93 routes, 15 tools and 16 events
  still exists. `coach`/`hints`/`triage-count`/`attention`/`sweep`/`latest-outcomes`/`inbox`/
  `team-members`/`scaffolded-agents`/`notification-config` rows and
  `run_knowledge_sweep`/`score_attention`/`thread_archived`/`dependency_met`/`knowledge_accessed`/
  `work_selection_requested`/`routine_fired` were removed with them.

## BLOCKING

### B5 (carried, still open) — three work-package ids in shipped source, outside an `@lore` tag

- **Evidence:** `rg -n "BC[0-9]" -g '!.pipeline' -g '!*.md' -g '!*.lock' -g '!package-lock.json'`
  returns thirteen hits. Ten are `@lore BC1: …` tags and are exempt. Three are not:
  `tools/governance/src/rules/actions-projected.ts:122`, `:228`, `:255` — each is a plain doc
  comment reading "Re-derived at the **BC1** rebase — BC1 deleted …" with no `@lore` tag anywhere in
  the block. The four R1 sites (the migration, `schema.ts`, `task-actions.ts`, and
  `actions-projected.ts:230`) were reworded; these three were introduced or left in the same rewrite.
- **Impact:** the rule file BC3–BC6 copy is the one file that teaches the next builder the
  convention, and it teaches the wrong one.
- **Authority:** standing project rule — work-package ids live in `.pipeline/**` only, `@lore` the
  sole exemption; the orchestrator's own B5 decision restates it.
- **Smallest fix:** reword the three sentences in product terms ("re-derived after the substrate
  item landed — fourteen of these routes were deleted with it"), or tag the blocks `@lore`.

## NON-BLOCKING DEFECT

- **N6 — neither B1 nor B2 gained a test.** `task-dispatch-attempt-store.integration.test.ts:137-145`
  states outright that none of its fixtures hits the unique-index conflict, and no test asserts a
  cascade-killed descendant's `fromState`. Both fixes read correct and both are covered by
  typechecking only; the regressions they repair would return silently. A second attempt with the
  same `(taskId, occasion, null predecessor, agentId)` and a kill of an `in_progress` child are two
  cheap assertions in files that already exist.
- **N7 — the token writeback's `changes` row is unasserted.** The six `session_ended` token cases
  assert `tokensActualJson` only; none reads `changes`. The row is produced (the shared `patch`
  diff at `task-actions.ts:632` includes `tokensActualJson`), but the thing B3 exists to create is
  the one thing the suite does not check.
- **N8 — routing the writeback through `edit_task` widens a lost-update window.** `edit_task`
  writes the **whole** `patch` derived from a `prev` snapshot read before its transaction, so a
  token writeback that interleaves with `lifecycle-propagation`'s own `session_ended` edit can write
  back the stale `state`. Both fire on the same event. §9 accepts last-write-wins generally, and the
  old targeted single-column update could not do this. Naming it, not blocking it: the orchestrator
  chose this route and `version` is available if it ever bites.
- **N9 — a swallowed dispatch conflict is silent.** With B1 fixed, the accept path can now commit an
  `accepted` task with no attempt row and no intent, and log nothing. That is what §5 step 4
  specifies, but an operator sees a task that accepted and never started. One `logger.debug` at the
  skip would make it observable.
- N1–N5 from Round 1 re-checked against the delta: unchanged and still non-blocking.

## FOLLOW-UP / NOTE

- **F8 — the forcing message does not describe the narrowed gate.** `FORCE_RETURN_MESSAGE`
  (`return-actions.ts:154-157`) still reads "edit_task (hand the task to another agent by setting
  its owner)"; after B4 the call must also name the session's **own** task, and moving that task to
  `review`/`done` now counts too. The message is not wrong, but it is no longer complete — and the
  gate's dependence on `args.id` being present in the harness's `tool_call` event is exactly what
  the harness lane has to prove per harness.
- **F9 — `tokensActualJson` is now writable by any actor on the public action surface**, HTTP and
  MCP alike, as an unvalidated JSON string. The read path is defensive (`sumTokensActual` catches
  parse failures and skips non-numeric tiers), so the worst case is wrong cost reporting, not a
  crash. Consistent with ETHOS (no preemptive gate) and with the orchestrator's decision; recorded
  so the founder hears that cost accounting became agent-writable.
- **F10 — production-code delta is +3,246 / −3,611** (whole branch vs `286628f7b`, excluding
  `.pipeline`, `docs/`, tests, stories and e2e). Above §13's 2,550–2,750 band, still net red. The
  count includes the migration SQL, the registry JSON and the 124 constant data lines in the lint
  rule. Not a scope finding — the band is F7's gate line and the founder owns it — but the number
  the founder hears should be this one.
- F1–F7 from Round 1 stand; F1 (eval scenarios still driving `handoff_to`) is untouched by this
  delta and is still a carry-forward, not a blocker.

## Verdict

**BLOCKED** — one blocking finding (B5, three work-package ids in `actions-projected.ts`), four new
non-blocking defects, three new notes.

Seven of the eight Round 1 blockers are genuinely closed, and closed the way the orchestrator
decided rather than by weakening a check: the id is honest and the skip follows it through both
dispatch branches, the kill carries the real prior state, the last out-of-module task writer is
gone with the grep to prove it, the return gate is narrower than it was before this branch rather
than wider, the docs sweep is a rewrite and not a search-and-replace, the repair is driven by a real
event in all three test files, and the one clause that was a list is now a scan that throws at zero.
What blocks is three sentences in a comment.

## Confusions

1. **B5 may read as pedantic and is not.** The three hits are in the file BC3–BC6 are told to copy,
   and the exemption is `@lore`, which these blocks do not carry. If the founder wants prose
   references to prior items allowed in governance rule files, that is a rule change, not a review
   judgement — say so and the finding goes away.
2. **I did not run the harness lane, the e2e suite, `test:integration` in full, or knip.** The
   harness lane is obligatory (§11) and is the only evidence that would settle F8; a lane was
   running in this worktree while I read, and I did not read its result.
3. **N8's interleave is reasoned from the code, not observed.** I did not build a test to force the
   two `session_ended` handlers to overlap.

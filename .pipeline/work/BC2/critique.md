# BC2 — architecture critique

Read-only critique of `.pipeline/work/BC2/architecture.md` against `plan.md`, `.pipeline/BC.md`,
`.pipeline/rules/*`, `plans/reviews/ACTIONS.md` §Task/§plumbing/§Events, `plans/reviews/LAYER-BELOW.md`
§7/§8, `tools/governance/README.md`, and the code at `efa28dd59`.

## What works

- The shape is right and the plan's paragraphs survive as steps. §5's `edit_task.run` ordering
  (load → merge → pure invariants → server invariants → one tx with `appendChange` → post-commit
  emit + work intent → return `open_task`) is a faithful, buildable reading of `plan.md:24-32`.
- Names on the wire (§2) are decided for a real reason: `RegisteredTool.name` feeds
  `mcpServer.registerTool` (`layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts:141-144`)
  and underscore names are what the four live tools already use
  (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:256,466,559,1441`).
- Declarations in `framework/domain-model` is correct and checked: its surface is
  `reach: "everyone"` (`tools/governance/architecture.json` surfaces), it already ships zod
  (`framework/domain-model/package.json:19`), and `core-ui` already imports it
  (`layers/core-ui/package.json:16`). `core-ui` never imports `core-api`; that holds here.
- `validateBody` really is at `@hyperidle/domain-model/http`
  (`framework/domain-model/src/http.ts:100`), so §6's HTTP loop is feasible as written.
- `AgentOrchestrationPort.sessions` exists and is read-only
  (`framework/api-contract/src/agent-orchestration-port.ts:259-261`), so §5's session read has a
  real door.
- Security (§9) is proportionate and not preemptive: actor from the middleware, never the body, is
  the existing behaviour (`layers/core-api/src/middleware/auth.ts:141-149`). No new gate. Correct
  per `.pipeline/rules/security.md`.
- The migration number `0082` is the next free one at this base
  (`framework/db/drizzle/0081_drop_items_layer.sql`, `meta/_journal.json` last `idx: 81`), and the
  hand-written `.sql` + journal entry is the required shape.
- `audit_trail` really is safe to drop: no production reader renders it —
  `layers/core-ui/src/pages/WorkTaskPage.tsx` never mentions it; only `types/task.ts:37` types it.
- The migration is full and destructive. No shim, no dual-write, no alias anywhere in §7/§12.

---

## BLOCKING

### B1. Deleting the five `CoreApiWorkPort` methods breaks three tools that survive this item

- **Claim.** §1 and §7 delete `getTaskById · createTask · updateTaskById · appendTaskNote ·
  handoffTask` "and their hand-typed client mirrors". `getTaskById` has five live call sites, and
  three of them belong to tools this item does not delete.
- **Evidence.** `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:207` (`write_memory`,
  declared at :189), `:708` and `:773` (`submit_review`, declared at :699), `:1538`
  (`create_artifact`, declared at :1489). Only `:487` (`create_task`) and `:281`/`:598`/`:1457`
  belong to the four deleted tools.
- **Authority.** `plan.md:9` deletes "the four tools and their seam methods" — not the methods other
  tools still use. `CLAUDE.md` ABSOLUTE RULE 2: move every caller in the same change.
- **Smallest fix.** §7 states that `getTaskById` stays on `CoreApiWorkPort` until BC6 (three named
  callers), or that those three tools are re-pointed at `open_task` in the same PR. Pick one and say
  which.

### B2. The UI consumer list is short by five surfaces; `search_tasks`' input cannot serve two of them

- **Claim.** §1/§7/§12 name three hooks (`useTaskPatch · useTaskTree · useTaskSessions`) and two
  pages (`WorkTaskPage`, `WorkTaskCreate`). Deleting `routes/tasks.ts` also breaks five more live
  callers.
- **Evidence.** `layers/core-ui/src/hooks/useTaskLookup.ts:53` (`GET /api/tasks?ids=`),
  `layers/core-ui/src/hooks/useTaskSearch.ts` (`GET /api/tasks?q=` + `excludeIds`),
  `layers/core-ui/src/pages/KnowledgeDetail.tsx:850` (`POST /api/tasks`, promote-to-task),
  `layers/core-ui/src/components/TaskDependencyField.tsx:44,50` (consumes both hooks).
  §5 fixes `search_tasks`' filter as `parentTaskId · ownerAgentId · state · teamId · text` — the
  live `WorkFilter` also carries `ids` (`layers/core-api/src/routes/tasks.ts:320`
  `work.list(db, "task", { ids: subtreeIds })`), which `useTaskLookup` depends on.
- **Authority.** `plan.md:78-79` — "the task page and the task tree stop calling routes and call the
  list"; nothing may be left calling a deleted route. `.pipeline/BC.md:33` — no dead code left.
- **Smallest fix.** Add `ids` and `excludeIds` to the `search_tasks` input in §3, and name the five
  surfaces in §7/§12 step 4.

### B3. The tools reach the MCP registry but not the session's allowlist or the prompt

- **Claim.** §6 wires `actionsAsTools(...)` only into `buildToolRegistry`
  (`run-orchestration-composition.ts:380`). The provider has a second construction site,
  `toolsForRole`, and that is what decides which tools a session may actually call.
- **Evidence.** `layers/agent-orchestration/src/services/run-orchestration-composition.ts:389`
  (`toolsForRole` builds its own definitions list);
  `layers/agent-orchestration/run-orchestration/src/provisioner.ts:1716` → `:1732`
  (`tools: allowedToolNames` goes into the harness session config — the per-session allowlist),
  `:1478` (the same list becomes the prompt's tool summaries), `:1703` (return-enforcement
  exemption). Actions absent from `toolsForRole` are registered on the MCP server and blocked at the
  CLI.
- **Authority.** `plan.md:46-47` — the MCP loop must register the action "as the session's agent";
  `.pipeline/BC.md:6` — every action exists as an MCP tool with the same authorisation as the UI.
- **Smallest fix.** §6 says the composed list is injected once, before the provider splits into
  `buildToolRegistry` and `toolsForRole`, so both read it.

### B4. §7 deletes a file the plan does not, and keeps the one the plan deletes

- **Claim.** §1/§7 delete `policy/handoff-protocol.ts` ("handoff-protocol dies with handoff — it is
  `edit_task` now") and keep `policy/lifecycle-propagation.ts` subscribing. `plan.md:9` says the
  opposite: the deletions are "… and the task half of `policy/lifecycle-propagation.ts`";
  handoff-protocol is not on the plan's list. Folding handoff to `ownerAgentId` (§3) also silently
  drops behaviour that has no other home.
- **Evidence.** `layers/core-api/policy/src/handoff-protocol.ts` is 385 lines and does four things a
  field write does not: `toRole`/`toHuman` target resolution (:68-120), an escalation thread +
  escalation item (:230-259), `deps.runOrchestration.endRunForHandoff` (:118), and a CAS transaction
  over the task. `plans/reviews/ACTIONS.md:286` keeps `POST /agent-orchestration/runs/end-for-handoff`
  as a plumbing seam route — so something must still call it. §1 row 6 keeps
  `policy/lifecycle-propagation.ts:435` subscribing, which the plan's delete list removes.
- **Authority.** `plan.md:9` (the delete list), `plan.md:93-97` (exactly three confirmed carry-overs;
  this is neither of them). Memory rule: cuts and deferrals need explicit approval.
- **Smallest fix.** §7 reconciles with `plan.md:9` line by line: say which half of
  `lifecycle-propagation.ts` goes, and either keep `handoff-protocol` called from `edit_task`
  post-commit or list the dropped behaviours (role targeting, human escalation, run end) for the
  founder as a fourth confirmed call.

### B5. Five live task writers stay outside `edit_task`, so they write no `changes` row

- **Claim.** §5 makes `edit_task` the one write, but the architecture never re-points the reaction
  writers that call `transitionTask`/`cascadeTaskKill` directly. After this item they still mutate
  task state, emit `task_state_changed`, and append nothing to `changes` — a hole in the very
  mechanism the item exists to prove.
- **Evidence.** `layers/core-api/src/services/work-session-started-reactions.ts:79` (session started
  → `in_progress`), `layers/core-api/work/src/dependency-watcher.ts:89,164`,
  `layers/core-api/policy/src/lifecycle-propagation.ts:164,271`,
  `layers/core-api/work/src/task-kill-cascade.ts:138`.
- **Authority.** `plan.md:30-32` — "the task is written and one row is appended … That row is the
  event"; `.pipeline/BC.md:20-22`.
- **Smallest fix.** §5 states, per writer, whether it calls `edit_task` in-process (preferred — it is
  the same edit a person would make) or stays a private intra-module transition that still calls
  `appendChange`. Six named call sites, one sentence each.

### B6. `export const taskActions` cannot leave the core-api layer face

- **Claim.** §5 locks the module's public surface as `export const taskActions: readonly Action[]`,
  and §6 has the application root compose it. The root only ever reaches a layer face
  (`applications/desktop/src/create-server.ts:38-48` imports `@hyperidle/core-api`,
  `/app`, `/boot` — nothing deeper), and a Service-imported *value* re-exported from that face is
  exactly what `service-values-do-not-escape-the-face` forbids.
- **Evidence.** `tools/governance/README.md:147-157` — "in a layer's own modules reachable from that
  `exports` map, a Service-imported value may not reach the module's export surface … with one
  positional exemption: a bare Service identifier in direct callee position". `layers/core-api/package.json`
  exports only `.`, `./app`, `./boot`.
- **Authority.** `.pipeline/rules/architecture.md:5-11` — boundary rules are machine-enforced and
  `npm run lint` is the source of truth.
- **Smallest fix.** The module exports a factory (`createTaskActions(deps): readonly Action[]`) and
  the face exports a function that calls it — a call in callee position is the sanctioned shape.

### B7. The rule's event clause is deferred to BC5 without a confirmed decision

- **Claim.** §6 drops "every emitted event is one of 9 + 8" to BC5. `plan.md:48-52` lists that clause
  as part of this item's rule, and `plan.md:93-97` records exactly three confirmed carry-overs —
  this is not one of them.
- **Evidence.** §6: "The event clause (every emitted event is one of 9 + 8) is added in BC5 when the
  nine exist." Compare `plan.md:50-51`.
- **Authority.** `plan.md:48-52`; `.pipeline/BC.md:37` — "the governance rule is green for what the
  item claims".
- **Smallest fix.** Cover still-legacy objects' events with the same `pending` list the route and
  tool clauses use, so the clause ships green in BC2; or take the deferral to the founder explicitly.

---

## NON-BLOCKING DEFECT

1. **The header's base commit is wrong and the line citations are stale.** §preamble says "Checked
   against `origin/main` @ `1df6da350`", but `routes/tasks.ts:328-333` and `:442-465`,
   `task-state-machine.ts:106,231,253` and `core-api-port.ts:171` all resolve against `f88b71434`
   (`routes/tasks.ts` is 627 lines there, 736 at `1df6da350`). The branch base is `efa28dd59`.
   Fix: re-anchor the citations, or state the base as `f88b71434` and say #550 was read separately.
2. **`deps.workIntents.record(...)` is not the live shape.** §5 step 5 and §1 row 6 name it; the
   real dep is a callable — `await deps.workIntents({ kind: "task_run", … })`
   (`layers/core-api/work/src/task-state-machine.ts:375-383`). The `.record` spelling survives only
   in `@lore` comments (`:206`).
3. **The table-owner registry edit is short one table and omits the schema declaration.** §6 names
   `tasks`, `items` → `task`. `work` owns three: `tools/governance/table-owners.json:15,16,41`
   (`taskDispatchAttempts`). The new `changes` table also needs its drizzle declaration in
   `framework/db/src/schema.ts` before `registries-honest` can see it
   (`tools/governance/src/rules/registries-honest.ts:34-43`).
4. **No attack case is specified for the new rule, and that fails the build.**
   `tools/governance/README.md:120` and `src/lib/governance-attacks.ts:24-28`: "a registered rule
   with no attack case fails the build", plus a control twin. §6 specifies `minScope`, the registry
   file and the clauses, but not the break-test. Fix: name the positive attack (an overlay route
   file under a non-`pending` object) and its legal twin.
5. **The rule's route population misses four live route files.** §6 scans
   `layers/*/src/routes/**`; routers are also defined in `layers/core-api/src/auth/**` (2 files),
   `layers/core-api/src/` (1) and `layers/agent-execution/harness-registry/src/mcp/` (1). A rule
   wired to a subset is the `au6` shape `.pipeline/rules/architecture.md:33-40` warns about.
   Fix: derive the population by scanning production files for `router.<verb>(`, hard-fail at zero.
6. **`core-ui` has no `zod` dependency.** §6's `call.ts` uses `z.input`/`z.output`;
   `layers/core-ui/package.json` dependencies list has no zod, and `npm run verify` runs
   `deps:check`. Fix: add it (it is already in the bundle transitively via `domain-model`).
7. **`notes` loses its atomic-append semantics.** Today `log_task` appends through a single
   `UPDATE … CASE` with no pre-read ("no lost-update race",
   `tool-definitions.ts:1455-1457`; `work-service.ts:680` `AppendNoteOp`) and prefixes
   `[<iso> <agentId>]`. §3 lists `notes` as an ordinary partial field and §5 step 2 is a
   read-modify-write, so two agents logging in the same session lose one note *and its history*.
   Fix: declare `notes` as the existing append op in `EditTaskInput`.
8. **The size estimate is presented as smaller than its own arithmetic.** §12 sums to
   150+120+500+150+120+120+300 = **1,460**, described as "Near the 1,000-line simplicity threshold".
   It also omits the new package scaffolding, the migration, the docs sweep (§11), the attack case,
   and the test churn: 10 files under `layers/core-api/src/__tests__/` reference `/api/tasks`, plus
   6 e2e specs, 2 stories and 5 component/hook tests in `core-ui`. A realistic figure is 1,600-1,800.
   `plan.md:95-96` accepts "roughly a thousand". Fix: state the real number in §12 so the founder
   approves the real number.
9. **The `0082` filename will collide on the BC1 rebase.** BC1 drops two tables and a column
   (`.pipeline/work/BC1/plan.md:53`), so it takes `0082` first. `plan.md:99-102` names two known
   overlaps; this is a third. Fix: add it to the overlap list with "renumber at rebase".
10. **§10 under-names the test churn it causes.** It re-points `core-api-port*` and
    `task-dependencies*` only; `WorkTaskPage.stories.tsx`, `TaskDependencyField.stories.tsx`,
    `layers/core-ui/__e2e__/W3-task-detail.spec.ts` and five more e2e specs mock the deleted routes.
    Stories are required per `.pipeline/rules/testing.md:55`.

---

## FOLLOW-UP / NOTE

- §5 keeps a third seam direction alive (core reads `AgentOrchestrationPort.sessions` inside
  `open_task`). `plan.md:76` says "those two ports are all that is left of the seam" and
  `LAYER-BELOW.md` §8 names two. It is defensible as a BC6 carry-over, but say so in those words.
- §6 avoids importing `@hyperidle/harness-protocol` in core-api and relies on structural typing;
  core-api already depends on that package (`layers/core-api/package.json` dependencies), so the
  avoidance buys nothing and costs the `RegisteredTool` type check. Also worth naming how
  `ActionResult` maps to `ToolResult` (`framework/harness-protocol/src/harness/tool-seam.ts:72-78`)
  — §8 says "isError", which is MCP SDK vocabulary, not this seam's.
- §6's example `plumbing` list includes `/ws`, which is not one of the sixteen in
  `plans/reviews/ACTIONS.md:274-291`. The real sixteen come from BC1; keep the list derived, not typed.
- Existing route handlers need `c.req.valid("json" as never)` (`routes/tasks.ts:336`), not the plain
  `c.req.valid("json")` §6 shows. Harmless, but it will cost the builder a typecheck round.
- `WorkTaskPage` reads task attachments through `useParentedKnowledgeItems`; once `open_task` returns
  attachments that hook becomes a second reach at the same data. Not in scope to delete, worth a line.

---

## Verdict

BLOCKED

---

## Confusions

1. Does BC2 emit anything new on the bus? `plan.md:54-58` says the module hands the change row to
   the bus as a wake-up; §5 step 5 emits only the old `task_state_changed`, and §2 says events stay
   dotted. If `task.changed` is not emitted in BC2, say so; if it is, it needs an entry in the bus
   types module the registry names.
2. What calls `POST /agent-orchestration/runs/end-for-handoff` after handoff folds into `edit_task`?
   ACTIONS.md keeps it as plumbing; nothing in the architecture calls it.
3. Is `items` ownership genuinely inert under the rename? §1 says it moves with the package until
   BC3, but `policy-engine`'s item audit append and `create_item`/`get_item` seam methods keep
   reaching it — worth one sentence that the `task` package keeps an items surface until BC3.
4. `version` is described as optional optimistic locking compared against `prev.updatedAt`
   (§5 step 2). `updatedAt` is a text ISO column (`framework/db/src/schema.ts:184`) with
   second-or-better resolution; two edits inside the same tick compare equal. Acceptable, but say it.
5. Who owns the "task tree" after `open_task`? §5 says `open_task` returns children ordered by
   `position`, but today `GET /:id/tree` also returns `ancestors` and `tokensActualRollup`
   (`routes/tasks.ts:328`), and `WorkTaskPage.tsx:554,559-560` builds its breadcrumb from
   `ancestors`. Neither field is in the `TaskView` sketch.

# AU21 — Edge disposition worklist (mechanically produced, source-cross-checked)

**Status:** produced during architecture (2026-07-27), not deferred to build. This is the real worklist
Increment 0 was meant to build; Increment 0 now *executes/verifies* these dispositions rather than
discovering them.

## How this list was produced (real, run, generalized)

Two mechanical passes, reconciled:
1. `scripts/generate-dependency-graph.ts` (the existing `ports.ts` scanner) — sees the **15** visible
   `agent-orchestration → core-api` DI edges (`dispatch` 8, `tool-handlers` 7).
2. `scripts/scan-hidden-composition-edges.ts` (**new, built for AU21, generalized — not hardcoded to any
   Service name**) — detects the composition-bundle pattern the `ports.ts` scanner is blind to: a Service
   whose "Deps"-shaped interface is *defined in its own package* but *composed in* `packages/core-api/src/
   services/*.ts`, where core-api functions are wired into it. Mechanism: for each composition-root file,
   find every **type** imported from an agent-orchestration package, then attribute an edge to every
   **core-api** Service whose value/namespace imports are wired into the object annotated with / returned as
   that type. Run output cross-checked against source for the two surprises (`run-orchestration`,
   `agent-selection`).

**Result — the complete enumeration.** 6 orchestration Services reach core-api; **37 distinct
consumer→provider Service-pair edges** (more than double the 15 the mechanical graph showed):

| Consumer | Visible to old graph? | Providers | Pairs |
|---|---|---|---|
| `tool-handlers` | yes (7) | conversation, knowledge, org, routine, users, work (+policy) | 7 |
| `dispatch` | yes (8) | conversation, knowledge, model-gateway, routine, settings, users, work (+review) | 8 |
| `session-requests` | **NO — hidden** | conversation, knowledge, org, review, routine, settings, users, work | 8 |
| `run-orchestration` | **NO — hidden** | connections, filesystems, knowledge, org, routine, settings, users, work | 8 |
| `cost` | **NO — hidden** | org, settings, users, work | 4 |
| `agent-selection` | **NO — hidden** | org, users | 2 |

**Unanticipated findings (coordinator Q5):** the scanner surfaced **two hidden consumers I had not
enumerated** — `agent-selection` (roster reads for agent selection) and `run-orchestration` (the session
runtime, the single largest hidden consumer at 8 providers). It also surfaced **capabilities that do not
fit §7's five categories** — `run-orchestration → connections` (provisioning credentials) and
`run-orchestration → filesystems` (sandbox mount/watch): these are *session-launch infrastructure*, not
domain reads/writes. A **sixth §7 category** is added below for them, flagged for a founder call.

## §7 disposition categories (recap, + the new one)
1. **dead/duplicate** → remove. 2. **decision-time domain read** → resolve-at-emit inside core-api + delete
the orchestration read (Decision B). 3. **agent-selection input** → baked at emit (Decision B step 1).
4. **agent-as-user read/write** → `CoreApiPort` seam (Decision A/C). 5. **failure/terminal signal** → event
(`agent_run_admission_failed` / `session_ended`) (Decision B5). **6 (NEW) — session-launch infrastructure**
(credentials/provisioning, sandbox mount): does not fit 1–5; **flagged for a founder call** (legitimate
orchestration→core coupling like the cost-cap exemption, vs. baked-at-emit).

---

## Consumer: `tool-handlers` (VISIBLE) — the running agent's MCP tool calls
**Disposition: §4 seam (CoreApiPort) for ALL — reads AND writes.** This is the agent acting on core "just
like the user would." Wired at `packages/core-api/src/services/tool-handlers-bindings.ts` via
`ToolHandlersPorts`. Every capability routes through `CoreApiPort` (Increment 2).

| Capability | file | Verdict | Reasoning |
|---|---|---|---|
| conversation.{findThread, insertThread, insertMessage, updateThread, findOrCreateDirectThread, listInbox} | tool-handlers-bindings.ts | §4 seam | agent sends/reads messages = UI's door |
| knowledge.{get, create, transition, findOpenConflict, recordConflict} | " | §4 seam | agent promotes/creates knowledge |
| org.{getTeam, getTeamMembers, createTeam, updateTeam} | " | §4 seam | agent scaffolds/edits teams |
| routine.{getRoutine, insertRoutine, updateRoutine} | " | §4 seam | agent authors routines |
| users.{findUser, listUsers} | " | §4 seam | agent reads roster (via seam GET) |
| work.{get, list, create, update, routeItem} | " | §4 seam | agent creates/updates bets/tasks/items |
| policy.handoff | tool-handlers-bindings.ts (visible graph) | §4 seam | agent handoff = a core action |

---

## Consumer: `dispatch` (VISIBLE) — scheduler + builtin-routines + assistant-runner + task-queue (Decision B′)
Wired at `dispatch-bindings.ts` via `DispatchPorts`. Mixed dispositions (this is the monolith Increments 4/5
untangle).

| Capability | Verdict | Reasoning |
|---|---|---|
| routine.{getRoutine, listRoutines, listRoutineRuns, findRunningRoutineRun, sumRunCost} | §2 → core-owned scheduling | scheduler decision reads → move schedule eval core-side (Decision B″, ruling #4) |
| routine.{insertRoutine, insertRoutineRun, updateRoutine} | §2/§5 → core-owned + event | routineRuns lifecycle writes → core owns; run outcome via events (Decision B″) |
| work.{get, list} | §2 baked | scheduling reads → baked at emit / core-owned |
| work.create | §4 seam | retro-item creation = agent-as-user write |
| conversation.{getThread, listMessages, getThreadIdsByHost, findRetroItem} | §2 baked / §4 seam | assistant-turn + retro reads → baked; thread/message writes → seam |
| conversation.{insertThread, insertMessage, updateThread} | §4 seam | assistant-turn + retro writes = UI's door |
| knowledge.{list, sweep} (runAutoPromotionSweep/runStaleSweep) | §1/§2 → core-maintenance core-side | builtin-routine maintenance sweeps belong core-side (Increment 5); practice-meeting DELETED |
| users.{findUser, getOrCreateUser} | §2/§3 baked | assistant identity → baked at emit |
| settings.readServerConfig | §2 baked | cost-cap/model config → baked or own-config |
| model-gateway.resolveModel | §3 baked | resolved model belongs in the start-payload (baked at emit) |
| review.createPracticeMeeting (+ createReviewItemForKnowledge) | **§1 DELETE** (practice-meeting, ruling #5) | practice-meeting deleted from `knowledge`; the `DispatchPorts.review` port removed |

---

## Consumer: `session-requests` (HIDDEN) — the drain worker `resolveIntentInput` (Decision B core)
Wired at `packages/core-api/src/services/durable-agent-queue.ts` (`queueDeps`), consumed by the drain worker
`resolveIntentInputInternal` (`session-requests/src/service.ts:709`) + `failOrRelease` (`:960`). **This is
the heart of Decision B.** Every domain read → §2 resolve-at-emit + delete; the writeback → §5 event.

| Capability | read/write site | Verdict | Reasoning |
|---|---|---|---|
| conversation.findMessage | service.ts:721 (assistant_turn) | §2 resolve-at-emit | resolve the assistant source + ast-`<userId>` runnability at emit; delete drain read |
| work.get (task/bet) | :750,767,842,893 | §2 resolve-at-emit | task/bet resolution → baked at emit |
| work.taskDispatchAttemptStore (get) | :764 | §2 resolve-at-emit | work-owned dedup re-check (`status!=="requested"`) → validate at emit |
| work.transition | createTriggered path | §2/own-state | request-insert transition; keep own-state, delete core re-read |
| knowledge.get | :786 | §2 resolve-at-emit | knowledge-action resolution → baked |
| routine.{getRoutine, getRoutineRun} | :804,807 | §2 resolve-at-emit | routine-run resolution → baked |
| routine.updateRoutineRun | failOrRelease :992 | **§5 event** | pre-handoff failure finalize → `agent_run_admission_failed` (Decision B5); replaces direct write; preserves AU15 AC-3d |
| review.findProposedCall | :889 | §2 resolve-at-emit | reengagement grant resolution → baked |
| org.getTeamMembers | :845 (bet_decomposition) | §2 resolve-at-emit | decomposition candidate roster → baked/selection at emit |
| users.{findUser, listUsers} | :701,852,862 (+requireRunnableActor) | §2 resolve-at-emit | actor runnability + candidate roster → validate/bake at emit (preserve ast-`<userId>` invariant) |
| settings.listConfiguration | :1374 (createTriggered trigger rules) | §2 resolve-at-emit | trigger-rule resolution → resolve at emit (core owns trigger config) |

---

## Consumer: `run-orchestration` (HIDDEN, NEW) — the session runtime
Wired at `run-orchestration-composition.ts`. **Largest hidden consumer.** Splits three ways.

| Capability | Verdict | Reasoning |
|---|---|---|
| knowledge.{list, rank} | §2 resolve-at-emit / MCP | context-assembly reads → bake context at emit OR agent pulls via MCP (Decision B self-recovery) |
| org.getTeam, users.findUser, work.get | §2 baked | context/identity reads for the run → baked at emit |
| settings.readServerConfig | §2 baked | run config → baked at emit |
| work.{transitionTask, update} | **§5 event** | session-end task-state writeback → already partly via `session_ended → policy [task_state_changed]`; route the rest through the event, not a direct core write |
| routine.{updateRoutineRun, updateRoutine} | **§5 event + Decision B″** | routine run/def writeback on session end → routine-runs-as-sessions collapse (ruling #4); outcome via events |
| routine.incrementRoutineCost | **Decision D — untouched** | cost accumulator (display aggregate); no mirror deletion, cap/accounting stays (Decision D) |
| connections.{applyProvisioningPlan, buildProvisioningPlan} | **§6 FLAGGED (founder call)** | session-launch **credential provisioning** (AN1/AN2) — not a domain read/write; legitimate orchestration→core infra like the cost exemption, OR bake the provisioning plan at emit. Founder call. |
| filesystems.{listFilesystems, startWatcher} | **§6 FLAGGED (founder call)** | **sandbox mount + writeback watcher** — orchestration↔execution sandbox territory that happens to live in a core-api Service. `filesystems → run-orchestration [sandbox_writeback_changes_detected]` event already exists; is the mount/watch a legitimate infra coupling or a seam? Founder call. |

---

## Consumer: `cost` (HIDDEN) — the cost-cap gate (Decision D)
Wired at `cost-bindings.ts` (`CostDeps`), consumed by `cost-cap.ts`. **Disposition: §6/flagged — founder
ruled the cap gate UNTOUCHED.** These are a single, coherent, founder-signed exemption (see Decision D):
the cost-cap gate is a decision-time gate, not a mirror; it stays exactly as-is.

| Capability | site | Verdict | Reasoning |
|---|---|---|---|
| users.{findUser, incrementUserCost, sumAllUserCost, updateUser, resetAllUserCost} | cost-cap.ts:135,207,300,350,361 | **flagged-permanent** | cap read + accumulate; founder: untouched |
| org.{getTeamMembers, applyTeamCost} | cost-cap.ts:159,212 | **flagged-permanent** | team cap read + accumulate; untouched |
| settings.{readServerConfig, updateServerConfig} | cost-cap.ts:507,517,533 | **flagged-permanent** | factory cap + sentinel level; untouched |
| work.{get, create, update} | cost-cap.ts:217 (bet lookup), 487 (review item) | **flagged-permanent** | bet-cost accumulation via `task.betId`; breach review-item creation; untouched |

*Note:* this whole consumer is the second graph-blindness instance (Decision D). The anti-regrowth guard must
*see* it, then allowlist it as the founder-signed cap-gate exemption — not silently ignore it.

---

## Consumer: `agent-selection` (HIDDEN, NEW) — roster reads for agent selection
Wired at `agent-selection-bindings.ts` (`AgentSelectionService`). **Disposition: §3 — baked at emit.** This
is exactly "core-api resolves the run (agent identity) at emit and pushes it" (Decision B step 1). Core-api
owns the roster; selection resolves there; orchestration receives the baked agent/candidates.

| Capability | site | Verdict | Reasoning |
|---|---|---|---|
| users.{findUser, listUsers} | agent-selection-bindings.ts:19 | §3 baked-at-emit | roster/candidate reads → core resolves selection at emit |
| org.getTeamMembers | agent-selection-bindings.ts:18 | §3 baked-at-emit | team membership for selection → resolved at emit |

*Caveat:* `agent-selection` is also consumed against-grain (`work → agent-selection`, an AU19 port) and by
`session-requests`' routine-delegate path. The §3 disposition means the *selection computation* moves to
emit-time core-api; whether `agent-selection` remains a distinct Service or folds into the emit-time
resolver is an Increment-3 structural question (flagged, not guessed).

---

## Summary of dispositions
- **§4 seam (CoreApiPort):** all of `tool-handlers` + the agent-as-user writes in `dispatch`. (Increments 1–2)
- **§2 resolve-at-emit + delete:** all of `session-requests`' domain reads + `dispatch` scheduling reads +
  `run-orchestration` context reads. (Increment 3, + 4 for routine)
- **§3 baked-at-emit:** `agent-selection` (both) + `dispatch` model/identity. (Increment 3)
- **§5 event:** `session-requests.routine.updateRoutineRun` (failOrRelease) + `run-orchestration` task/routine
  writeback. (Increment 3–4)
- **§1 delete:** `dispatch.review.createPracticeMeeting` (practice-meeting, ruling #5). (Increment 5)
- **Decision D untouched:** all of `cost` + `run-orchestration.routine.incrementRoutineCost`.
- **§6 FLAGGED (founder call) — genuinely does not fit §7's five:** `run-orchestration → connections`
  (provisioning credentials) and `run-orchestration → filesystems` (sandbox mount/watch). Plus the pre-existing
  flags (target-agent runnability provision-time cover; `taskDispatchAttempts` = work-owned, resolved).

## Open questions for the founder / concept gate
1. **Session-launch infrastructure (§6):** are `run-orchestration`'s `connections` (provisioning) and
   `filesystems` (sandbox) reads legitimate orchestration→core infra couplings (allowlisted like the cost
   gate), or must they be baked-at-emit? They are load-bearing for session start and don't fit the clean-loop
   read/write/event trichotomy.
2. **`agent-selection` Service fate:** does the selection computation folding into emit-time core-api retire
   `agent-selection` as a distinct orchestration Service, or does it stay and get *invoked* by core-api at
   emit (the existing against-grain `work → agent-selection` port)?
3. **`cost` exemption scope:** confirm the whole `cost` consumer stays as the founder-signed cap-gate
   exemption (Decision D), and the guard allowlists exactly it.

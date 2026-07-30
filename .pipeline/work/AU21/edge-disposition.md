# AU21 — Edge disposition worklist (mechanically produced, source-cross-checked)

**Status:** produced during architecture (2026-07-27), not deferred to build. This is the real worklist
Increment 0 was meant to build; Increment 0 now *executes/verifies* these dispositions rather than
discovering them.

**Increment 0 re-verification (2026-07-27, this pass):** `scripts/scan-hidden-composition-edges.ts` and
`scripts/generate-dependency-graph.ts` re-run against the current tree. **Zero drift.** The visible-graph
re-run reproduces the identical 15 pairs (`tool-handlers` 7, `dispatch` 8) and identical summary (48 port
edges, 22 EventBus edges, 23 services) — these counts are unchanged from the existing
`plans/AU19/dependency-graph-data.json`/`as-is-dependency-graph.md` baseline. The hidden-edge
scan reproduces the identical 22 hidden pairs (`session-requests` 8, `run-orchestration` 8, `cost` 4,
`agent-selection` 2), confirming the **37**-edge enumeration below is still accurate. Increment 0 does
**not** commit any change to `plans/AU19/dependency-graph-data.json` or `as-is-dependency-graph.md` — the
folded generator's write path (`scripts/generate-dependency-graph.ts`'s `main()`) is exercised only via
`composition-edge-anti-regrowth-guard.ts`'s in-memory import of its exported functions, never invoked as a
CLI here, so no `hiddenCompositionEdges` section is emitted into those files by this commit. The full
re-baseline of those two files (replacing the 48/22 port/EventBus counts, emitting the
`hiddenCompositionEdges` section, and confirming the phantom edge) is Increment 9's deliverable, deferred —
`git status`/`git diff` for those two files are clean at the end of Increment 0. Also folded in below:
final rulings on resolution-helper placement, the `routineRuns` collapse shape, and the four per-builtin-
routine dispositions (a correction to the `dispatch` table's `work.create`/`conversation` rows was found and
applied — see the `dispatch` section) — the full reasoning for the first two lives in `architecture.md`
(Decision B's note, Decision B″), cited here where it touches this worklist's rows.

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
domain reads/writes. A **sixth §7 category** is added below for them — **since resolved by Decision F2**
(the provisioning *operation* moves to orchestration, reading the core-api *record* via the seam).

## §7 disposition categories (recap, + the new one)
1. **dead/duplicate** → remove. 2. **decision-time domain read** → resolve-at-emit inside core-api + delete
the orchestration read (Decision B). 3. **agent-selection input** → baked at emit (Decision B step 1).
4. **agent-as-user read/write** → `CoreApiPort` seam (Decision A/C). 5. **failure/terminal signal** → event
(`agent_run_admission_failed` / `session_ended`) (Decision B5). **6 (NEW) — session-launch infrastructure**
(credentials/provisioning, sandbox mount): does not fit 1–5 — **RESOLVED by Decision F2** (record stays
core-api, provisioning operation moves to orchestration reading the record via the seam at launch).

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
| routine.insertRoutineRun | §2 → dissolves (not a "collapse") | fire-time insert (`dispatch/service.ts:697,1032,1045,1064`) dissolves once the schedule-fire decision itself moves core-side (Increment 4) — becomes a same-package, same-transaction write; zero cross-layer edge is left to collapse (Decision B″, Increment 0 final ruling) |
| routine.updateRoutineRun | §5 event | run finalize (`outcome`/`endedAt`/`costMinor`/`summary`) via `agent_run_admission_failed` (pre-handoff, replaces `failOrRelease`'s deleted direct write) + `session_ended`/`agent_run_lifecycle_changed` (post-session, replaces `transition-run.ts`/`runtime-reapers.ts`'s deleted direct writes) — never a direct orchestration write into `routineRuns` again (Decision B″, Increment 0 final ruling) |
| work.{get, list} | §2 baked | scheduling reads → baked at emit / core-owned |
| work.create (post-bet-retro / portfolio-retro) | **§1/§2 core-maintenance-moved-core-side** (CORRECTED — was mis-disposed §4 seam) | `runPostBetRetro`/`runPortfolioRetro` (`dispatch/service.ts:767-901`) create the review item from a deterministic template (bet's own `hypothesis`/`completedAt`/`revisionLog`, or a recent-L3/L4 aggregation); no agent/LLM session is invoked anywhere in either function — this is scheduler-fired core-maintenance, not an agent acting as a user (Increment 0 final ruling, Decision B′) |
| conversation.{getThreadIdsByHost, findRetroItem} (post-bet-retro dedup check) | §1/§2 core-maintenance-moved-core-side | deterministic already-retroed guard, no agent involved |
| conversation.insertThread (post-bet-retro / portfolio-retro) | §1/§2 core-maintenance-moved-core-side | retro thread creation, deterministic, no agent involved (CORRECTED — previously bundled under the same §4-seam verdict as assistant-turn's writes below; split apart, Increment 0 final ruling) |
| conversation.{getThread, listMessages} (assistant-turn context) | §2 baked | assistant-turn context reads → baked at emit |
| conversation.{insertMessage, updateThread} (assistant-turn) | §4 seam | assistant-turn writes = UI's door (agent-as-user, genuine agent session involved) |
| knowledge.{list, sweep} (runAutoPromotionSweep/runStaleSweep) | §1/§2 → core-maintenance core-side | `runKnowledgePromotion`/`runKnowledgeDecay` (`dispatch/service.ts:905-955`) call only existing `knowledge`-owned sweep algorithms, deterministic, no agent involved anywhere in either function (Increment 0 final ruling, Decision B′; Increment 5 executes); practice-meeting DELETED |
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
| connections.{applyProvisioningPlan, buildProvisioningPlan} | **RESOLVED — Decision F2** | provisioning **operation** moves to orchestration; it reads the connection **record** via `CoreApiPort` at launch (the record stays core-api for the human config surface `SettingsConnections` → `/api/connections`). Not a bake, not an exemption — a seam read + orchestration-owned op. (Increment 8) |
| filesystems.{listFilesystems, startWatcher} | **RESOLVED — Decision F2** | sandbox mount/watch **operation** moves to orchestration; reads the filesystem **record** via `CoreApiPort` (record stays core-api for `SettingsFilesystems`). The existing `filesystems → run-orchestration [sandbox_writeback_changes_detected]` event stays. (Increment 8) |

---

## Consumer: `cost` (HIDDEN) — the cost-cap gate (Decision D)
Wired at `cost-bindings.ts` (`CostDeps`), consumed by `cost-cap.ts`. **Disposition: §6/flagged — founder
ruled the cap gate UNTOUCHED.** These are a single, coherent, founder-signed exemption (see Decision D):
the cost-cap gate is a decision-time gate, not a mirror; it stays exactly as-is.

| Capability | site | Verdict | Reasoning |
|---|---|---|---|
| users.{findUser, incrementUserCost, sumAllUserCost, updateUser, resetAllUserCost} | cost-cap.ts:135,207,300,350,361 | **allowlisted-permanent (founder-signed)** | cap read + accumulate; founder: untouched |
| org.{getTeamMembers, applyTeamCost} | cost-cap.ts:159,212 | **allowlisted-permanent (founder-signed)** | team cap read + accumulate; untouched |
| settings.{readServerConfig, updateServerConfig} | cost-cap.ts:507,517,533 | **allowlisted-permanent (founder-signed)** | factory cap + sentinel level; untouched |
| work.{get, create, update} | cost-cap.ts:217 (bet lookup), 487 (review item) | **allowlisted-permanent (founder-signed)** | bet-cost accumulation via `task.betId`; breach review-item creation; untouched |

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

**RESOLVED — Decision F1 (founder, 2026-07-27):** `agent-selection` **dissolves.** *Who* is assigned is
core-api's business decision; `selectAgent` reads only core-api roster, so it folds into core-api's emit-time
resolution. `isAtCapacity` (active-session count vs `maxConcurrentSessions`) folds into provision-time
concurrency. The against-grain `work → agent-selection` `AgentSelectionDefaults` port **ceases to exist**
(selection is core-api's own logic now — a dissolution, not a reopen). `agent-selection` likely does not
survive as a standalone Service. (Increment 3 relocates `selectAgent`; Increment 8 folds `isAtCapacity`.)

---

## Summary of dispositions
- **§4 seam (CoreApiPort):** all of `tool-handlers` + `dispatch`'s assistant-turn writes ONLY
  (`insertMessage`/`updateThread`) — a genuine running agent session is involved. `dispatch`'s post-bet-retro/
  portfolio-retro writes (`work.create`, `conversation.insertThread`) are **not** seam traffic (corrected,
  Increment 0 — see the `dispatch` table); no agent session exists in that path. (Increments 1–2)
- **§1/§2 core-maintenance-moved-core-side:** all four builtin-routine bodies (post-bet-retro, portfolio-retro,
  knowledge-promotion, knowledge-decay) — none launches an agent/LLM session (Increment 0 final ruling,
  Decision B′; Increment 5 executes) — plus `routine.insertRoutineRun`'s fire-time write, which dissolves
  entirely once the scheduler itself moves core-side (Increment 4).
- **§2 resolve-at-emit + delete:** all of `session-requests`' domain reads + `dispatch` scheduling reads +
  `run-orchestration` context reads. (Increment 3, + 4 for routine)
- **§3 baked-at-emit:** `agent-selection` (both) + `dispatch` model/identity. (Increment 3)
- **§5 event:** `session-requests.routine.updateRoutineRun` (failOrRelease) + `run-orchestration` task/routine
  writeback. (Increment 3–4)
- **§1 delete:** `dispatch.review.createPracticeMeeting` (practice-meeting, ruling #5). (Increment 5)
- **Decision D untouched:** all of `cost` + `run-orchestration.routine.incrementRoutineCost`.
- **§6 (session-launch infrastructure) — RESOLVED by Decision F2:** `run-orchestration → connections`
  (provisioning) + `→ filesystems` (sandbox) — the **operation** becomes orchestration's, reading the core-api
  **record** via the seam at launch. Pre-existing flags: target-agent runnability (provision-time cover),
  `taskDispatchAttempts` = work-owned (resolved).
- **Removed against-grain edge (Decision D2):** `work → cost` `CostCapChecker` — deleted; core never blocks on
  cost. `work → agent-selection` — dissolves (F1). Both are core→orchestration (reverse) edges, noted here
  because AU21 now removes them; neither is in the 37 agent-orch→core list.
- **Canonical recorder (Decision G):** `work → session-requests` + `review → session-requests` are NOT two
  exceptions — they are the one `AgentWorkIntentRecorder` mechanism (`enqueueWorkIntent`/`agent_work_intents`,
  `kind`-discriminated; `work/ports.ts:143`, `review/ports.ts:52`, canonical in `shared/agent-work-intent-recorder.ts:65`).
  Unify onto the one shared contract, delete the local mirrors, `tsc`-enforced + a kind-set == schema-CHECK test.

## Founder-resolved (2026-07-27) — formerly open questions
1. **Session-launch infrastructure (§6):** RESOLVED — Decision F2 (record stays core-api, provisioning op →
   orchestration via seam read).
2. **`agent-selection` Service fate:** RESOLVED — Decision F1 (dissolves; `work → agent-selection` port ceases;
   `selectAgent` → core-api, `isAtCapacity` → provision-time concurrency).
3. **`cost` exemption scope:** RESOLVED — Decision D2 supersedes: the **blocking** `work → cost` port is
   *removed* (core never blocks on cost); the remaining `cost` consumer (the session-launch cap gate, `cost-cap.ts`)
   stays as the founder-signed exemption and the guard allowlists exactly it.

## Still open (settings)
- **Cross-layer settings union (Decision F3):** needs its own scoped `/design` pass — one unified surface backed
  by `CoreApiPort` + `AgentOrchestrationPort`. Flagged, not resolvable inline.

---

## Increment 9 forensic-triage accounting (post Increment 8, this pass)

A full re-run of `scripts/composition-edge-anti-regrowth-guard.ts`'s `inspect(process.cwd())` — the real
detector, not a re-derivation from this doc — found **42 findings / 24 distinct consumer::provider pairs**
against the post-Increment-8 tree. Every one was traced to real source (not guessed) and closed into exactly
one of three buckets. Zero left unaccounted.

**Bucket A — detection-quirk false positives, fixed in the guard/graph tooling itself (11 findings closed,
not allowlisted):**
| Pair | Real cause | Fix |
|---|---|---|
| `tool-handlers::conversation` (40 methods, medium confidence) | `ToolHandlersCoreApiAccessor` routes 100% through the `CoreApiPort` seam (`seamPortForActor`/`buildCoreApiPort`) — zero raw imports of `conversation`/`work`/`org`/`routine`/`knowledge`/`users` real functions; verified by reading `tool-handlers-bindings.ts` in full | `SEAM_INTERFACES` (`generate-dependency-graph.ts`) excludes it |
| `dispatch::model-gateway` (raw-port + composition-bundle) | `model-gateway` owns ZERO tables (own barrel doc: "never reads [config] itself"; absent from `TABLE_OWNER`) | `isStatelessProvider` (guard) excludes zero-owned-table providers |
| `tool-handlers::work` (`routeItem`, raw-port + composition-bundle) | `routeItem` is a pure `{riskTier,kind,verb} -> view` switch, zero `db` param, verified against `@hyperidle/work`'s real implementation | `STATELESS_METHODS` (guard) excludes it by name |
| `dispatch`'s 8 raw-port findings (all methods reported as bogus `runOrchestration`/`toolHandlers`, phantom `review`/`knowledge` targets) | `DispatchPorts` is a nested-composition-group interface; the flat-interface method scan + a stale 12-target `MANUAL_OVERRIDES` array (dating to a pre-Increment-4 shape) mis-resolved it | `resolveNestedGroupEdges` (`generate-dependency-graph.ts`) resolves per-group correctly; stale override removed |

**Bucket B — genuine dead composition, deleted (session-requests's 4 findings closed, not allowlisted):**
`DurableAgentQueueDeps` (`@hyperidle/session-requests`) declared `conversation.getMessageById`,
`review.findGrantedProposedCall`, `knowledge.findById`, `routine.getRoutineRunById`/`getRoutineById`,
`users.getUserById`/`listUsersByTeam`, `work.getTaskById`/`getBetById` — confirmed **zero real call sites**
anywhere in `service.ts` (grepped before removal). `resolveIntentInputInternal`, the function that used to call
these, was already fully deleted by the Increment 3/4 resolve-at-emit migration; this was leftover, unreachable
wiring nobody cleaned up alongside it. Deleted from the type + `durable-agent-queue.ts`'s composition + the
structural mirror `@hyperidle/run-orchestration`'s own `contracts.ts` `DurableQueueDeps` (Mechanism C forbids
importing the real type, so it carries its own copy). The `*-baked-emit.integration.test.ts` family's
throwing-spy assertions (built specifically to prove "zero domain reads") pass unchanged with the spy wiring
removed — the type system itself now makes the old read unreachable at compile time, strictly stronger than a
runtime spy.

**Bucket C — genuinely NOT yet closed, real in-scope-for-AU21 gaps, left OPEN (31 findings / 15 distinct pairs,
NOT allowlisted, NOT silently dropped):** every one matches this doc's OWN original disposition (mostly §2
resolve-at-emit / §2-§3 baked, i.e. always meant to migrate away, never an exemption) — Increments 1-8 simply
didn't reach them. No founder ruling exempts any of these (unlike `cost`), and none is owned by an
already-tracked separate follow-up (unlike R9's harness-gated mid-run-injection question, architecture.md §16)
— they are AU21's own unfinished work.

| Consumer | Provider | Real site | What's still missing |
|---|---|---|---|
| `dispatch` | `work` | `service.ts`'s task-queue (`startupSweep`/`handleTaskStateChanged`/`handleSessionEnded`) `listTasks("accepted")`/`getTaskById` | `TaskStateChangedEvent`/`SessionEndedEvent` don't carry `ownerAgentId`/`teamId` — never baked at emit, so the queue still reads `work` live to decide who to dispatch to |
| `dispatch` | `routine` | `provisionTeamRoutinesInternal`'s `routine.insertRoutine` (team-creation-time builtin-routine definition seed) | documented in `ports.ts`'s own `@lore` as "out of this increment's relocate-list" — a write, not a read, but still a live cross-layer edge; no founder ruling on whether it bakes/moves core-side or is a bounded exception |
| `dispatch` | `conversation` | `dispatch-bindings.ts`'s `listMessagesByThread`/`getThreadById` (assistant-turn context) — NOTE: `insertMessage`/`updateThread` are correctly seam-routed already (Increment 2) | assistant-turn's context reads were never baked at emit the way `insertMessage`/`updateThread`'s writes were migrated to the seam |
| `dispatch` | `users` | `dispatch-bindings.ts`'s `getOrCreateUser`/`getUserById` (assistant identity) | assistant identity resolution never baked at emit |
| `dispatch` | `settings` | `dispatch-bindings.ts`'s `readServerConfig` (assistant-turn model/cost config) | never baked at emit |
| `session-requests` | `org` | `createTriggeredInternal`'s `deps.teams.getTeamMembersByTeamId` | trigger-rule/target-agent resolution still happens AT DRAIN time, not at the emitting core-api Service |
| `session-requests` | `settings` | `createTriggeredInternal`'s `deps.config.listConfiguration` | same — trigger-rule matching reads config live at drain |
| `session-requests` | `users` | `createTriggeredInternal`'s `deps.users.getUserByIdScopedToTeam` | same — target-agent validation reads live at drain |
| `session-requests` | `work` | `deps.work.taskDispatchAttemptStore.*` (own-state CAS/dedup) + `lifecycleProjection.work.updateBetDecompositionStatusIfRunning`'s guarded `work.transition` write | architecture.md's own text is in tension here ("keep the AU9 CAS/dedup reads" vs. this row's original "§2 resolve-at-emit" verdict) — flagged as ambiguous, not resolved this pass |
| `run-orchestration` | `knowledge` | `run-orchestration-composition.ts`'s `contextPorts.knowledge.list`/`rank` (`context.ts`'s context assembly) | Decision B offered TWO resolutions ("bake at emit OR agent pulls via MCP") — neither has happened; still a live orchestration-side read at session-run time |
| `run-orchestration` | `org` | `contextPorts.org.getTeamById` | same — context-assembly read, not baked |
| `run-orchestration` | `routine` | `contextPorts.routine.getRoutineById` + `routineAccessor` (session-lifecycle) | same |
| `run-orchestration` | `settings` | `contextPorts`/`settingsReader.readServerConfig` | same |
| `run-orchestration` | `users` | `contextPorts.users.getUserById` + `userReader`/`workAccessor.transitionTask`'s `requireRunnableAgent` | same |
| `run-orchestration` | `work` | `contextPorts.work.getTaskById`/`getBetById` + `workAccessor` (session-lifecycle task/bet reads+writes) | same |

**Closure owner for Bucket C:** a subsequent Increment 9 wave, before the bare `inspect(process.cwd())` check
is wired into `npm run lint` (wiring it today, unresolved, would red the build on these 15 real, pre-existing,
catalogued-but-unmigrated pairs — not a new violation). Not a separate work package.

---

## Increment 9 forensic-triage accounting — SECOND pass (this wave, closes Bucket C)

Every one of Bucket C's 31 findings / 15 pairs re-investigated against real, current source — not re-derived
from the table above — and closed into exactly one of three final dispositions. Zero left unaccounted.

**DELETED (3 pairs: `session-requests -> org/settings/users`).** `createTriggeredInternal` (the `"triggered"`
`CreateSessionRequestInput` kind) had **zero production callers**, confirmed two ways: (a) git archaeology —
routine firing has called `enqueueWorkIntent` directly since BEFORE AU21 started (verified at `7b64e8d1^`'s
`dispatch/service.ts` and AU20's own `d6dcfa2c` "session-requests: rewrite durable queue anew"), and every other
family's real resolve-at-emit migration bakes straight onto `enqueueWorkIntent` too; (b) a full repo-wide
call-site grep for `kind: "triggered"` found exactly one caller anywhere, ever:
`packages/core-api/src/__tests__/trigger-resolution.integration.test.ts` (deleted alongside this — test-only
reachable code is dead code). Deleted: `createTriggeredInternal`, the `"triggered"` `CreateSessionRequestInput`
variant + its `createSessionRequest` overload, and `DurableAgentQueueDeps`'s now-fully-dead `config`/`teams`/
`users` fields (plus the already-dead `work.getTaskDispatchAttemptById` sub-method, caught in the same pass).
6 dependent test files updated (their throwing-spy "zero domain read" assertions now hold via the type system
instead, same pattern as the first pass's Bucket B).

**Side discovery, flagged not fixed (out of AU21's scope):** `settings`'s `kind:"trigger"` config entity — a
real, user-editable UI feature (`SettingsAgentBehavior.tsx`'s "Triggers" tab, backed by `agent-behavior-config-
impl.ts`'s PATCH route) that lets a user/plugin override which agent handles an event — has had **no code path
anywhere** that reads it to affect real agent selection, confirmed predating AU21 (the same git archaeology
above). This is a genuine, pre-existing, orphaned-feature product gap, unrelated to AU21's boundary-seam work.
Flagged for founder attention; not a AU21 or AU23 concern unless separately scoped.

**ALLOWLISTED (2 pairs, builder-ruled bounded exceptions — same rigor bar as the founder-signed `cost::*`
entries, see `scripts/composition-edge-anti-regrowth-guard.ts`'s `ALLOWLIST` for the exact source-verified
reasoning per pair):**
- `session-requests::work` — `taskDispatchAttemptStore.reapTerminal` (AU9 CAS/dedup) + `lifecycleProjection
  .work`'s guarded (state-precondition-checked) writeback of a session's own outcome into `taskDispatchAttempts`/
  `bets.decompositionStatus` on completion. This resolves the prior pass's flagged ambiguity: it is the
  write-back ANALOG of Decision B's "own-state dedup reads remain" rule, not a `resolveIntentInputInternal`-style
  domain read — a real, live, AU9-established mechanism, not a resolve-at-emit gap.
- `dispatch::routine` — `provisionTeamRoutinesInternal`'s `routine.insertRoutine` (team-creation-time
  `BUILTIN_SPECS` seed write). A one-time, deterministic definition insert, not a live agent-run-path read;
  architecture.md's own Increment 4 ruling explicitly scoped it OUT of the routine-scheduler relocation
  (`packages/core-api/src/routines.ts`: "provisionTeamRoutines stays on dispatchOps... unchanged this
  increment"). Migrating it would require either a new `CoreApiPort` route with no genuine human-facing surface
  (violates Decision A's "same real door" principle) or restructuring `tool-handlers`' `create_team` tool flow
  (a redesign, out of this wave's scope) — a bounded, low-risk residual.

**DEFERRED to AU23, named closure owner, NOT allowlisted (10 pairs: `dispatch -> work/conversation/users/
settings`, `run-orchestration -> knowledge/org/routine/settings/users/work`).** All ten share one root cause,
confirmed by re-reading the real code (`dispatch/service.ts`'s `runTurnInternal`/`registerAssistantTriggerInternal`/
task-queue trio, `run-orchestration/src/context.ts`'s context assembly): each needs **LIVE state at
decision/run time** — which accepted tasks exist right now, the live conversation transcript + server config for
an assistant turn, per-session knowledge/org/routine/settings/user context — not a value bake-able once at an
earlier emit point the way the other 25 pairs were. Decision B's own text explicitly left this an open fork
("bake at emit OR agent pulls via MCP") and never chose a side for `dispatch` or `run-orchestration`
specifically (only `session-requests`'s 7 families got a settled resolution). Notable feasibility finding for
`dispatch::work`: `@hyperidle/work`'s `task-state-machine.ts` already bakes+records a `task_run` intent
unconditionally whenever a task transitions to `"accepted"` with an owner — meaning `dispatch`'s own task-queue
(`startupSweep`/`handleTaskStateChanged`/`handleSessionEnded`/`drainQueue`) may be **partially or fully
redundant**, not merely un-migrated (`drainQueue` itself never calls a session-launch function — it resolves a
model and discards it). Rushing a bake-at-emit fix for a possibly-dead mechanism, or a redesign of live
assistant-chat/session-launch context assembly, inside a forensic-triage wave with no dedicated test-first design
pass, is exactly the in-flight redesign this WP's own discipline forbids. **Closure owner: AU23** (registered
this wave, `.pipeline/work/AU23/plan.md`, `.pipeline/AU.md`) — not a silent carve-out; see
`scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP` for the machine-enforced, temporary
(shrinking-to-empty) exclusion that keeps the guard's bare check from redding the build on these ten named,
tracked, owned pairs before AU23 lands.

**Net result:** `inspect(process.cwd())` now returns **zero findings** (verified:
`npx tsx scripts/composition-edge-anti-regrowth-guard.ts`). The bare check can be wired into `npm run lint`
as-is — every excluded edge is accounted for in `ALLOWLIST` (permanent) or `DEFERRED_FOLLOWUP` (temporary,
AU23-owned), never a silent gap.

# AU9 — Architecture remediation

## Required reading

- `plans/AU9/requirements.md`
- `.pipeline/work-packages/TRACK-AU.md` (AU9 and corrective-closure rule)
- `plans/AU9/code-review.md` (fix-attempt-3 evidence)
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`
- `docs/architecture/runtime-simplification.md`
- `docs/architecture/run-unit-model.md`
- `docs/process-layer/tasks-and-sessions.md`
- `docs/process-layer/handoff-and-lifecycle-propagation.md`
- `.claude/rules/testing.md`

## Decision

Keep the successfully cut ownership boundary, but replace the partial runtime semantics with four explicit contracts:

1. **Atomic enqueue:** every family command owns one transaction that persists its authoritative domain source and one neutral `agent_work_intents` row. EventBus emission occurs only after commit and is only a wake hint.
2. **Single consume:** the intent worker reloads source authority, creates/reuses one request, checkpoints it, then the request runtime consumes that exact request. No family callback may resolve or create another request.
3. **Uniform lifecycle:** request terminal transitions persist first and publish one typed lifecycle fact; family projectors update every source/read model, including cancellation.
4. **Recoverable custody:** claims use token/expiry compare-and-swap, request correlation is constrained, active work is never reaped, and terminal handoff records are retained for 30 days.

This remediation does not restore any core→agent request edge. AU10/AU11 remain out of scope.

## Remediation-2: resolving code-review-remediation findings

`plans/AU9/code-review-remediation.md` returned NOT DONE with 13 CRITICAL + 3 WARNING after a second builder pass. This section is the authoritative resolution; where it tightens a contract already stated below, the tightened wording here wins and the affected section carries a `(superseded by Remediation-2)` pointer. Most of the document is correct and stays; the point of this section is to close the specific loopholes that let the same test-theater/partial-implementation pattern through twice.

### Root-cause diagnosis (why two "builder patches the gaps" cycles regressed)

The current worktree source shows the builder has, since the review, actually closed several findings (decomposition CAS+intent are now atomic; the worker reloads and validates the source-derived target for all seven families, not `requestedBy`; `requestAgentTermination` is wired into `PATCH /sessions/:id` and `handoff-protocol.ts`; the projector registry, inbox drain, and its boot registration exist; retention deletes in FK order). The **residue is uniformly one shape**: for each custody operation the plan permitted a *correct exported symbol* to coexist with a *weaker production path*, and permitted protected tests to assert on a directly-imported helper instead of the real production entrypoint. So green tests exercise the correct symbol while boot/runtime wire the weak one. Verified instances in the worktree:

- **Terminal write.** `terminalizeAgentSessionRequest` (session-runtime.ts:110) does the correct `id+running+session_id` CAS **and** inserts the lifecycle inbox row — and has **zero production callers**. Production terminalizes through `markRequestTerminal` (agent-session-requests.ts:244) which has **no CAS and no inbox insert**. Worse, the detached-runtime failure path (session-runtime.ts:431,465) calls `markRequestTerminal("failed")` and *then* `transitionAgentRunLifecycle(...,"failed")`; the latter's `status='running'` CAS can no longer match, so **no inbox row is written and no failed lifecycle ever projects**.
- **Intent claim.** `reclaimAgentWorkIntent` (worker.ts:315) implements the exact token+expiry CAS this plan specifies — and is **unused**. `drainAgentWorkIntents` claims through `claim()` (worker.ts:379) whose expired branch CASes `id + status='claimed'` only; because a reclaim re-writes `claimed→claimed`, two drainers both satisfy the predicate and both win.
- **Recovery.** `recoverRunningAgentSessionRequests` (session-runtime.ts:157) returns a hardcoded `{admitted:0}` and *throws* when a running request's session is missing, instead of re-driving RUNTIME_LOST recovery. The real adoption/recovery body survives only as a ~140-line commented-out corpse inside `removedSyntheticCheckpointScaffold` (session-runtime.ts:176), a function whose live body only throws.

The 9/10 critique never caught this because the plan graded the *contracts* (which are right) and never forbade the *divergence* — one operation implemented twice, tested through the correct copy, wired through the weak copy. The three rules below make that divergence structurally impossible and reviewable.

### Systemic rules (binding; reintroduction of any is itself a CRITICAL review finding)

**R1 — Single custody writer.** **Every** transition in the §Request-worker custody state machine (and its intent-side mirror) has **exactly one** exported function; that function embeds the full CAS + side-effects the contract requires, and no second function may perform it. The canonical writer to keep, and the weak duplicate to delete, for the full set (not a subset — an un-enumerated writer can develop the same divergence):

- *intent claim/reclaim* → `claimAgentWorkIntent`: pending and expired branches per §Claims, the expired branch including `claim_token` + `claim_expires_at`; the drain calls it. **Delete** the weak `claim()` in `agent-work-intent-worker.ts` and fold `reclaimAgentWorkIntent`'s predicate into this one function.
- *intent lease renewal* → `renewAgentWorkIntentLease` (`id+claimed+token`).
- *request create + intent `claimed→handed_off` checkpoint* → the drain (`drainAgentWorkIntents`) is the **only** production caller; `createTriggeredAgentSessionRequest` must resolve to exactly one production call site (the drain), so the assistant direct-create at `agent-work-assistant.ts:532` collapses into it, and `handOffIntent` (worker.ts:371, zero prod callers today) is either **removed** or becomes the single sanctioned non-drain path that *also* performs the intent `claimed→handed_off` checkpoint it currently skips. §Single request execution's "one intent→exact request" claim is only true once this holds.
- *intent fail/release* (`claimed→pending|failed`) → `failOrRelease` (winning-token predicate, terminal vs backoff by attempts/error class); the drain is its only caller.
- *request claim / expired-claim reclaim* (`pending→claimed`) → `claimAgentSessionRequestById`.
- *request lease renewal* → `renewAgentSessionRequestLease` (`id+claimed+token`).
- *request admission* (`claimed→running`) → `markRequestRunning` (winning-token CAS + session correlation, in the adoption transaction).
- *request release* (`claimed→pending`) → `releaseRequestClaim` (winning-token CAS).
- *request terminal transition* (`running→terminal` **and** `claimed→failed`) → `terminalizeAgentSessionRequest` is the single terminal writer for **both** preconditions (see the "Single terminal writer" amendment); each branch is a CAS that also inserts the `agent_lifecycle_inbox` row in one transaction. **Delete** `markRequestTerminal`; any other write that sets a request to `completed|failed|cancelled` is a CRITICAL finding.
- *session reserve/adopt for a request* → `reserveOrAdoptSession`, used by both live admission and boot recovery. No other code inserts a `sessions` row correlated to a request.
- *running-request recovery* → `recoverRunningAgentSessionRequests`: re-drives adoption or RUNTIME_LOST from durable state; it must **not** return a constant nor throw on a lost session.
- *lifecycle inbox drain* → `drainAgentLifecycleInbox` (token/lease/attempts already correct — keep; do not duplicate).

The canonical symbol to keep vs delete is named to prevent the inversion risk: keep `terminalizeAgentSessionRequest` (extended per the CRITICAL to cover the `claimed→failed` precondition) and `claimAgentWorkIntent`; delete `markRequestTerminal` and `claim()`. A reviewer verifies R1 mechanically: for each operation `rg -a` the production wiring (boot, runtime, routes, scheduler, disposer) and confirm it reaches the canonical function; a correct-but-uncalled exported symbol (today's zero-caller `terminalizeAgentSessionRequest`, `reclaimAgentWorkIntent`) is *unimplemented*, not proof; a surviving weak duplicate (today's `markRequestTerminal`, `claim()`) is a CRITICAL finding.

**R2 — Production-entrypoint tests.** Every protected production-path suite drives the **real production entrypoint** — the HTTP route through the app fixture, or the real boot-wired drain/worker/scheduler/recovery function that production actually invokes — and asserts on the resulting DB rows. The only permitted seam is a deterministic fake at the `ProvisionSessionDeps` harness-execution edge. A test that imports a custody/claim/terminal/recovery/projection helper and asserts its return value, or asserts that a constant/export/registration exists, **does not prove its AC and is itself a CRITICAL finding.** Concretely: the claim-race test drives `drainAgentWorkIntents` from two workers (not `reclaimAgentWorkIntent`); the terminal/projection tests drive completion/failure/cancellation through the runtime and `PATCH /sessions/:id`; the recovery test kills and restarts through `bootAgentLayer`. **Banned from a protected suite's import list** (importing any of these to assert its return value fails R2): every custody-surface function of `agent-session-requests.ts`, `agent-work-intent-worker.ts`, `agent-session-runtime.ts`, `session-lifecycle.ts`, and `agent-lifecycle-projectors.ts` — specifically `claimNextAgentSessionRequest`/`claimAgentSessionRequestById`, `markRequestRunning`, `releaseRequestClaim`, `terminalizeAgentSessionRequest` (and the deleted `markRequestTerminal`), `reserveOrAdoptSession`, `renewAgentSessionRequestLease`, `recoverRunningAgentSessionRequests`, `claimAgentWorkIntent`/`reclaimAgentWorkIntent`, `renewAgentWorkIntentLease`, `handOffIntent`, `transitionAgentRunLifecycle`, `recoverRequestedTerminations`, `drainAgentLifecycleInbox`, and the `AGENT_LIFECYCLE_PROJECTORS` map. Reviewer shorthand: a protected suite may import from these modules **only** the drain/boot entrypoint (`drainAgentWorkIntents`, `bootAgentLayer`, `startAgentLifecycleProjectionDrain`) and the app fixture; `rg` the suite's import list against the banned set. A `toBeTypeOf("function")`/existence assertion on any of them is the exact theater R2 bans.

**R3 — No manufactured rows, no dead scaffolds.** No function may create an `agent_session_request`, a `sessions` row, or a fabricated `ProvisionSessionResult` outside the one intent→request→adoption chain — including "compatibility overloads", synthetic-fixture constructors, and test-support paths. Commented-out implementation bodies and throwing placeholders (e.g. `removedSyntheticCheckpointScaffold`) are CRITICAL slop, not acceptable interim state: delete the corpse and implement the real path, or delete the function. A fixture that needs a checkpoint row builds it by driving the real production write to the crash point, never by hand-inserting synthetic rows. Reviewer recipe: `rg -a 'insert\((sessions|agentSessionRequests|agentLifecycleInbox)'` and confirm every call site lives in the sanctioned intent→request→adoption chain (create-request checkpoint, `reserveOrAdoptSession`, the single terminal writer, the inbox insert inside that writer); any other insert of those rows is a finding. Also `rg "createTriggeredAgentSessionRequest\("` and confirm exactly one production call site (the drain) — a second caller (today `agent-work-assistant.ts:532`) breaks single-request-creation.

### Finding ledger

Verdict legend: **AC** = architecture already unambiguous, pure builder execution failure, hold the line; **AT** = architecture tightened here to remove a loophole.

| # | Review finding (code-review-remediation.md) | Verdict | Resolution |
|---|---|---|---|
| C1 | Assistant handoff targets the authenticated human, not the assistant identity | AT | Current worker derives `ast-${message.senderId}` and validates it runnable — it does not target the human, so the literal finding is stale. But string-templating an ID is not "resolve the assistant for the thread." Contract: the assistant target is the per-user/individual **Assistant** agent row **reloaded and validated** for the thread's sender; the realbinary proof (R2) asserts the persisted reply is authored by the resolved assistant agent, not the human. |
| C2 | Five families derive authority from mutable `requestedBy` | AC | Already resolved in the worktree: `resolveAuthoritativeInput` reloads the source and calls `requireRunnableActor` on the **source-derived** target for all seven kinds; `requestedBy` is audit-only. Hold the line — this contract was correct; keep the "worker never validates `requestedBy`" rule. |
| C3 | Decomposition + legacy dispatcher enqueue intent after the domain mutation; dispatcher still uses task-id not a committed attempt | AT | Decomposition is now atomic (CAS `decompositionStatus NULL→running` + intent in one tx). Residual: `task-dispatcher.ts handleProposedCallGranted` **still enqueues on the grant event** while `proposed-call-workflow.ts` records the grant intent — a duplicate path the plan required deleting. Tighten §Family atomic enqueue map: the grant subscription and every dispatcher-owned enqueue that races the attempt+intent transaction are deleted; the dispatcher queue may only *wake* an already-committed `task_dispatch_attempt`, never originate one. A protected test asserts a granted proposed-call produces exactly one intent and one request. |
| C4 | `drainAgentWorkIntents` claim CAS omits the claim token → expired-reclaim race | AT | Root-cause R1. §Claims tightened below: the drain claims through the single token+expiry-CAS function; the weak `claim()` is deleted. R2 two-worker race test drives the drain, not the helper. |
| C5 | Request/session custody is largely test scaffolding (stub recovery, synthetic checkpoints, no claim-owner validation, no lease renew, no CAS terminal writes) | AT | Root-cause R1+R3. `recoverRunningAgentSessionRequests` becomes the single real recovery function (adopt-or-RUNTIME_LOST, never `{admitted:0}`/throw); `removedSyntheticCheckpointScaffold` is deleted; terminal/lease writes go through the single-writer functions. Boot recovery is proven by killing+restarting through `bootAgentLayer` (R2). |
| C6 | Public compatibility overloads manufacture request/session rows and fake completed results | AT | Root-cause R3 — now a named CRITICAL class. **Do not delete `terminalizeAgentSessionRequest`** (it is the correct CAS+inbox function, merely zero-caller today): make it *the* single terminal writer wired into production, and delete the weak `markRequestTerminal` instead. No overload/constructor may fabricate a request/session/`ProvisionSessionResult` outside the intent→request→adoption chain. |
| C7 | Terminal transition has no CAS and never inserts inbox; projectors no-op; drain not boot-wired | AT/AC | Split: projectors are real and `startAgentLifecycleProjectionDrain` **is** boot-wired (bootstrap.ts:87) — that half is stale (hold the line, keep it). The terminal-write half is real: production uses the non-CAS `markRequestTerminal` and the failure path double-terminalizes so the inbox row is never written (R1 fixes it — single terminal writer with inbox insert). |
| C8 | No production caller invokes `requestAgentTermination`; PATCH/handoff/shutdown/cost-cap not wired | AC/AT | `requestAgentTermination` **is** now wired into `PATCH /sessions/:id` (sessions-routes.ts:207) and `handoff-protocol.ts:110` — stale, hold the line. Residual (AT): **shutdown and cost-cap** dispositions are still not wired to any production caller, and `recoverRequestedTerminations` is not boot-wired. Add both to the boot/disposer matrix below with a boot-integration test. |
| C9 | DB constraints materially weaker than the state machines | AT | The §Durable rows check list is correct but migration 0047 / schema.ts implement a subset (kind check permits 9 legacy values incl. `assistant`/`task_dispatch`; no `claimed⇔token+expiry`; no kind/source compatibility; `request_id` neither unique nor `ON DELETE RESTRICT`; no `failed⇒last_error_code`). Tighten: enumerate the exact checks (below) and require a dedicated schema-constraint suite that inserts each forbidden state and asserts DB rejection, one case per check — the migration is incomplete until every case rejects. |
| C10 | Reaper deletes only inbox+intents; not FK-ordered; not boot/6h-wired | AC/AT | FK-ordered multi-table delete now exists in `reapTerminalAgentWorkIntents` — stale, hold the line. Residual (AT): it is **not registered at boot** (absent from bootstrap.ts). Add awaited boot sweep + 6h schedule + a boot-integration assertion. |
| C11 | Docs claim capabilities the runtime lacks | AC | Unchanged rule: docs update **after** the behavior tests are green, never before. No doc edit lands in a builder pass whose ACs are still failing. |
| C12 (sec) | Execution authority accepted from neutral audit metadata for five families | AC | Same as C2 — worker reloads+validates the authoritative target; `requestedBy` never confers authority. Hold the line. |
| C13 (tests) | 66 green tests assert symbol existence/constants/no-op registration | AT | Root-cause R2. Every protected suite must drive the real entrypoint and assert DB rows; existence/constant/registration assertions do not satisfy an AC. |
| C14 (realbinary) | Required builtin realbinary proof only checks two exports exist | AC | The plan already specifies this test's full body (message→intent→request→reply, assert correlated request/session + persisted assistant reply). Pure builder execution failure. Additionally assert reply authorship = resolved assistant agent (C1). `OPENROUTER_API_KEY` is present in the worktree `.env`; the release-gated harness lane must actually run green, not be reported "blocked". |
| W1 | Detached failure double-terminalizes and can publish from inconsistent state | AT | Same defect as C7; the single terminal writer (R1) removes the second transition entirely. |
| W2 | Inbox drain lacks claim/lease/retry despite schema fields | AC | Now implemented (token CAS + attempts + lastError in `drainAgentLifecycleInbox`) — stale, hold the line; keep it under R1 as the single inbox drain. |
| W3 | Unsafe intersection/cross-shape `as` casts bypass the closed request union | AC | TypeScript rule already forbids unsafe `as`. Remove the casts in `handOffIntent`/`drainAgentWorkIntents`/the runtime overloads by making the transaction DB and request-input types structurally compatible. No contract change. |
| O1 (obs) | No UI files changed; design lens skipped | N/A | Correct — AU9 is a runtime-boundary change with no UI surface, so no design action is owed. Recorded for completeness (ledger now accounts for 13C + 3W + 1O). |

### Contract amendments

**Claims (supersedes §Claims below).** There is one intent-claim function used by `drainAgentWorkIntents`. Predicates: pending `id + status='pending' + updated_at=observed`; expired `id + status='claimed' + claim_token=observed + claim_expires_at=observed + claim_expires_at<now`. The weak `claim()` (id+status only) is deleted. The two-worker race test drives the real drain and asserts exactly one hand-off/request.

**Single terminal writer (supersedes both the `running → completed|failed|cancelled` and the `claimed → failed` bullets in §Request-worker custody).** `terminalizeAgentSessionRequest` is the **sole** terminal writer and must be wired into production (today it has zero callers — that is the bug, not a reason to delete it; delete `markRequestTerminal` instead). It takes the request + target terminal state and, in one transaction, applies whichever precondition matches and inserts the `agent_lifecycle_inbox` row:
- **post-admission** (natural completion, detached-runtime failure, `PATCH`/handoff/shutdown/cost-cap disposition, running-recovery): CAS `id + status='running' + session_id=observed`; natural completion additionally requires `termination_reason IS NULL`; inbox row carries the session id.
- **pre-admission** (boot admission failure at `agent-layer-boot.ts:76`; pre-`markRequestRunning` synchronous exception at `agent-session-runtime.ts:465` where the request is still `claimed` with no session): CAS `id + status='claimed' + claim_token=winning-token`; inbox row carries a null `session_id`.

A `running+session_id`-only writer would silently match zero rows for the pre-admission callers, losing the failure and writing no inbox row — the exact recurring silent-no-op R1–R3 exist to kill; hence both preconditions live in the one function. A zero-row CAS on the expected precondition means lost race / already-terminal and writes nothing (never a silent success — the caller observes zero rows and reconciles). Every terminal caller, including the two pre-admission callers, routes through this one function; `markRequestTerminal` is deleted. This reconciles with §Request-worker custody, whose `claimed → failed` and `running → terminal` bullets are annotated as the two branches of this single writer.

**Durable-rows checks (enumerated; supersedes the prose list in §Durable rows for `agent_work_intents`/requests).** The forward migration must implement, and the schema-constraint suite must prove rejection for, each: (1) `kind` in exactly the seven values — no legacy `assistant`/`task_dispatch`; (2) `source_kind` in the seven values; (3) kind/source compatibility pairs closed; (4) `(status='claimed') = (claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)`; (5) `status='handed_off'` requires `request_id IS NOT NULL`; (6) `status='failed'` requires `last_error_code IS NOT NULL`; (7) `status='pending'` forbids claim/correlation fields; (8) unique non-null `request_id`; (9) `request_id` FK `ON DELETE RESTRICT`; (10) unique `(kind, source_kind, source_id, idempotency_key)`. For `agent_session_requests`: `status='running'` requires `session_id`; `status='claimed'` requires `claim_token` and `claim_expires_at`; closed statuses forbid a live claim; `termination_reason` in the five values or NULL.

**Boot wiring (supersedes the "Register with existing retention scheduler" sentence and adds recovery).** `bootAgentLayer`/core bootstrap must, at boot, run an **awaited first sweep** of and then schedule: (a) `drainAgentWorkIntents` + `drainAgentSessionRequests`; (b) `drainAgentLifecycleInbox`; (c) `reapTerminalAgentWorkIntents` (then every 6h); (d) `recoverRequestedTerminations` (shutdown/cost-cap/user causes surviving a crash after HTTP 202); (e) `recoverRunningAgentSessionRequests` (adopt-or-RUNTIME_LOST). A boot-integration test boots the real composition root over a seeded durable state containing one of each recoverable row and asserts each is reconciled exactly once.

**Shutdown/cost-cap callers.** The process disposer stores `shutdown` (maps to `failed/RUNTIME_LOST`) on every still-running correlated request before abort; the cost-cap abort path stores `cost_cap` (maps to `failed/BUDGET_EXHAUSTED`). Both go through `requestAgentTermination` then the single terminal writer, and are covered by the lifecycle production suite.

### Test-matrix additions (write red before code; protected on creation)

- `packages/server/src/__tests__/agent-work-intent-schema.integration.test.ts` — one insert-and-expect-rejection case per enumerated check in Durable-rows above; one accept case per valid state. (New; satisfies C9.)
- `packages/server/src/__tests__/agent-layer-boot-recovery.integration.test.ts` — boot the real composition root (`bootAgentLayer` + core bootstrap) over seeded durable state; assert awaited reconciliation of pending intents, expired claims, running-request recovery, requested terminations (incl. shutdown/cost-cap), and the retention sweep — each exactly once, no second harness start. (New; satisfies C5/C8/C10 through the real entrypoint per R2.)
- The existing `agent-request-custody`, `agent-lifecycle-projection`, `agent-work-intent-recovery`, and `explicit-session-start.production.integration.test.ts` suites are amended to satisfy R2: the claim-race case drives `drainAgentWorkIntents`; terminal/cancellation cases drive the runtime and `PATCH /sessions/:id` and may import none of the banned custody-surface functions (see R2); the explicit-start suite drives `POST /sessions` + the boot-wired drain to admitted/pending/error rather than the classifier directly, and its `recoverRequestedTerminations` `toBeTypeOf("function")` existence assertion (`agent-lifecycle-projection.integration.test.ts:68`) is removed; the checkpoint fixture reaches its crash point by driving the real production write, never by inserting synthetic rows (R3).

Add both new suites (`agent-work-intent-schema`, `agent-layer-boot-recovery`) to `protectedTests`; the four amended suites are already protected. Their assertions may not be weakened during green implementation; a suite that regresses to helper-level/existence assertions fails R2 and is a CRITICAL review finding.

## Design it twice

### Authority: actor field versus explicit principals

**A — retain polymorphic `actorId`.** Interpret it as requester for session starts and runnable agent elsewhere. Small schema change, but one field has two security meanings and recreates the review bug. Rejected.

**B — separate requester from execution target.** `agent_work_intents.requested_by` is optional audit identity; runnable target is always reloaded from the authoritative source (`explicit_session_starts.requested_agent_id`, task owner, routine owner, grant scope, etc.). Chosen. The worker never applies runnable-agent validation to `requestedBy`; it validates only the resolved target after the family switch.

### Atomicity: family transactions versus generic source payload

**A — put family payload on intent and use one generic enqueue repository.** Easy transaction, but makes the neutral outbox authoritative for tasks, routines, grants, and prompts, violating the pinned noun. Rejected.

**B — transaction-aware family command functions.** Each family owns its domain write and calls `recordAgentWorkIntent(tx, input)` before commit; worker reloads domain truth. Chosen. A small transaction-aware helper is shared, not a generic payload.

### Execution: callback from intent worker versus durable request drain

**A — `onRequest(request)` callback.** Minimal wiring, but allowed assistant to discard the request and resolve twice; it also couples handoff checkpointing to execution. Rejected.

**B — two durable stages.** Intent drain only resolves, creates/reuses, and atomically checkpoints correlation. Request drain claims that exact request and dispatches by `request.sourceKind` to preparation/execution code that cannot create requests. Chosen. Wake events reduce latency; boot reconciliation drains both stages.

### Lifecycle projection: central switch versus registered family projectors

**A — one switch in `agent-layer-boot.ts`.** Auditable initially, but mixes domain writes into composition root and already shipped decomposition-only behavior. Rejected.

**B — typed projector registry keyed by source kind.** One lifecycle consumer calls explicit projectors; exhaustive type checking requires all seven families. Chosen. Projectors accept persisted lifecycle facts only, never execution results.

## Plan reconciliation

- The boundary guard and removal of core request/execution calls are correct and remain protected (review AC1/AC6 pass).
- `agent_work_intents.actor_id` currently conflates authenticated requester with runnable agent. Rename to `requested_by`; resolve `targetAgentId` from family source before runnable validation.
- `agent-layer-boot.ts` stores JavaScript error class names while the public route expects stable API codes. Introduce one agent-owned admission error classifier used by persistence and HTTP projection.
- Explicit session, manual routine, and knowledge already demonstrate domain+intent transactions. Scheduler routine, decomposition, task dispatch, and grant/re-engagement do not; move enqueue into the transaction that establishes eligibility.
- Re-engagement currently routes `proposed_call_granted` through the task dispatch queue. The grant command must insert its own intent; the old handler/subscription is deleted.
- `agent-work-intent-worker.ts` creates a request and invokes `onRequest`; assistant callback calls `runAssistantTurn`, which creates/resolves again. Split assistant preparation from request creation and consume the existing row.
- Production publishes completion/failure but has no cancellation command/path. `transitionAgentRunLifecycle(..., "cancelled")` must be invoked by cancellation and shutdown flows after persisted request/session cancellation.
- Only decomposition has a new lifecycle projection. Existing routine projection logic in `session-lifecycle.ts` must be adapted; explicit starts, tasks, assistant, knowledge, and re-engagement need explicit no-op or state projectors, documented below.
- Intent schema lacks kind/source/status/correlation checks and retention. Add checks and a reaper; do not rewrite old migration `0046`, add a forward remediation migration.
- Expired claim reclaim compares `id + status`; because claimed→claimed does not change status, two workers can win. CAS must include the observed claim token and expiry.
- Required production-path suites were planned but never created. Replace helper-level proof with route/service command→DB→worker→request→runtime/lifecycle tests.
- Authoritative docs describe the desired end state before behavior implements it. Keep their target wording, but do not treat documentation as complete until tests prove each claim.

## Contracts

### Durable rows

```ts
type AgentWorkIntentKind =
  | "assistant_turn" | "session_start" | "knowledge_action"
  | "routine_run" | "bet_decomposition" | "task_run" | "reengagement";
type AgentWorkIntentStatus = "pending" | "claimed" | "handed_off" | "failed";
type AgentWorkSourceKind =
  | "thread_message" | "explicit_session_start" | "knowledge_action"
  | "routine_run" | "bet" | "task_dispatch_attempt" | "proposed_call";
type AgentWorkIntentFailureCode =
  | "INVALID_WORK_SOURCE" | "TARGET_AGENT_MISSING" | "TARGET_AGENT_INELIGIBLE"
  | "TRIGGER_RESOLUTION_FAILED" | "MAX_ATTEMPTS_EXCEEDED";

interface AgentWorkIntentInput {
  kind: AgentWorkIntentKind;
  sourceKind: AgentWorkSourceKind;
  sourceId: string;
  requestedBy?: string;       // audit principal only; never execution authority
  idempotencyKey: string;
}
```

`agent_work_intents` checks:

- `kind` is one of seven values; `status` is one of four values.
- `(status='claimed') = (claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)`.
- `status='handed_off'` requires `request_id`; other active statuses forbid it except crash-recovery checkpoint state described below.
- `status='failed'` requires `last_error_code`; pending forbids claim/correlation fields.
- FK `request_id → agent_session_requests.id ON DELETE RESTRICT` and unique non-null `request_id` (one intent per request).
- Unique `(kind, source_kind, source_id, idempotency_key)`.
- Kind/source compatibility is closed: assistant/thread_message, session_start/explicit_session_start, knowledge_action/knowledge_action, routine_run/routine_run, bet_decomposition/bet, task_run/task_dispatch_attempt, reengagement/proposed_call.

To close crash-after-request-create, request creation and intent `handed_off/request_id` checkpoint occur in the **same DB transaction**. `createTriggeredAgentSessionRequest(tx, input)` must accept the transaction DB. No intermediate correlated status is needed.

`explicit_session_starts` retains requester, requested agent/tier, request/session correlations and statuses `requested|admitted|completed|failed|cancelled`. Correlation checks: admitted/completed require request+session; failed requires stable `failure_code`; cancelled requires request and may have session. Requested forbids terminal fields. Missing requested agent intentionally remains a worker-projected failure, so no requested-agent FK is added.

Missing/deleted requested agent projects `failed/TARGET_AGENT_MISSING` to public `500 INTERNAL_ERROR`; existing but human/disabled/inactive agent projects `failed/TARGET_AGENT_INELIGIBLE` to the same `500 INTERNAL_ERROR`. These source failures are distinct internally but intentionally preserve the existing public contract.

### Family atomic enqueue map

| Family | Authoritative transaction and source | Target authority | Stable source/idempotency |
|---|---|---|---|
| Assistant | human `messages` insert + intent in thread message command | assistant identity persisted/resolved for thread | message id / `assistant:<messageId>` |
| Explicit session | `explicit_session_starts` insert + intent in `POST /sessions` | `requestedAgentId` | start id / `explicit-session-start:<startId>` |
| Knowledge | knowledge action/flag mutation + intent in `knowledge.ts` | authoritative owner/default after action | action source id / action idempotency key |
| Routine | `routine_runs(outcome='running')` insert + intent for manual and scheduler paths | active routine owner | routine-run id / `routine:<runId>` |
| Decomposition | CAS bet `decompositionStatus NULL→running` + intent | persisted decomposer/default | bet id / decomposition attempt id |
| Task | `task_dispatch_attempts` insert + intent in the authoritative acceptance/retry/owner-change transaction | attempt `agentId` (copied from authoritative owner at commit, revalidated on consume) | attempt id / `task-dispatch:<attemptId>`; occasion identity prevents duplicate accepted/retry/handoff attempts |
| Re-engagement | proposed call `captured→granted`, tailored grant insert/update + intent | `tailored_grants.agent_scope` | proposed-call id / grant id |

No queue/event subscriber may create the intent after the domain transaction. Duplicate commands return/reuse the existing domain source and intent.

#### Task dispatch occasions

Task handoff uses a new durable `task_dispatch_attempts` source, not task ID as the repeatable source:

```ts
type TaskDispatchOccasion = "accepted" | "retry" | "owner_handoff";
interface TaskDispatchAttempt {
  id: string; taskId: string; occasion: TaskDispatchOccasion;
  agentId: string; predecessorSessionId: string | null;
  ordinal: number; status: "requested" | "running" | "completed" | "failed" | "cancelled";
  requestId: string | null; sessionId: string | null; createdAt: string; updatedAt: string;
}
```

Unique `(task_id, ordinal)` and `(task_id, occasion, predecessor_session_id, agent_id)` (null-safe expression index) make replay idempotent. `transitionTask()` gains transaction-aware `transitionTaskInTx(tx, ...)`; when target is `accepted` and `ownerAgentId` exists it inserts ordinal 1 (or next retry ordinal) plus intent before commit. Decomposition calls that same command, never a second enqueue. `handoff()` inserts `owner_handoff` attempt+intent in its existing owner/session transaction, keyed by predecessor session and new owner. Re-dispatch after `session_ended` only wakes the already-committed attempt; it never creates one. Startup recovery scans requested attempts. Producers: tasks PATCH route via `transitionTask`, dependency watcher auto-accept, decomposition task acceptance, hold→accepted retry, and `handoff-protocol.ts` toAgent/toRole owner changes. Tool-created already-accepted tasks must call the shared command rather than raw insert/event.

### Source resolution

```ts
interface ResolvedAgentWork {
  requestInput: AgentSessionRequestInput;
  requestedModelTier?: ModelTier;
}
async function resolveAuthoritativeInput(db: HyperIdleDb, intent: AgentWorkIntent): Promise<ResolvedAgentWork>;
```

Resolution switches on kind, reloads the source, derives `targetAgentId`, then calls `requireRunnableAgent(targetAgentId)`. Requester identity is used only for audit/owner-scoped reads. Source ineligibility is terminal and receives stable internal code `INVALID_WORK_SOURCE`; transient DB/runtime errors retry.

### Public admission errors

```ts
type AgentAdmissionFailureCode =
  | "COST_CAP_EXCEEDED" | "CONCURRENCY_LIMIT" | "MISSING_CREDENTIAL"
  | "NO_ELIGIBLE_HARNESS" | "INTERNAL_ERROR";
function classifyAdmissionFailure(error: unknown): AgentAdmissionFailureCode;
```

The agent layer persists this code on explicit start. Route projection maps it exactly: cost 422, concurrency 429, credential 500, harness 422, internal 500. Error messages stay existing public messages; raw class names/messages never cross the boundary.

### Single request execution

```ts
async function handOffIntent(tx: HyperIdleDb, intent: ClaimedIntent): Promise<AgentSessionRequest>;
async function consumeAgentSessionRequest(deps: ProvisionSessionDeps, request: AgentSessionRequest, options: ConsumeOptions): Promise<ProvisionSessionResult>;
```

`handOffIntent` resolves once and creates/reuses once. The request worker consumes the returned/persisted request by ID. Assistant code is split into `prepareAssistantRequestInput` (used only before creation) and `executeAssistantRequest(request, deps)` (cannot resolve/create). Remove `onRequest` from `AgentWorkIntentWorkerOptions` and remove `runAssistantTurn` from boot. The request worker is the only caller of `consumeAgentSessionRequest`/execution boundary.

### Claims

> (superseded by Remediation-2 §Contract amendments → Claims: one claim function used by the drain; the weak `claim()` is deleted.)

Pending claim CAS predicate: `id + status='pending' + updated_at=observedUpdatedAt`. Expired reclaim predicate: `id + status='claimed' + claim_token=observedToken + claim_expires_at=observedExpiry + claim_expires_at<now`. Updates install a fresh token/expiry and increment attempts. All checkpoint/release/fail writes require the fresh token. A zero-row CAS means lost race and must not execute.

#### Request-worker custody state machine

Add `claim_token`, `termination_reason`, `termination_requested_at`, and `termination_requested_by` to `agent_session_requests` (retain `claimed_by/at/expires_at`). Add a **unique partial index on `sessions.request_id WHERE request_id IS NOT NULL`** and a request/session correlation check. Allowed transitions:

- `pending → claimed`: CAS `id+pending+updated_at=observed`; install worker/token/lease.
- expired `claimed → claimed`: CAS `id+claimed+observed token+observed expiry+expiry<now`; replace custody.
- `claimed → running`: winning token required; adopt the uniquely correlated session, write request `session_id/status=running`, and source admission projection in one transaction.
- `claimed → pending`: winning token required for retryable pre-admission failure; clear custody.
- `claimed → failed`: winning-token CAS, no session; terminal pre-admission failure. *(Remediation-2: this is the pre-admission branch of the single terminal writer `terminalizeAgentSessionRequest`, which inserts the inbox row with a null session_id — not a separate weak writer.)*
- `running → completed|failed|cancelled`: CAS `id+running+session_id`; terminal winner clears custody and inserts lifecycle inbox row in one transaction. *(Remediation-2 R1: `terminalizeAgentSessionRequest` is the sole terminal writer for both this post-admission precondition and the `claimed → failed` pre-admission precondition above; `markRequestTerminal` is deleted and the runtime failure path must not pre-terminalize before this transition.)*

Worker renews a claimed lease at `leaseMs/3` with `id+claimed+token`; failed renewal stops before admission.

**Chosen crash-safe admission protocol: adopt by unique `sessions.request_id`.** `admitSession()` is split into (1) `reserveOrAdoptSession(tx, request, token)` and (2) idempotent initialization. While holding the request claim, stage 1 queries `sessions.request_id` before any insert. If absent, it inserts one `state='active'` session with the request ID; the unique index makes a racing insert lose. If present and active with matching task/agent/source, it adopts that exact session ID. A mismatched or terminal correlated row is terminal recovery failure. In the same transaction, token-CAS request `claimed→running` with that session ID and update explicit/attempt admission source. Only after commit may workspace/context/harness initialization start. Initialization is idempotent by session ID: reuse/create the same workspace, overwrite deterministic generated context, and register/start at most one live registry entry. If initialization fails, terminalize the adopted request/session; never insert another session.

Reclaim of pending/expired claimed requests **always checks the unique correlated session before creating one**. This also adopts legacy/process-death rows inserted by the current pre-remediation ordering: active row → token-CAS request to running, then idempotently initialize; terminal row → map request terminal. Thus process death immediately after session insert is recoverable solely from durable state; no cleanup callback is required. Boot reclaims pending/expired claims and applies this adoption path. It never re-admits a running request: active correlated session with no live registry becomes `failed/RUNTIME_LOST` through recovery teardown; already-terminal session maps request terminal. Checks forbid running without session ID and forbid request/session ID disagreement.

Crash tests kill the worker (not throw/catch) before claim, after claim, immediately after committed session insert with request still claimed (legacy checkpoint fixture), after atomic running/adoption commit, after workspace init, after harness registry start, during detached execution, and terminal before projection. Every restart asserts one `sessions.request_id`, one workspace identity, and no second harness start.

#### Durable termination intent

```ts
type AgentTerminationReason =
  | "user_done" | "user_crashed" | "handoff" | "cost_cap" | "shutdown";
```

Before any asynchronous `sessionRunRegistry.abort`, the initiating path persists a reason on the correlated request with CAS `status='running' AND termination_reason IS NULL`. Reason disposition: `user_done→cancelled`, `user_crashed→failed`, `handoff→completed`, `cost_cap→failed/BUDGET_EXHAUSTED`, `shutdown→failed/RUNTIME_LOST`. Teardown reads this durable field and terminalizes request/session/inbox in one transaction; it never infers cause from an in-memory abort.

Precedence is deterministic: an already-terminal request wins; handoff's transaction sets `handoff` and completed state together and therefore wins before its post-commit abort; otherwise first committed explicit cause wins. A later different cause receives/records conflict and cannot overwrite (`PATCH` returns 409 if another cause is already pending); repeated same cause is idempotent and returns 202. Natural completion may CAS running→completed only when `termination_reason IS NULL`; once a reason exists, teardown disposition wins. Shutdown sets `shutdown` only where reason is null. Cost-cap does the same. Recovery scans running requests with a reason and completes their mapped terminal transaction before generic `RUNTIME_LOST`; this proves crash after HTTP 202 and before teardown preserves user intent.

### Lifecycle and cancellation

```ts
type AgentRunTerminalState = "completed" | "failed" | "cancelled";
interface AgentRunLifecycleChanged {
  requestId: string; sourceKind: AgentSessionSourceKind; sourceId: string;
  state: AgentRunTerminalState; sessionId?: string; failureCode?: string; timestamp: number;
}
```

Runtime completion/failure and existing session termination commands all use the persistence-first request transition below. Domains never receive `ProvisionSessionResult`; concrete core projectors are exhaustive:

Projection delivery is durable through neutral `agent_lifecycle_inbox(request_id, source_kind, source_id, state, session_id, failure_code, occurred_at, projected_at, claim_token, claim_expires_at, attempts, last_error)`, primary key `request_id` and FK to request `ON DELETE RESTRICT`. The **agent layer only** inserts this neutral fact in the request terminal transaction and publishes the same typed event. `packages/server/src/app-runtime/services/agent-lifecycle-projectors.ts` is a core/meta subscriber and durable inbox worker; family projectors live beside their owning core services and may import shared event/DB types but no agent runtime. Its claim is token/expiry CAS; after idempotent domain mutation it sets `projected_at`. Boot reconciliation is registered from core app-runtime bootstrap, not agent boot. The AU9 lint rule rejects agent-layer imports/calls of projector modules and direct writes to core domain tables outside request/source correlation transactions.

Concrete core projector contract:

| Family/projector | completed | failed | cancelled | Idempotency/event |
|---|---|---|---|---|
| Assistant — `services/assistant-lifecycle-projector.ts` | no domain write: assistant reply/session rows are authoritative | no new write: existing broken-turn message is produced by assistant execution before terminalization | no write; in-flight is derived from nonterminal request | inbox PK; emit `agent_work_projection_applied`; no-op justified because no turn-status table exists |
| Explicit — `services/explicit-session-starts.ts` | `explicit_session_starts admitted→completed`, preserve request/session | `requested|admitted→failed`, stable `failureCode` | `requested|admitted→cancelled`, request and optional session | `WHERE request_id AND status IN (...)`; emit `explicit_session_start_changed` |
| Knowledge — `services/knowledge-action-lifecycle.ts` | no domain write: flag/action mutation is committed before intent | no rollback; request lifecycle is failure audit | no rollback; request lifecycle is cancellation audit | inbox PK; emit generic projection-applied; no separate action-status column exists |
| Routine — `services/routine-lifecycle-projector.ts` | `routine_runs running→success`, session/endedAt; update routine last-run | `running→error`, `errorMessage=failureCode` | `running→error`, `errorMessage='cancelled'` (maps into existing vocabulary) | `WHERE id=sourceId AND outcome='running'`; emit existing routine update event |
| Decomposition — `services/bet-decomposition-projector.ts` | if ≥1 task then `running→done`; else `running→blocked`, reason `empty` | `running→blocked`, reason `failed` | `running→blocked`, reason `failed` (existing closed vocabulary; lifecycle inbox retains cancellation distinction) | `WHERE id=sourceId AND decomposition_status='running'`; emit bet update event |
| Task — `services/task-run-lifecycle-projector.ts` | mark dispatch attempt completed; existing `session_ended(completed)` propagation performs `in_progress→review` only when no other active session | mark attempt failed; task state unchanged (`session_ended` crash rule is exact no-transition) | mark attempt cancelled; task state unchanged (`session_ended` stopped/crashed rule is exact no-transition) | attempt `WHERE request_id AND status nonterminal`; emit `task_dispatch_attempt_changed`; do not duplicate `session_ended` |
| Re-engagement — `services/reengagement-lifecycle-projector.ts` | attempt represented by intent/request only; proposed call remains `granted` until existing tool execution changes it | proposed call remains `granted` | proposed call remains `granted` | inbox PK; emit projection-applied; no run-status field exists and grant must remain reusable/auditable |

### Retention

Add `reapTerminalAgentWorkIntents(db, { now, retentionDays: 30, batchSize })`. Eligible: intent handed_off/failed **and** correlated request terminal (or no request for terminal source failure), `updated_at < now-30d`. Never delete pending/claimed, nonterminal requests, or explicit starts still requested/admitted. Delete intent first, then eligible explicit start in one transaction. Register with existing retention scheduler in `app-runtime/bootstrap.ts`; expose one deterministic sweep for tests.

Run every 6 hours after an awaited boot sweep, batch 500. *(Remediation-2 Boot wiring: the reaper, `recoverRequestedTerminations`, and `recoverRunningAgentSessionRequests` must all be registered at boot with an awaited first sweep and proven by the boot-recovery suite.)* Delete projected `agent_lifecycle_inbox` rows older than 30 days first, then intents, then explicit starts/task dispatch attempts; requests/sessions remain retained. FK ordering is mandatory and active/unprojected inbox rows are never deleted.

## Existing PATCH cancellation contract

`PATCH /api/sessions/:id` remains the public command and accepts existing `{state:"done"|"crashed", outcome?, notes?, effectivenessScore?}`; AU9 does not invent a cancel endpoint. Authorization remains the route's existing authenticated public-data boundary. Resolve `sessions.request_id`; sessions without request retain legacy behavior.

- Already terminal: `409 {error, code:"CONFLICT"}` unchanged.
- Live registry: first persist `user_done` or `user_crashed` on the request using the termination-reason CAS, then call `sessionRunRegistry.abort(sessionId)`, then return existing `202 {sessionId,state:"aborting",message}`. Teardown consumes the stored reason and atomically persists request/session/inbox. Same pending reason is idempotent 202; competing reason is 409. Poll observes convergence.
- No live registry: one transaction persists the cause and CASes session `active→done|crashed`, request to its mapped terminal state, and lifecycle inbox, then returns `200` session. Losing terminal/cause CAS returns `409`; completion/failure already won and is never overwritten.
- `handoff-protocol.ts` is explicitly **not cancellation**: its transaction stores reason `handoff`, commits predecessor request/session completed plus inbox and a new owner-handoff attempt, then aborts old harness post-commit. It does not emit `session_ended`; teardown sees completed state/handoff and is a no-op, preserving cost semantics.
- Runtime natural completion requires no stored termination reason. Process shutdown first stores `shutdown`; cost-cap first stores `cost_cap`; teardown/recovery maps each exactly.

Call-site matrix: route `applyStateChangePatch`; detached runtime completion/failure in `agent-session-runtime.ts`; handoff in `handoff-protocol.ts`; shutdown/recovery in request worker/server disposer; cost-cap abort maps to failed/budget code, not cancelled.

## Finding → design resolution

| Review finding | Resolution | Proof |
|---|---|---|
| Explicit sessions validate human as runnable | requester/target split; validate source-derived target | production `POST /sessions` test reaches admitted/pending |
| Error names do not match API codes | single stable classifier persisted then projected | each error-class route test asserts status/code |
| Four non-atomic handoffs | family transaction map; delete post-commit enqueue/subscription | rollback tests show neither domain source nor intent survives |
| Assistant resolves twice | two-stage drain; existing request consumed exactly once | trigger resolver/create spies count one; real request ID reaches runtime |
| Cancellation/projections incomplete | persistence-first cancellation + exhaustive projector registry | production lifecycle tests for all families/all terminal states |
| Constraints/retention absent | forward migration, correlation checks, deterministic reaper | violating inserts rejected; 29/31-day sweep tests |
| Expired claim race | token+expiry CAS | two-worker barrier test: one callback/request consumption |
| Production tests absent | mandatory matrix below | protected suites must exist before green implementation |
| Helper-only lifecycle test | drive runtime/cancel API, never call transition helper directly | lifecycle suite imports app/commands only |
| Duplicate comment | remove during implementation cleanup | lint/diff review |

## Acceptance criteria and verification

| AC | Concrete verification |
|---|---|
| AC1 core never creates/consumes/executes requests | AU9 lint guard fixtures reject direct, alias, namespace and transitive wrapper calls; `npm run lint`; reviewer reconciles `rg -a` matches to allowlist. |
| AC2 all seven families atomically persist intent before exactly one request | `agent-work-intent-production.integration.test.ts` invokes each real route/service command, asserts source+intent commit and zero request before drain, then one correlated request after drain; forced transaction exception asserts zero source/intent. |
| AC3 agent layer alone resolves/admit/executes/publishes | production worker test counts one trigger resolution/create and consumes same request ID; assistant included; no injected domain callback. |
| AC4 visible behavior preserved | explicit session suite covers admitted/pending/poll/idempotency and five stable errors; existing protected family suites pass. |
| AC5 domains observe completion/failure/cancellation only through lifecycle | service integration drives request terminal commands at the named harness boundary plus public PATCH cancellation for each family; asserts persisted request/inbox precedes core projection and no direct result callback. Existing protected real-harness tests separately prove execution reaches teardown. |
| AC6 should graph has no forbidden edge | lint guard plus manual `rg -a` audit against route checklist and explicit agent allowlist. |
| AC7 repository valid | `npm run check`, `npm run lint`, `npm run test`, `npm run test:integration:service`, `npm run verify` all pass. |

## Production-path test matrix (write red before code)

- `packages/server/src/__tests__/agent-work-intent-production.integration.test.ts`: real DB/app and seven real commands, transaction rollback, pre/post drain, exact correlation, duplicate replay; task cases cover route transition, dependency watcher, decomposition acceptance, hold retry, toAgent/toRole handoff.
- `packages/server/src/__tests__/agent-work-intent-recovery.integration.test.ts`: boot without wake, crash checkpoint atomicity, transient retry, terminal invalid source, two-worker pending/expired-claim races.
- `packages/server/src/__tests__/explicit-session-start.production.integration.test.ts`: authenticated human requester, requested agent authority, admitted/202/poll/retry, payload mismatch, missing agent, all admission error mappings.
- `packages/server/src/__tests__/agent-request-custody.integration.test.ts`: real DB/request worker with a deterministic fake **only at `ProvisionSessionDeps` harness execution edge**; pending/expired two-worker races, lease loss, unique request/session adoption, process death immediately after session insert, every later checkpoint, running boot recovery, terminal CAS winner, one workspace/session/harness start. This is service integration and makes no real-harness claim.
- `packages/server/src/__tests__/agent-lifecycle-projection.integration.test.ts`: real DB/app, request state machine and public `PATCH /sessions/:id`, deterministic fake only beyond harness edge; durable termination reason before 202, crash-after-202 recovery, repeated/competing cause precedence, seven concrete core projectors, handoff-not-cancel, shutdown/cost-cap classification. Must not import `transitionAgentRunLifecycle`.
- `packages/server/src/__tests__/agent-work-intent-retention.integration.test.ts`: schema violations, 29-day preservation, 31-day terminal deletion, active-row preservation, FK-safe explicit-start cleanup.

Harness-facing proof remains release-gated. Existing `packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement-realbinary.integration.test.ts` proves generic real-harness teardown but does **not** prove assistant reply preservation. Add `packages/server/src/harness/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts` as a **builtin-only** real-harness test: register its exact suffix in `BUILTIN_ONLY_INTEGRATION` in `scripts/lib/honest-harness-predicate.ts`, gate only with `requireHarness("builtin")`, and use zero stubs. It invokes the full production assistant message→intent→request→reply path and asserts one correlated request/session plus a persisted assistant reply (and the existing broken-turn row in a controlled invalid-return case). Assistant is builtin-only by current production construction; AU9 adds no CLI assistant protocol. Run only in `npm run test:integration:harness`/`verify:release`; service suites never claim this proof.

## Ordered migration tasks

1. **Red tests:** create all six suites above using real app/service commands and transaction fault injection; keep lint guard green. Tests must fail for the reviewed reasons, not fixture absence.
2. **Schema:** add forward AU9 remediation migration and Drizzle checks/indexes/columns (`requested_by`, stable error code, completed explicit status, unique partial `sessions.request_id`, request termination fields/custody checks); update exports, migration journal/snapshot, fixture truncation.
3. **Atomic commands:** add `task_dispatch_attempts`; make `recordAgentWorkIntent` transaction-compatible; extract `transitionTaskInTx`; update task route, dependency watcher, decomposition, hold retry, tool creation, and handoff owner changes; move scheduler routine, decomposition CAS, and proposed-call grant enqueue inside owner transactions. Delete dispatcher-owned intent creation and grant→task-queue translation. Confirm all seven map rows.
4. **Authority/errors:** implement source-derived target resolution and `classifyAdmissionFailure`; update explicit source projection and route mapping.
5. **Two-stage workers:** make intent handoff transactionally create+checkpoint request; remove callback; add durable request drain; split assistant prepare/execute and consume exact request.
6. **Request custody:** implement intent/request token CAS, unique session adoption before initialization, atomic claimed→running correlation, idempotent workspace/context initialization, durable termination causes, and running boot recovery without re-admission.
7. **Lifecycle:** add neutral lifecycle inbox from agent request transitions; register core-owned inbox worker/projectors; reconcile existing PATCH, runtime, handoff, shutdown and cost-cap terminal callers; remove direct result seams.
8. **Retention:** implement deterministic reaper and register existing scheduler; preserve active rows.
9. **Routes/contracts/docs:** update API types/client pending branch; clean duplicate comment; update docs only after behavior tests pass.
10. **Validation/review:** run targeted suites, check/lint/test/service integration/full verify; inspect DB lifecycle output; fresh architecture/design/security/adversarial review against finding table.

## route-checklist

| Surface | Files | Required boundary |
|---|---|---|
| Assistant message | `routes/threads.ts`, `services/agent-work-assistant.ts` | message+intent transaction; execute existing request only |
| Explicit session | `routes/sessions-routes.ts` | start+intent transaction; owner poll; no execution call |
| Knowledge action | `routes/knowledge.ts` | action+intent transaction |
| Routine manual/scheduled | `routes/routines-routes.ts`, `app-runtime/services/routine-scheduler.ts` | routine-run+intent transaction in both paths |
| Decomposition | `services/bet-decomposition.ts`, subscriber | CAS+intent transaction; lifecycle result projection |
| Task accepted/retry | `services/task-state-machine.ts`, `routes/tasks.ts`, `services/dependency-watcher.ts`, `services/bet-decomposition.ts`, `tools/create-task.ts` | shared transition-in-tx creates dispatch attempt+intent; post-commit event only wakes |
| Task owner handoff | `services/handoff-protocol.ts`, `app-runtime/services/task-dispatcher.ts` | owner/session+owner-handoff attempt+intent transaction; `session_ended` handler only wakes committed attempt |
| Proposed-call grant | `routes/threads.ts`, `services/proposed-call-workflow.ts`, `app-runtime/services/task-dispatcher.ts` | grant+intent transaction; delete grant subscription/queue translation |
| Agent boot/runtime | `services/agent-layer-boot.ts`, intent/request workers, `services/agent-session-requests.ts` | opaque boot, exact request custody/consumption; no core projectors |
| Core lifecycle | `app-runtime/bootstrap.ts`, `app-runtime/services/agent-lifecycle-projectors.ts`, seven core projector modules | durable inbox drain and domain mutation; no agent runtime import |
| Session termination | `routes/sessions-routes.ts`, `services/agent-session-runtime.ts`, `services/handoff-protocol.ts`, server disposer/cost-cap callers | PATCH 200/202/409, terminal CAS, handoff-not-cancel, shutdown failure |

## Security & abuse

- Rate limits: no new state-changing HTTP endpoint; existing POST and `PATCH /sessions/:id` policies remain. Poll is authenticated and requester-scoped.
- Agent-authored input: events/intents carry IDs only; worker reloads authoritative rows. Applicable and addressed.
- Authorization: requester is audit/access principal, never execution authority. Requested/owner/granted target is revalidated as runnable at consumption.
- Secrets: no new credential field; stable public errors do not expose provider messages.
- Path traversal/SSRF: N/A; no path or URL input added.
- Replay/concurrency: unique source key, task occasion identity, atomic checkpoint, intent/request token+expiry CAS, unique session adoption, lease renewal and running recovery guarantee no second session/admission.
- Retention: cleanup never deletes active custody/correlation and runs bounded batches.

## Risks

- Transaction type compatibility across PGlite/Postgres must be expressed structurally without unsafe casts; integration suite runs the project service driver.
- Existing task/routine retry semantics must key new intent attempts, not create parallel domain sources.
- Detached runtime makes cancellation race with completion; terminal request transition must be compare-and-set so exactly one terminal state wins and one event publishes.
- Projector failure must be retryable/reconcilable from durable request lifecycle; neutral `agent_lifecycle_inbox` is the chosen ledger and core boot reconciliation source. Its extra row per terminal request preserves downward ownership: agent publishes facts, core projects domains.
- Migration must preserve existing AU9 rows. Backfill `requested_by=actor_id`; target is always rederived, so no target backfill is required.

## protectedTests

```yaml
protectedTests:
  - packages/server/src/services/__tests__/agent-run-boundary.test.ts
  - packages/server/src/services/__tests__/agent-session-runtime.test.ts
  - packages/server/src/services/__tests__/trigger-resolution.test.ts
  - packages/server/src/services/__tests__/agent-session-request-sources.integration.test.ts
  - packages/server/src/routes/__tests__/sessions.activity.integration.test.ts
  - packages/server/src/__tests__/sessions.integration.test.ts
  - packages/server/src/routes/__tests__/routines.routes.integration.test.ts
  - packages/server/src/__tests__/bet-decomposition.test.ts
  - packages/server/src/__tests__/AH3-assistant-turn-unit.test.ts
  - packages/server/src/__tests__/AH6-lane-gates-broken-turn.integration.test.ts
  - packages/server/src/__tests__/knowledge.integration.test.ts
  - packages/server/src/__tests__/AL7-two-session-loop.integration.test.ts
  - packages/server/src/__tests__/AL7-reviews-loader-redo.integration.test.ts
  - packages/shared/src/__tests__/AL7-proposed-call-types.test.ts
  - packages/server/src/__tests__/agent-work-intent-production.integration.test.ts
  - packages/server/src/__tests__/agent-work-intent-recovery.integration.test.ts
  - packages/server/src/__tests__/agent-request-custody.integration.test.ts
  - packages/server/src/__tests__/explicit-session-start.production.integration.test.ts
  - packages/server/src/__tests__/agent-lifecycle-projection.integration.test.ts
  - packages/server/src/__tests__/agent-work-intent-retention.integration.test.ts
  - packages/server/src/harness/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts
```

New red suites become protected immediately; assertions may not be weakened during green implementation.

## Migrations

- Rename/backfill `agent_work_intents.actor_id → requested_by`; update all seven callers, fixtures, DB exports, and shared event audit typing.
- Add forward schema migration for intent/source/error checks, `task_dispatch_attempts`, request claim-token/termination/custody checks, stable `last_error_code`, unique partial `sessions.request_id`, unique intent/request correlation, explicit-start completed status/correlation checks, neutral `agent_lifecycle_inbox`, and retention indexes.
- Delete `AgentWorkIntentWorkerOptions.onRequest`; reroute boot to request worker.
- Split/delete request-creating assistant entrypoint and update assistant fixtures/callers.
- Delete proposed-call-granted dispatch subscription and post-commit intent creation in scheduler/decomposition/task paths.
- Reconcile correlated request terminalization into existing `PATCH /sessions/:id`, runtime teardown, handoff, shutdown and cost-cap call sites; no new public cancellation endpoint.
- Replace helper-only lifecycle test with production-path suite; do not retain misleading direct-helper proof.
- Add the missing real assistant proof as builtin-only `harness/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts`; register its exact suffix in `BUILTIN_ONLY_INTEGRATION`, call only `requireHarness("builtin")`, and use zero stubs.
- Update docs after implementation proof, not before.

## sharedFiles

```yaml
sharedFiles:
  - packages/db/src/schema.ts
  - packages/db/src/index.ts
  - packages/db/drizzle/*AU9*remediation*.sql
  - packages/shared/src/events.ts
  - packages/api-contract/src/index.ts
  - packages/server/src/server-factory.ts
  - packages/server/src/app.ts
  - packages/server/src/app-runtime/bootstrap.ts
  - packages/server/src/services/agent-layer-boot.ts
  - packages/server/src/services/task-state-machine.ts
  - packages/server/src/services/handoff-protocol.ts
  - packages/server/src/test-fixtures.ts
  - scripts/lib/honest-harness-predicate.ts
  - docs/architecture/runtime-simplification.md
  - docs/architecture/run-unit-model.md
```

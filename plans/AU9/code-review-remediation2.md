# Review: AU9 remediation-2 (Phase-4 pass, round 1)

Reviewed against approved `plans/AU9/architecture.md` (incl. Remediation-2 R1/R2/R3 + finding ledger) and `.pipeline/work-packages/TRACK-AU.md` AU9 ACs. Every claim re-verified independently against current worktree source and re-run tests; builder self-report NOT taken on faith.

## Independent validation (re-run, not trusted)

- `npm run check` PASS (exit 0). `npm run lint` PASS (exit 0, incl. AU9/honest-harness/test-naming guards). `npm run knip:production` PASS (exit 0).
- 8 AU9 service suites (production/recovery/custody/lifecycle/explicit-start/retention/schema/boot-recovery): **78 tests PASS** (schema suite = 27 real insert-and-reject/accept constraint cases; production suite includes transaction-rollback fault injection).
- 6 refactor-touched protected suites (sessions, routines.routes, sessions.activity, knowledge, AL7-two-session-loop, AH6-broken-turn): **59 PASS**.
- 5 refactored protected units (bet-decomposition, agent-run-boundary, agent-session-runtime, trigger-resolution, AH3-assistant-turn): **29 PASS**.
- **Builtin realbinary harness suite: independently RE-RUN with a real OpenRouter call — 1 test PASS, 8.5s LLM execution.** Asserts one `agent_session_requests` row, one `sessions` row, and one reply authored by the resolved assistant (`ast-…`, not the human). This is the exact C14 item the prior review found unproven; it is now proven. (Note: the `test:integration:harness` lane does not auto-load `.env`; the bare documented command hard-fails `requireHarness("builtin")` — green only with the worktree `.env` loaded into the process env. Known repo pattern, not a code defect; the release/ship step must load it.)

## R1/R2/R3 closure — independently verified against source

- **R1 (single custody writer): CLOSED.** `markRequestTerminal` deleted (only a `@lore` comment ref remains). Weak `claim()` deleted; `claimAgentWorkIntent` is the single intent-claim (pending + expired-reclaim). `handOffIntent` deleted (a test asserts `worker.handOffIntent` `toBeUndefined`). `removedSyntheticCheckpointScaffold` deleted (zero refs). `terminalizeAgentSessionRequestInTx` is the single terminal writer via a discriminated `precondition: "running" | "claimed"` union with **mutually-exclusive status CAS** (a request is `running` XOR `claimed`, so no ambiguous double-match) + inbox insert (null `session_id` on the claimed branch); the public `terminalizeAgentSessionRequest` is a thin tx wrapper that delegates to it — no divergence. `createTriggeredAgentSessionRequest` collapsed to **exactly one production caller** (the drain, worker.ts:461); the assistant direct-create is gone. `recoverRunningAgentSessionRequests` is real (adopt-or-RUNTIME_LOST, never a constant/throw). No new correct-symbol/weak-symbol pair found.
- **R2 (production-entrypoint tests): CLOSED.** The rewritten suites drive real entrypoints and assert DB rows: `agent-lifecycle-projection` drives `PATCH /api/sessions/:id` + `bootAgentLayer` + `startAgentLifecycleProjectionDrain` and asserts `routineRuns`/`explicitSessionStarts`/`agentSessionRequests`/`agentLifecycleInbox` rows; `explicit-session-start.production` drives `POST /api/sessions`; `agent-work-intent-recovery`/`agent-layer-boot-recovery` drive the drain/boot. No banned custody-helper imports in any rewritten suite. The prior `toBeTypeOf("function")` theater on `recoverRequestedTerminations` is removed.
- **R3 (no manufactured rows / no dead scaffolds): CLOSED.** No compatibility overload manufactures request/session/result rows; the dead scaffold is deleted. Test fixtures seed only SOURCE domain rows (routineRuns/bets/explicitStarts) to drive projectors — legitimate, not request/session/result manufacture.

## 4 builder-reported bug fixes — verified real against source

1. **Routine projector wrong id** — FIXED. `resolveAuthoritativeInput` routine case now sets `sourceId: runId` (the routine RUN id, worker.ts:98, with explanatory lore); `projectRoutine` matches `routineRuns.id = fact.sourceId AND outcome='running'`. Correct.
2. **Explicit admission-failure never surfaced to poll** — FIXED. `explicitSessionStarts.requestId` is only populated on the success write, so keying the failure projection on `requestId` matched zero rows. The drain now resolves the explicit-start row through the correlated **intent's `sourceId`** for both the tier read and the failure projection (agent-layer-boot.ts:47-60,112-116). Correct and well-documented.
3. **Boot double-terminalize** — FIXED. The boot catch no longer calls a terminal writer at all (agent-layer-boot.ts:98-118); `executeAgentRunRequest` already terminalizes through the single writer, so the catch's only job is the explicit-start projection. The detached-runtime catch (agent-session-runtime.ts:265-285) and the sync-exception catch (305-324) each route through `transitionAgentRunLifecycle` once, selecting the precondition by whether admission completed. No second transition. Correct.
4. **`admitSession` concurrency off-by-one** — FIXED. The active-session count now excludes the request's own just-reserved correlated session (session-provisioning.ts:784-792), and correctly counts NULL-`requestId` rows via `or(isNull(requestId), ne(requestId, …))` to avoid the SQL three-valued-logic under-count. Correct.

## Positive lenses

- **Architecture:** The single-terminal-writer/discriminated-precondition design is exactly the round-2 architecture-critique closure; boot awaits recovery + reap before the first drain and schedules the 6h reap; `requestAgentTermination` + `transitionAgentRunLifecycle` implement the durable-reason precedence (stored reason wins over natural completion). Migration 0048 implements every enumerated durable-rows check (kind/source closed sets, kind/source compat, per-status correlation, claimed⇔token+expiry, failed⇒last_error_code, unique non-null request_id, FK ON DELETE RESTRICT, identity uniqueness, request running⇒session, termination_reason 5-value). AC1/AC6 boundary guards pass.
- **Security:** Requester (`requestedBy`) never confers authority; every family reloads the source-derived target and calls `requireRunnableActor` (assistant derives the deterministic `ast-<userId>` scaffold id as a lookup key, then reloads+validates the `users` row is `ai`+active — proven end-to-end by the realbinary reply-authorship assertion). No new endpoint, secret surface, path, or URL input.
- **Design:** N/A — no UI change.

## Negative lenses

- **Adversarial:** No backdoor/regression. The one hazard — a re-divergent terminal writer — is structurally prevented by the discriminated union + deletion of the weak duplicates.
- **Simplification / Slop:** see WARNING below.

## Findings

### WARNING
- `packages/server/src/routes/threads.ts:625,1364-1372` (+ pass-site `app.ts:412`, stale comments `threads.ts:616`, `app.ts:168`) — the `createThreadRoutes` `assistantTurnDeps` parameter is now **dead**: the route records the assistant-turn intent inside the message transaction (threads.ts:1289-1301) and no longer fires the turn, yet the param is retained and only `void`-referenced under comments still describing the deleted `runAssistantTurn` fire-and-forget path ("Re-entrancy is guarded inside runAssistantTurn"). Misleads the next agent (New-Hire-Day-7) into thinking the route executes the turn. Remove the dead param and correct/delete the stale comments. NOT AC-blocking (behavior is correct; the deps object itself is still live for the drain/boot execution path via `server-factory.ts:322,334`).

### OBSERVATION
- `agent-session-runtime.ts:119-127` — `recoverRunningAgentSessionRequests`' no-session branch terminalizes a `status='running'` request via the `claimed` precondition (claimToken, no sessionId); the claimed-CAS keys on `status='claimed'`, so it would match zero rows → throw. Unreachable given the schema check `status='running' ⇒ session_id NOT NULL`, so it is dead defensive code, but the precondition choice is internally inconsistent — prefer the running precondition (with sessionId) or drop the branch.
- `explicit-session-start.production.integration.test.ts:153` — redundant `toBeTypeOf("function")` preamble before the real 5-way `test.each` classifier-mapping assertion; harmless weak-assertion residue.
- Self-flagged gap (a) — the realbinary suite omits the invalid-return broken-turn row (C14 detail). Acceptable: broken-turn behavior is covered by `AH6-lane-gates-broken-turn.integration.test.ts` + AH3 units, and no AU9 AC mandates it in the realbinary proof.
- Self-flagged gap (b) — explicit 5-admission-error coverage. Acceptable and stronger than reported: `explicit-session-start.production` `test.each` asserts all 5 `classifyAdmissionFailure` code/status mappings, plus the route→persist→project wiring is proven end-to-end once. The classifier is a pure function; exhaustive unit coverage + one real-route proof substantially meets AC4.

## AC completeness (TRACK-AU AU9)

| AC | PASS/FAIL | Evidence |
|---|---|---|
| AC1 core never creates/consumes/executes agent requests | PASS | AU9 lint guard green; `createTriggeredAgentSessionRequest` sole caller is the agent-layer drain; assistant route records intent only. |
| AC2 every LLM entry point hands off via recorded intent/event | PASS | 7 families atomically persist source+intent (assistant message+intent tx, explicit start+intent, knowledge, routine manual+scheduler, decomposition CAS+intent, task dispatch attempt+intent, re-engagement grant+intent) — proven by production suite incl. rollback fault injection. |
| AC3 agent layer sole owner of construction/resolution/admission/lifecycle | PASS | Drain resolves+creates exactly one request; runtime admits/executes; lifecycle via inbox+projectors; realbinary proves one request/session/reply. |
| AC4 preserve observable behavior + stable errors | PASS | Explicit suite (admitted/202/poll/idempotency/payload-mismatch/5 error mappings) + touched family suites green. |
| AC5 domains observe terminal state only via lifecycle | PASS | Single terminal writer → `agent_lifecycle_inbox` → core projectors; PATCH drives it; no direct execution callback. |
| AC6 should-graph audit, no forbidden direct edge | PASS | AU9 direct-handoff guard + manual audit clean; core→request/execution edge removed. |

## Verdict

**DONE.** All six ACs pass; R1/R2/R3 independently confirmed closed with no new correct-symbol/weak-symbol divergence and no reintroduced theater; the 4 newly-fixed production bugs are real and correct; the previously-unproven builtin realbinary handoff is independently green on a real LLM call. One non-blocking WARNING (dead `assistantTurnDeps` route param + stale `runAssistantTurn` comments) and minor observations remain — cleanup, safe to fold in at ship. No CRITICAL, no AC-blocking finding.

Finding counts: CRITICAL 0 · WARNING 1 · OBSERVATION 4

## Review: AU9 — fix attempt 3

### Architecture

CRITICAL — `packages/server/src/services/agent-work-intent-worker.ts:70-74,101-120` — amended explicit-session contract / AC2–AC4 — every intent with `actorId` is passed through `requireRunnableActor` before the family switch. The route stores authenticated human `requestedBy` as the session-start intent actor (`sessions-routes.ts:355-365`), so every normal explicit session fails as “not runnable” before the worker reloads `requestedAgentId`. The admitted/pending/error API cannot work.

CRITICAL — `packages/server/src/services/agent-work-intent-worker.ts:101-120` and `agent-layer-boot.ts:53-72` — amended explicit-session error contract — missing agent and admission exceptions are not mapped to stable public codes. Boot stores `error.name` (for example `CostCapExceededError`, `ConcurrencyLimitError`, `MissingCredentialError`) while the route recognizes `COST_CAP_EXCEEDED`, `CONCURRENCY_LIMIT`, `MISSING_CREDENTIAL`, and `NO_ELIGIBLE_HARNESS`; most promised errors therefore become generic 500 responses. No required production-deps explicit-session test exists to catch this.

CRITICAL — `packages/server/src/app-runtime/services/routine-scheduler.ts:416-430`, `services/bet-decomposition.ts:413-419`, and `app-runtime/services/task-dispatcher.ts:183-205,383` — approved plan Decision/AC2 — routine scheduling, decomposition, task dispatch, and re-engagement still write their durable domain fact/queue/state separately from the intent. A crash between writes strands work. The grant handler also remains and translates `proposed_call_granted` through the core task queue instead of the approved grant transaction atomically recording re-engagement intent.

CRITICAL — `packages/server/src/services/agent-work-assistant.ts:507-538` and `agent-layer-boot.ts:28-43` — approved plan Worker flow/AC3 — intent worker already resolves/creates an assistant request, then `onRequest` ignores that request and calls `runAssistantTurn`, which resolves/creates it again before execution. Idempotency may return the same row, but trigger resolution and the handoff contract are duplicated rather than one worker-owned request→orchestrator path.

CRITICAL — `packages/server/src/services/agent-session-runtime.ts:100-166` and `agent-layer-boot.ts:82-103` — TRACK-AU AC5 — completed/failed publication is wired, but cancellation is not: no production path invokes `transitionAgentRunLifecycle(..., "cancelled")`, and explicit-session projections are never updated to `cancelled`. Domain lifecycle reactions are only implemented for decomposition; routine-run/task/re-engagement projections required to preserve observables are absent.

CRITICAL — `packages/db/src/schema.ts:386-426` and `packages/db/drizzle/0046_AU9_agent_work_intents.sql` — amended schema/retention contract — model-tier/status checks exist, but required status/correlation checks do not. No 30-day terminal retention reaper or active-row preservation implementation exists.

CRITICAL — `docs/architecture/runtime-simplification.md:17-23` and `docs/architecture/run-unit-model.md:17` — documentation rule — docs state all core actions durably cross the boundary and lifecycle is projection-only. Non-atomic families, broken explicit sessions, duplicate assistant resolution, and missing cancellation/domain projections make these authoritative statements premature.

### Security

WARNING — `packages/server/src/services/agent-work-intent-worker.ts:257-274` — recovery/concurrency contract — expired-claim CAS matches only `id + status`. Because reclaim writes status `claimed` back to `claimed`, concurrent reclaimers can both succeed; previous claim token/expiry is not in the predicate. Request uniqueness limits duplicate rows, but both workers may call the runtime callback.

No new raw HTML, shell, URL, path, or secret surface was added. Explicit-start polling correctly scopes reads by authenticated `requestedBy`.

### Adversarial / Simplification / Slop

CRITICAL — required tests/protectedTests — only `agent-lifecycle-observation.integration.test.ts` exists. Approved handoff, recovery, and production-deps explicit-session suites are absent. Existing additions test isolated intent rows for routine/decomposition, not all seven production actions, atomic rollback, boot recovery, retries, pending/poll/error mapping, retention, or real request execution.

WARNING — `packages/server/src/__tests__/agent-lifecycle-observation.integration.test.ts:32-66` — test quality — test dynamically imports and directly invokes the transition helper with unsafe casts. It proves the helper, not runtime completion/failure/cancellation or domain projection wiring.

OBSERVATION — `packages/server/src/routes/sessions-routes.ts:112-119` — slop — duplicated comment line indicates mechanical move residue; harmless but should be cleaned.

### Positive lenses

- Compatibility wrapper is deleted from core callers. Routes/services import only neutral intent recording; request creation/execution imports are agent-owned.
- Guard walks local exported call chains and fixtures catch renamed/transitive wrappers and composition-root abuse. `npm run check`, guard fixtures, repository guard, and `npm run lint` pass.
- Neutral explicit-session command keeps agent/tier outside intent, uses principal-scoped idempotency, and owner-scopes polling. API contract exports a pending discriminator.

### AC table

| Acceptance criterion | PASS/FAIL | Evidence or gap |
|---|---|---|
| AC1: core never creates/consumes/executes requests | PASS | Source audit finds request creation/execution only in agent worker/boot/assistant runtime; transitive guard and fixtures pass. |
| AC2: seven production families persist intent before one request | FAIL | Four families are non-atomic; explicit session is rejected before requested-agent reload; required seven-action/recovery tests absent. |
| AC3: agent layer exclusively owns resolution/admission/execution/lifecycle | FAIL | Physical ownership is corrected, but assistant resolves twice and callback path is not one request→orchestrator flow. |
| AC4: visible behavior preserved for seven families | FAIL | Explicit POST cannot admit; projected codes mismatch; routine/task/re-engagement/decomposition lack production-flow proof. |
| AC5: domains observe completion/failure/cancellation only through lifecycle | FAIL | No production cancelled publication, no explicit-start cancellation, and only decomposition has a lifecycle projection. |
| AC6: no core→agent direct handoff edge | PASS | Wrapper removed; source audit and transitive guard show no core request/run calls. |
| AC7: repository validation | FAIL | Check/lint/guard pass. Required tests are absent and full test/verify cannot establish failed behavioral ACs. |

VERDICT: NOT DONE

Finding counts: CRITICAL 8 · WARNING 2 · OBSERVATION 1

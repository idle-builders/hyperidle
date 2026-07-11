## Review: AU9 remediation

### Architecture

CRITICAL — `packages/server/src/routes/threads.ts:1289-1300`, `packages/server/src/services/agent-work-intent-worker.ts:81-108` — architecture §Authority / AC2–AC4 — the real assistant command persists the authenticated human as `requestedBy`; source resolution then uses that human as `defaultAgentId` and `assistantAgentId`. It never reloads the assistant participant/identity or validates a runnable target. The assistant handoff therefore targets a human and cannot preserve the production assistant reply path.

CRITICAL — `packages/server/src/services/agent-work-intent-worker.ts:156-251` — architecture §Source resolution / fixed contracts — knowledge, routine, decomposition, and re-engagement derive execution authority from mutable intent `requestedBy` (or compare source state back to it) instead of reloading the target from authoritative family state and validating it after the switch. Only explicit session and task attempt perform runnable/source validation. The requester/target split is not implemented across seven families.

CRITICAL — `packages/server/src/services/bet-decomposition.ts:450-457`, `packages/server/src/app-runtime/services/task-dispatcher.ts:183-209,381-384` — architecture §Family atomic enqueue map / AC2 — decomposition still records its intent after the earlier bet `running` mutation, and the legacy dispatcher still creates task/re-engagement intents after queue delivery. Its task source is task ID/`sourceKind="task"`, not a committed `task_dispatch_attempt`. A crash can strand work, and this is precisely the subscriber-owned enqueue the approved plan required deleting.

CRITICAL — `packages/server/src/services/agent-work-intent-worker.ts:325-357` — architecture §Claims — the production `drainAgentWorkIntents` claim path still CASes only `id + observed status`. Expired `claimed→claimed` preserves status, so two drainers can win. The separately exported token-qualified `reclaimAgentWorkIntent` is not used by the drain; its green test does not prove the production path.

CRITICAL — `packages/server/src/services/agent-session-runtime.ts:85-121,194-335,401-480`, `packages/server/src/services/agent-session-requests.ts:187-233` — architecture §Request-worker custody — crash-safe custody is mostly test scaffolding, not the runtime. `recoverRunningAgentSessionRequests` is a constant `{admitted:0}`; checkpoint recovery manufactures synthetic requests/workspaces; `reserveOrAdoptSession` does not validate claim ownership and is unused by production admission; production admits before an unqualified `markRequestRunning`, never renews the lease, and terminal/release writes are not token/session CAS. A losing worker can admit or overwrite state, and boot cannot recover a real process-death checkpoint safely.

CRITICAL — `packages/server/src/services/agent-session-runtime.ts:124-191,484-532` — TRACK-AU ownership rule / architecture §Single request execution — public compatibility overloads manufacture missing request rows, sessions, and fake completed results for tests. `terminalizeAgentSessionRequest` likewise creates an unknown request. These are alternate request construction/consumption semantics, not the one intent→exact request→runtime chain, and mask missing production custody.

CRITICAL — `packages/server/src/services/session-lifecycle.ts:111-141`, `packages/server/src/app-runtime/services/agent-lifecycle-projectors.ts:30-76`, `packages/server/src/services/agent-layer-boot.ts:135-155` — architecture §Lifecycle and cancellation / AC5 — production terminal transition updates requests without a terminal-state CAS and emits only volatile EventBus state; it never inserts `agent_lifecycle_inbox`. All seven durable projectors are no-ops, the inbox drain is not boot-wired, and the old agent-layer decomposition-only direct subscriber remains. Durable, exhaustive core-owned projection is absent.

CRITICAL — `packages/server/src/routes/sessions-routes.ts:170-204`, `packages/server/src/services/handoff-protocol.ts:370`, `packages/server/src/services/session-lifecycle.ts:50-108` — architecture §Existing PATCH cancellation contract — no production termination caller invokes `requestAgentTermination`; PATCH and handoff still abort without first persisting the closed cause, while recovery of requested causes is not boot-wired. Crash after HTTP 202, first-cause precedence, handoff-as-completion, shutdown, and cost-cap disposition are therefore not implemented.

CRITICAL — `packages/db/src/schema.ts:313-407`, `packages/db/drizzle/0047_AU9_durable_custody.sql:1-28` — architecture §Durable rows / request custody — constraints are materially weaker than the approved closed state machines: intent kind/source checks permit legacy extra values and do not enforce kind/source compatibility, claimed-token/expiry equivalence, failed error code, or unique non-null request correlation; request schema only checks that running has a session and lacks closed status/custody/termination checks. `last_error_code` is not present. Invalid states remain persistable.

CRITICAL — `packages/server/src/services/agent-work-intents.ts:84-130` — architecture §Retention — the reaper deletes inbox rows and intents only. It does not delete eligible explicit starts/task dispatch attempts in FK order and is not registered for awaited boot plus six-hour scheduling. The test only asserts exported constants for that portion.

CRITICAL — `docs/architecture/runtime-simplification.md:17-23`, `docs/architecture/run-unit-model.md:17` — documentation rule / AC4–AC5 — authoritative docs claim durable handoff and lifecycle-only projection, while assistant authority, atomicity, custody, cancellation, and projection remain incomplete. The docs describe a state the runtime does not provide.

### Security

CRITICAL — `packages/server/src/services/agent-work-intent-worker.ts:81-108,156-251` — architecture §Security & abuse — execution authority is accepted from neutral audit metadata for five families. IDs-only intents do not make this safe: the worker must reload and validate the authoritative target at consumption. This is an agent-identity/confused-deputy boundary failure.

No new raw HTML, URL, path, subprocess, or secret surface was found. Existing POST/PATCH endpoints are not new AU9 endpoints; requester-scoped explicit-start polling remains intact.

### Adversarial / Simplification / Slop

CRITICAL — `packages/server/src/__tests__/agent-request-custody.integration.test.ts:6-74`, `packages/server/src/__tests__/agent-lifecycle-projection.integration.test.ts:16-96`, `packages/server/src/__tests__/explicit-session-start.production.integration.test.ts:75-103` — architecture §Production-path test matrix — the advertised 66 green tests substantially test symbol existence, constants, synthetic compatibility overloads, and no-op projector registration. They do not drive real custody, boot recovery, PATCH cancellation, stable admission failures through route+worker, or concrete domain mutations. Green does not prove AC3–AC5.

CRITICAL — `packages/server/src/harness/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts:1-13` — architecture §Production-path test matrix / testing rules — the required “realbinary” proof only imports a module and checks two exports; it never sends an assistant message, drains intent/request, invokes the builtin harness, or asserts request/session/reply/broken-turn rows. Independently, execution is blocked before tests because `OPENROUTER_API_KEY` is absent, so real harness behavior is unproven even if the test body were corrected.

WARNING — `packages/server/src/services/agent-session-runtime.ts:430-446` — architecture §Lifecycle — detached failure swallows teardown errors, marks terminal once through `markRequestTerminal`, then calls an unconditional second transition. This can obscure the first durable failure and publish lifecycle from inconsistent state.

WARNING — `packages/server/src/app-runtime/services/agent-lifecycle-projectors.ts:53-74` — architecture §Lifecycle inbox custody — the inbox drain has no claim token/lease/retry/error handling despite schema fields for them; concurrent projectors can both apply side effects before both acknowledge.

WARNING — `packages/server/src/services/agent-work-intent-worker.ts:317-322,398-402`, `packages/server/src/services/agent-session-runtime.ts:484-560` — TypeScript rule — unsafe intersection/cross-shape casts bypass the closed request union, and the runtime overload relies on repeated `as` casts. The approved architecture explicitly required structural transaction compatibility without unsafe casts.

OBSERVATION — no UI files changed; design lens skipped.

### Positive lenses

- Core routes/domain services no longer directly import the normal request creation/execution APIs; `au9-direct-handoff-guard` and its transitive fixtures pass.
- Explicit session source+intent transaction now separates authenticated requester from requested agent, and stable admission classification exists as a pure function.
- Task transition, dependency watcher, decomposition-created tasks, manual/scheduled routines, knowledge flag, and proposed-call grant contain useful atomic source+intent work; intent→request creation/checkpoint is transactionally paired.
- Request and intent claim helpers contain token/expiry CAS building blocks; unique `sessions.request_id`, lifecycle inbox, task dispatch attempt, and retention schema foundations exist.

### AC table

| Acceptance criterion | PASS/FAIL | Evidence or gap |
|---|---|---|
| AC1: guard proves core never creates, consumes, or executes agent requests | PASS | `npm run lint` passes including AU9 direct/transitive guard; manual source audit found normal request creation/execution in agent-owned services. Synthetic compatibility paths remain an architecture finding but do not recreate a core caller. |
| AC2: seven production commands atomically persist source+intent before exactly one request | FAIL | Assistant targets requester; decomposition and dispatcher paths remain post-transaction; task dispatcher uses the wrong authoritative source; seven real commands are not all drained through one correlated production request. |
| AC3: agent layer exclusively resolves, constructs, consumes, admits, executes, publishes | FAIL | Five-family authority is intent-derived; production request custody/adoption/recovery is incomplete; synthetic alternate paths exist; durable lifecycle publication is absent. |
| AC4: explicit sessions and all family observables preserve behavior/stable errors | FAIL | Tests stop at pending or test classifier directly; no route+worker admission/error proof, assistant reply proof, or production lifecycle observable proof. |
| AC5: completion/failure/cancellation reach domains only through durable projection | FAIL | Production transition emits volatile events without inbox; projectors are no-ops/unwired; cancellation causes are not persisted by production callers. |
| AC6: should graph has no forbidden direct edge | PASS | Boundary lint/guard and manual import/call audit pass for the core→request/execution edge. Runtime semantics behind the allowed edge remain incorrect. |
| AC7: targeted suites, check, lint, unit, service integration, full verify pass | FAIL | Focused service suites: 66/66 pass; check and lint pass. Required builtin harness suite hard-fails before tests because `OPENROUTER_API_KEY` is absent, its body is not real proof, and full verify was not green/proven in this review. |

VERDICT: NOT DONE

Finding counts: CRITICAL 13 · WARNING 3 · OBSERVATION 1

Validation observed:

- `npm run check`: PASS, 10 packages.
- `npm run lint`: PASS, including honest-harness, naming, AU6/AU7, and AU9 guards.
- Six focused service remediation suites: PASS, 6 files / 66 tests.
- `npm run test:integration:harness -- packages/server/src/harness/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts`: FAIL before tests; builtin unavailable because `OPENROUTER_API_KEY` is absent.

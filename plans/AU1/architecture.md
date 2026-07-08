# AU1 Architecture Plan - Event-Driven Session Requests

Status: planning only. No implementation in this pass. Human concept review required after this architecture plan by user override.

## Required Reading

- `plans/AU1/requirements.md`
- `.pipeline/work-packages/TRACK-AU.md`
- `docs/architecture/runtime-simplification.md`
- `docs/architecture/as-implemented-domain-architecture.md`
- `docs/architecture/run-unit-model.md`
- `plans/strategy-kernel-plugin-split/dependency-graph.md`
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`
- `plans/strategy-kernel-plugin-split/component-inventory.md`
- `.pipeline/work-packages/TRACK-AR.md`

## Plan Reconciliation

- `sessions.task_id` is currently `NOT NULL` in `packages/db/src/schema.ts`; AU1 requires a migration to make `sessions.taskId` nullable and to add explicit request/source correlation. Service-only changes are insufficient.
- `SessionStartedEvent`, `SessionEndedEvent`, and `SessionNotReturnedEvent` currently require `taskId: string`; AU1 must widen these contracts to task-optional and add `requestId/sourceKind/sourceId`.
- `ProvisionSessionParams` requires `taskId`; AU1 should introduce runtime intake params from `AgentSessionRequest`, then keep task-specific transition behavior behind `taskId != null`.
- `assistant-turn.ts` already uses `provisionSession` but creates `conv-stub-task-*`; AU1 removes that stub path after sessions become task-optional.
- `bet-decomposition.ts` still runs a direct PM harness turn in `runRealPmTurn`; AU1 must replace that with a decomposition request or explicitly document a temporary compatibility adapter with no new callers.
- `fabric/src/services/task-dispatcher.ts` calls `provisionSession` through a registry; AU1 moves this dispatcher responsibility into the agent runtime request consumer so Fabric is not the collaboration-to-runtime bridge.
- `fabric/src/services/routine-scheduler.ts` has a generic taskId routine path and manual `session_started` creation; AU1 must route routine fires through session requests instead.
- Existing lifecycle consumers often assume task-backed sessions (`lifecycle-propagation`, `session-review-creator`, `cost-cap`, profile/routes). AU1 must gate task-only behavior on `taskId` while allowing task-free lifecycle projection.

## Acceptance Criteria And Verification

1. Task-optional request contract covers task, assistant/conversation, routine, knowledge, decomposition, and proposed-call runs.
   Verification: unit tests import shared request types/builders and assert valid examples for all source kinds, plus invalid missing-correlation examples fail type/schema validation.

2. Durable idempotent requests exist and can be claimed once.
   Verification: DB migration integration test introspects `agent_session_requests`; CRUD/idempotency test inserts duplicate `idempotencyKey` for same source and asserts one active request, then concurrent claim attempts return exactly one claimant.

3. `sessions.taskId` is nullable and session rows persist source correlation.
   Verification: migration integration test inserts one task-backed session and one task-free session; task-free insert has `taskId = null` and valid `requestId/sourceKind/sourceId`.

4. Work/task dispatch emits or records a session request rather than calling provisioning directly.
   Verification: service integration test accepts a task, asserts one pending request with `sourceKind="task"` and no direct `provisionSession` test double invocation from the domain layer.

5. Assistant/conversation turns no longer create `conv-stub-*` tasks.
   Verification: assistant route/service integration test posts a human assistant message, asserts a task-free request with `threadId/messageId` correlation and zero inserted `conv-stub-task-*` task rows.

6. Routine fires use task-free requests unless a routine explicitly targets a task-backed workflow.
   Verification: routine scheduler/service integration test fires a routine with no task id and asserts a pending `routine` request plus `routine_runs` correlation; no stub task is created.

7. Knowledge-triggered actions can request an agent run through the same boundary.
   Verification: knowledge service integration test emits the selected knowledge action/event and asserts a `knowledge` request with item/scope correlation; no harness/provisioning call occurs in the knowledge domain.

8. Bet decomposition enters through the request/runtime boundary rather than direct adapter calls.
   Verification: decomposition integration test starts decomposition, asserts a `decomposition` request keyed by bet id; static lint/import rule rejects direct `HarnessAdapter` or adapter-pool imports from decomposition/domain services.

9. Runtime consumer owns adapter selection, harness start/stream/stop, tools/MCP, capture/writeback, lifecycle persistence/events.
   Verification: runtime integration test consumes a prepared request through production `provisionSession` path and asserts session row, lifecycle events, and harness boundary behavior. Existing real-harness test remains the protected proof.

10. Lifecycle events carry enough correlation for domains/UI without callbacks.
    Verification: unit/integration tests assert `session_started`, `session_ended`, and `session_not_returned` include `requestId`, `sourceKind`, `sourceId`, optional `taskId`, and source-specific correlation object.

11. Existing task-backed API/user behavior remains observable.
    Verification: existing task/session route tests and `AD2-task-dispatcher.integration.test.ts` pass with updated request-mediated internals; task session rows still join to tasks and existing UI task status assertions remain green.

12. Local and future remote provisioners consume the same request contract.
    Verification: unit test validates the same serialized request fixture against the local runtime consumer input and the remote-provisioner contract type. AU1 does not add a remote adapter implementation; no domain code branches on provisioner location.

13. Harness integration tests stay at the session/runtime boundary; domain tests do not rerun real harnesses.
    Verification: protected real-harness tests remain unchanged except request seeding where necessary; new domain tests assert request emission/state reaction using service/API/DB tests only.

Final validation for implementation: `npm run check`, `npm run lint`, `npm run test`, and targeted `npm run test:integration` for AU1 files. Real harness coverage remains governed by AR protected tests.

## Contracts

Shared types in `packages/shared/src/session-request.ts`.

Use a discriminated request input union rather than a bag of optional fields. Persisted rows can store nullable columns for indexing plus `source_correlation_json`, but enqueue/build APIs must require the correct correlation for each source kind.

```ts
export type AgentSessionSourceKind =
  | "task"
  | "assistant"
  | "routine"
  | "knowledge"
  | "decomposition"
  | "proposed_call";

export type AgentSessionPromptMode =
  | "task"
  | "conversation"
  | "routine"
  | "decomposition"
  | "knowledge"
  | "proposed_call";

interface AgentSessionRequestBase {
  id: string;
  idempotencyKey: string;
  sourceId: string;
  streamId: string;
  taskId?: string | null;
  agentId: string;
  teamId?: string | null;
  userId?: string | null;
  promptMode: AgentSessionPromptMode;
  payloadJson?: string | null;
  status: "pending" | "claimed" | "running" | "completed" | "failed" | "cancelled";
  claimedBy?: string | null;
  claimedAt?: string | null;
  sessionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentSessionRequestInput =
  | (AgentSessionRequestBase & {
      sourceKind: "task";
      taskId: string;
      teamId: string;
      sourceCorrelation: { taskId: string; teamId: string; proposedCallId?: string };
    })
  | (AgentSessionRequestBase & {
      sourceKind: "assistant";
      taskId?: null;
      sourceCorrelation: {
        threadId: string;
        messageId: string;
        userId: string;
        assistantAgentId: string;
      };
    })
  | (AgentSessionRequestBase & {
      sourceKind: "routine";
      taskId?: string | null;
      sourceCorrelation: { routineId: string; routineRunId: string; teamId: string };
    })
  | (AgentSessionRequestBase & {
      sourceKind: "knowledge";
      taskId?: null;
      sourceCorrelation: {
        knowledgeItemId: string;
        action: "promote" | "summarize" | "extract" | "review";
        teamId?: string;
        scopeId?: string;
      };
    })
  | (AgentSessionRequestBase & {
      sourceKind: "decomposition";
      taskId?: null;
      sourceCorrelation: { betId: string; teamId: string; decomposerAgentId: string };
    })
  | (AgentSessionRequestBase & {
      sourceKind: "proposed_call";
      taskId: string;
      promptMode: "proposed_call";
      sourceCorrelation: { taskId: string; proposedCallId: string; grantedAgentId: string };
    });
```

DB:

- Add `agent_session_requests`.
- Columns: `id`, `source_kind`, `source_id`, `stream_id`, nullable `task_id`, `agent_id`, nullable `team_id`, nullable `user_id`, `prompt_mode`, `payload_json`, `source_correlation_json`, `idempotency_key`, `status`, `claimed_by`, `claimed_at`, `claim_expires_at`, `session_id`, `error_code`, `error_message`, `created_at`, `updated_at`.
- Add nullable `sessions.request_id`, `sessions.source_kind`, `sessions.source_id`, `sessions.source_correlation_json`.
- Alter `sessions.task_id` to nullable.
- Add indexes on `agent_session_requests(status, created_at)`, `(source_kind, source_id)`, `agent_session_requests(claim_expires_at)`, and `sessions.request_id`.
- Add unique `(source_kind, source_id, idempotency_key)`. Idempotency keys are domain-action local, e.g. `task:<id>:accepted`, `assistant:<messageId>`, `routine:<runId>`, `decomposition:<betId>:start`, `proposed_call:<id>:granted`.

Request state machine:

- `pending` - durable request, not yet owned.
- `claimed` - worker owns it but has not created the session row yet. `claimed_by`, `claimed_at`, and `claim_expires_at` are set.
- `running` - `session_id` is set and `provisionSession`/`runSession` owns the harness lifecycle.
- Terminal: `completed`, `failed`, `cancelled`.
- Claim is atomic compare-and-set: update one oldest `pending` row, or one expired `claimed` row, to `claimed` where `status in ('pending','claimed')` and `claim_expires_at < now` for stale claims. PostgreSQL can use `FOR UPDATE SKIP LOCKED`; SQLite uses a transaction plus conditional `UPDATE ... WHERE id = selectedId AND status...` and verifies one updated row.
- A claim timeout only returns the request to claimable state before session creation. Once `running`, the session lifecycle is authoritative; no worker may reclaim and start a second harness for the same request.

Runtime APIs:

- Domain enqueue API in `packages/server/src/services/agent-session-requests.ts`: `createAgentSessionRequest(db, input): Promise<AgentSessionRequest>`. Collaboration domains may import only this API and shared request types.
- Runtime claim API in `packages/server/src/services/agent-session-runtime.ts`: `claimNextAgentSessionRequest(db, workerId, now): Promise<AgentSessionRequest | null>`, `markRequestRunning(db, requestId, sessionId)`, `markRequestTerminal(db, requestId, outcome)`, `consumeAgentSessionRequest(deps, request): Promise<ProvisionSessionResult>`. Domain code must not import this module.
- Internal `provisionSession` params become task-optional with a required `requestContext`.

Assistant route/result contract:

- `runAssistantTurn` keeps its observable route behavior: when called from the message append route, it creates an `assistant` request and immediately consumes it through the local runtime consumer in-process for AU1. This preserves today's "post message -> assistant reply/notice is persisted by the turn worker" behavior while replacing the stub task with request context.
- The assistant request carries `threadId`, `messageId`, `userId`, `assistantAgentId`, `draftRegistry` binding data, and strategy formation prompt override in payload/correlation.
- If future remote consumption is enabled, the same request may be claimed out-of-process, but AU1 does not change the HTTP response shape. The message append route still returns after the human message is persisted; the assistant reply appears through existing message/lifecycle projection.

Lifecycle event shape:

- Add `requestId`, `sourceKind`, `sourceId`, `sourceCorrelation`, and `taskId?: string | null` to session lifecycle events.
- Keep task-backed fields for compatibility, but consumers must not assume `taskId` exists.

Source correlation matrix:

| sourceKind | sourceId | streamId | Required sourceCorrelation |
| --- | --- | --- | --- |
| `task` | task id | `task:<taskId>` | `taskId`, `teamId`, optional `proposedCallId` |
| `assistant` | triggering message id | `thread:<threadId>` | `threadId`, `messageId`, `userId`, `assistantAgentId` |
| `routine` | routine run id | `routine:<routineId>` | `routineId`, `routineRunId`, `teamId` |
| `knowledge` | knowledge item id plus action | `knowledge:<knowledgeItemId>` | `knowledgeItemId`, `action`, optional `teamId`/`scopeId` |
| `decomposition` | bet id | `bet:<betId>:decomposition` | `betId`, `teamId`, `decomposerAgentId` |
| `proposed_call` | proposed call id | `task:<taskId>` | `taskId`, `proposedCallId`, `grantedAgentId` |

## Ordered Tasks

1. Write red tests for shared request type/schema validation and lifecycle event widening.
2. Write migration tests for nullable `sessions.task_id`, request table constraints, claim idempotency, and task-free session insert.
3. Add shared request/event contracts and DB schema/migration.
4. Add request repository and idempotent claim/consume service in server agent runtime.
5. Refactor `ProvisionSessionParams`, `SessionContext`, `endSession`, `crashSession`, and event emit sites to accept task-optional request context.
6. Migrate task dispatch from Fabric registry direct call to request emission plus runtime consumer.
7. Migrate assistant turn to emit a task-free request and immediately consume it through the local runtime consumer so existing reply/notice persistence remains observable; delete conversational stub task creation.
8. Migrate routine scheduling/session creation to request emission and lifecycle reaction.
9. Add knowledge action request foundation for existing knowledge-triggered LLM-capable events.
10. Migrate decomposition real-turn path to request emission/runtime consumption, or quarantine any legacy adapter path behind a documented compatibility module with no new callers.
11. Update lifecycle consumers (`lifecycle-propagation`, `session-review-creator`, `cost-cap`, routes/profile/ws) to handle `taskId == null`.
12. Add lint/static guard preventing collaboration domains from importing `provisionSession`, `AdapterPool`, or `HarnessAdapter`.
13. Run targeted tests, then `npm run check`, `npm run lint`, `npm run test`.

## Route Checklist

No new public route is required for AU1. Existing route behavior to preserve:

- `packages/server/src/routes/sessions-routes.ts` - task-backed session start/list/end behavior.
- `packages/server/src/routes/threads.ts` and `packages/server/src/routes/assistant.ts` - assistant message flow.
- `packages/server/src/routes/routines-routes.ts` - routine create/fire/status behavior.
- `packages/server/src/routes/knowledge.ts` - knowledge action/event emission remains domain-owned.
- `packages/server/src/routes/tasks.ts` and `packages/server/src/routes/bets.ts` - task acceptance and decomposition-visible behavior.

## Security And Abuse

- Rate limit on state-changing endpoints: N/A for AU1 unless a new HTTP enqueue endpoint is added. If added, apply existing route auth/rate-limit pattern.
- Agent-authored fields: applicable. Treat request payload and lifecycle output as untrusted; validate source-kind payloads with Zod/shared schemas before persistence.
- Secret handling: applicable. Request payloads must not store credentials, API keys, resolved model secrets, or environment-derived secrets.
- Path traversal: applicable only through provisioning sandbox paths. Do not add path fields to requests; keep path resolution inside runtime.
- SSRF: N/A. AU1 adds no outbound URL input. Remote provisioner transport is out of scope.
- Idempotency abuse: applicable. Unique idempotency key per source/action prevents duplicate runs from replayed events.
- Cross-domain spoofing: applicable. Request builders must derive source ids from already-authorized domain rows, not client-supplied arbitrary source correlation.
- Source-specific validation: applicable. Each `sourceKind` has a Zod/shared schema mirroring the discriminated TypeScript union. Missing required correlation rejects before persistence with a typed validation error; unknown payload keys are stripped or rejected per existing server validation style. Invalid `taskId`/`teamId`/`threadId`/`routineId`/`knowledgeItemId` references fail in the domain service before enqueue.

## Protected Tests

protectedTests:

- `packages/server/src/harness/__tests__/real-session-provisioning.integration.test.ts`
- `packages/server/src/harness/__tests__/session-dispatch-wiring.integration.test.ts`
- `packages/server/src/__tests__/session-provisioning.integration.test.ts`
- `packages/server/src/__tests__/session-provisioning.test.ts`
- `packages/server/src/__tests__/AD2-task-dispatcher.integration.test.ts`
- `packages/server/src/routes/__tests__/AH3-assistant-turn.integration.test.ts`
- `packages/server/src/__tests__/AK8-strategy-decomposition.integration.test.ts`
- `packages/server/src/__tests__/bet-decomposition-service.integration.test.ts`
- `packages/server/src/routes/__tests__/routines.routes.integration.test.ts`
- `packages/shared/src/__tests__/event-bus.test.ts`
- `packages/shared/src/__tests__/o1-event-split.test.ts`

Assertions may be updated for additive `requestId/sourceKind/taskId?` shape, but must not weaken existing behavioral guarantees.

## Migrations

- `sessions.task_id`: alter to nullable; update Drizzle schema and PG migration.
- Session lifecycle event type changes: update every TypeScript emitter/consumer and shared tests.
- `ProvisionSessionParams.taskId`: rename/widen to optional and add `requestContext`; update task-specific transition sites.
- Assistant stub rows: delete `createConversationalStubTask` and any `conv-stub-*` assumptions; update tests to assert absence.
- Routine manual session creation: reroute through request creation; delete direct fake session start helpers where obsolete.
- Decomposition direct PM turn: reroute to runtime request; delete or quarantine direct adapter call path.
- Dispatch registry: delete or reroute `fabric/src/services/provision-registry.ts` once task dispatcher no longer owns provisioning.

## Shared Files

sharedFiles:

- `packages/db/src/schema.ts`
- `packages/db/drizzle/*`
- `packages/shared/src/events.ts`
- `packages/shared/src/event-bus.ts`
- `packages/shared/src/index.ts`
- `packages/server/src/services/session-provisioning.ts`
- `packages/server/src/services/session-lifecycle.ts`
- `packages/server/src/services/assistant-turn.ts`
- `packages/server/src/services/bet-decomposition.ts`
- `packages/fabric/src/services/task-dispatcher.ts`
- `packages/fabric/src/services/routine-scheduler.ts`
- `packages/fabric/src/services/lifecycle-propagation.ts`
- `packages/fabric/src/services/session-review-creator.ts`
- `packages/fabric/src/services/cost-cap.ts`
- `packages/server/src/routes/sessions-routes.ts`
- `packages/server/src/routes/threads.ts`
- `packages/server/src/routes/routines-routes.ts`
- `packages/server/src/routes/knowledge.ts`

## Risks

- Large migration blast radius: many consumers assume `taskId` exists on sessions/events.
- Fabric still owns dispatch/routine/lifecycle subscribers; AU1 will touch code AU3 later wants to remove.
- Task-free sessions need careful cost attribution because current bet cost accumulation goes through `taskId -> betId`.
- Assistant reply persistence currently expects synchronous `provisionSession` result; request queue consumption may require a projection or callback-free result handler.
- Remote provisioner compatibility should stop at contract shape in AU1; implementing transport here would overrun scope.

## Human Concept Review Gate

Required before implementation. Review `plans/AU1/requirements.md` and this architecture plan together; no design artifact exists because AU1 has no rendered UI surface.

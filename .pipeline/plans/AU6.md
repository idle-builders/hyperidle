# AU6 Architecture Plan: Agent Execution Boundary Closure

## Required Reading

- `.pipeline/work-packages/TRACK-AU.md` AU6 section
- `plans/AU6/requirements.md`
- `.pipeline/plans/AU4.md`
- `docs/architecture/as-implemented-domain-architecture.md`
- `docs/architecture/run-unit-model.md`
- `docs/agent-layer/agent-model.md`
- `docs/agent-layer/harness-capability-descriptor.md`
- `docs/process-layer/tasks-and-sessions.md`
- `docs/process-layer/bets-shape-commit-change-ship.md`
- `docs/process-layer/routines-and-retros.md`
- `docs/process-layer/staged-operation.md`

## Plan Reconciliation

- AU4 trigger resolution already exists in `packages/server/src/services/trigger-resolution.ts` and creates `AgentSessionRequest` rows with trigger history. AU6 must reuse it, not add a parallel trigger resolver.
- `consumeAgentSessionRequest` already claims requests, runs `admitSession`/`runSession`, and writes `pending|claimed|running|completed|failed|cancelled` statuses. It is the current execution engine, but callers import it directly from domains and app-runtime services.
- Current direct execution call sites include `assistant-turn.ts`, `bet-decomposition.ts`, `app-runtime/services/routine-scheduler.ts`, `app-runtime/services/task-dispatcher.ts`, and session route paths. They should call an agent-layer boundary service instead of reaching for runtime consumption/registry hooks directly.
- `server-factory.ts` registers request creation/consumer functions into a provision registry for legacy circular-package paths. AU6 can keep the registry for compatibility, but the preferred boundary should be in server services, with compatibility adapters delegating to it.
- Lifecycle is already durable on `agent_session_requests`, but there is no named observer helper exposing a common `requested|running|completed|failed|cancelled` state shape for domains. AU6 should add that read model over existing rows rather than new tables.
- Knowledge source kind exists in `packages/shared/src/session-request.ts`, but production knowledge action execution may be thin. AU6 should add/cover a service-level knowledge-action request path without inventing UI.
- `provisionSession` still owns context assembly, harness selection, tools/MCP, capture/writeback, and final lifecycle. AU6 should not split those internals; it should make the request boundary the only domain-facing entry point.

## Acceptance Criteria And Verification

| AC | Verification |
|---|---|
| Every current LLM-capable user or domain action produces an agent-layer run request before execution begins. | Add/extend runtime tests that drive task, assistant, routine, knowledge, decomposition, and proposed-call request helpers through the new boundary and assert each creates an `agent_session_requests` row before `runSession` is invoked. |
| Core app domain code can observe requested, running, completed, failed, and cancelled run state without importing harness, tool, MCP, context, or provisioning internals. | Unit tests for `getAgentRunLifecycle`/`listAgentRunLifecycleBySource` seed request rows in each status and assert normalized states; add static lint/type-safe import test only if an existing boundary lint rule exists. |
| Agent-layer execution owns harness selection, run admission, context assembly, tool/MCP availability, capture, writeback, and lifecycle publication for every run. | Mock `admitSession`/`runSession` behind the boundary and assert domain callers call the boundary, while the boundary alone calls runtime internals and transitions request state. Existing provisioning tests remain protected. |
| Existing task, assistant, routine, knowledge-action, decomposition, and re-engagement behavior remains observable after the boundary closure. | Protected existing source tests remain green; add a cross-source boundary test covering request source kind, correlation, and terminal state for all six source kinds. |
| A failed agent run is reported through the same lifecycle state regardless of which domain action requested it. | Boundary test forces `runSession` failure for representative source kinds and asserts request state `failed` plus normalized lifecycle `{ state: "failed", error }`. |
| Runtime tests can prove the request-to-lifecycle path once, while domain tests prove request creation and lifecycle reaction without direct harness execution. | Add one runtime boundary test around `executeAgentRunRequest`; domain tests use request/lifecycle helpers and do not import `session-provisioning`, harness adapters, MCP, context, or tool internals. |

## Contracts

Add `packages/server/src/services/agent-run-boundary.ts`:

```ts
export type AgentRunLifecycleState =
  | "requested"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentRunLifecycle {
  readonly requestId: string;
  readonly sourceKind: AgentSessionSourceKind;
  readonly sourceId: string;
  readonly streamId: string;
  readonly agentId: string;
  readonly sessionId: string | null;
  readonly state: AgentRunLifecycleState;
  readonly error: { readonly code: string | null; readonly message: string | null } | null;
}

export async function executeAgentRunRequest(
  deps: ProvisionSessionDeps,
  request: AgentSessionRequest,
  options: ConsumeAgentSessionRequestOptions,
): Promise<ProvisionSessionResult>;

export async function getAgentRunLifecycle(
  db: HyperIdleDb,
  requestId: string,
): Promise<AgentRunLifecycle | null>;

export async function listAgentRunLifecycleBySource(
  db: HyperIdleDb,
  sourceKind: AgentSessionSourceKind,
  sourceId: string,
): Promise<AgentRunLifecycle[]>;
```

Mapping:
- `pending|claimed` -> `requested`
- `running` -> `running`
- `completed` -> `completed`
- `failed` -> `failed`
- `cancelled` -> `cancelled`

`executeAgentRunRequest` delegates to `consumeAgentSessionRequest`; domains import the boundary, not `agent-session-runtime` or `session-provisioning`.

## Ordered Tasks

1. Write failing tests for lifecycle normalization over all request statuses.
2. Write failing tests for boundary execution: request is durable before runtime starts; boundary marks running/completed; failure is normalized consistently.
3. Write failing cross-source tests for six source kinds proving all enter through the boundary and expose lifecycle without direct provisioning imports.
4. Add `agent-run-boundary.ts` and export it where local server services need it.
5. Migrate direct service call sites from `consumeAgentSessionRequest`/registry consumer to `executeAgentRunRequest` or a compatibility adapter that delegates to it.
6. Add/adjust service-level knowledge action request helper only if no current production helper exists.
7. Keep existing trigger resolution, request repository, and provisioning internals unchanged except for imports needed by the boundary.
8. Run focused tests, then `npm run check`, `npm run lint`, and `npm run test`.

## Protected Tests

- `packages/server/src/services/__tests__/agent-session-runtime.test.ts`
- `packages/server/src/services/__tests__/agent-session-request-sources.integration.test.ts`
- `packages/server/src/services/__tests__/trigger-resolution.test.ts`
- `packages/server/src/__tests__/bet-decomposition.test.ts`
- `packages/server/src/__tests__/AD2-task-dispatcher.integration.test.ts`
- `packages/server/src/harness/__tests__/conversational-reply-row.integration.test.ts`

## Route Checklist

N/A. AU6 adds no HTTP route.

## Security And Abuse Cases

- Rate limits: N/A; no new endpoint.
- Input trust boundary: existing request schemas remain the input validator; boundary accepts already-created `AgentSessionRequest` rows.
- Secret handling: N/A; no new credentials or config fields.
- Path traversal: N/A; sandbox paths remain owned by provisioning.
- SSRF: N/A; no outbound URL surface.
- Agent-authored fields: lifecycle read model reflects runtime state only and does not trust agent text as control input.
- Failure policy: runtime exceptions become `failed` request lifecycle state for every source kind; admission capacity/cost errors continue to release claim for retry.

## Migrations

No database migration planned. Existing `agent_session_requests` stores durable request identity, source correlation, terminal errors, and session id.

## Shared Files

- `packages/server/src/services/agent-session-runtime.ts`
- `packages/server/src/services/agent-session-requests.ts`
- `packages/server/src/app-runtime/services/provision-registry.ts`
- `packages/server/src/services/assistant-turn.ts`
- `packages/server/src/services/bet-decomposition.ts`
- `packages/server/src/app-runtime/services/routine-scheduler.ts`
- `packages/server/src/app-runtime/services/task-dispatcher.ts`

## Design-It-Twice

Alternative A: move all execution into `consumeAgentSessionRequest` and tell domains to import it. Rejected because the import name exposes runtime consumption and keeps domains adjacent to provisioning details.

Alternative B: add a thin `agent-run-boundary` facade over the request consumer plus lifecycle observers. Chosen because it makes ownership explicit without forking the runtime path or adding storage.

Alternative C: add a new `agent_runs` table. Rejected for AU6 because request rows already are durable run identities; a second table would duplicate lifecycle and increase AU7 retirement work.

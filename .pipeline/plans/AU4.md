# AU4 Architecture Plan: One Trigger Path For Every LLM-Capable Event

## Refined Requirement

Value: maintainers and product operators get one inspectable rule for `event -> agent run`, instead of task dispatch, assistant turns, routine fires, decomposition, knowledge actions, and grant re-engagement each choosing agents and prompts in local code.

Success: every LLM-capable event family is converted into a typed trigger occasion, resolved through one trigger resolver, then converted into the existing `AgentSessionRequest` boundary. The resulting request/session records are queryable with resolver evidence: source event, matched trigger or fallback, chosen agent, prompt source, and request/session id.

Scope:
- In: backend trigger vocabulary, trigger resolver, fallback/default attach policy, trigger result audit/read model, migration of current event families onto resolver before `createAgentSessionRequest`.
- In: use AU2 editable configuration store for plugin/user trigger defaults and user override precedence.
- Out: trigger settings UI (AU5), plugin execution/sandboxing, new harness path, new domain events unrelated to LLM-capable runs, enterprise approval gates.
- Out: removing historical Fabric exports beyond what is needed to route active LLM event families through triggers. AU3 owns broader Fabric runtime deletion.

DOC-CLASS: minor. This reshapes developer/runtime vocabulary and needs docs updates, but no user-facing guide page or UI copy lands in AU4.

## Trigger Vocabulary And Semantics

### Terms

- Trigger occasion: normalized runtime input derived from an LLM-capable domain event or direct runtime action. It is not the raw `KernelEvent`; it is the typed event+scope payload the agent layer can resolve.
- Trigger rule: active configuration item of kind `trigger` that matches an occasion and supplies an execution binding.
- Execution binding: chosen `agentId`, optional `promptTemplate` or `promptOverride`, optional `promptMode`, optional tool/MCP/skill hints for later work, and optional priority/specificity metadata.
- Fallback attach: runtime policy used when no active trigger rule matches. It chooses the default eligible agent and applies no event-specific prompt override.
- Resolver result: immutable evidence captured with the request/run: occasion, matched rule id or fallback, origin/value source, chosen agent, prompt source, and reason.

### Occasion Families

Use a closed shared vocabulary aligned to existing `AgentSessionSourceKind`:

```ts
export const TRIGGER_OCCASION_KINDS = [
  "task_accepted",
  "assistant_message_appended",
  "routine_fired",
  "bet_decomposition_requested",
  "knowledge_action_requested",
  "proposed_call_granted",
] as const;
```

Mapping to session requests:

| Occasion | Existing sourceKind | Default attach behavior | Trigger override can supply |
|---|---|---|---|
| `task_accepted` | `task` | current task assignee/default eligible team agent | agent, task prompt override |
| `assistant_message_appended` | `assistant` | user's assistant agent, no event-specific prompt | assistant agent, conversation prompt override |
| `routine_fired` | `routine` | routine owner/default eligible team agent | agent, routine prompt override |
| `bet_decomposition_requested` | `decomposition` | active product-manager-like team agent, else default eligible team agent | decomposer agent, decomposition prompt override |
| `knowledge_action_requested` | `knowledge` | default eligible knowledge-capable agent | agent, knowledge action prompt override |
| `proposed_call_granted` | `proposed_call` | same granted/origin agent and grant-bearing workflow, no prompt override | re-engagement prompt only if rule keeps same grant constraints |

### Matching And Override Rules

1. Active user-owned/user-override trigger beats plugin/builtin default for the same trigger key.
2. More specific scope beats broader scope within the same value source: exact entity (`routineId`, `taskId`, `threadId`) > team/user scope > occasion kind > global.
3. Plugin defaults are eligible only when their plugin origin is enabled. Disabled/removed plugin defaults do not match unless a user override is active.
4. Ties after source and specificity are resolved deterministically by `priority` desc then `key` asc; duplicate priorities are allowed but stable.
5. No match is meaningful: create a fallback resolver result, choose default eligible agent, and do not apply an event-specific prompt override.
6. The resolver validates chosen agent eligibility before request creation. Invalid configured agents produce a failed resolver result and no request; fallback is used only for no-match, not for broken explicit config.
7. Existing hard constraints survive trigger resolution: proposed-call grant sessions keep grant-bearing workflow and arg pin; cost/concurrency still live in session admission; assistant draft tool limits remain conversational-mode constraints.

## Required Reading

- `.pipeline/work-packages/TRACK-AU.md` AU4 section
- `.pipeline/work-packages/pipeline-manifest.yaml` AU4 entry
- `docs/architecture/runtime-simplification.md`
- `docs/architecture/as-implemented-domain-architecture.md`
- `plans/strategy-kernel-plugin-split/dependency-graph.md`
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`
- `docs/agent-layer/agent-model.md`
- `docs/process-layer/tasks-and-sessions.md`
- `docs/process-layer/routines-and-retros.md`
- `docs/process-layer/staged-operation.md`

## Plan Reconciliation

- Spec assumes AU1 exists. Reality: `agent_session_requests`, nullable `sessions.taskId`, and `AgentSessionRequestInput` already exist in `packages/db/src/schema.ts` and `packages/shared/src/session-request.ts`. Plan reuses this request boundary.
- Spec assumes AU2 exists. Reality: `plugins`, `plugin_configuration_defaults`, `configuration_overrides`, `ConfigurationKind = "trigger"`, and `listResolvedConfiguration` exist. Plan uses this store; it must add typed trigger schemas/resolver behavior rather than a parallel trigger table unless audit needs justify a separate history table.
- Spec says no Strategy/Fabric fallback. Reality: `packages/server/src/app-runtime/services/task-dispatcher.ts` exists, but mirrored `packages/fabric/src/services/task-dispatcher.ts` and routine scheduler code still create requests. Plan must update the active app-runtime path and any compatibility/fabric mirror that remains imported by boot/tests.
- Current `AgentSessionRequestInput` requires `agentId`. AU4 cannot make agent choice inside `consumeAgentSessionRequest` without changing many contracts; instead trigger resolution happens before `createAgentSessionRequest`, then request `payloadJson`/new columns carry resolver evidence.
- Assistant turns currently form a persona/prompt in `assistant-turn.ts` before request creation. Plan must route that formation decision through the trigger resolver and pass `systemPromptOverride` only when resolver result supplies one.
- Bet decomposition already uses app-owned resolver defaults and creates a `decomposition` request. Plan replaces decomposer selection with trigger resolution while preserving no-agent/blocking behavior and real-harness decomposition tests.
- Routine rows already have `triggerType`/`triggerConfig`; those are schedule/firing definitions, not AU4 agent-run triggers. Plan keeps schedule fields and adds separate trigger-rule vocabulary for "routine fired -> agent/prompt".
- Proposed-call re-engagement currently comes from `proposed_call_granted` through dispatch queue and must keep same agent/grant-bearing workflow. Trigger overrides must not widen the grant or switch to an unrelated executor.
- Knowledge action source kind exists in shared session request contract, but no clear production knowledge-agent caller was found. Plan still defines the contract and tests resolver/request creation at service level; full knowledge UI/action flow can be wired only where a real action endpoint exists.

## Acceptance Criteria And Validation Mapping

| AC | Verification |
|---|---|
| AC1 all LLM-capable event families resolve through one trigger resolver before request creation | Add `packages/server/src/services/__tests__/trigger-resolution-sources.integration.test.ts`: drive task, assistant, routine, decomposition, proposed-call service entry points with fake runtime consumer and assert each created request contains a `triggerResolutionId`/resolver evidence. Add service-level knowledge-action request test if no route exists. |
| AC2 no matching trigger falls back to default eligible agent with no event-specific prompt | Add `packages/server/src/services/__tests__/trigger-resolver.test.ts`: no trigger config for assistant/routine/task/decomposition occasions returns `kind:"fallback"`, chosen default agent, and `promptSource:"none"`; request payload/conversational params omit prompt override. |
| AC3 user trigger overrides plugin/builtin default for same event scope | Extend resolver integration test: seed plugin trigger and active user override for same routine scope; assert user value wins, chosen agent/prompt source recorded, plugin origin remains visible as overridden default. |
| AC4 specificity beats broader defaults deterministically | Resolver unit test with global, occasion-kind, team, and exact routine rules; assert exact wins; same specificity uses priority desc then key asc. |
| AC5 invalid explicit trigger does not silently fallback | Resolver integration test with trigger referencing paused/nonexistent/wrong-team agent; assert resolver returns failed result/no request and caller records/propagates failure according to family semantics. |
| AC6 trigger outcomes inspectable after the fact | Add repository/API/service test: after task acceptance request creation, query trigger history/read model by source event/request id and assert occasion, matched trigger or fallback, chosen agent, prompt source, request id, and session id after consumption. |
| AC7 existing observable behavior remains | Extend/keep protected tests for task dispatch, assistant turn persistence, routine run/session link, bet decomposition, proposed-call grant re-engagement; only expected additions are trigger evidence fields. |
| AC8 no Strategy/Fabric object invoked for decomposition trigger path | Integration test for bet decomposition with runtime request path asserts request sourceKind `decomposition`, trigger evidence present, and no Strategy selector hook required. Static import cleanup can be enforced by lint only if AU3 already added a no-Fabric-runtime rule. |
| AC9 project stays green | Run `npm run check`, `npm run lint`, `npm run test`. Harness matrix tests are not required for AU4 unless production harness behavior changes. |

## Architecture

### Shared Contracts

Add `packages/shared/src/trigger.ts` and export from `packages/shared/src/index.ts`:

```ts
export type TriggerOccasionKind =
  | "task_accepted"
  | "assistant_message_appended"
  | "routine_fired"
  | "bet_decomposition_requested"
  | "knowledge_action_requested"
  | "proposed_call_granted";

export type TriggerOrigin = "builtin" | "plugin" | "user";
export type TriggerPromptSource = "none" | "trigger" | "agent_default";

export interface TriggerOccasionBase {
  readonly kind: TriggerOccasionKind;
  readonly sourceId: string;
  readonly streamId: string;
  readonly teamId?: string;
  readonly userId?: string;
  readonly happenedAt: string;
}

export interface TriggerRuleValue {
  readonly occasionKind: TriggerOccasionKind;
  readonly scope?: {
    readonly teamId?: string;
    readonly userId?: string;
    readonly entityId?: string;
  };
  readonly agentId: string;
  readonly promptTemplate?: string;
  readonly promptMode?: AgentSessionPromptMode;
  readonly priority?: number;
  readonly active?: boolean;
}

export interface TriggerResolutionResult {
  readonly id: string;
  readonly occasionKind: TriggerOccasionKind;
  readonly sourceId: string;
  readonly result: "matched" | "fallback" | "failed";
  readonly triggerKey: string | null;
  readonly triggerOrigin: TriggerOrigin | null;
  readonly valueSource: ConfigurationValueSource | null;
  readonly chosenAgentId: string | null;
  readonly promptSource: TriggerPromptSource;
  readonly promptOverride: string | null;
  readonly reason: string;
}
```

Keep `routine.triggerType` as schedule vocabulary. Do not reuse it for runtime trigger rules.

### Persistence

Preferred minimum shape: add `agent_trigger_resolutions` in `packages/db/src/schema.ts` plus migration:

```ts
agentTriggerResolutions: {
  id: text primary key,
  occasionKind: text not null,
  sourceId: text not null,
  streamId: text not null,
  teamId: text null,
  userId: text null,
  result: "matched" | "fallback" | "failed",
  triggerKey: text null,
  triggerOriginType: text null,
  triggerOriginId: text null,
  valueSource: text null,
  chosenAgentId: text null references users(id) set null,
  promptSource: text not null,
  reason: text not null,
  createdAt: text not null,
  requestId: text null references agent_session_requests(id) set null,
  sessionId: text null references sessions(id) set null,
  detailsJson: text not null default "{}"
}
```

Add nullable `triggerResolutionId` to `agent_session_requests` and `sessions` only if local Drizzle migration cost is acceptable. If not, store `triggerResolutionId` in `agent_session_requests.payloadJson` and link `agent_trigger_resolutions.requestId`; downstream AU5 should still query without JSON parsing.

### Server Services

- `packages/server/src/services/triggers/trigger-config.ts`: Zod schema for `TriggerRuleValue`; validates AU2 `kind:"trigger"` values.
- `packages/server/src/services/triggers/default-attach.ts`: one fallback policy per occasion family. Must load eligible `users.kind="ai"`, `status="active"`, team/user scope where applicable, and preserve existing special cases: assistant user assistant, task assignee, routine owner, decomposition PM-like role, proposed-call granted agent.
- `packages/server/src/services/triggers/trigger-resolver.ts`: loads `listResolvedConfiguration(db, "trigger")`, filters active valid rules, applies source/specificity/priority order, validates agent eligibility, persists `agent_trigger_resolutions`, returns `TriggerResolutionResult`.
- `packages/server/src/services/triggers/request-factory.ts`: helper that accepts occasion + source-specific request fields, calls resolver, creates `AgentSessionRequest` with chosen agent/prompt evidence, and links the resolution to request id.
- `packages/server/src/services/triggers/trigger-history.ts`: query by source/request/session for AU5 and tests.

### Event Family Migration Points

- Task accepted/session route: `packages/server/src/app-runtime/services/task-dispatcher.ts`, compatibility mirror `packages/fabric/src/services/task-dispatcher.ts` if still compiled, and manual `packages/server/src/routes/sessions-routes.ts`.
- Assistant message: `packages/server/src/services/assistant-turn.ts`; resolver replaces or feeds `formation.persona` as turn-time prompt override.
- Routine fired: `packages/fabric/src/services/routine-scheduler.ts` or app-runtime replacement if AU3 moved it; resolver handles owner/default agent after scheduler decides a routine is due.
- Bet decomposition: `packages/server/src/services/bet-decomposition.ts`; resolver chooses decomposer before creating the `decomposition` request.
- Knowledge action: add service helper near knowledge routes/services; do not invent UI. If no existing action endpoint requests LLM work, cover shared contract + service-level request creation.
- Proposed call granted: `packages/server/src/app-runtime/services/task-dispatcher.ts` grant path and `packages/server/src/services/proposed-call-workflow.ts` events. Resolver evidence must preserve grant-bearing workflow.

### Prompt Semantics

- Fallback attach always means `promptSource:"none"`; existing source-specific base prompt/context assembly remains, but no event-specific override is passed.
- Matched trigger with `promptTemplate` sets `promptSource:"trigger"` and passes the override through request payload/provision params.
- Agent row `systemPrompt` remains agent identity/persona, not an event trigger prompt.

## Ordered Tasks For Builder

1. Add shared trigger vocabulary/types/Zod schemas and export them.
2. Add DB migration/schema for `agent_trigger_resolutions` and optional FK columns on `agent_session_requests`/`sessions`.
3. Implement trigger config validation against AU2 resolved configuration.
4. Implement default attach policies with focused tests for every occasion family.
5. Implement trigger resolver matching/precedence/invalid-agent behavior and persistence.
6. Implement trigger-aware request factory and link resolution records to requests/sessions.
7. Migrate task dispatch/manual session start to request factory.
8. Migrate assistant turns, preserving conversational tool limits and turn reply persistence.
9. Migrate routine scheduler fire path, preserving `routine_runs` state/session link.
10. Migrate bet decomposition resolver, preserving no-agent/block statuses and real runtime path.
11. Migrate proposed-call grant re-engagement, preserving grant-bearing workflow.
12. Add knowledge-action service-level trigger request helper if no production route exists.
13. Add trigger history query service/API only as needed for AU5 handoff and AC6.
14. Run `npm run check`, `npm run lint`, `npm run test`.

## Design-It-Twice

Alternative A: make `agent_session_requests` accept missing `agentId` and resolve triggers inside `consumeAgentSessionRequest`. Rejected: current schema/shared contract require `agentId`, cost/concurrency admission expects an agent, and failures would happen later with worse source-family semantics.

Alternative B: resolve triggers at each LLM-capable source immediately before request creation, then pass chosen agent and prompt evidence into the existing request/runtime boundary. Chosen: smaller migration, preserves AU1 request semantics, and gives domain-specific callers a clear place to handle invalid explicit config.

Alternative C: store trigger history only in `payloadJson`. Rejected for AU5/read-model needs: JSON-only audit is hard to query by source/request/session and easy to regress.

## Security And Abuse Cases

- Rate-limit state-changing endpoints: N/A unless AU4 adds trigger config mutation routes. Resolver/history read route, if added, uses existing authenticated settings/public-data boundaries.
- Input trust boundary for agent-authored fields: applicable. Trigger config is user/plugin-authored JSON; validate with Zod, reject oversized prompt templates, and never execute code from trigger values.
- Secret handling: applicable. Trigger prompt/config must not carry credentials or env-like secret fields; reuse AU2 secret-bearing field rejection for `kind:"trigger"`.
- Path traversal: N/A. Trigger config must not introduce filesystem paths.
- SSRF: N/A. Trigger config must not introduce outbound URLs; MCP server config remains AU2/tooling territory.
- Abuse/failure policy: invalid explicit trigger is visible failure, not silent fallback. No-match fallback remains trust-first product behavior.
- Proposed-call grant safety: applicable. Trigger override must not change approved args/tool/grant constraints or switch away from the granted/origin agent unless a later explicit spec changes staged-operation semantics.

## Route Checklist

N/A for core runtime migration. If AU4 adds history API, cover:

- `packages/server/src/routes/trigger-history.ts`
- `packages/server/src/routes/index.ts` or `server-factory.ts` mount
- `packages/api-contract/src/trigger-history.ts`

No UI routes or settings editor work in AU4.

## Migrations

- Add `agent_trigger_resolutions` table and indexes on `(occasion_kind, source_id)`, `request_id`, `session_id`, `trigger_key`, `chosen_agent_id`.
- Optionally add `trigger_resolution_id` to `agent_session_requests` and `sessions`; if added, include backfill nullable only, no historical inference.
- Do not drop or rename `routine.triggerType`/`triggerConfig`; they remain schedule definition.
- Do not remove `agent_session_requests.agentId` in AU4.
- Do not drop Strategy/Fabric compatibility symbols unless AU3 already removed their consumers in this worktree.

## Protected Tests

protectedTests:

- `packages/server/src/services/__tests__/agent-session-requests.test.ts`
- `packages/server/src/services/__tests__/agent-session-runtime.test.ts`
- `packages/server/src/services/__tests__/agent-session-request-sources.integration.test.ts`
- `packages/server/src/services/__tests__/bet-decomposition-service.integration.test.ts`
- `packages/server/src/__tests__/bet-decomposition-real-agent.integration.test.ts`
- `packages/server/src/routes/__tests__/routines.routes.integration.test.ts`
- `packages/server/src/services/__tests__/assistant-turn.integration.test.ts`
- `packages/shared/src/__tests__/session-request-contract.test.ts`
- `packages/shared/src/__tests__/AL7-proposed-call-types.test.ts`

If a listed file name differs in the worktree, preserve the nearest existing test covering the same behavior.

## Shared Files

sharedFiles:

- `packages/db/src/schema.ts`
- `packages/db/drizzle/*`
- `packages/shared/src/index.ts`
- `packages/shared/src/session-request.ts`
- `packages/shared/src/configuration.ts`
- `packages/shared/src/events.ts`
- `packages/server/src/services/agent-session-requests.ts`
- `packages/server/src/services/agent-session-runtime.ts`
- `packages/server/src/services/session-provisioning.ts`
- `packages/server/src/app-runtime/services/task-dispatcher.ts`
- `packages/fabric/src/services/task-dispatcher.ts`
- `packages/fabric/src/services/routine-scheduler.ts`
- `packages/server/src/services/assistant-turn.ts`
- `packages/server/src/services/bet-decomposition.ts`
- `packages/server/src/server-factory.ts`

## Risks And Ambiguities

- AU4 depends on AU2/AU3; this worktree has AU2 config and AU1 requests, but some Fabric compatibility files remain. Builder must verify which path is active before editing mirrors.
- Knowledge-action production surface is under-specified in current code. Treat service-level resolver/request proof as enough unless a real endpoint already exists by build time.
- `promptSource:"none"` must be documented carefully: base session prompts still exist; only event-specific trigger prompt is absent.
- Trigger resolver can become a hidden policy engine if it grows authorization/gating behavior. Keep it to matching, default attach, prompt binding, and audit.

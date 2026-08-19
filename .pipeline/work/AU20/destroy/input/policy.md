# Destroyer input — `policy` (core-api)

Package: `layers/core-api/policy`
Surface: 5 exported functions, 0 classes (0 member methods), 7 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `computeApprovalRate` | yes | `layers/core-api/policy/src/approval-rate.ts:38` |
| 2 | `buildHandoff` | yes | `layers/core-api/policy/src/handoff-protocol.ts:73` |
| 3 | `recordPropagationHop` | yes | `layers/core-api/policy/src/lifecycle-propagation.ts:210` |
| 4 | `reapTerminalPropagationLog` | yes | `layers/core-api/policy/src/lifecycle-propagation.ts:238` |
| 5 | `registerPolicy` | yes | `layers/core-api/policy/src/register-policy.ts:18` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `ApprovalRateResult` (interface, public) `layers/core-api/policy/src/approval-rate.ts:12` — members: `approvalRate`, `totalVerdicts`, `recentVerdicts`
- `HandoffMetadata` (interface, public) `layers/core-api/policy/src/handoff-protocol.ts:28` — members: `context_id`, `status`, `reason`, `artifacts`, `remaining_work`, `error`
- `HandoffParams` (interface, public) `layers/core-api/policy/src/handoff-protocol.ts:39` — members: `sessionContext`, `toAgent`, `toRole`, `toHuman`, `metadata`
- `HandoffResult` (interface, public) `layers/core-api/policy/src/handoff-protocol.ts:47` — members: `status`, `targetAgentId`, `escalationItemId`
- `LogPropagationEntry` (interface, internal) `layers/core-api/policy/src/lifecycle-propagation.ts:187` — members: `sourceLevel`, `sourceId`, `sourceEvent`, `targetLevel`, `targetId`, `targetTransition`, `status`, `failureReason`, `attempts`
- `PolicySessionContext` (interface, public) `layers/core-api/policy/src/ports.ts:17` — members: `sessionId`, `agentId`, `taskId`
- `PolicyDeps` (interface, public) `layers/core-api/policy/src/ports.ts:24` — members: `work`, `conversation`, `users`, `org`, `silence`, `notifications`, `sessionRequests`, `taskRunResolver`, `runOrchestration`

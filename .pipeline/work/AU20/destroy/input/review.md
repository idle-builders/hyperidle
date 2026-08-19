# Destroyer input — `review` (core-api)

Package: `layers/core-api/review`
Surface: 11 exported functions, 1 classes (0 member methods), 9 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `findProposedCall` | yes | `layers/core-api/review/src/proposed-call-workflow.ts:97` |
| 2 | `resolveReengagementRequest` | internal | `layers/core-api/review/src/proposed-call-workflow.ts:303` |
| 3 | `recordProposedCall` | yes | `layers/core-api/review/src/proposed-call-workflow.ts:393` |
| 4 | `transitionProposedCall` | yes | `layers/core-api/review/src/proposed-call-workflow.ts:495` |
| 5 | `transitionProposedCall` | yes | `layers/core-api/review/src/proposed-call-workflow.ts:499` |
| 6 | `transitionProposedCall` | yes | `layers/core-api/review/src/proposed-call-workflow.ts:504` |
| 7 | `handleUnconsumedGrantOnSessionEnd` | internal | `layers/core-api/review/src/proposed-call-workflow.ts:733` |
| 8 | `reengageOnAdmissionFailure` | yes | `layers/core-api/review/src/proposed-call-workflow.ts:776` |
| 9 | `attentionReviewReasoningMarker` | yes | `layers/core-api/review/src/review-item-factory.ts:24` |
| 10 | `createReviewItem` | yes | `layers/core-api/review/src/review-item-factory.ts:73` |
| 11 | `registerReviewSubscriptions` | yes | `layers/core-api/review/src/session-review-creator.ts:41` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `ReengagementSourceUnavailableError` — `layers/core-api/review/src/proposed-call-workflow.ts:249` (internal)
- (no public member methods)

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `ReviewAgentWorkIntentInput` (type, public) `layers/core-api/review/src/ports.ts:52`
- `ReviewPorts` (interface, public) `layers/core-api/review/src/ports.ts:87` — members: `work`, `conversation`, `users`, `org`, `intentRecorder`, `requireRunnableAgent`, `getBetById`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread`
- `ProposedCallQuery` (type, public) `layers/core-api/review/src/proposed-call-workflow.ts:63`
- `ProposedCallView` (interface, public) `layers/core-api/review/src/proposed-call-workflow.ts:74` — members: `call`, `outcome`, `grant`
- `ReengagementResolverDeps` (interface, internal) `layers/core-api/review/src/proposed-call-workflow.ts:176` — members: `requireRunnableAgent`, `getTaskById`, `getBetById`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread`
- `BakedReengagementRequest` (interface, internal) `layers/core-api/review/src/proposed-call-workflow.ts:252` — members: `defaultAgentId`, `sourceKind`, `sourceId`, `streamId`, `taskId`, `teamId`, `sourceCorrelation`, `contextBundle`, `agentConfig`, `harnessDisabled`, `callingThreadId`
- `ProposedCallTransition` (type, public) `layers/core-api/review/src/proposed-call-workflow.ts:447`
- `CreateReviewItemInput` (interface, public) `layers/core-api/review/src/review-item-factory.ts:29` — members: `knowledgeItemId`, `layer`, `title`, `body`, `riskTier`, `attentionScore`, `reasoning`, `nowMs`
- `CreateReviewItemResult` (interface, public) `layers/core-api/review/src/review-item-factory.ts:43` — members: `itemId`, `threadId`

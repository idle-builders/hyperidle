# Destroyer input — `api-contract` (framework)

Package: `framework/api-contract`
Surface: 1 exported functions, 0 classes (0 member methods), 96 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `isPendingSessionStart` | yes | `framework/api-contract/src/session.ts:15` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `AgentOrchestrationSessionHistoryEntry` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:30` — members: `id`, `sessionId`, `status`
- `AgentOrchestrationSessionActivityEntry` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:46` — members: `type`, `timestamp`, `data`
- `AgentOrchestrationSessionWireRow` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:63` — members: `id`, `taskId`, `requestId`, `sourceKind`, `sourceId`, `sourceCorrelationJson`, `agentId`, `modelTier`, `startedAt`, `endedAt`, `state`, `sandboxSnapshot`, `outcome`, `notes`, `routineId`, `effectivenessScore`, `effectivenessRecordedAt`, `effectivenessRecordedBy`
- `AgentOrchestrationSessionsPort` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:89` — members: `listSessionHistoryBySource`, `getRecentActivity`, `getById`
- `AgentOrchestrationWorkIntentKind` (type, public) `framework/api-contract/src/agent-orchestration-port.ts:130`
- `AgentOrchestrationWorkIntentInput` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:143` — members: `kind`, `sourceKind`, `sourceId`, `requestedBy`, `idempotencyKey`, `bakedRequest`
- `AgentOrchestrationWorkIntentReceipt` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:153` — members: `id`, `idempotencyKey`
- `AgentOrchestrationExplicitStartRequest` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:165` — members: `startId`, `taskId`, `requestedAgentId`, `requestedModelTier`, `requestedBy`, `idempotencyKey`, `intentIdempotencyKey`, `bakedRequest`
- `AgentOrchestrationExplicitStartView` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:185` — members: `id`, `status`, `taskId`, `requestedAgentId`, `requestedModelTier`, `requestedBy`, `idempotencyKey`, `sessionId`, `failureCode`
- `AgentOrchestrationExplicitStartResult` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:197` — members: `start`, `intent`
- `AgentOrchestrationIntentsPort` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:204` — members: `submit`, `createExplicitStart`
- `AgentOrchestrationRequestsPort` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:214` — members: `findExplicitStartByIdempotencyKey`, `findExplicitStartById`, `listPendingIntentsByKind`
- `AgentOrchestrationStoppedRun` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:233` — members: `taskId`, `sessionId`
- `AgentOrchestrationCreateBareRunRequest` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:238` — members: `agentId`, `taskId`, `modelTier`
- `AgentOrchestrationRunsPort` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:258` — members: `stopForTasks`, `endForHandoff`, `createBareRun`, `abort`, `failExplicitStart`
- `AgentOrchestrationRunConfigView` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:274` — members: `systemPrompt`, `harnessType`, `modelTierPreference`, `modelId`, `modelProvider`, `maxConcurrentSessions`
- `AgentOrchestrationRunConfigPatch` (type, public) `framework/api-contract/src/agent-orchestration-port.ts:284`
- `AgentOrchestrationTeamRunConfigDefaultsView` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:289` — members: `defaultHarnessType`, `defaultModelId`, `defaultModelProvider`
- `AgentOrchestrationRunConfigPort` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:296` — members: `read`, `readBatch`, `write`, `readTeamDefaults`, `writeTeamDefaults`
- `AgentOrchestrationFilesystemInjectionView` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:323` — members: `agentUserId`, `filesystemId`, `createdAt`
- `AgentOrchestrationPersistInjectionResult` (type, public) `framework/api-contract/src/agent-orchestration-port.ts:329`
- `AgentOrchestrationFilesystemsPort` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:334` — members: `getTeamId`, `persistInjection`
- `AgentOrchestrationPort` (interface, public) `framework/api-contract/src/agent-orchestration-port.ts:354` — members: `sessions`, `intents`, `requests`, `runs`, `runConfig`, `filesystems`
- `AgentOrchestrationTransport` (type, public) `framework/api-contract/src/agent-orchestration-port.ts:369`
- `AuthMeResponse` (interface, public) `framework/api-contract/src/auth.ts:30` — members: `id`, `name`, `email`, `avatarUrl`
- `CreateBetRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:25` — members: `teamId`, `description`, `doneCondition`, `hypothesis`, `sourceKnowledgeItemId`
- `CreateBetResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:44` — members: `id`, `teamId`, `description`, `doneCondition`, `hypothesis`, `status`, `createdAt`, `revisionLog`, `sourceKnowledgeItemId`
- `TaskView` (interface, public) `framework/api-contract/src/core-api-port.ts:57` — members: `id`, `betId`, `teamId`, `notes`
- `BetView` (interface, public) `framework/api-contract/src/core-api-port.ts:65` — members: `id`, `status`, `description`, `doneCondition`, `hypothesis`
- `UpdateBetRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:79` — members: `description`, `doneCondition`, `hypothesis`
- `CreateTaskRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:86` — members: `betId`, `title`, `description`, `doneCondition`, `ownerAgentId`
- `CreateTaskResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:95` — members: `id`, `betId`, `teamId`
- `ItemView` (interface, public) `framework/api-contract/src/core-api-port.ts:102` — members: `id`, `riskTier`, `kind`, `verb`
- `UpdateItemRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:110` — members: `riskTier`, `kind`, `verb`
- `CreateItemRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:122` — members: `threadId`, `title`, `sourceAgentId`, `layer`, `verb`, `kind`, `body`, `attachments`, `proposedAction`, `options`, `riskTier`, `blocking`, `reasoning`
- `CreateItemResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:139` — members: `id`
- `CreateArtifactRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:149` — members: `producingTaskId`, `kind`, `label`, `preview`
- `CreateArtifactResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:157` — members: `id`, `producingTaskId`, `kind`
- `UserView` (interface, public) `framework/api-contract/src/core-api-port.ts:168` — members: `id`, `name`, `role`, `teamId`
- `HandoffTaskRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:183` — members: `sessionId`, `toAgent`, `toRole`, `toHuman`, `reason`, `artifacts`, `remainingWork`, `contextId`, `status`, `error`
- `HandoffTaskResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:197` — members: `status`, `targetAgentId`, `escalationItemId`
- `CoreApiWorkPort` (interface, public) `framework/api-contract/src/core-api-port.ts:212` — members: `createBet`, `getTaskById`, `getBetById`, `updateBetById`, `createTask`, `appendTaskNote`, `getItemById`, `updateItemById`, `createItem`, `findItemByReasoningMarker`, `createArtifact`, `handoffTask`
- `CoreApiUsersPort` (interface, public) `framework/api-contract/src/core-api-port.ts:232` — members: `getUserById`, `listUsersByTeam`, `findSoleHumanUser`
- `ConversationThreadView` (interface, public) `framework/api-contract/src/core-api-port.ts:252` — members: `id`, `participants`
- `InsertThreadRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:262` — members: `hostKind`, `hostId`, `participants`, `pinned`
- `InsertThreadResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:270` — members: `id`
- `UpdateThreadRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:278` — members: `participants`, `lastActiveAt`, `pinned`
- `ConversationMessageType` (type, public) `framework/api-contract/src/core-api-port.ts:285`
- `InsertMessageRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:292` — members: `threadId`, `type`, `payload`, `clientKey`
- `InsertMessageResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:300` — members: `id`
- `ConversationInboxMessageView` (interface, public) `framework/api-contract/src/core-api-port.ts:305` — members: `id`, `senderId`, `threadId`, `type`, `payload`
- `ConversationInboxRowView` (interface, public) `framework/api-contract/src/core-api-port.ts:314` — members: `participants`, `message`
- `DirectThreadResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:320` — members: `id`
- `CoreApiConversationPort` (interface, public) `framework/api-contract/src/core-api-port.ts:332` — members: `getThreadById`, `insertThread`, `updateThread`, `insertMessage`, `listInboxBySenderExclusion`, `findOrCreateDirectThread`, `getFirstThreadByHost`
- `OrgTeamView` (interface, public) `framework/api-contract/src/core-api-port.ts:346` — members: `id`, `name`
- `OrgTeamMembershipView` (interface, public) `framework/api-contract/src/core-api-port.ts:352` — members: `id`
- `OrgTeamMembersByIdView` (interface, public) `framework/api-contract/src/core-api-port.ts:357` — members: `teamId`
- `CreateOrgTeamRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:366` — members: `id`, `name`, `phase`, `functions`, `factoryDbPath`, `createdAt`, `teamMembersId`, `capacity`, `activeBets`, `formedAt`
- `UpdateOrgTeamRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:383` — members: `phase`, `activeBets`, `leadAgentId`
- `ReviewRecipientsQuery` (interface, public) `framework/api-contract/src/core-api-port.ts:390` — members: `userId`, `agentRole`, `teamId`
- `PersistScaffoldedAgentsResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:397` — members: `agentIds`, `leadAgentId`
- `ProvisionTeamRoutinesRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:409` — members: `teamId`, `ownerByRole`, `leadAgentId`
- `CoreApiOrgPort` (interface, public) `framework/api-contract/src/core-api-port.ts:436` — members: `getTeamById`, `getTeamMembersByTeamId`, `getTeamMembersById`, `createTeam`, `updateTeam`, `resolveReviewRecipientsForItem`, `persistScaffoldedAgents`, `provisionTeamRoutines`
- `InsertRoutineRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:457` — members: `id`, `name`, `description`, `teamId`, `ownerAgentId`, `triggerType`, `triggerConfig`
- `RoutineView` (interface, public) `framework/api-contract/src/core-api-port.ts:472` — members: `name`, `state`, `deletedAt`
- `UpdateRoutineRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:483` — members: `name`, `description`, `state`, `active`, `triggerConfig`
- `CoreApiRoutinePort` (interface, public) `framework/api-contract/src/core-api-port.ts:497` — members: `insertRoutine`, `getRoutineById`, `updateRoutineById`
- `CreateKnowledgeItemRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:511` — members: `layer`, `scopeKind`, `scopeId`, `kind`, `topic`, `title`, `body`, `format`, `status`, `updatedBy`
- `CreateKnowledgeItemResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:525` — members: `id`, `version`
- `UpdateKnowledgeItemContentRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:537` — members: `body`, `updatedBy`, `expectedVersion`
- `UpdateKnowledgeItemContentResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:544` — members: `id`, `version`, `format`
- `UpdateKnowledgeItemContentResult` (type, public) `framework/api-contract/src/core-api-port.ts:558`
- `KnowledgeItemVersionView` (interface, public) `framework/api-contract/src/core-api-port.ts:563` — members: `id`, `version`
- `KnowledgeItemStatusView` (interface, public) `framework/api-contract/src/core-api-port.ts:569` — members: `status`
- `KnowledgeConflictView` (interface, public) `framework/api-contract/src/core-api-port.ts:574` — members: `id`
- `CreateKnowledgeConflictRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:579` — members: `id`, `itemId`, `versionBase`, `versionCurrent`, `proposedBody`, `proposedMeta`, `proposedBy`, `createdAt`
- `PromoteKnowledgeItemRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:591` — members: `knowledgeItemId`, `fromStatus`, `toStatus`, `reason`, `editor`
- `PromoteKnowledgeItemResult` (type, public) `framework/api-contract/src/core-api-port.ts:604`
- `CoreApiKnowledgePort` (interface, public) `framework/api-contract/src/core-api-port.ts:617` — members: `search`, `create`, `updateKnowledgeItemContent`, `findKnowledgeItemVersionById`, `findKnowledgeItemStatusById`, `findOpenConflictByItemAndProposer`, `createKnowledgeConflict`, `promoteKnowledgeItem`, `upsertKnowledgeAppProjectionAttentionScore`, `recomputeAttentionScoreForItem`
- `CaptureProposedCallRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:695` — members: `originSessionId`, `taskId`, `agentId`, `toolId`, `args`, `hash`, `reviewMessageId`, `subjectThreadId`, `artifactId`
- `CaptureProposedCallResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:707` — members: `firstCapture`
- `ConsumeTailoredGrantRequest` (interface, public) `framework/api-contract/src/core-api-port.ts:711` — members: `taskId`, `agentId`, `toolId`
- `ConsumeTailoredGrantResponse` (interface, public) `framework/api-contract/src/core-api-port.ts:717` — members: `proposedCallId`
- `ProposedCallOutcomeResult` (type, public) `framework/api-contract/src/core-api-port.ts:721`
- `CoreApiReviewPort` (interface, public) `framework/api-contract/src/core-api-port.ts:725` — members: `captureProposedCall`, `consumeTailoredGrant`, `recordOutcome`
- `CoreApiPort` (interface, public) `framework/api-contract/src/core-api-port.ts:741` — members: `work`, `users`, `conversation`, `org`, `routine`, `knowledge`, `review`
- `CoreApiTransport` (type, public) `framework/api-contract/src/core-api-port.ts:773`
- `PendingSessionStart` (interface, public) `framework/api-contract/src/session.ts:1` — members: `status`, `startId`, `taskId`, `requestedAgentId`, `requestedModelTier`, `idempotencyKey`, `pollUrl`
- `CreateSessionAcceptedResponse` (type, public) `framework/api-contract/src/session.ts:11`
- `AutonomyLevel` (type, public) `framework/api-contract/src/settings.ts:15`
- `SettingsProfile` (interface, public) `framework/api-contract/src/settings.ts:18` — members: `name`, `email`, `avatarUrl`
- `SettingsTeam` (interface, public) `framework/api-contract/src/settings.ts:30` — members: `id`, `name`, `active`
- `SettingsUser` (interface, public) `framework/api-contract/src/settings.ts:38` — members: `id`, `name`, `autonomyLevel`, `paused`
- `SettingsAgent` (type, public) `framework/api-contract/src/settings.ts:49`
- `SettingsNotifications` (interface, public) `framework/api-contract/src/settings.ts:52` — members: `reviewAlerts`, `blockerAlerts`, `quietHoursStart`, `quietHoursEnd`, `mutedTeams`
- `SettingsResponse` (interface, public) `framework/api-contract/src/settings.ts:65` — members: `profile`, `teams`, `users`, `notifications`

## D. Const / enum exports

- `CORE_API_ACTOR_OVERRIDE_HEADER` (const, public) `framework/api-contract/src/core-api-port.ts:760`

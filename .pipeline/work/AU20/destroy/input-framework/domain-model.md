# Destroyer input — `domain-model` (framework)

Package: `framework/domain-model`
Surface: 48 exported functions, 12 classes (0 member methods), 236 interface/type declarations, 99 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `isAgentBehaviorConfigKind` | yes | `framework/domain-model/src/agent-behavior-config.ts:94` |
| 2 | `findRoleCatalogEntry` | yes | `framework/domain-model/src/agent-roles.ts:203` |
| 3 | `roleLabel` | yes | `framework/domain-model/src/agent-roles.ts:220` |
| 4 | `communityForRole` | yes | `framework/domain-model/src/agent-roles.ts:242` |
| 5 | `defaultRoster` | yes | `framework/domain-model/src/agent-roles.ts:251` |
| 6 | `computeHealthSignals` | yes | `framework/domain-model/src/agent-run-view.ts:89` |
| 7 | `deriveHealthLevel` | yes | `framework/domain-model/src/agent-run-view.ts:156` |
| 8 | `deriveHealthDetail` | yes | `framework/domain-model/src/agent-run-view.ts:173` |
| 9 | `isAgentWorkIntentKind` | yes | `framework/domain-model/src/agent-work-intent-kinds.ts:8` |
| 10 | `isAgentWorkIntentSourceKind` | yes | `framework/domain-model/src/agent-work-intent-kinds.ts:22` |
| 11 | `isConfigurationKind` | yes | `framework/domain-model/src/configuration.ts:13` |
| 12 | `isPluginState` | yes | `framework/domain-model/src/configuration.ts:20` |
| 13 | `isConnectionAuthSource` | yes | `framework/domain-model/src/connection.ts:54` |
| 14 | `isHeldAuthSource` | yes | `framework/domain-model/src/connection.ts:87` |
| 15 | `isCredentialName` | yes | `framework/domain-model/src/credential.ts:68` |
| 16 | `credentialNameForProvider` | yes | `framework/domain-model/src/credential.ts:91` |
| 17 | `isHintId` | yes | `framework/domain-model/src/hint.ts:67` |
| 18 | `getKindDefinition` | yes | `framework/domain-model/src/kinds/registry.ts:271` |
| 19 | `isRegisteredKind` | yes | `framework/domain-model/src/kinds/registry.ts:279` |
| 20 | `scopeToLayer` | yes | `framework/domain-model/src/knowledge.ts:16` |
| 21 | `extractMentionCandidates` | yes | `framework/domain-model/src/mention.ts:72` |
| 22 | `resolveMentions` | yes | `framework/domain-model/src/mention.ts:120` |
| 23 | `segmentMentions` | yes | `framework/domain-model/src/mention.ts:163` |
| 24 | `isCatalogModel` | yes | `framework/domain-model/src/model-gateway.ts:140` |
| 25 | `catalogEntry` | yes | `framework/domain-model/src/model-gateway.ts:145` |
| 26 | `urgencyForType` | yes | `framework/domain-model/src/notifications.ts:72` |
| 27 | `shortLabelForType` | yes | `framework/domain-model/src/notifications.ts:82` |
| 28 | `buildSessionLifecycleCorrelation` | yes | `framework/domain-model/src/session-request.ts:126` |
| 29 | `canTransitionTaskState` | yes | `framework/domain-model/src/task-transition.ts:15` |
| 30 | `exhaustiveAssert` | yes | `framework/domain-model/src/thread.ts:251` |
| 31 | `isRedactedPayload` | yes | `framework/domain-model/src/thread.ts:263` |
| 32 | `classifyThreadConfiguration` | yes | `framework/domain-model/src/thread.ts:286` |
| 33 | `headCollapsePredicate` | yes | `framework/domain-model/src/thread.ts:313` |
| 34 | `isBlocking` | yes | `framework/domain-model/src/thread.ts:340` |
| 35 | `promotedRichMessageId` | yes | `framework/domain-model/src/thread.ts:368` |
| 36 | `verdictDecisionLabel` | yes | `framework/domain-model/src/thread.ts:395` |
| 37 | `verdictDecisionToStatus` | yes | `framework/domain-model/src/thread.ts:413` |
| 38 | `isTriggerEventType` | yes | `framework/domain-model/src/trigger.ts:52` |
| 39 | `summarizePreview` | yes | `framework/domain-model/src/types/artifact.ts:90` |
| 40 | `artifactDisplayTitle` | yes | `framework/domain-model/src/types/artifact.ts:108` |
| 41 | `scaleForCurrency` | yes | `framework/domain-model/src/types/money.ts:29` |
| 42 | `zeroMoney` | yes | `framework/domain-model/src/types/money.ts:73` |
| 43 | `moneyFromWire` | yes | `framework/domain-model/src/types/money.ts:78` |
| 44 | `moneyToWire` | yes | `framework/domain-model/src/types/money.ts:83` |
| 45 | `addMoney` | yes | `framework/domain-model/src/types/money.ts:88` |
| 46 | `compareMoney` | yes | `framework/domain-model/src/types/money.ts:96` |
| 47 | `totalTokens` | yes | `framework/domain-model/src/types/money.ts:108` |
| 48 | `addTokenUsage` | yes | `framework/domain-model/src/types/money.ts:124` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `InvalidTransitionError` — `framework/domain-model/src/errors.ts:1` (public)
- (no public member methods)

### `VersionConflictError` — `framework/domain-model/src/errors.ts:11` (public)
- (no public member methods)

### `CapacityExceededError` — `framework/domain-model/src/errors.ts:22` (public)
- (no public member methods)

### `ConcurrencyLimitError` — `framework/domain-model/src/errors.ts:32` (public)
- (no public member methods)

### `MissingCredentialError` — `framework/domain-model/src/errors.ts:42` (public)
- (no public member methods)

### `TargetAgentNotRunnableError` — `framework/domain-model/src/errors.ts:61` (public)
- (no public member methods)

### `ActiveRoutinesError` — `framework/domain-model/src/errors.ts:68` (public)
- (no public member methods)

### `NoEligibleHarnessError` — `framework/domain-model/src/errors.ts:87` (public)
- (no public member methods)

### `ProviderTimeoutError` — `framework/domain-model/src/errors.ts:106` (public)
- (no public member methods)

### `HttpError` — `framework/domain-model/src/errors.ts:140` (public)
- (no public member methods)

### `CassetteMissError` — `framework/domain-model/src/errors.ts:160` (public)
- (no public member methods)

### `TaskInvalidTransitionError` — `framework/domain-model/src/task-transition.ts:19` (public)
- (no public member methods)

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `AgentBehaviorConfigKind` (type, public) `framework/domain-model/src/agent-behavior-config.ts:1`
- `AgentBehaviorOriginType` (type, public) `framework/domain-model/src/agent-behavior-config.ts:2`
- `AgentBehaviorOriginState` (type, public) `framework/domain-model/src/agent-behavior-config.ts:3`
- `AgentBehaviorValueSource` (type, public) `framework/domain-model/src/agent-behavior-config.ts:4`
- `AgentBehaviorPromptSource` (type, public) `framework/domain-model/src/agent-behavior-config.ts:5`
- `AgentBehaviorFieldKind` (type, public) `framework/domain-model/src/agent-behavior-config.ts:6`
- `AgentBehaviorLinkTarget` (type, internal) `framework/domain-model/src/agent-behavior-config.ts:7`
- `AgentBehaviorOriginView` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:14` — members: `type`, `label`, `state`
- `AgentBehaviorEditableField` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:20` — members: `id`, `label`, `kind`, `value`, `options`, `placeholder`, `required`, `maxLength`, `helpText`
- `AgentBehaviorConfigLink` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:32` — members: `target`, `label`, `href`
- `AgentBehaviorTriggerSummary` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:38` — members: `occasionKind`, `sourceId`, `selectedAgentLabel`, `promptSource`, `ownershipLabel`
- `AgentBehaviorConfigView` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:46` — members: `id`, `kind`, `name`, `description`, `origin`, `valueSource`, `activeSummary`, `defaultSummary`, `statusLabel`, `active`, `editableFields`, `links`, `trigger`
- `AgentBehaviorConfigListResponse` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:62` — members: `items`
- `AgentBehaviorConfigPatchRequest` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:66` — members: `fields`
- `AgentBehaviorConfigPatchResponse` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:70` — members: `item`
- `AgentBehaviorConfigErrorResponse` (interface, public) `framework/domain-model/src/agent-behavior-config.ts:74` — members: `error`, `code`
- `AgentActiveSession` (interface, public) `framework/domain-model/src/agent-profile.ts:24` — members: `sessionId`, `taskId`, `betId`, `startedAt`
- `AgentSessionSummary` (interface, public) `framework/domain-model/src/agent-profile.ts:40` — members: `sessionId`, `taskId`, `taskTitle`, `outcome`, `startedAt`, `endedAt`
- `AgentPerformanceStats` (interface, public) `framework/domain-model/src/agent-profile.ts:53` — members: `totalSessions`, `successCount`, `successRate`
- `AgentHealthSignals` (interface, public) `framework/domain-model/src/agent-profile.ts:67` — members: `failureRate7d`, `lastSessionCrashed`, `harnessAvailable`, `idleDurationMs`, `degraded`
- `AgentHarnessCapabilities` (interface, public) `framework/domain-model/src/agent-profile.ts:96` — members: `toolUse`, `mcpSupport`, `fileEditing`, `subAgents`
- `AgentVerdictEntry` (interface, public) `framework/domain-model/src/agent-profile.ts:107` — members: `decision`, `threadId`, `createdAt`
- `AgentReviewTrackRecord` (interface, public) `framework/domain-model/src/agent-profile.ts:117` — members: `approvalRate`, `totalVerdicts`, `recentVerdicts`, `windowDays`
- `AgentProfileResponse` (interface, public) `framework/domain-model/src/agent-profile.ts:134` — members: `id`, `name`, `role`, `agentCategory`, `teamName`, `teamId`, `createdAt`, `systemPrompt`, `harnessType`, `modelTierPreference`, `maxConcurrentSessions`, `mcpSetup`, `harnessAvailable`, `harnessCapabilities`, `reviewTrackRecord`
- `AgentRoleCatalogEntry` (interface, public) `framework/domain-model/src/agent-roles.ts:8` — members: `role`, `label`, `category`, `description`, `community`, `teamFunctions`, `hasTemplate`
- `TeamFunction` (type, public) `framework/domain-model/src/agent-roles.ts:32`
- `AgentRunSummary` (interface, public) `framework/domain-model/src/agent-run-view.ts:25` — members: `id`, `agentId`, `taskId`, `startedAt`, `endedAt`, `state`, `outcome`, `effectivenessScore`
- `AgentRunsResponse` (interface, public) `framework/domain-model/src/agent-run-view.ts:38` — members: `runs`
- `AgentRunActiveCountsResponse` (interface, public) `framework/domain-model/src/agent-run-view.ts:46` — members: `counts`
- `AgentRunLatestOutcomesResponse` (interface, public) `framework/domain-model/src/agent-run-view.ts:54` — members: `outcomes`
- `HealthSignalInput` (interface, public) `framework/domain-model/src/agent-run-view.ts:66` — members: `sessions`, `harnessAvailable`
- `ApiErrorResponse` (interface, public) `framework/domain-model/src/api-types.ts:2` — members: `error`, `code`, `details`
- `ApiErrorCode` (type, public) `framework/domain-model/src/api-types.ts:28`
- `InviteRole` (type, public) `framework/domain-model/src/auth.ts:11`
- `BlockKind` (type, public) `framework/domain-model/src/blocks/types.ts:18`
- `BlockHostKind` (type, public) `framework/domain-model/src/blocks/types.ts:28`
- `BlockId` (type, public) `framework/domain-model/src/blocks/types.ts:34`
- `BlockAnchor` (interface, public) `framework/domain-model/src/blocks/types.ts:47` — members: `blockId`
- `InlineNode` (type, public) `framework/domain-model/src/blocks/types.ts:51`
- `ListItem` (interface, public) `framework/domain-model/src/blocks/types.ts:59` — members: `children`
- `BlockPayload` (type, public) `framework/domain-model/src/blocks/types.ts:63`
- `Block` (interface, public) `framework/domain-model/src/blocks/types.ts:94` — members: `id`, `kind`, `source`, `payload`, `anchor`, `order`
- `BlockDerivationResult` (interface, public) `framework/domain-model/src/blocks/types.ts:108` — members: `blocks`
- `ConfigurationKind` (type, public) `framework/domain-model/src/configuration.ts:11`
- `PluginState` (type, public) `framework/domain-model/src/configuration.ts:18`
- `ConfigurationOriginType` (type, public) `framework/domain-model/src/configuration.ts:24`
- `ConfigurationValueSource` (type, public) `framework/domain-model/src/configuration.ts:25`
- `ConfigurationOrigin` (interface, public) `framework/domain-model/src/configuration.ts:29` — members: `type`, `pluginId`, `pluginName`, `pluginState`, `defaultVersionHash`
- `ResolvedConfigurationItem` (interface, public) `framework/domain-model/src/configuration.ts:37` — members: `kind`, `key`, `activeValue`, `defaultValue`, `userValue`, `valueSource`, `origin`, `active`
- `ConnectionAuthSource` (type, public) `framework/domain-model/src/connection.ts:17`
- `ConnectionHealth` (type, public) `framework/domain-model/src/connection.ts:21`
- `HeldAuthSource` (type, public) `framework/domain-model/src/connection.ts:28`
- `ServiceConnectionView` (interface, public) `framework/domain-model/src/connection.ts:40` — members: `id`, `service`, `via`, `authSource`, `health`, `removable`
- `InheritedConnectionFact` (interface, public) `framework/domain-model/src/connection.ts:76` — members: `name`, `kind`, `source`, `health`
- `CredentialName` (type, public) `framework/domain-model/src/credential.ts:20`
- `CredentialState` (type, public) `framework/domain-model/src/credential.ts:25`
- `CredentialCatalogEntry` (interface, public) `framework/domain-model/src/credential.ts:28` — members: `name`, `label`, `description`, `required`, `testable`
- `AgentWorkIntentKind` (type, public) `framework/domain-model/src/events.ts:23`
- `AgentWorkIntentSourceKind` (type, public) `framework/domain-model/src/events.ts:33`
- `AgentWorkIntentEvent` (interface, public) `framework/domain-model/src/events.ts:41` — members: `type`, `streamId`, `intentId`, `intentKind`, `sourceKind`, `sourceId`, `idempotencyKey`, `timestamp`
- `AgentRunAdmissionFailureCode` (type, public) `framework/domain-model/src/events.ts:52`
- `AgentRunAdmissionFailedEvent` (interface, public) `framework/domain-model/src/events.ts:68` — members: `type`, `streamId`, `intentId`, `kind`, `sourceKind`, `sourceId`, `failureCode`, `terminal`, `timestamp`
- `AgentRunLifecycleChangedEvent` (interface, public) `framework/domain-model/src/events.ts:80` — members: `type`, `streamId`, `requestId`, `sourceKind`, `sourceId`, `state`, `sessionId`, `timestamp`
- `TaskStateChangedEvent` (interface, public) `framework/domain-model/src/events.ts:93` — members: `type`, `streamId`, `taskId`, `fromState`, `toState`, `timestamp`
- `BetStateChangedEvent` (interface, public) `framework/domain-model/src/events.ts:102` — members: `type`, `streamId`, `betId`, `fromState`, `toState`, `timestamp`
- `ItemCreatedEvent` (interface, public) `framework/domain-model/src/events.ts:111` — members: `type`, `streamId`, `itemId`, `conversationId`, `kind`, `timestamp`
- `SessionStartedEvent` (interface, public) `framework/domain-model/src/events.ts:120` — members: `type`, `streamId`, `sessionId`, `agentId`, `taskId`, `requestId`, `sourceKind`, `sourceId`, `sourceCorrelation`, `timestamp`
- `SessionOutcome` (type, public) `framework/domain-model/src/events.ts:139`
- `SessionEndedEvent` (interface, public) `framework/domain-model/src/events.ts:141` — members: `type`, `streamId`, `sessionId`, `agentId`, `taskId`, `requestId`, `sourceKind`, `sourceId`, `sourceCorrelation`, `timestamp`, `outcome`, `routineRunOutcome`, `tokensByTier`
- `SessionHandoffCompletedEvent` (interface, public) `framework/domain-model/src/events.ts:202` — members: `type`, `streamId`, `sessionId`, `requestedBy`, `timestamp`
- `SessionNotReturnedEvent` (interface, public) `framework/domain-model/src/events.ts:220` — members: `type`, `streamId`, `sessionId`, `agentId`, `taskId`, `requestId`, `sourceKind`, `sourceId`, `sourceCorrelation`, `callingThreadId`, `timestamp`
- `NotificationEvent` (interface, public) `framework/domain-model/src/events.ts:242` — members: `type`, `streamId`, `targetId`, `message`, `timestamp`, `kind`
- `KnowledgeUpdatedEvent` (interface, public) `framework/domain-model/src/events.ts:278` — members: `type`, `streamId`, `itemId`, `action`, `timestamp`
- `KnowledgeCreatedEvent` (interface, public) `framework/domain-model/src/events.ts:286` — members: `type`, `streamId`, `itemId`, `timestamp`
- `KnowledgeArchivedEvent` (interface, public) `framework/domain-model/src/events.ts:293` — members: `type`, `streamId`, `itemId`, `timestamp`
- `KnowledgeAccessedEvent` (interface, public) `framework/domain-model/src/events.ts:300` — members: `type`, `streamId`, `itemId`, `accessorKind`, `accessorId`, `timestamp`
- `RoutineFiredEvent` (interface, public) `framework/domain-model/src/events.ts:309` — members: `type`, `streamId`, `routineId`, `agentId`, `timestamp`
- `DependencyMetEvent` (interface, public) `framework/domain-model/src/events.ts:317` — members: `type`, `streamId`, `taskId`, `dependencyId`, `timestamp`
- `SandboxWritebackChange` (interface, public) `framework/domain-model/src/events.ts:326` — members: `type`, `relativePath`, `fullPath`
- `SandboxWritebackChangesDetectedEvent` (interface, public) `framework/domain-model/src/events.ts:342` — members: `type`, `streamId`, `sessionId`, `sandboxPath`, `manifestPath`, `changes`, `timestamp`
- `BetRevisedEvent` (interface, public) `framework/domain-model/src/events.ts:352` — members: `type`, `streamId`, `betId`, `field`, `timestamp`
- `ToolCallRecordedEvent` (interface, public) `framework/domain-model/src/events.ts:370` — members: `type`, `streamId`, `sessionId`, `toolName`, `argsSummary`, `timestamp`
- `ThreadCreatedEvent` (interface, public) `framework/domain-model/src/events.ts:381` — members: `type`, `streamId`, `threadId`, `hostKind`, `hostId`, `initiatorId`, `timestamp`
- `ThreadMessageAppendedEvent` (interface, public) `framework/domain-model/src/events.ts:391` — members: `type`, `streamId`, `threadId`, `messageId`, `messageType`, `senderId`, `timestamp`
- `ThreadResolvedEvent` (interface, public) `framework/domain-model/src/events.ts:401` — members: `type`, `streamId`, `threadId`, `resolvedByMessageId`, `timestamp`
- `ThreadReopenedEvent` (interface, public) `framework/domain-model/src/events.ts:409` — members: `type`, `streamId`, `threadId`, `reopenedByMessageId`, `timestamp`
- `ThreadArchivedEvent` (interface, public) `framework/domain-model/src/events.ts:417` — members: `type`, `streamId`, `threadId`, `timestamp`
- `ArtifactCreatedEvent` (interface, public) `framework/domain-model/src/events.ts:433` — members: `type`, `streamId`, `artifactId`, `taskId`, `kind`, `timestamp`
- `PropagationAppliedEvent` (interface, public) `framework/domain-model/src/events.ts:454` — members: `type`, `streamId`, `sourceLevel`, `sourceId`, `targetLevel`, `targetId`, `targetTransition`, `timestamp`
- `PropagationFailedEvent` (interface, public) `framework/domain-model/src/events.ts:467` — members: `type`, `streamId`, `sourceLevel`, `sourceId`, `targetLevel`, `targetId`, `failureReason`, `attempts`, `timestamp`
- `WorkSelectionRequestedEvent` (interface, public) `framework/domain-model/src/events.ts:495` — members: `type`, `streamId`, `teamId`, `surface`, `workKey`, `roleHint`, `at`
- `TeamCreatedEvent` (interface, public) `framework/domain-model/src/events.ts:511` — members: `type`, `streamId`, `teamId`, `teamMembersId`, `functions`, `agentIds`, `at`
- `AgentAddedEvent` (interface, public) `framework/domain-model/src/events.ts:527` — members: `type`, `streamId`, `teamId`, `teamMembersId`, `agentId`, `role`, `at`
- `UserCreatedEvent` (interface, public) `framework/domain-model/src/events.ts:543` — members: `type`, `streamId`, `userId`, `assistantAgentId`, `at`
- `ProposedCallExecutedEvent` (interface, public) `framework/domain-model/src/events.ts:559` — members: `type`, `streamId`, `proposedCallId`, `reviewMessageId`, `status`, `timestamp`
- `ProposedCallGrantedEvent` (interface, public) `framework/domain-model/src/events.ts:576` — members: `type`, `streamId`, `proposedCallId`, `taskId`, `agentId`, `timestamp`
- `KernelEvent` (type, public) `framework/domain-model/src/events.ts:595`
- `StrategyEvent` (type, public) `framework/domain-model/src/events.ts:634`
- `DomainEvent` (type, public) `framework/domain-model/src/events.ts:642`
- `EventType` (type, public) `framework/domain-model/src/events.ts:645`
- `WildcardType` (type, public) `framework/domain-model/src/events.ts:648`
- `EventByType` (type, public) `framework/domain-model/src/events.ts:651`
- `EventHandler` (type, public) `framework/domain-model/src/events.ts:654`
- `WildcardHandler` (type, public) `framework/domain-model/src/events.ts:657`
- `HintId` (type, public) `framework/domain-model/src/hint.ts:14`
- `HintCatalogEntry` (interface, public) `framework/domain-model/src/hint.ts:22` — members: `id`, `copy`, `testId`
- `OldKindMapping` (interface, internal) `framework/domain-model/src/kinds/old-kind-map.ts:11` — members: `kind`, `label`
- `KindDefinition` (interface, internal) `framework/domain-model/src/kinds/registry.ts:17` — members: `kind`, `previewSchema`, `displayTitle`, `summarize`
- `TextPreview` (type, public) `framework/domain-model/src/kinds/registry.ts:37`
- `CodePreview` (type, public) `framework/domain-model/src/kinds/registry.ts:77`
- `ImagePreview` (type, public) `framework/domain-model/src/kinds/registry.ts:114`
- `DataPreview` (type, public) `framework/domain-model/src/kinds/registry.ts:154`
- `HtmlPreview` (type, public) `framework/domain-model/src/kinds/registry.ts:184`
- `UrlPreview` (type, public) `framework/domain-model/src/kinds/registry.ts:218`
- `ArtifactKind` (type, public) `framework/domain-model/src/kinds/registry.ts:265`
- `KnowledgeLayer` (type, public) `framework/domain-model/src/knowledge.ts:4`
- `KnowledgeStatus` (type, public) `framework/domain-model/src/knowledge.ts:29`
- `KnowledgeKind` (type, public) `framework/domain-model/src/knowledge.ts:41`
- `KnowledgeScope` (type, public) `framework/domain-model/src/knowledge.ts:52`
- `KnowledgeTopicHealth` (type, public) `framework/domain-model/src/knowledge.ts:55`
- `KnowledgeAccessorKind` (type, public) `framework/domain-model/src/knowledge.ts:57`
- `KnowledgeRelevanceSignals` (interface, public) `framework/domain-model/src/knowledge.ts:59` — members: `recency`, `accessCount30d`, `citationCount`
- `KnowledgeSortOption` (type, public) `framework/domain-model/src/knowledge.ts:66`
- `RiskTier` (type, public) `framework/domain-model/src/knowledge.ts:68`
- `AutonomyLevel` (type, public) `framework/domain-model/src/knowledge.ts:69`
- `PropagationLevel` (type, public) `framework/domain-model/src/knowledge.ts:71`
- `PropagationStatus` (type, public) `framework/domain-model/src/knowledge.ts:72`
- `PropagationResult` (interface, public) `framework/domain-model/src/knowledge.ts:74` — members: `sourceLevel`, `sourceId`, `targetLevel`, `targetId`, `targetTransition`, `status`, `failureReason`
- `MentionCandidate` (interface, public) `framework/domain-model/src/mention.ts:38` — members: `sourceText`, `name`, `offset`
- `ResolvedMention` (interface, public) `framework/domain-model/src/mention.ts:47` — members: `identityId`, `displayName`, `sourceText`
- `MentionSegment` (interface, public) `framework/domain-model/src/mention.ts:53` — members: `type`, `content`, `mentionRef`
- `ModelProvider` (type, public) `framework/domain-model/src/model-gateway.ts:23`
- `ModelTierConfig` (interface, public) `framework/domain-model/src/model-gateway.ts:36` — members: `provider`, `model`, `baseUrl`
- `ModelGatewayConfig` (type, public) `framework/domain-model/src/model-gateway.ts:47`
- `ResolvedModel` (interface, public) `framework/domain-model/src/model-gateway.ts:53` — members: `provider`, `model`, `apiKey`, `baseUrl`
- `ModelCatalogEntry` (interface, public) `framework/domain-model/src/model-gateway.ts:65` — members: `id`, `label`, `provider`, `contextWindow`
- `ModelRequest` (type, public) `framework/domain-model/src/model-gateway.ts:157`
- `NotificationUrgency` (type, public) `framework/domain-model/src/notifications.ts:20`
- `NotificationTypeKey` (type, public) `framework/domain-model/src/notifications.ts:23`
- `NotificationType` (interface, public) `framework/domain-model/src/notifications.ts:26` — members: `key`, `label`, `shortLabel`, `description`, `defaultUrgency`
- `ProposedCallStatus` (type, public) `framework/domain-model/src/proposed-call.ts:25`
- `Reversibility` (type, public) `framework/domain-model/src/proposed-call.ts:30`
- `ProposedCall` (interface, public) `framework/domain-model/src/proposed-call.ts:36` — members: `id`, `reviewMessageId`, `subjectThreadId`, `artifactId`, `originSessionId`, `toolId`, `args`, `identityHash`, `reversibility`, `status`
- `RoutineState` (type, public) `framework/domain-model/src/routine.ts:17`
- `RoutineRunOutcome` (type, public) `framework/domain-model/src/routine.ts:34`
- `RoutineCardSummary` (interface, public) `framework/domain-model/src/routine.ts:48` — members: `id`, `name`, `state`, `scheduleLabel`, `agentName`, `agentInitials`, `lastRunAt`, `lastRunOutcome`, `nextRunAt`
- `RoutineRunSummary` (interface, public) `framework/domain-model/src/routine.ts:66` — members: `id`, `startedAt`, `endedAt`, `durationSeconds`, `outcome`, `errorMessage`, `summary`
- `RoutineInfo` (interface, public) `framework/domain-model/src/routine.ts:82` — members: `id`, `name`, `description`, `state`, `triggerType`, `triggerConfig`, `scheduleLabel`, `ownerAgentId`, `agentName`, `agentInitials`, `teamId`, `teamName`, `autonomyLevel`, `humanReview`, `delegationAllowed`, `lastRunAt`, `lastRunOutcome`, `nextRunAt`, `createdAt`, `lastRunSummary`, `silent`
- `RoutineDetail` (interface, public) `framework/domain-model/src/routine.ts:111` — members: `routine`, `runs`
- `RoutineCreatePayload` (interface, public) `framework/domain-model/src/routine.ts:119` — members: `name`, `description`, `teamId`, `ownerAgentId`, `triggerType`, `triggerConfig`
- `ToolCallData` (type, public) `framework/domain-model/src/session-activity.ts:28` — members: `toolName`, `argsSummary`, `toolKind`, `verb`, `target`, `status`, `output`, `diff`, `opensSession`
- `ReasoningData` (type, public) `framework/domain-model/src/session-activity.ts:51` — members: `durationMs`, `text`, `excerpt`
- `AnswerDeltaData` (type, public) `framework/domain-model/src/session-activity.ts:66` — members: `text`
- `AnswerSettledData` (type, public) `framework/domain-model/src/session-activity.ts:71` — members: `text`
- `HumanMessageData` (type, public) `framework/domain-model/src/session-activity.ts:76` — members: `text`, `author`
- `ActivityEntry` (type, public) `framework/domain-model/src/session-activity.ts:89`
- `AgentSessionSourceKind` (type, public) `framework/domain-model/src/session-request.ts:34`
- `AgentSessionPromptMode` (type, public) `framework/domain-model/src/session-request.ts:35`
- `AgentSessionRequestStatus` (type, public) `framework/domain-model/src/session-request.ts:36`
- `AgentSessionRequestInput` (type, public) `framework/domain-model/src/session-request.ts:116`
- `AgentSessionSourceCorrelation` (type, public) `framework/domain-model/src/session-request.ts:117`
- `SessionLifecycleCorrelation` (interface, public) `framework/domain-model/src/session-request.ts:119` — members: `requestId`, `sourceKind`, `sourceId`, `sourceCorrelation`
- `TeamStatus` (type, public) `framework/domain-model/src/team.ts:34`
- `TeamSummary` (interface, public) `framework/domain-model/src/team.ts:36` — members: `id`, `name`, `phase`, `status`, `leadAgentId`
- `AgentOperationalStatus` (type, public) `framework/domain-model/src/team.ts:45`
- `AgentHealthLevel` (type, public) `framework/domain-model/src/team.ts:48`
- `RosterMember` (interface, public) `framework/domain-model/src/team.ts:50` — members: `agentId`, `name`, `role`, `isLead`, `agentCategory`, `harnessAvailable`
- `TeamBurn` (interface, public) `framework/domain-model/src/team.ts:79` — members: `capacity`, `activeBets`
- `BetCardSummary` (interface, public) `framework/domain-model/src/team.ts:84` — members: `id`, `descriptionTitle`, `status`, `progressDone`, `progressTotal`
- `TeamDetail` (interface, public) `framework/domain-model/src/team.ts:94` — members: `team`, `teamMembers`, `roster`, `burn`, `activeBets`, `routines`
- `TeamListItem` (interface, public) `framework/domain-model/src/team.ts:108` — members: `activeBets`, `shipped`, `shipRate`, `progress`, `routineCount`, `agentCount`
- `TeamListResponse` (interface, public) `framework/domain-model/src/team.ts:125` — members: `teams`
- `PrimaryHarnessConfig` (interface, public) `framework/domain-model/src/team.ts:133` — members: `harnessType`, `modelId`, `modelProvider`
- `CreateTeamRequest` (interface, public) `framework/domain-model/src/team.ts:139` — members: `name`, `repoPath`, `functions`, `buildingContext`, `userId`, `primaryHarness`
- `CreateTeamResponse` (interface, public) `framework/domain-model/src/team.ts:156` — members: `team`, `teamMembers`
- `HostKind` (type, public) `framework/domain-model/src/thread.ts:29`
- `MessageType` (type, public) `framework/domain-model/src/thread.ts:32`
- `VerdictDecision` (type, public) `framework/domain-model/src/thread.ts:41`
- `ArtifactViewShape` (type, public) `framework/domain-model/src/thread.ts:55`
- `ThreadId` (type, public) `framework/domain-model/src/thread.ts:62`
- `MessageId` (type, public) `framework/domain-model/src/thread.ts:63`
- `IdentityId` (type, public) `framework/domain-model/src/thread.ts:64`
- `Thread` (interface, public) `framework/domain-model/src/thread.ts:68` — members: `id`, `hostKind`, `hostId`, `initiatorId`, `participants`, `pinned`, `resolvedAt`, `lastActiveAt`, `createdAt`
- `AnchorRef` (interface, public) `framework/domain-model/src/thread.ts:80` — members: `artifactId`, `blockId`, `spotLabel`
- `InlineRefKind` (type, public) `framework/domain-model/src/thread.ts:102`
- `EntityRef` (interface, public) `framework/domain-model/src/thread.ts:111` — members: `kind`, `id`
- `BlockRef` (interface, public) `framework/domain-model/src/thread.ts:116` — members: `kind`, `blockId`, `hostKind`, `hostId`
- `MentionRef` (interface, public) `framework/domain-model/src/thread.ts:133` — members: `kind`, `identityId`, `displayName`, `sourceText`
- `InlineRef` (type, public) `framework/domain-model/src/thread.ts:140`
- `ArtifactRef` (interface, public) `framework/domain-model/src/thread.ts:142` — members: `id`, `kind`
- `ToolCallSummary` (interface, public) `framework/domain-model/src/thread.ts:151` — members: `name`, `input`, `output`, `status`
- `AssistantNotice` (interface, public) `framework/domain-model/src/thread.ts:169` — members: `kind`, `code`
- `PlainPayload` (interface, public) `framework/domain-model/src/thread.ts:175` — members: `text`, `refs`, `toolCalls`, `notice`
- `ReviewPayload` (interface, public) `framework/domain-model/src/thread.ts:195` — members: `title`, `reasoning`, `artifactRef`
- `QuestionnairePayload` (interface, public) `framework/domain-model/src/thread.ts:201` — members: `title`, `question`, `options`
- `VerdictPayload` (interface, public) `framework/domain-model/src/thread.ts:207` — members: `decision`, `resolvesMessageId`, `note`
- `RedactedPayload` (interface, public) `framework/domain-model/src/thread.ts:213` — members: `redacted`, `redactedBy`, `redactedAt`, `reason`
- `Message` (type, public) `framework/domain-model/src/thread.ts:231`
- `ThreadConfiguration` (type, public) `framework/domain-model/src/thread.ts:274`
- `HeadCollapseResult` (interface, public) `framework/domain-model/src/thread.ts:300` — members: `headMessageId`
- `AgentSessionStateSnapshot` (interface, public) `framework/domain-model/src/thread.ts:327` — members: `pausedOnThreadId`, `activeForThreadId`
- `ArtifactThreadSummary` (interface, public) `framework/domain-model/src/thread.ts:449` — members: `artifactId`, `artifactKind`, `artifactTitle`, `threadId`, `messageCount`, `lastMessageAt`, `lastMessageSnippet`, `hasUnresolvedReview`
- `ArtifactThreadSummaryResponse` (interface, public) `framework/domain-model/src/thread.ts:471` — members: `summaries`, `totalCount`, `truncated`
- `PlainPayloadWithBlockId` (interface, public) `framework/domain-model/src/thread.ts:484` — members: `text`, `refs`, `blockId`, `spotLabel`
- `TriggerEventType` (type, public) `framework/domain-model/src/trigger.ts:13`
- `TriggerResultState` (type, public) `framework/domain-model/src/trigger.ts:16`
- `TriggerRuleValue` (type, public) `framework/domain-model/src/trigger.ts:35`
- `TriggerResolutionResult` (interface, public) `framework/domain-model/src/trigger.ts:37` — members: `eventType`, `sourceKind`, `sourceId`, `result`, `triggerKey`, `triggerSource`, `chosenAgentId`, `prompt`, `promptSource`, `conflicts`, `deterministicOrder`, `reason`
- `ArtifactPreview` (type, public) `framework/domain-model/src/types/artifact.ts:34`
- `Artifact` (interface, public) `framework/domain-model/src/types/artifact.ts:42` — members: `id`, `producingTaskId`, `producingTaskTitle`, `kind`, `label`, `preview`, `threadCount`, `createdAt`
- `ArtifactPage` (interface, public) `framework/domain-model/src/types/artifact.ts:56` — members: `items`, `nextCursor`
- `ArtifactFilterAxis` (type, public) `framework/domain-model/src/types/artifact.ts:61`
- `ArtifactQuery` (interface, public) `framework/domain-model/src/types/artifact.ts:68` — members: `limit`, `cursor`, `sort`
- `CreateArtifactInput` (interface, public) `framework/domain-model/src/types/artifact.ts:74` — members: `producingTaskId`, `kind`, `label`, `preview`
- `CurrencyCode` (type, public) `framework/domain-model/src/types/money.ts:15`
- `Money` (interface, public) `framework/domain-model/src/types/money.ts:39` — members: `minor`, `currency`
- `WireMoney` (interface, public) `framework/domain-model/src/types/money.ts:48` — members: `minor`, `currency`
- `TierTokenCount` (interface, public) `framework/domain-model/src/types/money.ts:59` — members: `prompt`, `completion`, `cachedPrompt`
- `TokenUsage` (interface, public) `framework/domain-model/src/types/money.ts:66` — members: `byTier`
- `TaskState` (type, public) `framework/domain-model/src/types.ts:21`
- `MutableBetField` (type, public) `framework/domain-model/src/types.ts:61`
- `HealthResponse` (interface, public) `framework/domain-model/src/types.ts:63` — members: `status`, `timestamp`
- `KnowledgeFormat` (type, public) `framework/domain-model/src/types.ts:68`
- `KernelKnowledgeStatus` (type, public) `framework/domain-model/src/types.ts:80`
- `BetStatus` (type, public) `framework/domain-model/src/types.ts:96`
- `SessionState` (type, public) `framework/domain-model/src/types.ts:108`
- `ModelTier` (type, public) `framework/domain-model/src/types.ts:110`
- `TriggerType` (type, public) `framework/domain-model/src/types.ts:120`
- `AgentCategory` (type, public) `framework/domain-model/src/types.ts:135`
- `UserRole` (type, public) `framework/domain-model/src/types.ts:145`
- `UserStatus` (type, public) `framework/domain-model/src/types.ts:147`
- `UserKind` (type, public) `framework/domain-model/src/types.ts:154`
- `OrgEdgeMechanism` (type, public) `framework/domain-model/src/types.ts:163`
- `ScopeKind` (type, public) `framework/domain-model/src/types.ts:191`
- `BetOutcomeVerdict` (type, public) `framework/domain-model/src/types.ts:220`
- `TaskOutcomeVerdict` (type, public) `framework/domain-model/src/types.ts:246`

## D. Const / enum exports

- `AGENT_BEHAVIOR_CONFIG_KINDS` (const, public) `framework/domain-model/src/agent-behavior-config.ts:85`
- `TEAM_FUNCTIONS` (const, public) `framework/domain-model/src/agent-roles.ts:21`
- `AGENT_ROLE_CATALOG` (const, public) `framework/domain-model/src/agent-roles.ts:44`
- `API_ERROR_CODES` (const, public) `framework/domain-model/src/api-types.ts:9`
- `artifactPreviewSchema` (const, public) `framework/domain-model/src/artifact-preview.ts:41`
- `fallbackPreviewSchema` (const, public) `framework/domain-model/src/artifact-preview.ts:47`
- `INVITE_ROLES` (const, public) `framework/domain-model/src/auth.ts:10`
- `LOGIN_SESSION_TTL_MS` (const, public) `framework/domain-model/src/auth.ts:14`
- `INVITE_CODE_TTL_MS` (const, public) `framework/domain-model/src/auth.ts:17`
- `BLOCK_KINDS` (const, public) `framework/domain-model/src/blocks/types.ts:6`
- `BLOCK_HOST_KINDS` (const, public) `framework/domain-model/src/blocks/types.ts:20`
- `BLOCK_ID_VERSION` (const, public) `framework/domain-model/src/blocks/types.ts:36`
- `IMAGE_URL_SAFE_SCHEMES` (const, public) `framework/domain-model/src/blocks/types.ts:39`
- `LINK_URL_SAFE_SCHEMES` (const, public) `framework/domain-model/src/blocks/types.ts:42`
- `MAX_BODY_BYTES` (const, public) `framework/domain-model/src/blocks/types.ts:45`
- `CONFIGURATION_KINDS` (const, public) `framework/domain-model/src/configuration.ts:1`
- `PLUGIN_STATES` (const, public) `framework/domain-model/src/configuration.ts:17`
- `BUILTIN_PLUGIN_ID` (const, public) `framework/domain-model/src/configuration.ts:27`
- `CONNECTION_AUTH_SOURCES` (const, public) `framework/domain-model/src/connection.ts:16`
- `CONNECTION_HEALTH` (const, public) `framework/domain-model/src/connection.ts:20`
- `HELD_AUTH_SOURCES` (const, public) `framework/domain-model/src/connection.ts:27`
- `CREDENTIAL_NAMES` (const, public) `framework/domain-model/src/credential.ts:13`
- `CREDENTIAL_STATES` (const, public) `framework/domain-model/src/credential.ts:23`
- `CREDENTIAL_CATALOG` (const, public) `framework/domain-model/src/credential.ts:36`
- `CREDENTIAL_BY_PROVIDER` (const, public) `framework/domain-model/src/credential.ts:84`
- `ASSISTANT_TURN_TIMEOUT_MS` (const, public) `framework/domain-model/src/errors.ts:124`
- `AGENT_WORK_INTENT_KINDS` (const, public) `framework/domain-model/src/events.ts:14`
- `HINT_CATALOG` (const, public) `framework/domain-model/src/hint.ts:31`
- `HINT_IDS` (const, public) `framework/domain-model/src/hint.ts:61`
- `OLD_KIND_MAP` (const, public) `framework/domain-model/src/kinds/old-kind-map.ts:22`
- `textPreviewSchema` (const, internal) `framework/domain-model/src/kinds/registry.ts:31`
- `textKind` (const, internal) `framework/domain-model/src/kinds/registry.ts:39`
- `codePreviewSchema` (const, internal) `framework/domain-model/src/kinds/registry.ts:70`
- `codeKind` (const, internal) `framework/domain-model/src/kinds/registry.ts:79`
- `imagePreviewSchema` (const, internal) `framework/domain-model/src/kinds/registry.ts:106`
- `imageKind` (const, internal) `framework/domain-model/src/kinds/registry.ts:116`
- `dataPreviewSchema` (const, internal) `framework/domain-model/src/kinds/registry.ts:147`
- `dataKind` (const, internal) `framework/domain-model/src/kinds/registry.ts:156`
- `htmlPreviewSchema` (const, internal) `framework/domain-model/src/kinds/registry.ts:178`
- `htmlKind` (const, internal) `framework/domain-model/src/kinds/registry.ts:186`
- `urlPreviewSchema` (const, internal) `framework/domain-model/src/kinds/registry.ts:211`
- `urlKind` (const, internal) `framework/domain-model/src/kinds/registry.ts:220`
- `ARTIFACT_KINDS` (const, public) `framework/domain-model/src/kinds/registry.ts:262`
- `KNOWLEDGE_LAYERS` (const, public) `framework/domain-model/src/knowledge.ts:3`
- `SCOPE_TO_LAYER` (const, public) `framework/domain-model/src/knowledge.ts:6`
- `KNOWLEDGE_STATUSES` (const, public) `framework/domain-model/src/knowledge.ts:20`
- `KNOWLEDGE_STATUS_LABEL` (const, public) `framework/domain-model/src/knowledge.ts:31`
- `KNOWLEDGE_SCOPES` (const, public) `framework/domain-model/src/knowledge.ts:51`
- `KNOWLEDGE_TOPIC_HEALTHS` (const, public) `framework/domain-model/src/knowledge.ts:54`
- `KNOWLEDGE_SORT_OPTIONS` (const, public) `framework/domain-model/src/knowledge.ts:65`
- `MAX_MENTIONS_PER_MESSAGE` (const, public) `framework/domain-model/src/mention.ts:19`
- `MODEL_PROVIDERS` (const, public) `framework/domain-model/src/model-gateway.ts:22`
- `MODEL_CATALOG` (const, public) `framework/domain-model/src/model-gateway.ts:81`
- `DEFAULT_AGENT_MODEL_ID` (const, public) `framework/domain-model/src/model-gateway.ts:94`
- `DEFAULT_AGENT_MODEL_PROVIDER` (const, public) `framework/domain-model/src/model-gateway.ts:97`
- `DEFAULT_AGENT_HARNESS` (const, public) `framework/domain-model/src/model-gateway.ts:100`
- `BUILT_IN_GATEWAY_CONFIG` (const, public) `framework/domain-model/src/model-gateway.ts:133`
- `NOTIFICATION_TYPES` (const, public) `framework/domain-model/src/notifications.ts:50`
- `PROPOSED_CALL_STATUSES` (const, public) `framework/domain-model/src/proposed-call.ts:17`
- `REVERSIBILITY` (const, public) `framework/domain-model/src/proposed-call.ts:28`
- `ROUTINE_STATES` (const, public) `framework/domain-model/src/routine.ts:19`
- `ROUTINE_RUN_OUTCOMES` (const, public) `framework/domain-model/src/routine.ts:36`
- `SCHEDULE_PRESETS` (const, public) `framework/domain-model/src/routine.ts:132`
- `AGENT_SESSION_SOURCE_KINDS` (const, public) `framework/domain-model/src/session-request.ts:9`
- `AGENT_SESSION_PROMPT_MODES` (const, public) `framework/domain-model/src/session-request.ts:17`
- `AGENT_SESSION_REQUEST_STATUSES` (const, public) `framework/domain-model/src/session-request.ts:25`
- `taskSessionRequestInputSchema` (const, public) `framework/domain-model/src/session-request.ts:48`
- `assistantSessionRequestInputSchema` (const, public) `framework/domain-model/src/session-request.ts:60`
- `routineSessionRequestInputSchema` (const, public) `framework/domain-model/src/session-request.ts:73`
- `knowledgeSessionRequestInputSchema` (const, public) `framework/domain-model/src/session-request.ts:85`
- `proposedCallSessionRequestInputSchema` (const, public) `framework/domain-model/src/session-request.ts:97`
- `agentSessionRequestInputSchema` (const, public) `framework/domain-model/src/session-request.ts:108`
- `TASK_STATE_TRANSITIONS` (const, public) `framework/domain-model/src/task-transition.ts:4`
- `HOST_KINDS` (const, public) `framework/domain-model/src/thread.ts:19`
- `MESSAGE_TYPES` (const, public) `framework/domain-model/src/thread.ts:31`
- `VERDICT_DECISIONS` (const, public) `framework/domain-model/src/thread.ts:34`
- `ARTIFACT_VIEW_SHAPES` (const, public) `framework/domain-model/src/thread.ts:48`
- `TRIGGER_EVENT_TYPES` (const, public) `framework/domain-model/src/trigger.ts:4`
- `TRIGGER_RESULT_STATES` (const, public) `framework/domain-model/src/trigger.ts:15`
- `TriggerRuleValueSchema` (const, public) `framework/domain-model/src/trigger.ts:24`
- `CURRENCY_CODES` (const, public) `framework/domain-model/src/types/money.ts:14`
- `CURRENCY_SCALE` (const, public) `framework/domain-model/src/types/money.ts:21`
- `TASK_STATES` (const, public) `framework/domain-model/src/types.ts:10`
- `TASK_STATE_LABEL` (const, public) `framework/domain-model/src/types.ts:31`
- `MUTABLE_BET_FIELDS` (const, public) `framework/domain-model/src/types.ts:54`
- `KERNEL_KNOWLEDGE_STATUSES` (const, public) `framework/domain-model/src/types.ts:79`
- `BET_STATUSES` (const, public) `framework/domain-model/src/types.ts:94`
- `BET_STATUS_LABEL` (const, public) `framework/domain-model/src/types.ts:101`
- `MODEL_TIERS` (const, public) `framework/domain-model/src/types.ts:118`
- `AGENT_CATEGORIES` (const, public) `framework/domain-model/src/types.ts:134`
- `USER_KINDS` (const, public) `framework/domain-model/src/types.ts:153`
- `ORG_EDGE_MECHANISMS` (const, public) `framework/domain-model/src/types.ts:162`
- `SCOPE_KINDS` (const, public) `framework/domain-model/src/types.ts:181`
- `SCOPES_REQUIRING_ID` (const, public) `framework/domain-model/src/types.ts:202`
- `BET_OUTCOME_VERDICTS` (const, public) `framework/domain-model/src/types.ts:219`
- `BET_OUTCOME_VERDICT_LABEL` (const, public) `framework/domain-model/src/types.ts:225`
- `TASK_OUTCOME_VERDICTS` (const, public) `framework/domain-model/src/types.ts:240`
- `TASK_OUTCOME_VERDICT_LABEL` (const, public) `framework/domain-model/src/types.ts:254`
- `AGENT_OPERATIONAL_STATUS_LABEL` (const, public) `framework/domain-model/src/types.ts:265`

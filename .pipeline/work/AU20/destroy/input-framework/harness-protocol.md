# Destroyer input — `harness-protocol` (framework)

Package: `framework/harness-protocol`
Surface: 17 exported functions, 0 classes (0 member methods), 42 interface/type declarations, 3 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `registeredHarnessCount` | yes | `framework/harness-protocol/src/harness/harness-capability-read-model.ts:90` |
| 2 | `workerConnections` | yes | `framework/harness-protocol/src/harness/harness-capability-read-model.ts:95` |
| 3 | `harnessCapabilitiesForType` | yes | `framework/harness-protocol/src/harness/harness-capability-read-model.ts:108` |
| 4 | `harnessRegistrationMeta` | yes | `framework/harness-protocol/src/harness/harness-capability-read-model.ts:122` |
| 5 | `harnessCapabilityDescriptors` | yes | `framework/harness-protocol/src/harness/harness-capability-read-model.ts:145` |
| 6 | `refreshHarnessDiscoveries` | yes | `framework/harness-protocol/src/harness/harness-capability-read-model.ts:153` |
| 7 | `preMapClaudeEvent` | yes | `framework/harness-protocol/src/harness/harness-event-normalization.ts:56` |
| 8 | `normalizeHarnessEvent` | yes | `framework/harness-protocol/src/harness/harness-event-normalization.ts:263` |
| 9 | `isHarnessEvent` | yes | `framework/harness-protocol/src/harness/harness-event-normalization.ts:353` |
| 10 | `isReturnAction` | yes | `framework/harness-protocol/src/harness/return-actions.ts:86` |
| 11 | `isRequiredReturnAction` | yes | `framework/harness-protocol/src/harness/return-actions.ts:102` |
| 12 | `isInternalExtractionDrain` | yes | `framework/harness-protocol/src/harness/return-actions.ts:129` |
| 13 | `mcpNamespacedToolName` | yes | `framework/harness-protocol/src/harness/return-actions.ts:180` |
| 14 | `opencodeToolName` | yes | `framework/harness-protocol/src/harness/return-actions.ts:189` |
| 15 | `literalToolNamerForAdapterType` | yes | `framework/harness-protocol/src/harness/return-actions.ts:204` |
| 16 | `buildForceReturnMessage` | yes | `framework/harness-protocol/src/harness/return-actions.ts:232` |
| 17 | `shouldForceReturn` | yes | `framework/harness-protocol/src/harness/return-actions.ts:276` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `EnforcementEntry` (interface, public) `framework/harness-protocol/src/harness/enforcement-registry.ts:23` — members: `gate`, `forceCount`, `exempt`, `requiredReturnActions`
- `EnforcementRegistry` (interface, public) `framework/harness-protocol/src/harness/enforcement-registry.ts:40` — members: `register`, `get`, `incrementForce`, `unregister`
- `SessionWorkflow` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:27` — members: `routeToReview`, `sessionRole`, `approvedCall`
- `McpConnectionInfo` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:44` — members: `url`, `token`
- `ConversationMessage` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:61` — members: `role`, `content`
- `SessionConfig` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:66` — members: `sessionId`, `sandboxPath`, `systemPromptPath`, `assembledPrompt`, `modelTier`, `tools`, `resolvedModel`, `mcpConnectionInfo`, `messages`, `returnHook`, `sessionWorkflow`, `mcpTokenEnv`, `requiredReturnActions`
- `SessionHandle` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:160` — members: `sessionId`
- `SessionMetrics` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:164` — members: `modelTurns`, `processStarts`, `toolCalls`, `completionEvents`, `inputTokens`, `outputTokens`, `cachedInputTokens`, `cacheCreationInputTokens`, `reasoningOutputTokens`, `durationMs`, `apiDurationMs`
- `SessionResult` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:196` — members: `outcome`, `tokenUsage`, `metrics`
- `ReturnHookConfig` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:207` — members: `bridgeToken`, `mcpUrl`, `forceBudget`
- `HarnessCapabilities` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:213` — members: `preCompactionTrigger`, `subAgents`, `modelProviders`, `mcpSupport`, `returnEnforcement`, `descriptorModels`, `accessMode`, `authAction`, `discovery`, `fileEditing`, `toolUse`, `cliMcpDialect`
- `AdapterMeta` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:268` — members: `name`, `kind`, `type`, `modelProviders`, `maxConcurrent`
- `AdapterInfo` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:278` — members: `id`, `name`, `kind`, `type`, `modelProviders`, `currentLoad`, `maxConcurrent`, `connectedSince`, `paused`
- `HarnessAdapter` (interface, public) `framework/harness-protocol/src/harness/harness-adapter.ts:292` — members: `startSession`, `streamEvents`, `stopSession`, `getCapabilities`, `getForceReturnCount`
- `HarnessCapabilityFilter` (interface, public) `framework/harness-protocol/src/harness/harness-capability-read-model.ts:76` — members: `type`, `kind`, `includeKnownMissing`
- `HarnessCapabilityReader` (interface, public) `framework/harness-protocol/src/harness/harness-capability-read-model.ts:82` — members: `size`, `list`, `describe`, `refresh`
- `TokenUsageEvent` (interface, public) `framework/harness-protocol/src/harness/harness-events.ts:5` — members: `type`, `inputTokens`, `outputTokens`, `cachedInputTokens`, `cacheCreationInputTokens`, `reasoningOutputTokens`, `tier`
- `ToolCallEvent` (interface, public) `framework/harness-protocol/src/harness/harness-events.ts:16` — members: `type`, `toolName`, `args`
- `CompletionEvent` (interface, public) `framework/harness-protocol/src/harness/harness-events.ts:22` — members: `type`, `text`
- `ErrorEvent` (interface, public) `framework/harness-protocol/src/harness/harness-events.ts:27` — members: `type`, `message`, `code`
- `PreCompactionEvent` (interface, public) `framework/harness-protocol/src/harness/harness-events.ts:33` — members: `type`, `contextTokens`, `maxTokens`
- `HarnessEvent` (type, public) `framework/harness-protocol/src/harness/harness-events.ts:44`
- `HarnessEventType` (type, public) `framework/harness-protocol/src/harness/harness-events.ts:51`
- `ReturnActionName` (type, public) `framework/harness-protocol/src/harness/return-actions.ts:40`
- `LiteralToolNamer` (type, public) `framework/harness-protocol/src/harness/return-actions.ts:164`
- `HarnessAdapterType` (type, public) `framework/harness-protocol/src/harness/return-actions.ts:195`
- `WorkerRegisterMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:15` — members: `type`, `id`, `name`, `modelProviders`, `maxConcurrent`, `harnessType`
- `WorkerEventMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:29` — members: `type`, `sessionId`, `event`
- `WorkerSessionResultMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:35` — members: `type`, `sessionId`, `result`
- `WorkerErrorMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:41` — members: `type`, `sessionId`, `message`
- `WorkerPauseMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:51` — members: `type`
- `WorkerResumeMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:59` — members: `type`
- `WorkerToServerMessage` (type, public) `framework/harness-protocol/src/harness/worker-protocol.ts:63`
- `ServerDispatchMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:73` — members: `type`, `sessionId`, `config`
- `ServerStopMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:79` — members: `type`, `sessionId`
- `ServerRegisteredMessage` (interface, public) `framework/harness-protocol/src/harness/worker-protocol.ts:91` — members: `type`
- `ServerToWorkerMessage` (type, public) `framework/harness-protocol/src/harness/worker-protocol.ts:95`
- `HarnessPortDeps` (interface, public) `framework/harness-protocol/src/harness-port.ts:57` — members: `db`, `eventBus`, `onHarnessStarted`
- `RunContextBundle` (interface, public) `framework/harness-protocol/src/harness-port.ts:69` — members: `taskId`, `agentId`, `productId`, `sandboxBasePath`, `modelTier`, `resolvedModel`, `routineId`, `requestContext`, `sessionWorkflow`, `contextBundle`, `agentConfig`, `harnessDisabled`, `callingThreadId`, `transcript`
- `AdmittedRun` (interface, public) `framework/harness-protocol/src/harness-port.ts:126` — members: `sessionId`, `sessionContext`
- `HarnessRunOutput` (interface, public) `framework/harness-protocol/src/harness-port.ts:138` — members: `sessionId`, `outcome`, `taskId`, `returnVerdict`, `forceReturnCount`, `metrics`
- `HarnessPort` (interface, public) `framework/harness-protocol/src/harness-port.ts:154` — members: `admitSession`, `runSession`

## D. Const / enum exports

- `RETURN_ACTION_NAMES` (const, public) `framework/harness-protocol/src/harness/return-actions.ts:32`
- `FORCE_RETURN_MESSAGE` (const, public) `framework/harness-protocol/src/harness/return-actions.ts:147`
- `MAX_FORCE_RETURNS` (const, public) `framework/harness-protocol/src/harness/return-actions.ts:260`

// AU17: curated cross-package barrel. Every symbol re-exported here is
// part of this package's public surface — internals not listed here are
// unreachable from outside the package (enforced by tsc: unexported deep
// imports fail to resolve). Derived mechanically from actual importers by
// scripts/au17-migrate.ts; keep additions/removals in sync with real usage.

export type { BuiltinRoutineId } from "./config/builtin-routines.js";
export {
	BUILTIN_ROUTINE_IDS,
	BUILTIN_SPECS,
	extractBuiltinKind,
	isBuiltinRoutineId,
} from "./config/builtin-routines.js";
export { BUILTIN_TOOL_CATALOG } from "./config/builtin-tool-catalog.js";
export type { GitExportConfig, GitExportConfigPatch } from "./config/git-export-config.js";
export {
	getLastExportMeta,
	loadGitExportConfig,
	readGitExportConfig,
	redactRemoteUrl,
	sanitizeAuthorEmail,
	sanitizeAuthorName,
	sanitizeBranch,
	sanitizePathSegment,
	sanitizeRemoteUrl,
	sanitizeRepoPath,
	updateGitExportConfig,
	writeLastCommit,
	writeLastPush,
} from "./config/git-export-config.js";
export { buildAttentionService, MAX_RECOMPUTE_BATCH } from "./knowledge/attention-service.js";
export { ItemDeletedError, VersionConflictError } from "./knowledge/errors.js";
export { setupFts } from "./knowledge/fts.js";
export * as repo from "./knowledge/knowledge-repository.js";
export {
	archiveItem,
	changeScope,
	countAccessesSince,
	countTriageVisible,
	create,
	findById,
	findDetailById,
	findRelatedByTopic,
	flagItem,
	list,
	listVisibleWithSignals,
	mergeItems,
	search,
	searchByText,
	splitItem,
	update,
} from "./knowledge/knowledge-repository.js";
export { runAutoPromotionSweep, runStaleSweep } from "./knowledge/promotion-pipeline.js";
export { registerRelevanceListener } from "./knowledge/relevance-listener.js";
export { rankAndBudget } from "./knowledge/relevance-scoring.js";
export { createRelevanceService } from "./knowledge/relevance-service.js";
export { communityForRole } from "./knowledge/role-community-map.js";
export type { ScoringContext } from "./knowledge/scoring-config.js";
export { DEFAULT_KNOWLEDGE_BUDGET, loadScoringWeights } from "./knowledge/scoring-config.js";
export { countTokens } from "./knowledge/token-budget.js";
export type { KnowledgeStatus } from "./knowledge/types.js";
export { defaultNotificationAdapterFactory } from "./notifications/adapter-factory.js";
export type {
	NotificationConfig,
	NotificationConfigPatch,
	SafeNotificationConfig,
} from "./notifications/config.js";
export {
	loadNotificationConfig,
	pickRecipient,
	readNotificationConfig,
	redactNotificationConfig,
	sanitizeCron,
	sanitizeEmail,
	sanitizeNtfyUrl,
	sanitizeSmtpCredential,
	sanitizeSmtpHost,
	sanitizeTopic,
	updateNotificationConfig,
} from "./notifications/config.js";
export { createConsoleAdapter } from "./notifications/console-adapter.js";
export { getDailyDigest } from "./notifications/daily-digest.js";
export type { AdapterFactory, AlertPreferences } from "./notifications/dispatcher.js";
export {
	dispatchDigest,
	enqueueNotification,
	flushQueue,
	recoverStuckLeases,
	registerNotificationDispatcher,
	tryFloodReserve,
} from "./notifications/dispatcher.js";
export { startNotificationDrain } from "./notifications/drain.js";
export {
	defaultMutePreferenceReader,
	defaultMutePreferenceWriter,
	getMutedTypeKeys,
} from "./notifications/mute.js";
export { registerNotificationListener } from "./notifications/notification-listener.js";
export {
	claimForSend,
	deleteReaped,
	findById as findNotificationById,
	findPendingByEventSubject,
	insertNotification,
	listAll,
	listByIdsWithStatus,
	listByStatus,
	listPending,
	listPendingDigest,
	listStuckLeases,
	listUnread,
	markRead,
	markSeenAll,
	queueCountByStatus,
	requeueLease,
	updateManyByIds,
	updateStatus,
} from "./notifications/notification-queue.js";
export { createNtfyAdapter } from "./notifications/ntfy-adapter.js";
export { scrubErrorMessage } from "./notifications/redact.js";
export { isInSilenceWindow, isSilenced } from "./notifications/silence-policy.js";
export { createSmtpAdapter } from "./notifications/smtp-adapter.js";
export type {
	Notification,
	NotificationAdapter,
	NotificationChannel,
	Recipient,
	SendResult,
} from "./notifications/types.js";
export * as routine from "./routine-service.js";
export * as routineService from "./routine-service.js";
export { artifactPreviewSchema, fallbackPreviewSchema } from "./schemas/artifact-preview.js";
export { betDetailResponseSchema, betListResponseSchema } from "./schemas/bet.schema.js";
export { enumValues } from "./schemas/common.schema.js";
export {
	AgentBehaviorConfigError,
	listAgentBehaviorConfiguration,
	patchAgentBehaviorConfiguration,
} from "./services/agent-behavior-config.js";
export { startAgentLifecycleProjectionDrain } from "./services/agent-lifecycle-projectors.js";
export { deriveInitials } from "./services/agent-utils.js";
export {
	AGENT_WORK_RETENTION_BATCH_SIZE,
	AGENT_WORK_RETENTION_DAYS,
	reapTerminalAgentWorkIntents,
	recordAgentWorkIntent,
} from "./services/agent-work-intents.js";
export { computeApprovalRate } from "./services/approval-rate.js";
export { cascadeBetKill } from "./services/bet-kill-cascade.js";
export type { RevisionLogEntry } from "./services/bet-state-machine.js";
export { transitionBet, updateBetField } from "./services/bet-state-machine.js";
export {
	applyProvisioningPlan,
	buildProvisioningPlan,
	resolveOwningHumanUserId,
} from "./services/connection-provisioning.js";
export {
	countThreads,
	findOrCreateDirectThread,
	getArtifactThreadSummaries,
	getFirstPinnedThreadByHost,
	getFirstThreadByHost,
	getMessageByClientKey,
	getMessageById,
	getMessagesByThreadIds,
	getThreadByDirectKey,
	getThreadById,
	getThreadIdsByHost,
	insertMessage,
	insertThread,
	listInboxByParticipantProbe,
	listInboxBySenderExclusion,
	listMessagesByThread,
	listThreadMetaByIds,
	listThreadsByHost,
	listThreadsByHostKind,
	listThreadsByParticipant,
	listThreadsByRecency,
	listUnresolvedReviewThreadIds,
	resolveMessageIfUnresolved,
	searchConversations,
	updateThread,
} from "./services/conversation-store.js";
export {
	decryptCredentialValue,
	encryptCredentialValue,
	getServerSecret,
	requireServerSecret,
} from "./services/credential-encryption.js";
export type { CredentialResolver } from "./services/credential-resolver.js";
export { DbCredentialResolver, EnvCredentialResolver } from "./services/credential-resolver.js";
export { checkAndUnblockDependents } from "./services/dependency-watcher.js";
export {
	NoopAuthResolver,
	probeGitRemote,
	probeLocalPath,
	repoToUrl,
	resolveFilesystemState,
	ServiceConnectionResolverAdapter,
} from "./services/filesystem-reachability.js";
export type { ExportPlanEntry, FsAdapter } from "./services/git-export.js";
export {
	buildCommitMessage,
	computeExportPlan,
	createNodeFsAdapter,
	registerGitExportHandler,
	resetExportMutexes,
	runGitExport,
} from "./services/git-export.js";
export type { FakeGitRunner, GitConfigInjection, GitRunner } from "./services/git-export-runner.js";
export { createFakeGitRunner, createGitRunner } from "./services/git-export-runner.js";
export { inspectLocalPath } from "./services/inspect-local-path.js";
export { claimInvite, createInvite, generateInviteCode } from "./services/invite-code.js";
export { routeItem } from "./services/item-router.js";
export {
	registerLifecyclePropagation,
	retryFailedPropagations,
} from "./services/lifecycle-propagation.js";
export { escapeLikePattern } from "./services/like-escape.js";
export {
	createLoginSession,
	findLoginSessionByTokenHash,
	generateToken,
	hashToken,
	revokeLoginSession,
	validateBearerToken,
} from "./services/login-session.js";
export {
	BUILT_IN_GATEWAY_CONFIG,
	resolveAgentModel,
	resolveModelTier,
} from "./services/model-gateway.js";
export type {
	ObservabilityConfig,
	ObservabilityConfigPatch,
} from "./services/observability/config.js";
export {
	readObservabilityConfig,
	redactObservabilityConfig,
	updateObservabilityConfig,
} from "./services/observability/config.js";
export { createConsoleObservabilityAdapter } from "./services/observability/console-adapter.js";
export {
	createDbTraceIdResolver,
	createObservabilityDispatcher,
	registerObservabilityDispatcher,
	summarizeToolArgs,
} from "./services/observability/dispatcher.js";
export type {
	FlushOutcome,
	ObservabilityAdapter,
	ObservabilityChannel,
	ObservabilityDispatcher,
	ObservabilityDispatcherStatus,
} from "./services/observability/types.js";
export { upsertOrgEdge } from "./services/org-edges.js";
export { resolveReviewRecipients } from "./services/org-routing.js";
export {
	getResolvedConfiguration,
	listResolvedConfiguration,
	loadBuiltInConfigurationDefaults,
	loadPluginConfigurationDefaults,
	projectProductionConfigurationDefaults,
	setConfigurationOverride,
	setPluginConfigurationState,
} from "./services/plugin-configuration.js";
export { registerPolicyEngine } from "./services/policy-engine.js";
export { createPracticeMeeting, runPracticeMeetingTurn } from "./services/practice-meeting.js";
export {
	composeTailoredGrant,
	handleUnconsumedGrantOnSessionEnd,
} from "./services/proposed-call-workflow.js";
export { startRetentionReaper } from "./services/retention-reaper.js";
export { attentionReviewReasoningMarker } from "./services/review-item-factory.js";
export { humanizeSchedule } from "./services/schedule-label.js";
export {
	migrateCredentialsToStore,
	readServerConfig,
	updateServerConfig,
} from "./services/server-config.js";
export { projectInheritedConnections } from "./services/service-connection-projection.js";
export { ServiceConnectionResolver } from "./services/service-connection-resolver.js";
export { SessionActivityBuffer } from "./services/session-activity-buffer.js";
export { registerSessionReviewCreator } from "./services/session-review-creator.js";
export { sessionRunRegistry } from "./services/session-run-registry.js";
export type {
	HandoffAuditEntry,
	StateTransitionAuditEntry,
	TaskAuditEntry,
} from "./services/task-audit.js";
export {
	InvalidTransitionError,
	transitionTask,
	VALID_TRANSITIONS,
} from "./services/task-state-machine.js";
export { resolveTeamAgentHarness } from "./services/team-default-harness.js";
export { ApiError, loadTeamMembers } from "./services/team-lookup.js";
export {
	findActiveTeammateByRole,
	getFirstUserByKind,
	getOrCreateUser,
	getUserById,
	getUserByIdScopedToTeam,
	getUsersByIds,
	incrementUserCost,
	insertUser,
	listActiveAiUsersByTeams,
	listAgentProfiles,
	listAllUsers,
	listUserDirectory,
	listUsersByKind,
	listUsersByTeam,
	listUsersByTeamAndKind,
	listUsersByTeams,
	resetAllUserCost,
	searchUsersByName,
	sumAllUserCost,
	updateUser,
} from "./services/user-store.js";
export type { WsClient } from "./services/ws-broadcaster.js";
export { createDbSubscribeAuthorizer, WsBroadcaster } from "./services/ws-broadcaster.js";
export * as work from "./work-service.js";

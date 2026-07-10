// --- Bootstrap (O3) ---

export { bootstrapFabric } from "./bootstrap.js";

// --- Strategy adapter (AK2) ---
// fabricStrategy implements the Strategy Port (packages/shared/src/strategy-port.ts)
// by delegating to the existing Fabric assembleContext + startWatcher functions.
// Import and register in server-factory.ts (the composition root).
export { fabricStrategy } from "./fabric-strategy.js";

// --- Strategy services (O3: moved from packages/server to packages/fabric) ---

// approval-rate
export type { ApprovalRateResult } from "./services/approval-rate.js";
export { computeApprovalRate } from "./services/approval-rate.js";
// assistant-dispatcher
export { registerAssistantDispatcher } from "./services/assistant-dispatcher.js";
// attention-service
export type {
	AttentionRecomputeResult,
	AttentionRecomputeScopeError,
	AttentionRecomputeScopeResult,
	AttentionRecomputeSummary,
	AttentionService,
	AttentionServiceDeps,
	AttentionServiceFilter,
} from "./services/attention-service.js";
export {
	buildAttentionService,
	MAX_RECOMPUTE_BATCH,
} from "./services/attention-service.js";
// builtin-routines
export type {
	BuiltinRoutineId,
	PostBetRetroArgs,
	RunBuiltinResult,
} from "./services/builtin-routines.js";
export {
	BUILTIN_ROUTINE_IDS,
	extractBuiltinKind,
	isBuiltinRoutineId,
	provisionTeamRoutines,
	registerBuiltinRoutineHandlers,
	runBuiltinRoutine,
} from "./services/builtin-routines.js";
// cost-cap
export type {
	CheckCostCapParams,
	CostCapResult,
	RecordCostAndCheckParams,
	ResetCostsParams,
} from "./services/cost-cap.js";
export {
	checkCostCap,
	clearDeduplicationCache,
	getDedupCacheSize,
	recordCostAndCheck,
	recordFactoryCost,
	registerCostCapDedupReleaser,
	releaseSessionDedup,
	resetCosts,
} from "./services/cost-cap.js";
// cost-sentinel (AD8c: extracted from builtin-routines as application code)
export type { CostSentinelLevel } from "./services/cost-sentinel.js";
export {
	COST_SENTINEL_INTERVAL_MS,
	COST_WARNING_RATIO,
	clearCostSentinelCache,
	runCostSentinelCheck,
	startCostSentinel,
} from "./services/cost-sentinel.js";

// daily-digest
export { getDailyDigest } from "./services/daily-digest.js";

// founder-router
export { routeToFounder } from "./services/founder-router.js";

// git-export
export type {
	ExportPlan,
	ExportPlanEntry,
	FsAdapter,
	GitExportResult,
	GitExportTrigger,
	RegisterGitExportHandlerOptions,
	RunGitExportDeps,
} from "./services/git-export.js";
export {
	buildCommitMessage,
	computeExportPlan,
	createNodeFsAdapter,
	EXPORTED_KINDS,
	EXPORTED_STATUSES,
	registerGitExportHandler,
	resetExportMutexes,
	runGitExport,
} from "./services/git-export.js";

// git-export-config
export type {
	GitExportConfig,
	GitExportConfigPatch,
	LastExportMeta,
	SanitizeRemoteUrlOptions,
} from "./services/git-export-config.js";
export {
	GIT_EXPORT_CONFIG_DEFAULTS,
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
} from "./services/git-export-config.js";

// git-export-runner
export type {
	CreateGitRunnerOptions,
	FakeGitCall,
	FakeGitRunner,
	GitConfigInjection,
	GitRunner,
} from "./services/git-export-runner.js";
export { createFakeGitRunner, createGitRunner } from "./services/git-export-runner.js";

// item-router
export { routeItem } from "./services/item-router.js";

// lifecycle-propagation
export {
	registerLifecyclePropagation,
	retryFailedPropagations,
} from "./services/lifecycle-propagation.js";

// notifications/adapter-factory
export { defaultNotificationAdapterFactory } from "./services/notifications/adapter-factory.js";

// notifications/config
export type {
	NotificationConfig,
	NotificationConfigPatch,
	SafeNotificationConfig,
} from "./services/notifications/config.js";
export {
	assertNtfyUrlNotSSRF,
	loadNotificationConfig,
	pickRecipient,
	REDACTED,
	readNotificationConfig,
	redactNotificationConfig,
	sanitizeCron,
	sanitizeEmail,
	sanitizeNtfyUrl,
	sanitizeSmtpCredential,
	sanitizeSmtpHost,
	sanitizeTopic,
	updateNotificationConfig,
} from "./services/notifications/config.js";

// notifications/console-adapter
export type { ConsoleAdapterOptions } from "./services/notifications/console-adapter.js";
export { createConsoleAdapter } from "./services/notifications/console-adapter.js";

// notifications/digest
export type { DigestResult } from "./services/notifications/digest.js";
export { runDailyDigest } from "./services/notifications/digest.js";

// notifications/dispatcher
export type {
	AdapterFactory,
	AlertPreferences,
	DispatcherDeps,
} from "./services/notifications/dispatcher.js";
export {
	applyAlertPreferences,
	dispatchDigest,
	enqueueNotification,
	flushQueue,
	recoverStuckLeases,
	registerNotificationDispatcher,
	tryFloodReserve,
} from "./services/notifications/dispatcher.js";

// notifications/drain (AF8)
export {
	NOTIFICATION_DRAIN_INTERVAL_MS,
	startNotificationDrain,
} from "./services/notifications/drain.js";

// notifications/mute (AF8)
export type { MutePreferenceReader, MutePreferenceWriter } from "./services/notifications/mute.js";
export {
	defaultMutePreferenceReader,
	defaultMutePreferenceWriter,
	getMutedTypeKeys,
} from "./services/notifications/mute.js";

// notifications/notification-listener (AF8)
export type { NotificationListenerDeps } from "./services/notifications/notification-listener.js";
export { registerNotificationListener } from "./services/notifications/notification-listener.js";

// notifications/ntfy-adapter
export type { NtfyAdapterOptions } from "./services/notifications/ntfy-adapter.js";
export { createNtfyAdapter } from "./services/notifications/ntfy-adapter.js";

// notifications/redact
export type { ScrubContext } from "./services/notifications/redact.js";
export { scrubErrorMessage } from "./services/notifications/redact.js";

// notifications/smtp-adapter
export type { SmtpAdapterOptions } from "./services/notifications/smtp-adapter.js";
export { createSmtpAdapter } from "./services/notifications/smtp-adapter.js";

// notifications/types
export type {
	Classification,
	Notification,
	NotificationAdapter,
	NotificationChannel,
	NotificationSeverity,
	QueueReason,
	QueueStatus,
	Recipient,
	SendResult,
} from "./services/notifications/types.js";
// org-routing
export type { ReviewRoutingContext } from "./services/org-routing.js";
export { resolveReviewRecipients } from "./services/org-routing.js";
// policy-engine
export { registerPolicyEngine } from "./services/policy-engine.js";
// practice-meeting
export type {
	CreatePracticeMeetingInput,
	CreatePracticeMeetingResult,
	PracticeMeetingTurnInput,
	PracticeMeetingTurnResult,
	ProposalInput,
	ReactionInput,
	RunPracticeMeetingTurnInput,
	SynthesisInput,
} from "./services/practice-meeting.js";
export {
	createPracticeMeeting,
	PRACTICE_MEETING_ANCHOR_ROLE,
	runPracticeMeetingTurn,
} from "./services/practice-meeting.js";
// provision-registry (AD2) — injection point for provisionSession across the circular package boundary
export {
	clearProvisionSessionFn,
	getAgentSessionRequestCreateFn,
	setAgentSessionRequestCreateFn,
} from "./services/provision-registry.js";
// relevance-listener (AF9: access→relevance subscriber)
export { registerRelevanceListener } from "./services/relevance-listener.js";
// relevance-service
export type {
	RelevanceService,
	SignalSet,
} from "./services/relevance-service.js";
export { createRelevanceService } from "./services/relevance-service.js";
// review-item-factory
export type {
	CreateReviewItemForKnowledgeInput,
	CreateReviewItemForKnowledgeResult,
} from "./services/review-item-factory.js";
export {
	ATTENTION_REVIEW_SOURCE,
	attentionReviewReasoningMarker,
	createReviewItemForKnowledge,
} from "./services/review-item-factory.js";
// routine-scheduler
export type {
	FireResult,
	ReapStaleSessions,
	RoutineScheduler,
	RoutineSchedulerConfig,
} from "./services/routine-scheduler.js";
export {
	backfillMissingNextRunAt,
	checkAndFireRoutine,
	computeNextRunAt,
	getRoutineMonthlySpend,
	nextCronMatch,
	parseCron,
	registerEventTriggers,
	shouldCoalesce,
	startRoutineScheduler,
} from "./services/routine-scheduler.js";
// routine-session-reaper (AF6 §4)
export type { ReapStaleRoutineSessionsOpts } from "./services/routine-session-reaper.js";
export { reapStaleRoutineSessions } from "./services/routine-session-reaper.js";
// sandbox-reaper (AF7 §6, renamed AK1)
export type { SandboxReaperOptions } from "./services/sandbox-reaper.js";
export {
	reapSandboxesOnce,
	SANDBOX_REAPER_INTERVAL_MS,
	startSandboxReaper,
} from "./services/sandbox-reaper.js";
// session-review-creator
export { registerSessionReviewCreator } from "./services/session-review-creator.js";
// silence-policy
export {
	isInSilenceWindow,
	isSilenced,
} from "./services/silence-policy.js";
// task-dispatcher (AD2)
export type {
	DispatchQueueEntry,
	DispatchQueueSnapshot,
	TaskDispatcherDeps,
} from "./services/task-dispatcher.js";
export {
	getDispatchQueueSnapshot,
	registerTaskDispatcher,
} from "./services/task-dispatcher.js";

// --- Strategy types (O1: moved from @hyperidle/shared) ---

export { isTasteSensitive } from "./attention-classifier.js";
export type { AttentionScoringContext } from "./attention-scoring.js";
export {
	buildAttentionContext,
	cohortKey,
	crossScopeKey,
	scoreAttention,
	scoreAttentionBatch,
} from "./attention-scoring.js";
export type {
	ConcurrentEdit,
	ConflictResult,
	FieldConflict,
	MergeResult,
} from "./conflict-resolution.js";
export {
	canPromote,
	mergeStructuredEdits,
	promote,
	resolveConflict,
	resolveConflictRecord,
} from "./conflict-resolution.js";
export type {
	ContextAssemblyConfig,
	ContextAssemblyResult,
	Manifest,
	ManifestEntry,
} from "./context-assembly.js";
export { assembleContext, EMITTED_ROOTS_CONTEXT_ASSEMBLY } from "./context-assembly.js";
// context-assembly-prompt (X1 + AA2 + AH3)
export type {
	AssistantPromptResult,
	PromptCompositionInput,
	PromptCompositionResult,
	RoutinePromptCompositionInput,
	ToolSummary,
} from "./context-assembly-prompt.js";
export {
	assemblePrompt,
	assembleRoutinePrompt,
	buildTemplateVariables,
	composeAssistantPrompt,
	EMITTED_ROOTS_AGENTS_MD,
	stripFrontmatter,
	substituteTemplateVars,
	writeSandboxAgentsMd,
} from "./context-assembly-prompt.js";
export { ItemDeletedError, VersionConflictError } from "./errors.js";
export type { KnowledgeEventEmitterLike, KnowledgeItemUpdatedEvent } from "./events.js";
export {
	getKnowledgeEvents,
	KnowledgeEventType,
	knowledgeEvents,
	setKnowledgeEventBus,
} from "./events.js";
export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startWatcher } from "./file-watcher.js";
export { setupFts } from "./fts.js";
export type {
	CreateKnowledgeItemInput,
	KnowledgeItemWithFabric,
	ListFilters,
	UpdateKnowledgeItemInput,
} from "./knowledge-repository.js";
export {
	create,
	getById,
	list,
	search,
	update,
} from "./knowledge-repository.js";
export { isValidLayer, layerDepth } from "./layers.js";
export { startPollingWatcher } from "./polling-watcher.js";
export type {
	AutoPromotionResult,
	AutoPromotionSweepResult,
	ContradictionResult,
	StaleSweepResult,
} from "./promotion-pipeline.js";
export {
	AUTO_PROMOTION_EDITOR,
	AUTO_PROMOTION_REPETITION_THRESHOLD,
	checkAutoPromotion,
	DEFAULT_SWEEP_MAX_BATCH_SIZE,
	detectLayerContradiction,
	findStaleItems,
	markStale,
	runAutoPromotionSweep,
	runStaleSweep,
	STALE_THRESHOLD_MS,
} from "./promotion-pipeline.js";
export type {
	RelevanceConfig,
	RelevanceInput,
	RelevanceShape,
	RelevanceWeights,
} from "./relevance-engine.js";
export {
	computeRelevanceScore,
	DEFAULT_RELEVANCE_CONFIG,
} from "./relevance-engine.js";
export { rankAndBudget, scoreItem } from "./relevance-scoring.js";
export { communityForRole } from "./role-community-map.js";
export type {
	AttentionWeights,
	ScoringContext,
	ScoringWeights,
} from "./scoring-config.js";
export {
	ATTENTION_THRESHOLD,
	BUDGET_ALLOCATION,
	CONTEXT_WINDOW_TOKENS,
	DEFAULT_KNOWLEDGE_BUDGET,
	getDefaultAttentionWeights,
	getDefaultWeights,
	KNOWLEDGE_ALLOCATION_RATIO,
	loadAttentionWeights,
	loadRelevanceConfig,
	loadScoringWeights,
} from "./scoring-config.js";
export type {
	RoutineSessionContextConfig,
	RoutineSessionContextData,
	SessionContextConfig,
	SessionContextData,
} from "./session-context.js";
export {
	buildRoutineSessionContextData,
	buildSessionContext,
	buildSessionContextData,
} from "./session-context.js";
export type { ScoredItem } from "./token-budget.js";
export { countItemTokens, countTokens, enforceBudget } from "./token-budget.js";
export type {
	AutonomyLevel,
	KnowledgeAccessorKind,
	KnowledgeKind,
	KnowledgeLayer,
	KnowledgeRelevanceSignals,
	KnowledgeScope,
	KnowledgeSortOption,
	KnowledgeStatus,
	KnowledgeTopicHealth,
	PropagationLevel,
	PropagationResult,
	PropagationStatus,
	RiskTier,
} from "./types.js";
export {
	KNOWLEDGE_LAYERS,
	KNOWLEDGE_SCOPES,
	KNOWLEDGE_SORT_OPTIONS,
	KNOWLEDGE_STATUS_LABEL,
	KNOWLEDGE_STATUSES,
	KNOWLEDGE_TOPIC_HEALTHS,
	SCOPE_TO_LAYER,
	scopeToLayer,
} from "./types.js";
export type { WritebackChange, WritebackConfig, WritebackResult } from "./writeback.js";
export {
	getRelativePath,
	isKnowledgePath,
	isSessionNotesPath,
	isWatchedPath,
	processWriteback,
	readManifest,
	writeManifest,
} from "./writeback.js";

// ── AV3: Scope bucket label helper (SSOT — used by server + web) ──

// ── AU21 §6 Decision B4/§12: shared pre-handoff failure emission ──
export {
	isAgentWorkIntentKind,
	isAgentWorkIntentSourceKind,
	reportAdmissionFailure,
} from "./agent-run-admission.js";
// ── AU19 §11 (AC-9): cross-Layer AgentWorkIntentRecorder/Reader seam ──
export type {
	AgentWorkIntentReader,
	AgentWorkIntentRecorder,
	AgentWorkIntentRecorderInput,
	BakedAgentRunnableConfig,
	BakedConnectionForProvisioning,
	BakedConnectionsForProvisioning,
	BakedContextBundle,
	BakedContextKnowledgeItem,
	BakedFilesystemForProvisioning,
	BakedWorkIntentRequest,
	SessionKnowledgeItemLike,
} from "./agent-work-intent-recorder.js";
// ── AU21 §9 Increment 12 (Decision H3), Wave B: shared contextBundle knowledge-item mapper ──
// ── AU21 §9 Increment 12 (Decision H3), Wave E: shared agent-runnable-config whitelist mapper ──
export {
	bakeAgentRunnableConfig,
	toBakedContextKnowledgeItems,
} from "./agent-work-intent-recorder.js";
export { scopeKindToLabel } from "./scope-labels.js";

// ── AK3: Bet decomposition types + constants ──

export type {
	AgentBehaviorConfigErrorResponse,
	AgentBehaviorConfigKind,
	AgentBehaviorConfigLink,
	AgentBehaviorConfigListResponse,
	AgentBehaviorConfigPatchRequest,
	AgentBehaviorConfigPatchResponse,
	AgentBehaviorConfigView,
	AgentBehaviorEditableField,
	AgentBehaviorFieldKind,
	AgentBehaviorOriginState,
	AgentBehaviorOriginType,
	AgentBehaviorOriginView,
	AgentBehaviorPromptSource,
	AgentBehaviorTriggerSummary,
	AgentBehaviorValueSource,
} from "./agent-behavior-config.js";
export {
	AGENT_BEHAVIOR_CONFIG_KINDS,
	isAgentBehaviorConfigKind,
} from "./agent-behavior-config.js";
// ── AB1: Agent profile wire types ──
export type {
	AgentActiveSession,
	AgentHarnessCapabilities,
	AgentHealthSignals,
	AgentPerformanceStats,
	AgentProfileResponse,
	AgentReviewTrackRecord,
	AgentSessionSummary,
	AgentVerdictEntry,
} from "./agent-profile.js";
// ── AB0: Agent role catalog and category system ──
export type {
	AgentRoleCatalogEntry,
	TeamFunction,
} from "./agent-roles.js";
export {
	AGENT_ROLE_CATALOG,
	communityForRole,
	defaultRoster,
	findRoleCatalogEntry,
	roleLabel,
	TEAM_FUNCTIONS,
} from "./agent-roles.js";
export type { ApiErrorCode, ApiErrorResponse } from "./api-types.js";
export { API_ERROR_CODES } from "./api-types.js";
// ── AU19 Increment 4: artifactPreviewSchema (reclassified from
// packages/server/src/schemas/artifact-preview.ts — zero server-specific
// dependency, needed by both routes/artifacts.ts (core-api) and
// create-artifact.ts (agent-orchestration/tool-handlers)) ──
export { artifactPreviewSchema, fallbackPreviewSchema } from "./artifact-preview.js";
// ── S1: Per-user auth types ──
export type { InviteRole } from "./auth.js";
export { INVITE_CODE_TTL_MS, INVITE_ROLES, LOGIN_SESSION_TTL_MS } from "./auth.js";
// ── Block primitive (L2) ──
export type {
	Block,
	BlockAnchor,
	BlockDerivationResult,
	BlockHostKind,
	BlockId,
	BlockKind,
	BlockPayload,
	InlineNode,
	ListItem,
} from "./blocks/index.js";
export {
	assertNoCollisions,
	BLOCK_HOST_KINDS,
	BLOCK_ID_VERSION,
	BLOCK_KINDS,
	blockId,
	deriveBlocks,
	derivePayloads,
	IMAGE_URL_SAFE_SCHEMES,
	LINK_URL_SAFE_SCHEMES,
	MAX_BODY_BYTES,
	normalisedPayload,
	slug,
} from "./blocks/index.js";
// ── AU19 Increment 1f: built-in tool catalog (moved from packages/server/src/config) ──
export type { ToolCatalogEntry } from "./builtin-tool-catalog.js";
export { BUILTIN_TOOL_CATALOG } from "./builtin-tool-catalog.js";
export type {
	ConfigurationKind,
	ConfigurationOrigin,
	ConfigurationOriginType,
	ConfigurationValueSource,
	PluginState,
	ResolvedConfigurationItem,
} from "./configuration.js";
export {
	BUILTIN_PLUGIN_ID,
	CONFIGURATION_KINDS,
	isConfigurationKind,
	isPluginState,
	PLUGIN_STATES,
} from "./configuration.js";
// ── AN1: ServiceConnection types ──
export type {
	ConnectionAuthSource,
	ConnectionHealth,
	HeldAuthSource,
	ServiceConnectionView,
} from "./connection.js";
export {
	CONNECTION_AUTH_SOURCES,
	CONNECTION_HEALTH,
	HELD_AUTH_SOURCES,
	isConnectionAuthSource,
	isHeldAuthSource,
} from "./connection.js";
// ── Credential catalog (P3) ──
export type {
	CredentialCatalogEntry,
	CredentialName,
	CredentialResolver,
	CredentialState,
} from "./credential.js";
export {
	CREDENTIAL_CATALOG,
	CREDENTIAL_NAMES,
	CREDENTIAL_STATES,
	isCredentialName,
} from "./credential.js";
// -- cron (AU20 Stage 2: pure cron utilities — relocated from dispatch port to shared) --
export { type CronFields, computeNextRunAt, nextCronMatch, parseCron } from "./cron.js";
export {
	ActiveRoutinesError,
	ASSISTANT_TURN_TIMEOUT_MS,
	CapacityExceededError,
	CassetteMissError,
	ConcurrencyLimitError,
	HttpError,
	InvalidTransitionError,
	MissingCredentialError,
	NoEligibleHarnessError,
	ProviderTimeoutError,
	TargetAgentNotRunnableError,
	VersionConflictError,
} from "./errors.js";
export { EventBus } from "./event-bus.js";
export type {
	AgentAddedEvent,
	AgentRunAdmissionFailedEvent,
	AgentRunAdmissionFailureCode,
	AgentRunLifecycleChangedEvent,
	AgentWorkIntentEvent,
	AgentWorkIntentKind,
	AgentWorkIntentSourceKind,
	ArtifactCreatedEvent,
	BetRevisedEvent,
	BetStateChangedEvent,
	DependencyMetEvent,
	DomainEvent,
	EventBusAdapter,
	EventByType,
	EventHandler,
	EventType,
	ItemCreatedEvent,
	KernelEvent,
	KnowledgeAccessedEvent,
	KnowledgeArchivedEvent,
	KnowledgeCreatedEvent,
	KnowledgeUpdatedEvent,
	NotificationEvent,
	PropagationAppliedEvent,
	PropagationFailedEvent,
	// AL7 trust-first: renamed from OperationExecutedEvent
	ProposedCallExecutedEvent,
	ProposedCallGrantedEvent,
	RoutineFiredEvent,
	SandboxWritebackChange,
	SandboxWritebackChangesDetectedEvent,
	SessionEndedEvent,
	SessionHandoffCompletedEvent,
	SessionNotReturnedEvent,
	SessionOutcome,
	SessionStartedEvent,
	StrategyEvent,
	TaskStateChangedEvent,
	TeamCreatedEvent,
	ThreadArchivedEvent,
	ThreadCreatedEvent,
	ThreadMessageAppendedEvent,
	ThreadReopenedEvent,
	ThreadResolvedEvent,
	ToolCallRecordedEvent,
	UserCreatedEvent,
	WildcardHandler,
	WildcardType,
	WorkSelectionRequestedEvent,
} from "./events.js";
// AU21 §6 Decision G: canonical runtime kind list `AgentWorkIntentKind` is built from.
export { AGENT_WORK_INTENT_KINDS } from "./events.js";
// ── AK6: Factory-roster injection seam ──
export type {
	FactoryFacilitatorSpec,
	FactoryRosterSpec,
	FactorySystemAssistantSpec,
} from "./factory-roster.js";
export { defaultFactoryRoster, minimalFactoryRoster } from "./factory-roster.js";
// ── AO1: Filesystem primitive ──
export type {
	CaptureResult,
	Filesystem,
	FilesystemAuth,
	FilesystemAuthResolver,
	FilesystemInjection,
	FilesystemKind,
	FilesystemMounter,
	FilesystemSource,
	FilesystemState,
	MountResult,
	ResourceRef,
	WriteBack,
} from "./filesystem.js";
export {
	FILESYSTEM_KINDS,
	FILESYSTEM_SOURCES,
	SUBSTRATE_STATES,
	WRITEBACK_MODES,
} from "./filesystem.js";
export { deriveTitle, deriveTitleFromPitch } from "./format/bet.js";
export { formatMoney, formatTokenCount } from "./format/money.js";
export type { TimestampInput } from "./format/time.js";
export {
	absoluteDate,
	absoluteDateTime,
	clockTime,
	relativeLong,
	relativeShort,
	TIME_PLACEHOLDER,
} from "./format/time.js";
// ── AU19 Increment 4: harness-registry's EnforcementRegistry (crosses the
// harness-registry ↔ mcp-provider ↔ tool-provider intra-execution boundary) ──
export type { EnforcementEntry, EnforcementRegistry } from "./harness/enforcement-registry.js";
export type {
	AdapterInfo,
	AdapterMeta,
	CompletionEvent,
	ConversationMessage,
	ErrorEvent,
	HarnessAccessMode,
	HarnessAdapter,
	// AU27 Increment 8: harness adapter type identifiers
	HarnessAdapterType,
	HarnessAuthActionDescriptor,
	HarnessAuthActionKind,
	HarnessCapabilities,
	HarnessCapabilityDescriptor,
	// AU26 A2: the harness capability read model
	HarnessCapabilityFilter,
	HarnessCapabilityReader,
	HarnessDiscoveryStatus,
	HarnessEvent,
	HarnessEventType,
	HarnessModelDescriptor,
	HarnessModelOptionControl,
	HarnessModelOptionDescriptor,
	HarnessOptionChoice,
	HarnessOptionControlKind,
	HarnessReadinessState,
	HarnessRuntimeCapabilities,
	// AN1: inherited tools enumeration
	InheritedToolDescriptor,
	// AU27 Increment 8: harness-literal tool namer function type
	LiteralToolNamer,
	McpConnectionInfo,
	PreCompactionEvent,
	// Return action name type
	ReturnActionName,
	// Per-harness enforcement channel + hook config
	ReturnEnforcementChannel,
	ReturnHookConfig,
	ServerDispatchMessage,
	ServerRegisteredMessage,
	ServerStopMessage,
	ServerToWorkerMessage,
	SessionConfig,
	SessionHandle,
	SessionMetrics,
	SessionResult,
	// AL7: session workflow for route-to-review gate
	SessionWorkflow,
	TokenUsageEvent,
	ToolCallEvent,
	WorkerErrorMessage,
	WorkerEventMessage,
	WorkerPauseMessage,
	WorkerRegisterMessage,
	WorkerResumeMessage,
	WorkerSessionResultMessage,
	WorkerToServerMessage,
} from "./harness/index.js";
export {
	// AU27 Increment 3: tailored forcing message + required-set predicate
	buildForceReturnMessage,
	// AV1: derive PrimaryHarnessConfig from a HarnessCapabilityDescriptor
	derivePrimaryHarness,
	// Forcing constants + helper
	FORCE_RETURN_MESSAGE,
	HARNESS_OPTION_CONTROL_KINDS,
	// AU26 A2: the six stateless capability-read forwarders
	harnessCapabilitiesForType,
	harnessCapabilityDescriptors,
	harnessRegistrationMeta,
	isHarnessEvent,
	isInternalExtractionDrain,
	isRequiredReturnAction,
	isReturnAction,
	// AU27 Increment 8: harness-literal tool naming for return-action mentions
	literalToolNamerForAdapterType,
	MAX_FORCE_RETURNS,
	MockHarnessAdapter,
	mcpNamespacedToolName,
	normalizeHarnessEvent,
	opencodeToolName,
	// claude CLI adapter: pre-map for stream-json events
	preMapClaudeEvent,
	// Closed accepted-return set
	RETURN_ACTION_NAMES,
	refreshHarnessDiscoveries,
	registeredHarnessCount,
	shouldForceReturn,
	workerConnections,
} from "./harness/index.js";
// ── AU19 §7.4: HarnessPort — the one genuine cross-process seam ──
export type {
	AdmittedRun,
	HarnessPort,
	HarnessPortDeps,
	HarnessRunOutput,
	RunContextBundle,
} from "./harness-port.js";
// ── Hint catalog (P5) ──
export type { HintCatalogEntry, HintId } from "./hint.js";
export { HINT_CATALOG, HINT_IDS, isHintId } from "./hint.js";
export { deriveInitials } from "./initials.js";
// AM5 K4b: code kind schema + definition (purified to {path,lang,text})
// CodePreview type already exported below via types/artifact.ts
export { codeKind, codePreviewSchema } from "./kinds/code.js";
// AE6: Kind registry exports (new)
export type { KindDefinition } from "./kinds/kind-definition.js";
export type { OldKindMapping } from "./kinds/old-kind-map.js";
export { OLD_KIND_MAP } from "./kinds/old-kind-map.js";
// getKindDefinition and isRegisteredKind exported via types/artifact.ts re-export from registry
export { getKindDefinition, isRegisteredKind } from "./kinds/registry.js";
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
} from "./knowledge.js";
export {
	KNOWLEDGE_LAYERS,
	KNOWLEDGE_SCOPES,
	KNOWLEDGE_SORT_OPTIONS,
	KNOWLEDGE_STATUS_LABEL,
	KNOWLEDGE_STATUSES,
	KNOWLEDGE_TOPIC_HEALTHS,
	SCOPE_TO_LAYER,
	scopeToLayer,
} from "./knowledge.js";
export { createLogger, type Logger } from "./logger.js";
// ── AE5: Mention parsing utilities ──
export type {
	MentionCandidate,
	MentionSegment,
	ResolvedMention,
} from "./mention.js";
export {
	extractMentionCandidates,
	MAX_MENTIONS_PER_MESSAGE,
	resolveMentions,
	segmentMentions,
} from "./mention.js";
// ── X4: Model Gateway ──
// @lore AU21 Increment 14b (Decision L2): `resolveModel`/`UnsupportedAgentProviderError`/
// `ModelRequest` moved here from the dissolved `@hyperidle/model-gateway`
// core-api package — a pure, stateless fn now lives beside the types it
// already shared this module with.
export type {
	ModelCatalogEntry,
	ModelGatewayConfig,
	ModelProvider,
	ModelRequest,
	ModelTierConfig,
	ResolvedModel,
} from "./model-gateway.js";
export {
	BUILT_IN_GATEWAY_CONFIG,
	catalogEntry,
	DEFAULT_AGENT_HARNESS,
	DEFAULT_AGENT_MODEL_ID,
	DEFAULT_AGENT_MODEL_PROVIDER,
	isCatalogModel,
	MODEL_CATALOG,
	MODEL_PROVIDERS,
	resolveModel,
	UnsupportedAgentProviderError,
} from "./model-gateway.js";
// SSRF utilities use node:dns/net/util and cannot be imported in the browser.
// Server code imports them via "@hyperidle/shared/net" subpath export instead.
export type { ResolveResult, SanitizeResult, SanitizeUrlOptions } from "./net/ssrf.js";
// ── AF8: Notification type registry ──
export type {
	NotificationType,
	NotificationTypeKey,
	NotificationUrgency,
} from "./notifications.js";
export { NOTIFICATION_TYPES, shortLabelForType, urgencyForType } from "./notifications.js";
export type { ObservabilityEvent } from "./observability/events.js";
// ── AM1: Part vocabulary + source adapters (source-agnostic) ──
export type {
	Embed,
	EmbedKind,
	FoldDescriptor,
	OpenHandler,
	OpenTarget,
	Part,
	PartAuthor,
	PartGroup,
	PartId,
	PartKind,
	ReviewTarget,
	ToolKind,
	ToolRunBlock,
} from "./part.js";
export {
	aggregateToolRun,
	deriveComposerPills,
	derivePartsFromMessages,
	derivePartsFromSession,
	EMBED_KINDS,
	groupParts,
	PART_KINDS,
	TOOL_KINDS,
} from "./part.js";
// ── AL7: Proposed Call constants + types (trust-first redo) ──
export type {
	ProposedCall,
	ProposedCallStatus,
	Reversibility,
} from "./proposed-call.js";
export { PROPOSED_CALL_STATUSES, REVERSIBILITY } from "./proposed-call.js";
export {
	AWS_AKIA_RE,
	BEARER_TOKEN_RE,
	ERROR_TOKEN_PATTERNS,
	GITHUB_TOKEN_RE,
	GOOGLE_API_KEY_RE,
	HEX_TOKEN_RE,
	JWT_RE,
	PEM_BLOCK_RE,
	PK_TOKEN_RE,
	REDACTED_TAG,
	redactDbUrl,
	SK_TOKEN_RE,
	SLACK_TOKEN_RE,
	STRIPE_TOKEN_RE,
	scrubInlineTokens,
	summarizeToolArgs,
	TK_TOKEN_RE,
} from "./redact.js";
// ── Routine primitive (AA1 + AA2 + AA3) ──
export type {
	RoutineCardSummary,
	RoutineCreatePayload,
	RoutineDetail,
	RoutineInfo,
	RoutineRunOutcome,
	RoutineRunSummary,
	RoutineState,
} from "./routine.js";
export { ROUTINE_RUN_OUTCOMES, ROUTINE_STATES, SCHEDULE_PRESETS } from "./routine.js";
// ── AM3: Normalized session ActivityEntry union ──
export type {
	ActivityEntry,
	AnswerDeltaData,
	AnswerSettledData,
	HumanMessageData,
	ReasoningData,
	ToolCallData,
} from "./session-activity.js";
export type {
	AgentSessionPromptMode,
	AgentSessionRequestInput,
	AgentSessionRequestStatus,
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	SessionLifecycleCorrelation,
} from "./session-request.js";
export {
	AGENT_SESSION_PROMPT_MODES,
	AGENT_SESSION_REQUEST_STATUSES,
	AGENT_SESSION_SOURCE_KINDS,
	agentSessionRequestInputSchema,
	assistantSessionRequestInputSchema,
	buildSessionLifecycleCorrelation,
	knowledgeSessionRequestInputSchema,
	proposedCallSessionRequestInputSchema,
	routineSessionRequestInputSchema,
	taskSessionRequestInputSchema,
} from "./session-request.js";
export {
	canTransitionTaskState,
	TASK_STATE_TRANSITIONS,
	TaskInvalidTransitionError,
} from "./task-transition.js";
// ── Team primitive (L13, formerly Product) ──
export type {
	AgentHealthLevel,
	AgentOperationalStatus,
	BetCardSummary,
	CreateTeamRequest,
	CreateTeamResponse,
	PrimaryHarnessConfig,
	RosterMember,
	TeamBurn,
	TeamDetail,
	TeamListItem,
	TeamListResponse,
	TeamStatus,
	TeamSummary,
} from "./team.js";
export type {
	AgentSessionStateSnapshot,
	AnchorRef,
	ArtifactRef,
	ArtifactThreadSummary,
	ArtifactThreadSummaryResponse,
	ArtifactViewShape,
	AssistantNotice,
	BlockRef,
	EntityRef,
	HeadCollapseResult,
	HostKind,
	IdentityId,
	InlineRef,
	InlineRefKind,
	MentionRef,
	Message,
	MessageId,
	MessageType,
	PlainPayload,
	PlainPayloadWithBlockId,
	QuestionnairePayload,
	RedactedPayload,
	ReviewPayload,
	Thread,
	ThreadConfiguration,
	ThreadId,
	ToolCallSummary,
	VerdictDecision,
	VerdictPayload,
} from "./thread.js";
// L1a — Thread primitive (concept §4.5, plan §4). Stub during write-tests
// phase; functions throw "Not implemented" until the green phase fills
// them in.
export {
	ARTIFACT_VIEW_SHAPES,
	classifyThreadConfiguration,
	exhaustiveAssert,
	HOST_KINDS,
	headCollapsePredicate,
	isBlocking,
	isRedactedPayload,
	MESSAGE_TYPES,
	promotedRichMessageId,
	VERDICT_DECISIONS,
	verdictDecisionLabel,
	verdictDecisionToStatus,
} from "./thread.js";
// ── AU19 Increment 4 (§7.5 C1): tool-provider/tool-handlers cross-boundary types ──
export type {
	AssistantToolResult,
	AssistantToolShape,
	BuildToolRegistryOptions,
	ClaudeToolSpec,
	ProposedCallWorkflowPort,
	RegisteredTool,
	RegistrySessionWorkflow,
	ToolContext,
	ToolDefinition,
	ToolHandler,
	ToolRegistry,
	ToolResult,
} from "./tool.js";
export {
	canonicalJson,
	classifyReversibility,
	composeWorkflowAllowDeny,
	err,
	identityHash,
	ok,
	toClaudeToolSpec,
	toolsForRole,
	toRegistered,
	wrapForRegistry,
} from "./tool.js";
export { decode, decodeTyped, encode, encodeTyped } from "./toon-codec.js";
export { ToonParseError } from "./toon-errors.js";
export type {
	TriggerEventType,
	TriggerResolutionResult,
	TriggerResultState,
	TriggerRuleValue,
} from "./trigger.js";
export {
	isTriggerEventType,
	TRIGGER_EVENT_TYPES,
	TRIGGER_RESULT_STATES,
	TriggerRuleValueSchema,
} from "./trigger.js";
export type {
	Artifact,
	ArtifactFilterAxis,
	ArtifactKind,
	ArtifactPage,
	ArtifactPreview,
	ArtifactQuery,
	CodePreview,
	CreateArtifactInput,
	DataPreview,
	HtmlPreview,
	ImagePreview,
	TextPreview,
	UrlPreview,
} from "./types/artifact.js";
// ARTIFACT_KINDS from types/artifact.js (which re-exports from kinds/registry.js)
export { ARTIFACT_KINDS, artifactDisplayTitle, summarizePreview } from "./types/artifact.js";
export type {
	CurrencyCode,
	ModelTier as MoneyModelTier,
	Money,
	TierTokenCount,
	TokenUsage,
	WireMoney,
} from "./types/money.js";
export {
	addMoney,
	addTokenUsage,
	CURRENCY_CODES,
	CURRENCY_SCALE,
	compareMoney,
	moneyFromWire,
	moneyToWire,
	scaleForCurrency,
	totalTokens,
	zeroMoney,
} from "./types/money.js";
export type {
	AgentCategory,
	BetOutcomeVerdict,
	BetStatus,
	HealthResponse,
	KernelKnowledgeStatus,
	KnowledgeFormat,
	ModelTier,
	MutableBetField,
	OrgEdgeMechanism,
	ScopeKind,
	SessionState,
	TaskOutcomeVerdict,
	TaskState,
	TriggerType,
	UserKind,
	UserRole,
	UserStatus,
} from "./types.js";
export {
	AGENT_CATEGORIES,
	AGENT_OPERATIONAL_STATUS_LABEL,
	BET_OUTCOME_VERDICT_LABEL,
	BET_OUTCOME_VERDICTS,
	BET_STATUS_LABEL,
	BET_STATUSES,
	KERNEL_KNOWLEDGE_STATUSES,
	MODEL_TIERS,
	MUTABLE_BET_FIELDS,
	ORG_EDGE_MECHANISMS,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	TASK_OUTCOME_VERDICT_LABEL,
	TASK_OUTCOME_VERDICTS,
	TASK_STATE_LABEL,
	TASK_STATES,
	USER_KINDS,
} from "./types.js";
// -- validate-env (AU19 Increment 5: relocated from packages/server per §5 — Application boot util) --
export { LAPTOP_DEV_API_KEY, validateStartupEnv } from "./validate-env.js";

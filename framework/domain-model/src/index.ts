export type {
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
	AgentBehaviorValueSource,
} from "./agent-behavior-config.js";
export { AGENT_BEHAVIOR_CONFIG_KINDS, isAgentBehaviorConfigKind } from "./agent-behavior-config.js";
// AgentActiveSession, AgentSessionSummary, AgentPerformanceStats, AgentHealthSignals
// moved to layers/core-ui/src/hooks/agent-health.ts (AU44 batch 8).
export type {
	AgentHarnessCapabilities,
	AgentProfileResponse,
	AgentReviewTrackRecord,
	AgentVerdictEntry,
} from "./agent-profile.js";
export type { AgentRoleCatalogEntry } from "./agent-roles.js";
export {
	AGENT_ROLE_CATALOG,
	communityForRole,
	defaultRoster,
	findRoleCatalogEntry,
	roleLabel,
	TEAM_FUNCTIONS,
} from "./agent-roles.js";
// HealthSignalInput, computeHealthSignals, deriveHealthLevel, deriveHealthDetail
// moved to layers/core-ui/src/hooks/agent-health.ts (AU44 batch 8).
export type {
	AgentRunActiveCountsResponse,
	AgentRunLatestOutcomesResponse,
	AgentRunSummary,
	AgentRunsResponse,
} from "./agent-run-view.js";
// isAgentWorkIntentKind, isAgentWorkIntentSourceKind moved to agent-orchestration (AU44-b8)
export type { ApiErrorResponse } from "./api-types.js";
export { API_ERROR_CODES } from "./api-types.js";
export { artifactPreviewSchema, fallbackPreviewSchema } from "./artifact-preview.js";
export type { InviteRole } from "./auth.js";
export { INVITE_CODE_TTL_MS, INVITE_ROLES, LOGIN_SESSION_TTL_MS } from "./auth.js";
// Block types moved to layers/core-ui/src/block/types.ts (AU44 batch8).
// core-ui callers import from relative path; server-side uses are inlined or dropped.
export type {
	ConfigurationKind,
	ConfigurationOrigin,
	ConfigurationOriginType,
	ConfigurationValueSource,
	PluginScopeKind,
	PluginState,
	ResolvedConfigurationItem,
} from "./configuration.js";
export {
	BUILTIN_PLUGIN_ID,
	CONFIGURATION_KINDS,
	PLUGIN_SCOPE_KINDS,
	PLUGIN_STATES,
} from "./configuration.js";
export type {
	ConnectionAuthSource,
	ConnectionHealth,
	HeldAuthSource,
	ServiceConnectionView,
} from "./connection.js";
// InheritedConnectionFact moved to @hyperidle/connections (AU44-b8).
// HeldAuthSource/HELD_AUTH_SOURCES: survivor in domain-model (run-orchestration service cannot cross to connections service).
export {
	CONNECTION_AUTH_SOURCES,
	CONNECTION_HEALTH,
	HELD_AUTH_SOURCES,
} from "./connection.js";
export type { CredentialName, CredentialState } from "./credential.js";
export {
	CREDENTIAL_BY_PROVIDER,
	CREDENTIAL_CATALOG,
	CREDENTIAL_NAMES,
	CREDENTIAL_STATES,
	credentialNameForProvider,
	isCredentialName,
} from "./credential.js";
export {
	ASSISTANT_TURN_TIMEOUT_MS,
	CapacityExceededError,
	HttpError,
	InvalidTransitionError,
	MissingCredentialError,
	TaskInvalidTransitionError,
} from "./errors.js";
// Event vocabulary dissolved to framework/event-bus (AU44 batch 8).
// Callers import event types from @hyperidle/event-bus.
// SessionOutcome is the one exception: core-ui uses it and cannot reach event-bus.
export type { SessionOutcome } from "./events.js";
export type { HintId } from "./hint.js";
export { HINT_CATALOG, HINT_IDS, isHintId } from "./hint.js";
// HyperIdleEnv, ValidatedJson, constantTimeStringEqual, validateBody: server-only (node:crypto).
// Import from "@hyperidle/domain-model/http" — never via the barrel (Vite bundles barrel into core-ui).
export { OLD_KIND_MAP } from "./kinds/old-kind-map.js";
// ArtifactKind, TextPreview, CodePreview, ImagePreview, DataPreview, HtmlPreview, UrlPreview
// unexported (SIMPLIFY): derived from closed sets; no external consumer names them directly.
export { ARTIFACT_KINDS, getKindDefinition, isRegisteredKind } from "./kinds/registry.js";
export type {
	KnowledgeAccessorKind,
	KnowledgeKind,
	KnowledgeLayer,
	KnowledgeRole,
	KnowledgeScope,
	KnowledgeSortOption,
	KnowledgeStatus,
	KnowledgeTopicHealth,
	PropagationLevel,
} from "./knowledge.js";
export {
	KNOWLEDGE_LAYERS,
	KNOWLEDGE_ROLES,
	KNOWLEDGE_SCOPES,
	KNOWLEDGE_SORT_OPTIONS,
	KNOWLEDGE_STATUS_LABEL,
	KNOWLEDGE_STATUSES,
	KNOWLEDGE_TOPIC_HEALTHS,
	SCOPE_TO_LAYER,
	scopeToLayer,
} from "./knowledge.js";
// MentionSegment MERGE → core-ui/ds/mention-segments.ts (AU44 batch 8)
export type { MentionCandidate, ResolvedMention } from "./mention.js";
export {
	extractMentionCandidates,
	MAX_MENTIONS_PER_MESSAGE,
	resolveMentions,
	// segmentMentions MERGE → core-ui/ds/mention-segments.ts (AU44 batch 8)
} from "./mention.js";
export type {
	ModelGatewayConfig,
	ModelProvider,
	ModelRequest,
	ModelTierConfig,
	ResolvedModel,
} from "./model-gateway.js";
// ModelCatalogEntry unexported (SIMPLIFY): element type of MODEL_CATALOG; no external consumer names it directly.
// catalogEntry, isCatalogModel moved to layers/core-api/src/model-utils.ts (AU44-b8).
export {
	BUILT_IN_GATEWAY_CONFIG,
	DEFAULT_AGENT_HARNESS,
	DEFAULT_AGENT_MODEL_ID,
	DEFAULT_AGENT_MODEL_PROVIDER,
	MODEL_CATALOG,
	MODEL_PROVIDERS,
} from "./model-gateway.js";
export type { NotificationType, NotificationTypeKey } from "./notifications.js";
// NotificationUrgency unexported (SIMPLIFY): member of registry entry; no external consumer names it directly.
// shortLabelForType MERGE → core-ui/shell/notification-display.ts (AU44 batch 8)
export { NOTIFICATION_TYPES } from "./notifications.js";
export type { ProposedCall, ProposedCallStatus, Reversibility } from "./proposed-call.js";
export { PROPOSED_CALL_STATUSES, REVERSIBILITY } from "./proposed-call.js";
export type {
	RoutineCardSummary,
	RoutineDetail,
	RoutineInfo,
	RoutineRunOutcome,
	RoutineRunSummary,
	RoutineState,
} from "./routine.js";
export { ROUTINE_RUN_OUTCOMES, ROUTINE_STATES, SCHEDULE_PRESETS } from "./routine.js";
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
	knowledgeSessionRequestInputSchema,
	proposedCallSessionRequestInputSchema,
	routineSessionRequestInputSchema,
	taskSessionRequestInputSchema,
} from "./session-request.js";
export { canTransitionTaskState, TASK_STATE_TRANSITIONS } from "./task-transition.js";
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
	AssistantNotice,
	// BlockId + BlockHostKind: wire types embedded in AnchorRef/BlockRef; inlined in
	// thread.ts after blocks/types.ts dissolved into core-ui (AU44 batch 8).
	BlockHostKind,
	BlockId,
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
	ReviewCanvasArtifact,
	ReviewCanvasKind,
	ReviewPayload,
	Thread,
	ThreadId,
	ToolCallSummary,
	VerdictDecision,
	VerdictPayload,
} from "./thread.js";
export {
	HOST_KINDS,
	headCollapsePredicate,
	isBlocking,
	isRedactedPayload,
	MESSAGE_TYPES,
	// promotedRichMessageId MERGE → core-ui/ds/thread-display.ts (AU44 batch 8)
	REVIEW_CANVAS_KINDS,
	VERDICT_DECISIONS,
	verdictDecisionLabel,
	// verdictDecisionToStatus MERGE → core-ui/ds/status-mapping.ts (AU44 batch 8)
} from "./thread.js";
export type {
	Artifact,
	ArtifactFilterAxis,
	ArtifactPage,
	ArtifactPreview,
	ArtifactQuery,
} from "./types/artifact.js";
// artifactDisplayTitle, summarizePreview MERGE → core-ui/ds/artifact-display-helpers.ts (AU44 batch 8)
export type { TierTokenCount, TokenUsage } from "./types/money.js";
export type {
	AgentCategory,
	BetOutcomeVerdict,
	BetStatus,
	HarnessType,
	HealthResponse,
	KernelKnowledgeStatus,
	ModelTier,
	// @lore AU34: the one aliased publication the old substrate barrel carried. It reached
	// `types/money.ts` and was re-exported from there under a second name; the declaration is and
	// always was `ModelTier` in `types.ts`, so the alias is stated here rather than at a hop that no
	// longer exists.
	ModelTier as MoneyModelTier,
	OrgEdgeMechanism,
	ScopeKind,
	TaskOutcomeVerdict,
	TaskState,
	TriggerType,
} from "./types.js";
export {
	AGENT_CATEGORIES,
	AGENT_OPERATIONAL_STATUS_LABEL,
	BET_OUTCOME_VERDICT_LABEL,
	BET_OUTCOME_VERDICTS,
	BET_STATUS_LABEL,
	BET_STATUSES,
	HARNESS_TYPES,
	KERNEL_KNOWLEDGE_STATUSES,
	MODEL_TIERS,
	ORG_EDGE_MECHANISMS,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	scopeKindToLabel,
	TASK_OUTCOME_VERDICT_LABEL,
	TASK_OUTCOME_VERDICTS,
	TASK_STATE_LABEL,
	TASK_STATES,
} from "./types.js";
export type {
	AgentWorkIntentRecorderFn,
	AgentWorkIntentRecorderInput,
	BakedAgentRunnableConfig,
	BakedContextBundle,
	BakedContextKnowledgeItem,
	BakedWorkIntentRequest,
	RoutineTriggerEvent,
	SessionKnowledgeItemLike,
} from "./work-intent.js";
export { bakeAgentRunnableConfig, toBakedContextKnowledgeItems } from "./work-intent.js";

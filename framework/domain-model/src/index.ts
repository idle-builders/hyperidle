// the action list. `ActionDeclaration`/`Action*` are the generic shape;
// `TASK_ACTIONS` and friends are task's own declarations — the first of the
// per-object action lists, in `./actions/`.
export type { ActionDeclaration, ActionResult, Problem } from "./actions/action.js";
export type {
	EditTaskInput,
	SearchTasksInput,
	Task,
	TaskListItem,
	TaskNode,
	TaskView,
} from "./actions/task.js";
export {
	canTransitionTaskState,
	EditTaskInputSchema,
	editTask,
	openTask,
	SearchTasksInputSchema,
	searchTasks,
	TASK_ACTIONS,
	TASK_STATE_TRANSITIONS,
	TaskSchema,
	TaskViewSchema,
	taskInvariants,
} from "./actions/task.js";
// BC3 architecture.md §3.1: `Thread`, `Message` and the four payload
// interfaces moved out of `thread.ts` into `actions/thread.ts` as zod
// schemas — re-exported here under the SAME names so every existing
// importer keeps compiling against the name it already uses.
export type {
	AdjustThreadInput,
	Identity,
	Message,
	OpenThreadInput,
	PlainPayload,
	QuestionnairePayload,
	ReviewPayload,
	SearchThreadsInput,
	SendMessageInput,
	SendMessageOutput,
	Thread,
	ThreadListRow,
	ThreadView,
	VerdictPayload,
} from "./actions/thread.js";
export {
	AdjustThreadInputSchema,
	adjustThread,
	adjustThreadInvariants,
	agentsToWake,
	canReadThread,
	canWriteThread,
	entityRefSchema,
	IdentitySchema,
	inlineRefSchema,
	MessageSchema,
	mentionRefSchema,
	OpenThreadInputSchema,
	openThread,
	parseMessagePayload,
	plainPayloadSchema,
	questionnairePayloadSchema,
	reviewPayloadSchema,
	SearchThreadsInputSchema,
	SendMessageInputSchema,
	SendMessageOutputSchema,
	searchThreads,
	sendMessage,
	sendMessageInvariants,
	THREAD_ACTIONS,
	ThreadListRowSchema,
	ThreadSchema,
	ThreadViewSchema,
	threadParticipantsSchema,
	verdictPayloadSchema,
} from "./actions/thread.js";
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
export { roleLabel } from "./agent-roles.js";
// HealthSignalInput, computeHealthSignals, deriveHealthLevel, deriveHealthDetail
// moved to layers/core-ui/src/hooks/agent-health.ts (AU44 batch 8).
export type {
	AgentRunActiveCountsResponse,
	AgentRunSummary,
	AgentRunsResponse,
} from "./agent-run-view.js";
// isAgentWorkIntentKind, isAgentWorkIntentSourceKind moved to agent-orchestration (AU44-b8)
export type { ApiErrorResponse } from "./api-types.js";
export { API_ERROR_CODES } from "./api-types.js";
export type { InviteRole } from "./auth.js";
export { INVITE_CODE_TTL_MS, INVITE_ROLES, LOGIN_SESSION_TTL_MS } from "./auth.js";
// Block types moved to layers/core-ui/src/block/types.ts (AU44 batch8).
// core-ui callers import from relative path; server-side uses are inlined or dropped.
export type {
	ConfigurationKind,
	ConfigurationOrigin,
	ConfigurationOriginType,
	ConfigurationValueSource,
	PluginContributionKind,
	PluginScopeKind,
	PluginState,
	ResolvedConfigurationItem,
} from "./configuration.js";
export {
	BUILTIN_PLUGIN_ID,
	CONFIGURATION_KINDS,
	PLUGIN_CONTRIBUTION_KINDS,
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
	CREDENTIAL_CATALOG,
	CREDENTIAL_NAMES,
	CREDENTIAL_STATES,
	isCredentialName,
} from "./credential.js";
export {
	ASSISTANT_TURN_TIMEOUT_MS,
	CapacityExceededError,
	HttpError,
	InvalidTransitionError,
	MissingCredentialError,
	SeamRequestError,
	TaskCycleError,
	TaskDependencyBlockedError,
	TaskDependencyKilledError,
	TaskDependencyNotFoundError,
	TaskInvalidTransitionError,
} from "./errors.js";
// HyperIdleEnv, ValidatedJson, constantTimeStringEqual, validateBody: server-only (node:crypto).
// Import from "@hyperidle/domain-model/http" — never via the barrel (Vite bundles barrel into core-ui).
// ArtifactKind, TextPreview, CodePreview, ImagePreview, DataPreview, HtmlPreview, UrlPreview
// unexported (SIMPLIFY): derived from closed sets; no external consumer names them directly.
export type {
	KnowledgeAccessorKind,
	KnowledgeParentKind,
	KnowledgeRole,
	KnowledgeSortOption,
	KnowledgeStatus,
	PropagationLevel,
} from "./knowledge.js";
export {
	KNOWLEDGE_PARENT_KINDS,
	KNOWLEDGE_ROLE_LABEL,
	KNOWLEDGE_ROLES,
	KNOWLEDGE_SORT_OPTIONS,
	KNOWLEDGE_STATUS_LABEL,
	KNOWLEDGE_STATUSES,
} from "./knowledge.js";
// MentionSegment MERGE → core-ui/ds/mention-segments.ts (AU44 batch 8)
export type { MentionCandidate, ResolvedMention } from "./mention.js";
export {
	extractMentionCandidates,
	MAX_MENTIONS_PER_MESSAGE,
	resolveMentions,
	// segmentMentions MERGE → core-ui/ds/mention-segments.ts (AU44 batch 8)
} from "./mention.js";
// @lore `model-gateway.js` exported a resolution layer — ModelGatewayConfig,
// ModelTierConfig, ResolvedModel, ModelRequest, MODEL_CATALOG,
// BUILT_IN_GATEWAY_CONFIG and the DEFAULT_AGENT_MODEL_* pair. All of it served
// the built-in harness, which made provider API calls itself. It is now
// `model-provider.js`, and the provider names are all that is left.
export type { ModelProvider } from "./model-provider.js";
export { MODEL_PROVIDERS } from "./model-provider.js";
export type { NotificationType, NotificationTypeKey } from "./notifications.js";
// NotificationUrgency unexported (SIMPLIFY): member of registry entry; no external consumer names it directly.
// shortLabelForType MERGE → core-ui/shell/notification-display.ts (AU44 batch 8)
export { NOTIFICATION_TYPES } from "./notifications.js";
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
	routineSessionRequestInputSchema,
	taskSessionRequestInputSchema,
} from "./session-request.js";
export type {
	AgentHealthLevel,
	AgentOperationalStatus,
	CreateTeamRequest,
	CreateTeamResponse,
	PrimaryHarnessConfig,
	RosterMember,
	TaskCardSummary,
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
	AssistantNotice,
	// BlockId + BlockHostKind: wire types embedded in AnchorRef; inlined in
	// thread.ts after blocks/types.ts dissolved into core-ui (AU44 batch 8).
	BlockHostKind,
	BlockId,
	CanvasArtifactRef,
	EntityRef,
	HeadCollapseResult,
	HostKind,
	IdentityId,
	InlineRef,
	InlineRefKind,
	MentionRef,
	MessageId,
	MessageType,
	PlainPayloadWithBlockId,
	RedactedPayload,
	ReviewCanvasArtifact,
	ReviewCanvasKind,
	ThreadId,
	VerdictDecision,
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
// artifactDisplayTitle, summarizePreview MERGE → core-ui/ds/artifact-display-helpers.ts (AU44 batch 8)
export type { TierTokenCount, TokenUsage } from "./types/money.js";
// Event vocabulary dissolved to framework/event-bus (AU44 batch 8).
// Callers import event types from @hyperidle/event-bus.
// SessionOutcome is the one exception: core-ui uses it and cannot reach event-bus.
// @lore BC1: lives in types.js now — the domain-model events fork it used to
// live in (events.js) is deleted (dead: zero importers outside its own tests).
export type {
	AgentCategory,
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
	SessionOutcome,
	TaskOutcomeVerdict,
	TaskState,
	TriggerType,
} from "./types.js";
// @lore BB1: BetStatus, BET_STATUSES, BET_STATUS_LABEL removed — task vocabulary is the only work vocabulary.
export {
	AGENT_CATEGORIES,
	AGENT_OPERATIONAL_STATUS_LABEL,
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
	BakedSessionResumeRequest,
	BakedWorkIntentRequest,
	ReviewVerdictOutcome,
	ReviewVerdictRecorderFn,
	RoutineTriggerEvent,
	SessionKnowledgeItemLike,
} from "./work-intent.js";
export { bakeAgentRunnableConfig, toBakedContextKnowledgeItems } from "./work-intent.js";

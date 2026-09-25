// the action list. `ActionDeclaration`/`Action*` are the generic shape;
// `TASK_ACTIONS`/`THREAD_ACTIONS`/`DOCUMENT_ACTIONS` are each object's own
// declarations, in `./actions/`.
export type { ActionDeclaration, ActionResult, Problem } from "./actions/action.js";
// @lore BC4: `Document` is a DOM global in core-ui, so the row type is never
// called `Document` — see architecture.md §2. `document.ts` also carries the
// vocabulary that used to live in `./knowledge.js`, deleted whole by B22 —
// its constants had a real importer (`DOCUMENT_STATUSES`, replacing
// `KNOWLEDGE_STATUSES`, already declared here) or none at all.
export type {
	DocumentAs,
	DocumentListRow,
	DocumentParentKind,
	DocumentRow,
	DocumentSlot,
	DocumentStatus,
	DocumentView,
	EditDocumentInput,
	OpenDocumentInput,
	SearchDocumentsInput,
} from "./actions/document.js";
export {
	canReadDocument,
	DOCUMENT_ACTIONS,
	DOCUMENT_AS,
	DOCUMENT_PARENT_KINDS,
	DOCUMENT_SLOT_LABEL,
	DOCUMENT_SLOTS,
	DOCUMENT_STATUS_LABEL,
	DOCUMENT_STATUSES,
	DocumentListRowSchema,
	DocumentRowSchema,
	DocumentViewSchema,
	documentAs,
	EditDocumentInputSchema,
	editDocument,
	editDocumentInvariants,
	OpenDocumentInputSchema,
	openDocument,
	SearchDocumentsInputSchema,
	searchDocuments,
	searchDocumentsInvariants,
} from "./actions/document.js";
// @lore The platform action list — search, edit — declared here
// alongside `document`/`task`/`thread` for the same reason: `core-ui` needs
// the exact `input`/invariant shape the server runs. `platform.ts` also owns
// `PLUGIN_LIST_STATES` and `PluginScopeSchema`, not `./configuration.js` —
// that file keeps only the vocabulary this module and the settings package
// both need.
export type {
	AvailablePluginView,
	EditPluginInput,
	EditPluginSource,
	PluginContributionView,
	PluginListing,
	PluginListState,
	PluginScope,
	PluginView,
	SearchPluginsInput,
} from "./actions/platform.js";
export {
	EditPluginInputSchema,
	EditPluginSourceSchema,
	editPlugin,
	editPluginInvariants,
	PLATFORM_ACTIONS,
	PLUGIN_LIST_STATES,
	PluginContributionViewSchema,
	PluginScopeSchema,
	PluginViewSchema,
	SearchPluginsInputSchema,
	searchPlugins,
} from "./actions/platform.js";
// @lore The session action list — search, watch, stop — declared
// alongside `document`/`task`/`thread`/`platform`, same reason. No invariant
// export: the two candidates this module first drafted are both dropped —
// see `actions/session.ts`'s own header comment.
export type {
	SearchSessionsInput,
	SessionRow,
	SessionState,
	StopSessionInput,
	StopSessionOutput,
	WatchSessionInput,
	WatchSessionOutput,
} from "./actions/session.js";
export {
	ActivityEntrySchema,
	SESSION_ACTIONS,
	SESSION_STATES,
	SearchSessionsInputSchema,
	SessionRowSchema,
	StopSessionInputSchema,
	StopSessionOutputSchema,
	searchSessions,
	stopSession,
	WatchSessionInputSchema,
	WatchSessionOutputSchema,
	watchSession,
} from "./actions/session.js";
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
export type {
	AdjustThreadInput,
	Identity,
	Message,
	OpenThreadInput,
	PlainPayload,
	PlainReadPayload,
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
// @lore BC3: `Thread`, `Message` and the four payload interfaces moved out
// of `thread.ts` into `actions/thread.ts` as zod schemas — re-exported here
// under the SAME names so every existing importer keeps compiling against
// the name it already uses.
// @lore BC5: the user action list — search, open, edit — declared alongside
// `document`/`task`/`thread`/`session`/`platform`, same reason: `core-ui`
// needs the exact `input`/invariant shape the server runs. `user.ts` also
// carries the nine object-event names (`OBJECT_EVENTS`) and the change-row
// shape (`ChangeRowSchema`).
export type {
	AddSubscriptionInput,
	ChangeKind,
	ChangeObject,
	ChangeRow,
	ConnectionView,
	EditUserInput,
	FolderView,
	HarnessDescriptor,
	ObjectEventName,
	OpenUserInput,
	SearchUsersInput,
	SubscriptionView,
	UserKind,
	UserRow,
	UserStatus,
	UserView,
} from "./actions/user.js";
export {
	CHANGE_KINDS,
	CHANGE_OBJECTS,
	ChangeRowSchema,
	ConnectionViewSchema,
	EditUserInputSchema,
	editUser,
	editUserInvariants,
	FolderViewSchema,
	HarnessDescriptorSchema,
	OBJECT_EVENTS,
	OpenUserInputSchema,
	openUser,
	SearchUsersInputSchema,
	SubscriptionViewSchema,
	searchUsers,
	USER_ACTIONS,
	USER_KINDS,
	USER_STATUSES,
	UserRowSchema,
	UserViewSchema,
} from "./actions/user.js";
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
// AgentRunSummary, AgentRunsResponse, AgentRunActiveCountsResponse (agent-run-view.ts)
// deleted with the run-read routes: the session action list's `SessionRow`
// (./actions/session.js) is the browser's health-derivation input now.
// isAgentWorkIntentKind, isAgentWorkIntentSourceKind moved to agent-orchestration (AU44-b8)
export type { ApiErrorResponse } from "./api-types.js";
export { API_ERROR_CODES } from "./api-types.js";
export type { InviteRole } from "./auth.js";
export { INVITE_CODE_TTL_MS, INVITE_ROLES, LOGIN_SESSION_TTL_MS } from "./auth.js";
// Block types moved to layers/core-ui/src/block/types.ts (AU44 batch8).
// core-ui callers import from relative path; server-side uses are inlined or dropped.
export type { PluginContributionKind, PluginScopeKind, PluginState } from "./configuration.js";
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
// MentionSegment MERGE → core-ui/ds/mention-segments.ts (AU44 batch 8)
export type { ResolvedMention } from "./mention.js";
export {
	MAX_MENTIONS_PER_MESSAGE,
	resolveMentionsInText,
	// segmentMentions MERGE → core-ui/ds/mention-segments.ts (AU44 batch 8)
} from "./mention.js";
// @lore `model-gateway.js` exported a resolution layer — ModelGatewayConfig,
// ModelTierConfig, ResolvedModel, ModelRequest, MODEL_CATALOG,
// BUILT_IN_GATEWAY_CONFIG and the DEFAULT_AGENT_MODEL_* pair. All of it served
// the built-in harness, which made provider API calls itself. It is now
// `model-provider.js`, and the provider names are all that is left.
export type { ModelProvider } from "./model-provider.js";
export { MODEL_PROVIDERS } from "./model-provider.js";
// @lore BC5 T10/T11: notifications.ts (NotificationType/NotificationTypeKey/
// NOTIFICATION_TYPES/shortLabelForType) is DELETED — no production consumer
// was left once SettingsNotifications.tsx moved to per-event subscription
// toggles over `open_user({}).subscriptions`.
// @lore BC5 T11b: routine.ts (RoutineCardSummary/RoutineDetail/RoutineInfo/
// RoutineRunOutcome/RoutineRunSummary/RoutineState/ROUTINE_RUN_OUTCOMES/
// ROUTINE_STATES/SCHEDULE_PRESETS) is DELETED — its last production consumer,
// status-mapping.ts's ROUTINE_STATE_MAP, had no reader once the routine pages
// left in T9; a subscription has no lifecycle state of its own to chip.
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
	subscriptionSessionRequestInputSchema,
	taskSessionRequestInputSchema,
} from "./session-request.js";
export type { AgentHealthLevel, AgentOperationalStatus } from "./team.js";
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
	KernelDocumentStatus,
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
	KERNEL_DOCUMENT_STATUSES,
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
	BakedContextDocument,
	BakedSessionResumeRequest,
	BakedWorkIntentRequest,
	ReviewVerdictOutcome,
	ReviewVerdictRecorderFn,
	SessionDocumentLike,
} from "./work-intent.js";
export { bakeAgentRunnableConfig, toBakedContextDocuments } from "./work-intent.js";

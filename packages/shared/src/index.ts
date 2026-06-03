export type { ApiErrorCode, ApiErrorResponse } from "./api-types.js";
export { API_ERROR_CODES } from "./api-types.js";
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
// ── Credential catalog (P3) ──
export type { CredentialCatalogEntry, CredentialName, CredentialState } from "./credential.js";
export {
	CREDENTIAL_CATALOG,
	CREDENTIAL_NAMES,
	CREDENTIAL_STATES,
	isCredentialName,
} from "./credential.js";
export {
	ActiveRoutinesError,
	CapacityExceededError,
	ConcurrencyLimitError,
	CostCapExceededError,
	InvalidTransitionError,
	MissingCredentialError,
	VersionConflictError,
} from "./errors.js";
export { EventBus } from "./event-bus.js";
export type {
	ArtifactCreatedEvent,
	BetRevisedEvent,
	BetStateChangedEvent,
	CostCapBreachedEvent,
	CostCapWarningEvent,
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
	RoutineFiredEvent,
	SessionEndedEvent,
	SessionOutcome,
	SessionStartedEvent,
	StrategyEvent,
	TaskStateChangedEvent,
	ThreadArchivedEvent,
	ThreadCreatedEvent,
	ThreadMessageAppendedEvent,
	ThreadReopenedEvent,
	ThreadResolvedEvent,
	ToolCallRecordedEvent,
	WildcardHandler,
	WildcardType,
} from "./events.js";
export type { ArtifactCostInput } from "./format/artifact-cost.js";
export { formatArtifactCost } from "./format/artifact-cost.js";
export { deriveTitle, deriveTitleFromPitch } from "./format/bet.js";
export { formatMoney, formatTokenCount } from "./format/money.js";
export type {
	CompletionEvent,
	CostUpdateEvent,
	ErrorEvent,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	HarnessEventType,
	McpConnectionInfo,
	PreCompactionEvent,
	ServerDispatchMessage,
	ServerRegisteredMessage,
	ServerStopMessage,
	ServerToWorkerMessage,
	SessionConfig,
	SessionHandle,
	SessionResult,
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
export { MockHarnessAdapter } from "./harness/index.js";
// ── Hint catalog (P5) ──
export type { HintCatalogEntry, HintId } from "./hint.js";
export { HINT_CATALOG, HINT_IDS, isHintId } from "./hint.js";
export { createLogger, type Logger } from "./logger.js";
// ── X4: Model Gateway ──
export type {
	ModelGatewayConfig,
	ModelProvider,
	ModelTierConfig,
	ResolvedModel,
} from "./model-gateway.js";
export { MODEL_PROVIDERS } from "./model-gateway.js";
// SSRF utilities use node:dns/net/util and cannot be imported in the browser.
// Server code imports them via "@hyperidle/shared/net" subpath export instead.
export type { ResolveResult, SanitizeResult, SanitizeUrlOptions } from "./net/ssrf.js";
export type { ObservabilityEvent } from "./observability/events.js";
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
	TK_TOKEN_RE,
} from "./redact.js";
// ── Team primitive (L13, formerly Product) ──
export type {
	BetCardSummary,
	CreateTeamRequest,
	CreateTeamResponse,
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
	ArtifactRef,
	ArtifactThreadSummary,
	ArtifactThreadSummaryResponse,
	ArtifactViewShape,
	BlockRef,
	EntityRef,
	HeadCollapseResult,
	HostKind,
	IdentityId,
	InlineRef,
	InlineRefKind,
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
export { decode, encode } from "./toon-codec.js";
export { ToonParseError } from "./toon-errors.js";
export type {
	Artifact,
	ArtifactCostFromSession,
	ArtifactFilterAxis,
	ArtifactKind,
	ArtifactPage,
	ArtifactPreview,
	ArtifactQuery,
	CreateArtifactInput,
	DiffHunk,
} from "./types/artifact.js";
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
	BetStatus,
	HealthResponse,
	KernelKnowledgeStatus,
	KnowledgeFormat,
	ModelTier,
	MutableBetField,
	OrgEdgeMechanism,
	ScopeKind,
	SessionState,
	TaskState,
	TriggerType,
	UserKind,
	UserRole,
	UserStatus,
} from "./types.js";
export {
	BET_STATUSES,
	FABRIC_USER_ROLES,
	KERNEL_KNOWLEDGE_STATUSES,
	KERNEL_USER_ROLES,
	MODEL_TIERS,
	MUTABLE_BET_FIELDS,
	ORG_EDGE_MECHANISMS,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	TASK_STATES,
	USER_KINDS,
	USER_ROLES,
} from "./types.js";

/**
 * @hyperidle/api-contract — type-only API contract definitions.
 *
 * Created by M2 (replacement contracts architecture pass). These types pin
 * the wire shapes for API endpoints so server and client stay in sync.
 * No runtime code — only TypeScript interfaces and type aliases.
 */

export type {
	// Sub-port interfaces reachable as AgentOrchestrationPort["<member>"] —
	// not named-imported by anyone; removed from barrel, kept in source.
	AgentOrchestrationPort,
	AgentOrchestrationReviewVerdictInput,
	AgentOrchestrationReviewVerdictOutcome,
	AgentOrchestrationRunConfigPatch,
	AgentOrchestrationRunConfigView,
	AgentOrchestrationSessionWireRow,
	AgentOrchestrationStoppedRun,
	AgentOrchestrationTransport,
	AgentOrchestrationWorkIntentInput,
	AgentOrchestrationWorkIntentKind,
	AgentOrchestrationWorkIntentReceipt,
} from "./agent-orchestration-port.js";
export type {
	ArtifactView,
	// @lore BB1: BetView deleted — bet is now a root task.
	// ConversationInboxMessageView: field of ConversationInboxRowView — reachable, no name-importers
	ConversationInboxRowView,
	ConversationMessageType,
	ConversationThreadView,
	CoreApiConversationPort,
	// CoreApiKnowledgePort / CoreApiRoutinePort: reachable as CoreApiPort["<member>"]
	CoreApiOrgPort,
	CoreApiPort,
	CoreApiTransport,
	CoreApiUsersPort,
	CoreApiWorkPort,
	CreateArtifactRequest,
	CreateArtifactResponse,
	// @lore BB1: CreateBetRequest, CreateBetResponse deleted — bet is now a root task.
	CreateItemRequest,
	CreateItemResponse,
	CreateKnowledgeConflictRequest,
	CreateKnowledgeItemRequest,
	CreateKnowledgeItemResponse,
	CreateOrgTeamRequest,
	CreateTaskRequest,
	CreateTaskResponse,
	DirectThreadResponse,
	HandoffTaskRequest,
	HandoffTaskResponse,
	InsertMessageRequest,
	InsertMessageResponse,
	InsertRoutineRequest,
	InsertThreadRequest,
	InsertThreadResponse,
	ItemView,
	KnowledgeConflictView,
	KnowledgeItemStatusView,
	KnowledgeItemVersionView,
	OrgTeamMembersByIdView,
	OrgTeamMembershipView,
	OrgTeamView,
	PersistScaffoldedAgentsResponse,
	PromoteKnowledgeItemRequest,
	PromoteKnowledgeItemResult,
	// ReviewRecipientsQuery: param of resolveReviewRecipientsForItem — no name-importers
	RoutineView,
	ScaffoldFromRequestInput,
	TaskView,
	// @lore BB1: UpdateBetRequest deleted — bet is now a root task.
	UpdateItemRequest,
	UpdateKnowledgeItemContentRequest,
	UpdateKnowledgeItemContentResponse,
	UpdateKnowledgeItemContentResult,
	UpdateOrgTeamRequest,
	UpdateRoutineRequest,
	UpdateTaskRequest,
	UpdateThreadRequest,
	UserView,
} from "./core-api-port.js";
export { CORE_API_ACTOR_OVERRIDE_HEADER } from "./core-api-port.js";

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
	// @lore BB1: BetView deleted — bet is now a root task.
	ConversationMessageType,
	ConversationThreadView,
	CoreApiConversationPort,
	// CoreApiKnowledgePort / CoreApiRoutinePort: reachable as CoreApiPort["<member>"]
	CoreApiOrgPort,
	CoreApiPort,
	CoreApiTransport,
	CoreApiUsersPort,
	CoreApiWorkPort,
	// @lore BB1: CreateBetRequest, CreateBetResponse deleted — bet is now a root task.
	CreateItemRequest,
	CreateItemResponse,
	CreateKnowledgeConflictRequest,
	CreateKnowledgeItemRequest,
	CreateKnowledgeItemResponse,
	CreateOrgTeamRequest,
	DirectThreadResponse,
	InsertMessageRequest,
	InsertMessageResponse,
	InsertRoutineRequest,
	InsertThreadRequest,
	InsertThreadResponse,
	ItemView,
	KnowledgeConflictView,
	KnowledgeItemStatusView,
	KnowledgeItemVersionView,
	OrgTeamMembershipView,
	OrgTeamView,
	PersistScaffoldedAgentsResponse,
	PromoteKnowledgeItemRequest,
	PromoteKnowledgeItemResult,
	ReparentKnowledgeItemRequest,
	// ReviewRecipientsQuery: param of resolveReviewRecipientsForItem — no name-importers
	RoutineView,
	ScaffoldFromRequestInput,
	// @lore BB1: UpdateBetRequest deleted — bet is now a root task.
	// @lore TaskView/CreateTaskRequest/CreateTaskResponse/UpdateTaskRequest/
	// HandoffTaskRequest/HandoffTaskResponse deleted — the task action list replaces the seam.
	UpdateItemRequest,
	UpdateKnowledgeItemContentRequest,
	UpdateKnowledgeItemContentResponse,
	UpdateKnowledgeItemContentResult,
	UpdateOrgTeamRequest,
	UpdateRoutineRequest,
	UpdateThreadRequest,
	UserView,
} from "./core-api-port.js";
export { CORE_API_ACTOR_OVERRIDE_HEADER } from "./core-api-port.js";

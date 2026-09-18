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
	// CoreApiKnowledgePort / CoreApiRoutinePort: reachable as CoreApiPort["<member>"]
	CoreApiOrgPort,
	CoreApiPort,
	CoreApiTransport,
	CoreApiUsersPort,
	// @lore BB1: CreateBetRequest, CreateBetResponse deleted — bet is now a root task.
	CreateKnowledgeConflictRequest,
	CreateKnowledgeItemRequest,
	CreateKnowledgeItemResponse,
	CreateOrgTeamRequest,
	InsertRoutineRequest,
	KnowledgeConflictView,
	KnowledgeItemStatusView,
	KnowledgeItemVersionView,
	OrgTeamMembershipView,
	OrgTeamView,
	PersistScaffoldedAgentsResponse,
	PromoteKnowledgeItemRequest,
	PromoteKnowledgeItemResult,
	ReparentKnowledgeItemRequest,
	RoutineView,
	ScaffoldFromRequestInput,
	// @lore BB1: UpdateBetRequest deleted — bet is now a root task.
	// @lore TaskView/CreateTaskRequest/CreateTaskResponse/UpdateTaskRequest/
	// HandoffTaskRequest/HandoffTaskResponse deleted — the task action list replaces the seam.
	// @lore BC3 architecture.md §5 B4: ConversationMessageType/ConversationThreadView/
	// CoreApiConversationPort/CoreApiWorkPort/CreateItemRequest/CreateItemResponse/
	// DirectThreadResponse/InsertMessageRequest/InsertMessageResponse/InsertThreadRequest/
	// InsertThreadResponse/ItemView/ReviewRecipientsQuery/UpdateItemRequest/
	// UpdateThreadRequest deleted with the five thread routes and create_item/
	// submit_review/reply — send_message/adjust_thread replace every one.
	UpdateKnowledgeItemContentRequest,
	UpdateKnowledgeItemContentResponse,
	UpdateKnowledgeItemContentResult,
	UpdateOrgTeamRequest,
	UpdateRoutineRequest,
	UserView,
} from "./core-api-port.js";
export { CORE_API_ACTOR_OVERRIDE_HEADER } from "./core-api-port.js";

/**
 * @hyperidle/api-contract — type-only API contract definitions.
 *
 * Created by M2 (replacement contracts architecture pass). These types pin
 * the wire shapes for API endpoints so server and client stay in sync.
 * No runtime code — only TypeScript interfaces and type aliases.
 */

export type {
	AgentOrchestrationPort,
	AgentOrchestrationSessionActivityEntry,
	AgentOrchestrationSessionHistoryEntry,
	AgentOrchestrationSessionsPort,
	AgentOrchestrationTransport,
} from "./agent-orchestration-port.js";
export type { AuthMeResponse } from "./auth.js";
export type {
	BetView,
	ConversationInboxMessageView,
	ConversationInboxRowView,
	ConversationMessageType,
	ConversationThreadView,
	CoreApiConversationPort,
	CoreApiKnowledgePort,
	CoreApiOrgPort,
	CoreApiPort,
	CoreApiRoutinePort,
	CoreApiTransport,
	CoreApiUsersPort,
	CoreApiWorkPort,
	CreateArtifactRequest,
	CreateArtifactResponse,
	CreateBetRequest,
	CreateBetResponse,
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
	ProvisionTeamRoutinesRequest,
	ReviewRecipientsQuery,
	RoutineView,
	TaskView,
	UpdateBetRequest,
	UpdateItemRequest,
	UpdateOrgTeamRequest,
	UpdateRoutineRequest,
	UpdateThreadRequest,
	UserView,
} from "./core-api-port.js";
export type { CreateSessionAcceptedResponse, PendingSessionStart } from "./session.js";
export { isPendingSessionStart } from "./session.js";
export type {
	AutonomyLevel,
	SettingsAgent,
	SettingsNotifications,
	SettingsProfile,
	SettingsResponse,
	SettingsTeam,
	SettingsUser,
} from "./settings.js";

/**
 * @hyperidle/api-contract — type-only API contract definitions.
 *
 * Created by M2 (replacement contracts architecture pass). These types pin
 * the wire shapes for API endpoints so server and client stay in sync.
 * No runtime code — only TypeScript interfaces and type aliases.
 */

export type { AuthMeResponse } from "./auth.js";
export type {
	BetView,
	CoreApiPort,
	CoreApiTransport,
	CoreApiUsersPort,
	CoreApiWorkPort,
	CreateArtifactRequest,
	CreateArtifactResponse,
	CreateBetRequest,
	CreateBetResponse,
	CreateItemRequest,
	CreateItemResponse,
	CreateTaskRequest,
	CreateTaskResponse,
	ItemView,
	TaskView,
	UpdateBetRequest,
	UpdateItemRequest,
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

/**
 * @hyperidle/api-contract — type-only API contract definitions.
 *
 * Created by M2 (replacement contracts architecture pass). These types pin
 * the wire shapes for API endpoints so server and client stay in sync.
 * No runtime code — only TypeScript interfaces and type aliases.
 */

export type { AuthMeResponse } from "./auth.js";
export type {
	RailBet,
	RailBlocker,
	RailCostBurnRate,
	RailResponse,
} from "./rail.js";
export type {
	AutonomyLevel,
	SettingsAgent,
	SettingsNotifications,
	SettingsProfile,
	SettingsResponse,
	SettingsTeam,
	SettingsUser,
} from "./settings.js";

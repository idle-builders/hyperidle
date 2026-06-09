/**
 * Settings section IDs, constants, and shared settings types.
 *
 * @lore P4 Decision 1: Types live in packages/web/src/settings/settings-types.ts
 * (not in shared, because these are web-only). This is a separate file from
 * SettingsPanel.tsx so the overlay pattern can import section ids without
 * importing the old modal component.
 *
 * @lore P4 fix: All types migrated here from SettingsPanel.tsx so hooks and
 * section components can import from a stable location independent of the
 * SettingsPanel component lifecycle.
 */

// --- Section navigation ---

export type SettingsSectionId =
	| "profile"
	| "orgchart"
	| "credentials"
	| "notifications"
	| "appearance"
	| "models"
	| "teams"
	| "backend"
	| "worker"
	| "agents"; // X3: agent configuration section

export interface SettingsSection {
	id: SettingsSectionId;
	label: string;
}

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
	{ id: "profile", label: "Profile" },
	{ id: "orgchart", label: "Org chart" },
	{ id: "models", label: "Models" },
	{ id: "appearance", label: "Appearance" },
	{ id: "credentials", label: "Credentials" },
	{ id: "notifications", label: "Notifications" },
	// @lore U1: "products" renamed to "teams". Retained as sidebar nav item (no page section).
	{ id: "teams", label: "Teams" },
	{ id: "backend", label: "Backend" },
];

// --- Settings data types ---

export interface ProfileSettings {
	name: string;
	email: string;
	avatarUrl: string;
}

/** @lore U1: Renamed from ProductSetting. */
export interface TeamSetting {
	id: string;
	name: string;
	active: boolean;
}

export type AutonomyLevel = "manual" | "supervised" | "autonomous";

export interface UserSetting {
	id: string;
	name: string;
	autonomyLevel: AutonomyLevel;
	paused: boolean;
}

export interface NotificationSettings {
	reviewAlerts: boolean;
	costAlerts: boolean;
	blockerAlerts: boolean;
	/** @lore R8: defaults to false — quiet hours only take effect when this is true. */
	quietHoursEnabled: boolean;
	quietHoursStart: string;
	quietHoursEnd: string;
	/** @lore U1: renamed from mutedProducts. */
	mutedTeams: string[];
}

export type Theme = "light" | "dark" | "system";

export interface AppearanceSettings {
	theme: Theme;
}

export interface SettingsData {
	profile: ProfileSettings;
	/** @lore U1: renamed from `products`. */
	teams: TeamSetting[];
	/** @lore P2: renamed from `agents`. Contains AI users only. */
	users: UserSetting[];
	notifications: NotificationSettings;
	appearance: AppearanceSettings;
}

/** X3: Agent configuration as returned by GET /api/agents. */
export interface AgentConfig {
	id: string;
	name: string;
	role: string;
	soulPrompt: string | null;
	harnessType: string | null;
	modelTierPreference: string | null;
	maxConcurrentSessions: number;
	status: string;
	activeSessions: number;
	/** AB3: "team" | "strategy" | "individual" | null. Matches users.agentCategory. @lore AD8a: "personal" renamed to "individual". */
	agentCategory: string | null;
}

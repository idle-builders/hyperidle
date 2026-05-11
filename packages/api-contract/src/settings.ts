/**
 * M2: Settings contract.
 *
 * GET  /api/settings — returns aggregated factory settings.
 * PATCH /api/settings — updates mutable settings.
 *
 * Replaces the hardcoded DEFAULT_SETTINGS in app-shell-data.ts.
 *
 * @lore M2: appearance (density, theme) is NOT in this contract. It stays
 * client-side in localStorage via useTheme() / useAutoDensity(). The
 * SettingsPanel composes the API response with local appearance state.
 */

/** Autonomy level for agent configuration. */
export type AutonomyLevel = "manual" | "supervised" | "autonomous";

/** Profile section of settings response. */
export interface SettingsProfile {
	readonly name: string;
	readonly email: string;
	readonly avatarUrl: string | null;
}

/** Product entry in settings response. */
export interface SettingsProduct {
	readonly id: string;
	readonly name: string;
	/** Derived from product.phase !== "archived". */
	readonly active: boolean;
}

/** Agent entry in settings response. */
export interface SettingsAgent {
	readonly id: string;
	readonly name: string;
	readonly autonomyLevel: AutonomyLevel;
	/** Derived from agent.status === "paused". */
	readonly paused: boolean;
}

/** Notification preferences in settings response. */
export interface SettingsNotifications {
	readonly reviewAlerts: boolean;
	readonly costAlerts: boolean;
	readonly blockerAlerts: boolean;
	/** "HH:MM" format. */
	readonly quietHoursStart: string;
	/** "HH:MM" format. */
	readonly quietHoursEnd: string;
	readonly mutedProducts: readonly string[];
}

/** Response shape for GET /api/settings. */
export interface SettingsResponse {
	readonly profile: SettingsProfile;
	readonly products: readonly SettingsProduct[];
	readonly agents: readonly SettingsAgent[];
	readonly notifications: SettingsNotifications;
}

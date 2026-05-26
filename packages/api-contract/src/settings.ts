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

/** User (AI) entry in settings response. P2: renamed from SettingsAgent. */
export interface SettingsUser {
	readonly id: string;
	readonly name: string;
	readonly autonomyLevel: AutonomyLevel;
	/** Derived from user.status === "paused". */
	readonly paused: boolean;
}

/**
 * @deprecated Use SettingsUser. Kept for backward compatibility during transition.
 */
export type SettingsAgent = SettingsUser;

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
	/** P2: renamed from `agents`. Contains AI users only. */
	readonly users: readonly SettingsUser[];
	readonly notifications: SettingsNotifications;
}

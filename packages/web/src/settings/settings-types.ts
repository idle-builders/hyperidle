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
	| "products"
	| "backend";

export interface SettingsSection {
	id: SettingsSectionId;
	label: string;
}

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
	{ id: "profile", label: "Profile" },
	{ id: "orgchart", label: "Org Chart" },
	{ id: "credentials", label: "Credentials" },
	{ id: "notifications", label: "Notifications" },
	{ id: "appearance", label: "Appearance" },
	{ id: "products", label: "Products" },
	{ id: "backend", label: "Backend" },
];

// --- Settings data types ---

export interface ProfileSettings {
	name: string;
	email: string;
	avatarUrl: string;
}

export interface ProductSetting {
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
	quietHoursStart: string;
	quietHoursEnd: string;
	mutedProducts: string[];
}

/**
 * @lore K7 / AESTHETICS.md § Mobile & Touch row "Density preference state":
 * tri-state preference. `"auto"` is the factory default and the only state
 * that fires the viewport-driven density auto-switch (≤ 1024px → comfortable).
 * Once the user picks `default` / `compact` / `comfortable`, that explicit
 * choice persists across breakpoint changes.
 */
export type Density = "auto" | "compact" | "default" | "comfortable";
export type ResolvedDensity = "compact" | "default" | "comfortable";
export type Theme = "light" | "dark" | "system";

export interface AppearanceSettings {
	density: Density;
	theme: Theme;
}

export interface SettingsData {
	profile: ProfileSettings;
	products: ProductSetting[];
	/** @lore P2: renamed from `agents`. Contains AI users only. */
	users: UserSetting[];
	notifications: NotificationSettings;
	appearance: AppearanceSettings;
}

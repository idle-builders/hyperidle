/**
 * Settings section IDs and constants.
 *
 * @lore P4 Decision 1: Types live in packages/web/src/settings/settings-types.ts
 * (not in shared, because these are web-only). This is a separate file from
 * SettingsPanel.tsx so the overlay pattern can import section ids without
 * importing the old modal component.
 */

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

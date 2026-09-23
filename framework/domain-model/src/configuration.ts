// @lore BC5 T7b: "routine" respelled "subscription" — matches migration
// 0089's respelling of the plugin_configuration_defaults/configuration_overrides
// kind CHECK constraints.
export const CONFIGURATION_KINDS = [
	"agent",
	"skill",
	"subscription",
	"tool",
	"mcp_server",
	"harness_descriptor",
] as const;

export type ConfigurationKind = (typeof CONFIGURATION_KINDS)[number];

export const PLUGIN_STATES = ["enabled", "disabled", "removed"] as const;
export type PluginState = "enabled" | "disabled" | "removed";

/**
 * The kinds of thing a plugin can contribute, and the table each points into.
 *
 * `agent` → `users`, `subscription` → `subscriptions`, `document` →
 * `documents` (skills, rules, agent files and subscription prompts alike —
 * BA9f made them all documents, so one kind covers them),
 * `configuration_default` → `plugin_configuration_defaults`.
 *
 * @lore BC4: member value flipped `knowledge` -> `document` with migration
 * 0086 step 10 (architecture.md §6.4, §8.6, §8.7c). The constant keeps its
 * name until the later rename wave.
 *
 * @lore BC5 T7b: `routine` respelled `subscription` — matches migration
 * 0089's respelling of the plugin_contributions kind CHECK constraint.
 */
export const PLUGIN_CONTRIBUTION_KINDS = [
	"agent",
	"subscription",
	"document",
	"configuration_default",
] as const;
export type PluginContributionKind = (typeof PLUGIN_CONTRIBUTION_KINDS)[number];

export const PLUGIN_SCOPE_KINDS = ["factory", "team"] as const;
export type PluginScopeKind = (typeof PLUGIN_SCOPE_KINDS)[number];

export type ConfigurationOriginType = "builtin" | "plugin" | "user";
export type ConfigurationValueSource = "default" | "user_override" | "user_owned";

export const BUILTIN_PLUGIN_ID = "builtin";

export interface ConfigurationOrigin {
	readonly type: ConfigurationOriginType;
	readonly pluginId: string | null;
	readonly pluginName: string | null;
	readonly pluginState: PluginState | null;
	readonly defaultVersionHash: string | null;
}

export interface ResolvedConfigurationItem<T = unknown> {
	readonly kind: ConfigurationKind;
	readonly key: string;
	readonly activeValue: T;
	readonly defaultValue: T | null;
	readonly userValue: T | null;
	readonly valueSource: ConfigurationValueSource;
	readonly origin: ConfigurationOrigin;
	readonly active: boolean;
}

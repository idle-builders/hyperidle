export const CONFIGURATION_KINDS = [
	"agent",
	"skill",
	"routine",
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
 * `agent` → `users`, `routine` → `routines`, `knowledge` → `knowledge_items`
 * (skills, rules, agent files and routine prompts alike — BA9f made them all
 * knowledge documents, so one kind covers them), `configuration_default` →
 * `plugin_configuration_defaults`.
 */
export const PLUGIN_CONTRIBUTION_KINDS = [
	"agent",
	"routine",
	"knowledge",
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

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

export type PluginState = "enabled" | "disabled" | "removed";

/**
 * The kinds stored in `plugin_contributions` rows.
 * `mcp_server` is NOT stored — it is synthesised from mcp.json at read time.
 */
export const STORED_PLUGIN_CONTRIBUTION_KINDS = ["agent", "subscription", "document"] as const;
export type StoredPluginContributionKind = (typeof STORED_PLUGIN_CONTRIBUTION_KINDS)[number];

/**
 * All contribution kinds, including `mcp_server` which appears only in
 * `PluginContributionView` (built from mcp.json, never persisted).
 */
export const PLUGIN_CONTRIBUTION_KINDS = [
	...STORED_PLUGIN_CONTRIBUTION_KINDS,
	"mcp_server",
] as const;
export type PluginContributionKind = (typeof PLUGIN_CONTRIBUTION_KINDS)[number];

export type PluginScopeKind = "factory" | "team";

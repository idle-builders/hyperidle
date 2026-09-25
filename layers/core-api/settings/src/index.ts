/**
 * Barrel for @hyperidle/settings (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `serverConfig`
 * pgTable object — that would let a consumer obtain the table transitively and
 * defeat Table ACL (Mechanism A). Consumers get typed functions; the table
 * stays private to this Service.
 *
 * @lore The plugin configuration engine (per-plugin configuration defaults,
 * person overrides, the resolver behind the agent-behaviour settings page) is
 * gone: every install's defaults were empty and nothing that runs a session
 * read an override. A plugin's MCP servers are read from its install folder
 * instead (`getPluginMcpContributions`).
 */

// -- platform module: search_plugins / edit_plugin own the whole
// plugin lifecycle. `Action`/`ActionContext` are this module's own
// structural mirror — see platform-actions.ts's own header. --
export type { Action, ActionContext, PlatformActionsDeps } from "./platform-actions.js";
export { createPlatformActions } from "./platform-actions.js";
export type { PluginContribution } from "./plugin-contributions.js";
export {
	clearDetached,
	contributedEntityIds,
	forgetContributionsExcept,
	listContributions,
	markDetached,
	recordContribution,
} from "./plugin-contributions.js";
// -- plugin install / manage --
export type {
	InstalledPlugin,
	InstallPluginInput,
	InstallPluginResult,
	PluginMcpContributionRow,
	PluginScope,
	PluginSource,
} from "./plugin-installer.js";
export {
	agentItemId,
	disablePlugin,
	enablePlugin,
	getInstalledPlugin,
	getPluginMcpContributions,
	installPlugin,
	listInstalledPlugins,
	removePlugin,
	skillItemId,
	subscriptionItemId,
} from "./plugin-installer.js";
// -- plugin manifest parsing --
export type {
	ManifestParseResult,
	ManifestWarning,
	ParsedPluginAgent,
	ParsedPluginSubscription,
	PluginManifest,
} from "./plugin-manifest.js";
export { parsePluginManifest } from "./plugin-manifest.js";
// -- server config (P3 — server_config single-row table read/write) --
export type { ServerConfig, ServerConfigPatch } from "./server-config.js";
export { readServerConfig, updateServerConfig } from "./server-config.js";

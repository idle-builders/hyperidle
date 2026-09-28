// Barrel for @hyperidle/settings. Never re-exports raw table objects — consumers get typed functions only.

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

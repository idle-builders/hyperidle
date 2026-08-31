/**
 * Barrel for @hyperidle/settings (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `serverConfig`
 * pgTable object — that would let a consumer obtain the table transitively and
 * defeat Table ACL (Mechanism A). Consumers get typed functions; the table
 * stays private to this Service.
 *
 * @lore AU43 settings batch: seedConfigurationDefaults, backfillConfigurationDefaults,
 * setPluginState deleted along with their types (PluginConfigurationSource,
 * PluginConfigurationSeed, BackfillLegacyConfigurationDeps) and DI ports
 * (RoutineReader, SettingsUserDirectory). listConfiguration and
 * writeConfigurationOverride are retained — they serve the agent-behavior
 * settings UI. ObservabilityConfig/ObservabilityConfigPatch aliases and
 * readObservabilityConfig/updateObservabilityConfig deleted — observability
 * runtime now uses constants. SettingsCredentialCipher port deleted —
 * migrateCredentialsToStore uses an inline type.
 */

// -- action rules (BA2 — scoped items for agent action approval) --
export type {
	ActionRule,
	ActionRuleScope,
	CreateActionRuleInput,
	ResolveActionRulesInput,
} from "./action-rules.js";
export {
	createActionRule,
	deleteActionRule,
	listActionRules,
	resolveActionRules,
} from "./action-rules.js";
// -- plugin configuration (resolution engine, agent-behavior UI) --
export { listConfiguration, writeConfigurationOverride } from "./plugin-configuration.js";
export type { PluginContribution } from "./plugin-contributions.js";
export {
	clearDetached,
	contributedEntityIds,
	forgetContributionsExcept,
	listContributions,
	markDetached,
	recordContribution,
} from "./plugin-contributions.js";
// -- plugin install / manage (BA9a) --
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
	pluginContributionKey,
	removePlugin,
	restorePluginContribution,
	routineItemId,
	skillItemId,
} from "./plugin-installer.js";
// -- plugin manifest parsing (BA9a) --
export type {
	ManifestParseResult,
	ManifestWarning,
	ParsedContribution,
	ParsedPluginAgent,
	ParsedPluginRoutine,
	PluginManifest,
} from "./plugin-manifest.js";
export { parsePluginManifest } from "./plugin-manifest.js";
// -- server config (P3 — server_config single-row table read/write) --
export type { ServerConfig, ServerConfigPatch } from "./server-config.js";
export { readServerConfig, updateServerConfig } from "./server-config.js";

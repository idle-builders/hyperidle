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

// -- plugin configuration (resolution engine, agent-behavior UI) --
export { listConfiguration, writeConfigurationOverride } from "./plugin-configuration.js";
// -- plugin install / manage (BA9a) --
export type {
	InstalledPlugin,
	InstallPluginInput,
	InstallPluginResult,
	PluginScope,
	PluginSource,
} from "./plugin-installer.js";
export {
	disablePlugin,
	enablePlugin,
	installPlugin,
	listInstalledPlugins,
	pluginContributionKey,
	removePlugin,
	restorePluginContribution,
} from "./plugin-installer.js";
// -- plugin manifest parsing (BA9a) --
export type {
	ManifestParseResult,
	ManifestWarning,
	ParsedContribution,
	PluginManifest,
} from "./plugin-manifest.js";
export { parsePluginManifest } from "./plugin-manifest.js";

// -- server config (P3 — server_config single-row table read/write) --
export type { ServerConfig, ServerConfigPatch } from "./server-config.js";
export { readServerConfig, updateServerConfig } from "./server-config.js";

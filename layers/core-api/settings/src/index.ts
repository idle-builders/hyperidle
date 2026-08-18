/**
 * Barrel for @hyperidle/settings (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `serverConfig`
 * pgTable object — that would let a consumer obtain the table transitively and
 * defeat Table ACL (Mechanism A). Consumers get typed functions; the table
 * stays private to this Service.
 *
 * @lore AU43 settings batch: plugin-configuration module and its resolution
 * engine (listConfiguration, writeConfigurationOverride, seedConfigurationDefaults,
 * backfillConfigurationDefaults, setPluginState) deleted along with their types
 * (PluginConfigurationSource, PluginConfigurationSeed, BackfillLegacyConfigurationDeps)
 * and DI ports (RoutineReader, SettingsUserDirectory). The agent-behavior settings
 * route and its view-model (agent-behavior-config-impl.ts) were deleted with them.
 * ObservabilityConfig/ObservabilityConfigPatch aliases and readObservabilityConfig/
 * updateObservabilityConfig deleted — observability runtime now uses constants.
 * SettingsCredentialCipher port deleted — migrateCredentialsToStore uses an inline type.
 */

// -- server config (P3 — server_config single-row table read/write) --
export type { ServerConfig, ServerConfigPatch } from "./server-config.js";
export {
	migrateCredentialsToStore,
	readServerConfig,
	updateServerConfig,
} from "./server-config.js";

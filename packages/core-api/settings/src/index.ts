/**
 * Barrel for @hyperidle/settings (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `serverConfig`
 * pgTable object — that would let a consumer obtain the table transitively and
 * defeat Table ACL (Mechanism A). Consumers get typed functions; the table
 * stays private to this Service.
 *
 * @lore AU19 Increment 1f: this is the real cut-over — `server-config.ts`,
 * `plugin-configuration.ts`, `agent-behavior-config.ts` moved here from
 * `packages/server/src/services/` unchanged (behavior-preserving move, aside
 * from the DI-port signature additions documented in `ports.ts`). Four real
 * outbound edges (`routine`, `users`, `connections`, plus `model-gateway`'s
 * `BUILT_IN_GATEWAY_CONFIG`) became injected DI ports / a `@hyperidle/shared`
 * reclassification (Mechanism C, see `ports.ts`); the fifth
 * (`builtin-tool-catalog`) dissolved via reclassification to
 * `@hyperidle/shared` per architecture §5/§10.3.
 */

// -- agent behavior config (unified read/patch surface over configuration kinds) --
export {
	AgentBehaviorConfigError,
	type ListAgentBehaviorConfigOptions,
	listAgentBehaviorConfiguration,
	type PatchAgentBehaviorConfigInput,
	patchAgentBehaviorConfiguration,
} from "./agent-behavior-config.js";
// -- plugin / default configuration projection (AU10 — tool/agent/routine/skill/mcp/trigger/harness defaults + overrides) --
export type {
	BackfillLegacyConfigurationDeps,
	BackfillLegacyConfigurationOptions,
	ClearConfigurationOverrideInput,
	LoadBuiltInConfigurationDefaultsInput,
	LoadPluginConfigurationDefaultsInput,
	PluginConfigurationSeed,
	PluginConfigurationSource,
	PluginStateOptions,
	SetConfigurationOverrideInput,
} from "./plugin-configuration.js";
export {
	BUILTIN_PLUGIN_SOURCE,
	backfillLegacyConfigurationDefaults,
	clearConfigurationOverride,
	getResolvedConfiguration,
	listResolvedConfiguration,
	loadBuiltInConfigurationDefaults,
	loadPluginConfigurationDefaults,
	projectProductionConfigurationDefaults,
	setConfigurationOverride,
	setPluginConfigurationState,
} from "./plugin-configuration.js";
// -- DI ports (Mechanism C) --
export type { RoutineReader, SettingsCredentialCipher, SettingsUserDirectory } from "./ports.js";
// -- server config (P3 — server_config single-row table read/write) --
export type { ServerConfig, ServerConfigPatch } from "./server-config.js";
export {
	ModelGatewayConfigSchema,
	ModelTierConfigSchema,
	migrateCredentialsToStore,
	NotificationsSchema,
	readServerConfig,
	ServerConfigSchema,
	updateServerConfig,
} from "./server-config.js";

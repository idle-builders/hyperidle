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
 *
 * @lore AU20 Am6: surface collapsed from 36 → ~18 exports. Per-method input
 * wrapper types (SetConfigurationOverrideInput, ClearConfigurationOverrideInput,
 * LoadPluginConfigurationDefaultsInput, LoadBuiltInConfigurationDefaultsInput,
 * PluginStateOptions, BackfillLegacyConfigurationOptions) inlined as method
 * params and dropped from this barrel. Zod schema exports (ServerConfigSchema,
 * NotificationsSchema, ModelGatewayConfigSchema, ModelTierConfigSchema) are
 * validation internals — dropped. list/find collapsed to listConfiguration({
 * kind?, key? }); set+clear collapsed to writeConfigurationOverride({ value |
 * null }); loadPlugin+loadBuiltIn collapsed to seedConfigurationDefaults({
 * source }); backfill+alias collapsed to backfillConfigurationDefaults; rename
 * setPluginConfigurationState → setPluginState.
 */

// -- agent behavior config (view-model over the resolution engine; presentation
//    projection collocated in service for now — see spec §E) --
export {
	AgentBehaviorConfigError,
	type ListAgentBehaviorConfigOptions,
	listAgentBehaviorConfiguration,
	type PatchAgentBehaviorConfigInput,
	patchAgentBehaviorConfiguration,
} from "./agent-behavior-config.js";

// -- plugin / configuration resolution (B. collapsed API — AU20 Am6) --
export type {
	BackfillLegacyConfigurationDeps,
	PluginConfigurationSeed,
	PluginConfigurationSource,
} from "./plugin-configuration.js";
export {
	BUILTIN_PLUGIN_SOURCE,
	backfillConfigurationDefaults,
	listConfiguration,
	seedConfigurationDefaults,
	setPluginState,
	writeConfigurationOverride,
} from "./plugin-configuration.js";

// -- DI ports (Mechanism C) --
export type { RoutineReader, SettingsCredentialCipher, SettingsUserDirectory } from "./ports.js";

// -- server config (P3 — server_config single-row table read/write) --
export type { ServerConfig, ServerConfigPatch } from "./server-config.js";
export {
	migrateCredentialsToStore,
	readServerConfig,
	updateServerConfig,
} from "./server-config.js";

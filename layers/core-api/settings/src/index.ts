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
 * `BUILT_IN_GATEWAY_CONFIG`) became injected DI ports / a `@hyperidle/domain-model`
 * reclassification (Mechanism C, see `ports.ts`); the fifth
 * (`builtin-tool-catalog`) dissolved via reclassification to
 * `@hyperidle/domain-model` per architecture §5/§10.3.
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
 *
 * @lore AU20 R-settings: agent-behavior-config module (listAgentBehaviorConfiguration,
 * patchAgentBehaviorConfiguration, AgentBehaviorConfigError, ListAgentBehaviorConfigOptions,
 * PatchAgentBehaviorConfigInput) relocated to the settings-UI route layer
 * (layers/core-api/src/routes/agent-behavior-config-impl.ts). It is a pure
 * presentation view-model with no cross-service consumer; its composition on top
 * of listConfiguration/writeConfigurationOverride does not belong in the
 * service's product API.
 */

// -- plugin / configuration resolution (B. collapsed API — AU20 Am6) --
export type {
	BackfillLegacyConfigurationDeps,
	PluginConfigurationSeed,
	PluginConfigurationSource,
} from "./plugin-configuration.js";
export {
	backfillConfigurationDefaults,
	listConfiguration,
	seedConfigurationDefaults,
	setPluginState,
	writeConfigurationOverride,
} from "./plugin-configuration.js";

// -- DI ports (Mechanism C) --
export type { RoutineReader, SettingsCredentialCipher, SettingsUserDirectory } from "./ports.js";

// -- server config (P3 — server_config single-row table read/write) --
export type {
	ObservabilityConfig,
	ObservabilityConfigPatch,
	ServerConfig,
	ServerConfigPatch,
} from "./server-config.js";
export {
	migrateCredentialsToStore,
	readObservabilityConfig,
	readServerConfig,
	updateObservabilityConfig,
	updateServerConfig,
} from "./server-config.js";

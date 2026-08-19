# Destroyer input — `settings` (core-api)

Package: `layers/core-api/settings`
Surface: 10 exported functions, 0 classes (0 member methods), 10 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `setPluginState` | yes | `layers/core-api/settings/src/plugin-configuration.ts:494` |
| 2 | `listConfiguration` | yes | `layers/core-api/settings/src/plugin-configuration.ts:592` |
| 3 | `writeConfigurationOverride` | yes | `layers/core-api/settings/src/plugin-configuration.ts:612` |
| 4 | `seedConfigurationDefaults` | yes | `layers/core-api/settings/src/plugin-configuration.ts:642` |
| 5 | `backfillConfigurationDefaults` | yes | `layers/core-api/settings/src/plugin-configuration.ts:665` |
| 6 | `readServerConfig` | yes | `layers/core-api/settings/src/server-config.ts:234` |
| 7 | `updateServerConfig` | yes | `layers/core-api/settings/src/server-config.ts:276` |
| 8 | `migrateCredentialsToStore` | yes | `layers/core-api/settings/src/server-config.ts:368` |
| 9 | `readObservabilityConfig` | yes | `layers/core-api/settings/src/server-config.ts:514` |
| 10 | `updateObservabilityConfig` | yes | `layers/core-api/settings/src/server-config.ts:520` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `PluginConfigurationSource` (interface, public) `layers/core-api/settings/src/plugin-configuration.ts:30` — members: `id`, `name`, `version`
- `PluginConfigurationSeed` (interface, public) `layers/core-api/settings/src/plugin-configuration.ts:36` — members: `kind`, `key`, `value`
- `BackfillLegacyConfigurationDeps` (interface, public) `layers/core-api/settings/src/plugin-configuration.ts:60` — members: `users`, `routines`, `serviceConnections`, `agentRunConfig`
- `RoutineReader` (interface, public) `layers/core-api/settings/src/ports.ts:4` — members: `listRoutines`
- `SettingsUserDirectory` (interface, public) `layers/core-api/settings/src/ports.ts:9` — members: `listUsersByKind`
- `SettingsCredentialCipher` (interface, public) `layers/core-api/settings/src/ports.ts:14` — members: `encryptCredentialValue`, `decryptCredentialValue`
- `ServerConfig` (type, public) `layers/core-api/settings/src/server-config.ts:120` — members: `notifications`, `modelGateway`, `harnessDisabled`, `observability`
- `ServerConfigPatch` (type, public) `layers/core-api/settings/src/server-config.ts:161` — members: `notifications`, `modelGateway`, `harnessDisabled`, `observability`
- `ObservabilityConfig` (type, public) `layers/core-api/settings/src/server-config.ts:504`
- `ObservabilityConfigPatch` (type, public) `layers/core-api/settings/src/server-config.ts:507`

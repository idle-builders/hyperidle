# Delete batch — `settings`

15 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `setPluginState` | TEST-ONLY | Plugin enable/disable state machine for a plugin system that does not exist; only tests call it. |
| 2 | `listConfiguration` | UI:GET /api/settings/agent-behavior/config, UI:PATCH /api/settings/agent-behavior/config/:id | Fronts a resolution engine whose output no runtime consumes; the one door is a display mirror — rebuild the tab over owning-service reads and kill the caller (agent-behavior-config-impl.ts). |
| 3 | `writeConfigurationOverride` | UI:PATCH /api/settings/agent-behavior/config/:id | Writes overrides nothing reads; the edit UI lies — editing agent behavior here changes nothing about the running agent. Real edits belong to the owning tables' own doors. |
| 4 | `seedConfigurationDefaults` | TEST-ONLY | Plugin-defaults seeding path; production only ever seeds the builtin source via the backfill, plugin sources exist only in tests. |
| 5 | `backfillConfigurationDefaults` | BOOTSTRAP (desktop + remote-server create-server.ts → boot.ts on every start) | Rebuilds the display mirror from live tables at each boot; dies with the mirror. Also kills its call-site plumbing in boot.ts and both apps. |
| 6 | `readObservabilityConfig` | BOOTSTRAP (observability-runtime.ts at startup, sole caller) | Two-line wrapper over a config section no door can write; section becomes constants inside the runtime (kill #2). |
| 7 | `updateObservabilityConfig` | DEAD (rg: barrel + own file only) | Zero callers anywhere, production or test; a write path for an unwritable setting. |
| 8 | `PluginConfigurationSource` |  | Dies with the engine; only production value ever constructed is the builtin literal. |
| 9 | `PluginConfigurationSeed` |  | Seed shape for the mirror; dies with methods 4–5. |
| 10 | `BackfillLegacyConfigurationDeps` |  | Four-port DI mirror existing solely for method 5. |
| 11 | `RoutineReader` |  | Port with one consumer (method 5); dies with it. |
| 12 | `SettingsUserDirectory` |  | Port with one consumer (method 5); dies with it. |
| 13 | `SettingsCredentialCipher` |  | Port for method 8 only; at home in credentials the cipher is imported directly — no port needed. |
| 14 | `ObservabilityConfig` |  | Alias for a section that becomes constants; runtime declares its own local shape. |
| 15 | `ObservabilityConfigPatch` |  | Patch type for the dead method 10. |

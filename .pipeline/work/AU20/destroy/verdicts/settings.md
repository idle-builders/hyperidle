# settings — destroyer verdict

## Should this service exist?

**KEEP AS the `server_config` owner — and nothing else.** The honest core is one single-row
table (`server_config`) read by 26 doors and 6 event subscribers (notifications prefs, model
gateway tiers, harness disable list) and written by 3 doors. That read/write pair is load-bearing
for what HyperIdle is: agents need a model gateway, the founder needs notification prefs.

The other half of the service — the plugin-configuration resolution engine
(`plugin-configuration.ts`, 790 lines, 3 DB tables: `plugins`, `plugin_configuration_defaults`,
`configuration_overrides`) — **must die whole.** Verified with the code graph and `rg -a`:
**no production code anywhere reads the resolved configuration except the Settings → Agent
Behavior display route.** The `configuration_overrides` a user writes through that page are
consumed by *nothing at runtime* — agents spawn from `agent_run_config`, routines fire from the
`routines` table, triggers' one-and-only consumer was deleted in AU21 with "ZERO real callers
ever existed" on record. The engine is a boot-time mirror of live tables plus an override layer
that lies to the user: editing an agent's system prompt on that page marks it "user_override"
and changes nothing about how the agent actually runs. There is also no plugin system — the
`plugins` table has exactly one production row ever (the builtin source); the plugin-seeding
path is test-only.

Survivors stay here. Nothing routes elsewhere except the desktop credential bridge (→ `credentials`).

## If written today, from scratch

`server-config.ts` only, one file:

- `readServerConfig(db)` — the singleton blob, defaults on empty/corrupt.
- `updateServerConfig(db, patch)` — locked deep-merge patch.
- Types `ServerConfig` / `ServerConfigPatch` — minus the observability section.

Nothing else. No mirror tables, no override engine, no plugin state machine, no observability
accessor pair, no migration code, no DI ports.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 1 |
| SIMPLIFY | 0 |
| KEEP | 2 |

Surface: 10 methods → 2 methods (80% cut). Types: 10 declarations → 2 (both shrunk).
Tables: 4 owned → 1 (`plugins`, `plugin_configuration_defaults`, `configuration_overrides` dropped).

## Feature-level kills

**1. The plugin-configuration resolution engine (methods 1–5, three tables, five types).**
The entire default-vs-override-vs-origin resolution concept has zero runtime consumers. Its only
door is the Settings → Agent Behavior tab, which displays a boot-time projection of data that
already lives in real tables (`users` + `agent_run_config`, `routines`, `service_connections`,
`BUILTIN_TOOL_CATALOG`) and accepts edits that take effect nowhere. What breaks: that settings
tab, and the `agent-behavior-config-impl.ts` view-model over it. Acceptable because the tab's
display can be rebuilt read-only over the owning services' existing list functions in a fraction
of the code (the deep-links in the view-model already point at the real editors), and its edit
capability is not a loss — it never worked. Dies with it: the boot backfill run on every desktop
and remote-server start, the `SECRET_FIELD_NAMES` scanner, the per-kind Zod value schemas, the
sha256 id derivation, and four integration/component test files.

**2. The observability config section of `server_config` (methods 9–10, two types).**
No door can write it: `PATCH /api/settings` accepts only six notification fields,
`updateObservabilityConfig` has zero production callers, no UI surface exists. Every field
(`enabled`, `adapter`, `batchSize`, `flushIntervalMs`, `bufferCap`) has exactly one reachable
value — its default. A setting with one reachable value is a constant. Kill the section; the
observability runtime (`observability-runtime.ts`, its sole reader) hardcodes the five values.

**3. Flag for the notifications destroyer (not counted here):** `notifications.delivery`,
`notifications.silence`, and `notifications.mutedTypes` are equally write-orphaned — no door
writes them, so SMTP/ntfy delivery, silence windows, and per-type mutes run on defaults forever.
Either that whole delivery apparatus is a dead feature or it is missing its settings surface.
The fields sit in my `ServerConfig` shape but the verdict on the feature belongs to notifications.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `setPluginState` | TEST-ONLY | DELETE | Plugin enable/disable state machine for a plugin system that does not exist; only tests call it. |
| 2 | `listConfiguration` | UI:GET /api/settings/agent-behavior/config, UI:PATCH /api/settings/agent-behavior/config/:id | DELETE | Fronts a resolution engine whose output no runtime consumes; the one door is a display mirror — rebuild the tab over owning-service reads and kill the caller (`agent-behavior-config-impl.ts`). |
| 3 | `writeConfigurationOverride` | UI:PATCH /api/settings/agent-behavior/config/:id | DELETE | Writes overrides nothing reads; the edit UI lies — editing agent behavior here changes nothing about the running agent. Real edits belong to the owning tables' own doors. |
| 4 | `seedConfigurationDefaults` | TEST-ONLY | DELETE | Plugin-defaults seeding path; production only ever seeds the builtin source via the backfill, plugin sources exist only in tests. |
| 5 | `backfillConfigurationDefaults` | BOOTSTRAP (desktop + remote-server `create-server.ts` → `boot.ts` on every start) | DELETE | Rebuilds the display mirror from live tables at each boot; dies with the mirror. Also kills its call-site plumbing in `boot.ts` and both apps. |
| 6 | `readServerConfig` | UI:GET /api/settings/ (+25 more doors incl. SCHED routine-scheduler tick, model-gateway, harnesses, sessions; 6 event subscribers) | KEEP | Core value: the single server settings read every agent-facing door depends on (model gateway tiers, harness disable, notification prefs). Door named: GET /api/settings/. |
| 7 | `updateServerConfig` | UI:PATCH /api/settings/, UI:PATCH /api/model-gateway/, UI:POST /api/harnesses/:type/disabled | KEEP | Core value: the only write path for the surviving config; three real doors. Loses its observability merge branch when kill #2 lands. |
| 8 | `migrateCredentialsToStore` | BOOTSTRAP (`boot.ts` every start) | MERGE | Split it: Step 1 (legacy apiKey relocation out of pre-AH1 blobs) is migration archaeology for a population of ~one machine — DELETE. Step 2 (env `ANTHROPIC_API_KEY` → `server_credentials`) is the live desktop-onboarding bridge (`DbCredentialResolver` has no env fallback) but touches only the `credentials` service's table — fold those ~20 lines into `credentials` at boot and delete this function from settings. |
| 9 | `readObservabilityConfig` | BOOTSTRAP (`observability-runtime.ts` at startup, sole caller) | DELETE | Two-line wrapper over a config section no door can write; section becomes constants inside the runtime (kill #2). |
| 10 | `updateObservabilityConfig` | DEAD (rg: barrel + own file only) | DELETE | Zero callers anywhere, production or test; a write path for an unwritable setting. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `PluginConfigurationSource` | DELETE | Dies with the engine; only production value ever constructed is the builtin literal. |
| `PluginConfigurationSeed` | DELETE | Seed shape for the mirror; dies with methods 4–5. |
| `BackfillLegacyConfigurationDeps` | DELETE | Four-port DI mirror existing solely for method 5. |
| `RoutineReader` | DELETE | Port with one consumer (method 5); dies with it. |
| `SettingsUserDirectory` | DELETE | Port with one consumer (method 5); dies with it. |
| `SettingsCredentialCipher` | DELETE | Port for method 8 only; at home in `credentials` the cipher is imported directly — no port needed. |
| `ServerConfig` | SIMPLIFY | Survives as the core read shape; drop the `observability` member (kill #2). |
| `ServerConfigPatch` | SIMPLIFY | Survives as the core write shape; drop the `observability` member. |
| `ObservabilityConfig` | DELETE | Alias for a section that becomes constants; runtime declares its own local shape. |
| `ObservabilityConfigPatch` | DELETE | Patch type for the dead method 10. |

## Holes this leaves

- **Settings → Agent Behavior tab breaks** until rebuilt read-only over owning-service reads
  (users/agent-run-config, routines, service connections, tool catalog). The rebuilt page keeps
  the deep-links, drops the fake edit affordance. Smaller than the engine it replaces.
- **Any existing `configuration_overrides` rows are discarded.** No functional loss — they were
  never consumed — but a user who "edited" behavior there loses the illusion.
- **Drop-table migration required** for `plugins`, `plugin_configuration_defaults`,
  `configuration_overrides`.
- **The env→credential seed must land in `credentials` in the same change**, or fresh desktop
  installs lose model auth (safeStorage key never reaches `server_credentials`).
- **Pre-AH1 blobs keep inert legacy `apiKey` JSON fields** in `server_config` forever. Harmless:
  the typed schema ignores them; re-entering the key via the credentials UI covers any loss.
- **Observability becomes non-configurable** (it already is, in every way that counts): turning
  tracing off now requires a code change, not a DB row nobody could write anyway.
- **Test deletions ride along:** `plugin-configuration.integration.test.ts`,
  `agent-behavior-settings.integration.test.ts`, the settings-agent-behavior component test, and
  the seeding half of `builtin-tool-catalog-consistency.integration.test.ts` (re-base the
  consistency check directly on `BUILTIN_TOOL_CATALOG`).

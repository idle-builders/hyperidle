# settings — Service-as-Product (AU20 re-architecture, BOTH lenses)

Layer: core-api. Substrate: **OWNED DB TABLES** (4).
Owned tables: `serverConfig`, `plugins`, `pluginConfigurationDefaults`, `configurationOverrides`.

---

## 1. INSIDE-OUT (anchor)

### Substrate identification
Four owned tables, but they resolve into **two coherent data models**, not four independent
CRUD entities:

- **`serverConfig`** — a *singleton blob* (one row). It holds every service's own config
  section (notifications, modelGateway, harnessDisabled, observability, gitExport, cost,
  internal). A singleton has no create/list/delete — it always exists, there is exactly one.
- **plugin-configuration engine** (`plugins` + `pluginConfigurationDefaults` +
  `configurationOverrides`) — these three tables are NOT CRUD'd independently. They are one
  owned algorithm: **defaults (per plugin) layered under overrides → a single `ResolvedConfigurationItem`
  view**. You never read `configurationOverrides` raw; you read the *resolved* projection. Writes
  are: seed defaults, write an override, flip a plugin's state.

### The FLOOR (substrate-appropriate — NOT naive 4×5=20)
A singleton config table + a 3-table resolution engine collapse the CRUD floor:

| Model | Floor ops | Why not full CRUD |
|---|---|---|
| `serverConfig` singleton | **read**, **update(patch)** = 2 | one row, always present → no create/list/delete |
| resolution engine (3 tables) | **listConfiguration(filter)** (read the resolved view), **writeConfigurationOverride({value\|null})** (override set/clear), **seedConfigurationDefaults({source})** (defaults write), **setPluginState** (plugin enable/disable/remove) = 4 | three tables, one engine; only the resolved projection is read; override set+clear are one write parameterized by value |

**Floor = 6 operations.**

### Genuine owned capabilities beyond the floor (+2)
- **`migrateCredentialsToStore(db, cipher, store)`** — one-shot boot migration that lifts inline
  secrets out of the owned `serverConfig` blob into the credential store. Mutates a table this
  service exclusively owns; no other service can perform it. Genuine.
- **`backfillConfigurationDefaults(db, deps)`** — boot-time projection that gathers live
  agents/routines/connections/skills/tools into the built-in seed set. It *authors* into the
  owned defaults table from live system state; distinct from `seedConfigurationDefaults` (which
  takes a caller-supplied seed list). Genuine.

**Target = floor 6 + 2 = 8 methods.**

---

## 2. OUTSIDE-IN (real demand from census)

All 4 consumers ask for exactly **one thing: the serverConfig read/update pair**:

| Consumer | Requests |
|---|---|
| git-export | read, update |
| notifications | read, update |
| cost | readServerConfig, updateServerConfig |
| dispatch | readServerConfig |

Every consumer narrows to *its own section* (`gitExport`, `notifications`, `cost`) inside its own
port — none needs a per-section method. This is the strongest evidence for the general pair:
`readServerConfig()` + `updateServerConfig(patch)`, a **new section = a new schema key, never a new
method**. The rejected shape `readGitExportConfig`/`readCostConfig`/`readObservabilityConfig` would
already be 6+ methods growing linearly with services.

The plugin-configuration resolution API has **no cross-service census consumer** — it is read by
`trigger-resolution` (kind filter) and the settings-UI route layer. It is justified purely
**inside-out** (it owns 3 tables) plus the settings-page demand, not by the 4-consumer census.

---

## 3. THE COHERENT PRODUCT API (fused)

### A. Server config — the typed singleton (3)
1. `readServerConfig(db)` → `ServerConfig` — [both] singleton read; every census consumer.
2. `updateServerConfig(db, patch: ServerConfigPatch)` → `ServerConfig` — [both] deep-merge patch;
   a new config section is a schema key, never a new method.
3. `migrateCredentialsToStore(db, cipher, store)` → void — [inside-out] boot secret migration on
   the owned blob.

### B. Configuration resolution engine (defaults + overrides) (5)
4. `listConfiguration(db, filter?: { kind?; key? })` → `ResolvedConfigurationItem[]` — [inside-out
   + settings-UI demand] the one filtered read; subsumes list-all / list-by-kind / find-one.
5. `writeConfigurationOverride(db, { kind; key; value })` (`value: null` clears) →
   `ResolvedConfigurationItem | null` — [inside-out] override set+clear as one value-parameterized
   write.
6. `seedConfigurationDefaults(db, { source; defaults })` → void — [inside-out] defaults write;
   built-in = `source = BUILTIN_PLUGIN_SOURCE`.
7. `backfillConfigurationDefaults(db, deps)` → void — [inside-out] boot projection of live state
   into built-in seeds.
8. `setPluginState(db, pluginId, state)` → void — [inside-out] plugin enable/disable/remove state
   machine on the `plugins` table; not expressible as a config override.

### Types (8)
`ServerConfig`, `ServerConfigPatch`, `ResolvedConfigurationItem`, `PluginConfigurationSource`,
`PluginConfigurationSeed`, `BackfillLegacyConfigurationDeps`, plus the 3 inbound DI ports collapse to
the ones actually consumed: `RoutineReader`, `SettingsCredentialCipher`, `SettingsUserDirectory`.
Constant `BUILTIN_PLUGIN_SOURCE`. (Count the 6 data types + `ResolvedConfigurationItem` = 7; ports
are inbound demand, counted separately — hold the surface at ~8 named types.)

---

## 4. TARGET NUMBERS

- **currentMethods 13 → targetMethods 8** (floor 6 + 2 boot capabilities).
- **currentTypes 11 → targetTypes 8.**
- **Floor = 6** (singleton read/update = 2; resolution engine = 4). Not 20 — the singleton and the
  3-table engine collapse CRUD.

### DELETED (removed from the product, not internalized)
- **`agent-behavior-config` module** — `listAgentBehaviorConfiguration`,
  `patchAgentBehaviorConfiguration`, `AgentBehaviorConfigError`, `ListAgentBehaviorConfigOptions`,
  `PatchAgentBehaviorConfigInput` (2 methods + 1 error + 2 option types). It is a **presentation
  view-model** — builds display labels, status strings, editable-field descriptors and settings-page
  deep-links over the resolve/override primitives. No cross-service consumer; read only by the
  settings-UI route. **Relocate to the settings-UI route/presentation layer.** It composes on top of
  §B (list + writeOverride); it is not a config primitive.

The already-collapsed internals stay internal (`getResolvedConfiguration`, per-section Zod schemas
`ServerConfigSchema`/`NotificationsSchema`/`ModelGatewayConfigSchema`/`ModelTierConfigSchema`,
per-method `*Input`/`*Options` wrappers) — validation and merge machinery, zero demand.

### Completeness proof (LEAN *and* COMPLETE)
Every current real feature stays deliverable:
- Any service's config read/write (git-export, notifications, cost, dispatch, model-gateway,
  observability) → `readServerConfig`/`updateServerConfig`, narrow in caller port. New section = schema
  key.
- Settings page renders every agent/skill/routine/trigger/tool/mcp/harness knob →
  `listConfiguration({kind})`; the label/link view-model moves to the route (still delivered, just not
  in this service's API).
- Edit/clear a knob → `writeConfigurationOverride({value|null})`.
- Enable/disable a plugin → `setPluginState`.
- Install plugin defaults / boot seed → `seedConfigurationDefaults` / `backfillConfigurationDefaults`.
- Boot secret migration → `migrateCredentialsToStore`.
No feature is stranded; the only surface loss is fragmentation (per-section reads, the presentation
view-model, per-method wrapper types).

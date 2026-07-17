# settings — Service-as-Product Audit (AU20)

Layer: core-api. Current public exports: 36. Owned tables: `serverConfig`, `plugins`,
`pluginConfigurationDefaults`, `configurationOverrides`.

## 1. Existence / Consolidation Verdict — STANDALONE

`settings` earns its own boundary. Product purpose: **the single configuration source of
truth**. It owns two config data models that no other service should touch directly:

- **`serverConfig`** — one typed singleton blob holding every service's own config *section*
  (git-export, observability, model-gateway, cost, notifications, harness-disabled, internal
  dedup state). 6 of 7 consumers read/update their slice through it.
- **plugin configuration** (`plugins` / `pluginConfigurationDefaults` / `configurationOverrides`)
  — the defaults-plus-overrides resolution engine that produces the `ResolvedConfigurationItem`
  view of every agent/skill/routine/trigger/tool/mcp/harness behaviour knob. 1 consumer
  (`trigger-resolution`) reads it cross-service; the web/route layer reads it for the settings UI.

Not infra (not agent-orchestration/agent-execution) — it's a core-api data-owning domain service.
No candidate-cluster neighbors were proposed (`[]`), and none is warranted: the config tables have
no sibling that could absorb them without becoming a god-service, and pulling the singleton blob
apart per-section is exactly the table-ownership-as-boundary anti-pattern the frame rejects.

**Challenge to the AU19 claim** ("single configuration source of truth", 8 bullet-point exports):
the boundary is real but the *surface over-specifies*. Two concrete drifts:
- Per-section Zod schema exports (`ServerConfigSchema`, `NotificationsSchema`,
  `ModelGatewayConfigSchema`, `ModelTierConfigSchema`) are published, yet **no consumer in the
  census requests a schema** — every consumer asks only `read`/`update`. These are internal
  validation details leaking into the product surface.
- `agent-behavior-config.ts` (`listAgentBehaviorConfiguration` / `patchAgentBehaviorConfiguration`)
  is a **presentation projection** — it builds `AgentBehaviorConfigView` with display labels, status
  strings, editable-field descriptors and deep-links. No cross-service consumer requests it; it is
  read only by the settings UI route layer. It *composes on top of* the resolve/override primitives;
  it is not itself a config primitive. Candidate to relocate to the route/presentation layer. Kept
  in-service for now but must not be mistaken for core API.

So: standalone service, but the 36-export surface is ~2x the coherent product API.

## 2. Deliberate Target Public API (~18 exports, from 36)

### A. Server config (the typed singleton) — 5
1. `readServerConfig(db)` → `ServerConfig`
2. `updateServerConfig(db, patch: ServerConfigPatch)` → `ServerConfig` — deep-merge patch; a new
   config section is a new key on the schema, **never a new method**.
3. `type ServerConfig`, `type ServerConfigPatch`
4. `migrateCredentialsToStore(db, cipher, store)` — one-shot boot migration that mutates the owned
   `serverConfig` table; stays with the owner as boot wiring.

Drops from public → internal: `ServerConfigSchema`, `NotificationsSchema`,
`ModelGatewayConfigSchema`, `ModelTierConfigSchema` (validation internals, zero census demand).

### B. Configuration resolution + authoring (defaults + overrides) — 5
5. `listConfiguration(db, filter: { kind?; key? })` → `ResolvedConfigurationItem[]`
   — the general read. **Subsumes** `listResolvedConfiguration` (kind filter) **and**
   `getResolvedConfiguration` (kind+key filter → single). One filter-parameterized read replaces the
   list/find pair.
6. `writeConfigurationOverride(db, { kind; key; value })` where `value: null` clears
   — **subsumes** `setConfigurationOverride` + `clearConfigurationOverride`. Set vs. clear are the
   same write parameterized by value presence (a `state` transition on the override row).
7. `seedConfigurationDefaults(db, { source: PluginConfigurationSource; defaults })`
   — **subsumes** `loadPluginConfigurationDefaults` + `loadBuiltInConfigurationDefaults` (built-in is
   just `source = BUILTIN_PLUGIN_SOURCE`).
8. `backfillConfigurationDefaults(db, deps: BackfillLegacyConfigurationDeps)`
   — the boot-time projection that gathers live agents/routines/connections/skills/tools into the
   built-in seed set. **Subsumes** `backfillLegacyConfigurationDefaults` +
   `projectProductionConfigurationDefaults` (the latter was a pure alias).
9. `setPluginState(db, pluginId, state)` — plugin enabled/disabled/removed transition. Kept: a
   distinct state machine, not expressible as a config override.

### C. Constants / shared shapes — 4
- `BUILTIN_PLUGIN_SOURCE`, `type PluginConfigurationSeed`, `type PluginConfigurationSource`,
  `type BackfillLegacyConfigurationDeps` (DI deps for the backfill projection).

Drops → inlined as method params: `LoadPluginConfigurationDefaultsInput`,
`LoadBuiltInConfigurationDefaultsInput`, `SetConfigurationOverrideInput`,
`ClearConfigurationOverrideInput`, `PluginStateOptions`, `BackfillLegacyConfigurationOptions`
(one named wrapper type per method is exactly the per-caller sprawl the frame rejects).

### D. Consumed DI ports (inbound, wired at the composition root) — 3
- `type RoutineReader`, `type SettingsCredentialCipher`, `type SettingsUserDirectory`.
  These are demand *settings places on others*, not surface it offers; kept minimal.

### E. Presentation projection (relocate candidate) — ~3
- `listAgentBehaviorConfiguration`, `patchAgentBehaviorConfiguration`, `AgentBehaviorConfigError`.
  A view-model over B; belongs at the settings-UI route layer. If relocated, service drops to ~15.

**Target: ~18 exports** (down from 36; ~15 if the agent-behavior projection relocates out).

## 3. Inside Lens (clean/evolvable)

- Two internal modules stay: `server-config.ts` (singleton blob) and `plugin-configuration.ts`
  (defaults/overrides engine). Each owns its tables; the barrel exposes only typed functions, never
  the raw pgTable (Table-ACL Mechanism A preserved).
- The blob's `applyDefaults`/deep-merge machinery localizes the Zod-v4 nested-default gotchas
  (documented in-file) so adding a config section is a schema edit + one default line — no call-site
  churn across the ~40 prod / ~120 test `read/update` sites.
- Foreign reads stay behind the 3 DI ports; the service imports no other service's tables.
- Presentation logic (labels/links/editable fields) is quarantined in `agent-behavior-config.ts`
  and never mixes into the resolution engine.

## 4. Scaling Argument (sub-linear)

Apply the test — dozens more services, hundreds more calls:
- **New service wants its own config section** (e.g. a new `retention` block): add a key to
  `ServerConfigSchema` + one `DEFAULTS` line; it reads via `readServerConfig().retention` and writes
  via `updateServerConfig({ retention })`. **Zero new methods.** Contrast the rejected shape
  `readGitExportConfig` / `readObservabilityConfig` / `readCostConfig` — one method per section,
  which would already be 6+ methods and grow linearly.
- **New configuration kind** (e.g. a new agent-behaviour knob): add it to `CONFIGURATION_KINDS`;
  `listConfiguration({ kind })` resolves it with no signature change. Contrast
  `listAgentDefaults` / `listToolDefaults` / `listRoutineDefaults`.
- **New consumer wanting a narrow slice**: composes `readServerConfig` + narrows in its own port
  (exactly what git-export/observability/cost already do). No settings-side method added.
- **Set vs. clear vs. future "reset to default"** all fall out of `writeConfigurationOverride`'s
  value parameter rather than a method each.

The filter/patch-parameterized reads and the single override-write absorb new use-cases by
composition; the surface stays flat as the graph grows.

## 5. Key Collapses

1. `listResolvedConfiguration` + `getResolvedConfiguration` → **`listConfiguration({ kind?, key? })`**
   (list + find → one filtered read).
2. `setConfigurationOverride` + `clearConfigurationOverride` → **`writeConfigurationOverride({ value | null })`**.
3. `loadPluginConfigurationDefaults` + `loadBuiltInConfigurationDefaults` →
   **`seedConfigurationDefaults({ source })`** (built-in = pass the constant).
4. `backfillLegacyConfigurationDefaults` + `projectProductionConfigurationDefaults` →
   **`backfillConfigurationDefaults`** (drop the alias).
5. 4 Zod schema exports (`ServerConfigSchema`/`NotificationsSchema`/`ModelGatewayConfigSchema`/
   `ModelTierConfigSchema`) → **internal** (zero census demand).
6. ~6 per-method `*Input` / `*Options` wrapper types → **inlined method params**.
7. `agent-behavior-config` (2 fns + error) → flagged as a **presentation projection** that composes
   on the resolve/override API; relocate to the route layer (removes 3 more from the service surface).

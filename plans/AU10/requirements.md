# AU10 — Plugin surface ownership correction — Requirements

## Value

Plugins and built-in defaults must be **configuration sources only**. Today the
plugin/default configuration projection reaches *upward* into execution
internals: `plugin-configuration.ts` imports `ALL_TOOL_DEFINITIONS` from the
runtime tool **execution** registry to project the built-in `tool` capability
defaults. That single edge recreates the Strategy/Fabric anti-pattern in a new
place — configuration code that "knows how execution is wired." AU10 inverts
that edge so configuration describes *desired* capabilities as plain data, and
runtime registries/adapters consume the *resolved active configuration* without
ever being imported by plugin/default resolution.

This is a framework/backend correction. No user-facing surface, no UI, no new
primitive. Guide draft: **N/A** (nothing a user sees changes; AU2/AU5 observable
behavior is preserved exactly).

## The load-bearing noun: Configuration record (already exists — locking its boundary)

AU2/AU5 already established the configuration record model. AU10 does not
introduce a new noun; it **locks the ownership boundary** of the existing one.

A **configuration record** (`pluginConfigurationDefaults` + `configurationOverrides`,
resolved into `ResolvedConfigurationItem`) is:

- **Plain declared data** — `{ kind, key, value }` seeds, where `value` is a
  JSON object validated by a per-kind Zod schema. It carries no handler, no
  schema-with-executable-behavior, no live registry reference.
- **Provenance-tagged** — every resolved item has an `origin`
  (`builtin` | `plugin` | `user`) plus `pluginId`/`pluginState`/`defaultVersionHash`.
- **Layered** — built-in defaults, then plugin defaults by order, then user
  overrides win; disabled plugin origins become explicit inactive origins, not
  silent deletes.
- **Queryable before and after a run** — through `listResolvedConfiguration` /
  `getResolvedConfiguration`.

### What a configuration record ISN'T (rejection list)

- **NOT a runtime tool.** It does not own or import the tool *handler* graph.
  The tool `handler`, `inputSchema`, and `ToolContext` live in
  `tools/tool-registry.ts` (execution). The config record holds only the tool
  *catalog metadata*: `name`, `description`, `roles?`, `reversibility?`.
- **NOT a discovery mechanism.** It does not enumerate live capabilities by
  importing a registry/adapter/provisioning service. Capabilities are
  **declared** as static data, then validated — never *discovered* from runtime.
- **NOT a runtime actor.** It never pushes behavior into runtime registries,
  never subscribes to the event bus, never calls a harness or provisioner.
- **NOT a second copy of built-in behavior.** Built-in defaults flow through the
  *same* `pluginConfigurationDefaults` table + provenance model as plugin
  defaults (via `BUILTIN_PLUGIN_SOURCE`) — already true today; AU10 keeps it true
  after removing the runtime import.

## The concrete leak inventory (verified against code @ c82812b5)

Full scan of the plugin/default configuration surface. **One** genuine
upward-into-execution import exists:

| File | Leak | Severity |
|---|---|---|
| `packages/server/src/services/plugin-configuration.ts:26` | `import { ALL_TOOL_DEFINITIONS } from "../tools/tool-registry.js"` — the runtime tool **execution** registry (transitively imports all ~20 tool handlers + `ToolContext` + `app-runtime/contracts`). Used at `:477–488` to project built-in `tool` defaults. | **Critical — the AU10 target** |

**Confirmed clean** (no runtime-registry/adapter/provisioning/harness/MCP imports):
`agent-behavior-config.ts` (thin settings surface over resolved config),
`server-config.ts` (server bootstrap config, out of scope),
`team-default-harness.ts` (pure resolver, shared-type only).

**Correctly out of scope** (runtime consumers, not config sources — AU11 owns
them): `agent-defaults/resolvers.ts` imports `app-runtime/roster` +
`app-runtime/services/agent-selection` — it is the app-runtime resolution shell,
not plugin/default configuration.

**Consumption direction is already correct:** `trigger-resolution.ts:243` reads
`listResolvedConfiguration(db, "trigger")` — runtime consuming resolved config.
AU10 must preserve this and forbid the reverse (config importing runtime).

## Acceptance criteria → verification method

| # | AC | Verification |
|---|---|---|
| AC1 | Plugin/default config code does not import runtime tool registries, harness adapters, MCP bridge registries, provisioning services, or agent execution internals. | **Static/architectural** → new lint guard `scripts/au10-plugin-config-ownership-guard.ts` (AST transitive-import check), wired into `npm run lint`. NOT a test. |
| AC2 | Built-in defaults use the same editable config/provenance model as plugin defaults. | **Runtime** → extend `configuration-projection-boot.integration.test.ts`: after refactor, `tool` defaults still project with `origin.type === "builtin"`. |
| AC3 | Runtime consumes active configuration through agent-layer contracts, not plugin code pushing into runtime registries. | **Static** → AC1 guard (no runtime import ⇒ cannot push) + existing `trigger-resolution.test.ts` (runtime reads resolved config). |
| AC4 | User overrides, disabled plugin origins, built-in defaults preserve AU2/AU5 observable behavior. | **Runtime regression** → existing `plugin-configuration.test.ts` suite (override-wins, disabled→inactive, builtin provenance) stays green unchanged. |
| AC5 | Capability validation is explicit and inspectable without owning runtime discovery. | **Runtime** → unit test: every `BUILTIN_TOOL_CATALOG` entry passes `validateConfigurationValue("tool", …)`; catalog is static data (AC1 guard proves no discovery import). |
| AC6 | Review includes a should-graph audit proving plugins are config sources only. | The AC1 guard **is** the mechanical should-graph audit; reviewer runs it + inspects the classification table in `architecture.md`. |

### Validation scenarios → method

- VS1 (queried active config shows builtin+plugin defaults w/ provenance, no runtime import) → `configuration-projection-boot.integration.test.ts` + AC1 guard.
- VS2 (user override survives a plugin-default change; runtime consumes active value) → `plugin-configuration.test.ts` override-wins case (extend with "re-seed default does not clobber active override").
- VS3 (plugin config importing execution internals ⇒ package fails) → guard's embedded `--fixtures` self-check (mirror au9 guard): a fixture config file importing `tool-registry` yields a finding; a clean one does not.

## Refine self-assessment: 9/10

Requirement is sharp: one concrete leak, a known inversion pattern
(component-inventory row 40: "Core registry/invocation stays; tool catalog
becomes core tools + plugin tool packs"), and a guard pattern already proven by
au6/au7/au9. Residual −1: drift risk between the extracted catalog and the live
handler set must be closed by a runtime consistency check (see architecture.md),
or the split silently rots.

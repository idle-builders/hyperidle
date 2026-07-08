DOC-CLASS: minor

# AU2 Requirements: Plugin Defaults Become Editable Configuration

## Required Reading

- `.pipeline/work-packages/TRACK-AU.md`
- `docs/architecture/runtime-simplification.md`
- `docs/architecture/as-implemented-domain-architecture.md`
- `plans/strategy-kernel-plugin-split/dependency-graph.md`
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`
- `docs/agent-layer/agent-model.md`
- `docs/agent-layer/harness-capability-descriptor.md`
- `docs/architecture/connection-model.md`
- `docs/architecture/credential-model.md`

## Goal

HyperIdle needs one app-owned configuration model where plugins and built-ins seed defaults, while users own the active editable configuration. AU2 makes plugin contributions visible as configuration data with provenance and override semantics, without making plugins a runtime layer.

Maintainers get a single replacement home for behavior now scattered through Strategy methods, Fabric bootstrap, hard-coded tools, built-in routines, agent templates, MCP wiring, and harness descriptors. Builders of AU3/AU4 get a stable configuration source for removing Fabric/Strategy and resolving triggers.

## Success

- A plugin can contribute defaults for agents, skills, routines, triggers, tools, MCP servers, and harness descriptors.
- Built-in HyperIdle defaults use the same seed path as plugin defaults.
- The app can query each configuration item with origin, active value, override state, and disabled/removed origin state.
- A user edit wins over plugin defaults and survives plugin default changes.
- Disabling or removing a plugin leaves explicit queryable state for affected defaults and user-owned overrides.
- Existing agents, routines, tools, MCP, skills, and harness settings are reachable through the new model.

## Scope

In scope:

- Plugin-default vocabulary and provenance rules.
- Durable app-owned configuration records and resolver contracts.
- Built-in default projection through the same mechanism.
- Read/query APIs or services needed by later AU work and AU5 settings UI.
- Migration/backfill for existing built-in agents, routines, skills, tools, MCP descriptors, and harness settings into the configuration model.

Out of scope:

- Visual editing UI; AU5 owns it.
- Trigger evaluation and dispatch; AU4 owns it.
- Remote plugin installation, marketplace, signing, package publishing, dependency resolution, trust tiers, or sandboxing.
- A parallel harness or runtime execution path.
- Plugin code execution as a runtime participant.

## Guide Draft

Plugin defaults are configuration seeds. Installing or enabling a plugin adds default configuration items such as agents, skills, routines, triggers, tools, MCP servers, and harness descriptors. The app shows each item with its origin and whether the active value is still the plugin default or has been edited by the user.

Editing a plugin-provided item creates a user override. The override becomes the active value, but the origin remains visible so the user can still understand where the item came from. If the plugin later changes its default, the user override stays active until the user chooses to reset or edit again.

Built-in HyperIdle behavior is represented the same way as plugin behavior: built-in agents, routines, tools, MCP, and harness defaults come from a built-in plugin source. Disabling or removing a plugin does not silently erase user edits. Configuration queries return an explicit origin state so operators can see whether an active override came from an enabled, disabled, removed, built-in, or purely user-owned source.

## Nouns

**Plugin default**: A plugin-contributed default value for a supported configuration kind. It is a seed, not ownership of runtime state.

Hard rules:

- A plugin default cannot directly execute LLM work or subscribe to domain events.
- A plugin default has stable identity: `{pluginId, kind, key}`.
- Built-in defaults are plugin defaults from the reserved built-in plugin source.

**Editable configuration item**: The app-owned record that resolves a default value plus optional user override into the active value for one agent, skill, routine, trigger, tool, MCP server, harness descriptor, or settings metadata item.

Hard rules:

- User override wins over every default.
- Active runtime reads go through the configuration resolver, not plugin files.
- Config item identity must stay stable across plugin version changes.

**Configuration provenance**: Queryable metadata that explains where a configuration item came from and why its current value is active.

Hard rules:

- Provenance survives user edits.
- Disabled or removed plugin origins are explicit states, not silent deletes.
- Provenance never contains secrets; credentials and connections keep their existing stores.

## Acceptance Criteria And Verification

| AC | Requirement | Verification method |
|---|---|---|
| AC1 | A plugin can contribute default agents, skills, routines, triggers, tools, MCP servers, and harness descriptors without owning user-edited runtime state. | Service integration test imports the plugin-default loader, registers a fixture plugin with one item of every kind, queries resolved configuration, and asserts all items exist with `origin.type="plugin"` and no plugin-owned runtime execution object is created. |
| AC2 | The app distinguishes plugin-provided defaults from user-owned overrides for every contributed configuration kind. | Unit test imports the config resolver and asserts each supported kind returns `valueSource: "default"` before edit and `valueSource: "user_override"` after edit. |
| AC3 | A user override wins over a plugin default while preserving origin visibility. | Service integration test seeds a plugin agent/routine, applies an override, changes the plugin default, then asserts the active value is the override and `origin.pluginId`/default metadata remain visible. |
| AC4 | Disabling or removing a plugin produces explicit queryable state instead of silently deleting user-owned edits. | Service integration test disables then removes a fixture plugin and asserts default-only items report inactive origin state while overridden items remain queryable with `originState: "plugin_disabled"` or `"plugin_removed"`. |
| AC5 | Built-in HyperIdle behavior is represented through the same plugin-default mechanism as other plugin contributions. | Service integration test runs built-in default projection and asserts built-in agents/routines/tools/MCP/harness defaults have `origin.type="builtin"` through the same resolver response shape. |
| AC6 | Existing agents, routines, tools, MCP, skills, and harness settings remain available through the new configuration model. | Migration/backfill integration test starts from legacy seed data, runs the AU2 migration/projection, then queries configuration kinds and existing routes/services to assert legacy behavior is still visible. |
| AC7 | Static shape and runtime code stay type-safe and lint-clean. | `npm run check`, `npm run lint`, and `npm run test` pass; static-only rules are enforced through types/lint, not filesystem-reading tests. |

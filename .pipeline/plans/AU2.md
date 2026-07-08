# AU2 Architecture Plan: Plugin Defaults Become Editable Configuration

## Required Reading

- `.pipeline/work-packages/AU2/requirements.md`
- `.pipeline/work-packages/TRACK-AU.md`
- `docs/architecture/runtime-simplification.md`
- `docs/architecture/as-implemented-domain-architecture.md`
- `plans/strategy-kernel-plugin-split/dependency-graph.md`
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`
- `docs/agent-layer/agent-model.md`
- `docs/agent-layer/harness-capability-descriptor.md`
- `docs/architecture/connection-model.md`
- `docs/architecture/credential-model.md`

## Plan Reconciliation

- Spec assumes AU1 exists. Reality: `sessions.taskId` is nullable and `agent_session_requests` exists in `packages/db/src/schema.ts`; AU2 can target that runtime boundary later but must not create a new execution path.
- Spec asks for plugin defaults for agents. Reality: agents are `users` rows with `kind="ai"` and operational fields; `persistScaffoldedAgents` is the main server-side writer, while factory/bootstrap paths still seed directly. Plan adds configuration provenance and projection without replacing `users` immediately.
- Spec asks for routines. Reality: `routines` are durable rows, built-in routine specs live in `packages/fabric/src/services/builtin-routines.ts`, and built-in ids use `builtin:*`. Plan treats these specs as built-in plugin defaults and projects/backfills them into config provenance.
- Spec asks for skills. Reality: `user_skills` grants exist but there is no standalone skill catalog table. Plan introduces a skill configuration kind and maps grants/catalog entries through resolver output.
- Spec asks for tools. Reality: tools are hard-coded `ToolDefinition`s in `packages/server/src/tools/tool-registry.ts`. Plan introduces tool config descriptors that gate/catalog registered tool definitions; handlers remain first-party code, not plugin-executed code.
- Spec asks for MCP servers. Reality: MCP bridge and service connections already exist, with inherited/held connection rules and no secret echo. Plan stores MCP descriptors only; credentials stay in `server_credentials` and `service_connections`.
- Spec asks for harness descriptors. Reality: `GET /api/harnesses` projects registered adapters plus missing known descriptors and disabled state from `server_config.harnessDisabled`. Plan moves descriptor/default enablement metadata into config while preserving adapter registration and the built-in hard exemption.
- Spec asks for disabled/removed plugin state. Reality: no plugin registry exists. Plan adds minimal plugin registry state for built-in, installed, disabled, and removed origins; no marketplace or installer.

## Acceptance Criteria And Verification

| AC | Verification |
|---|---|
| AC1 plugin defaults for all supported kinds | Add `packages/server/src/services/__tests__/plugin-config-defaults.integration.test.ts`: fixture plugin contributes agent, skill, routine, trigger, tool, MCP server, harness descriptor; loader persists defaults; resolver returns all kinds with `origin.type="plugin"` and no session/provisioning call occurs. |
| AC2 defaults vs user overrides distinguished | Add `packages/server/src/services/__tests__/plugin-config-resolver.test.ts`: pure resolver fixtures assert `valueSource` and `overrideState` for every kind before and after applying a user override. |
| AC3 user override wins and origin remains visible | Extend resolver integration test: seed plugin default agent prompt/trigger prompt, apply override, update default version, assert `activeValue` is override and origin metadata still names plugin/default version. |
| AC4 disabled/remove explicit state | Add `packages/server/src/services/__tests__/plugin-config-lifecycle.integration.test.ts`: disable and remove fixture plugin; assert default-only items become inactive with explicit `originState`, overridden items remain queryable and active unless user deletes them. |
| AC5 built-ins use same mechanism | Add `packages/server/src/services/__tests__/builtin-plugin-defaults.integration.test.ts`: run built-in projector and assert built-in agents, routines, tool descriptors, MCP/harness descriptors are returned through same resolver shape with `origin.type="builtin"`. |
| AC6 existing config remains available | Add migration/backfill integration test under `packages/server/src/services/__tests__/plugin-config-backfill.integration.test.ts`: legacy seed data still appears via config resolver and existing agent/routine/harness routes remain behaviorally available. |
| AC7 check/lint/test green | Run `npm run check`, `npm run lint`, `npm run test`. Static import boundaries are type/lint enforced; tests import services and assert behavior, no source-file grepping as test proof. |

## Contracts

### Supported Kinds

```ts
export const CONFIGURATION_KINDS = [
  "agent",
  "skill",
  "routine",
  "trigger",
  "tool",
  "mcp_server",
  "harness_descriptor",
] as const;

export type ConfigurationKind = (typeof CONFIGURATION_KINDS)[number];
```

### Database Shape

Add to `packages/db/src/schema.ts` plus Drizzle migrations:

```ts
plugins: {
  id: text primary key,              // "builtin" reserved for HyperIdle built-ins
  name: text not null,
  version: text not null,
  state: "enabled" | "disabled" | "removed",
  installedAt: text not null,
  updatedAt: text not null,
  disabledAt: text | null,
  removedAt: text | null
}

pluginConfigurationDefaults: {
  id: text primary key,
  pluginId: text references plugins(id) restrict,
  kind: ConfigurationKind,
  key: text,                         // stable within plugin+kind
  defaultValueJson: text not null,
  defaultVersionHash: text not null,
  createdAt: text not null,
  updatedAt: text not null,
  unique(pluginId, kind, key)
}

configurationOverrides: {
  id: text primary key,
  defaultId: text references pluginConfigurationDefaults(id) set null,
  kind: ConfigurationKind,
  key: text,
  userValueJson: text not null,
  state: "active" | "deleted",
  createdByUserId: text references users(id) set null,
  createdAt: text not null,
  updatedAt: text not null,
  unique(kind, key)
}
```

The resolver computes active value; do not persist duplicate `activeValueJson`.

### Shared Types

Add `packages/shared/src/configuration.ts`:

```ts
export interface ConfigurationOrigin {
  readonly type: "builtin" | "plugin" | "user";
  readonly pluginId: string | null;
  readonly pluginName: string | null;
  readonly pluginState: "enabled" | "disabled" | "removed" | null;
  readonly defaultVersionHash: string | null;
}

export interface ResolvedConfigurationItem<T = unknown> {
  readonly kind: ConfigurationKind;
  readonly key: string;
  readonly activeValue: T;
  readonly defaultValue: T | null;
  readonly userValue: T | null;
  readonly valueSource: "default" | "user_override" | "user_owned";
  readonly origin: ConfigurationOrigin;
  readonly active: boolean;
}
```

### Server Services

- `packages/server/src/services/plugin-config/plugin-manifest.ts`: Zod schemas for plugin default manifests. Validate per-kind payloads before persistence.
- `packages/server/src/services/plugin-config/default-loader.ts`: upsert plugin rows and default rows by `{pluginId, kind, key}`.
- `packages/server/src/services/plugin-config/builtin-defaults.ts`: converts existing built-in agent/routine/tool/MCP/harness descriptors into the same manifest shape.
- `packages/server/src/services/plugin-config/overrides.ts`: create/update/delete user overrides.
- `packages/server/src/services/plugin-config/resolver.ts`: returns resolved items, applies user-wins rule, marks disabled/removed plugin origins.
- `packages/server/src/services/plugin-config/backfill.ts`: links existing users/routines/user_skills/tool and harness settings to built-in defaults where possible.

### API Surface

AU2 may add internal or public API endpoints only if needed for verification and AU5 handoff:

- `GET /api/configuration?kind=...` returns `ResolvedConfigurationItem[]`.
- `PATCH /api/configuration/:kind/:key` applies a user override.
- `POST /api/plugins/:id/disabled` toggles plugin registry state.

If endpoints are added, use existing `requireBoundary({ kind: "public-data" })` for reads and write boundary/rate limiting consistent with settings/harness routes. AU5 can later build UI on top.

## Ordered Tasks

1. Add shared configuration kind/origin/resolved-item types in `packages/shared/src/configuration.ts`; export from shared index; add pure type tests under `packages/shared/src/__tests__/configuration.test.ts`.
2. Add DB tables and migrations for `plugins`, `plugin_configuration_defaults`, and `configuration_overrides`; include unique indexes listed above.
3. Implement Zod schemas and manifest loader in `packages/server/src/services/plugin-config/`; reject malformed kind payloads before DB writes.
4. Implement resolver and override writer; unit-test merge rules for every kind.
5. Implement built-in default projector from existing built-in agents/routine specs/tool registry/MCP/harness descriptors; seed reserved `builtin` plugin.
6. Implement legacy backfill/projection so current `users`, `routines`, `user_skills`, tool descriptors, service/MCP descriptors, and harness disabled settings are visible through resolver.
7. Add minimal configuration/plugin query and mutation routes only if needed by AU2 tests/AU5 handoff; otherwise keep service-only.
8. Wire boot path in `server-factory.ts` after migrations and before runtime consumers: load built-in defaults, then installed plugin defaults, then leave active runtime reads to resolver.
9. Add integration tests listed in Acceptance Criteria.
10. Run `npm run check`, `npm run lint`, `npm run test`.

## Design-It-Twice

Alternative A: add provenance columns directly to `users`, `routines`, `user_skills`, `server_config`, and future trigger/tool tables. This keeps reads local but repeats default/override/origin behavior across every domain table and makes plugin disable/remove logic inconsistent.

Alternative B: add a unified configuration default/override store and project into existing domain tables only where runtime already needs those rows. This centralizes provenance and user-wins rules while preserving current domain contracts.

Chosen: Alternative B. AU2 is a framework foundation for AU3-AU5; one resolver is cheaper to reason about than seven bespoke provenance implementations.

## Security And Abuse Cases

- Rate-limit state-changing endpoints: applicable if routes are added; use existing route-local/global rate limiter patterns.
- Input trust boundary for agent-authored fields: applicable. Plugin manifests and overrides are untrusted JSON; validate with Zod per kind and reject unknown secret-bearing fields.
- Secret handling: applicable. Plugin defaults may reference MCP/connection requirements but must not store credential values. Credentials stay in `server_credentials`; connections stay in `service_connections`.
- Path traversal: N/A for AU2 unless plugin manifests include filesystem paths. Do not include path-based plugin loading beyond built-in in-repo fixture manifests.
- SSRF: applicable for MCP server descriptors. Store URL descriptors only after URL validation; runtime connection behavior remains owned by MCP/connection services.
- Plugin execution/sandboxing: out of scope. Defaults are data; plugin code is not executed.

## Route Checklist

N/A unless the implementation adds configuration routes. If added, cover:

- `packages/server/src/routes/configuration.ts`
- `packages/server/src/routes/plugins.ts`
- `packages/server/src/server-factory.ts` route mount
- `packages/api-contract/src/configuration.ts` response types

## Migrations

- Add migrations for new plugin/config tables.
- Backfill reserved `builtin` plugin row.
- Backfill built-in defaults from current hard-coded/built-in sources.
- Do not drop or rename existing `users`, `routines`, `user_skills`, `server_config`, `service_connections`, or harness tables in AU2.
- If `server_config.harnessDisabled` moves into config, keep compatibility reads/writes until AU5/AU3 consumes resolver everywhere.

## Protected Tests

protectedTests:

- `packages/server/src/services/__tests__/agent-session-requests.test.ts`
- `packages/server/src/routes/__tests__/X3-agents.integration.test.ts`
- `packages/server/src/routes/__tests__/routines.routes.integration.test.ts`
- `packages/server/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts`
- `packages/server/src/mcp/__tests__/mcp-bridge-stateful.integration.test.ts`
- `packages/server/src/tools/__tests__/tool-registry.integration.test.ts`

## Shared Files

sharedFiles:

- `packages/db/src/schema.ts`
- `packages/db/drizzle/*`
- `packages/shared/src/index.ts`
- `packages/shared/src/configuration.ts`
- `packages/server/src/server-factory.ts`
- `packages/server/src/routes/index.ts`
- `packages/api-contract/src/index.ts`
- `packages/server/src/services/server-config.ts`
- `packages/server/src/tools/tool-registry.ts`

## Risks And Ambiguities

- Existing hard-coded tools are executable handlers, while plugin defaults should be data only. Keep handler registration first-party until a later explicit plugin execution WP exists.
- Backfilling existing agents to built-in defaults may not perfectly identify user-created agents. Treat unmatched rows as `origin.type="user"` rather than forcing false built-in provenance.
- Harness descriptors mix DB-free adapter pool state with user-disabled config. Preserve adapter registration; config owns descriptor/default metadata and disabled intent.
- Built-in routines currently live in Fabric. AU2 should project their specs into config but not remove Fabric runtime code; AU3 owns removal.

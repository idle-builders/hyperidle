# BA9a — A plugin can be installed

Split from BA9 (2026-08-25, founder decision). Decisions carried from the live interview are recorded
in `.pipeline/work/BA9/founder-decisions.md` — read that first; it is authority alongside this plan.

## Outcome

A plugin in the **Agent Plugins 1.0** format can be installed into a running HyperIdle from a git URL, a
zip, or a folder path. The installer chooses whether it lands on one team or on the whole backend. Its
contributions become ordinary editable rows. Editing one detaches it from the plugin, which the product
says out loud, and you can put it back. The plugin can be disabled and removed.

## Why this matters

The product's whole extension story rests on this and it does not exist. The configuration half is real
— three tables and a resolver where a plugin's default loses to a user's override. The intake half was
never built: no format, no loader, no install path, nothing that ever wrote a
`plugin_configuration_defaults` row. Until this exists, "ship it as a plugin" has no substrate to ship
onto, and the twenty-one plugin-marked rows in the AU20 audit cannot be removed from core without losing
the capability.

## What exists today

Verified against the tree at `dc8d1cbd7`.

**The three tables** (`framework/db/src/schema.ts`):

- `plugins` (`:1141-1154`) — `id`, `name`, `version`, `state`, `installedAt`, `updatedAt`, `disabledAt`,
  `removedAt`. Check constraint pins `state` to `enabled | disabled | removed`.
- `plugin_configuration_defaults` (`:1156-1182`) — `pluginId` (FK to `plugins`, **`onDelete: "restrict"`**),
  `kind`, `key`, `defaultValueJson`, `defaultVersionHash`. Unique on `(pluginId, kind, key)`. Check
  constraint pins `kind` to the six configuration kinds.
- `configuration_overrides` (`:1184-1213`) — `defaultId` (FK, `onDelete: "set null"`), `kind`, `key`,
  `userValueJson`, `state` (`active | deleted`), `createdByUserId`. **Unique on `(kind, key)` globally,
  not per plugin.**

**The resolver.** `layers/core-api/settings/src/plugin-configuration.ts` joins defaults to overrides,
decides the active value, and stamps each result with an origin (`builtin` / `plugin` / `user`).
`listResolvedConfiguration` drives its outer query from the **defaults** table (`:248`), which is why the
settings pane is empty today — there are zero defaults rows, not zero plugin rows.

**A `plugins` row already exists on every install.** Migration
`framework/db/drizzle/0044_AU2_plugin_configuration.sql:36-38` seeds
`('builtin', 'HyperIdle Built-ins', '0', 'enabled', ...)` with `ON CONFLICT DO NOTHING`, and the resolver
branches on it via `BUILTIN_PLUGIN_ID` (`framework/domain-model/src/configuration.ts:19`). Do not assume
the table is empty.

**The one consumer.** `listConfiguration` / `writeConfigurationOverride` are called only from
`layers/core-api/src/routes/agent-behavior-config-impl.ts:74,89,104`.

**Configuration kinds.** `CONFIGURATION_KINDS = agent | skill | routine | tool | mcp_server |
harness_descriptor` (`framework/domain-model/src/configuration.ts:1`).

## The standard

Agent Plugins 1.0.0 — https://github.com/agentplugins/agent-plugins-spec, published 2026-08-06.
Normative points that bind this package (verified against `spec/1.0.0.md`):

- `plugin.json` at the plugin root. Required: `$schema` (must be the canonical
  `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) and `name`. The only permitted top-level
  fields are `$schema`, `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`,
  `keywords`, `extensions`.
- An unknown top-level field, or a non-object `extensions`, is **non-fatal** — report and ignore, keep
  loading. Other manifest violations are fatal.
- **Package containment:** every package-supplied path MUST resolve inside the plugin root. Plugin-relative
  paths begin with `./`.
- Client extensions live under a reverse-domain namespace, both as a top-level directory
  (`com.example.client/`) and as a key in `extensions`. A client MUST ignore namespaces it does not
  implement, without validating their contents.
- A failure isolated to one component MUST NOT stop the client loading other valid components.
- Install, update, disable and removal are **out of the spec** — ours to define.

This package reads `plugin.json` and our own namespaced extension. Skills and `mcp.json` are BA9b.

## Decisions already made

- **Sources:** git URL is primary; a zip and a folder path also work. No marketplace (D6).
- **Scope:** the installer chooses one team or the whole backend (D4). Maps to knowledge scopes `team`
  and `factory` (`framework/domain-model/src/knowledge.ts:6`).
- **Conflict rule:** a user's edit wins, the item is shown as detached from the plugin, and it can be
  restored to the plugin's value (D5). The original is already retained — `defaultValueJson` plus
  `defaultVersionHash`.
- Our reverse-domain namespace is ours to name; use one and use it consistently.

## Acceptance criteria

1. A plugin folder with a valid `plugin.json` can be installed from a **git URL**, from a **zip**, and
   from a **folder path**, and afterwards a `plugins` row and one `plugin_configuration_defaults` row per
   contribution exist.
2. Installing requires a **scope** — one team, or the whole backend — and the scope is recorded and
   visible afterwards.
3. A manifest that violates the schema fatally is **rejected with a reason a person can act on**. An
   unknown top-level field or a non-object `extensions` is reported and the install still succeeds.
4. A package-supplied path that resolves outside the plugin root is refused. A plugin cannot write
   outside its own root.
5. An installed plugin's contributions appear as **editable configuration**, and a user's edit wins over
   the plugin's default.
6. An edited contribution is shown as **detached** from the plugin, and can be **restored** to the
   plugin's value.
7. A plugin can be **disabled** — its contributions stop applying and reappear on re-enable — and
   **removed**. Removal must survive `plugin_configuration_defaults.pluginId` being `onDelete: "restrict"`.
8. Two plugins that declare the same `kind` and `key` do not corrupt each other. `configuration_overrides`
   is unique on `(kind, key)` globally, so the key space must be namespaced or the collision handled
   explicitly — decide it and prove it with two plugins.
9. The reserved `builtin` plugin row is never listed as an installed plugin, and `builtin` cannot be used
   as an installed plugin's id.
10. Reinstalling the same plugin at a newer version updates the defaults, leaves detached items alone,
    and updates the rest.

## Validation scenarios

- Given a running install, when a plugin is installed from a git URL at whole-backend scope, then its
  contributions are listed as configuration and each one says it came from that plugin.
- Given an installed plugin, when a contribution is edited, then it is marked detached and the plugin's
  original is still available to restore.
- Given a detached contribution, when it is restored, then its value equals the plugin's default again
  and it is no longer marked detached.
- Given an installed plugin, when it is disabled, then its contributions stop applying; when it is
  enabled again, they apply again; when it is removed, no row of it is left applying.
- Given a manifest whose `$schema` is wrong, when it is installed, then it is refused with a reason.
- Given a plugin that tries to reference a path outside its root, when it is installed, then that is
  refused.
- Given two plugins declaring the same kind and key, when both are installed, then neither silently
  overwrites the other's user override.

## Out of scope

Skills, rules, agent files and `mcp.json` (BA9b). Event context (BA9c). The rituals plugin and the
`strategy` purge (BA9d). A marketplace. Publishing or distributing plugins. Live reload — restarting is
allowed if the intake needs it, and if so it must be a named step, not a surprise.

## Constraints

- Follow the standard as written. Where the spec is silent (install, disable, remove) we decide; where it
  is normative we conform.
- No new runtime path for what already has one. Contributions land in the existing configuration tables
  and go through the existing resolver.
- Security is not preemptive (ETHOS). Package containment is in the spec and stays; do not invent a
  permission model, a sandbox, a signature check or an allowlist on top of it.


---

# As built

Consolidated at ship. The phase artifacts this section replaces — the design notes, the review, the
live proof, and the migration-defect diagnosis — were deleted after their content landed here.

**Shipped:** PR #513, squash-merged 2026-08-25 as `ed59f9443`.

## Where the code lives and why

All new code sits in `layers/core-api/settings/`. That service already owns `plugins`,
`plugin_configuration_defaults` and `configuration_overrides` per `tools/governance/table-owners.json`,
and any other service writing to them would violate table ownership. No new package was needed.

## The decisions that shaped it

**Contribution keys are namespaced by plugin id.** `configuration_overrides` is unique on `(kind, key)`
**globally**, while `plugin_configuration_defaults` is unique on `(pluginId, kind, key)`. So two plugins
can each declare the same kind and key and both get a defaults row, but only one override row exists for
that pair. A contribution with manifest key `K` in plugin `P` is therefore stored as `P/K`. Plugin ids
cannot contain `/` (enforced by the name format), so the pair is unique by construction. Proven live:
two plugins each declaring `agent`/`librarian` coexist as `knowledge-upkeep/librarian` and
`retro-rituals/librarian`.

**All three sources reduce to a local plugin root**, then take the same reading path: a folder path is
resolved in place; a git URL is `git clone --depth 1` into a temp dir; a zip is extracted with `unzip`
and must carry `plugin.json` at its root. Temp dirs are cleaned up on success and failure alike.

**Removal works around the restrict constraint** by hard-deleting the plugin's defaults first — which
sets `defaultId` to null on any overrides — and only then marking the plugin row removed. A person's
edit survives as `user_owned` and reconnects to the plugin on reinstall through `(kind, key)`.

**Detached is not a new flag.** The existing resolver's `valueSource: 'user_override'` already means
exactly "the person changed this"; restore writes the plugin's stored default back over it. The
original is retained by construction in `defaultValueJson` plus `defaultVersionHash`.

**`builtin` is a reserved id.** Migration `0044_AU2_plugin_configuration.sql:36-38` seeds a `plugins`
row with that id on every install and the resolver branches on it. It can never be installed and is
never listed as an installed plugin.

## Proven in the running app

A real Agent Plugins 1.0.0 plugin was installed through the settings screen — deliberately carrying an
unknown top-level field and a foreign tool's namespace, both of which the spec requires a client to
tolerate.

- Installed from a **folder**: contributions appeared as editable configuration, and the agent-behavior
  pane moved from `Agents 9 / Routines 1` to `Agents 10 / Routines 3` — exactly the one agent and two
  routines declared.
- Installed a second plugin from a **git URL**; it survived a full page reload, so it came from the
  server rather than optimistic UI state.
- **Disable** marks the contribution `Inactive: plugin disabled` — it stops applying and says why
  instead of silently vanishing. **Remove** takes it away entirely and the counts return.

Not proven live, and covered by the integration lane plus the reviewer's sanity-breaks instead: detach
and restore, the zip source, and reinstall-updates-defaults.

## Durable learnings

**PGlite is single-writer.** Reading its data directory from a second process while the dev server holds
it returns a stale snapshot. During this run it twice made a successful install look broken. Verify
through the app with a full page reload, or stop the server first.

**Migration `0058_AU44_fold_team_members.sql` aborted on every populated database, and was fixed here.**
It re-pointed `users.team_id` to a `teams` id *before* dropping the foreign key that still required a
`team_members` id, so it only succeeded where no user belonged to a team — which is what its own test
had. The steps are now reordered and an integration test seeds a database to the shape a real install
has. Editing an already-applied migration was settled empirically rather than assumed: drizzle compares
the journal's `folderMillis` timestamp, never the file hash, so a database that already applied it will
not re-run it. This was the second occurrence of that shape; BA1 caught the first.

**`plugin_configuration_defaults` is not empty on an existing install.** Refinement recorded that
nothing writes it — true of the code, but real databases carry orphan `builtin` rows (33 on the dev
install). The writer was added by AU2 (`#414`) and deleted by the AU20 cleanup in `3efc6c573`. Nothing
maintains them. Do not assume a blank slate.

## Known limitations carried forward

- **Install scope is stored and shown but does not filter.** A `team`-scoped plugin's contributions
  currently apply everywhere. The resolver structurally cannot fix this — `listConfiguration` takes only
  kind and key and serves an admin surface with no session or team context. Enforcement belongs where
  session assembly knows the team, and is **owned by BA9b**.
- **`validateConfigurationValue`** (`layers/core-api/settings/src/plugin-configuration.ts:92`) rejects
  values containing fields named `command`, `env`, `secret` and similar. It runs only on the user-edit
  path, so it does not block a plugin *contributing* an MCP server, but it does block a person editing
  one. Open founder question.
- Manifest type-checking is stricter than at first — a non-string `version` is now fatal — but the
  optional metadata fields (`author`, `homepage`, `repository`, `license`, `keywords`) are still not
  type-checked. Permissive rather than corrupting.

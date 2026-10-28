# Plugins

How a plugin adds to a running HyperIdle, and how the plugin service keeps track of what it added.

Plugins are how the product gains opinions it does not ship with. The install itself ships empty — only the hidden `system:propagation` actor. First start (`/start`) makes one agent, Builder, with nine subscriptions, one per object event, and no prompt. Beyond that there is nothing else: no roster, no roles, no personas. A Designer, a Product Manager, a Document Librarian all arrive because somebody installed a plugin; the ones that ship with the app are listed on a team's page as available, one click from installed. A plugin brings its own agents and subscriptions; it never writes into another agent's.

## One install per team

A plugin is installed for a scope: **factory** (once, for everyone) or a **team**. Each install is its own `plugins` row, and the row id is the install id — the manifest name for a factory install, `<name>@<teamId>` for a team install (a manifest name never contains `@`). Two teams can each install the same plugin: each gets its own agents, subscriptions and documents, and removing, disabling or enabling one team's install leaves the other's alone. `edit_plugin`'s `id` is always an install id.

Contributed row ids hash the manifest name and the scope, so every install's rows are distinct.

## What a plugin can contribute

| Kind | Becomes | Declared as |
|---|---|---|
| **Agent** | a `users` row, plus its identity | `agents[]` in the manifest, with an optional `identity` file |
| **Subscription** | a `subscriptions` row, plus its prompt document | `subscriptions[]`, whose `prompt` becomes a document |
| **Skill** | a `documents` row with `slot = 'skill'` | a `skills/<name>/SKILL.md` file in the plugin |
| **MCP server** | nothing stored — read from the install folder's `mcp.json` each time a session starts | `mcp.json` |

Agents, subscription prompts and skills all end up as ordinary rows in the services that own them — `users` and `documents`. A plugin does not get a private world; it adds to yours, and what it adds is editable like anything else.

An agent's `identity` names a file inside the plugin, and it becomes that agent's `agent_file` document. A path that escapes the plugin root, or names a file that is not there, drops the identity and keeps the agent — a bare agent is valid, so a typo must not cost the whole contribution.

## The ownership registry

`plugin_contributions` is the plugin service's record of what each plugin contributed: one row per `(plugin, kind, entity)`, plus a `detached_at` stamp. It is the only answer to "what did this plugin contribute".

The registry belongs to the plugin service. It names the rows; the service that owns each table writes them.

## One lifecycle

Install, enable, disable and remove all drive the same function over the registry: make everything this plugin contributed live, or not live.

**Installing is a deliberate act**: everything the plugin contributes is live afterwards, whatever a previous disable or remove left behind.

Nothing a plugin added is deleted when it is removed: its agents go `inactive`, its subscriptions `paused` (`subscriptions.setLive`) and its documents archive — the same as a disable, with the install row marked `removed`. So a remove can be undone: `edit_plugin` with `state: "enabled"` on a removed install brings it back exactly as it was, people's edits included. A later install does the same.

## Detach and restore

Editing what a plugin added makes it the team's: the registry stamps `detached_at` and `detached_by`, the contributions view says who and when, and a reinstall leaves that version alone. That is a document's body, an agent's name, discipline or what it does (the fields a manifest declares, `edit_user`), and a subscription's trigger or pause (`edit_user`'s subscription change). An agent's harness is not tracked: a plugin never ships one.

**Restore** hands it back: the plugin's version is re-read from the install folder and the stamp cleared — a document's body, an agent's declared fields, a subscription's trigger (paused only while the plugin is off). A skill document's id is a one-way hash of the plugin id and the skill directory, so restore inverts it by enumerating the plugin's skill directories — the id derivation stays the single source of truth rather than the mapping being stored twice.

## Where a plugin came from

Each install keeps its source as given — `source_kind` (`folder`, `git`, `zip`, `bundled`) and `source_address` (the path, the URL, or the bundled plugin's name) — the manifest's `description`, and `installed_by`. `search_plugins` returns all three, plus `source.found` — whether a folder or zip is still at that path on the server (always true for `git` and `bundled`); the plugin's page then says "no longer there". For a bundled plugin not installed yet, it returns what it would add (`adds`), read from its manifest.

## Where plugin files live

Installing copies the plugin to `installed-plugins/<installId>` in the folder that holds the database (`installedPluginsDir`, `layers/core-api/src/installed-plugins-dir.ts`) — one folder per install, so one team's reinstall never removes the folder another team's restore reads — and records the path in `plugins.install_path`. Two features depend on it: restore reads the plugin's files from there, and a session reads the plugin's MCP servers from the `mcp.json` there, expanding `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` against it. An install without a folder brings no MCP servers.

> Not `plugins`. Beside a development checkout's database that is the repository's own plugin **source** directory, and install removes the destination before copying.

Nothing about a server is stored at install: the folder is the only copy, so an edited `mcp.json` reaches the next session, and a moved data directory never leaves a stale absolute path behind in the database.

## Bundled plugins

`plugins/` in the repository holds the plugins that ship with the app. The desktop build copies it into the app's resources beside the migrations (`electron-builder.yml`), and the desktop shell points the server at it with `HYPERIDLE_BUNDLED_PLUGINS_DIR`; the server image finds it in the repository it carries. Nothing is installed by default.

`search_plugins` answers two kinds of rows: every install, and — as `state: "available"` — each bundled plugin not yet installed for every team the viewer is in. A factory install makes a plugin installed for everyone; a removed install makes it available again. A team's page (`/teams/:name`) lists its plugins, the available ones too; an available plugin's page (`/plugins/:id`) has an Install button. "Add a plugin" on the team page installs one from a git address, a folder or a zip file.

`edit_plugin` installs one with `source: { kind: "bundled", name, scope }`. The name is matched exactly against the manifest names the server read from its own bundled folder; the caller never supplies a path. The manifest's `extensions["io.hyperidle"].installScope` (`team` by default, or `factory`) decides the scope.

The two that ship today:

- `document-management` — the Document Librarian agent, decay/triage/retro subscriptions, and three skills. Installs factory-wide.
- `role-personas` — Builder, Designer, Product Manager, QA Engineer, Growth, Ops and Facilitator, each with its identity.
